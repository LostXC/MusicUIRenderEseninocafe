/* ══════════════════════════════════════════════
   Music UI Render – app.js
   Matches Cavalry 1:1 (Smooth Liquid Deformation)
   ══════════════════════════════════════════════ */

// ── Config ──
const CFG = {
  // Layout
  artSize: 98, artInset: 12, artRadius: 10,
  textGap: 10, rightPad: 20,
  cornerRadius: 20, strokeWidth: 7, padding: 40, // More padding for noise "breathing" room
  minWidth: 0, // Set to 0 so it perfectly hugs the text width instead of forcing a 504px minimum 
  uiScale: window.devicePixelRatio || 2, // Dynamic high-DPI scaling for sharp rendering
  exportScale: 1,       // Actual resolution parameter for the .MOV file

  // Album Art Zoom & Crop
  artZoomMin: 0.5,
  artZoomMax: 3.0,
  artZoomStep: 0.1,

  // Cavalry Rectangle Shape Divisions (Lowered for smoother interpolation)
  divW: 240,
  divH: 80,
  divCorner: 10,

  // Cavalry Noise Deformer (Adjusted for "Liquid" feel)
  noiseFreq: 4.2,
  noiseCoordScale: 0.006,
  noiseTimeScale: 2.5,
  noiseAmp: 2,

  // Animation timing
  strokeEnd: 520,
  fillStart: 320, fillEnd: 800,
  contentStart: 440, contentEnd: 800,

  // Skull Animation (Cavalry margin compensation: 1920x1080 -> skull is at ~90, 590)
  skullScale: 0.90,
  skullFramesCount: 23,
  skullFPS: 25,

  // Piercing Animation
  piercingScale: 1,
  piercingFramesCount: 35,
  piercingFPS: 25,
  piercingDuration: 1400, // 35 frames at 25fps = 1400ms

  // Export settings
  fps: 25,
  idleDuration: 7200,
};

const CONTAINER_H = CFG.artInset * 2 + CFG.artSize;
const TEXT_X = CFG.artInset + CFG.artSize + CFG.textGap;

// ── State ──
let seed = Math.random() * 1000;

// Load default album art
let albumArtImg = null;
(function loadDefaultArt() {
  const img = new Image();
  img.onload = () => { albumArtImg = img; };
  img.src = 'assets/default-album-art.png';
})();

// Load Clock Icon
let clockIconImg = null;
(function loadClockIcon() {
  const img = new Image();
  img.onload = () => { clockIconImg = img; };
  img.src = 'assets/icon-clock.svg';
})();

let containerW = 504;
let loopId = null;
let loopStart = null;
let introActive = false;

const state = {
  title: 'Big Iron',
  artist: 'Marty Robbins',
  album: 'Gunfighter Ballads And Trail Songs',
  duration: '3:55',
  useAnim: false,
  extraStyling: false,
  artZoom: 1,
};

const skullFrames = [];
function preloadSkull() {
  for (let i = 0; i < CFG.skullFramesCount; i++) {
    const img = new Image();
    img.src = `assets/skull/Test.${String(i).padStart(5, '0')}.svg`;
    skullFrames.push(img);
  }
}
preloadSkull();

const piercingFrames = [];
function preloadPiercing() {
  for (let i = 0; i < CFG.piercingFramesCount; i++) {
    const img = new Image();
    img.src = `assets/piercing/PiercingStylingWithIntro.${String(i).padStart(5, '0')}.svg`;
    piercingFrames.push(img);
  }
}
preloadPiercing();

