(() => {
  if (window.__vibeMarkContentLoaded) return;
  window.__vibeMarkContentLoaded = true;

  const NS = "http://www.w3.org/2000/svg";
  const COLORS = ["#ef3f4f", "#ffd43b", "#20c997", "#228be6", "#ffffff", "#111318"];
  const TOOL_LABELS = {
    select: "选择元素并查看坐标/尺寸",
    rect: "矩形；按 Shift 画正方形",
    ellipse: "圆形；按 Shift 画正圆",
    line: "直线；按 Shift 吸附水平/垂直",
    arrow: "箭头；按 Shift 吸附水平/垂直",
    pen: "画笔",
    text: "文字"
  };

  const state = {
    active: false,
    tool: "rect",
    color: COLORS[0],
    strokeWidth: 3,
    annotations: [],
    drawing: null,
    moving: null,
    hoverElement: null,
    pinnedInspect: null,
    selectedId: null,
    toolbarDrag: null,
    hudDrag: null,
    panelDrag: null,
    panelOpen: false,
    lastPoint: { x: 0, y: 0 }
  };

  let root;
  let canvas;
  let svg;
  let toolbar;
  let panel;
  let hud;
  let cursorTip;
  let tag;
  let notePopover;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "VIBEMARK_TOGGLE") {
      toggle();
      sendResponse({ ok: true });
    }
    if (message?.type === "VIBEMARK_CLEAR") {
      clearAnnotations();
      sendResponse({ ok: true });
    }
    if (message?.type === "VIBEMARK_COPY_EXPORT") {
      copyExport().then(() => sendResponse({ ok: true })).catch((error) => {
        sendResponse({ ok: false, error: error.message });
      });
      return true;
    }
  });

  function toggle(force) {
    state.active = typeof force === "boolean" ? force : !state.active;
    if (state.active) mount();
    else unmount();
  }

  function mount() {
    if (!root) buildUI();
    document.documentElement.appendChild(root);
    document.addEventListener("keydown", onKeyDown, true);
    updateCanvasMode();
    updateHud();
    render();
  }

  function unmount() {
    notePopover?.remove();
    notePopover = null;
    root?.remove();
    document.removeEventListener("keydown", onKeyDown, true);
  }

  function buildUI() {
    root = document.createElement("div");
    root.id = "vibemark-root";

    canvas = document.createElement("div");
    canvas.className = "vm-canvas";
    canvas.addEventListener("pointerdown", onPointerDown, true);
    canvas.addEventListener("pointermove", onPointerMove, true);
    canvas.addEventListener("pointerup", onPointerUp, true);
    canvas.addEventListener("pointerleave", onPointerLeave, true);

    svg = document.createElementNS(NS, "svg");
    svg.classList.add("vm-layer");

    hud = document.createElement("div");
    hud.className = "vm-hud";
    hud.title = "拖动移动坐标面板";
    hud.addEventListener("pointerdown", startHudDrag);

    cursorTip = document.createElement("div");
    cursorTip.className = "vm-cursor-tip";
    cursorTip.hidden = true;

    tag = document.createElement("div");
    tag.className = "vm-element-tag";
    tag.hidden = true;

    toolbar = buildToolbar();
    panel = buildPanel();
    panel.hidden = true;
    root.append(canvas, svg, hud, cursorTip, tag, toolbar, panel);
  }

  function buildToolbar() {
    const bar = document.createElement("div");
    bar.className = "vm-toolbar";

    const drag = document.createElement("div");
    drag.className = "vm-drag";
    drag.textContent = "::";
    drag.title = "拖动移动工具栏";
    drag.addEventListener("pointerdown", startToolbarDrag);
    bar.append(drag);

    [
      ["select", "pointer"],
      ["rect", "rect"],
      ["ellipse", "ellipse"],
      ["line", "line"],
      ["arrow", "arrow"],
      ["pen", "pen"],
      ["text", "text"]
    ].forEach(([tool, icon]) => {
      const button = document.createElement("button");
      button.className = "vm-btn";
      button.dataset.tool = tool;
      button.title = TOOL_LABELS[tool];
      button.innerHTML = iconSvg(icon);
      button.setAttribute("aria-label", TOOL_LABELS[tool]);
      button.addEventListener("click", () => setTool(tool));
      bar.append(button);
    });

    bar.append(divider());

    COLORS.forEach((color) => {
      const button = document.createElement("button");
      button.className = "vm-color";
      button.style.background = color;
      if (color === "#ffffff") button.classList.add("vm-light-color");
      button.title = color;
      button.dataset.color = color;
      button.setAttribute("aria-label", color);
      button.addEventListener("click", () => {
        state.color = color;
        updateToolbar();
      });
      bar.append(button);
    });

    const slider = document.createElement("input");
    slider.className = "vm-slider";
    slider.type = "range";
    slider.min = "1";
    slider.max = "12";
    slider.value = String(state.strokeWidth);
    slider.title = "线条粗细";
    slider.addEventListener("input", () => {
      state.strokeWidth = Number(slider.value);
    });
    bar.append(slider);

    bar.append(divider());

    const details = button("Panel", "显示/隐藏详情面板", togglePanel);
    const copy = button("Copy", "复制给 AI 的坐标和修改说明", () => copyExport());
    const shot = button("Shot", "下载带标注截图", () => downloadScreenshot());
    const clear = button("Clear", "清空所有标注", clearAnnotations);
    const close = button("X", "关闭标注层", () => toggle(false));
    bar.append(details, copy, shot, clear, close);

    updateToolbar();
    return bar;
  }

  function buildPanel() {
    const panelEl = document.createElement("aside");
    panelEl.className = "vm-panel";
    panelEl.innerHTML = `
      <div class="vm-panel-head">
        <h2>VibeMark</h2>
        <button type="button" data-action="close" aria-label="关闭详情面板">X</button>
      </div>
      <div class="vm-stat" data-role="stats"></div>
      <div class="vm-list" data-role="list"></div>
    `;
    const head = panelEl.querySelector(".vm-panel-head");
    const close = panelEl.querySelector('[data-action="close"]');
    head.addEventListener("pointerdown", startPanelDrag);
    close.addEventListener("pointerdown", (event) => event.stopPropagation());
    close.addEventListener("click", togglePanel);
    return panelEl;
  }

  function button(text, title, onClick) {
    const btn = document.createElement("button");
    btn.className = "vm-btn";
    btn.textContent = text;
    btn.title = title;
    btn.addEventListener("click", onClick);
    return btn;
  }

  function iconSvg(name) {
    const common = 'width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const icons = {
      pointer: `<svg ${common}><path d="M5 3l12 12-5 1.2 3 5.2-2.8 1.6-3-5.2-3.7 3z"/></svg>`,
      rect: `<svg ${common}><rect x="4" y="6" width="16" height="12" rx="1"/></svg>`,
      ellipse: `<svg ${common}><circle cx="12" cy="12" r="7"/></svg>`,
      line: `<svg ${common}><path d="M5 19L19 5"/></svg>`,
      arrow: `<svg ${common}><path d="M5 19L19 5"/><path d="M10 5h9v9"/></svg>`,
      pen: `<svg ${common}><path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/><path d="M13.5 6.5l4 4"/></svg>`,
      callout: `<svg ${common}><circle cx="12" cy="12" r="8"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>`,
      text: `<svg ${common}><path d="M5 6h14"/><path d="M12 6v12"/><path d="M9 18h6"/></svg>`
    };
    return icons[name] || "";
  }

  function divider() {
    const div = document.createElement("div");
    div.className = "vm-divider";
    return div;
  }

  function setTool(tool) {
    state.tool = tool;
    updateToolbar();
    updateCanvasMode();
  }

  function updateToolbar() {
    if (!toolbar) return;
    toolbar.querySelectorAll("[data-tool]").forEach((button) => {
      button.classList.toggle("vm-active", button.dataset.tool === state.tool);
    });
    toolbar.querySelectorAll("[data-color]").forEach((button) => {
      button.classList.toggle("vm-active", button.dataset.color === state.color);
    });
  }

  function togglePanel() {
    state.panelOpen = !state.panelOpen;
    if (!panel) return;
    panel.hidden = !state.panelOpen;
    if (state.panelOpen) updatePanel();
  }

  function updateCanvasMode() {
    canvas?.classList.toggle("vm-select-mode", state.tool === "select");
  }

  function startToolbarDrag(event) {
    event.preventDefault();
    event.stopPropagation();
    state.toolbarDrag = {
      offsetX: event.clientX - toolbar.offsetLeft,
      offsetY: event.clientY - toolbar.offsetTop
    };
    window.addEventListener("pointermove", dragToolbar, true);
    window.addEventListener("pointerup", stopToolbarDrag, true);
  }

  function dragToolbar(event) {
    if (!state.toolbarDrag) return;
    toolbar.style.left = `${clamp(event.clientX - state.toolbarDrag.offsetX, 8, window.innerWidth - toolbar.offsetWidth - 8)}px`;
    toolbar.style.top = `${clamp(event.clientY - state.toolbarDrag.offsetY, 8, window.innerHeight - toolbar.offsetHeight - 8)}px`;
  }

  function stopToolbarDrag() {
    state.toolbarDrag = null;
    window.removeEventListener("pointermove", dragToolbar, true);
    window.removeEventListener("pointerup", stopToolbarDrag, true);
  }

  function startHudDrag(event) {
    event.preventDefault();
    event.stopPropagation();
    state.hudDrag = {
      offsetX: event.clientX - hud.offsetLeft,
      offsetY: event.clientY - hud.offsetTop
    };
    window.addEventListener("pointermove", dragHud, true);
    window.addEventListener("pointerup", stopHudDrag, true);
  }

  function dragHud(event) {
    if (!state.hudDrag) return;
    hud.style.left = `${clamp(event.clientX - state.hudDrag.offsetX, 8, window.innerWidth - hud.offsetWidth - 8)}px`;
    hud.style.top = `${clamp(event.clientY - state.hudDrag.offsetY, 8, window.innerHeight - hud.offsetHeight - 8)}px`;
  }

  function stopHudDrag() {
    state.hudDrag = null;
    window.removeEventListener("pointermove", dragHud, true);
    window.removeEventListener("pointerup", stopHudDrag, true);
  }

  function startPanelDrag(event) {
    event.preventDefault();
    event.stopPropagation();
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.right = "auto";
    state.panelDrag = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    window.addEventListener("pointermove", dragPanel, true);
    window.addEventListener("pointerup", stopPanelDrag, true);
  }

  function dragPanel(event) {
    if (!state.panelDrag) return;
    panel.style.left = `${clamp(event.clientX - state.panelDrag.offsetX, 8, window.innerWidth - panel.offsetWidth - 8)}px`;
    panel.style.top = `${clamp(event.clientY - state.panelDrag.offsetY, 8, window.innerHeight - panel.offsetHeight - 8)}px`;
  }

  function stopPanelDrag() {
    state.panelDrag = null;
    window.removeEventListener("pointermove", dragPanel, true);
    window.removeEventListener("pointerup", stopPanelDrag, true);
  }

  function onPointerDown(event) {
    if (isChrome(event.target)) return;
    event.preventDefault();
    event.stopPropagation();

    const point = toPoint(event);
    state.lastPoint = point;

    if (state.tool === "select") {
      const hit = hitAnnotation(point);
      state.selectedId = hit?.id || null;
      if (hit) {
        state.moving = { id: hit.id, last: point };
        render();
        return;
      }
      captureHoverElement(point);
      pinInspect(point);
      render();
      flashStatus("Pinned. Press Command+C to copy");
      return;
    }

    const targetElement = elementAtPoint(point);
    const base = {
      id: crypto.randomUUID(),
      type: state.tool,
      color: state.color,
      strokeWidth: state.strokeWidth,
      note: "",
      selector: targetElement ? getSelector(targetElement) : null,
      elementBox: targetElement ? rectToBox(targetElement.getBoundingClientRect()) : null,
      page: pageMeta(),
      createdAt: new Date().toISOString()
    };

    if (state.tool === "text") {
      showNotePopover(point, { ...base, box: pointBox(point) }, true);
      return;
    }

    if (state.tool === "callout") {
      const count = state.annotations.filter((item) => item.type === "callout").length + 1;
      showNotePopover(point, { ...base, label: String(count), box: pointBox(point) }, true);
      return;
    }

    state.drawing = {
      annotation: { ...base, box: pointBox(point), start: point, end: point, points: [point] },
      start: point
    };
    render();
  }

  function onPointerMove(event) {
    if (isChrome(event.target)) return;
    const rawPoint = toPoint(event);
    state.lastPoint = rawPoint;

    if (state.moving) {
      event.preventDefault();
      event.stopPropagation();
      const dx = rawPoint.x - state.moving.last.x;
      const dy = rawPoint.y - state.moving.last.y;
      moveAnnotation(state.moving.id, dx, dy);
      state.moving.last = rawPoint;
      render();
      return;
    }

    if (state.drawing) {
      event.preventDefault();
      event.stopPropagation();
      const annotation = state.drawing.annotation;
      const point = constrainPoint(state.drawing.start, rawPoint, annotation.type, event.shiftKey);
      if (annotation.type === "pen") annotation.points.push(point);
      annotation.end = point;
      annotation.box = annotation.type === "pen" ? boxFromPointsList(annotation.points) : boxFromPoints(state.drawing.start, point);
      render();
    } else {
      captureHoverElement(rawPoint);
      updateHud();
    }
  }

  function onPointerUp(event) {
    if (state.moving) {
      event.preventDefault();
      event.stopPropagation();
      state.moving = null;
      render();
      return;
    }
    if (!state.drawing) return;
    event.preventDefault();
    event.stopPropagation();
    const annotation = state.drawing.annotation;
    const point = constrainPoint(state.drawing.start, toPoint(event), annotation.type, event.shiftKey);
    if (annotation.type !== "pen") {
      annotation.end = point;
      annotation.box = boxFromPoints(state.drawing.start, point);
    }
    state.drawing = null;

    if (!isValidAnnotation(annotation)) {
      render();
      return;
    }

    state.annotations.push(annotation);
    state.selectedId = annotation.id;
    showNotePopover({ x: annotation.box.x + annotation.box.width, y: annotation.box.y + annotation.box.height }, annotation);
    render();
  }

  function onPointerLeave() {
    tag.hidden = true;
    cursorTip.hidden = true;
  }

  function captureHoverElement(point) {
    state.hoverElement = elementAtPoint(point);
    if (!state.hoverElement) {
      tag.hidden = true;
      return;
    }
    const rect = state.hoverElement.getBoundingClientRect();
    tag.textContent = `${getSelector(state.hoverElement)}  ${Math.round(rect.width)}x${Math.round(rect.height)}`;
    tag.style.left = `${clamp(rect.left, 8, window.innerWidth - 24)}px`;
    tag.style.top = `${clamp(rect.top - 30, 8, window.innerHeight - 30)}px`;
    tag.hidden = false;
  }

  function elementAtPoint(point) {
    const hidden = [root, canvas, svg, hud, cursorTip, tag, toolbar, panel, notePopover].filter(Boolean);
    hidden.forEach((el) => {
      el.dataset.vmOldPointerEvents = el.style.pointerEvents || "";
      el.style.pointerEvents = "none";
    });
    const el = document.elementFromPoint(point.x, point.y);
    hidden.forEach((node) => {
      node.style.pointerEvents = node.dataset.vmOldPointerEvents;
      delete node.dataset.vmOldPointerEvents;
    });
    return el && !root.contains(el) ? el : null;
  }

  function render() {
    if (!svg) return;
    svg.replaceChildren();
    const items = state.drawing ? [...state.annotations, state.drawing.annotation] : state.annotations;
    items.forEach((annotation, index) => {
      svg.appendChild(renderAnnotation(annotation, index + 1));
    });
    updateHud();
    updatePanel();
  }

  function renderAnnotation(annotation, number) {
    const group = document.createElementNS(NS, "g");
    group.dataset.id = annotation.id;
    group.setAttribute("opacity", "0.96");

    if (annotation.type === "rect") {
      const rect = svgEl("rect", {
        x: annotation.box.x,
        y: annotation.box.y,
        width: annotation.box.width,
        height: annotation.box.height,
        fill: "transparent",
        stroke: annotation.color,
        "stroke-width": annotation.strokeWidth
      });
      group.append(rect);
    }

    if (annotation.type === "ellipse") {
      const ellipse = svgEl("ellipse", {
        cx: annotation.box.x + annotation.box.width / 2,
        cy: annotation.box.y + annotation.box.height / 2,
        rx: annotation.box.width / 2,
        ry: annotation.box.height / 2,
        fill: "transparent",
        stroke: annotation.color,
        "stroke-width": annotation.strokeWidth
      });
      group.append(ellipse);
    }

    if (annotation.type === "line" || annotation.type === "arrow") {
      const start = annotation.start || { x: annotation.box.x, y: annotation.box.y };
      const end = annotation.end || { x: annotation.box.x + annotation.box.width, y: annotation.box.y + annotation.box.height };
      const line = svgEl("line", {
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        stroke: annotation.color,
        "stroke-linecap": "round",
        "stroke-width": annotation.strokeWidth
      });
      group.append(line);
      if (annotation.type === "arrow") group.append(arrowHead(annotation));
    }

    if (annotation.type === "pen") {
      const path = svgEl("path", {
        d: pointsToPath(annotation.points),
        fill: "transparent",
        stroke: annotation.color,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "stroke-width": annotation.strokeWidth
      });
      group.append(path);
    }

    if (annotation.type === "callout") {
      const circle = svgEl("circle", {
        cx: annotation.box.x,
        cy: annotation.box.y,
        r: 15,
        fill: annotation.color,
        stroke: "#fff",
        "stroke-width": 2
      });
      const text = svgText(annotation.box.x, annotation.box.y + 5, annotation.label || String(number), {
        fill: "#fff",
        "font-size": 16,
        "font-weight": 800,
        "text-anchor": "middle"
      });
      group.append(circle, text);
    }

    if (annotation.type === "text") {
      const text = svgText(annotation.box.x, annotation.box.y, annotation.note || "Text", {
        fill: annotation.color,
        "font-size": 18,
        "font-weight": 800
      });
      group.append(text);
    }

    if (annotation.type !== "text") {
      const label = svgText(annotation.box.x + 6, annotation.box.y - 8, `#${number} ${formatBox(annotation.box)}`, {
        fill: annotation.color,
        "font-size": 12,
        "font-weight": 800
      });
      group.append(label);
    }

    if (annotation.id === state.selectedId) {
      const box = selectionBox(annotation);
      const outline = svgEl("rect", {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        fill: "transparent",
        stroke: "#228be6",
        "stroke-dasharray": "6 4",
        "stroke-width": 2
      });
      group.append(outline);
    }

    return group;
  }

  function arrowHead(annotation) {
    const start = annotation.start || { x: annotation.box.x, y: annotation.box.y };
    const end = annotation.end || { x: annotation.box.x + annotation.box.width, y: annotation.box.y + annotation.box.height };
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const size = Math.max(10, annotation.strokeWidth * 4);
    const p1 = {
      x: end.x - size * Math.cos(angle - Math.PI / 6),
      y: end.y - size * Math.sin(angle - Math.PI / 6)
    };
    const p2 = {
      x: end.x - size * Math.cos(angle + Math.PI / 6),
      y: end.y - size * Math.sin(angle + Math.PI / 6)
    };
    return svgEl("path", {
      d: `M ${end.x} ${end.y} L ${p1.x} ${p1.y} M ${end.x} ${end.y} L ${p2.x} ${p2.y}`,
      fill: "transparent",
      stroke: annotation.color,
      "stroke-linecap": "round",
      "stroke-width": annotation.strokeWidth
    });
  }

  function svgEl(name, attrs) {
    const el = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
    return el;
  }

  function svgText(x, y, text, attrs) {
    const el = svgEl("text", { x, y, ...attrs });
    el.textContent = text;
    return el;
  }

  function pointsToPath(points) {
    if (!points.length) return "";
    const [first, ...rest] = points;
    return `M ${first.x} ${first.y} ` + rest.map((point) => `L ${point.x} ${point.y}`).join(" ");
  }

  function showNotePopover(point, annotation, addOnSave = false) {
    notePopover?.remove();
    notePopover = document.createElement("div");
    notePopover.className = "vm-note-popover";
    notePopover.style.left = `${clamp(point.x + 12, 12, window.innerWidth - 300)}px`;
    notePopover.style.top = `${clamp(point.y + 12, 12, window.innerHeight - 160)}px`;
    notePopover.innerHTML = `
      <textarea placeholder="写给 AI 的修改要求">${escapeHtml(annotation.note || "")}</textarea>
      <div>
        <button class="vm-secondary" data-action="cancel">取消</button>
        <button data-action="save">保存</button>
      </div>
    `;
    root.appendChild(notePopover);
    const textarea = notePopover.querySelector("textarea");
    textarea.focus();
    notePopover.querySelector('[data-action="cancel"]').addEventListener("click", () => {
      notePopover.remove();
      notePopover = null;
    });
    notePopover.querySelector('[data-action="save"]').addEventListener("click", () => {
      annotation.note = textarea.value.trim();
      if (addOnSave) state.annotations.push(annotation);
      notePopover.remove();
      notePopover = null;
      render();
    });
  }

  function updateHud() {
    if (!hud) return;
    const point = state.lastPoint;
    const scrollPoint = {
      x: Math.round(point.x + window.scrollX),
      y: Math.round(point.y + window.scrollY)
    };
    let lines = [
      `cursor viewport x:${Math.round(point.x)} y:${Math.round(point.y)}`,
      `cursor page     x:${scrollPoint.x} y:${scrollPoint.y}`,
      `viewport        ${window.innerWidth}x${window.innerHeight} dpr:${window.devicePixelRatio}`
    ];
    if (state.drawing) {
      lines.push(`drawing         ${formatBox(state.drawing.annotation.box)}`);
    }
    if (state.hoverElement) {
      const rect = rectToBox(state.hoverElement.getBoundingClientRect());
      lines.push(`element         ${formatBox(rect)}`);
      lines.push(`selector        ${getSelector(state.hoverElement)}`);
    }
    if (state.pinnedInspect) {
      lines.push("");
      lines.push(`pinned viewport x:${state.pinnedInspect.viewportPoint.x} y:${state.pinnedInspect.viewportPoint.y}`);
      lines.push(`pinned page     x:${state.pinnedInspect.pagePoint.x} y:${state.pinnedInspect.pagePoint.y}`);
      if (state.pinnedInspect.elementBox) {
        lines.push(`pinned element  ${formatBox(state.pinnedInspect.elementBox)}`);
      }
    }
    hud.textContent = lines.join("\n");
    updateCursorTip(point, scrollPoint);
  }

  function updateCursorTip(point, scrollPoint) {
    if (!cursorTip) return;
    const shouldShow = state.tool === "select" && state.active;
    cursorTip.hidden = !shouldShow;
    if (!shouldShow) return;
    cursorTip.textContent = `x:${Math.round(point.x)} y:${Math.round(point.y)} | page ${scrollPoint.x},${scrollPoint.y}`;
    cursorTip.style.left = `${clamp(point.x + 14, 8, window.innerWidth - cursorTip.offsetWidth - 8)}px`;
    cursorTip.style.top = `${clamp(point.y + 14, 8, window.innerHeight - cursorTip.offsetHeight - 8)}px`;
  }

  function updatePanel() {
    if (!panel || !state.panelOpen) return;
    const stats = panel.querySelector('[data-role="stats"]');
    stats.textContent = [
      `url: ${location.href}`,
      `viewport: ${window.innerWidth}x${window.innerHeight} dpr:${window.devicePixelRatio}`,
      `scroll: ${Math.round(window.scrollX)}, ${Math.round(window.scrollY)}`,
      `annotations: ${state.annotations.length}`
    ].join("\n");

    const list = panel.querySelector('[data-role="list"]');
    list.replaceChildren();
    state.annotations.forEach((annotation, index) => {
      const item = document.createElement("div");
      item.className = "vm-item";
      item.classList.toggle("vm-item-selected", annotation.id === state.selectedId);
      item.dataset.id = annotation.id;
      item.innerHTML = `
        <strong>#${index + 1} ${annotation.type} ${formatBox(annotation.box)}</strong>
        <div class="vm-item-meta">${escapeHtml(annotation.selector || "no selector")}</div>
        <textarea data-id="${annotation.id}" placeholder="写给 AI 的修改要求">${escapeHtml(annotation.note || "")}</textarea>
      `;
      item.addEventListener("click", () => {
        selectAnnotation(annotation.id);
        render();
      });
      item.querySelector("textarea").addEventListener("input", (event) => {
        annotation.note = event.target.value;
      });
      item.querySelector("textarea").addEventListener("click", (event) => {
        event.stopPropagation();
        selectAnnotation(annotation.id);
      });
      list.appendChild(item);
    });
  }

  function clearAnnotations() {
    state.annotations = [];
    state.drawing = null;
    state.moving = null;
    state.selectedId = null;
    state.pinnedInspect = null;
    notePopover?.remove();
    notePopover = null;
    render();
  }

  async function copyExport() {
    const payload = buildExportPayload();
    const markdown = buildMarkdown(payload);
    try {
      await navigator.clipboard.writeText(markdown);
    } catch (_error) {
      fallbackCopyText(markdown);
    }
    flashStatus("Copied AI changelog");
  }

  async function downloadJson() {
    const payload = buildExportPayload();
    const json = JSON.stringify(payload, null, 2);
    const url = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
    chrome.runtime.sendMessage({
      type: "VIBEMARK_DOWNLOAD",
      url,
      filename: `vibemark-${Date.now()}.json`
    });
  }

  async function downloadScreenshot() {
    const hidden = [canvas, toolbar, panel, hud, cursorTip, tag, notePopover].filter(Boolean);
    const previous = hidden.map((el) => [el, el.style.display]);
    let response;
    try {
      hidden.forEach((el) => {
        el.style.display = "none";
      });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      response = await chrome.runtime.sendMessage({ type: "VIBEMARK_CAPTURE_VISIBLE_TAB" });
    } finally {
      previous.forEach(([el, display]) => {
        el.style.display = display;
      });
    }
    if (!response?.ok) {
      flashStatus(response?.error || "Screenshot failed");
      return;
    }
    chrome.runtime.sendMessage({
      type: "VIBEMARK_DOWNLOAD",
      url: response.dataUrl,
      filename: `vibemark-screenshot-${Date.now()}.png`
    });
    flashStatus("Downloaded screenshot");
  }

  function buildExportPayload() {
    return {
      tool: "VibeMark Frontend Annotator",
      exportedAt: new Date().toISOString(),
      page: pageMeta(),
      annotations: state.annotations.map((annotation, index) => ({
        number: index + 1,
        type: annotation.type,
        note: annotation.note,
        color: annotation.color,
        strokeWidth: annotation.strokeWidth,
        viewportBox: roundBox(annotation.box),
        pageBox: roundBox({
          x: annotation.box.x + window.scrollX,
          y: annotation.box.y + window.scrollY,
          width: annotation.box.width,
          height: annotation.box.height
        }),
        selector: annotation.selector,
        elementBox: annotation.elementBox ? roundBox(annotation.elementBox) : null,
        start: annotation.start ? roundPoint(annotation.start) : null,
        end: annotation.end ? roundPoint(annotation.end) : null,
        points: annotation.points?.map(roundPoint) || null,
        pageAtCreation: annotation.page
      }))
    };
  }

  function buildMarkdown(payload) {
    const lines = [
      "# Frontend change request from VibeMark",
      "",
      `URL: ${payload.page.url}`,
      `Viewport: ${payload.page.viewport.width}x${payload.page.viewport.height}, DPR ${payload.page.devicePixelRatio}`,
      `Scroll: x=${payload.page.scroll.x}, y=${payload.page.scroll.y}`,
      "",
      "## Annotations",
      ""
    ];

    payload.annotations.forEach((item) => {
      lines.push(`### #${item.number} ${item.type}`);
      lines.push(`- Note: ${item.note || "(no note)"}`);
      lines.push(`- Viewport box: x=${item.viewportBox.x}, y=${item.viewportBox.y}, w=${item.viewportBox.width}, h=${item.viewportBox.height}`);
      lines.push(`- Page box: x=${item.pageBox.x}, y=${item.pageBox.y}, w=${item.pageBox.width}, h=${item.pageBox.height}`);
      lines.push(`- Selector: ${item.selector || "(none)"}`);
      if (item.elementBox) {
        lines.push(`- Element box: x=${item.elementBox.x}, y=${item.elementBox.y}, w=${item.elementBox.width}, h=${item.elementBox.height}`);
      }
      lines.push("");
    });

    lines.push("## Raw JSON");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(payload, null, 2));
    lines.push("```");
    return lines.join("\n");
  }

  function pageMeta() {
    return {
      url: location.href,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scroll: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) },
      devicePixelRatio: window.devicePixelRatio,
      timestamp: new Date().toISOString()
    };
  }

  function onKeyDown(event) {
    if (!state.active || isEditableTarget(event.target)) return;
    if (event.key === "Escape") toggle(false);
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
      const copied = copyCurrentSelection();
      if (copied) {
        event.preventDefault();
        return;
      }
    }
    if ((event.key === "Delete" || event.key === "Backspace") && state.selectedId) {
      event.preventDefault();
      deleteSelectedAnnotation();
      return;
    }
    if (state.selectedId && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const delta = {
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0]
      }[event.key];
      moveAnnotation(state.selectedId, delta[0], delta[1]);
      render();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      state.annotations.pop();
      if (!state.annotations.some((item) => item.id === state.selectedId)) state.selectedId = null;
      render();
    }
  }

  function flashStatus(text) {
    const previous = hud.textContent;
    hud.textContent = text;
    window.setTimeout(() => {
      hud.textContent = previous;
      updateHud();
    }, 900);
  }

  function fallbackCopyText(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.height = "1px";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function pinInspect(point) {
    const targetElement = elementAtPoint(point);
    state.pinnedInspect = {
      page: pageMeta(),
      viewportPoint: roundPoint(point),
      pagePoint: roundPoint({ x: point.x + window.scrollX, y: point.y + window.scrollY }),
      selector: targetElement ? getSelector(targetElement) : null,
      elementBox: targetElement ? roundBox(rectToBox(targetElement.getBoundingClientRect())) : null
    };
  }

  function copyCurrentSelection() {
    const selected = state.annotations.find((annotation) => annotation.id === state.selectedId);
    if (selected) {
      copyText(buildAnnotationSnippet(selected));
      flashStatus("Copied selected annotation");
      return true;
    }
    if (state.pinnedInspect) {
      copyText(buildPinnedSnippet(state.pinnedInspect));
      flashStatus("Copied pinned coordinates");
      return true;
    }
    return false;
  }

  function copyText(text) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
  }

  function buildPinnedSnippet(inspect) {
    const lines = [
      "Pinned frontend location from VibeMark",
      `URL: ${inspect.page.url}`,
      `Viewport point: x=${inspect.viewportPoint.x}, y=${inspect.viewportPoint.y}`,
      `Page point: x=${inspect.pagePoint.x}, y=${inspect.pagePoint.y}`,
      `Viewport: ${inspect.page.viewport.width}x${inspect.page.viewport.height}, DPR ${inspect.page.devicePixelRatio}`,
      `Scroll: x=${inspect.page.scroll.x}, y=${inspect.page.scroll.y}`,
      `Selector: ${inspect.selector || "(none)"}`
    ];
    if (inspect.elementBox) {
      lines.push(`Element box: x=${inspect.elementBox.x}, y=${inspect.elementBox.y}, w=${inspect.elementBox.width}, h=${inspect.elementBox.height}`);
    }
    return lines.join("\n");
  }

  function buildAnnotationSnippet(annotation) {
    const viewportBox = roundBox(annotation.box);
    const pageBox = roundBox({
      x: annotation.box.x + window.scrollX,
      y: annotation.box.y + window.scrollY,
      width: annotation.box.width,
      height: annotation.box.height
    });
    const lines = [
      "Selected annotation from VibeMark",
      `URL: ${location.href}`,
      `Type: ${annotation.type}`,
      `Note: ${annotation.note || "(no note)"}`,
      `Viewport box: x=${viewportBox.x}, y=${viewportBox.y}, w=${viewportBox.width}, h=${viewportBox.height}`,
      `Page box: x=${pageBox.x}, y=${pageBox.y}, w=${pageBox.width}, h=${pageBox.height}`,
      `Selector: ${annotation.selector || "(none)"}`
    ];
    if (annotation.elementBox) {
      const elementBox = roundBox(annotation.elementBox);
      lines.push(`Element box: x=${elementBox.x}, y=${elementBox.y}, w=${elementBox.width}, h=${elementBox.height}`);
    }
    return lines.join("\n");
  }

  function toPoint(event) {
    return { x: event.clientX, y: event.clientY };
  }

  function pointBox(point) {
    return { x: point.x, y: point.y, width: 0, height: 0 };
  }

  function boxFromPoints(a, b) {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(a.x - b.x),
      height: Math.abs(a.y - b.y)
    };
  }

  function boxFromPointsList(points) {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      x: minX,
      y: minY,
      width: Math.max(...xs) - minX,
      height: Math.max(...ys) - minY
    };
  }

  function hitAnnotation(point) {
    for (let index = state.annotations.length - 1; index >= 0; index -= 1) {
      const annotation = state.annotations[index];
      if (pointInBox(point, selectionBox(annotation, 8))) return annotation;
    }
    return null;
  }

  function selectionBox(annotation, pad = 6) {
    const base = roundBox(annotation.box);
    const minWidth = annotation.type === "text" ? 80 : 18;
    const minHeight = annotation.type === "text" ? 28 : 18;
    const width = Math.max(base.width, minWidth);
    const height = Math.max(base.height, minHeight);
    return {
      x: base.x - pad,
      y: base.y - pad,
      width: width + pad * 2,
      height: height + pad * 2
    };
  }

  function pointInBox(point, box) {
    return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
  }

  function moveAnnotation(id, dx, dy) {
    const annotation = state.annotations.find((item) => item.id === id);
    if (!annotation) return;
    annotation.box.x += dx;
    annotation.box.y += dy;
    if (annotation.start) annotation.start = { x: annotation.start.x + dx, y: annotation.start.y + dy };
    if (annotation.end) annotation.end = { x: annotation.end.x + dx, y: annotation.end.y + dy };
    if (annotation.points) {
      annotation.points = annotation.points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
    }
  }

  function deleteSelectedAnnotation() {
    state.annotations = state.annotations.filter((annotation) => annotation.id !== state.selectedId);
    state.selectedId = null;
    state.moving = null;
    render();
  }

  function selectAnnotation(id) {
    state.selectedId = id;
    state.tool = "select";
    updateToolbar();
    updateCanvasMode();
  }

  function isEditableTarget(target) {
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
  }

  function constrainPoint(start, point, type, shiftKey) {
    if (!shiftKey) return point;
    if (type === "rect" || type === "ellipse") {
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      return {
        x: start.x + Math.sign(dx || 1) * side,
        y: start.y + Math.sign(dy || 1) * side
      };
    }
    if (type === "line" || type === "arrow") {
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      return Math.abs(dx) >= Math.abs(dy)
        ? { x: point.x, y: start.y }
        : { x: start.x, y: point.y };
    }
    return point;
  }

  function isValidAnnotation(annotation) {
    if (annotation.type === "pen") return annotation.points.length > 2;
    if (annotation.type === "line" || annotation.type === "arrow") {
      const start = annotation.start || { x: annotation.box.x, y: annotation.box.y };
      const end = annotation.end || { x: annotation.box.x + annotation.box.width, y: annotation.box.y + annotation.box.height };
      return Math.hypot(end.x - start.x, end.y - start.y) >= 4;
    }
    return annotation.box.width >= 4 && annotation.box.height >= 4;
  }

  function rectToBox(rect) {
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }

  function roundBox(box) {
    return {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height)
    };
  }

  function roundPoint(point) {
    return { x: Math.round(point.x), y: Math.round(point.y) };
  }

  function formatBox(box) {
    const rounded = roundBox(box);
    return `x:${rounded.x} y:${rounded.y} w:${rounded.width} h:${rounded.height}`;
  }

  function getSelector(el) {
    if (!(el instanceof Element)) return "";
    if (el.id) return `#${CSS.escape(el.id)}`;

    const parts = [];
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
      let part = current.nodeName.toLowerCase();
      const classNames = [...current.classList].filter(Boolean).slice(0, 3);
      if (classNames.length) part += `.${classNames.map((name) => CSS.escape(name)).join(".")}`;
      const parent = current.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter((node) => node.nodeName === current.nodeName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
      parts.unshift(part);
      current = parent;
    }
    return parts.join(" > ");
  }

  function isChrome(target) {
    return Boolean(target && root?.contains(target) && target !== canvas && target !== svg);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }
})();
