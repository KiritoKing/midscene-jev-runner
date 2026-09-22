import type { Locator, Page } from 'playwright';
import type { BrowserAction } from '../internal-types';
import { waitForAbortable } from '../utils';

const isFresh = async (page: Page, action: BrowserAction): Promise<boolean> => {
  if (!action.node) return true;
  return page.evaluate(
    ({ node, guard }) => {
      const element = document.querySelector(
        `[data-midscene-jev-id="${node}"]`,
      );
      if (!element || !element.isConnected) return false;
      const rect = element.getBoundingClientRect();
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        (guard !== undefined &&
          element.getAttribute('data-midscene-jev-guard') !== guard)
      )
        return false;
      const left = Math.max(0, rect.left);
      const right = Math.min(window.innerWidth, rect.right);
      const top = Math.max(0, rect.top);
      const bottom = Math.min(window.innerHeight, rect.bottom);
      if (right <= left || bottom <= top) return false;
      return [
        [(left + right) / 2, (top + bottom) / 2],
        [left + 1, top + 1],
        [right - 1, top + 1],
        [left + 1, bottom - 1],
        [right - 1, bottom - 1],
      ].some(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return hit === element || (hit !== null && element.contains(hit));
      });
    },
    { node: action.node, guard: action.guard },
  );
};

const targetLocator = (page: Page, action: BrowserAction): Locator => {
  if (!action.node)
    throw new Error('JEV action did not include a browser target.');
  return page.locator(`[data-midscene-jev-id="${action.node}"]`).first();
};

export const executeAction = async (
  page: Page,
  action: BrowserAction,
  text: string | undefined,
  signal: AbortSignal,
): Promise<boolean> => {
  if (!(await isFresh(page, action))) return false;
  if (signal.aborted) throw signal.reason ?? new Error('JEV run aborted.');
  if (action.kind === 'scroll') {
    await page.mouse.wheel(0, action.delta ?? 500);
  } else if (action.kind === 'wait') {
    await waitForAbortable(400, signal);
  } else if (action.kind === 'dismiss') {
    if (action.node)
      await targetLocator(page, action).click({ timeout: 5_000 });
    else await page.keyboard.press('Escape');
  } else {
    const locator = targetLocator(page, action);
    if (action.kind === 'click') await locator.click({ timeout: 5_000 });
    else if (action.kind === 'fill') {
      if (!text)
        throw new Error('JEV text generation returned no usable value.');
      await locator.fill(text, { timeout: 5_000 });
    } else if (action.kind === 'select') {
      if (action.value === undefined)
        throw new Error('JEV select action had no option value.');
      await locator.selectOption(action.value, { timeout: 5_000 });
    } else {
      await locator.fill('', { timeout: 5_000 });
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