// ── DOM ──
const canvas = document.getElementById('renderCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: false });
const uploadZone = document.getElementById('uploadZone');
const artUpload = document.getElementById('artUpload');
const uploadPreview = document.getElementById('uploadPreview');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const titleInput = document.getElementById('titleInput');
const artistInput = document.getElementById('artistInput');
const albumInput = document.getElementById('albumInput');
const durationInput = document.getElementById('durationInput');
const spotifyInput = document.getElementById('spotifyInput');
const animToggle = document.getElementById('animToggle');
const previewBtn = document.getElementById('previewBtn');
const downloadBtn = document.getElementById('downloadBtn');
const extraToggle = document.getElementById('extraToggle');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomLevelEl = document.getElementById('zoomLevel');

async function handleSpotifyAutofill(urlOrQuery) {
  if (!urlOrQuery) return;

  const hint = spotifyInput.parentElement.querySelector('.hint');
  const oldHint = hint.textContent;
  hint.textContent = "Searching Spotify...";
  hint.style.color = "var(--accent)";

  try {
    const res = await fetch('/spotify-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urlOrQuery })
    });

    if (!res.ok) throw new Error('Failed to fetch Spotify info');
    const info = await res.json();

    // 1. Update State directly from our new precise API fields
    state.title = info.title || "";
    state.artist = info.artist || "";
    state.album = info.album || "";

    // 2. Format duration from milliseconds to "m:ss"
    if (info.duration_ms) {
      const totalSeconds = Math.floor(info.duration_ms / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      state.duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    // 3. Update UI Inputs so the user sees the fetched data
    titleInput.value = state.title;
    artistInput.value = state.artist;
    albumInput.value = state.album;
    durationInput.value = state.duration;

    // 4. Load Album Art from URL
    if (info.thumbnail_url) {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        albumArtImg = img;
        uploadPreview.src = info.thumbnail_url;
        uploadPreview.hidden = false;
        uploadPlaceholder.hidden = true;
        resetArtZoom();
      };
      img.src = info.thumbnail_url;
    }
  } catch (err) {
    console.error("Spotify autofill error:", err);
    hint.textContent = "Track not found or invalid link.";
    hint.style.color = "#ff4444";
    return;
  }

  hint.textContent = oldHint;
  hint.style.color = "";
}

let spotifyTimeout = null;

spotifyInput.addEventListener('input', (e) => {
  clearTimeout(spotifyTimeout);
  const val = e.target.value;
  // Auto-fetch if it looks like a full valid URL, but wait 300ms so we don't spam while they are pasting
  if (val.includes('open.spotify.com/track/')) {
    spotifyTimeout = setTimeout(() => handleSpotifyAutofill(val), 300);
  }
});

// ══════════════════════════════════
// NOISE — Fast 3D Simplex
// ══════════════════════════════════
const Simplex3D = (function () {
  const F3 = 1.0 / 3.0, G3 = 1.0 / 6.0;
  const p = new Uint8Array([151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83.5, 111, 229, 122, 60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180]);
  const perm = new Uint8Array(512), permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; permMod12[i] = (perm[i] % 12); }
  function grad(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y, v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
  return function (xin, yin, zin) {
    let n0, n1, n2, n3;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const X0 = i - t, Y0 = j - t, Z0 = k - t;
    const x0 = xin - X0, y0 = yin - Y0, z0 = zin - Z0;
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2.0 * G3, y2 = y0 - j2 + 2.0 * G3, z2 = z0 - k2 + 2.0 * G3;
    const x3 = x0 - 1.0 + 3.0 * G3, y3 = y0 - 1.0 + 3.0 * G3, z3 = z0 - 1.0 + 3.0 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 < 0) n0 = 0.0; else { t0 *= t0; n0 = t0 * t0 * grad(permMod12[ii + perm[jj + perm[kk]]], x0, y0, z0); }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 < 0) n1 = 0.0; else { t1 *= t1; n1 = t1 * t1 * grad(permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]], x1, y1, z1); }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 < 0) n2 = 0.0; else { t2 *= t2; n2 = t2 * t2 * grad(permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]], x2, y2, z2); }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 < 0) n3 = 0.0; else { t3 *= t3; n3 = t3 * t3 * grad(permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]], x3, y3, z3); }
    return 32.0 * (n0 + n1 + n2 + n3);
  };
})();

// ══════════════════════════════════
// PATH SMOOTHING (The Cavalry Fix)
// ══════════════════════════════════

