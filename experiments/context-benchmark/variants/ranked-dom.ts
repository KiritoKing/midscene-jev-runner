import type {
  BenchmarkCandidate,
  BenchmarkLayer,
  BenchmarkNameSource,
  BenchmarkObservation,
  ContextStrategy,
} from '../types.js';

const CANDIDATE_BUDGET = 36;

/**
 * A deliberately DOM-only baseline. It favours relevant, usable controls over
 * source order, while retaining the state that explains why a control cannot
 * currently be used.
 */
export const rankedDomStrategy: ContextStrategy = {
  id: 'ranked-dom',
  label: 'Ranked DOM context',

  async observe(page, goal): Promise<BenchmarkObservation> {
    const snapshot = await page.evaluate(
      ({ goalText, budget }) => {
        const normalize = (value: string | null | undefined): string =>
          (value ?? '').replace(/\s+/gu, ' ').trim();
        const compact = (
          value: string | null | undefined,
          limit = 240,
        ): string => normalize(value).slice(0, limit);
        const visibleText = (element: Element): string =>
          compact(element.textContent, 320);
        const attributeText = (element: Element, name: string): string =>
          compact(element.getAttribute(name));
        const labelFor = (element: Element): string => {
          const ids = (element.getAttribute('aria-labelledby') ?? '')
            .split(/\s+/u)
            .filter(Boolean);
          const labelled = ids
            .map((id) => {
              const target = document.getElementById(id);
              return target ? visibleText(target) : '';
            })
            .filter(Boolean)
            .join(' ');
          return compact(labelled);
        };
        const nativeLabel = (element: Element): string => {
          if (
            !(
              element instanceof HTMLInputElement ||
              element instanceof HTMLSelectElement ||
              element instanceof HTMLTextAreaElement
            )
          )
            return '';
          const labels = Array.from(element.labels ?? [])
            .map((label) => visibleText(label))
            .filter(Boolean)
            .join(' ');
          return compact(labels);
        };
        const nearbyText = (element: Element): string => {
          const parent = element.parentElement;
          if (!parent) return '';
          const sibling = Array.from(parent.children).find(
            (child) =>
              child !== element &&
              /^(LABEL|SPAN|P|LEGEND)$/u.test(child.tagName),
          );
          return sibling ? visibleText(sibling) : '';
        };
        const name = (element: Element) => {
          const aria =
            attributeText(element, 'aria-label') || labelFor(element);
          if (aria) return { label: aria, source: 'aria', confidence: 0.95 };
          const native = nativeLabel(element);
          if (native)
            return { label: native, source: 'native-label', confidence: 0.85 };
          const attribute = [
            attributeText(element, 'title'),
            attributeText(element, 'placeholder'),
            element instanceof HTMLInputElement ? compact(element.value) : '',
            attributeText(element, 'alt'),
          ].find(Boolean);
          if (attribute)
            return { label: attribute, source: 'attribute', confidence: 0.7 };
          const content = visibleText(element);
          if (content)
            return { label: content, source: 'content', confidence: 0.55 };
          const nearby = nearbyText(element);
          if (nearby)
            return { label: nearby, source: 'nearby', confidence: 0.35 };
          return { label: '', source: 'unknown', confidence: 0.1 };
        };
        const nativeRole = (element: Element): string => {
          const explicit = attributeText(element, 'role');
          if (explicit) return explicit.split(/\s+/u)[0] ?? 'generic';
          if (element instanceof HTMLButtonElement) return 'button';
          if (element instanceof HTMLAnchorElement && element.href)
            return 'link';
          if (element instanceof HTMLSelectElement) return 'combobox';
          if (element instanceof HTMLTextAreaElement) return 'textbox';
          if (element instanceof HTMLInputElement) {
            if (element.type === 'checkbox') return 'checkbox';
            if (element.type === 'radio') return 'radio';
            if (['button', 'submit', 'reset', 'image'].includes(element.type))
              return 'button';
            return 'textbox';
          }
          if (element.tagName === 'SUMMARY') return 'button';
          return element instanceof HTMLElement && element.isContentEditable
            ? 'textbox'
            : 'generic';
        };
        const rendered = (element: Element): boolean => {
          if (!(element instanceof HTMLElement)) return false;
          if (element.closest('[hidden], [aria-hidden="true"], inert'))
            return false;
          for (
            let current: HTMLElement | null = element;
            current;
            current = current.parentElement
          ) {
            const style = getComputedStyle(current);
            if (
              style.display === 'none' ||
              style.visibility === 'hidden' ||
              Number(style.opacity) === 0
            )
              return false;
          }
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const inViewport = (element: Element): boolean => {
          const rect = element.getBoundingClientRect();
          return (
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < innerHeight &&
            rect.left < innerWidth
          );
        };
        const isCovered = (
          element: Element,
          isRendered: boolean,
          isInViewport: boolean,
        ): boolean => {
          if (!isRendered || !isInViewport) return false;
          const rect = element.getBoundingClientRect();
          const probes = [
            [rect.left + rect.width / 2, rect.top + rect.height / 2],
            [rect.left + 2, rect.top + 2],
            [rect.right - 2, rect.bottom - 2],
          ];
          return probes.every(([x, y]) => {
            const top = document.elementFromPoint(x, y);
            return top !== null && top !== element && !element.contains(top);
          });
        };
        const isDisabled = (element: Element): boolean => {
          const ariaDisabled = element.getAttribute('aria-disabled') === 'true';
          const nativeDisabled =
            element instanceof HTMLButtonElement ||
            element instanceof HTMLInputElement ||
            element instanceof HTMLSelectElement ||
            element instanceof HTMLTextAreaElement
              ? element.disabled
              : false;
          return (
            ariaDisabled ||
            nativeDisabled ||
            Boolean(element.closest('fieldset[disabled]'))
          );
        };
        const selectorFor = (element: Element): string => {
          if (element === document.body) return 'body';
          if (element.id) return `#${CSS.escape(element.id)}`;
          const parts: string[] = [];
          for (
            let current: Element | null = element;
            current && current !== document.body;
            current = current.parentElement
          ) {
            const siblings = Array.from(
              current.parentElement?.children ?? [],
            ).filter((sibling) => sibling.tagName === current?.tagName);
            const nth = siblings.indexOf(current) + 1;
            parts.unshift(
              `${current.tagName.toLowerCase()}:nth-of-type(${nth})`,
            );
          }
          return `body > ${parts.join(' > ')}`;
        };
        const isControl = (element: Element): boolean => {
          const tag = element.tagName;
          const role = attributeText(element, 'role').split(/\s+/u)[0];
          const input = element instanceof HTMLInputElement;
          const native =
            tag === 'BUTTON' ||
            tag === 'SELECT' ||
            tag === 'TEXTAREA' ||
            tag === 'SUMMARY' ||
            tag === 'OPTION' ||
            (input && element.type !== 'hidden') ||
            (tag === 'A' && element.hasAttribute('href'));
          const aria = [
            'button',
            'link',
            'textbox',
            'searchbox',
            'combobox',
            'listbox',
            'option',
            'checkbox',
            'radio',
            'switch',
            'tab',
            'menuitem',
            'menuitemcheckbox',
            'menuitemradio',
            'slider',
            'spinbutton',
          ].includes(role);
          const tabIndex =
            element instanceof HTMLElement && element.tabIndex >= 0;
          const pointer =
            element instanceof HTMLElement &&
            getComputedStyle(element).cursor === 'pointer';
          return (
            native ||
            aria ||
            pointer ||
            element.hasAttribute('onclick') ||
            tabIndex ||
            (element instanceof HTMLElement && element.isContentEditable)
          );
        };
        const layerKind = (element: Element): BenchmarkLayer['kind'] => {
          const role = attributeText(element, 'role');
          if (element.tagName === 'DIALOG' || /alertdialog|dialog/u.test(role))
            return 'dialog';
          if (/listbox/u.test(role)) return 'listbox';
          if (/menu/u.test(role)) return 'menu';
          if (element.hasAttribute('popover')) return 'popover';
          return 'overlay';
        };
        const layerNodes = Array.from(
          document.querySelectorAll(
            'dialog, [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [popover], [aria-modal="true"]',
          ),
        );
        const pageLayer: BenchmarkLayer = {
          id: 'layer-page',
          kind: 'page',
          label: compact(document.title) || 'Page',
          blocking: false,
        };
        const layerId = new Map<Element, string>();
        layerNodes.forEach((node, index) =>
          layerId.set(node, `layer-${index + 1}`),
        );
        const layers: BenchmarkLayer[] = [
          pageLayer,
          ...layerNodes.map((node) => {
            let parent: Element | null = node.parentElement;
            while (parent && !layerId.has(parent))
              parent = parent.parentElement;
            return {
              id: layerId.get(node) ?? 'layer-page',
              kind: layerKind(node),
              label: name(node).label || layerKind(node),
              parentId: parent ? layerId.get(parent) : 'layer-page',
              blocking:
                node.getAttribute('aria-modal') === 'true' ||
                node.tagName === 'DIALOG',
            };
          }),
        ];
        const layerPath = (element: Element): string[] => {
          const path = ['layer-page'];
          const ancestors: Element[] = [];
          for (
            let current: Element | null = element.parentElement;
            current;
            current = current.parentElement
          )
            if (layerId.has(current)) ancestors.unshift(current);
          return path.concat(
            ancestors.map((ancestor) => layerId.get(ancestor) ?? 'layer-page'),
          );
        };
        const regionFor = (
          element: Element,
        ): { root: Element | null; label: string } => {
          const root = element.closest(
            'main, nav, aside, header, footer, form, fieldset, section, article, [role="main"], [role="navigation"], [role="region"], [role="dialog"], [role="menu"], [role="listbox"]',
          );
          if (!root) return { root: null, label: 'page' };
          const role = nativeRole(root);
          return {
            root,
            label: name(root).label || role || root.tagName.toLowerCase(),
          };
        };
        const goalTerms = Array.from(
          new Set(
            [
              ...goalText
                .toLocaleLowerCase()
                .matchAll(/[a-z0-9][a-z0-9_-]{1,}/gu),
              ...goalText.matchAll(/[\u3400-\u9fff]/gu),
            ].map((match) => match[0]),
          ),
        ).slice(0, 30);
        const relevance = (haystack: string): number => {
          const lower = haystack.toLocaleLowerCase();
          return goalTerms.reduce(
            (total, term) =>
              total + (lower.includes(term.toLocaleLowerCase()) ? 1 : 0),
            0,
          );
        };
        const groupIds = new Map<Element | null, string>();
        const controlCandidates = Array.from(document.querySelectorAll('*'))
          .filter(isControl)
          .map((element, domIndex) => {
            const identity = name(element);
            const role = nativeRole(element);
            const region = regionFor(element);
            const groupRoot =
              element.closest(
                'fieldset, form, [role="group"], section, article, nav, [role="region"], [role="dialog"], [role="menu"], [role="listbox"]',
              ) ?? region.root;
            let groupId = groupIds.get(groupRoot);
            if (!groupId) {
              groupId = `group-${groupIds.size + 1}`;
              groupIds.set(groupRoot, groupId);
            }
            const isRendered = rendered(element);
            const viewport = isRendered && inViewport(element);
            const covered = isCovered(element, isRendered, viewport);
            const disabled = isDisabled(element);
            const visible = isRendered && viewport;
            const actionable = visible && !covered && !disabled;
            const currentValue =
              element instanceof HTMLInputElement ||
              element instanceof HTMLTextAreaElement ||
              element instanceof HTMLSelectElement
                ? compact(element.value)
                : undefined;
            const context = compact(element.parentElement?.textContent, 360);
            const operation: 'SELECT' | 'TYPE_TEXT' | 'DISMISS' | 'CLICK' =
              element instanceof HTMLSelectElement
                ? 'SELECT'
                : (element instanceof HTMLInputElement &&
                      [
                        'text',
                        'search',
                        'email',
                        'password',
                        'tel',
                        'url',
                        'number',
                      ].includes(element.type)) ||
                    element instanceof HTMLTextAreaElement ||
                    (element instanceof HTMLElement &&
                      element.isContentEditable) ||
                    ['textbox', 'searchbox', 'spinbutton'].includes(role)
                  ? 'TYPE_TEXT'
                  : /^(close|dismiss|cancel)$/iu.test(identity.label)
                    ? 'DISMISS'
                    : 'CLICK';
            const goalScore = relevance(
              `${identity.label} ${context} ${region.label} ${role}`,
            );
            const score =
              goalScore * 100 +
              (actionable ? 35 : 0) +
              (visible ? 10 : 0) +
              identity.confidence * 10 +
              (layerPath(element).length - 1) * 5 -
              (disabled ? 25 : 0) -
              (covered ? 15 : 0) -
              (!visible ? 10 : 0);
            return {
              domIndex,
              ref: `dom-${domIndex + 1}`,
              operation,
              label: identity.label || role,
              role,
              nameSource: identity.source,
              semanticConfidence: identity.confidence,
              region: region.label,
              groupId,
              layerPath: layerPath(element),
              localContext: context,
              currentValue,
              visible,
              actionable,
              covered,
              disabled,
              score,
              selector: selectorFor(element),
              oracleId: element.getAttribute('data-benchmark-id') ?? undefined,
              executionKind: 'locator' as const,
            };
          });
        const scrollCandidates = Array.from(
          document.querySelectorAll('body, body *'),
        )
          .filter(
            (element): element is HTMLElement => element instanceof HTMLElement,
          )
          .filter(
            (element) =>
              element.scrollHeight > element.clientHeight + 1 ||
              element.scrollWidth > element.clientWidth + 1,
          )
          .map((element, scrollIndex) => {
            const identity = name(element);
            const region = regionFor(element);
            const groupRoot =
              element.closest(
                'fieldset, form, [role="group"], section, article, nav, [role="region"], [role="dialog"], [role="menu"], [role="listbox"]',
              ) ?? region.root;
            let groupId = groupIds.get(groupRoot);
            if (!groupId) {
              groupId = `group-${groupIds.size + 1}`;
              groupIds.set(groupRoot, groupId);
            }
            const isRendered = rendered(element);
            const viewport = isRendered && inViewport(element);
            const covered = isCovered(element, isRendered, viewport);
            const visible = isRendered && viewport;
            const context = compact(element.textContent, 360);
            const label = identity.label || `Scrollable ${region.label}`;
            const score =
              relevance(`${label} ${context} ${region.label} scroll`) * 100 +
              (visible && !covered ? 25 : 0) +
              identity.confidence * 10 -
              (covered ? 15 : 0) -
              (!visible ? 10 : 0);
            return {
              domIndex: 1_000_000 + scrollIndex,
              ref: `scroll-${scrollIndex + 1}`,
              operation: 'SCROLL' as const,
              label,
              role: 'scroll-container',
              nameSource: identity.source,
              semanticConfidence: identity.confidence,
              region: region.label,
              groupId,
              layerPath: layerPath(element),
              localContext: context,
              currentValue: undefined,
              visible,
              actionable: visible && !covered,
              covered,
              disabled: false,
              score,
              selector: selectorFor(element),
              oracleId: element.getAttribute('data-benchmark-id') ?? undefined,
              executionKind: 'scroll' as const,
            };
          });
        const rawCandidates = [...controlCandidates, ...scrollCandidates].sort(
          (left, right) =>
            right.score - left.score || left.domIndex - right.domIndex,
        );
        const retained = rawCandidates.slice(0, budget);
        const groups = Array.from(groupIds.entries())
          .map(([root, id]) => {
            const members = retained.filter(
              (candidate) => candidate.groupId === id,
            );
            const rootName = root ? name(root).label : 'Page controls';
            return {
              id,
              label: rootName || members[0]?.region || 'Controls',
              region: members[0]?.region || 'page',
              layerPath: members[0]?.layerPath ?? ['layer-page'],
              candidateRefs: members.map((candidate) => candidate.ref),
              priority: Math.max(
                0,
                ...members.map((candidate) => candidate.score),
              ),
            };
          })
          .filter((group) => group.candidateRefs.length > 0)
          .sort(
            (left, right) =>
              right.priority - left.priority || left.id.localeCompare(right.id),
          );
        return {
          title: document.title,
          text: compact(document.body?.innerText, 12_000),
          layers,
          groups,
          candidates: retained,
          omittedCandidates: rawCandidates.length - retained.length,
          unsupported: [
            'Accessibility-tree extraction is unsupported; this strategy uses DOM semantics only.',
            ...(document.querySelectorAll('iframe, frame').length > 0
              ? [
                  `Iframe traversal is unsupported; ignored ${document.querySelectorAll('iframe, frame').length} embedded document(s).`,
                ]
              : []),
          ],
        };
      },
      { goalText: goal, budget: CANDIDATE_BUDGET },
    );

    return {
      strategy: rankedDomStrategy.id,
      url: page.url(),
      title: snapshot.title,
      text: snapshot.text,
      layers: snapshot.layers,
      groups: snapshot.groups,
      candidates: snapshot.candidates.map(
        (candidate): BenchmarkCandidate => ({
          ref: candidate.ref,
          operation: candidate.operation,
          label: candidate.label,
          role: candidate.role,
          nameSource: candidate.nameSource as BenchmarkNameSource,
          semanticConfidence: candidate.semanticConfidence,
          region: candidate.region,
          groupId: candidate.groupId,
          layerPath: candidate.layerPath,
          localContext: candidate.localContext,
          currentValue: candidate.currentValue,
          visible: candidate.visible,
          actionable: candidate.actionable,
          covered: candidate.covered,
          disabled: candidate.disabled,
          score: candidate.score,
          execution:
            candidate.executionKind === 'scroll'
              ? { kind: 'scroll', selector: candidate.selector, delta: 500 }
              : { kind: 'locator', selector: candidate.selector },
          oracleId: candidate.oracleId,
        }),
      ),
      omittedCandidates: snapshot.omittedCandidates,
      unsupported: snapshot.unsupported,
    };
  },
};
