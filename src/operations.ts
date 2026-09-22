import type { BrowserActionKind } from './internal-types';
import type { JevOperation } from './types';

export const operationByAction: Record<BrowserActionKind, JevOperation> = {
  click: 'CLICK',
  select: 'SELECT',
  scroll: 'SCROLL',
  wait: 'WAIT',
  dismiss: 'DISMISS',
};
