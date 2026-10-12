import type { Frame, Page } from 'playwright';

import type {
  BenchmarkCandidate,
  BenchmarkExecution,
  BenchmarkGroup,
  BenchmarkLayer,
  BenchmarkNameSource,
  BenchmarkObservation,
  BenchmarkOperation,
  ContextStrategy,
} from '../types';

const MAX_CANDIDATES = 160;
const MAX_TEXT_LENGTH = 4_000;

type InspectedLayer = {
  localId: string;
  kind: BenchmarkLayer['kind'];
  label: string;
  parentLocalId?: string;
  blocking: boolean;
};

type InspectedCandidate = {
  localId: string;
  selector: string;
  operation: BenchmarkOperation;
  label: string;
  role: string;
  nameSource: BenchmarkNameSource;
  semanticConfidence: number;
  region: string;
  layerLocalIds: string[];
  localContext?: string;
  currentValue?: string;
  visible: boolean;
  covered: boolean;
  disabled: boolean;
  oracleId?: string;
  scrollDelta?: number;
};

type FrameInspection = {
  layers: InspectedLayer[];
  candidates: InspectedCandidate[];
};

const goalTerms = (goal: string): string[] =>
  goal
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 1);

const relevance = (candidate: InspectedCandidate, terms: string[]): number => {
  const haystack = [
    candidate.label,
    candidate.localContext,
    candidate.region,
    candidate.role,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
  const matched = terms.filter((term) => haystack.includes(term)).length;
  const actionableBonus =
    candidate.visible && !candidate.covered && !candidate.disabled ? 18 : 0;
  return Math.round(
    candidate.semanticConfidence * 40 + matched * 22 + actionableBonus,
  );
};

const framePathFor = (frame: Frame): string[] => {
  const path: string[] = [];
  let current: Frame | null = frame;
  while (current?.parentFrame()) {
    const parent = current.parentFrame();
    const index = parent
      ? Math.max(0, parent.childFrames().indexOf(current))
      : 0;
    path.unshift(`frame[${index}]`);
    current = parent;
  }
  return path;
};

const frameIdFor = (frame: Frame): string => {
  const path = framePathFor(frame);
  return path.length === 0 ? 'main' : path.join('/');
};

const inspectFrame = async (frame: Frame): Promise<FrameInspection> =>
  frame.evaluate((): FrameInspection => {
    type Name = {
      label: string;
      source: BenchmarkNameSource;
      confidence: number;
    };

    const clean = (value: string | null | undefined, limit = 180): string =>
      (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
    const cssEscape = (value: string): string => {
      if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function')
        return CSS.escape(value);
      return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
    };
    const nth = (element: Element): string => {
      const tag = element.tagName.toLocaleLowerCase();
      const siblings = element.parentElement
        ? Array.from(element.parentElement.children).filter(
            (sibling) => sibling.tagName === element.tagName,
          )
        : [element];
      return `${tag}:nth-of-type(${Math.max(1, siblings.indexOf(element) + 1)})`;
    };
    const segment = (element: Element): string => {
      const id = element.getAttribute('id');
      return id ? `#${cssEscape(id)}` : nth(element);
    };
    const selectorFor = (element: Element): string => {
      const chains: string[] = [];
      let cursor: Element | null = element;
      while (cursor) {
        const chain: string[] = [];
        const root = cursor.getRootNode();
        while (cursor.parentElement) {
          chain.unshift(segment(cursor));
          cursor = cursor.parentElement;
        }
        chain.unshift(segment(cursor));
        chains.unshift(chain.join(' > '));
        cursor = root instanceof ShadowRoot ? root.host : null;
      }
      return `css=${chains.join(' >> css=')}`;
    };
    const parentAcrossShadow = (element: Element): Element | null => {
      if (element.parentElement) return element.parentElement;
      const root = element.getRootNode();
      return root instanceof ShadowRoot ? root.host : null;
    };
    const textOf = (element: Element | null | undefined): string =>
      clean(element?.textContent);
    const elements: Element[] = [];
    const visit = (root: ParentNode): void => {
      for (const child of Array.from(root.children)) {
        elements.push(child);
        visit(child);
        if (child.shadowRoot?.mode === 'open') visit(child.shadowRoot);
      }
    };
    visit(document);

    const layerKind = (
      element: Element,
    ): BenchmarkLayer['kind'] | undefined => {
      const role = element.getAttribute('role');
      if (role === 'dialog' || element.getAttribute('aria-modal') === 'true')
        return 'dialog';
      if (role === 'menu') return 'menu';
      if (role === 'listbox') return 'listbox';
      if (element.hasAttribute('popover')) return 'popover';
      const className =
        typeof element.className === 'string' ? element.className : '';
      if (/\b(overlay|modal|backdrop)\b/i.test(className)) return 'overlay';
      return undefined;
    };
    const layerElements = elements.filter((element) =>
      Boolean(layerKind(element)),
    );
    const layerLocalIds = new Map<Element, string>();
    layerElements.forEach((element, index) =>
      layerLocalIds.set(element, `layer-${index + 1}`),
    );
    const nearestLayerId = (element: Element | null): string | undefined => {
      let cursor = element;
      while (cursor) {
        const id = layerLocalIds.get(cursor);
        if (id) return id;
        cursor = parentAcrossShadow(cursor);
      }
      return undefined;
    };
    const layerParents = new Map<string, string | undefined>();
    for (const layer of layerElements) {
      const id = layerLocalIds.get(layer) as string;
      const directParent = nearestLayerId(parentAcrossShadow(layer));
      const targetId = layer.getAttribute('id');
      const trigger = targetId
        ? elements.find((element) =>
            ['aria-controls', 'aria-owns'].some((attribute) =>
              clean(element.getAttribute(attribute))
                .split(/\s+/)
                .includes(targetId),
            ),
          )
        : undefined;
      // Menus and popovers are commonly portalled under document.body. A trigger
      // relationship gives their candidates the same logical layer stack as the
      // trigger, even when there is no DOM ancestor relationship.
      layerParents.set(id, directParent ?? nearestLayerId(trigger ?? null));
    }
    const nameFor = (element: Element): Name => {
      const ariaLabel = clean(element.getAttribute('aria-label'));
      if (ariaLabel) return { label: ariaLabel, source: 'aria', confidence: 1 };
      const labelledBy = clean(element.getAttribute('aria-labelledby'));
      if (labelledBy) {
        const label = clean(
          labelledBy
            .split(/\s+/)
            .map((id) => textOf(document.getElementById(id)))
            .join(' '),
        );
        if (label) return { label, source: 'aria', confidence: 0.96 };
      }
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) {
        const nativeLabel = clean(
          Array.from(element.labels ?? [])
            .map((label) => textOf(label))
            .join(' '),
        );
        if (nativeLabel)
          return {
            label: nativeLabel,
            source: 'native-label',
            confidence: 0.94,
          };
      }
      for (const attribute of ['title', 'placeholder', 'alt', 'data-label']) {
        const value = clean(element.getAttribute(attribute));
        if (value)
          return { label: value, source: 'attribute', confidence: 0.82 };
      }
      const content = textOf(element);
      if (content)
        return { label: content, source: 'content', confidence: 0.72 };
      const nearby = clean(
        textOf(element.previousElementSibling) || textOf(element.parentElement),
      );
      if (nearby) return { label: nearby, source: 'nearby', confidence: 0.45 };
      const role =
        element.getAttribute('role') || element.tagName.toLocaleLowerCase();
      return { label: role, source: 'inferred', confidence: 0.2 };
    };
    const contextFor = (element: Element): string | undefined => {
      let cursor: Element | null = element;
      while (cursor) {
        const role = cursor.getAttribute('role');
        if (
          ['region', 'form', 'group', 'dialog', 'menu', 'listbox'].includes(
            role ?? '',
          ) ||
          cursor.tagName === 'FIELDSET'
        ) {
          const name = nameFor(cursor).label;
          if (name) return name;
        }
        const heading = Array.from(cursor.children).find((child) =>
          /^H[1-6]$/.test(child.tagName),
        );
        if (heading) return textOf(heading);
        cursor = parentAcrossShadow(cursor);
      }
      return undefined;
    };
    const regionFor = (element: Element): string => {
      let cursor: Element | null = element;
      while (cursor) {
        const tag = cursor.tagName.toLocaleLowerCase();
        const role = cursor.getAttribute('role');
        if (
          ['main', 'nav', 'header', 'footer', 'aside', 'form'].includes(tag) ||
          ['main', 'navigation', 'region', 'form'].includes(role ?? '')
        ) {
          return nameFor(cursor).label || role || tag;
        }
        cursor = parentAcrossShadow(cursor);
      }
      return 'page';
    };
    const stateFor = (
      element: Element,
    ): { visible: boolean; covered: boolean; disabled: boolean } => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const rendered =
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) > 0 &&
        rect.width > 0 &&
        rect.height > 0;
      const inViewport =
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < innerHeight &&
        rect.left < innerWidth;
      let withinClippingAncestors = true;
      let ancestor = parentAcrossShadow(element);
      while (ancestor) {
        const ancestorStyle = getComputedStyle(ancestor);
        if (
          /(auto|scroll|hidden|clip)/u.test(
            `${ancestorStyle.overflow} ${ancestorStyle.overflowX} ${ancestorStyle.overflowY}`,
          )
        ) {
          const ancestorRect = ancestor.getBoundingClientRect();
          if (
            rect.bottom <= ancestorRect.top ||
            rect.top >= ancestorRect.bottom ||
            rect.right <= ancestorRect.left ||
            rect.left >= ancestorRect.right
          ) {
            withinClippingAncestors = false;
            break;
          }
        }
        ancestor = parentAcrossShadow(ancestor);
      }
      const x = Math.min(
        Math.max(rect.left + rect.width / 2, 0),
        Math.max(0, innerWidth - 1),
      );
      const y = Math.min(
        Math.max(rect.top + rect.height / 2, 0),
        Math.max(0, innerHeight - 1),
      );
      const top =
        rendered && inViewport && withinClippingAncestors
          ? document.elementsFromPoint(x, y)[0]
          : undefined;
      const shadowHosts: Element[] = [];
      let root: Node = element;
      while (root.getRootNode() instanceof ShadowRoot) {
        const shadowRoot = root.getRootNode() as ShadowRoot;
        shadowHosts.push(shadowRoot.host);
        root = shadowRoot.host;
      }
      const covered = Boolean(
        top &&
          top !== element &&
          !element.contains(top) &&
          !top.contains(element) &&
          !shadowHosts.includes(top),
      );
      const disabled = element.matches('[disabled], [aria-disabled="true"]');
      return {
        visible: rendered && inViewport && withinClippingAncestors,
        covered,
        disabled,
      };
    };
    const operationFor = (
      element: Element,
      name: string,
    ): BenchmarkOperation | undefined => {
      const tag = element.tagName.toLocaleLowerCase();
      const role = element.getAttribute('role') ?? '';
      if (
        tag === 'textarea' ||
        (tag === 'input' &&
          ![
            'button',
            'checkbox',
            'radio',
            'submit',
            'reset',
            'file',
            'image',
          ].includes((element as HTMLInputElement).type))
      )
        return 'TYPE_TEXT';
      if (tag === 'select') return 'SELECT';
      if (
        tag === 'input' &&
        ['button', 'checkbox', 'radio', 'submit', 'reset', 'image'].includes(
          (element as HTMLInputElement).type,
        )
      )
        return 'CLICK';
      if (
        role === 'button' ||
        tag === 'button' ||
        tag === 'a' ||
        role === 'link' ||
        role === 'tab' ||
        role === 'menuitem' ||
        role === 'option' ||
        element.hasAttribute('onclick')
      ) {
        return /\b(close|dismiss|cancel|escape)\b/i.test(name)
          ? 'DISMISS'
          : 'CLICK';
      }
      return undefined;
    };
    const layers: InspectedLayer[] = layerElements.map((element) => {
      const localId = layerLocalIds.get(element) as string;
      const kind = layerKind(element) as BenchmarkLayer['kind'];
      return {
        localId,
        kind,
        label: nameFor(element).label,
        parentLocalId: layerParents.get(localId),
        blocking:
          kind === 'dialog' ||
          element.getAttribute('aria-modal') === 'true' ||
          kind === 'overlay',
      };
    });
    const inheritedLayers = (element: Element): string[] => {
      const direct: string[] = [];
      let cursor: Element | null = element;
      while (cursor) {
        const id = layerLocalIds.get(cursor);
        if (id) direct.unshift(id);
        cursor = parentAcrossShadow(cursor);
      }
      const result: string[] = [];
      for (const id of direct) {
        const chain: string[] = [id];
        let parent = layerParents.get(id);
        while (parent) {
          chain.unshift(parent);
          parent = layerParents.get(parent);
        }
        for (const member of chain)
          if (!result.includes(member)) result.push(member);
      }
      return result;
    };
    const candidates: InspectedCandidate[] = [];
    for (const element of elements) {
      const name = nameFor(element);
      const state = stateFor(element);
      const operation = operationFor(element, name.label);
      const localContext = contextFor(element);
      const common = {
        selector: selectorFor(element),
        label: name.label,
        nameSource: name.source,
        semanticConfidence: name.confidence,
        region: regionFor(element),
        layerLocalIds: inheritedLayers(element),
        localContext,
        visible: state.visible,
        covered: state.covered,
        disabled: state.disabled,
        oracleId: element.getAttribute('data-benchmark-id') || undefined,
      };
      if (operation) {
        candidates.push({
          localId: `candidate-${candidates.length + 1}`,
          ...common,
          operation,
          role:
            element.getAttribute('role') || element.tagName.toLocaleLowerCase(),
          currentValue:
            element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLSelectElement
              ? clean(element.value)
              : undefined,
        });
      }
      const scrollable =
        (element.scrollHeight > element.clientHeight + 1 ||
          element.scrollWidth > element.clientWidth + 1) &&
        element.clientHeight > 0;
      if (scrollable) {
        candidates.push({
          localId: `candidate-${candidates.length + 1}`,
          ...common,
          operation: 'SCROLL',
          role: 'scroll-region',
          label:
            name.label === element.tagName.toLocaleLowerCase()
              ? 'Scrollable content'
              : `Scroll ${name.label}`,
          nameSource:
            name.label === element.tagName.toLocaleLowerCase()
              ? 'inferred'
              : name.source,
          semanticConfidence:
            name.label === element.tagName.toLocaleLowerCase()
              ? 0.25
              : name.confidence,
          currentValue: `${Math.round(element.scrollTop)}/${Math.round(element.scrollHeight - element.clientHeight)}`,
          scrollDelta: Math.max(
            80,
            Math.min(420, Math.floor(element.clientHeight * 0.75)),
          ),
        });
      }
    }
    return { layers, candidates };
  });