function buildBasePath(W, H, R) {
  const pts = [];
  // Top
  for (let i = 0; i < CFG.divW; i++) pts.push({ x: R + (W - 2 * R) * (i / CFG.divW), y: 0 });
  // Top-Right
  for (let i = 0; i < CFG.divCorner; i++) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (i / CFG.divCorner);
    pts.push({ x: W - R + R * Math.cos(a), y: R + R * Math.sin(a) });
  }
  // Right
  for (let i = 0; i < CFG.divH; i++) pts.push({ x: W, y: R + (H - 2 * R) * (i / CFG.divH) });
  // Bottom-Right
  for (let i = 0; i < CFG.divCorner; i++) {
    const a = 0 + (Math.PI / 2) * (i / CFG.divCorner);
    pts.push({ x: W - R + R * Math.cos(a), y: H - R + R * Math.sin(a) });
  }
  // Bottom
  for (let i = 0; i < CFG.divW; i++) pts.push({ x: W - R - (W - 2 * R) * (i / CFG.divW), y: H });
  // Bottom-Left
  for (let i = 0; i < CFG.divCorner; i++) {
    const a = Math.PI / 2 + (Math.PI / 2) * (i / CFG.divCorner);
    pts.push({ x: R + R * Math.cos(a), y: H - R + R * Math.sin(a) });
  }
  // Left
  for (let i = 0; i < CFG.divH; i++) pts.push({ x: 0, y: H - R - (H - 2 * R) * (i / CFG.divH) });
  // Top-Left
  for (let i = 0; i < CFG.divCorner; i++) {
    const a = Math.PI + (Math.PI / 2) * (i / CFG.divCorner);
    pts.push({ x: R + R * Math.cos(a), y: R + R * Math.sin(a) });
  }
  return pts;
}

function deformPath(base, time, s) {
  const freq = CFG.noiseFreq * CFG.noiseCoordScale;
  const t = time * CFG.noiseTimeScale;
  return base.map(p => {
    const nx = Simplex3D(p.x * freq + s, p.y * freq + s, t);
    const ny = Simplex3D(p.x * freq + s + 99.9, p.y * freq + s + 99.9, t);
    return { x: p.x + nx * CFG.noiseAmp, y: p.y + ny * CFG.noiseAmp };
  });
}

function traceSmoothPath(c, pts, progress = 1) {
  if (pts.length < 3) return;
  const count = Math.ceil(pts.length * progress);
  if (count < 3) return;

  c.beginPath();
  let p0 = pts[pts.length - 1];
  let p1 = pts[0];
  c.moveTo((p0.x + p1.x) / 2, (p0.y + p1.y) / 2);

  for (let i = 0; i < count; i++) {
    p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    c.quadraticCurveTo(p1.x, p1.y, midX, midY);
  }
  if (progress >= 1) c.closePath();
}

// ══════════════════════════════════
// DYNAMIC SIZING & DRAWING
// ══════════════════════════════════

function measureContainerW() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = '600 30px Inter, -apple-system, sans-serif';
  const tw = ctx.measureText(state.title || ' ').width;
  ctx.font = '500 20px Inter, -apple-system, sans-serif';
  const aw = ctx.measureText(state.album || ' ').width;
  const artW = ctx.measureText(state.artist || ' ').width;
  const durW = ctx.measureText(state.duration || ' ').width;
  
  const topTextContainerW = TEXT_X + Math.max(tw, aw) + CFG.rightPad;
  
  let bottomRowContainerW = TEXT_X + artW + 31.5 + durW;
  if (state.extraStyling) {
    const earringW = 60 * CFG.piercingScale;
    const minSpacing = -30;
    const rightPad = 12;
    bottomRowContainerW += minSpacing + earringW + rightPad;
  } else {
    bottomRowContainerW += CFG.rightPad;
  }

  ctx.restore();

  return Math.max(Math.max(topTextContainerW, bottomRowContainerW), CFG.minWidth);
}

function syncCanvasSize(isExporting = false) {
  const w = Math.ceil(measureContainerW());
  const S = isExporting ? CFG.exportScale : CFG.uiScale;

  if (Math.abs(w - containerW) > 1 || canvas.dataset.currentScale != S) {
    containerW = w;
    canvas.width = Math.floor((containerW + CFG.padding * 2) * S);
    canvas.height = Math.floor((CONTAINER_H + CFG.padding * 2) * S);

    // Keep the CSS visual size identical
    canvas.style.width = (containerW + CFG.padding * 2) + 'px';
    canvas.style.height = (CONTAINER_H + CFG.padding * 2) + 'px';
    canvas.dataset.currentScale = S;
  }
}

function rrPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + r, r); c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.arcTo(x, y + h, x, y + h - r, r); c.arcTo(x, y, x + r, y, r);
  c.closePath();
}

