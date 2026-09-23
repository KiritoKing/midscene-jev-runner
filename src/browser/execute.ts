import type { Frame, Locator, Page } from 'playwright';
import type { BrowserAction } from '../internal-types';
import { waitForAbortable } from '../utils';

type LocatorWithEvaluate = Locator & {
  evaluate?: <T, Arg>(
    pageFunction: (element: Element, arg: Arg) => T | Promise<T>,
    arg: Arg,
  ) => Promise<T>;
};

const actionFrame = (page: Page, action: BrowserAction): Frame | undefined => {
  // The page is a compatibility fallback for lightweight Page mocks; real
  // Playwright Pages always expose mainFrame().
  let frame = page.mainFrame?.() ?? (page as unknown as Frame);
  for (const index of action.framePath ?? []) {
    if (!Number.isInteger(index) || index < 0) return undefined;
    frame = frame.childFrames?.()[index] as Frame;
    if (!frame) return undefined;
  }
  if (action.frameUrl !== undefined && frame.url() !== action.frameUrl)
    return undefined;
  if (action.frameName !== undefined && frame.name() !== action.frameName)
    return undefined;
  return frame;
};

const targetLocator = (
  frame: Frame,
  action: BrowserAction,
): LocatorWithEvaluate => {
  const selector =
    action.selector ??
    (action.node
      ? `[data-midscene-jev-id="${action.node.replace(/["\\\\]/gu, '\\\\$&')}"]`
      : undefined);
  if (!selector)
    throw new Error('JEV action did not include a browser target.');
  // Playwright CSS locators pierce open shadow roots. Keep this selector local:
  // it is execution metadata and is never sent to the decision service.
  return frame.locator(selector).first() as LocatorWithEvaluate;
};

