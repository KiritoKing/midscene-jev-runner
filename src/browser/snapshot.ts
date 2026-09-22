// This function is serialized into each Playwright frame.  Do not import from it.
export function browserSnapshot(): unknown {
  if (!document.body) return null;
  const maxActions = 1000;
  const maxFacts = 1000;
  const maxLabel = 300;
  const maxText = 6000;
  type Cache = { ids: WeakMap<Element, number>; next: number };
  type Layer = {
    element: Element;
    id: string;
    kind: string;
    label: string;
    parentId?: string;
    blocking: boolean;
  };
  const win = window as unknown as Record<string, unknown>;
  let cache = win.__midsceneJevSnapshot as Cache | undefined;
  if (!cache) {
    cache = { ids: new WeakMap(), next: 1 };
    win.__midsceneJevSnapshot = cache;
  }
  const stableCache = cache;
  const id = (e: Element) => {
    let value = stableCache.ids.get(e);
    if (!value) {
      value = stableCache.next++;
      stableCache.ids.set(e, value);
    }
    return String(value);
  };
  const clean = (value: string | null | undefined, length = maxLabel) =>
    (value || '').replace(/\s+/gu, ' ').trim().slice(0, length);
  const parent = (e: Element | null): Element | null =>
    !e
      ? null
      : e.parentElement ||
        (e.getRootNode() instanceof ShadowRoot
          ? (e.getRootNode() as ShadowRoot).host
          : null);
  const hasAncestor = (e: Element, check: (item: Element) => boolean) => {
    let item: Element | null = e;
    while (item) {
      if (check(item)) return true;
      item = parent(item);
    }
    return false;
  };
  const visible = (e: Element) => {
    const box = e.getBoundingClientRect();
    const style = getComputedStyle(e);
    return (
      box.width > 0 &&
      box.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      !hasAncestor(
        e,
        (item) =>
          item.getAttribute('aria-hidden') === 'true' ||
          item.hasAttribute('inert'),
      )
    );
  };
  const viewport = (e: Element) => {
    const box = e.getBoundingClientRect();
    return (
      box.bottom > 0 &&
      box.right > 0 &&
      box.top < innerHeight &&
      box.left < innerWidth
    );
  };
  const uncovered = (e: Element) => {
    const box = e.getBoundingClientRect();
    const left = Math.max(0, box.left);
    const right = Math.min(innerWidth, box.right);
    const top = Math.max(0, box.top);
    const bottom = Math.min(innerHeight, box.bottom);
    const belongs = (hit: Element | null) => {
      let item: Element | null = e;
      while (item) {
        if (item === hit || Boolean(hit && item.contains(hit))) return true;
        const root = item.getRootNode();
        item = root instanceof ShadowRoot ? root.host : null;
      }
      return false;
    };
    if (right <= left || bottom <= top) return false;
    return [
      [(left + right) / 2, (top + bottom) / 2],
      [left + 1, top + 1],
      [right - 1, bottom - 1],
    ].some(([x, y]) => belongs(document.elementFromPoint(x, y)));
  };
  const role = (e: Element) => {
    const explicit = e.getAttribute('role');
    if (explicit) return explicit;
    if (e instanceof HTMLButtonElement) return 'button';
    if (e instanceof HTMLAnchorElement) return 'link';
    if (e instanceof HTMLSelectElement) return 'combobox';
    if (e instanceof HTMLTextAreaElement) return 'textbox';
    if (e instanceof HTMLInputElement) {
      if (['button', 'submit', 'reset', 'image'].includes(e.type))
        return 'button';
      if (['checkbox', 'radio'].includes(e.type)) return e.type;
      if (e.type === 'search') return 'searchbox';
      if (e.type === 'number') return 'spinbutton';
      return 'textbox';
    }
    return e.tagName.toLowerCase();
  };
  const all: Element[] = [];
  const visit = (root: ParentNode): void => {
    for (const child of Array.from(root.children)) {
      all.push(child);
      visit(child);
      if (child.shadowRoot?.mode === 'open') visit(child.shadowRoot);
    }
  };
  visit(document);
  const textOf = (e: Element | null | undefined) => clean(e?.textContent);
  const name = (
    e: Element,
  ): { label: string; source: string; confidence: number } => {
    const aria = clean(e.getAttribute('aria-label'));
    if (aria) return { label: aria, source: 'aria', confidence: 1 };
    const ids = clean(e.getAttribute('aria-labelledby'));
    if (ids) {
      const root = e.getRootNode();
      const labelledElement = (item: string): Element | null =>
        root instanceof Document || root instanceof ShadowRoot
          ? root.getElementById(item)
          : document.getElementById(item);
      const label = clean(
        ids
          .split(/\s+/u)
          .map((item) => textOf(labelledElement(item)))
          .join(' '),
      );
      if (label) return { label, source: 'aria', confidence: 0.96 };
    }
    if (
      e instanceof HTMLInputElement ||
      e instanceof HTMLSelectElement ||
      e instanceof HTMLTextAreaElement
    ) {
      const label = clean(
        Array.from(e.labels || [])
          .map(textOf)
          .join(' '),
      );
      if (label) return { label, source: 'native-label', confidence: 0.94 };
    }
    for (const attribute of ['placeholder', 'title', 'alt', 'data-label']) {
      const label = clean(e.getAttribute(attribute));
      if (label) return { label, source: 'attribute', confidence: 0.82 };
    }
    const content = textOf(e);
    if (content) return { label: content, source: 'content', confidence: 0.72 };
    let item = parent(e);
    for (let depth = 0; item && depth < 4; depth += 1, item = parent(item)) {
      const label = clean(
        textOf(item.querySelector('label,[class*="label"]')) ||
          textOf(item.previousElementSibling),
      );
      if (label) return { label, source: 'nearby', confidence: 0.45 };
    }
    return { label: role(e), source: 'inferred', confidence: 0.2 };
  };
  const localContext = (e: Element): string | undefined => {
    const container =
      e.closest(
        'form,fieldset,section,article,[role="row"],[class*="card" i]',
      ) || parent(e);
    if (!container) return undefined;
    const heading = container.querySelector(
      'h1,h2,h3,h4,h5,h6,[role="heading"]',
    );
    return (
      clean(heading?.textContent || container.textContent, 180) || undefined
    );
  };
  const contentText = (root: Element): string => {
    const clone = root.cloneNode(true) as Element;
    for (const excluded of Array.from(
      clone.querySelectorAll(
        'script,style,template,noscript,[hidden],[aria-hidden="true"]',
      ),
    ))
      excluded.remove();
    return clean(clone.textContent, maxText);
  };
  const escapeCss = (value: string) =>
    CSS.escape
      ? CSS.escape(value)
      : value.replace(/[^a-zA-Z0-9_-]/gu, (item) => `\\${item}`);
  const selector = (e: Element) => {
    const parts: string[] = [];
    let cursor: Element | null = e;
    while (cursor) {
      const chain: string[] = [];
      let within: Element | null = cursor;
      while (within) {
        const siblings = within.parentElement
          ? Array.from(within.parentElement.children).filter(
              (item) => item.tagName === within?.tagName,
            )
          : [within];
        chain.unshift(
          within.id
            ? `#${escapeCss(within.id)}`
            : `${within.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(within) + 1})`,
        );
        within = within.parentElement;
      }
      parts.unshift(chain.join(' > '));
      const root = cursor.getRootNode();
      cursor = root instanceof ShadowRoot ? root.host : null;
    }
    return `css=${parts.join(' >> css=')}`;
  };
  const layerKind = (e: Element): string | undefined => {
    const explicit = e.getAttribute('role');
    if (
      e instanceof HTMLDialogElement ||
      explicit === 'dialog' ||
      e.getAttribute('aria-modal') === 'true'
    )
      return 'dialog';
    if (explicit === 'menu' || explicit === 'listbox') return explicit;
    if (e.hasAttribute('popover')) return 'popover';
    return /(?:overlay|modal|drawer|backdrop)/iu.test(
      typeof e.className === 'string' ? e.className : '',
    )
      ? 'overlay'
      : undefined;
  };
  const layersByElement = new Map<Element, Layer>();
  for (const e of all) {
    const kind = layerKind(e);
    if (kind && visible(e) && viewport(e))
      layersByElement.set(e, {
        element: e,
        id: `layer-${id(e)}`,
        kind,
        label: name(e).label,
        blocking: true,
      });
  }
  const nearestLayer = (e: Element | null): Layer | undefined => {
    let item = e;
    while (item) {
      const result = layersByElement.get(item);
      if (result) return result;
      item = parent(item);
    }
    return undefined;
  };
  for (const layer of layersByElement.values()) {
    const target = layer.element.id;
    const trigger = target
      ? all.find((e) =>
          ['aria-controls', 'aria-owns'].some((attribute) =>
            clean(e.getAttribute(attribute)).split(/\s+/u).includes(target),
          ),
        )
      : undefined;
    layer.parentId =
      nearestLayer(parent(layer.element))?.id ||
      nearestLayer(trigger || null)?.id ||
      'page';
  }
  const layers = [...layersByElement.values()].sort(
    (a, b) =>
      (Number.parseInt(getComputedStyle(a.element).zIndex, 10) || 0) -
        (Number.parseInt(getComputedStyle(b.element).zIndex, 10) || 0) ||
      (a.element.compareDocumentPosition(b.element) &
      Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1),
  );
  const activeLayer = layers.at(-1);
  const path = (e: Element) => {
    const output = ['page'];
    const seen = new Set<string>();
    let layer = nearestLayer(e);
    while (layer && !seen.has(layer.id)) {
      seen.add(layer.id);
      output.splice(1, 0, layer.id);
      layer = layer.parentId
        ? layers.find((item) => item.id === layer?.parentId)
        : undefined;
    }
    return output;
  };
  const region = (e: Element): 'dialog' | 'main' | 'navigation' | 'content' =>
    nearestLayer(e)
      ? 'dialog'
      : hasAncestor(
            e,
            (item) =>
              /^(HEADER|NAV)$/u.test(item.tagName) ||
              item.getAttribute('role') === 'navigation' ||
              /(?:header|nav|sidebar|topbar)/iu.test(
                typeof item.className === 'string' ? item.className : '',
              ),
          )
        ? 'navigation'
        : hasAncestor(
              e,
              (item) =>
                /^(MAIN|FORM)$/u.test(item.tagName) ||
                item.getAttribute('role') === 'main',
            )
          ? 'main'
          : 'content';
  const interactive = new Set([
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
  ]);
  const eligible = (e: Element) =>
    e.matches(
      'a[href],button,input,textarea,select,summary,[contenteditable="true"],[aria-haspopup],[onclick]',
    ) ||
    interactive.has(role(e)) ||
    getComputedStyle(e).cursor === 'pointer';
  const value = (e: Element) =>
    e instanceof HTMLInputElement ||
    e instanceof HTMLTextAreaElement ||
    e instanceof HTMLSelectElement
      ? e.value
      : e.getAttribute('contenteditable') === 'true'
        ? e.textContent || ''
        : '';
  const facts: Array<Record<string, unknown>> = [];
  const actions: Array<Record<string, unknown>> = [];
  let found = 0;
  const addAction = (action: Record<string, unknown>) => {
    found += 1;
    if (actions.length < maxActions) actions.push(action);
  };
  const sign = (kind: string, r: string, label: string, where: string) =>
    `${kind}|${where}|${r}|${clean(label).toLocaleLowerCase()}`;
  for (const e of all) {
    if (
      !eligible(e) ||
      facts.length >= maxFacts ||
      (e instanceof HTMLInputElement &&
        ['password', 'file', 'hidden'].includes(e.type))
    )
      continue;
    const node = id(e);
    const named = name(e);
    const nativeRole = role(e);
    const r =
      getComputedStyle(e).cursor === 'pointer' && !interactive.has(nativeRole)
        ? 'button'
        : nativeRole;
    const where = region(e);
    const current = value(e).slice(0, 500);
    const checked =
      e instanceof HTMLInputElement && ['checkbox', 'radio'].includes(e.type)
        ? String(e.checked)
        : e.getAttribute('aria-checked');
    const selected = e.getAttribute('aria-selected');
    const expanded = e.getAttribute('aria-expanded');
    const disabled =
      e.matches(':disabled,[aria-disabled="true"]') ||
      e.getAttribute('aria-readonly') === 'true';
    const isVisible = visible(e) && viewport(e);
    const covered = isVisible && !uncovered(e);
    const inTop =
      !activeLayer ||
      activeLayer.element.contains(e) ||
      (e.getRootNode() instanceof ShadowRoot &&
        activeLayer.element.contains((e.getRootNode() as ShadowRoot).host));
    const actionable = isVisible && !covered && !disabled && inTop;
    const group =
      e.closest('form,[role="group"],fieldset,li,tr,[role="row"]') ||
      parent(e) ||
      e;
    const groupId = group === e ? node : `group:${selector(group)}`;
    const layerPath = path(e);
    const context = localContext(e);
    const score = Math.round(
      named.confidence * 50 +
        (actionable ? 30 : 0) +
        (where === 'dialog' ? 12 : where === 'main' ? 7 : 0),
    );
    const guard = JSON.stringify([
      r,
      named.label,
      current,
      checked,
      selected,
      expanded,
      where,
      clean(group.textContent, 1000),
    ]);
    e.setAttribute('data-midscene-jev-id', node);
    e.setAttribute('data-midscene-jev-guard', guard);
    const kind =
      e instanceof HTMLSelectElement
        ? 'select'
        : (e instanceof HTMLInputElement ||
              e instanceof HTMLTextAreaElement ||
              e.getAttribute('contenteditable') === 'true') &&
            !disabled
          ? 'fill'
          : 'click';
    facts.push({
      id: node,
      label: named.label,
      role: r,
      kind,
      currentValue: current,
      ...(checked !== null ? { checked } : {}),
      ...(selected !== null ? { selected } : {}),
      ...(expanded !== null ? { expanded } : {}),
      region: where,
      groupId,
      layerPath,
      ...(context ? { localContext: context } : {}),
      nameSource: named.source,
      semanticConfidence: named.confidence,
      visible: isVisible,
      actionable,
      covered,
      disabled,
      score,
    });
    if (!actionable) continue;
    const base = {
      node,
      guard,
      role: r,
      currentValue: current,
      ...(checked !== null ? { checked } : {}),
      ...(selected !== null ? { selected } : {}),
      ...(expanded !== null ? { expanded } : {}),
      region: where,
      groupId,
      layerPath,
      ...(context ? { localContext: context } : {}),
      nameSource: named.source,
      semanticConfidence: named.confidence,
      selector: selector(e),
      score,
    };
    if (e instanceof HTMLSelectElement) {
      for (const option of Array.from(e.options))
        if (!option.disabled && !option.selected)
          addAction({
            id: `${node}:${option.value}`,
            ...base,
            kind: 'select',
            label: `${named.label} → ${clean(option.text)}`,
            value: option.value,
            signature: sign(
              'select',
              r,
              `${named.label} → ${option.text}`,
              where,
            ),
          });
      continue;
    }
    const editable =
      !(
        (e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement) &&
        e.readOnly
      ) &&
      e.getAttribute('aria-readonly') !== 'true' &&
      (e instanceof HTMLTextAreaElement ||
        (e instanceof HTMLInputElement &&
          !['button', 'submit', 'reset', 'checkbox', 'radio'].includes(
            e.type,
          )) ||
        e.getAttribute('contenteditable') === 'true');
    const actionKind = editable ? 'fill' : 'click';
    addAction({
      id: node,
      ...base,
      kind: actionKind,
      label: named.label,
      signature: sign(actionKind, r, named.label, where),
    });
    if (editable && current)
      addAction({
        id: `${node}:clear`,
        ...base,
        kind: 'clear',
        label: `Clear ${named.label}`,
        signature: sign('clear', r, named.label, where),
      });
  }
  for (const e of all) {
    const style = getComputedStyle(e);
    const scrollable =
      visible(e) &&
      viewport(e) &&
      (/(auto|scroll)/u.test(style.overflowY) ||
        /(auto|scroll)/u.test(style.overflowX)) &&
      (e.scrollHeight > e.clientHeight + 2 ||
        e.scrollWidth > e.clientWidth + 2);
    if (!scrollable || (activeLayer && !activeLayer.element.contains(e)))
      continue;
    const node = id(e);
    const named = name(e);
    const where = region(e);
    const layerPath = path(e);
    const context = localContext(e);
    const score = 35 + (where === 'dialog' ? 10 : 0);
    facts.push({
      id: `scroll:${node}`,
      label: `Scroll ${named.label}`,
      role: 'region',
      kind: 'scroll',
      region: where,
      groupId: node,
      layerPath,
      ...(context ? { localContext: context } : {}),
      nameSource: named.source,
      semanticConfidence: named.confidence,
      visible: true,
      actionable: true,
      covered: false,
      disabled: false,
      score,
    });
    if (e.scrollTop + e.clientHeight < e.scrollHeight - 2)
      addAction({
        id: `scroll:${node}:down`,
        node,
        kind: 'scroll',
        label: `Scroll ${named.label} down`,
        delta: 640,
        region: where,
        groupId: node,
        layerPath,
        ...(context ? { localContext: context } : {}),
        nameSource: named.source,
        semanticConfidence: named.confidence,
        selector: selector(e),
        score,
        signature: `scroll|${node}|down`,
      });
    if (e.scrollTop > 0)
      addAction({
        id: `scroll:${node}:up`,
        node,
        kind: 'scroll',
        label: `Scroll ${named.label} up`,
        delta: -640,
        region: where,
        groupId: node,
        layerPath,
        ...(context ? { localContext: context } : {}),
        nameSource: named.source,
        semanticConfidence: named.confidence,
        selector: selector(e),
        score,
        signature: `scroll|${node}|up`,
      });
  }
  const text = contentText(activeLayer?.element || document.body);
  const alerts = all
    .filter(
      (e) =>
        e.matches(
          '[aria-live="assertive"],[aria-invalid="true"],[class*="message-error"],[class*="notification-error"],[class*="alert-error"],[class*="form-item-message"],[class*="form-message"][class*="error"]',
        ) &&
        visible(e) &&
        viewport(e),
    )
    .map((e) => name(e).label)
    .filter(Boolean)
    .slice(0, 5);
  const workflowSteps = all
    .filter(
      (e) =>
        e.matches(
          '[aria-current="step"],[data-step],[class*="steps-item"],[class*="step-item"]',
        ) && visible(e),
    )
    .map((e, index) => ({
      index: index + 1,
      label: name(e).label,
      status:
        e.getAttribute('aria-current') || e.getAttribute('data-status') || '',
    }))
    .filter((step) => step.label)
    .slice(0, 20);
  const loading = all.some(
    (e) =>
      e.matches(
        '[aria-busy="true"],[role="progressbar"],[class*="loading"],[class*="spinner"],[class*="skeleton"]',
      ) &&
      visible(e) &&
      viewport(e),
  );
  if (
    !activeLayer &&
    scrollY + innerHeight < document.documentElement.scrollHeight - 2
  )
    addAction({
      id: 'scroll_down',
      kind: 'scroll',
      label: 'Scroll down',
      delta: 560,
      region: 'content',
      score: 20,
      signature: 'scroll|content|down',
    });
  if (!activeLayer && scrollY > 0)
    addAction({
      id: 'scroll_up',
      kind: 'scroll',
      label: 'Scroll up',
      delta: -560,
      region: 'content',
      score: 20,
      signature: 'scroll|content|up',
    });
  const close = activeLayer
    ? all.find(
        (e) =>
          activeLayer.element.contains(e) &&
          e.matches(
            'button[aria-label*="close" i],[role="button"][aria-label*="close" i],button[title*="close" i],[role="button"][title*="close" i],[class*="modal-close"],[class*="dialog-close"],[class*="drawer-close"]',
          ) &&
          visible(e) &&
          viewport(e) &&
          uncovered(e),
      )
    : undefined;
  if (activeLayer)
    addAction({
      id: 'dismiss_layer',
      ...(close?.getAttribute('data-midscene-jev-id')
        ? { node: close.getAttribute('data-midscene-jev-id') }
        : {}),
      ...(close?.getAttribute('data-midscene-jev-guard')
        ? { guard: close.getAttribute('data-midscene-jev-guard') }
        : {}),
      kind: 'dismiss',
      label: 'Dismiss the active dialog or overlay without accepting it',
      region: 'dialog',
      layerPath: ['page', activeLayer.id],
      score: 80,
      signature: `dismiss|${activeLayer.id}`,
    });
  if (loading)
    addAction({
      id: 'wait',
      kind: 'wait',
      label: 'Wait for the page to update',
      region: activeLayer ? 'dialog' : 'content',
      score: 1,
      signature: 'wait',
    });
  const scrollPositions = all
    .filter(
      (e) =>
        e.scrollHeight > e.clientHeight + 2 ||
        e.scrollWidth > e.clientWidth + 2,
    )
    .map((e) => [id(e), e.scrollTop, e.scrollLeft]);
  const progressMarker = JSON.stringify([
    location.origin,
    location.pathname,
    document.title,
    workflowSteps,
    facts
      .filter((fact) => fact.actionable)
      .map((fact) => [
        fact.id,
        fact.currentValue,
        fact.checked,
        fact.selected,
        fact.expanded,
      ]),
    scrollPositions,
    activeLayer?.id || null,
  ]);
  const marker = JSON.stringify([
    location.href,
    document.title,
    text,
    scrollY,
    activeLayer?.id || null,
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
    facts,
    layers: [
      {
        id: 'page',
        kind: 'page',
        label: document.title || 'Page',
        blocking: false,
      },
      ...layers.map(({ id: layerId, kind, label, parentId, blocking }) => ({
        id: layerId,
        kind,
        label,
        ...(parentId ? { parentId } : {}),
        blocking,
      })),
    ],
    alerts,
    workflowSteps,
    ...(activeLayer
      ? {
          activeLayer: {
            kind: activeLayer.kind === 'dialog' ? 'dialog' : 'overlay',
            label: activeLayer.label,
          },
        }
      : {}),
    loading,
    omittedActions: Math.max(0, found - maxActions),
  };
}
