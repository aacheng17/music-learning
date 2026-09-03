(function () {
  var GAP = 16;
  var GRID = 22;
  var EDGE_PAD = 3;
  var DOT_RADIUS = 1.1;
  var DOT_RADIUS_MIN = 0.5, DOT_RADIUS_MAX = 2.5;
  var KIND_RANK = { chart: 0, absolute: 1, relative: 2 };
  var CLICK_MAX_MOVE = 4;
  var TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';

  var OCTAVE_WIDTH = 12 * GRID;
  var OCTAVE_TOTAL_WIDTH = OCTAVE_WIDTH + 2 * EDGE_PAD;
  var MAX_REPEAT = 10;
  var EDGE_GRAB_MIN = 6;
  var EDGE_GRAB_FRACTION = 0.25;
  var REPEAT_SNAP_FRACTION = 0.05;
  function octaveSteps(dx) {
    var octaves = Math.abs(dx) / OCTAVE_WIDTH;
    var steps = Math.floor(octaves + (1 - REPEAT_SNAP_FRACTION));
    return dx < 0 ? -steps : steps;
  }

  var audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  var PARTIALS = [
    { n: 1, gain: 1 },
    { n: 2, gain: 0.35 },
    { n: 3, gain: 0.15 },
    { n: 4, gain: 0.08 }
  ];
  var INHARMONICITY = 0.0003;

  var PITCH_TUNING = {
    lowBoostAmount: 0.3,
    lowBoostStart: 45,
    lowBoostSpan: 24,
    highCutAmount: 0.9,
    highCutStart: 72,
    highCutSpan: 36,
    midDipAmount: 0.55,
    midDipCenter: 48,
    midDipWidth: 8,
    highDipAmount: 0.35,
    highDipCenter: 97,
    highDipWidth: 6,
    overtoneFadeStart: 72,
    overtoneFadeSpan: 24,
    durationMax: 0.9,
    durationDrop: 0.55,
    durationFadeStart: 72,
    durationFadeSpan: 36
  };

  function gaussianDip(midi, amount, center, width) {
    return 1 - amount * Math.exp(-Math.pow((midi - center) / width, 2));
  }

  function rampToward(midi, start, span) {
    return Math.max(0, Math.min(1, (midi - start) / span));
  }

  function rampAway(midi, start, span) {
    return Math.max(0, Math.min(1, (start - midi) / span));
  }

  function ampForMidi(midi) {
    var t = PITCH_TUNING;
    var lowBoost = 1 + t.lowBoostAmount * rampAway(midi, t.lowBoostStart, t.lowBoostSpan);
    var highCut = 1 - t.highCutAmount * rampToward(midi, t.highCutStart, t.highCutSpan);
    var midDip = gaussianDip(midi, t.midDipAmount, t.midDipCenter, t.midDipWidth);
    var highDip = gaussianDip(midi, t.highDipAmount, t.highDipCenter, t.highDipWidth);
    return lowBoost * highCut * midDip * highDip;
  }

  function overtoneFade(n, midi) {
    if (n === 1) return 1;
    var t = PITCH_TUNING;
    var fade = rampToward(midi, t.overtoneFadeStart, t.overtoneFadeSpan);
    return Math.pow(1 - fade, n - 1);
  }

  function durationForMidi(midi) {
    var t = PITCH_TUNING;
    return t.durationMax - t.durationDrop * rampToward(midi, t.durationFadeStart, t.durationFadeSpan);
  }

  function playPartial(ctx, freq, peakGain, now, duration) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  function makeNoiseBuffer(ctx, seconds) {
    var bufferSize = Math.ceil(ctx.sampleRate * seconds);
    var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function playNoiseBurst(ctx, now, seconds, filterType, filterFreq, filterQ, peakGain) {
    var noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, seconds);
    var filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    if (filterQ != null) filter.Q.value = filterQ;
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(peakGain, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + seconds + 0.01);
  }

  function playHammer(ctx, now, amp) {
    playNoiseBurst(ctx, now, 0.02, 'lowpass', 130, null, 0.12 * amp);
  }

  function playNote(midi) {
    var ctx = getAudioContext();
    var freq = 440 * Math.pow(2, (midi - 69) / 12);
    var now = ctx.currentTime;
    var amp = ampForMidi(midi);
    var duration = durationForMidi(midi);
    for (var i = 0; i < PARTIALS.length; i++) {
      var p = PARTIALS[i];
      var fade = overtoneFade(p.n, midi);
      if (fade <= 0.001) continue;
      var pFreq = freq * p.n * (1 + INHARMONICITY * p.n * p.n);
      playPartial(ctx, pFreq, p.gain * fade * 0.26 * amp, now, duration);
    }
    playHammer(ctx, now, amp);
  }

  function noteFromShape(shapeEl) {
    var tag = shapeEl.tagName && shapeEl.tagName.toLowerCase();
    var headX;
    if (tag === 'rect') {
      var w = parseFloat(shapeEl.getAttribute('width'));
      if (!(w > 0) || w > GRID * 3) return null;
      headX = parseFloat(shapeEl.getAttribute('x'));
    } else if (tag === 'polygon') {
      var pts = (shapeEl.getAttribute('points') || '').trim().split(/\s+/);
      if (!pts.length) return null;
      headX = parseFloat(pts[0].split(',')[0]);
    } else {
      return null;
    }
    if (isNaN(headX)) return null;
    var i = Math.round(headX / GRID);
    if (i < 0 || i > 87) return null;
    return i + 21;
  }

  function noteAtPoint(entry, clientX, clientY) {
    if (entry.kind !== 'absolute') return null;
    var el = document.elementFromPoint(clientX, clientY);
    if (!el || !entry.svg.contains(el)) return null;
    return noteFromShape(el);
  }

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

    function edgeAt(rect, clientX) {
      var grab = Math.max(EDGE_GRAB_MIN, GRID * scale * EDGE_GRAB_FRACTION);
      if (clientX <= rect.left + grab) return 'left';
      if (clientX >= rect.right - grab) return 'right';
      return null;
    }

    function makeEntry(el, original) {
      var svg = el.querySelector('svg');
      var size = intrinsicSize(svg);
      var xAttr = el.getAttribute('data-x');
      var kind = el.getAttribute('data-kind');
      if (kind === 'absolute') {
        var texts = svg.querySelectorAll('text');
        for (var ti = 0; ti < texts.length; ti++) texts[ti].style.pointerEvents = 'none';
      }
      var e = {
        el: el, svg: svg, w: size.w, h: size.h, padX: size.padX, padY: size.padY,
        defaultX: xAttr !== null ? parseFloat(xAttr) : 0,
        gapBefore: el.getAttribute('data-gap-before') === 'true',
        kind: kind,
        baseX: 0, baseY: 0, dragX: 0, dragY: 0,
        original: !!original,
        repeatable: false, tileFrom: 0, tileTo: 0
      };
      if (kind === 'relative' && size.w === OCTAVE_TOTAL_WIDTH) {
        var staticNodes = [], tileNodes = [];
        var kids = svg.childNodes;
        for (var ci = 0; ci < kids.length; ci++) {
          var node = kids[ci];
          if (node.nodeType !== 1) continue;
          var tag = node.tagName.toLowerCase();
          if (tag === 'defs' || tag === 'title') staticNodes.push(node.cloneNode(true));
          else tileNodes.push(node.cloneNode(true));
        }
        e.repeatable = true;
        e.staticNodes = staticNodes;
        e.tileNodes = tileNodes;
        e.origPadX = size.padX;
        e.origPadY = size.padY;
        e.origW = size.w;
        e.origH = size.h;
        var initialRepeatLeft = parseInt(el.getAttribute('data-repeat-left'), 10) || 0;
        var initialRepeatRight = parseInt(el.getAttribute('data-repeat-right'), 10) || 0;
        if (initialRepeatLeft || initialRepeatRight) {
          e.tileFrom = -initialRepeatLeft;
          e.tileTo = initialRepeatRight;
          rebuildRepeat(e);
        }
        el.addEventListener('mousemove', function (evt) {
          if (dragEntry) return;
          el.style.cursor = edgeAt(svg.getBoundingClientRect(), evt.clientX) ? 'ew-resize' : '';
        });
      }
      el.addEventListener('mouseenter', function () {
        if (dragEntry) return;
        hoveredEntry = e;
        syncHighlight();
      });
      el.addEventListener('mouseleave', function () {
        if (e.repeatable) el.style.cursor = '';
        if (dragEntry) return;
        if (hoveredEntry === e) hoveredEntry = null;
        syncHighlight();
      });
      return e;
    }

    var SVG_NS = 'http://www.w3.org/2000/svg';

    function rebuildRepeat(entry) {
      var svg = entry.svg;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      for (var n = 0; n < entry.staticNodes.length; n++) svg.appendChild(entry.staticNodes[n].cloneNode(true));
      for (var k = entry.tileFrom; k <= entry.tileTo; k++) {
        var g = document.createElementNS(SVG_NS, 'g');
        if (k !== 0) g.setAttribute('transform', 'translate(' + (k * OCTAVE_WIDTH) + ',0)');
        for (var m = 0; m < entry.tileNodes.length; m++) g.appendChild(entry.tileNodes[m].cloneNode(true));
        svg.appendChild(g);
      }
      entry.padX = entry.origPadX + entry.tileFrom * OCTAVE_WIDTH;
      entry.w = entry.origW + (entry.tileTo - entry.tileFrom) * OCTAVE_WIDTH;
      svg.setAttribute('viewBox', entry.padX + ' ' + entry.origPadY + ' ' + entry.w + ' ' + entry.origH);
      svg.setAttribute('width', entry.w);
    }

    var originalTemplates = [];
    for (var i = 0; i < itemEls.length; i++) {
      originalTemplates.push(itemEls[i].cloneNode(true));
      itemEls[i].parentNode.removeChild(itemEls[i]);
    }

    var entries = [];

    function compareStacking(a, b) {
      var ka = KIND_RANK[a.kind] || 0, kb = KIND_RANK[b.kind] || 0;
      if (ka !== kb) return ka - kb;
      if (a.w !== b.w) return b.w - a.w;
      return b.h - a.h;
    }

    function restackZIndex() {
      var sorted = entries.slice().sort(compareStacking);
      for (var i = 0; i < sorted.length; i++) sorted[i].el.style.zIndex = i + 1;
    }

    function layout() {
      var y = 0;
      for (var i = 0; i < entries.length; i++) {
        if (i > 0 && entries[i].gapBefore) y += GAP;
        entries[i].baseX = entries[i].defaultX;
        entries[i].baseY = y;
        y += entries[i].h + 2 * entries[i].padY;
      }
    }

    var minX, maxX, minY, maxY, contentW, contentH;
    function recomputeContentBounds() {
      if (!entries.length) {
        minX = 0; maxX = 0; minY = 0; maxY = 0; contentW = 0; contentH = 0;
        return;
      }
      minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        minX = Math.min(minX, e.baseX + e.padX);
        maxX = Math.max(maxX, e.baseX + e.padX + e.w);
        minY = Math.min(minY, e.baseY + e.padY);
        maxY = Math.max(maxY, e.baseY + e.padY + e.h);
      }
      contentW = maxX - minX;
      contentH = maxY - minY;
    }

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

    function spawnClickDot(clientX, clientY) {
      var rect = viewport.getBoundingClientRect();
      var dot = document.createElement('div');
      dot.className = 'pz-click-dot';
      dot.style.left = (clientX - rect.left) + 'px';
      dot.style.top = (clientY - rect.top) + 'px';
      dot.addEventListener('animationend', function () {
        if (dot.parentNode) dot.parentNode.removeChild(dot);
      });
      viewport.appendChild(dot);
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

    function removeAllEntries() {
      var toRemove = entries.slice();
      for (var i = 0; i < toRemove.length; i++) deleteEntry(toRemove[i]);
    }

    function resetImages() {
      removeAllEntries();
      for (var i = 0; i < originalTemplates.length; i++) {
        var clone = originalTemplates[i].cloneNode(true);
        stage.insertBefore(clone, highlight);
        entries.push(makeEntry(clone, true));
      }
      restackZIndex();
      layout();
      recomputeContentBounds();
      for (var i = 0; i < entries.length; i++) applyItem(entries[i]);
      syncHighlight();
    }

    function clearImages() {
      removeAllEntries();
      recomputeContentBounds();
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
    var pressEntry = null, pressX = 0, pressY = 0;
    var repeatEdge = null, repeatStartClientX = 0, repeatStartTileFrom = 0, repeatStartTileTo = 0;
    var dragStartDragX = 0, dragStartDragY = 0;

    function endDragUI() {
      setDeleteTarget(false);
      setDeleteHover(false);
      if (sidebarToggle) {
        sidebarToggle.textContent = toggleGlyph();
        sidebarToggle.setAttribute('aria-label', 'Modes and Chords');
      }
      if (sidebar) sidebar.classList.remove('suppress-hover');
      viewport.classList.remove('dragging');
      dragEntry = null;
      pressEntry = null;
      repeatEdge = null;
      draggingCanvas = false;
    }

    function cancelDrag() {
      if (!dragEntry) return;
      if (repeatEdge) {
        if (dragEntry.tileFrom !== repeatStartTileFrom || dragEntry.tileTo !== repeatStartTileTo) {
          dragEntry.tileFrom = repeatStartTileFrom;
          dragEntry.tileTo = repeatStartTileTo;
          rebuildRepeat(dragEntry);
          applyItem(dragEntry);
          recomputeContentBounds();
        }
      } else {
        dragEntry.dragX = dragStartDragX;
        dragEntry.dragY = dragStartDragY;
        applyItem(dragEntry);
      }
      if (hoveredEntry === dragEntry) syncHighlight();
      endDragUI();
    }

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
        pressEntry = dragEntry;
        pressX = e.clientX;
        pressY = e.clientY;
        dragStartDragX = dragEntry.dragX;
        dragStartDragY = dragEntry.dragY;
        repeatEdge = dragEntry.repeatable ? edgeAt(dragEntry.svg.getBoundingClientRect(), e.clientX) : null;
        if (repeatEdge) {
          repeatStartClientX = e.clientX;
          repeatStartTileFrom = dragEntry.tileFrom;
          repeatStartTileTo = dragEntry.tileTo;
        } else {
          setDeleteTarget(true);
          if (sidebarToggle) {
            sidebarToggle.innerHTML = TRASH_ICON;
            sidebarToggle.setAttribute('aria-label', 'Delete');
          }
        }
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
      if (dragEntry && repeatEdge) {
        var totalDx = (e.clientX - repeatStartClientX) / scale;
        var steps = octaveSteps(totalDx);
        var newTileFrom = dragEntry.tileFrom, newTileTo = dragEntry.tileTo;
        if (repeatEdge === 'right') newTileTo = Math.max(dragEntry.tileFrom, Math.min(MAX_REPEAT, repeatStartTileTo + steps));
        else newTileFrom = Math.max(-MAX_REPEAT, Math.min(dragEntry.tileTo, repeatStartTileFrom + steps));
        if (newTileFrom !== dragEntry.tileFrom || newTileTo !== dragEntry.tileTo) {
          dragEntry.tileFrom = newTileFrom;
          dragEntry.tileTo = newTileTo;
          rebuildRepeat(dragEntry);
          applyItem(dragEntry);
          recomputeContentBounds();
          if (hoveredEntry === dragEntry) syncHighlight();
        }
      } else if (dragEntry) {
        dragEntry.dragX += dx / scale;
        dragEntry.dragY += dy / scale;
        applyItem(dragEntry);
        if (hoveredEntry === dragEntry) syncHighlight();
        setDeleteHover(isOverDeleteZone(e.clientX, e.clientY));
      } else {
        panX += dx;
        panY += dy;
        applyStage();
      }
    });

    window.addEventListener('mouseup', function (e) {
      if (repeatEdge) {
      } else if (dragEntry && isOverDeleteZone(e.clientX, e.clientY)) {
        deleteEntry(dragEntry);
      } else if (pressEntry && dragEntry === pressEntry) {
        var moved = Math.hypot(e.clientX - pressX, e.clientY - pressY);
        if (moved <= CLICK_MAX_MOVE) {
          var midi = noteAtPoint(pressEntry, e.clientX, e.clientY);
          if (midi !== null) {
            playNote(midi);
            spawnClickDot(e.clientX, e.clientY);
          }
        }
      }
      endDragUI();
    });

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && dragEntry) {
        e.preventDefault();
        cancelDrag();
      }
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
    var clearImagesBtn = root.querySelector('.clear-images');
    if (clearImagesBtn) clearImagesBtn.addEventListener('click', clearImages);

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
    var collapsedDropZone = root.querySelector('.pz-collapsed-drop-zone');
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

    function toggleGlyph() {
      return (sidebar && sidebar.classList.contains('collapsed')) ? '+' : '‹';
    }

    function isOverDeleteZone(clientX, clientY) {
      return !!((sidebar && pointInRect(clientX, clientY, sidebar)) ||
        (sidebarToggle && pointInRect(clientX, clientY, sidebarToggle)) ||
        (collapsedDropZone && collapsedDropZone.classList.contains('delete-target') && pointInRect(clientX, clientY, collapsedDropZone)));
    }

    function setDeleteHover(on) {
      if (sidebar) sidebar.classList.toggle('delete-target-hover', on);
      if (sidebarToggle) sidebarToggle.classList.toggle('delete-target-hover', on);
      if (collapsedDropZone) collapsedDropZone.classList.toggle('delete-target-hover', on);
    }

    function setDeleteTarget(on) {
      if (sidebar) sidebar.classList.toggle('delete-target', on);
      if (sidebarToggle) sidebarToggle.classList.toggle('delete-target', on);
      if (collapsedDropZone) collapsedDropZone.classList.toggle('delete-target', on && sidebar && sidebar.classList.contains('collapsed'));
    }

    if (sidebarToggle && sidebar) {
      sidebarToggle.addEventListener('click', function () {
        var collapsed = sidebar.classList.toggle('collapsed');
        sidebarToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        sidebarToggle.textContent = toggleGlyph();
      });
    }

    if (sidebar) {
      var groupToggles = sidebar.querySelectorAll('.pz-sidebar-group-toggle');
      for (var gti = 0; gti < groupToggles.length; gti++) {
        (function (btn) {
          btn.addEventListener('click', function () {
            var group = btn.closest('.pz-sidebar-group');
            if (!group) return;
            var collapsed = group.classList.toggle('collapsed');
            btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
          });
        })(groupToggles[gti]);
      }
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
        wrapper.setAttribute('data-kind', itemEl.getAttribute('data-kind'));
        wrapper.appendChild(clone);
        stage.insertBefore(wrapper, highlight);

        var newEntry = makeEntry(wrapper);
        var dropX = (e.clientX - vpRect.left - panX) / scale;
        var dropY = (e.clientY - vpRect.top - panY) / scale;
        newEntry.baseX = Math.round(dropX / GRID) * GRID;
        newEntry.baseY = Math.round(dropY / GRID) * GRID;
        entries.push(newEntry);
        restackZIndex();
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
