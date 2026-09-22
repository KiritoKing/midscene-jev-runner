// This function is serialized into each Playwright frame.  Do not import from it.
export function browserSnapshot(): unknown {
  if (!document.body) return null;
  const maxActions = 1000;
  const maxFacts = 1000;
  const maxLabel = 300;
  const maxText = 6000;
  type Cache = {
    ids: WeakMap<Element, number>;
    next: number;
    groupIds: WeakMap<Element, number>;
    nextGroup: number;
  };
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
    cache = {
      ids: new WeakMap(),
      next: 1,
      groupIds: new WeakMap(),
      nextGroup: 1,
    };
    win.__midsceneJevSnapshot = cache;
  }
  cache.groupIds ??= new WeakMap();
  cache.nextGroup ??= 1;
  const stableCache = cache;
  const id = (e: Element) => {
    let value = stableCache.ids.get(e);
    if (!value) {
      value = stableCache.next++;
      stableCache.ids.set(e, value);
    }
    return String(value);
  };
  const groupRef = (e: Element) => {
    let value = stableCache.groupIds.get(e);
    if (!value) {
      value = stableCache.nextGroup++;
      stableCache.groupIds.set(e, value);
    }
    return `group:${value}`;
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
        '[role="group"],fieldset,[class*="form-item" i],[class*="form-field" i],li,tr,[role="row"],[class*="card" i],section,article,form',
      ) || parent(e);
    if (!container) return undefined;
    const heading = container.querySelector(
      'h1,h2,h3,h4,h5,h6,[role="heading"]',
    );
    return (
      clean(heading?.textContent || container.textContent, 180) || undefined
    );
  };
  let textTruncated = false;
  const contentText = (root: Element): string => {
    const clone = root.cloneNode(true) as Element;
    for (const excluded of Array.from(
      clone.querySelectorAll(
        'script,style,template,noscript,[hidden],[aria-hidden="true"]',
      ),
    ))
      excluded.remove();
    const pieces: string[] = [];
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const value = (walker.currentNode.textContent || '').trim();
      if (value) pieces.push(value);
    }
    const normalized = pieces.join(' ').replace(/\s+/gu, ' ').trim();
    textTruncated ||= normalized.length > maxText;
    return normalized.slice(0, maxText);
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
  const stateControl = (e: Element): Element => {
    if (
      (e instanceof HTMLInputElement &&
        ['checkbox', 'radio'].includes(e.type)) ||
      e instanceof HTMLOptionElement ||
      [
        'checkbox',
        'radio',
        'switch',
        'option',
        'menuitemcheckbox',
        'menuitemradio',
      ].includes(role(e))
    )
      return e;
    if (
      !e.matches(
        'label,[role="option"],[role="menuitemcheckbox"],[role="menuitemradio"],[class*="checkbox" i],[class*="radio" i],[class*="switch" i]',
      )
    )
      return e;
    return (
      e.querySelector(
        'input[type="checkbox"],input[type="radio"],[role="checkbox"],[role="radio"],[role="switch"],[role="option"],[role="menuitemcheckbox"],[role="menuitemradio"]',
      ) || e
    );
  };
  const presentState = (e: Element, attribute: string): string | null =>
    e.hasAttribute(attribute) ? e.getAttribute(attribute) || 'true' : null;
  const checkedState = (e: Element): string | null => {
    if (e instanceof HTMLInputElement && ['checkbox', 'radio'].includes(e.type))
      return String(e.checked);
    const aria =
      e.getAttribute('aria-checked') || e.getAttribute('aria-pressed');
    if (aria !== null) return aria;
    const data = presentState(e, 'data-checked');
    if (data !== null) return data;
    return [
      'checkbox',
      'radio',
      'switch',
      'menuitemcheckbox',
      'menuitemradio',
    ].includes(role(e))
      ? e.getAttribute('data-state')
      : null;
  };
  const selectedState = (e: Element): string | null => {
    if (e instanceof HTMLOptionElement) return String(e.selected);
    const aria = e.getAttribute('aria-selected');
    if (aria !== null) return aria;
    const data = presentState(e, 'data-selected');
    if (data !== null) return data;
    return ['option', 'menuitemradio'].includes(role(e))
      ? e.getAttribute('data-state')
      : null;
  };
  const activeState = (value: string | null): boolean =>
    value !== null &&
    ['true', 'checked', 'selected', 'on', 'active'].includes(
      value.toLocaleLowerCase(),
    );
  const facts: Array<Record<string, unknown>> = [];
  const actions: Array<Record<string, unknown>> = [];
  let found = 0;
  let foundFacts = 0;
  const addAction = (action: Record<string, unknown>) => {
    found += 1;
    if (actions.length < maxActions) actions.push(action);
  };
  const sign = (
    kind: string,
    r: string,
    label: string,
    where: string,
    group: string,
    effect?: string,
  ) =>
    `${kind}|${where}|${group}|${r}|${clean(label).toLocaleLowerCase()}${effect ? `|${effect}` : ''}`;
  for (const e of all) {
    if (
      !eligible(e) ||
      (e instanceof HTMLInputElement &&
        ['password', 'file', 'hidden'].includes(e.type))
    )
      continue;
    foundFacts += 1;
    if (facts.length >= maxFacts) continue;
    const node = id(e);
    const named = name(e);
    const nativeRole = role(e);
    const state = stateControl(e);
    const stateRole = role(state);
    const r =
      state !== e &&
      [
        'checkbox',
        'radio',
        'switch',
        'option',
        'menuitemcheckbox',
        'menuitemradio',
      ].includes(stateRole)
        ? stateRole
        : getComputedStyle(e).cursor === 'pointer' &&
            !interactive.has(nativeRole)
          ? 'button'
          : nativeRole;
    const where = region(e);
    const current = value(e).slice(0, 500);
    const checked = checkedState(state);
    const selected = selectedState(state);
    const expanded = e.getAttribute('aria-expanded');
    const disabled =
      e.matches(':disabled,[aria-disabled="true"]') ||
      state.matches(':disabled,[aria-disabled="true"]') ||
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
      e.closest(
        '[role="group"],fieldset,[class*="form-item" i],[class*="form-field" i],li,tr,[role="row"],[class*="card" i],form',
      ) ||
      parent(e) ||
      e;
    const groupId = groupRef(group);
    const groupLabel = clean(
      group.getAttribute('aria-label') ||
        textOf(
          group.querySelector(
            ':scope > legend,:scope > label,:scope > [class*="label" i],:scope > [role="heading"]',
          ),
        ),
      180,
    );
    const layerPath = path(e);
    const context = localContext(e);
    const groupSignature = clean(groupLabel || context || groupId, 180);
    const effect =
      checked !== null || selected !== null
        ? activeState(checked ?? selected)
          ? 'deactivate'
          : 'activate'
        : undefined;
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
    const kind =
      e instanceof HTMLSelectElement
        ? 'select'
        : editable && !disabled
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
      ...(groupLabel ? { groupLabel } : {}),
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
      ...(groupLabel ? { groupLabel } : {}),
      layerPath,
      ...(context ? { localContext: context } : {}),
      nameSource: named.source,
      semanticConfidence: named.confidence,
      ...(effect ? { effect } : {}),
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
              groupSignature,
            ),
          });
      continue;
    }
    // Editable controls are observation facts for the caller's aiInput path.
    // This runner never synthesizes, replaces, or clears free-form text.
    if (editable) continue;
    const actionKind = 'click';
    addAction({
      id: node,
      ...base,
      kind: actionKind,
      label: named.label,
      signature: sign(
        actionKind,
        r,
        named.label,
        where,
        groupSignature,
        effect,
      ),
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
  const requiredPattern =
    /(?:\brequired\b|must\s+(?:be\s+)?(?:filled|provided|selected)|cannot\s+be\s+empty|必填|不能为空)/iu;
  const errorPattern =
    /(?:\binvalid\b|\berror\b|\bmust\s+(?:be\s+)?(?:filled|provided|selected)\b|cannot\s+be\s+empty|必填|不能为空|格式错误|无效)/iu;
  const controlSelector =
    'input:not([type="hidden"]),textarea,select,[contenteditable="true"],[role="textbox"],[role="combobox"],[role="checkbox"],[role="radio"]';
  const validations: Array<Record<string, unknown>> = [];
  const validationKeys = new Set<string>();
  for (const e of all) {
    if (!visible(e) || !viewport(e)) continue;
    const rawMessage = textOf(e);
    const fieldContainer = e.closest(
      '[role="group"],fieldset,[class*="form-item" i],[class*="form-field" i],li,tr,[role="row"]',
    );
    const container = fieldContainer || e.closest('form') || parent(e);
    const controls = e.matches(controlSelector)
      ? [e]
      : Array.from(container?.querySelectorAll(controlSelector) || []);
    const referencedControl = e.id
      ? controls.find((item) =>
          ['aria-errormessage', 'aria-describedby'].some((attribute) =>
            (item.getAttribute(attribute) || '').split(/\s+/u).includes(e.id),
          ),
        )
      : undefined;
    const control =
      (e.matches(controlSelector) ? e : undefined) ||
      referencedControl ||
      (controls.length === 1 ? controls[0] : undefined);
    const nativeInvalid =
      control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement ||
      control instanceof HTMLSelectElement
        ? !control.validity.valid
        : false;
    const ariaInvalid =
      control?.getAttribute('aria-invalid') === 'true' ||
      e.getAttribute('aria-invalid') === 'true';
    const explicitlyAssociated = Boolean(
      e.id &&
        control &&
        (control.getAttribute('aria-errormessage') || '')
          .split(/\s+/u)
          .includes(e.id),
    );
    // A class name, an alert role, or required-looking help text describes
    // presentation only. Report a validation issue only when the control is
    // observably invalid, or when an error message is explicitly associated
    // with that control.
    const explicitError = explicitlyAssociated && errorPattern.test(rawMessage);
    if (!nativeInvalid && !ariaInvalid && !explicitError) continue;
    const describedIds = clean(
      control?.getAttribute('aria-errormessage') ||
        control?.getAttribute('aria-describedby'),
    );
    const describedMessage = describedIds
      ? clean(
          describedIds
            .split(/\s+/u)
            .map((item) => textOf(document.getElementById(item)))
            .join(' '),
        )
      : '';
    const message =
      describedMessage ||
      rawMessage ||
      (ariaInvalid || nativeInvalid ? `${name(e).label} is invalid` : '');
    if (!message) continue;
    const labelElement = container?.querySelector(
      'legend,label,[class*="label" i],[data-label]',
    );
    const field = clean(
      (control ? name(control).label : '') || textOf(labelElement),
      180,
    );
    const validationGroup = container || control || e;
    const groupId = groupRef(validationGroup);
    const controlId = control ? id(control) : '';
    const key = `${groupId}|${controlId}|${field}|${message}`;
    if (validationKeys.has(key)) continue;
    validationKeys.add(key);
    validations.push({
      message,
      ...(field ? { field } : {}),
      groupId,
      ...(controlId ? { controlId } : {}),
      required:
        requiredPattern.test(message) ||
        control?.hasAttribute('required') === true ||
        control?.getAttribute('aria-required') === 'true',
    });
    if (validations.length >= 8) break;
  }
  const alerts = validations
    .map((item) => String(item.message || ''))
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
    .map((e) => [role(e), name(e).label, region(e), e.scrollTop, e.scrollLeft])
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
  const semanticFacts = facts
    .filter((fact) => fact.actionable)
    .map((fact) => [
      fact.role,
      clean(String(fact.label || ''), 160).toLocaleLowerCase(),
      fact.region,
      clean(String(fact.localContext || ''), 120).toLocaleLowerCase(),
      fact.currentValue,
      fact.checked,
      fact.selected,
      fact.expanded,
    ])
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
  const progressMarker = JSON.stringify([
    location.origin,
    location.pathname,
    document.title,
    workflowSteps,
    semanticFacts,
    clean(text.replace(/\b\d+(?:[.,:/-]\d+)*\b/gu, '#'), 1_200),
    scrollPositions,
    activeLayer ? [activeLayer.kind, activeLayer.label] : null,
    alerts,
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
    validations,
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
    omittedFacts: Math.max(0, foundFacts - facts.length),
    textTruncated,
  };
}
