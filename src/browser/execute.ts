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
