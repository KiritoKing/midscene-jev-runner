import type {
  BenchmarkCandidate,
  BenchmarkGroup,
  BenchmarkLayer,
  BenchmarkObservation,
  ContextStrategy,
} from '../types.js';

/**
 * Frozen flat baseline used for reproducible comparisons after production
 * evolves. It intentionally mirrors the v0.1.2 constraints: main document
 * only, executable controls only, one active layer, and DOM-order truncation.
 */
export const currentStrategy: ContextStrategy = {
  id: 'current-v0.1.2',
  label: 'Frozen v0.1.2 flat context',

  async observe(page): Promise<BenchmarkObservation> {
    const raw = await page.evaluate(() => {
      const normalize = (value: string | null | undefined): string =>
        (value ?? '').replace(/\s+/gu, ' ').trim().slice(0, 300);
      const rendered = (element: Element): boolean => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          !element.closest('[aria-hidden="true"],[inert]')
        );
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
      const unobscured = (element: Element): boolean => {
        const rect = element.getBoundingClientRect();
        const x = Math.min(
          innerWidth - 1,
          Math.max(0, rect.left + rect.width / 2),
        );
        const y = Math.min(
          innerHeight - 1,
          Math.max(0, rect.top + rect.height / 2),
        );
        const hit = document.elementFromPoint(x, y);
        return hit === element || Boolean(hit && element.contains(hit));
      };
      const role = (element: Element): string => {
        const explicit = element.getAttribute('role');
        if (explicit) return explicit;
        if (element instanceof HTMLButtonElement) return 'button';
        if (element instanceof HTMLAnchorElement) return 'link';
        if (element instanceof HTMLSelectElement) return 'combobox';
        if (element instanceof HTMLTextAreaElement) return 'textbox';
        if (element instanceof HTMLInputElement) {
          if (['button', 'submit', 'reset', 'image'].includes(element.type))
            return 'button';
          if (['checkbox', 'radio'].includes(element.type)) return element.type;
          return 'textbox';
        }
        return element.tagName.toLocaleLowerCase();
      };
      const name = (element: Element): string => {
        const labelledBy = (element.getAttribute('aria-labelledby') ?? '')
          .split(/\s+/u)
          .map((id) => normalize(document.getElementById(id)?.textContent))
          .filter(Boolean)
          .join(' ');
        const nativeLabels =
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement
            ? Array.from(element.labels ?? [])
                .map((label) => normalize(label.textContent))
                .filter(Boolean)
                .join(' ')
            : '';
        return normalize(
          element.getAttribute('aria-label') ||
            labelledBy ||
            nativeLabels ||
            element.getAttribute('placeholder') ||
            element.getAttribute('title') ||
            element.textContent ||
            role(element),
        );
      };
      const region = (
        element: Element,
      ): 'dialog' | 'main' | 'navigation' | 'content' => {
        if (element.closest('dialog,[role="dialog"],[aria-modal="true"]'))
          return 'dialog';
        if (element.closest('header,nav,aside,[role="navigation"]'))
          return 'navigation';
        if (element.closest('main,[role="main"],form')) return 'main';
        return 'content';
      };
      const selector = [
        'a[href]',
        'button',
        'input',
        'textarea',
        'select',
        'summary',
        '[contenteditable="true"]',
        '[aria-haspopup]',
        '[role="button"]',
        '[role="link"]',
        '[role="textbox"]',
        '[role="combobox"]',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="option"]',
      ].join(',');
      const layers = Array.from(
        document.querySelectorAll(
          'dialog[open],[role="dialog"],[aria-modal="true"],[role="listbox"],[role="menu"],[class*="modal"],[class*="overlay"]',
        ),
      ).filter((element) => rendered(element) && inViewport(element));
      const activeLayer = layers.at(-1);
      const controls: Array<{
        ref: string;
        operation: 'CLICK' | 'TYPE_TEXT' | 'SELECT' | 'DISMISS' | 'SCROLL';
        label: string;
        role: string;
        region: 'dialog' | 'main' | 'navigation' | 'content';
        selector?: string;
        oracleId?: string;
        delta?: number;
      }> = [];
      const add = (
        element: Element,
        operation: 'CLICK' | 'TYPE_TEXT' | 'SELECT',
      ) => {
        const ref = `baseline-${controls.length + 1}`;
        element.setAttribute('data-jev-baseline-ref', ref);
        controls.push({
          ref,
          operation,
          label: name(element),
          role: role(element),
          region: region(element),
          selector: `[data-jev-baseline-ref="${ref}"]`,
          oracleId: element.getAttribute('data-benchmark-id') ?? undefined,
        });
      };
      for (const element of Array.from(document.querySelectorAll(selector))) {
        if (controls.length >= 250) break;
        if (
          !rendered(element) ||
          !inViewport(element) ||
          !unobscured(element) ||
          element.matches(':disabled,[aria-disabled="true"]') ||
          (activeLayer && !activeLayer.contains(element))
        )
          continue;
        if (element instanceof HTMLInputElement && element.type === 'hidden')
          continue;
        const editable =
          element instanceof HTMLTextAreaElement ||
          (element instanceof HTMLInputElement &&
            !['button', 'submit', 'reset', 'checkbox', 'radio'].includes(
              element.type,
            )) ||
          element.getAttribute('contenteditable') === 'true';
        add(
          element,
          element instanceof HTMLSelectElement
            ? 'SELECT'
            : editable
              ? 'TYPE_TEXT'
              : 'CLICK',
        );
      }
      for (const element of Array.from(document.querySelectorAll('body *'))) {
        if (controls.length >= 250) break;
        if (
          element.closest(selector) ||
          element.querySelector(selector) ||
          !rendered(element) ||
          !inViewport(element) ||
          !unobscured(element) ||
          (activeLayer && !activeLayer.contains(element)) ||
          getComputedStyle(element).cursor !== 'pointer'
        )
          continue;
        add(element, 'CLICK');
      }
      if (activeLayer) {
        const close = activeLayer.querySelector(
          'button[aria-label*="close" i],[role="button"][aria-label*="close" i]',
        );
        if (close instanceof Element) {
          const ref = `baseline-${controls.length + 1}`;
          close.setAttribute('data-jev-baseline-ref', ref);
          controls.push({
            ref,
            operation: 'DISMISS',
            label: 'Dismiss the active dialog or overlay',
            role: 'button',
            region: 'dialog',
            selector: `[data-jev-baseline-ref="${ref}"]`,
            oracleId: close.getAttribute('data-benchmark-id') ?? undefined,
          });
        }
      } else if (
        scrollY + innerHeight <
        document.documentElement.scrollHeight
      ) {
        controls.push({
          ref: 'baseline-scroll',
          operation: 'SCROLL',
          label: 'Scroll down',
          role: 'scroll-region',
          region: 'content',
          delta: 560,
        });
      }
      return {
        title: document.title,
        text: normalize((activeLayer ?? document.body).textContent).slice(
          0,
          6_000,
        ),
        controls,
        activeLayer: activeLayer ? { label: name(activeLayer) } : undefined,
      };
    });

    const candidates: BenchmarkCandidate[] = raw.controls.map(
      (control, index) => ({
        ref: control.ref,
        operation: control.operation,
        label: control.label,
        role: control.role,
        nameSource: 'unknown',
        semanticConfidence: 0.3,
        region: control.region,
        groupId: `region-${control.region}`,
        layerPath: raw.activeLayer
          ? ['baseline-page', 'baseline-active-layer']
          : ['baseline-page'],
        visible: true,
        actionable: true,
        covered: false,
        disabled: false,
        score: 250 - index,
        execution: control.selector
          ? { kind: 'locator', selector: control.selector }
          : { kind: 'scroll', delta: control.delta ?? 560 },
        ...(control.oracleId ? { oracleId: control.oracleId } : {}),
      }),
    );
    const groups = new Map<string, BenchmarkGroup>();
    for (const candidate of candidates) {
      const existing = groups.get(candidate.groupId) ?? {
        id: candidate.groupId,
        label: `${candidate.region} controls`,
        region: candidate.region,
        layerPath: candidate.layerPath,
        candidateRefs: [],
        priority: candidate.region === 'main' ? 2 : 1,
      };
      existing.candidateRefs.push(candidate.ref);
      groups.set(candidate.groupId, existing);
    }
    const layers: BenchmarkLayer[] = [
      {
        id: 'baseline-page',
        kind: 'page',
        label: raw.title || 'Page',
        blocking: false,
      },
      ...(raw.activeLayer
        ? [
            {
              id: 'baseline-active-layer',
              kind: 'dialog' as const,
              label: raw.activeLayer.label,
              parentId: 'baseline-page',
              blocking: true,
            },
          ]
        : []),
    ];
    return {
      strategy: currentStrategy.id,
      url: page.url(),
      title: raw.title,
      text: raw.text,
      layers,
      groups: Array.from(groups.values()),
      candidates,
      omittedCandidates: 0,
      unsupported: [
        'Facts filtered as hidden, covered, disabled, or outside the active layer are not retained.',
        'Iframe, shadow-root, and nested-scroll traversal are unsupported.',
      ],
    };
  },
};
