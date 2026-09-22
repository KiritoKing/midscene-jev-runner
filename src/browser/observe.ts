import type { Page } from 'playwright';
import type {
  BrowserAction,
  BrowserActionKind,
  BrowserActiveLayer,
  BrowserRegion,
  BrowserSnapshot,
  BrowserWorkflowStep,
} from '../internal-types';
import { operationByAction } from '../operations';
import { isRecord } from '../utils';
import { browserSnapshot } from './snapshot';

export const observe = async (page: Page): Promise<BrowserSnapshot> => {
  const raw: unknown = await page.evaluate(browserSnapshot);
  if (!isRecord(raw) || !Array.isArray(raw.actions))
    throw new Error('Unable to observe the current browser page.');
  const actions = raw.actions.flatMap((value): BrowserAction[] => {
    if (
      !isRecord(value) ||
      typeof value.id !== 'string' ||
      typeof value.kind !== 'string' ||
      !Object.hasOwn(operationByAction, value.kind)
    )
      return [];
    const region =
      typeof value.region === 'string' &&
      ['dialog', 'main', 'navigation', 'content'].includes(value.region)
        ? (value.region as BrowserRegion)
        : undefined;
    return [
      {
        id: value.id,
        kind: value.kind as BrowserActionKind,
        label: typeof value.label === 'string' ? value.label : value.kind,
        ...(typeof value.node === 'string' && /^\d+$/.test(value.node)
          ? { node: value.node }
          : {}),
        ...(typeof value.guard === 'string' ? { guard: value.guard } : {}),
        ...(typeof value.role === 'string' ? { role: value.role } : {}),
        ...(typeof value.value === 'string' ? { value: value.value } : {}),
        ...(typeof value.delta === 'number' ? { delta: value.delta } : {}),
        ...(typeof value.currentValue === 'string'
          ? { currentValue: value.currentValue }
          : {}),
        ...(typeof value.checked === 'string'
          ? { checked: value.checked }
          : {}),
        ...(typeof value.selected === 'string'
          ? { selected: value.selected }
          : {}),
        ...(typeof value.expanded === 'string'
          ? { expanded: value.expanded }
          : {}),
        ...(region ? { region } : {}),
        ...(typeof value.signature === 'string'
          ? { signature: value.signature }
          : {}),
      },
    ];
  });
  if (
    typeof raw.url !== 'string' ||
    typeof raw.title !== 'string' ||
    typeof raw.text !== 'string'
  )
    throw new Error('Browser observation was malformed.');
  const marker =
    typeof raw.marker === 'string' ? raw.marker : `${raw.url}\n${raw.text}`;
  const workflowSteps = Array.isArray(raw.workflowSteps)
    ? raw.workflowSteps.flatMap((value): BrowserWorkflowStep[] => {
        if (
          !isRecord(value) ||
          typeof value.index !== 'number' ||
          typeof value.label !== 'string' ||
          typeof value.status !== 'string'
        )
          return [];
        return [
          { index: value.index, label: value.label, status: value.status },
        ];
      })
    : [];
  let activeLayer: BrowserActiveLayer | undefined;
  if (
    isRecord(raw.activeLayer) &&
    (raw.activeLayer.kind === 'dialog' || raw.activeLayer.kind === 'overlay') &&
    typeof raw.activeLayer.label === 'string'
  )
    activeLayer = {
      kind: raw.activeLayer.kind,
      label: raw.activeLayer.label,
    };
  return {
    url: raw.url,
    title: raw.title,
    text: raw.text,
    marker,
    progressMarker:
      typeof raw.progressMarker === 'string' ? raw.progressMarker : marker,
    actions,
    alerts: Array.isArray(raw.alerts)
      ? raw.alerts.filter((value): value is string => typeof value === 'string')
      : [],
    workflowSteps,
    ...(activeLayer ? { activeLayer } : {}),
    loading: raw.loading === true,
    omittedActions:
      typeof raw.omittedActions === 'number' && raw.omittedActions > 0
        ? raw.omittedActions
        : 0,
  };
};