// ══════════════════════════════════
// ALBUM ART — Zoom & Crop
// ══════════════════════════════════

// Computes the source crop rect and destination rect for drawing the
// album art at the current zoom level, using a centered "cover" crop.
// zoom = 1   -> image fully covers the artSize x artSize square (cropped to square, centered)
// zoom > 1   -> crops a smaller centered region of the source (zoomed in)
// zoom < 1   -> shrinks the drawn image within the square, centered (zoomed out, white border)
function getArtDrawRect(img, zoom) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return null;

  const baseCrop = Math.min(iw, ih);
  let cropSize, destSize;

  if (zoom >= 1) {
    cropSize = baseCrop / zoom;
    destSize = CFG.artSize;
  } else {
    cropSize = baseCrop;
    destSize = CFG.artSize * zoom;
  }

  const sx = (iw - cropSize) / 2;
  const sy = (ih - cropSize) / 2;
  const destOffset = (CFG.artSize - destSize) / 2;

  return {
    sx, sy, sSize: cropSize,
    dx: CFG.artInset + destOffset,
    dy: CFG.artInset + destOffset,
    dSize: destSize,
  };
}

function render(introMs, noiseT, isExporting = false) {
  syncCanvasSize(isExporting);
  const S = isExporting ? CFG.exportScale : CFG.uiScale;
  const P = CFG.padding;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.translate(P, P);

  let strokeP = 1, fillA = 1, contentA = 1;
  const clamp = (v) => Math.max(0, Math.min(1, v));

  if (introMs !== Infinity) {
    strokeP = clamp(introMs / CFG.strokeEnd);
    fillA = clamp((introMs - CFG.fillStart) / (CFG.fillEnd - CFG.fillStart));
    contentA = clamp((introMs - CFG.contentStart) / (CFG.contentEnd - CFG.contentStart));
  }

  // Extra Styling Opacity Fade (Frame 9 to 16 if intro is on)
  let stylingAlpha = 1;
  if (introMs !== Infinity && state.useAnim) {
    stylingAlpha = clamp((introMs - 360) / (640 - 360));
  }

  const base = buildBasePath(containerW, CONTAINER_H, CFG.cornerRadius);
  const pts = deformPath(base, noiseT, seed);

  // Fill
  if (fillA > 0) {
    ctx.globalAlpha = fillA;
    ctx.fillStyle = '#ffffff';
    traceSmoothPath(ctx, pts);
    ctx.fill();
  }

  // Stroke
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = CFG.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  traceSmoothPath(ctx, pts, strokeP);
  ctx.stroke();

  // Content
  if (contentA > 0) {
    ctx.globalAlpha = contentA;
    if (albumArtImg) {
      const rect = getArtDrawRect(albumArtImg, state.artZoom || 1);
      if (rect) {
        ctx.save();
        rrPath(ctx, CFG.artInset, CFG.artInset, CFG.artSize, CFG.artSize, CFG.artRadius);
        ctx.clip();
        ctx.drawImage(
          albumArtImg,
          rect.sx, rect.sy, rect.sSize, rect.sSize,
          rect.dx, rect.dy, rect.dSize, rect.dSize
        );
        ctx.restore();
      }
    }

    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';

    const hasAlbum = state.album && state.album.trim().length > 0;

    if (hasAlbum) {
      /* 
        MATH FOR Y COORDINATES:
        Top padding: 12px outer + 2px inner = 14. Font Box = 36, Font Size = 30. Diff = 6. Half Diff = 3. Y = 14 + 3 = 17.
        Gap: 4. Font Box = 24. Font Size = 20. Diff = 4. Half diff = 2. Y = 14 + 36 + 4 + 2 = 56.
        Gap: 4. Font Box = 24. Y = 54 + 24 + 4 + 2 = 84.
      */

      ctx.font = '600 30px Inter, -apple-system, sans-serif';
      ctx.fillText(state.title, TEXT_X, 18);

      ctx.font = '500 20px Inter, -apple-system, sans-serif';
      ctx.fillText(state.album, TEXT_X, 57);

      const artW = ctx.measureText(state.artist || ' ').width;
      ctx.fillText(state.artist, TEXT_X, 86);

      // Draw Clock Icon (shifted 1px up relative to the text)
      if (clockIconImg) {
        ctx.drawImage(clockIconImg, TEXT_X + artW + 8, 84.5, 20, 20);
      }

      ctx.fillText(state.duration, TEXT_X + artW + 31.5, 86);
    } else {
      // If no album exists, the layout block perfectly centers inside the 98px container
      ctx.font = '600 30px Inter, -apple-system, sans-serif';
      ctx.fillText(state.title, TEXT_X, 33);

      ctx.font = '500 20px Inter, -apple-system, sans-serif';
      const artW = ctx.measureText(state.artist || ' ').width;
      ctx.fillText(state.artist, TEXT_X, 72);

      // Draw Clock Icon
      if (clockIconImg) {
        ctx.drawImage(clockIconImg, TEXT_X + artW + 8, 73, 20, 20);
      }

      ctx.fillText(state.duration, TEXT_X + artW + 31.5, 72);
    }
  }

  const getFrame = (framesArr, fps, count) => {
    const frameIdx = (introMs === Infinity)
      ? count - 1
      : Math.min(count - 1, Math.floor((introMs / 1000) * fps));
    return framesArr[frameIdx];
  };

  // Extra Styling (Skull Animation)
  if (state.extraStyling && contentA > 0) {
    const frame = getFrame(skullFrames, CFG.skullFPS, CFG.skullFramesCount);
    if (frame && frame.complete) {
      ctx.save();
      ctx.globalAlpha = contentA * stylingAlpha;
      const sx = 36, sy = 506, sw = 110, sh = 130;
      ctx.drawImage(frame, sx, sy, sw, sh, -34, -50, sw * CFG.skullScale, sh * CFG.skullScale);
      ctx.restore();
    }
  }

  // Extra Styling (Piercing Animation) - Bottom Right
  if (state.extraStyling && contentA > 0) {
    const frame = getFrame(piercingFrames, CFG.piercingFPS, CFG.piercingFramesCount);
    if (frame && frame.complete) {
      ctx.save();
      ctx.globalAlpha = contentA * stylingAlpha;
      const sx = 504, sy = 624, sw = 60, sh = 100;

      const earringW = sw * CFG.piercingScale;
      // Anchor to the right side with user's tweaked padding
      const destX = containerW + 12 - earringW;
      
      // Keep it in the bottom right corner (adjusting textY since it shifted)
      const hasAlbum = state.album && state.album.trim().length > 0;
      const textY = hasAlbum ? 86 : 72;
      const destY = CONTAINER_H - (sh * CFG.piercingScale * 0.8) - 2;

      ctx.drawImage(frame, sx, sy, sw, sh, destX, destY, sw * CFG.piercingScale, sh * CFG.piercingScale);
      ctx.restore();
    }
  }

  ctx.restore();
}

