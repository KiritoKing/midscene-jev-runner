import type { BrowserActionKind } from './internal-types';
import type { JevOperation } from './types';

export const operationByAction: Record<BrowserActionKind, JevOperation> = {
  click: 'CLICK',
  fill: 'TYPE_TEXT',
  select: 'SELECT',
  clear: 'CLEAR',
  scroll: 'SCROLL',
  wait: 'WAIT',
  dismiss: 'DISMISS',
};