const isFresh = async (page: Page, action: BrowserAction): Promise<boolean> => {
  const frame = actionFrame(page, action);
  if (!frame) return false;
  if (action.frameDocumentId) {
    const sameDocument = await frame.evaluate((expected) => {
      const cache = (
        window as unknown as {
          __midsceneJevSnapshot?: { documentToken?: string };
        }
      ).__midsceneJevSnapshot;
      return cache?.documentToken === expected;
    }, action.frameDocumentId);
    if (!sameDocument) return false;
  }
  if (!action.node && !action.selector) return true;
  const locator = targetLocator(frame, action);
  if (typeof locator.evaluate === 'function')
    return locator.evaluate((element, guard) => {
      if (!element.isConnected) return false;
      if (
        (guard !== undefined &&
          element.getAttribute('data-midscene-jev-guard') !== guard) ||
        element.matches(':disabled,[aria-disabled="true"]')
      )
        return false;
      if (guard !== undefined) {
        let expected: Record<string, unknown>;
        try {
          expected = JSON.parse(guard) as Record<string, unknown>;
        } catch {
          return false;
        }
        if (expected.version === 2) {
          const clean = (
            value: string | null | undefined,
            length = 300,
          ): string =>
            (value || '').replace(/\s+/gu, ' ').trim().slice(0, length);
          const parent = (item: Element | null): Element | null =>
            !item
              ? null
              : item.parentElement ||
                (item.getRootNode() instanceof ShadowRoot
                  ? (item.getRootNode() as ShadowRoot).host
                  : null);
          const hasAncestor = (
            item: Element,
            check: (candidate: Element) => boolean,
          ): boolean => {
            let current: Element | null = item;
            while (current) {
              if (check(current)) return true;
              current = parent(current);
            }
            return false;
          };
          const role = (item: Element): string => {
            const explicit = item.getAttribute('role');
            if (explicit) return explicit;
            if (item instanceof HTMLButtonElement) return 'button';
            if (item instanceof HTMLAnchorElement) return 'link';
            if (item instanceof HTMLSelectElement) return 'combobox';
            if (item instanceof HTMLTextAreaElement) return 'textbox';
            if (item instanceof HTMLInputElement) {
              if (['button', 'submit', 'reset', 'image'].includes(item.type))
                return 'button';
              if (['checkbox', 'radio'].includes(item.type)) return item.type;
              if (item.type === 'search') return 'searchbox';
              if (item.type === 'number') return 'spinbutton';
              return 'textbox';
            }
            return item.tagName.toLowerCase();
          };
          const textOf = (item: Element | null | undefined): string =>
            clean(item?.textContent);
          const name = (item: Element): { label: string; source: string } => {
            const aria = clean(item.getAttribute('aria-label'));
            if (aria) return { label: aria, source: 'aria' };
            const ids = clean(item.getAttribute('aria-labelledby'));
            if (ids) {
              const root = item.getRootNode();
              const labelledElement = (id: string): Element | null =>
                root instanceof Document || root instanceof ShadowRoot
                  ? root.getElementById(id)
                  : document.getElementById(id);
              const label = clean(
                ids
                  .split(/\s+/u)
                  .map((id) => textOf(labelledElement(id)))
                  .join(' '),
              );
              if (label) return { label, source: 'aria' };
            }
            if (
              item instanceof HTMLInputElement ||
              item instanceof HTMLSelectElement ||
              item instanceof HTMLTextAreaElement
            ) {
              const label = clean(
                Array.from(item.labels || [])
                  .map(textOf)
                  .join(' '),
              );
              if (label) return { label, source: 'native-label' };
            }
            for (const attribute of [
              'placeholder',
              'title',
              'alt',
              'data-label',
            ]) {
              const label = clean(item.getAttribute(attribute));
              if (label) return { label, source: 'attribute' };
            }
            const content = textOf(item);
            if (content) return { label: content, source: 'content' };
            let candidate = parent(item);
            for (
              let depth = 0;
              candidate && depth < 4;
              depth += 1, candidate = parent(candidate)
            ) {
              const label = clean(
                textOf(candidate.querySelector('label,[class*="label"]')) ||
                  textOf(candidate.previousElementSibling),
              );
              if (label) return { label, source: 'nearby' };
            }
            return { label: role(item), source: 'inferred' };
          };
          const groupFor = (item: Element): Element =>
            item.closest(
              'tr,[role="row"],li,[role="listitem"],[class*="card" i],[role="group"],[role="toolbar"],fieldset,[class*="form-item" i],[class*="form-field" i]',
            ) ||
            parent(item) ||
            item;
          const isLayer = (item: Element): boolean => {
            const explicit = item.getAttribute('role');
            return (
              item instanceof HTMLDialogElement ||
              explicit === 'dialog' ||
              explicit === 'menu' ||
              explicit === 'listbox' ||
              item.getAttribute('aria-modal') === 'true' ||
              item.hasAttribute('popover') ||
              /(?:overlay|modal|drawer|backdrop)/iu.test(
                typeof item.className === 'string' ? item.className : '',
              )
            );
          };
          const visibleLayer = (item: Element): boolean => {
            if (!isLayer(item)) return false;
            const box = item.getBoundingClientRect();
            const style = getComputedStyle(item);
            return (
              box.width > 0 &&
              box.height > 0 &&
              box.bottom > 0 &&
              box.right > 0 &&
              box.top < innerHeight &&
              box.left < innerWidth &&
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              style.opacity !== '0' &&
              !hasAncestor(
                item,
                (candidate) =>
                  candidate.getAttribute('aria-hidden') === 'true' ||
                  candidate.hasAttribute('inert'),
              )
            );
          };
          const region = (item: Element): string =>
            hasAncestor(item, visibleLayer)
              ? 'dialog'
              : hasAncestor(
                    item,
                    (candidate) =>
                      /^(HEADER|NAV)$/u.test(candidate.tagName) ||
                      candidate.getAttribute('role') === 'navigation' ||
                      /(?:header|nav|sidebar|topbar)/iu.test(
                        typeof candidate.className === 'string'
                          ? candidate.className
                          : '',
                      ),
                  )
                ? 'navigation'
                : hasAncestor(
                      item,
                      (candidate) =>
                        /^(MAIN|FORM)$/u.test(candidate.tagName) ||
                        candidate.getAttribute('role') === 'main',
                    )
                  ? 'main'
                  : 'content';
          const value = (item: Element): string =>
            item instanceof HTMLInputElement ||
            item instanceof HTMLTextAreaElement ||
            item instanceof HTMLSelectElement
              ? item.value
              : item.getAttribute('contenteditable') === 'true'
                ? item.textContent || ''
                : '';
          const stateControl = (item: Element): Element => {
            if (
              (item instanceof HTMLInputElement &&
                ['checkbox', 'radio'].includes(item.type)) ||
              item instanceof HTMLOptionElement ||
              [
                'checkbox',
                'radio',
                'switch',
                'option',
                'menuitemcheckbox',
                'menuitemradio',
              ].includes(role(item))
            )
              return item;
            if (
              !item.matches(
                'label,[role="option"],[role="menuitemcheckbox"],[role="menuitemradio"],[class*="checkbox" i],[class*="radio" i],[class*="switch" i]',
              )
            )
              return item;
            return (
              item.querySelector(
                'input[type="checkbox"],input[type="radio"],[role="checkbox"],[role="radio"],[role="switch"],[role="option"],[role="menuitemcheckbox"],[role="menuitemradio"]',
              ) || item
            );
          };
          const presentState = (
            item: Element,
            attribute: string,
          ): string | null =>
            item.hasAttribute(attribute)
              ? item.getAttribute(attribute) || 'true'
              : null;
          const checkedState = (item: Element): string | null => {
            if (
              item instanceof HTMLInputElement &&
              ['checkbox', 'radio'].includes(item.type)
            )
              return String(item.checked);
            const aria =
              item.getAttribute('aria-checked') ||
              item.getAttribute('aria-pressed');
            if (aria !== null) return aria;
            const data = presentState(item, 'data-checked');
            if (data !== null) return data;
            return [
              'checkbox',
              'radio',
              'switch',
              'menuitemcheckbox',
              'menuitemradio',
            ].includes(role(item))
              ? item.getAttribute('data-state')
              : null;
          };
          const selectedState = (item: Element): string | null => {
            if (item instanceof HTMLOptionElement) return String(item.selected);
            const aria = item.getAttribute('aria-selected');
            if (aria !== null) return aria;
            const data = presentState(item, 'data-selected');
            if (data !== null) return data;
            return ['option', 'menuitemradio'].includes(role(item))
              ? item.getAttribute('data-state')
              : null;
          };
          const group = groupFor(element);
          const named = name(element);
          const state = stateControl(element);
          const textAction = expected.type === 'text-action';
          const groupLabel = clean(
            group.getAttribute('aria-label') ||
              textOf(
                group.querySelector(
                  ':scope > legend,:scope > label,:scope > [class*="label" i],:scope > [role="heading"]',
                ),
              ),
            180,
          );
          const current = {
            version: 2,
            type: textAction ? 'text-action' : 'control',
            tag: element.tagName,
            label: textAction ? clean(element.textContent, 80) : named.label,
            nameSource: textAction ? 'content' : named.source,
            text: clean(element.textContent, 300),
            ariaLabel: element.getAttribute('aria-label'),
            ariaLabelledby: element.getAttribute('aria-labelledby'),
            title: element.getAttribute('title'),
            placeholder: element.getAttribute('placeholder'),
            alt: element.getAttribute('alt'),
            role: element.getAttribute('role'),
            current: textAction ? '' : value(element).slice(0, 500),
            checked: textAction ? null : checkedState(state),
            selected: textAction ? null : selectedState(state),
            expanded: element.getAttribute('aria-expanded'),
            region: region(element),
            groupLabel,
            groupText: clean(group.textContent, 1000),
          };
          if (
            Object.entries(expected).some(
              ([key, expectedValue]) =>
                current[key as keyof typeof current] !== expectedValue,
            )
          )
            return false;
        }
      }
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        rect.width <= 0 ||
        rect.height <= 0
      )
        return false;
      const left = Math.max(0, rect.left);
      const right = Math.min(window.innerWidth, rect.right);
      const top = Math.max(0, rect.top);
      const bottom = Math.min(window.innerHeight, rect.bottom);
      if (right <= left || bottom <= top) return false;
      const containsComposed = (ancestor: Element, descendant: Element) => {
        if (ancestor.contains(descendant)) return true;
        let current: Node | null = descendant;
        while (current) {
          if (current === ancestor) return true;
          current = current.parentNode || (current as ShadowRoot).host || null;
        }
        return false;
      };
      return [
        [(left + right) / 2, (top + bottom) / 2],
        [left + 1, top + 1],
        [right - 1, top + 1],
        [left + 1, bottom - 1],
        [right - 1, bottom - 1],
      ].some(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return (
          hit !== null &&
          (containsComposed(element, hit) || containsComposed(hit, element))
        );
      });
    }, action.guard);

  // Retain support for minimal Page mocks while production uses the locator
  // path above, which also works for open shadow DOM.
  return frame.evaluate(
    ({ node, guard }) => {
      const element = node
        ? document.querySelector(`[data-midscene-jev-id="${node}"]`)
        : null;
      if (!element || !element.isConnected) return false;
      if (
        (guard !== undefined &&
          element.getAttribute('data-midscene-jev-guard') !== guard) ||
        element.matches(':disabled,[aria-disabled="true"]')
      )
        return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    },
    { node: action.node, guard: action.guard },
  );
};