// ══════════════════════════════════
// LOOP & EVENTS
// ══════════════════════════════════

function startLoop() {
  if (loopId) return;
  loopStart = performance.now();
  (function tick(ts) {
    const elapsed = ts - loopStart;
    render(introActive ? elapsed : Infinity, elapsed / 1000);
    loopId = requestAnimationFrame(tick);
  })(performance.now());
}

function stopLoop() { cancelAnimationFrame(loopId); loopId = null; }

function playIntro() {
  if (!state.useAnim) return;
  loopStart = performance.now();
  introActive = true;
  const totalIntroMs = Math.max(CFG.contentEnd, CFG.piercingDuration);
  setTimeout(() => { introActive = false; }, totalIntroMs + 100);
}

// ══════════════════════════════════
// EXPORT — PNG frames → server → .MOV
// ══════════════════════════════════

function showStatus(msg) {
  let ov = document.querySelector('.status-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'status-overlay';
    ov.innerHTML = '<div class="status-box"><div class="spinner"></div><p></p></div>';
    document.body.appendChild(ov);
  }
  ov.querySelector('p').textContent = msg;
  ov.style.display = 'flex';
  return ov;
}
function hideStatus() {
  const ov = document.querySelector('.status-overlay');
  if (ov) ov.style.display = 'none';
}

