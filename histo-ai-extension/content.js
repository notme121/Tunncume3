// HistoLens AI v3 - Exam-Aligned 4-Layer GI Tract Inspector, Freeze-ROI & Start/Stop Segmenter

(() => {
  if (window.__HISTOLENS_INJECTED__) return;
  window.__HISTOLENS_INJECTED__ = true;

  let currentMode = 'lens'; // 'lens' | 'quiz' | 'map' | 'off'
  let segScale = 'gland'; // 'cell' | 'gland' (default: clear sub-layer/gland/duct span) | 'layer'
  let isFrozen = false;
  let isSelectingRoi = false;
  let roiStart = null;
  let activeRoi = null;

  let quizSubMode = 'hunt';
  let viewportImage = null;
  let offscreenCanvas = document.createElement('canvas');
  let offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
  let isCapturing = false;

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let rafPending = false;

  let activeRegions = [];
  let lockedSegments = [];
  let currentQuizIndex = 0;
  let quizScore = 0;
  let quizStreak = 0;
  let lastDeepScanTime = 0;

  const root = document.createElement('div');
  root.id = 'histolens-root';

  root.innerHTML = `
    <canvas id="histolens-freeze-canvas"></canvas>
    <canvas id="histolens-seg-canvas"></canvas>

    <div id="histolens-roi-box">
      <div id="histolens-roi-badge">
        <span id="hl-roi-dims">Selected Section</span>
        <button id="hl-roi-analyze-btn" class="hl-btn hl-active" style="padding:2px 7px;font-size:10px;">⚡ Analyze Section</button>
        <button id="hl-roi-clear-btn" class="hl-btn" style="padding:2px 6px;font-size:10px;">✕</button>
      </div>
    </div>

    <!-- Cursor-Following Exam Inspector Card -->
    <div id="histolens-cursor-card">
      <div class="hl-card-top">
        <canvas id="histolens-zoom-canvas" width="76" height="76"></canvas>
        <div class="hl-card-meta">
          <div class="hl-badge-row">
            <span id="hl-card-layer" class="hl-layer-pill">1. Mucosa</span>
            <span id="hl-card-cellspan" class="hl-cell-pill">Epithelium / Tissue</span>
          </div>
          <div id="hl-card-title" class="hl-struct-title">Move cursor over slide...</div>
          <div id="hl-card-sub" class="hl-struct-sub">Shows exact exam layer & where it starts/stops</div>
        </div>
      </div>
      <div id="hl-card-tip" class="hl-card-tip">
        📐 <strong>Start/Stop:</strong> Green contour + <strong style="color:#34d399;">▲ START / ▼ STOP</strong> brackets mark exact boundaries.
      </div>
      <div class="hl-card-hint">
        <span id="hl-card-coords">Click to Pin Outline</span>
        <span id="hl-card-engine">Shift+Click = Deep AI</span>
      </div>
    </div>

    <!-- Interactive Quiz Banner -->
    <div id="histolens-quiz-banner">
      <div class="hl-quiz-top">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="background:#9333ea;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;">EXAM QUIZ</span>
          <span id="hl-quiz-score" style="font-size:12px;font-weight:700;color:#e2e8f0;">Score: 0 • Streak: 0 🔥</span>
        </div>
        <div class="hl-quiz-mode-switch">
          <button id="hl-qmode-hunt" class="hl-btn hl-active">🎯 Spot & Click</button>
          <button id="hl-qmode-pin" class="hl-btn">❓ Mystery Pin</button>
          <button id="hl-quiz-next" class="hl-btn">Next →</button>
        </div>
      </div>
      <div id="hl-quiz-prompt" class="hl-quiz-prompt">
        🎯 Move your cursor and CLICK on the exam structure!
      </div>
      <div id="hl-quiz-choices" class="hl-quiz-choices" style="display:none;"></div>
      <div id="hl-quiz-feedback" class="hl-quiz-feedback"></div>
    </div>

    <div id="histolens-pins-layer"></div>

    <!-- Floating Control Dock -->
    <div id="histolens-dock">
      <div class="hl-dock-header">
        <div class="hl-brand">
          <span class="hl-dot"></span>
          <span>HistoLens AI (GI Exam)</span>
        </div>
        <div style="display:flex;gap:4px;">
          <button id="hl-btn-freeze" class="hl-btn" title="Freeze screen & drag a box over one section">❄️ Freeze & Crop</button>
          <button id="hl-btn-clear-locks" class="hl-btn" title="Clear pinned outlines">🧹 Clear</button>
          <button id="hl-btn-sidepanel" class="hl-btn" title="Open Exam Cheat Sheet Panel">📑</button>
        </div>
      </div>

      <div class="hl-mode-group">
        <button id="hl-mode-lens" class="hl-btn hl-active">🔬 Cursor Lens</button>
        <button id="hl-mode-quiz" class="hl-btn">🎯 Exam Quiz</button>
        <button id="hl-mode-map" class="hl-btn">🗺️ All Layers</button>
      </div>

      <div class="hl-seg-group">
        <span style="font-size:10px;color:#94a3b8;font-weight:600;">Start/Stop Span:</span>
        <div style="display:flex;gap:3px;">
          <button id="hl-seg-cell" class="hl-btn" style="padding:3px 7px;font-size:10px;">🦠 Single Cell</button>
          <button id="hl-seg-gland" class="hl-btn hl-active" style="padding:3px 7px;font-size:10px;">🧬 Gland / Duct</button>
          <button id="hl-seg-layer" class="hl-btn" style="padding:3px 7px;font-size:10px;">🧱 Wall Layer</button>
        </div>
      </div>

      <div class="hl-dock-footer">
        <span id="hl-status-text">▲ START / ▼ STOP brackets active • Click to pin</span>
        <button id="hl-mode-off" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:10px;padding:0;">Hide (Alt+H)</button>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  const freezeCanvas = document.getElementById('histolens-freeze-canvas');
  const freezeCtx = freezeCanvas.getContext('2d');
  const segCanvas = document.getElementById('histolens-seg-canvas');
  const segCtx = segCanvas.getContext('2d');
  const roiBox = document.getElementById('histolens-roi-box');
  const roiDims = document.getElementById('hl-roi-dims');

  const cursorCard = document.getElementById('histolens-cursor-card');
  const zoomCanvas = document.getElementById('histolens-zoom-canvas');
  const zoomCtx = zoomCanvas.getContext('2d');
  const cardLayer = document.getElementById('hl-card-layer');
  const cardCellSpan = document.getElementById('hl-card-cellspan');
  const cardTitle = document.getElementById('hl-card-title');
  const cardSub = document.getElementById('hl-card-sub');
  const cardTip = document.getElementById('hl-card-tip');
  const cardCoords = document.getElementById('hl-card-coords');
  const cardEngine = document.getElementById('hl-card-engine');

  const quizBanner = document.getElementById('histolens-quiz-banner');
  const quizScoreEl = document.getElementById('hl-quiz-score');
  const quizPromptEl = document.getElementById('hl-quiz-prompt');
  const quizChoicesEl = document.getElementById('hl-quiz-choices');
  const quizFeedbackEl = document.getElementById('hl-quiz-feedback');
  const pinsLayer = document.getElementById('histolens-pins-layer');
  const dock = document.getElementById('histolens-dock');
  const statusText = document.getElementById('hl-status-text');
  const freezeBtn = document.getElementById('hl-btn-freeze');

  function resizeCanvases() {
    segCanvas.width = window.innerWidth;
    segCanvas.height = window.innerHeight;
    if (!isFrozen) {
      freezeCanvas.width = window.innerWidth;
      freezeCanvas.height = window.innerHeight;
    }
  }
  resizeCanvases();
  window.addEventListener('resize', resizeCanvases);

  function getPageContext() {
    const title = document.title || '';
    const url = window.location.href || '';
    const bodySnippet = (document.body?.innerText || '').slice(0, 900).replace(/\s+/g, ' ');
    return { title, url, slideText: bodySnippet };
  }

  async function captureViewportBuffer() {
    if (isCapturing || currentMode === 'off') return null;
    isCapturing = true;
    cursorCard.style.visibility = 'hidden';
    segCanvas.style.visibility = 'hidden';

    try {
      const res = await chrome.runtime.sendMessage({ type: 'CAPTURE_VIEWPORT' });
      if (res?.ok && res.dataUrl) {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = res.dataUrl;
        });
        viewportImage = img;
        offscreenCanvas.width = window.innerWidth;
        offscreenCanvas.height = window.innerHeight;
        offscreenCtx.drawImage(img, 0, 0, window.innerWidth, window.innerHeight);
        return res.dataUrl;
      }
    } catch (err) {
      console.warn('Viewport capture error:', err);
    } finally {
      cursorCard.style.visibility = 'visible';
      segCanvas.style.visibility = 'visible';
      isCapturing = false;
    }
    return null;
  }

  async function toggleFreezeAndCrop() {
    if (isFrozen) {
      isFrozen = false;
      isSelectingRoi = false;
      activeRoi = null;
      freezeCanvas.style.display = 'none';
      freezeCanvas.style.pointerEvents = 'none';
      roiBox.style.display = 'none';
      freezeBtn.classList.remove('hl-freeze-active');
      freezeBtn.textContent = '❄️ Freeze & Crop';
      statusText.textContent = 'Unfrozen • Live Start/Stop boundary active';
      return;
    }

    statusText.textContent = 'Freezing screen...';
    const dataUrl = await captureViewportBuffer();
    if (!dataUrl || !viewportImage) return;

    isFrozen = true;
    freezeCanvas.width = window.innerWidth;
    freezeCanvas.height = window.innerHeight;
    freezeCtx.drawImage(viewportImage, 0, 0, window.innerWidth, window.innerHeight);
    freezeCanvas.style.display = 'block';
    freezeCanvas.style.pointerEvents = 'auto';
    freezeCanvas.style.cursor = 'crosshair';

    freezeBtn.classList.add('hl-freeze-active');
    freezeBtn.textContent = '🔥 Unfreeze';
    statusText.textContent = '❄️ Frozen! Drag a box over any section to isolate ONLY that area.';
  }

  freezeCanvas.addEventListener('mousedown', (e) => {
    if (!isFrozen || e.shiftKey) return;
    isSelectingRoi = true;
    roiStart = { x: e.clientX, y: e.clientY };
    activeRoi = { x: e.clientX, y: e.clientY, w: 0, h: 0 };
    roiBox.style.display = 'block';
    roiBox.style.left = `${e.clientX}px`;
    roiBox.style.top = `${e.clientY}px`;
    roiBox.style.width = '0px';
    roiBox.style.height = '0px';
  });

  window.addEventListener('mousemove', (e) => {
    if (isSelectingRoi && roiStart) {
      const x = Math.min(roiStart.x, e.clientX);
      const y = Math.min(roiStart.y, e.clientY);
      const w = Math.abs(e.clientX - roiStart.x);
      const h = Math.abs(e.clientY - roiStart.y);
      activeRoi = { x, y, w, h };
      roiBox.style.left = `${x}px`;
      roiBox.style.top = `${y}px`;
      roiBox.style.width = `${w}px`;
      roiBox.style.height = `${h}px`;
      roiDims.textContent = `Section: ${Math.round(w)} × ${Math.round(h)} px`;
    }
  });

  window.addEventListener('mouseup', () => {
    if (!isSelectingRoi) return;
    isSelectingRoi = false;
    if (activeRoi && (activeRoi.w < 28 || activeRoi.h < 28)) {
      roiBox.style.display = 'none';
      activeRoi = null;
      lockCurrentSegment(mouseX, mouseY);
    } else if (activeRoi) {
      statusText.textContent = 'Section isolated! Hover inside to see exact Start/Stop boundaries.';
    }
  });

  document.getElementById('hl-roi-analyze-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!activeRoi || activeRoi.w < 25) return;
    statusText.textContent = '⚡ Analyzing isolated section...';
    const scanRes = await chrome.runtime.sendMessage({
      type: 'SCAN_FULL_VIEWPORT',
      payload: { pageContext: getPageContext(), isRoiCrop: true }
    });
    if (scanRes?.ok && scanRes.data?.regions) {
      activeRegions = scanRes.data.regions;
      statusText.textContent = `Isolated section ready (${activeRegions.length} exam layers mapped)`;
    }
  });

  document.getElementById('hl-roi-clear-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    activeRoi = null;
    roiBox.style.display = 'none';
  });

  // Edge-Aware H&E Region Segmenter showing exact START and STOP boundaries
  function segmentAtPoint(cx, cy, scaleMode) {
    if (!viewportImage || offscreenCanvas.width === 0) return null;

    let radius = 24;
    let step = 1;
    let colorThresh = 26;

    if (scaleMode === 'gland') {
      radius = 65;
      step = 2;
      colorThresh = 36;
    } else if (scaleMode === 'layer') {
      radius = 125;
      step = 3;
      colorThresh = 45;
    }

    const x0 = Math.max(0, Math.round(cx - radius));
    const y0 = Math.max(0, Math.round(cy - radius));
    const x1 = Math.min(offscreenCanvas.width - 1, Math.round(cx + radius));
    const y1 = Math.min(offscreenCanvas.height - 1, Math.round(cy + radius));
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (w < 4 || h < 4) return null;

    const imgData = offscreenCtx.getImageData(x0, y0, w, h).data;
    const gw = Math.floor(w / step);
    const gh = Math.floor(h / step);
    const seedGX = Math.min(gw - 1, Math.max(0, Math.floor((cx - x0) / step)));
    const seedGY = Math.min(gh - 1, Math.max(0, Math.floor((cy - y0) / step)));

    function getRGB(gx, gy) {
      const px = Math.min(w - 1, gx * step);
      const py = Math.min(h - 1, gy * step);
      const idx = (py * w + px) * 4;
      return [imgData[idx], imgData[idx + 1], imgData[idx + 2]];
    }

    let sr = 0, sg = 0, sb = 0, sc = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const [r, g, b] = getRGB(
          Math.min(gw - 1, Math.max(0, seedGX + dx)),
          Math.min(gh - 1, Math.max(0, seedGY + dy))
        );
        sr += r; sg += g; sb += b; sc++;
      }
    }
    sr /= sc; sg /= sc; sb /= sc;

    const visited = new Uint8Array(gw * gh);
    const mask = new Uint8Array(gw * gh);
    const queue = [seedGY * gw + seedGX];
    visited[seedGY * gw + seedGX] = 1;
    mask[seedGY * gw + seedGX] = 1;

    let minGX = seedGX, maxGX = seedGX, minGY = seedGY, maxGY = seedGY;
    const maxGridDist = Math.floor(radius / step);
    let head = 0;

    while (head < queue.length) {
      const curr = queue[head++];
      const gx = curr % gw;
      const gy = Math.floor(curr / gw);
      const [cr, cg, cb] = getRGB(gx, gy);

      const neighbors = [[gx - 1, gy], [gx + 1, gy], [gx, gy - 1], [gx, gy + 1]];
      for (let i = 0; i < 4; i++) {
        const nx = neighbors[i][0];
        const ny = neighbors[i][1];
        if (nx < 0 || nx >= gw || ny < 0 || ny >= gh) continue;
        const nIdx = ny * gw + nx;
        if (visited[nIdx]) continue;
        visited[nIdx] = 1;

        const distFromSeed = Math.hypot(nx - seedGX, ny - seedGY);
        if (distFromSeed > maxGridDist) continue;

        const [nr, ng, nb] = getRGB(nx, ny);
        const diffSeed = Math.sqrt(1.15 * (nr - sr) ** 2 + 1.45 * (ng - sg) ** 2 + 1.2 * (nb - sb) ** 2);
        const diffLocal = Math.sqrt((nr - cr) ** 2 + (ng - cg) ** 2 + (nb - cb) ** 2);
        const distPenalty = scaleMode === 'cell' ? (distFromSeed / maxGridDist) * 10 : 0;

        if (diffSeed + distPenalty <= colorThresh && diffLocal <= colorThresh * 0.85) {
          mask[nIdx] = 1;
          queue.push(nIdx);
          if (nx < minGX) minGX = nx;
          if (nx > maxGX) maxGX = nx;
          if (ny < minGY) minGY = ny;
          if (ny > maxGY) maxGY = ny;
        }
      }
    }

    const boundaryPts = [];
    const fillPts = [];
    for (let gy = minGY; gy <= maxGY; gy++) {
      for (let gx = minGX; gx <= maxGX; gx++) {
        const idx = gy * gw + gx;
        if (!mask[idx]) continue;
        const sx = x0 + gx * step;
        const sy = y0 + gy * step;
        fillPts.push([sx, sy]);

        const isEdge =
          gx === 0 || gx === gw - 1 || gy === 0 || gy === gh - 1 ||
          !mask[gy * gw + (gx - 1)] || !mask[gy * gw + (gx + 1)] ||
          !mask[(gy - 1) * gw + gx] || !mask[(gy + 1) * gw + gx];
        if (isEdge) boundaryPts.push([sx, sy]);
      }
    }

    const bbox = {
      left: x0 + minGX * step,
      right: x0 + maxGX * step + step,
      top: y0 + minGY * step,
      bottom: y0 + maxGY * step + step,
      width: (maxGX - minGX + 1) * step,
      height: (maxGY - minGY + 1) * step
    };

    return { boundaryPts, fillPts, bbox, step };
  }

  // Draw explicit START and STOP boundary brackets & glowing contour
  function renderSegmentWithStartStop(ctx, seg, fillColor, strokeColor, showStartStopLabels) {
    if (!seg) return;
    const s = seg.step;
    ctx.fillStyle = fillColor;
    for (let i = 0; i < seg.fillPts.length; i++) {
      ctx.fillRect(seg.fillPts[i][0], seg.fillPts[i][1], s, s);
    }

    ctx.fillStyle = strokeColor;
    for (let i = 0; i < seg.boundaryPts.length; i++) {
      ctx.fillRect(seg.boundaryPts[i][0] - 0.5, seg.boundaryPts[i][1] - 0.5, s + 1.2, s + 1.2);
    }

    if (showStartStopLabels && seg.bbox) {
      const { left, right, top, bottom } = seg.bbox;
      const midX = (left + right) / 2;

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      // Top START bracket line
      ctx.moveTo(left, top - 2);
      ctx.lineTo(right, top - 2);
      // Bottom STOP bracket line
      ctx.moveTo(left, bottom + 2);
      ctx.lineTo(right, bottom + 2);
      ctx.stroke();

      // Label pills: ▲ START at top edge, ▼ STOP at bottom edge
      ctx.font = 'bold 10px -apple-system, sans-serif';
      const startTxt = '▲ START';
      const stopTxt = '▼ STOP';
      const stW = ctx.measureText(startTxt).width + 8;
      const spW = ctx.measureText(stopTxt).width + 8;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.fillRect(midX - stW / 2, Math.max(4, top - 18), stW, 14);
      ctx.strokeRect(midX - stW / 2, Math.max(4, top - 18), stW, 14);
      ctx.fillStyle = '#34d399';
      ctx.fillText(startTxt, midX - stW / 2 + 4, Math.max(14, top - 8));

      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.fillRect(midX - spW / 2, Math.min(window.innerHeight - 18, bottom + 4), spW, 14);
      ctx.strokeRect(midX - spW / 2, Math.min(window.innerHeight - 18, bottom + 4), spW, 14);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(stopTxt, midX - spW / 2 + 4, Math.min(window.innerHeight - 8, bottom + 14));
    }
  }

  function lockCurrentSegment(x, y) {
    const seg = segmentAtPoint(x, y, segScale);
    if (seg) {
      lockedSegments.push(seg);
      statusText.textContent = `📌 Pinned boundary (#${lockedSegments.length}) • Click "🧹 Clear" to reset`;
    }
  }

  function findClosestExamRegion(normX, normY) {
    if (!activeRegions || activeRegions.length === 0) return null;
    const pctX = normX * 100;
    const pctY = normY * 100;
    let best = activeRegions[0];
    let bestDist = Infinity;

    for (const reg of activeRegions) {
      const dist = Math.hypot(pctX - reg.x, pctY - reg.y);
      if (dist < bestDist) {
        best = reg;
        bestDist = dist;
      }
    }
    return best;
  }

  function updateCursorFrame() {
    rafPending = false;
    if (currentMode === 'off' || isSelectingRoi) return;

    if (currentMode === 'lens') {
      const pad = 26;
      let cx = mouseX + pad;
      let cy = mouseY + pad;
      if (cx + 345 > window.innerWidth) cx = mouseX - 350;
      if (cy + 200 > window.innerHeight) cy = mouseY - 200;
      cursorCard.style.transform = `translate3d(${Math.max(8, cx)}px, ${Math.max(8, cy)}px, 0)`;

      const normX = mouseX / window.innerWidth;
      const normY = mouseY / window.innerHeight;

      const seg = segmentAtPoint(mouseX, mouseY, segScale);
      segCtx.clearRect(0, 0, segCanvas.width, segCanvas.height);
      lockedSegments.forEach((l) => renderSegmentWithStartStop(segCtx, l, 'rgba(245, 158, 11, 0.25)', '#f59e0b', true));
      if (seg) {
        renderSegmentWithStartStop(segCtx, seg, 'rgba(16, 185, 129, 0.26)', '#10b981', true);
      }

      // Draw 3x Zoom Loupe with segmented boundary
      zoomCtx.clearRect(0, 0, 76, 76);
      if (viewportImage) {
        const patchR = 14;
        const sx = Math.max(0, mouseX - patchR);
        const sy = Math.max(0, mouseY - patchR);
        zoomCtx.drawImage(offscreenCanvas, sx, sy, patchR * 2, patchR * 2, 0, 0, 76, 76);
        if (seg) {
          const sf = 76 / (patchR * 2);
          zoomCtx.fillStyle = '#34d399';
          for (let i = 0; i < seg.boundaryPts.length; i++) {
            const [bx, by] = seg.boundaryPts[i];
            const lx = (bx - sx) * sf;
            const ly = (by - sy) * sf;
            if (lx >= 0 && lx <= 76 && ly >= 0 && ly <= 76) {
              zoomCtx.fillRect(lx, ly, 2.2, 2.2);
            }
          }
        }
      }

      if (Date.now() - lastDeepScanTime < 2500) return;

      const examReg = findClosestExamRegion(normX, normY);
      if (examReg) {
        cardLayer.textContent = examReg.layer;
        cardCellSpan.textContent = examReg.tissueType || 'Exam Layer';
        cardTitle.textContent = examReg.name;
        cardSub.textContent = examReg.description;
        cardTip.innerHTML = `📐 <strong>Where it Starts & Stops:</strong> ${examReg.startStop || examReg.examTip}`;
      }
    }
  }

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(updateCursorFrame);
    }
  }, { passive: true });

  window.addEventListener('click', async (e) => {
    if (currentMode === 'off') return;
    if (dock.contains(e.target) || quizBanner.contains(e.target) || roiBox.contains(e.target)) return;

    const normX = e.clientX / window.innerWidth;
    const normY = e.clientY / window.innerHeight;

    if (currentMode === 'quiz' && quizSubMode === 'hunt') {
      e.preventDefault();
      e.stopPropagation();
      evaluateTargetHuntClick(normX, normY);
      return;
    }

    if (currentMode === 'lens' && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      await runDeepPointAnalysis(e.clientX, e.clientY, normX, normY);
      return;
    }

    if (currentMode === 'lens' && !isFrozen) {
      lockCurrentSegment(e.clientX, e.clientY);
    }
  }, true);

  async function runDeepPointAnalysis(clientX, clientY, normX, normY) {
    lastDeepScanTime = Date.now() + 8000;
    cardEngine.textContent = '⚡ AI Checking Exam Rubric...';

    if (!viewportImage) await captureViewportBuffer();

    const patchCanvas = document.createElement('canvas');
    patchCanvas.width = 220;
    patchCanvas.height = 220;
    const pCtx = patchCanvas.getContext('2d');
    if (viewportImage) {
      pCtx.drawImage(offscreenCanvas, Math.max(0, clientX - 110), Math.max(0, clientY - 110), 220, 220, 0, 0, 220, 220);
    }

    const res = await chrome.runtime.sendMessage({
      type: 'ANALYZE_CURSOR_POINT',
      payload: {
        patchBase64: patchCanvas.toDataURL('image/jpeg', 0.88),
        normX,
        normY,
        pageContext: getPageContext()
      }
    });

    if (res?.ok && res.data) {
      const d = res.data;
      lastDeepScanTime = Date.now() + 5000;
      cardLayer.textContent = d.layerTunic;
      cardCellSpan.textContent = d.epitheliumOrTissueType || 'Exam Tissue';
      cardTitle.textContent = d.structureName;
      cardSub.textContent = d.explanation;
      cardTip.innerHTML = `📐 <strong>Start/Stop:</strong> ${d.startStopBoundary || d.examTip}`;
      cardEngine.textContent = d.source || 'AI Verified';
    }
  }

  function renderViewportPins() {
    pinsLayer.innerHTML = '';
    if (currentMode !== 'map') return;

    requestAnimationFrame(() => {
      const frag = document.createDocumentFragment();
      activeRegions.forEach((reg) => {
        const pin = document.createElement('div');
        pin.className = 'hl-viewport-pin';
        pin.style.left = `${reg.x}%`;
        pin.style.top = `${reg.y}%`;
        pin.textContent = `📍 ${reg.name}`;
        pin.addEventListener('click', (ev) => {
          ev.stopPropagation();
          statusText.textContent = `${reg.layer} → ${reg.tissueType}`;
        });
        frag.appendChild(pin);
      });
      pinsLayer.appendChild(frag);
    });
  }

  async function loadQuizQuestion() {
    if (!activeRegions || activeRegions.length === 0) {
      const dataUrl = await captureViewportBuffer();
      const scanRes = await chrome.runtime.sendMessage({
        type: 'SCAN_FULL_VIEWPORT',
        payload: { fullBase64: dataUrl, pageContext: getPageContext() }
      });
      if (scanRes?.ok && scanRes.data?.regions) activeRegions = scanRes.data.regions;
      if (!activeRegions.length) return;
    }

    pinsLayer.innerHTML = '';
    quizFeedbackEl.style.display = 'none';
    const target = activeRegions[currentQuizIndex % activeRegions.length];

    if (quizSubMode === 'hunt') {
      quizChoicesEl.style.display = 'none';
      quizPromptEl.innerHTML = `🎯 <strong>Exam Spot & Click:</strong> Click on:<br><span style="color:#38bdf8;font-size:15px;">${target.name}</span> <span style="font-size:11px;color:#34d399;">[${target.tissueType}]</span>`;
    } else {
      quizPromptEl.innerHTML = `❓ <strong>Mystery Pin:</strong> Identify the layer & tissue type under the pulsing <strong>?</strong> pin:`;
      const mPin = document.createElement('div');
      mPin.className = 'hl-viewport-pin hl-mystery-pin';
      mPin.style.left = `${target.x}%`;
      mPin.style.top = `${target.y}%`;
      mPin.textContent = '?';
      pinsLayer.appendChild(mPin);

      const others = activeRegions.filter((r) => r.id !== target.id).sort(() => 0.5 - Math.random()).slice(0, 3);
      const choices = [target, ...others].sort(() => 0.5 - Math.random());

      quizChoicesEl.innerHTML = '';
      quizChoicesEl.style.display = 'grid';
      choices.forEach((choice) => {
        const btn = document.createElement('button');
        btn.className = 'hl-btn';
        btn.style.padding = '8px 10px';
        btn.style.textAlign = 'left';
        btn.innerHTML = `<strong>${choice.name}</strong><br><span style="font-size:10px;color:#94a3b8;">${choice.tissueType}</span>`;
        btn.addEventListener('click', () => {
          quizFeedbackEl.style.display = 'block';
          if (choice.id === target.id) {
            quizScore += 10; quizStreak += 1;
            quizFeedbackEl.style.background = 'rgba(16, 185, 129, 0.2)';
            quizFeedbackEl.style.border = '1px solid #10b981';
            quizFeedbackEl.style.color = '#a7f3d0';
            quizFeedbackEl.innerHTML = `✅ <strong>Correct! (+10 pts)</strong> ${target.layer} → <strong>${target.name}</strong> (${target.tissueType}).<br><em>${target.startStop}</em>`;
          } else {
            quizStreak = 0;
            quizFeedbackEl.style.background = 'rgba(244, 63, 94, 0.2)';
            quizFeedbackEl.style.border = '1px solid #f43f5e';
            quizFeedbackEl.style.color = '#fecdd3';
            quizFeedbackEl.innerHTML = `❌ <strong>Not quite!</strong> The pin is on <strong>${target.name}</strong> (${target.tissueType}).`;
          }
          quizScoreEl.textContent = `Score: ${quizScore} • Streak: ${quizStreak} 🔥`;
        });
        quizChoicesEl.appendChild(btn);
      });
    }
  }

  function evaluateTargetHuntClick(normX, normY) {
    if (!activeRegions.length) return;
    const target = activeRegions[currentQuizIndex % activeRegions.length];
    const dist = Math.hypot(normX * 100 - target.x, normY * 100 - target.y);
    const hitRadius = (target.radius || 14) * 1.75;

    pinsLayer.innerHTML = '';
    const revealPin = document.createElement('div');
    revealPin.className = 'hl-viewport-pin';
    revealPin.style.left = `${target.x}%`;
    revealPin.style.top = `${target.y}%`;
    revealPin.style.borderColor = dist <= hitRadius ? '#34d399' : '#f43f5e';
    revealPin.textContent = `🎯 ${target.name}`;
    pinsLayer.appendChild(revealPin);

    quizFeedbackEl.style.display = 'block';
    if (dist <= hitRadius) {
      quizScore += 10; quizStreak += 1;
      quizFeedbackEl.style.background = 'rgba(16, 185, 129, 0.2)';
      quizFeedbackEl.style.border = '1px solid #10b981';
      quizFeedbackEl.style.color = '#a7f3d0';
      quizFeedbackEl.innerHTML = `✅ <strong>Spot On! (+10 pts)</strong> ${target.layer}: <strong>${target.name}</strong> (${target.tissueType}).<br><em>${target.startStop}</em>`;
    } else {
      quizStreak = 0;
      quizFeedbackEl.style.background = 'rgba(244, 63, 94, 0.2)';
      quizFeedbackEl.style.border = '1px solid #f43f5e';
      quizFeedbackEl.style.color = '#fecdd3';
      quizFeedbackEl.innerHTML = `❌ <strong>Look at 🎯 ${target.name} on screen:</strong> ${target.startStop}`;
    }
    quizScoreEl.textContent = `Score: ${quizScore} • Streak: ${quizStreak} 🔥`;
  }

  function setMode(mode) {
    currentMode = mode;
    ['lens', 'quiz', 'map'].forEach((m) => {
      const btn = document.getElementById(`hl-mode-${m}`);
      if (btn) btn.classList.toggle('hl-active', m === mode);
    });

    cursorCard.style.display = mode === 'lens' ? 'block' : 'none';
    quizBanner.style.display = mode === 'quiz' ? 'block' : 'none';
    if (mode !== 'lens') segCtx.clearRect(0, 0, segCanvas.width, segCanvas.height);
    pinsLayer.innerHTML = '';

    if (mode === 'map') renderViewportPins();
    if (mode === 'quiz') loadQuizQuestion();
  }

  function setSegScale(scale) {
    segScale = scale;
    ['cell', 'gland', 'layer'].forEach((s) => {
      const btn = document.getElementById(`hl-seg-${s}`);
      if (btn) btn.classList.toggle('hl-active', s === scale);
    });
  }

  document.getElementById('hl-mode-lens').addEventListener('click', () => setMode('lens'));
  document.getElementById('hl-mode-quiz').addEventListener('click', () => setMode('quiz'));
  document.getElementById('hl-mode-map').addEventListener('click', () => setMode('map'));
  document.getElementById('hl-mode-off').addEventListener('click', () => {
    setMode('off');
    dock.style.display = 'none';
  });

  document.getElementById('hl-seg-cell').addEventListener('click', () => setSegScale('cell'));
  document.getElementById('hl-seg-gland').addEventListener('click', () => setSegScale('gland'));
  document.getElementById('hl-seg-layer').addEventListener('click', () => setSegScale('layer'));
  freezeBtn.addEventListener('click', toggleFreezeAndCrop);

  document.getElementById('hl-btn-clear-locks').addEventListener('click', () => {
    lockedSegments = [];
    segCtx.clearRect(0, 0, segCanvas.width, segCanvas.height);
    statusText.textContent = 'Cleared pinned boundaries.';
  });

  document.getElementById('hl-btn-sidepanel').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
  });

  document.getElementById('hl-qmode-hunt').addEventListener('click', () => {
    quizSubMode = 'hunt';
    document.getElementById('hl-qmode-hunt').classList.add('hl-active');
    document.getElementById('hl-qmode-pin').classList.remove('hl-active');
    loadQuizQuestion();
  });

  document.getElementById('hl-qmode-pin').addEventListener('click', () => {
    quizSubMode = 'pin';
    document.getElementById('hl-qmode-pin').classList.add('hl-active');
    document.getElementById('hl-qmode-hunt').classList.remove('hl-active');
    loadQuizQuestion();
  });

  document.getElementById('hl-quiz-next').addEventListener('click', () => {
    currentQuizIndex++;
    loadQuizQuestion();
  });

  let panTimer = null;
  function scheduleSync() {
    if (currentMode === 'off' || isFrozen) return;
    clearTimeout(panTimer);
    panTimer = setTimeout(() => {
      captureViewportBuffer();
    }, 450);
  }
  window.addEventListener('mouseup', scheduleSync, { passive: true });
  window.addEventListener('wheel', scheduleSync, { passive: true });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'TOGGLE_HUD') {
      if (dock.style.display === 'none') {
        dock.style.display = 'flex';
        setMode('lens');
      } else {
        setMode('off');
        dock.style.display = 'none';
      }
      sendResponse({ ok: true });
    } else if (msg.type === 'SET_MODE') {
      dock.style.display = 'flex';
      setMode(msg.mode);
      sendResponse({ ok: true });
    } else if (msg.type === 'TRIGGER_SCAN') {
      toggleFreezeAndCrop();
      sendResponse({ ok: true });
    }
    return false;
  });

  setMode('lens');
  setTimeout(async () => {
    const dataUrl = await captureViewportBuffer();
    const scanRes = await chrome.runtime.sendMessage({
      type: 'SCAN_FULL_VIEWPORT',
      payload: { fullBase64: dataUrl, pageContext: getPageContext() }
    });
    if (scanRes?.ok && scanRes.data?.regions) {
      activeRegions = scanRes.data.regions;
    }
  }, 600);
})();