export const executeAction = async (
  page: Page,
  action: BrowserAction,
  signal: AbortSignal,
): Promise<boolean> => {
  if (!(await isFresh(page, action))) return false;
  if (signal.aborted) throw signal.reason ?? new Error('JEV run aborted.');
  const frame = actionFrame(page, action);
  if (!frame) return false;
  if (action.kind === 'scroll') {
    if (action.node || action.selector) {
      const locator = targetLocator(frame, action);
      if (typeof locator.evaluate !== 'function')
        throw new Error('JEV nested scroll target cannot be evaluated.');
      await locator.evaluate(
        (element, delta) =>
          element.scrollBy({ top: delta, behavior: 'instant' }),
        action.delta ?? 500,
      );
    } else {
      await frame.evaluate(
        (delta) => window.scrollBy({ top: delta }),
        action.delta ?? 500,
      );
    }
  } else if (action.kind === 'wait') {
    await waitForAbortable(400, signal);
  } else if (action.kind === 'dismiss') {
    if (action.node || action.selector)
      await targetLocator(frame, action).click({ timeout: 5_000 });
    else await page.keyboard.press('Escape');
  } else {
    const locator = targetLocator(frame, action);
    if (action.kind === 'click') await locator.click({ timeout: 5_000 });
    else if (action.kind === 'select') {
      if (action.value === undefined)
        throw new Error('JEV select action had no option value.');
      await locator.selectOption(action.value, { timeout: 5_000 });
    } else {
      throw new Error(`Unsupported JEV browser action: ${action.kind}`);
    }
  }
  const settleMs =
    action.kind === 'click' || action.kind === 'dismiss'
      ? 500
      : action.kind === 'wait'
        ? 0
        : 250;
  if (settleMs > 0) await waitForAbortable(settleMs, signal);
  return true;
};