async function exportMOV() {
  const introDur = state.useAnim ? CFG.contentEnd : 0;
  const totalMs = introDur + CFG.idleDuration;
  const totalFrames = Math.ceil((totalMs / 1000) * CFG.fps);
  const frameDt = 1000 / CFG.fps;

  const overlay = showStatus('Rendering frames…');
  stopLoop();

  const frames = [];
  for (let f = 0; f < totalFrames; f++) {
    const timeMs = f * frameDt;
    const introMs = state.useAnim ? timeMs : Infinity;
    render(introMs, timeMs / 1000, true);
    frames.push(canvas.toDataURL('image/png'));

    if (f % 15 === 0) {
      overlay.querySelector('p').textContent =
        `Rendering frame ${f + 1} / ${totalFrames}…`;
      await new Promise(r => setTimeout(r, 0));
    }
  }

  overlay.querySelector('p').textContent = 'Sending to server…';
  await new Promise(r => setTimeout(r, 0));

  const BATCH = 25;
  const sessionId = Date.now().toString();

  for (let i = 0; i < frames.length; i += BATCH) {
    const batch = frames.slice(i, i + BATCH);
    const res = await fetch('/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: sessionId,
        startIndex: i,
        frames: batch,
        fps: CFG.fps,
        totalFrames,
        final: (i + BATCH) >= frames.length,
      }),
    });

    if (!res.ok) {
      alert('Server error: ' + (await res.text()));
      hideStatus();
      startLoop();
      return;
    }

    if ((i + BATCH) >= frames.length) {
      overlay.querySelector('p').textContent = 'Encoding .mov…';
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `music-ui-${state.title.replace(/\s+/g, '-').toLowerCase()}.mov`;
      a.click();
      URL.revokeObjectURL(a.href);
    } else {
      overlay.querySelector('p').textContent =
        `Uploading frames ${i + 1}–${Math.min(i + BATCH, frames.length)} / ${frames.length}…`;
    }
  }

  hideStatus();
  syncCanvasSize(false);
  startLoop();
}

// ══════════════════════════════════
// EVENTS
// ══════════════════════════════════

function resetArtZoom() {
  state.artZoom = 1;
  updateZoomDisplay();
}

function loadArt(file) {
  const r = new FileReader();
  r.onload = e => {
    const img = new Image();
    img.onload = () => { albumArtImg = img; resetArtZoom(); };
    img.src = e.target.result;
    uploadPreview.src = e.target.result;
    uploadPreview.hidden = false;
    uploadPlaceholder.hidden = true;
  };
  r.readAsDataURL(file);
}

uploadZone.addEventListener('click', () => artUpload.click());
artUpload.addEventListener('change', e => { if (e.target.files[0]) loadArt(e.target.files[0]); });
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault(); uploadZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) loadArt(e.dataTransfer.files[0]);
});

titleInput.addEventListener('input', () => { state.title = titleInput.value || titleInput.placeholder; });
artistInput.addEventListener('input', () => { state.artist = artistInput.value || artistInput.placeholder; });
albumInput.addEventListener('input', () => { state.album = albumInput.value || albumInput.placeholder; });
durationInput.addEventListener('input', () => { state.duration = durationInput.value || durationInput.placeholder; });
animToggle.addEventListener('change', () => { state.useAnim = animToggle.checked; });
previewBtn.addEventListener('click', playIntro);
extraToggle.addEventListener('change', () => { state.extraStyling = extraToggle.checked; });
downloadBtn.addEventListener('click', exportMOV);

// ── Album Art Zoom Controls ──
function updateZoomDisplay() {
  zoomLevelEl.textContent = Math.round(state.artZoom * 100) + '%';
  zoomInBtn.disabled = state.artZoom >= CFG.artZoomMax - 1e-9;
  zoomOutBtn.disabled = state.artZoom <= CFG.artZoomMin + 1e-9;
}

zoomInBtn.addEventListener('click', () => {
  const next = Math.round((state.artZoom + CFG.artZoomStep) * 10) / 10;
  state.artZoom = Math.min(CFG.artZoomMax, next);
  updateZoomDisplay();
});

zoomOutBtn.addEventListener('click', () => {
  const next = Math.round((state.artZoom - CFG.artZoomStep) * 10) / 10;
  state.artZoom = Math.max(CFG.artZoomMin, next);
  updateZoomDisplay();
});

updateZoomDisplay();

document.fonts.ready.then(() => { syncCanvasSize(); startLoop(); });