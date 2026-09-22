// Adapted from browser-use/jev-ultrafast's DOM snapshot approach (MIT).
// This function must stay self-contained because Playwright serializes it into
// the page; action execution remains in the Node.js process.
export function browserSnapshot(): unknown {
  if (!document.body) return null;
  const maxActions = 250;
  const maxFieldValueLength = 500;
  const maxLabelLength = 300;
  const maxPageTextLength = 6_000;
  const cacheKey = '__midsceneJevSnapshot';
  type Cache = { ids: WeakMap<Element, number>; next: number };
  const global = window as unknown as Record<string, unknown>;
  let cache = global[cacheKey] as Cache | undefined;
  if (!cache) {
    cache = { ids: new WeakMap<Element, number>(), next: 1 };
    global[cacheKey] = cache;
  }

  const identity = (element: Element): string => {
    let id = cache.ids.get(element);
    if (!id) {
      id = cache.next++;
      cache.ids.set(element, id);
    }
    return String(id);
  };
  const rendered = (element: Element): boolean => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      style.opacity !== '0' &&
      !element.closest('[aria-hidden="true"],[inert]')
    );
  };
  const inViewport = (element: Element): boolean => {
    const rect = element.getBoundingClientRect();
    return (
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    );
  };
  const unobscured = (element: Element): boolean => {
    const rect = element.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const right = Math.min(window.innerWidth, rect.right);
    const top = Math.max(0, rect.top);
    const bottom = Math.min(window.innerHeight, rect.bottom);
    if (right <= left || bottom <= top) return false;
    const points = [
      [(left + right) / 2, (top + bottom) / 2],
      [left + 1, top + 1],
      [right - 1, top + 1],
      [left + 1, bottom - 1],
      [right - 1, bottom - 1],
    ];
    return points.some(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return hit === element || (hit !== null && element.contains(hit));
    });
  };
  const normalize = (value: string): string =>
    value.replace(/\s+/gu, ' ').trim().slice(0, maxLabelLength);
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
      if (element.type === 'search') return 'searchbox';
      if (element.type === 'number') return 'spinbutton';
      return 'textbox';
    }
    return element.tagName.toLowerCase();
  };
  const name = (element: Element): string => {
    const labelledBy = (element.getAttribute('aria-labelledby') || '')
      .split(/\s+/u)
      .map((id) => document.getElementById(id)?.textContent || '')
      .map(normalize)
      .filter(Boolean)
      .join(' ');
    const nativeLabels =
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
        ? Array.from(element.labels || [])
            .map((label) => normalize(label.textContent || ''))
            .filter(Boolean)
            .join(' ')
        : '';
    let nearbyLabel = '';
    const isField =
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement ||
      element.getAttribute('contenteditable') === 'true' ||
      ['textbox', 'combobox', 'searchbox', 'spinbutton'].includes(
        role(element),
      );
    let container = isField ? element.parentElement : null;
    for (let depth = 0; container && depth < 6; depth += 1) {
      const label = Array.from(
        container.querySelectorAll('label,[class*="label"]'),
      ).find(
        (candidate) =>
          !candidate.contains(element) &&
          rendered(candidate) &&
          normalize(candidate.textContent || ''),
      );
      if (label) {
        nearbyLabel = normalize(label.textContent || '');
        break;
      }
      container = container.parentElement;
    }
    return normalize(
      element.getAttribute('aria-label') ||
        labelledBy ||
        nativeLabels ||
        nearbyLabel ||
        element.getAttribute('placeholder') ||
        element.getAttribute('title') ||
        element.textContent ||
        (element instanceof HTMLInputElement ? element.value : '') ||
        role(element),
    );
  };

  const explicitLayerSelector =
    'dialog[open],[role="dialog"],[aria-modal="true"]';
  const popupLayerSelector =
    '[role="listbox"]:not(select),[role="menu"],[role="tree"]';
  const layerSelector = `${explicitLayerSelector},${popupLayerSelector},[class*="modal"],[class*="dialog"],[class*="drawer"],[class*="overlay"]`;
  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
  const layers = Array.from(document.querySelectorAll(layerSelector))
    .filter((element) => rendered(element) && inViewport(element))
    .filter((element) => {
      if (element.matches(explicitLayerSelector)) return true;
      const rect = element.getBoundingClientRect();
      const position = getComputedStyle(element).position;
      if (element.matches(popupLayerSelector))
        return ['absolute', 'fixed'].includes(position);
      return (
        ['absolute', 'fixed', 'sticky'].includes(position) &&
        (rect.width * rect.height) / viewportArea >= 0.12
      );
    })
    .sort((left, right) => {
      const leftZ = Number.parseInt(getComputedStyle(left).zIndex, 10) || 0;
      const rightZ = Number.parseInt(getComputedStyle(right).zIndex, 10) || 0;
      if (leftZ !== rightZ) return leftZ - rightZ;
      return left.compareDocumentPosition(right) &
        Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1;
    });
  const activeLayer = layers.at(-1);
  const activeLayerId = activeLayer ? identity(activeLayer) : undefined;
  const region = (
    element: Element,
  ): 'dialog' | 'main' | 'navigation' | 'content' => {
    if (activeLayer?.contains(element)) return 'dialog';
    if (
      element.closest(
        'header,nav,[role="navigation"],[class*="header"],[class*="navbar"],[class*="topbar"],[class*="sidebar"],[class*="side-bar"],[class*="sidemenu"],[class*="side-menu"]',
      )
    )
      return 'navigation';
    if (element.closest('main,[role="main"],form')) return 'main';
    return 'content';
  };
  const signature = (
    kind: string,
    elementRole: string,
    label: string,
    elementRegion: string,
  ): string =>
    `${kind}|${elementRegion}|${elementRole}|${normalize(label).toLocaleLowerCase()}`;

  const actions: Array<Record<string, unknown>> = [];
  let discoveredActions = 0;
  const addAction = (action: Record<string, unknown>): void => {
    discoveredActions += 1;
    if (actions.length < maxActions) actions.push(action);
  };
  const interactiveRoles = [
    'button',
    'link',
    'textbox',
    'combobox',
    'checkbox',
    'radio',
    'switch',
    'tab',
    'menuitem',
    'menuitemradio',
    'option',
    'searchbox',
    'spinbutton',
  ];
  const selector = [
    'a[href]',
    'button',
    'input',
    'textarea',
    'select',
    'summary',
    '[contenteditable="true"]',
    '[aria-haspopup]',
    ...interactiveRoles.map((value) => `[role="${value}"]`),
  ].join(',');

  for (const element of Array.from(document.querySelectorAll(selector))) {
    if (
      !rendered(element) ||
      !inViewport(element) ||
      !unobscured(element) ||
      element.matches(':disabled,[aria-disabled="true"]') ||
      (activeLayer && !activeLayer.contains(element))
    )
      continue;
    if (
      element instanceof HTMLInputElement &&
      ['password', 'file', 'hidden'].includes(element.type)
    )
      continue;
    const id = identity(element);
    const elementRole = role(element);
    const label = name(element).slice(0, maxLabelLength);
    const elementRegion = region(element);
    const currentValue =
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
        ? element.value
        : element.getAttribute('contenteditable') === 'true'
          ? element.textContent || ''
          : '';
    const checked =
      element instanceof HTMLInputElement &&
      ['checkbox', 'radio'].includes(element.type)
        ? String(element.checked)
        : element.getAttribute('aria-checked');
    const selected = element.getAttribute('aria-selected');
    const expanded = element.getAttribute('aria-expanded');
    const scope =
      element.closest(
        'form,dialog,[role="dialog"],main,[role="main"],article,li,tr,[role="row"]',
      ) || element.parentElement;
    const guard = JSON.stringify([
      elementRole,
      label,
      currentValue,
      checked,
      selected,
      expanded,
      elementRegion,
      normalize(scope?.textContent || '').slice(0, 1_000),
    ]);
    element.setAttribute('data-midscene-jev-id', id);
    element.setAttribute('data-midscene-jev-guard', guard);

    if (element instanceof HTMLSelectElement) {
      for (const option of Array.from(element.options)) {
        if (option.disabled || option.selected) continue;
        addAction({
          id: `${id}:${option.value}`,
          node: id,
          guard,
          kind: 'select',
          label: `${label} → ${option.text}`,
          role: elementRole,
          value: option.value,
          currentValue: currentValue.slice(0, maxFieldValueLength),
          region: elementRegion,
          signature: signature(
            'select',
            elementRole,
            `${label} → ${option.text}`,
            elementRegion,
          ),
        });
      }
      continue;
    }

    const editable =
      !(
        (element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement) &&
        element.readOnly
      ) &&
      element.getAttribute('aria-readonly') !== 'true' &&
      (element instanceof HTMLTextAreaElement ||
        (element instanceof HTMLInputElement &&
          !['button', 'submit', 'reset', 'checkbox', 'radio'].includes(
            element.type,
          )) ||
        element.getAttribute('contenteditable') === 'true');
    const kind = editable ? 'fill' : 'click';
    addAction({
      id,
      node: id,
      guard,
      kind,
      label,
      role: elementRole,
      currentValue: currentValue.slice(0, maxFieldValueLength),
      ...(checked !== null ? { checked } : {}),
      ...(selected !== null ? { selected } : {}),
      ...(expanded !== null ? { expanded } : {}),
      region: elementRegion,
      signature: signature(kind, elementRole, label, elementRegion),
    });
    if (
      editable &&
      (elementRole === 'combobox' || element.hasAttribute('aria-haspopup'))
    )
      addAction({
        id: `${id}:open`,
        node: id,
        guard,
        kind: 'click',
        label: `Open ${label}`,
        role: elementRole,
        currentValue: currentValue.slice(0, maxFieldValueLength),
        region: elementRegion,
        signature: signature(
          'click',
          elementRole,
          `Open ${label}`,
          elementRegion,
        ),
      });
    if (editable && currentValue)
      addAction({
        id: `${id}:clear`,
        node: id,
        guard,
        kind: 'clear',
        label: `Clear ${label}`,
        role: elementRole,
        currentValue: currentValue.slice(0, maxFieldValueLength),
        region: elementRegion,
        signature: signature('clear', elementRole, label, elementRegion),
      });
  }

  // Some component libraries render interactive text without native semantics.
  // Pointer leaves are exposed generically; product-specific labels are never
  // inferred here.
  for (const element of Array.from(document.querySelectorAll('body *'))) {
    if (
      element.closest(selector) ||
      element.querySelector(selector) ||
      !rendered(element) ||
      !inViewport(element) ||
      !unobscured(element) ||
      element.matches('[aria-disabled="true"]') ||
      (activeLayer && !activeLayer.contains(element)) ||
      getComputedStyle(element).cursor !== 'pointer' ||
      Array.from(element.children).some(
        (child) => getComputedStyle(child).cursor === 'pointer',
      )
    )
      continue;
    const label = name(element);
    if (!label || label.length > 100) continue;
    const id = identity(element);
    const elementRegion = region(element);
    const elementRole = 'button';
    const guard = JSON.stringify([
      elementRole,
      label,
      '',
      null,
      null,
      element.getAttribute('aria-expanded'),
      elementRegion,
      normalize(element.parentElement?.textContent || '').slice(0, 1_000),
    ]);
    element.setAttribute('data-midscene-jev-id', id);
    element.setAttribute('data-midscene-jev-guard', guard);
    addAction({
      id,
      node: id,
      guard,
      kind: 'click',
      label,
      role: elementRole,
      currentValue: '',
      region: elementRegion,
      signature: signature('click', elementRole, label, elementRegion),
    });
  }

  const textRoot = activeLayer || document.body;
  const textParts: string[] = [];
  let textLength = 0;
  const walker = document.createTreeWalker(textRoot, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  while (textLength < maxPageTextLength) {
    const textNode = walker.nextNode();
    if (!textNode) break;
    const value = normalize(textNode.textContent || '');
    const parent = textNode.parentElement;
    if (
      !value ||
      !parent ||
      parent.closest('script,style,noscript,template') ||
      !rendered(parent)
    )
      continue;
    range.selectNodeContents(textNode);
    const rect = range.getBoundingClientRect();
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight &&
      rect.right > 0 &&
      rect.left < window.innerWidth
    ) {
      textParts.push(value);
      textLength += value.length;
    }
  }
  const text = textParts.join('\n').slice(0, maxPageTextLength);

  const alerts = Array.from(
    document.querySelectorAll(
      '[aria-live="assertive"],[aria-invalid="true"],[class*="message-error"],[class*="notification-error"],[class*="alert-error"],[class*="form-item-message"],[class*="form-message"][class*="error"]',
    ),
  )
    .filter((element) => rendered(element) && inViewport(element))
    .map((element) => name(element).slice(0, maxFieldValueLength))
    .filter(Boolean)
    .slice(0, 5);
  const workflowSteps = Array.from(
    document.querySelectorAll(
      '[aria-current="step"],[data-step],[class*="steps-item"],[class*="step-item"]',
    ),
  )
    .filter((element) => rendered(element))
    .filter(
      (element) =>
        !element.parentElement?.closest(
          '[aria-current="step"],[data-step],[class*="steps-item"],[class*="step-item"]',
        ),
    )
    .map((element, index) => ({
      index: index + 1,
      label: name(element).slice(0, maxLabelLength),
      status:
        element.getAttribute('aria-current') ||
        element.getAttribute('data-status') ||
        String(element.className)
          .match(/(?:finish|complete|process|wait|error|active|current)/giu)
          ?.join(',') ||
        '',
    }))
    .filter((step) => step.label)
    .slice(0, 20);
  const loading = Array.from(
    document.querySelectorAll(
      '[aria-busy="true"],[role="progressbar"],[class*="loading"],[class*="spinner"],[class*="skeleton"]',
    ),
  ).some((element) => rendered(element) && inViewport(element));

  const progressControls = Array.from(
    document.querySelectorAll('input,textarea,select,[contenteditable="true"]'),
  )
    .filter(
      (element) =>
        rendered(element) &&
        region(element) !== 'navigation' &&
        !activeLayer?.contains(element),
    )
    .map((element) => {
      const elementRole = role(element);
      const label = name(element);
      const value =
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
          ? element.value
          : element.textContent || '';
      const checked =
        element instanceof HTMLInputElement ? element.checked : undefined;
      return [elementRole, label, value, checked];
    })
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
  const headings = Array.from(
    document.querySelectorAll(
      'main h1,main h2,main h3,[role="main"] [role="heading"],form h1,form h2,form h3',
    ),
  )
    .filter((element) => rendered(element) && inViewport(element))
    .map((element) => name(element))
    .filter(Boolean)
    .slice(0, 20);
  const progressActions = actions
    .filter(
      (action) =>
        action.region !== 'navigation' &&
        action.kind !== 'wait' &&
        action.kind !== 'scroll',
    )
    .map((action) => [
      action.signature,
      action.currentValue,
      action.checked,
      action.selected,
      action.expanded,
    ])
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
  const progressMarker = JSON.stringify([
    location.origin,
    location.pathname,
    document.title,
    workflowSteps,
    progressControls,
    progressActions,
    headings,
    activeLayer
      ? [
          activeLayer.matches(explicitLayerSelector) ? 'dialog' : 'overlay',
          name(activeLayer),
        ]
      : null,
  ]);

  const height = document.documentElement.scrollHeight;
  if (!activeLayer && window.scrollY + window.innerHeight < height - 2)
    addAction({
      id: 'scroll_down',
      kind: 'scroll',
      label: 'Scroll down',
      delta: 560,
      region: 'content',
      signature: 'scroll|content|down',
    });
  if (!activeLayer && window.scrollY > 0)
    addAction({
      id: 'scroll_up',
      kind: 'scroll',
      label: 'Scroll up',
      delta: -560,
      region: 'content',
      signature: 'scroll|content|up',
    });
  if (activeLayer) {
    const closeControl = Array.from(
      activeLayer.querySelectorAll(
        'button[aria-label*="close" i],[role="button"][aria-label*="close" i],button[title*="close" i],[role="button"][title*="close" i],[class*="modal-close"],[class*="dialog-close"],[class*="drawer-close"]',
      ),
    ).find((element) => {
      if (!rendered(element) || !inViewport(element) || !unobscured(element))
        return false;
      const layerRect = activeLayer.getBoundingClientRect();
      const controlRect = element.getBoundingClientRect();
      return (
        controlRect.top < layerRect.top + Math.min(120, layerRect.height / 4) &&
        controlRect.right > layerRect.right - Math.min(160, layerRect.width / 4)
      );
    });
    addAction({
      id: 'dismiss_layer',
      ...(closeControl?.getAttribute('data-midscene-jev-id')
        ? { node: closeControl.getAttribute('data-midscene-jev-id') }
        : {}),
      ...(closeControl?.getAttribute('data-midscene-jev-guard')
        ? { guard: closeControl.getAttribute('data-midscene-jev-guard') }
        : {}),
      kind: 'dismiss',
      label: 'Dismiss the active dialog or overlay without accepting it',
      region: 'dialog',
      signature: `dismiss|${activeLayerId || 'layer'}`,
    });
  }
  addAction({
    id: 'wait',
    kind: 'wait',
    label: 'Wait for the page to update',
    region: activeLayer ? 'dialog' : 'content',
    signature: 'wait',
  });

  const marker = JSON.stringify([
    location.href,
    document.title,
    text,
    window.scrollY,
    activeLayerId,
    actions.map((action) => [
      action.id,
      action.currentValue,
      action.checked,
      action.selected,
      action.expanded,
    ]),
  ]);
  return {
    url: location.href,
    title: document.title,
    text,
    marker,
    progressMarker,
    actions,
    alerts,
    workflowSteps,
    ...(activeLayer
      ? {
          activeLayer: {
            kind: activeLayer.matches(explicitLayerSelector)
              ? 'dialog'
              : 'overlay',
            label: name(activeLayer).slice(0, maxLabelLength),
          },
        }
      : {}),
    loading,
    omittedActions: Math.max(0, discoveredActions - maxActions),
  };
}