export const hybridStrategy: ContextStrategy = {
  id: 'hybrid-dom-semantic-geometry',
  label: 'Hybrid DOM, semantic, geometry, layers, frames, and open shadow DOM',
  async observe(page: Page, goal: string): Promise<BenchmarkObservation> {
    const unsupported: string[] = [
      'accessibility-tree: no portable public Playwright page-level AX snapshot is used; DOM semantic fallback active',
    ];
    let title = '';
    let text = '';
    try {
      title = await page.title();
      text = (await page.locator('body').innerText()).slice(0, MAX_TEXT_LENGTH);
    } catch (error: unknown) {
      unsupported.push(
        `main-document metadata unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    const allLayers: BenchmarkLayer[] = [];
    const inspected: Array<{
      frameId: string;
      framePath: string[];
      candidate: InspectedCandidate;
    }> = [];
    for (const frame of page.frames()) {
      const frameId = frameIdFor(frame);
      const framePath = framePathFor(frame);
      const pageLayerId = `${frameId}:page`;
      allLayers.push({
        id: pageLayerId,
        kind: 'page',
        label: frame === page.mainFrame() ? title || 'Page' : frameId,
        blocking: false,
      });
      try {
        const result = await inspectFrame(frame);
        for (const layer of result.layers) {
          allLayers.push({
            id: `${frameId}:${layer.localId}`,
            kind: layer.kind,
            label: layer.label,
            parentId: layer.parentLocalId
              ? `${frameId}:${layer.parentLocalId}`
              : pageLayerId,
            blocking: layer.blocking,
          });
        }
        for (const candidate of result.candidates)
          inspected.push({ frameId, framePath, candidate });
      } catch (error: unknown) {
        unsupported.push(
          `frame ${frameId} omitted: ${error instanceof Error ? error.message : 'inspection failed'}`,
        );
      }
    }

    const terms = goalTerms(goal);
    const groupMap = new Map<string, BenchmarkGroup>();
    const candidates: BenchmarkCandidate[] = inspected.map(
      ({ frameId, framePath, candidate }, index) => {
        const layerPath = [
          `${frameId}:page`,
          ...candidate.layerLocalIds.map((id) => `${frameId}:${id}`),
        ];
        const groupKey = [
          frameId,
          layerPath.at(-1),
          candidate.region,
          candidate.localContext,
        ]
          .filter(Boolean)
          .join('|');
        const groupId = `group-${groupMap.size + 1}`;
        const score = relevance(candidate, terms);
        let group = groupMap.get(groupKey);
        if (!group) {
          group = {
            id: groupId,
            label: candidate.localContext || candidate.region,
            region: candidate.region,
            layerPath,
            candidateRefs: [],
            priority: score,
          };
          groupMap.set(groupKey, group);
        } else {
          group.priority = Math.max(group.priority, score);
        }
        const execution: BenchmarkExecution =
          candidate.operation === 'SCROLL'
            ? {
                kind: 'scroll',
                selector: candidate.selector,
                delta: candidate.scrollDelta ?? 240,
                ...(framePath.length ? { framePath } : {}),
              }
            : {
                kind: 'locator',
                selector: candidate.selector,
                ...(framePath.length ? { framePath } : {}),
              };
        const result: BenchmarkCandidate = {
          ref: `hybrid-${index + 1}`,
          operation: candidate.operation,
          label: candidate.label,
          role: candidate.role,
          nameSource: candidate.nameSource,
          semanticConfidence: candidate.semanticConfidence,
          region: candidate.region,
          groupId: group.id,
          layerPath,
          ...(candidate.localContext
            ? { localContext: candidate.localContext }
            : {}),
          ...(candidate.currentValue !== undefined
            ? { currentValue: candidate.currentValue }
            : {}),
          visible: candidate.visible,
          actionable:
            candidate.visible && !candidate.covered && !candidate.disabled,
          covered: candidate.covered,
          disabled: candidate.disabled,
          score,
          execution,
          ...(candidate.oracleId ? { oracleId: candidate.oracleId } : {}),
        };
        group.candidateRefs.push(result.ref);
        return result;
      },
    );
    candidates.sort(
      (left, right) =>
        right.score - left.score || left.ref.localeCompare(right.ref),
    );
    const kept = candidates.slice(0, MAX_CANDIDATES);
    const keptRefs = new Set(kept.map((candidate) => candidate.ref));
    const groups = Array.from(groupMap.values())
      .map((group) => ({
        ...group,
        candidateRefs: group.candidateRefs.filter((ref) => keptRefs.has(ref)),
      }))
      .filter((group) => group.candidateRefs.length > 0)
      .sort(
        (left, right) =>
          right.priority - left.priority || left.id.localeCompare(right.id),
      );
    const groupOrder = new Map(groups.map((group, index) => [group.id, index]));
    kept.sort(
      (left, right) =>
        (groupOrder.get(left.groupId) ?? Number.POSITIVE_INFINITY) -
          (groupOrder.get(right.groupId) ?? Number.POSITIVE_INFINITY) ||
        right.score - left.score ||
        left.ref.localeCompare(right.ref),
    );
    const refsByGroup = new Map<string, string[]>();
    for (const candidate of kept) {
      const refs = refsByGroup.get(candidate.groupId) ?? [];
      refs.push(candidate.ref);
      refsByGroup.set(candidate.groupId, refs);
    }
    for (const group of groups)
      group.candidateRefs = refsByGroup.get(group.id) ?? [];

    return {
      strategy: 'hybrid-dom-semantic-geometry',
      url: page.url(),
      title,
      text,
      layers: allLayers,
      groups,
      candidates: kept,
      omittedCandidates: candidates.length - kept.length,
      unsupported,
    };
  },
};
