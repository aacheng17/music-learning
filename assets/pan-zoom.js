(function () {
  var GAP = 16;
  var GRID = 22;
  var EDGE_PAD = 3;
  var DOT_RADIUS = 1.1;
  var DOT_RADIUS_MIN = 0.5, DOT_RADIUS_MAX = 2.5;

  function initViewer(root) {
    var viewport = root.querySelector('.pz-viewport');
    var stage = root.querySelector('.pz-stage');
    var highlight = root.querySelector('.pz-highlight');
    var itemEls = root.querySelectorAll('.pz-item');
    if (!viewport || !stage || !itemEls.length) return;

    function intrinsicSize(svg) {
      var vb = svg.viewBox && svg.viewBox.baseVal;
      var w = parseFloat(svg.getAttribute('width'));
      var h = parseFloat(svg.getAttribute('height'));
      if (w && h) return { w: w, h: h, padX: vb ? vb.x : 0, padY: vb ? vb.y : 0 };
      if (vb && vb.width && vb.height) return { w: vb.width, h: vb.height, padX: vb.x, padY: vb.y };
      var bbox = svg.getBBox();
      return { w: bbox.width, h: bbox.height, padX: 0, padY: 0 };
    }

    function makeEntry(el, original) {
      var svg = el.querySelector('svg');
      var size = intrinsicSize(svg);
      var xAttr = el.getAttribute('data-x');
      var e = {
        el: el, svg: svg, w: size.w, h: size.h, padX: size.padX, padY: size.padY,
        defaultX: xAttr !== null ? parseFloat(xAttr) : 0,
        gapBefore: el.getAttribute('data-gap-before') === 'true',
        baseX: 0, baseY: 0, dragX: 0, dragY: 0,
        original: !!original
      };
      el.addEventListener('mouseenter', function () {
        hoveredEntry = e;
        syncHighlight();
      });
      el.addEventListener('mouseleave', function () {
        if (hoveredEntry === e) hoveredEntry = null;
        syncHighlight();
      });
      return e;
    }

    var entries = [];
    for (var i = 0; i < itemEls.length; i++) entries.push(makeEntry(itemEls[i], true));

    function layout() {
      var y = 0;
      for (var i = 0; i < entries.length; i++) {
        if (i > 0 && entries[i].gapBefore) y += GAP;
        entries[i].baseX = entries[i].defaultX;
        entries[i].baseY = y;
        y += entries[i].h + 2 * entries[i].padY;
      }
    }
    layout();

    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      minX = Math.min(minX, e.baseX + e.padX);
      maxX = Math.max(maxX, e.baseX + e.padX + e.w);
      minY = Math.min(minY, e.baseY + e.padY);
      maxY = Math.max(maxY, e.baseY + e.padY + e.h);
    }
    var contentW = maxX - minX;
    var contentH = maxY - minY;

    var scale = 1, panX = 0, panY = 0;
    var MIN_SCALE = 0.05, MAX_SCALE = 30;

    var hoveredEntry = null;

    function applyItem(e) {
      var worldX = Math.round((e.baseX + e.dragX) / GRID) * GRID;
      var worldY = Math.round((e.baseY + e.dragY) / GRID) * GRID;
      var wx = (worldX + e.padX) * scale;
      var wy = (worldY + e.padY) * scale;
      e.el.style.transform = 'translate(' + wx + 'px, ' + wy + 'px)';
      e.svg.style.width = (e.w * scale) + 'px';
      e.svg.style.height = (e.h * scale) + 'px';
    }

    function syncHighlight() {
      if (!highlight) return;
      if (!hoveredEntry) { highlight.classList.remove('active'); return; }
      highlight.style.transform = hoveredEntry.el.style.transform;
      highlight.style.width = hoveredEntry.svg.style.width;
      highlight.style.height = hoveredEntry.svg.style.height;
      highlight.style.outlineOffset = (-EDGE_PAD * scale) + 'px';
      highlight.classList.add('active');
    }

    function applyStage() {
      stage.style.transform = 'translate(' + panX + 'px, ' + panY + 'px)';
      var cell = GRID * scale;
      var half = cell / 2;
      var dotR = Math.min(DOT_RADIUS_MAX, Math.max(DOT_RADIUS_MIN, DOT_RADIUS * scale));
      viewport.style.backgroundImage = 'radial-gradient(circle, var(--viewer-dot) ' + dotR + 'px, transparent ' + dotR + 'px)';
      viewport.style.backgroundSize = cell + 'px ' + cell + 'px';
      viewport.style.backgroundPosition = (panX - half) + 'px ' + (panY - half) + 'px';
    }

    function applyAll() {
      applyStage();
      for (var i = 0; i < entries.length; i++) applyItem(entries[i]);
      syncHighlight();
    }

    function zoomAt(cx, cy, factor) {
      var next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
      factor = next / scale;
      panX = cx - (cx - panX) * factor;
      panY = cy - (cy - panY) * factor;
      scale = next;
      applyAll();
    }

    function resetZoomPan() {
      var vw = viewport.clientWidth, vh = viewport.clientHeight;
      if (!contentW || !contentH) { scale = 1; panX = 0; panY = 0; applyAll(); return; }
      var pad = 0.92;
      scale = Math.min((vw * pad) / contentW, (vh * pad) / contentH);
      panX = (vw - contentW * scale) / 2 - minX * scale;
      panY = (vh - contentH * scale) / 2 - minY * scale;
      applyAll();
    }

    function resetImages() {
      var added = entries.filter(function (e) { return !e.original; });
      for (var i = 0; i < added.length; i++) deleteEntry(added[i]);
      for (var i = 0; i < entries.length; i++) { entries[i].dragX = 0; entries[i].dragY = 0; }
      for (var i = 0; i < entries.length; i++) applyItem(entries[i]);
      syncHighlight();
    }

    function entryFor(target) {
      var itemEl = target.closest && target.closest('.pz-item');
      if (!itemEl) return null;
      for (var i = 0; i < entries.length; i++) if (entries[i].el === itemEl) return entries[i];
      return null;
    }

    function deleteEntry(entry) {
      var idx = entries.indexOf(entry);
      if (idx === -1) return;
      entries.splice(idx, 1);
      if (entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
      if (hoveredEntry === entry) {
        hoveredEntry = null;
        syncHighlight();
      }
    }

    var dragEntry = null, draggingCanvas = false, lastX = 0, lastY = 0;

    viewport.addEventListener('mousedown', function (e) {
      if (e.button === 1) {
        e.preventDefault();
        dragEntry = null;
        draggingCanvas = true;
      } else if (e.button === 0) {
        dragEntry = entryFor(e.target);
        draggingCanvas = false;
        if (!dragEntry) return;
        hoveredEntry = dragEntry;
        if (sidebar) sidebar.classList.add('suppress-hover');
        hideSidebarTooltip();
      } else {
        return;
      }
      lastX = e.clientX;
      lastY = e.clientY;
      if (!dragEntry) viewport.classList.add('dragging');
    });

    window.addEventListener('mousemove', function (e) {
      if (!dragEntry && !draggingCanvas) return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (dragEntry) {
        dragEntry.dragX += dx / scale;
        dragEntry.dragY += dy / scale;
        applyItem(dragEntry);
        if (hoveredEntry === dragEntry) syncHighlight();
        updateDeleteTarget(e.clientX, e.clientY);
      } else {
        panX += dx;
        panY += dy;
        applyStage();
      }
    });

    window.addEventListener('mouseup', function (e) {
      viewport.classList.remove('dragging');
      if (dragEntry && updateDeleteTarget(e.clientX, e.clientY)) {
        deleteEntry(dragEntry);
      }
      clearDeleteTarget();
      if (sidebar) sidebar.classList.remove('suppress-hover');
      dragEntry = null;
      draggingCanvas = false;
    });

    viewport.addEventListener('wheel', function (e) {
      e.preventDefault();
      var rect = viewport.getBoundingClientRect();
      var cx = e.clientX - rect.left;
      var cy = e.clientY - rect.top;
      var factor = Math.exp(-e.deltaY * 0.0015);
      zoomAt(cx, cy, factor);
    }, { passive: false });

    var resetZoomPanBtn = root.querySelector('.reset-zoom-pan');
    if (resetZoomPanBtn) resetZoomPanBtn.addEventListener('click', resetZoomPan);
    var resetImagesBtn = root.querySelector('.reset-images');
    if (resetImagesBtn) resetImagesBtn.addEventListener('click', resetImages);

    var hovering = false;
    var ARROW_STEP = 60;
    var ARROW_DX = { ArrowLeft: 1, ArrowRight: -1, ArrowUp: 0, ArrowDown: 0 };
    var ARROW_DY = { ArrowLeft: 0, ArrowRight: 0, ArrowUp: 1, ArrowDown: -1 };

    viewport.addEventListener('mouseenter', function () { hovering = true; });
    viewport.addEventListener('mouseleave', function () { hovering = false; });

    window.addEventListener('keydown', function (e) {
      if (!hovering || !(e.key in ARROW_DX)) return;
      e.preventDefault();
      panX += ARROW_DX[e.key] * ARROW_STEP;
      panY += ARROW_DY[e.key] * ARROW_STEP;
      applyStage();
    });

    var sidebarToggle = root.querySelector('.sidebar-toggle');
    var sidebar = root.querySelector('.pz-sidebar');
    var dragGhost = root.querySelector('.pz-drag-ghost');
    var sidebarTooltip = root.querySelector('.pz-sidebar-tooltip');

    function showSidebarTooltip(itemEl) {
      if (!sidebarTooltip || dragEntry || pendingItem) return;
      var tpl = itemEl.querySelector('template');
      if (!tpl) return;
      sidebarTooltip.innerHTML = '';
      sidebarTooltip.appendChild(tpl.content.cloneNode(true));
      var itemRect = itemEl.getBoundingClientRect();
      var sidebarRect = sidebar.getBoundingClientRect();
      sidebarTooltip.style.setProperty('--x', (sidebarRect.right + 10) + 'px');
      sidebarTooltip.style.setProperty('--y', itemRect.top + 'px');
      sidebarTooltip.classList.add('active');
    }

    function hideSidebarTooltip() {
      if (sidebarTooltip) sidebarTooltip.classList.remove('active');
    }

    function pointInRect(x, y, el) {
      var r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }

    function updateDeleteTarget(clientX, clientY) {
      var over = !!((sidebar && pointInRect(clientX, clientY, sidebar)) ||
        (sidebarToggle && pointInRect(clientX, clientY, sidebarToggle)));
      if (sidebar) sidebar.classList.toggle('delete-target', over);
      if (sidebarToggle) sidebarToggle.classList.toggle('delete-target', over);
      return over;
    }

    function clearDeleteTarget() {
      if (sidebar) sidebar.classList.remove('delete-target');
      if (sidebarToggle) sidebarToggle.classList.remove('delete-target');
    }

    if (sidebarToggle && sidebar) {
      sidebarToggle.addEventListener('click', function () {
        var collapsed = sidebar.classList.toggle('collapsed');
        sidebarToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      });
    }

    if (sidebar && dragGhost) {
      var sidebarItems = sidebar.querySelectorAll('.pz-sidebar-item');
      var pendingItem = null;

      function moveGhost(clientX, clientY) {
        dragGhost.style.setProperty('--x', (clientX + 14) + 'px');
        dragGhost.style.setProperty('--y', (clientY + 14) + 'px');
      }

      for (var si = 0; si < sidebarItems.length; si++) {
        (function (itemEl) {
          itemEl.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            e.preventDefault();
            pendingItem = itemEl;
            itemEl.classList.add('dragging');
            dragGhost.textContent = itemEl.querySelector('span').textContent;
            dragGhost.classList.add('active');
            moveGhost(e.clientX, e.clientY);
            hideSidebarTooltip();
          });
          itemEl.addEventListener('mouseenter', function () {
            showSidebarTooltip(itemEl);
          });
          itemEl.addEventListener('mouseleave', function () {
            hideSidebarTooltip();
          });
        })(sidebarItems[si]);
      }

      window.addEventListener('mousemove', function (e) {
        if (!pendingItem) return;
        moveGhost(e.clientX, e.clientY);
      });

      window.addEventListener('mouseup', function (e) {
        if (!pendingItem) return;
        var itemEl = pendingItem;
        pendingItem = null;
        itemEl.classList.remove('dragging');
        dragGhost.classList.remove('active');

        if (!pointInRect(e.clientX, e.clientY, viewport)) return;
        var vpRect = viewport.getBoundingClientRect();

        var tpl = itemEl.querySelector('template');
        var svgEl = tpl.content.firstElementChild;
        var clone = svgEl.cloneNode(true);

        var wrapper = document.createElement('div');
        wrapper.className = 'pz-item';
        wrapper.appendChild(clone);
        stage.insertBefore(wrapper, highlight);

        var newEntry = makeEntry(wrapper);
        var dropX = (e.clientX - vpRect.left - panX) / scale;
        var dropY = (e.clientY - vpRect.top - panY) / scale;
        newEntry.baseX = Math.round(dropX / GRID) * GRID;
        newEntry.baseY = Math.round(dropY / GRID) * GRID;
        entries.push(newEntry);
        applyItem(newEntry);
        hoveredEntry = newEntry;
        syncHighlight();
      });
    }

    resetImages();
    resetZoomPan();
    viewport.classList.add('ready');
    window.addEventListener('resize', resetZoomPan);
  }

  var viewers = document.querySelectorAll('.pz-viewer');
  for (var i = 0; i < viewers.length; i++) initViewer(viewers[i]);
})();
