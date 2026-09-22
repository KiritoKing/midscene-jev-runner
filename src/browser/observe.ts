import type { Frame, Page } from 'playwright';
import type {
  BrowserAction,
  BrowserActionEffect,
  BrowserActionKind,
  BrowserActiveLayer,
  BrowserFact,
  BrowserLayer,
  BrowserNameSource,
  BrowserRegion,
  BrowserSnapshot,
  BrowserTaskAlignment,
  BrowserValidationIssue,
  BrowserWorkflowStep,
} from '../internal-types';
import { operationByAction } from '../operations';
import { isRecord } from '../utils';
import { browserSnapshotSource } from './snapshot-runtime.generated';

const actionLimit = 250;
const factLimit = 500;
const regions = new Set<BrowserRegion>([
  'dialog',
  'main',
  'navigation',
  'content',
]);
const names = new Set<BrowserNameSource>([
  'aria',
  'native-label',
  'attribute',
  'content',
  'nearby',
  'inferred',
  'unknown',
]);
const actionKinds = new Set<BrowserActionKind>([
  'click',
  'select',
  'scroll',
  'wait',
  'dismiss',
]);
// Editable controls remain facts so a caller can deliberately hand them to
// aiInput, but they are never JEV actions.
const factKinds = new Set([
  'click',
  'fill',
  'select',
  'scroll',
  'wait',
  'dismiss',
]);
const effects = new Set<BrowserActionEffect>(['activate', 'deactivate']);
const termsFor = (goal: string | undefined): string[] => {
  const segments = (goal || '')
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 1);
  const terms = new Set(segments);
  for (const segment of segments) {
    const characters = Array.from(segment);
    if (!characters.every((character) => /\p{Script=Han}/u.test(character)))
      continue;
    for (let index = 0; index < characters.length - 1; index += 1)
      terms.add(characters.slice(index, index + 2).join(''));
  }
  return Array.from(terms);
};
const framePath = (frame: Frame): number[] => {
  const path: number[] = [];
  let current: Frame | null = frame;
  while (current?.parentFrame()) {
    const parent = current.parentFrame();
    path.unshift(Math.max(0, parent?.childFrames().indexOf(current) ?? 0));
    current = parent;
  }
  return path;
};
const prefixFor = (path: number[]): string =>
  path.length ? `frame[${path.join('.')}]` : '';
interface RankedRelevance {
  score: number;
  taskAlignment: BrowserTaskAlignment;
  matchedGoalTerms: number;
}

const score = (
  label: string,
  role: string,
  region: BrowserRegion | undefined,
  localContext: string | undefined,
  confidence: number,
  actionable: boolean,
  terms: string[],
  base: unknown,
): RankedRelevance => {
  const labelText = `${label} ${role}`.toLocaleLowerCase();
  const scopeText = `${localContext || ''}`.toLocaleLowerCase();
  const labelMatches = terms.filter((term) => labelText.includes(term));
  // Short natural-language fragments are useful for identifying a control,
  // but too noisy for deciding that its surrounding row/card matches the
  // task. Scope alignment therefore requires a stable identifier or a longer
  // phrase from the goal.
  const scopeMatches = terms.filter(
    (term) =>
      !labelText.includes(term) &&
      (term.length >= 4 || /\d/u.test(term)) &&
      scopeText.includes(term),
  );
  const labelWeight = Math.min(
    84,
    labelMatches.reduce(
      (total, term) => total + Math.min(34, 14 + term.length * 4),
      0,
    ),
  );
  const scopeWeight = Math.min(
    52,
    scopeMatches.reduce(
      (total, term) => total + Math.min(30, 8 + term.length * 2),
      0,
    ),
  );
  const hasLabel = labelMatches.length > 0;
  const hasScope = scopeMatches.length > 0;
  const taskAlignment: BrowserTaskAlignment = hasLabel
    ? hasScope
      ? 'label-and-scope'
      : 'label'
    : hasScope
      ? 'scope'
      : 'none';
  return {
    score: Math.round(
      (typeof base === 'number' ? base : confidence * 50) +
        labelWeight +
        scopeWeight +
        (actionable ? 18 : 0),
    ),
    taskAlignment,
    matchedGoalTerms: new Set([...labelMatches, ...scopeMatches]).size,
  };
};
const asRegion = (value: unknown): BrowserRegion | undefined =>
  typeof value === 'string' && regions.has(value as BrowserRegion)
    ? (value as BrowserRegion)
    : undefined;
const asName = (value: unknown): BrowserNameSource =>
  typeof value === 'string' && names.has(value as BrowserNameSource)
    ? (value as BrowserNameSource)
    : 'unknown';
const asPath = (value: unknown, prefix: string): string[] =>
  Array.isArray(value)
    ? prefix
      ? [
          'page',
          ...value
            .filter((item): item is string => typeof item === 'string')
            .map((item) => `${prefix}:${item}`),
        ]
      : value.filter((item): item is string => typeof item === 'string')
    : ['page'];

export interface ObserveOptions {
  includeGoalTextActions?: boolean;
}

/** Observe every accessible frame. The caller-owned Page is never navigated or mutated. */
export const observe = async (
  page: Page,
  goal?: string,
  options: ObserveOptions = {},
): Promise<BrowserSnapshot> => {
  const terms = termsFor(goal);
  const evaluateSource = `(${browserSnapshotSource})(${JSON.stringify({
    terms,
    includeGoalTextActions: options.includeGoalTextActions !== false,
  })})`;
  const maybeFrames = page as unknown as { frames?: () => Frame[] };
  const frames =
    typeof maybeFrames.frames === 'function' ? maybeFrames.frames() : [];
  const samples: Array<{ raw: Record<string, unknown>; path: number[] }> = [];
  if (frames.length) {
    for (const frame of frames) {
      const path = framePath(frame);
      const raw: unknown = await frame.evaluate(evaluateSource);
      if (isRecord(raw)) samples.push({ raw, path });
    }
  } else {
    const raw: unknown = await page.evaluate(evaluateSource);
    if (isRecord(raw)) samples.push({ raw, path: [] });
  }
  const main =
    samples.find((sample) => sample.path.length === 0)?.raw || samples[0]?.raw;
  if (
    !main ||
    typeof main.url !== 'string' ||
    typeof main.title !== 'string' ||
    typeof main.text !== 'string'
  )
    throw new Error('Unable to observe the current browser page.');
  const actions: BrowserAction[] = [];
  const facts: BrowserFact[] = [];
  const layers: BrowserLayer[] = [];
  const validationIssues: BrowserValidationIssue[] = [];
  const validationKeys = new Set<string>();
  let omittedActions = 0;
  let omittedFacts = 0;
  let textTruncated = false;
  for (const { raw, path } of samples) {
    const prefix = prefixFor(path);
    const qualify = (value: string) => (prefix ? `${prefix}:${value}` : value);
    if (Array.isArray(raw.layers))
      for (const value of raw.layers) {
        if (
          !isRecord(value) ||
          typeof value.id !== 'string' ||
          typeof value.kind !== 'string' ||
          typeof value.label !== 'string' ||
          !['page', 'dialog', 'popover', 'menu', 'listbox', 'overlay'].includes(
            value.kind,
          )
        )
          continue;
        layers.push({
          id: qualify(value.id),
          kind: value.kind as BrowserLayer['kind'],
          label: value.label,
          ...(typeof value.parentId === 'string'
            ? { parentId: qualify(value.parentId) }
            : {}),
          blocking: value.blocking === true,
        });
      }
    if (Array.isArray(raw.validations))
      for (const value of raw.validations) {
        if (!isRecord(value) || typeof value.message !== 'string') continue;
        const groupId =
          typeof value.groupId === 'string'
            ? qualify(value.groupId)
            : undefined;
        const field = typeof value.field === 'string' ? value.field : undefined;
        const controlId =
          typeof value.controlId === 'string'
            ? qualify(value.controlId)
            : undefined;
        const key = `${groupId || ''}|${controlId || ''}|${field || ''}|${value.message}`;
        if (validationKeys.has(key)) continue;
        validationKeys.add(key);
        validationIssues.push({
          message: value.message,
          ...(field ? { field } : {}),
          ...(groupId ? { groupId } : {}),
          ...(controlId ? { controlId } : {}),
          required: value.required === true,
        });
      }
    if (Array.isArray(raw.facts))
      for (const value of raw.facts) {
        if (
          !isRecord(value) ||
          typeof value.id !== 'string' ||
          typeof value.label !== 'string' ||
          typeof value.role !== 'string' ||
          typeof value.kind !== 'string' ||
          !factKinds.has(value.kind)
        )
          continue;
        const region = asRegion(value.region) || 'content';
        const confidence =
          typeof value.semanticConfidence === 'number'
            ? Math.max(0, Math.min(1, value.semanticConfidence))
            : 0;
        const actionable = value.actionable === true;
        const localContext =
          typeof value.localContext === 'string'
            ? value.localContext
            : undefined;
        const relevance = score(
          value.label,
          value.role,
          region,
          localContext,
          confidence,
          actionable,
          terms,
          value.score,
        );
        facts.push({
          id: qualify(value.id),
          label: value.label,
          role: value.role,
          kind: value.kind as BrowserFact['kind'],
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
          region,
          groupId:
            typeof value.groupId === 'string'
              ? qualify(value.groupId)
              : qualify(value.id),
          layerPath: asPath(value.layerPath, prefix),
          ...(localContext ? { localContext } : {}),
          nameSource: asName(value.nameSource),
          semanticConfidence: confidence,
          ...(typeof value.clickabilityEvidence === 'string'
            ? { clickabilityEvidence: value.clickabilityEvidence }
            : {}),
          taskAlignment: relevance.taskAlignment,
          matchedGoalTerms: relevance.matchedGoalTerms,
          visible: value.visible === true,
          actionable,
          covered: value.covered === true,
          disabled: value.disabled === true,
          score: relevance.score,
        });
      }
    if (Array.isArray(raw.actions))
      for (const value of raw.actions) {
        if (
          !isRecord(value) ||
          typeof value.id !== 'string' ||
          typeof value.kind !== 'string' ||
          !actionKinds.has(value.kind as BrowserActionKind) ||
          !Object.hasOwn(operationByAction, value.kind)
        )
          continue;
        const region = asRegion(value.region);
        const confidence =
          typeof value.semanticConfidence === 'number'
            ? Math.max(0, Math.min(1, value.semanticConfidence))
            : 0;
        const label =
          typeof value.label === 'string' ? value.label : value.kind;
        const localContext =
          typeof value.localContext === 'string'
            ? value.localContext
            : undefined;
        const relevance = score(
          label,
          typeof value.role === 'string' ? value.role : '',
          region,
          localContext,
          confidence,
          true,
          terms,
          value.score,
        );
        actions.push({
          id: qualify(value.id),
          kind: value.kind as BrowserActionKind,
          label,
          ...(typeof value.node === 'string' && /^\d+$/u.test(value.node)
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
          ...(typeof value.effect === 'string' &&
          effects.has(value.effect as BrowserActionEffect)
            ? { effect: value.effect as BrowserActionEffect }
            : {}),
          ...(region ? { region } : {}),
          ...(typeof value.groupId === 'string'
            ? { groupId: qualify(value.groupId) }
            : {}),
          ...(typeof value.groupLabel === 'string'
            ? { groupLabel: value.groupLabel }
            : {}),
          layerPath: asPath(value.layerPath, prefix),
          ...(localContext ? { localContext } : {}),
          nameSource: asName(value.nameSource),
          semanticConfidence: confidence,
          ...(typeof value.clickabilityEvidence === 'string'
            ? { clickabilityEvidence: value.clickabilityEvidence }
            : {}),
          taskAlignment: relevance.taskAlignment,
          matchedGoalTerms: relevance.matchedGoalTerms,
          framePath: path,
          ...(typeof value.selector === 'string'
            ? { selector: value.selector }
            : {}),
          score: relevance.score,
          ...(typeof value.signature === 'string'
            ? { signature: value.signature }
            : {}),
        });
      }
    omittedActions +=
      typeof raw.omittedActions === 'number' && raw.omittedActions > 0
        ? raw.omittedActions
        : 0;
    omittedFacts +=
      typeof raw.omittedFacts === 'number' && raw.omittedFacts > 0
        ? raw.omittedFacts
        : 0;
    textTruncated ||= raw.textTruncated === true;
  }
  actions.sort(
    (left, right) =>
      (right.score || 0) - (left.score || 0) || left.id.localeCompare(right.id),
  );
  facts.sort(
    (left, right) =>
      right.score - left.score || left.id.localeCompare(right.id),
  );
  const workflowSteps: BrowserWorkflowStep[] = Array.isArray(main.workflowSteps)
    ? main.workflowSteps.flatMap((value): BrowserWorkflowStep[] =>
        isRecord(value) &&
        typeof value.index === 'number' &&
        typeof value.label === 'string' &&
        typeof value.status === 'string'
          ? [{ index: value.index, label: value.label, status: value.status }]
          : [],
      )
    : [];
  let activeLayer: BrowserActiveLayer | undefined;
  if (
    isRecord(main.activeLayer) &&
    (main.activeLayer.kind === 'dialog' ||
      main.activeLayer.kind === 'overlay') &&
    typeof main.activeLayer.label === 'string'
  )
    activeLayer = {
      kind: main.activeLayer.kind,
      label: main.activeLayer.label,
    };
  const frameMarkers = samples.map(({ raw, path }) => [
    path,
    typeof raw.marker === 'string'
      ? raw.marker
      : `${raw.url || ''}\n${raw.text || ''}`,
  ]);
  const frameProgress = samples.map(({ raw, path }) => [
    path,
    typeof raw.progressMarker === 'string'
      ? raw.progressMarker
      : typeof raw.marker === 'string'
        ? raw.marker
        : `${raw.url || ''}\n${raw.text || ''}`,
  ]);
  return {
    url: main.url,
    title: main.title,
    text: main.text,
    marker: JSON.stringify(frameMarkers),
    progressMarker: JSON.stringify(frameProgress),
    actions: actions.slice(0, actionLimit),
    facts: facts.slice(0, factLimit),
    layers,
    alerts: Array.isArray(main.alerts)
      ? main.alerts.filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
    validationIssues,
    workflowSteps,
    ...(activeLayer ? { activeLayer } : {}),
    loading: main.loading === true,
    omittedActions: omittedActions + Math.max(0, actions.length - actionLimit),
    omittedFacts: omittedFacts + Math.max(0, facts.length - factLimit),
    textTruncated,
  };
};
