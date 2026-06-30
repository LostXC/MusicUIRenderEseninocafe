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
  fillStart: 320, fillEnd: 700,
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
  // Keyhole/earring circle centre within the 60×100 sprite (used to align it on the pill)
  piercingCircleDX: 23.66,
  piercingCircleDY: 57.04,
  pillPiercePad: 10,  // equal padding to the left and right of the earring inside the pill
  pillPierceW: 24,    // visible width of the keyhole footprint

  // "Picked by" pill (attachment container at the card's bottom-right)
  pillFont: 20,
  pillPadX: 12,
  pillPadY: 10,
  pillExtension: 30, // how far the pill's top extends up behind the card (like the multichat header)
  pillFadeDelay: 320, // delay the pill's intro fade-in so the card is opaque first and hides its tucked-in top

  // Export settings
  fps: 60,
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
  img.src = 'assets/icons/clock.svg';
})();

let containerW = 504;
let currentLayout = null;
let loopId = null;
let loopStart = null;
let introActive = false;

const state = {
  title: 'Big Iron',
  artist: 'Marty Robbins',
  album: 'Gunfighter Ballads And Trail Songs',
  duration: '3:55',
  pickedBy: '',
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

// Measures the actual opaque bounds of the earring within its 60×100 sprite (from
// the final/static frame) so it can be centred with equal padding on the pill.
let piercingMetrics = null;
function measurePiercing() {
  if (piercingMetrics) return piercingMetrics;
  const frame = piercingFrames[CFG.piercingFramesCount - 1];
  if (!frame || !frame.complete || !frame.naturalWidth) return null;
  const sw = 60, sh = 100;
  try {
    const tc = document.createElement('canvas');
    tc.width = sw; tc.height = sh;
    const t = tc.getContext('2d', { willReadFrequently: true });
    t.drawImage(frame, 504, 624, sw, sh, 0, 0, sw, sh);
    const d = t.getImageData(0, 0, sw, sh).data;
    let minX = sw, maxX = -1, minY = sh, maxY = -1;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        if (d[(y * sw + x) * 4 + 3] > 16) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    piercingMetrics = { cx: (minX + maxX) / 2, w: maxX - minX + 1 };
  } catch (e) { return null; }
  return piercingMetrics;
}

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
const pickedByInput = document.getElementById('pickedByInput');
const spotifyInput = document.getElementById('spotifyInput');
const animToggle = document.getElementById('animToggle');
const previewBtn = document.getElementById('previewBtn');
const downloadBtn = document.getElementById('downloadBtn');
const extraToggle = document.getElementById('extraToggle');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomLevelEl = document.getElementById('zoomLevel');
const themeToggle = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');

async function handleSpotifyAutofill(urlOrQuery) {
  if (!urlOrQuery) return;

  // Look for the label instead
  const label = spotifyInput.closest('.field').querySelector('label');
  let oldLabel = "";
  
  if (label) {
    oldLabel = label.textContent;
    label.textContent = "Loading...";
    label.style.color = "var(--text-muted)";
  } else {
    // If there is no label element, change the placeholder temporarily!
    spotifyInput.placeholder = "Loading...";
  }

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
    
    // Handle error visuals safely
    if (label) {
      label.textContent = "Track not found!";
      label.style.color = "#ff4444";
      setTimeout(() => {
        label.textContent = oldLabel;
        label.style.color = "";
      }, 3000);
    } else {
      spotifyInput.value = "";
      spotifyInput.placeholder = "Track not found!";
      setTimeout(() => {
        spotifyInput.placeholder = "Paste Spotify track URL...";
      }, 3000);
    }
    return;
  }

  // Show 'Done!' temporarily after a successful search
  if (label) {
    label.textContent = "Done!";
    label.style.color = "";
    setTimeout(() => {
      label.textContent = oldLabel;
    }, 2000);
  } else {
    spotifyInput.placeholder = "Done!";
    setTimeout(() => {
      spotifyInput.placeholder = "Paste Spotify track URL...";
    }, 2000);
  }
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

// Computes the full layout for a frame: the main card width, the optional
// "Picked by" pill geometry, where the piercing earring attaches, and the
// overall content bounds (used to size the canvas).
function computeLayout() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const mt = (font, s) => { ctx.font = font; return ctx.measureText(s && s.length ? s : ' ').width; };

  const F30 = '600 30px Inter, -apple-system, sans-serif';
  const F20 = '500 20px Inter, -apple-system, sans-serif';
  const tw = mt(F30, state.title);
  const aw = mt(F20, state.album);
  const artW = mt(F20, state.artist);
  const durW = mt(F20, state.duration);

  const topTextW = TEXT_X + Math.max(tw, aw) + CFG.rightPad;
  const bottomBase = TEXT_X + artW + 31.5 + durW;

  const earringW = 60 * CFG.piercingScale;
  const piercingPad = -30 + earringW + 12; // matches the original bottom-row earring spacing
  const cardNoPierce = Math.max(topTextW, bottomBase + CFG.rightPad, CFG.minWidth);
  const cardPierce = Math.max(topTextW, bottomBase + piercingPad, CFG.minWidth);

  // Earring footprint from the measured sprite bounds (falls back to config).
  const pm = measurePiercing();
  const earCX = (pm ? pm.cx : CFG.piercingCircleDX) * CFG.piercingScale;
  const earVisW = (pm ? pm.w : CFG.pillPierceW) * CFG.piercingScale;
  // Left visual edge of the card's bottom-right keyhole (if the piercing stayed on the
  // card). Once the pill reaches it, the keyhole would overlap the pill text, so the
  // piercing moves to the pill instead.
  const cardKeyholeLeft = cardPierce + 12 - earringW + (earCX - earVisW / 2);

  const name = state.pickedBy || '';
  const pillShow = name.trim().length > 0;

  let pill = null, pierce = null, cardW, overallW;

  if (pillShow) {
    const LF = '500 ' + CFG.pillFont + 'px Inter, -apple-system, sans-serif';
    const NF = '600 ' + CFG.pillFont + 'px Inter, -apple-system, sans-serif';
    const labelW = mt(LF, 'Picked by ');
    const textW = labelW + mt(NF, name);

    ctx.font = NF;
    const fm = ctx.measureText(name + 'Ag');
    const ascent = fm.actualBoundingBoxAscent || CFG.pillFont * 0.72;
    const descent = fm.actualBoundingBoxDescent || CFG.pillFont * 0.28;
    // Visible "tag" = the text with its 10px padding; the border extends further
    // UP (pillExtension) so its rounded top tucks behind the card.
    const tagH = CFG.pillPadY * 2 + ascent + descent;
    const pillH = CFG.pillExtension + tagH;
    const pillNoPierceW = textW + CFG.pillPadX * 2;

    const pillTextRight = CFG.pillPadX + textW; // right edge of the pill's text
    let pillW;
    if (state.extraStyling && (pillTextRight + 18) > cardKeyholeLeft) {
      // The pill text reaches the card's keyhole → the pill gets the piercing (with equal
      // padding on each side) and drives the width.
      pierce = { target: 'pill' };
      pillW = CFG.pillPadX + textW + CFG.pillPiercePad + earVisW + CFG.pillPiercePad;
      cardW = cardNoPierce;
    } else if (state.extraStyling) {
      pierce = { target: 'card' };
      cardW = cardPierce;
      pillW = pillNoPierceW;
    } else {
      cardW = cardNoPierce;
      pillW = pillNoPierceW;
    }

    overallW = Math.max(cardW, pillW);
    const pillR = Math.min(CFG.cornerRadius, pillH / 2, pillW / 2);
    const pillX = 0; // left-aligned with the card
    const pillY = CONTAINER_H - CFG.pillExtension; // top tucked behind the card
    pill = { x: pillX, y: pillY, w: pillW, h: pillH, r: pillR, descent, labelW };

    if (pierce) {
      const sc = CFG.piercingScale;
      if (pierce.target === 'pill') {
        // Centre the keyhole in its slot (equal L/R padding) and align its circle
        // to the vertical centre of the pill text.
        const slotCenter = CFG.pillPadX + textW + CFG.pillPiercePad + earVisW / 2;
        const textCenterY = (pillY + pillH) - CFG.pillPadY - (ascent + descent) / 2;
        pierce.destX = slotCenter - earCX;
        pierce.destY = textCenterY - CFG.piercingCircleDY * sc;
      } else {
        pierce.destX = overallW + 12 - earringW;
        pierce.destY = CONTAINER_H - (100 * sc * 0.8) - 2;
      }
    }
  } else {
    if (state.extraStyling) {
      pierce = { target: 'card' };
      cardW = cardPierce;
    } else {
      cardW = cardNoPierce;
    }
    overallW = cardW;
    if (pierce) {
      const sh = 100;
      pierce.destX = overallW + 12 - earringW;
      pierce.destY = CONTAINER_H - (sh * CFG.piercingScale * 0.8) - 2;
    }
  }

  ctx.restore();

  let contentBottom = CONTAINER_H;
  if (pill) contentBottom = Math.max(contentBottom, pill.y + pill.h);
  if (pierce) contentBottom = Math.max(contentBottom, pierce.destY + 100 * CFG.piercingScale);

  return { cardW, overallW, pill, pierce, contentBottom };
}

function syncCanvasSize(isExporting = false) {
  currentLayout = computeLayout();
  const S = isExporting ? CFG.exportScale : CFG.uiScale;
  const w = Math.ceil(currentLayout.overallW);
  const h = Math.ceil(currentLayout.contentBottom);
  containerW = w;

  const cw = Math.floor((w + CFG.padding * 2) * S);
  const ch = Math.floor((h + CFG.padding * 2) * S);

  if (canvas.width !== cw || canvas.height !== ch || canvas.dataset.currentScale != S) {
    canvas.width = cw;
    canvas.height = ch;
    canvas.style.width = (w + CFG.padding * 2) + 'px';
    canvas.style.height = (h + CFG.padding * 2) + 'px';
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

  // "Picked by" pill fades in on its own, delayed clock so the card is already
  // opaque before it appears (hides the pill top that tucks behind the card).
  let pillFillA = 1, pillContentA = 1;

  if (introMs !== Infinity) {
    strokeP = clamp(introMs / CFG.strokeEnd);
    fillA = clamp((introMs - CFG.fillStart) / (CFG.fillEnd - CFG.fillStart));
    contentA = clamp((introMs - CFG.contentStart) / (CFG.contentEnd - CFG.contentStart));

    const pillMs = introMs - CFG.pillFadeDelay;
    pillFillA = clamp((pillMs - CFG.fillStart) / (CFG.fillEnd - CFG.fillStart));
    pillContentA = clamp((pillMs - CFG.contentStart) / (CFG.contentEnd - CFG.contentStart));
  }

  // Extra Styling Opacity Fade (Frame 9 to 16 if intro is on)
  let stylingAlpha = 1;
  if (introMs !== Infinity && state.useAnim) {
    stylingAlpha = clamp((introMs - 360) / (640 - 360));
  }

  const L = currentLayout;

  // "Picked by" pill — its own boiling outline, drawn BEHIND the card so its
  // top tucks behind and only the bottom-left tag protrudes (like the
  // multichat announcement header).
  if (L.pill && pillFillA > 0) {
    const pillBase = buildBasePath(L.pill.w, L.pill.h, L.pill.r)
      .map(p => ({ x: p.x + L.pill.x, y: p.y + L.pill.y }));
    const pillPts = deformPath(pillBase, noiseT, seed + 137.0);

    ctx.globalAlpha = pillFillA;
    ctx.fillStyle = '#ffffff';
    traceSmoothPath(ctx, pillPts);
    ctx.fill();

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = CFG.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    traceSmoothPath(ctx, pillPts);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const base = buildBasePath(L.overallW, CONTAINER_H, CFG.cornerRadius);
  const pts = deformPath(base, noiseT, seed);

  // Card fill
  if (fillA > 0) {
    ctx.globalAlpha = fillA;
    ctx.fillStyle = '#ffffff';
    traceSmoothPath(ctx, pts);
    ctx.fill();
  }

  // Card stroke
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

  // "Picked by {username}" pill text — sits in the protruding bottom tag.
  if (L.pill && pillContentA > 0) {
    const pl = L.pill;
    ctx.globalAlpha = pillContentA;
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'alphabetic';
    const ty = pl.y + pl.h - CFG.pillPadY - pl.descent;
    const tx = pl.x + CFG.pillPadX;
    ctx.font = '500 ' + CFG.pillFont + 'px Inter, -apple-system, sans-serif';
    ctx.fillText('Picked by ', tx, ty);
    ctx.font = '600 ' + CFG.pillFont + 'px Inter, -apple-system, sans-serif';
    ctx.fillText(state.pickedBy, tx + pl.labelW, ty);
    ctx.globalAlpha = 1;
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

  // Extra Styling (Piercing Animation) - attaches to whichever element is the
  // bottom-right-most: the card normally, or the pill when it drives the width.
  if (state.extraStyling && contentA > 0 && L.pierce) {
    const frame = getFrame(piercingFrames, CFG.piercingFPS, CFG.piercingFramesCount);
    if (frame && frame.complete) {
      ctx.save();
      ctx.globalAlpha = contentA * stylingAlpha;
      const sx = 504, sy = 624, sw = 60, sh = 100;
      ctx.drawImage(frame, sx, sy, sw, sh, L.pierce.destX, L.pierce.destY, sw * CFG.piercingScale, sh * CFG.piercingScale);
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
  // When a "Picked by" pill is shown, keep the intro running long enough for its
  // delayed fade-in to finish, otherwise it would snap to full at the cut-off.
  const pillEnd = (state.pickedBy && state.pickedBy.trim())
    ? CFG.contentEnd + CFG.pillFadeDelay : 0;
  const totalIntroMs = Math.max(CFG.contentEnd, CFG.piercingDuration, pillEnd);
  setTimeout(() => { introActive = false; }, totalIntroMs + 100);
}

// ══════════════════════════════════
// EXPORT — PNG frames → server → .MOV
// ══════════════════════════════════

// ── Rendering frames UI (inline progress above the action buttons) ──
// Replaces the old modal status overlay: a pencil-draw animation plus a
// sine-wave progress bar driven by the real export frame counts.
const renderStatus = document.getElementById('renderStatus');
const renderStatusTitle = document.getElementById('renderStatusTitle');
const renderFrameImg = document.getElementById('renderFrame');
const renderCountEl = document.getElementById('renderCount');
const renderTotalEl = document.getElementById('renderTotal');
const renderProgressTrack = document.getElementById('renderProgressTrack');
const renderProgressSvg = document.getElementById('renderProgressSvg');
const renderProgressPath = document.getElementById('renderProgressPath');
const renderThumb = document.getElementById('renderThumb');

// Pencil-draw animation — time-based so the speed is independent of refresh rate.
const PD_TOTAL = 34, PD_FPS = 30, PD_HOLD = 400;
const PD_FRAME_MS = 1000 / PD_FPS;
const PD_CYCLE_MS = PD_TOTAL * PD_FRAME_MS + PD_HOLD;
const pdSrcs = [];
for (let i = 0; i <= PD_TOTAL; i++) {
  const s = `assets/pencil-draw/pencil-draw.${i}.svg`;
  pdSrcs.push(s); // fallback URL
  
  // Fetch as Blob to prevent network re-validation blocking during export
  fetch(s).then(r => r.blob()).then(b => {
    pdSrcs[i] = URL.createObjectURL(b);
    if (i === 0 && renderFrameImg && !renderUiActive) renderFrameImg.src = pdSrcs[0];
  }).catch(() => {
    const pre = new Image(); pre.src = s; // fallback preload
  });
}
renderFrameImg.src = pdSrcs[0];

// Progress state — exportMOV feeds the *target*; the displayed count eases toward
// it every frame so the bar always glides one frame at a time, instead of jumping
// in upload-batch chunks.
let renderTotalFrames = 0;
let renderTargetFrames = 0;   // real progress (frames confirmed on the server)
let renderedFrames = 0;       // displayed value, eased toward the target
let renderEaseTs = null;      // last ease timestamp (time-based, rAF-rate independent)
let renderUiActive = false;
let renderUiRaf = null;
let pdStart = null, pdShown = -1;

// Sine-wave logic borrowed from the music player's tickPlayer: the wave is drawn
// from x=0 to the thumb, which sits at rendered/total.
function renderUiTick(ts) {
  if (!renderUiActive) return;

  if (pdStart === null) pdStart = ts;
  const t = (ts - pdStart) % PD_CYCLE_MS;
  const idx = Math.min(PD_TOTAL, Math.floor(t / PD_FRAME_MS));   // clamps during HOLD
  if (idx !== pdShown) { renderFrameImg.src = pdSrcs[idx]; pdShown = idx; }

  // Ease the displayed count toward the real target. Time-based (per elapsed ms,
  // not per tick) so it tracks correctly even when rAF is throttled, and always
  // glides instead of jumping in upload-batch chunks.
  const dt = renderEaseTs === null ? 0 : Math.min(250, ts - renderEaseTs);
  renderEaseTs = ts;
  if (renderedFrames !== renderTargetFrames) {
    const k = 1 - Math.exp(-dt / 90);
    renderedFrames += (renderTargetFrames - renderedFrames) * k;
    if (Math.abs(renderTargetFrames - renderedFrames) < 0.5) renderedFrames = renderTargetFrames;
  }

  const progress = renderTotalFrames > 0 ? renderedFrames / renderTotalFrames : 0;
  const w = renderProgressTrack.clientWidth;
  const R = 7;                                   // thumb radius — keep it inside the track
  const thumbX = progress * Math.max(0, w - R);

  renderThumb.style.left = thumbX + 'px';
  renderProgressSvg.style.width = Math.min(w, thumbX + R) + 'px';

  let d = 'M 0 7';
  if (thumbX > 0) {
    const segments = Math.max(10, Math.floor(thumbX / 2));
    d = '';
    for (let i = 0; i <= segments; i++) {
      const px = (i / segments) * thumbX;
      const py = 7 + Math.sin((px * 0.15) + (ts * 0.004)) * 1.5;
      d += (i === 0 ? 'M ' : ' L ') + px + ' ' + py;
    }
  }
  renderProgressPath.setAttribute('d', d);
  renderCountEl.textContent = Math.round(renderedFrames);

  renderUiRaf = requestAnimationFrame(renderUiTick);
}

function showRenderStatus(total) {
  renderTotalFrames = total;
  renderTargetFrames = 0;
  renderedFrames = 0;
  renderEaseTs = null;
  if (renderStatusTitle) renderStatusTitle.textContent = 'Rendering frames';
  renderTotalEl.textContent = total;
  renderCountEl.textContent = '0';
  renderStatus.hidden = false;
  if (!renderUiActive) {
    renderUiActive = true;
    pdStart = null; pdShown = -1;
    renderUiRaf = requestAnimationFrame(renderUiTick);
  }
}

// Set the real progress target (frames confirmed on the server). The bar eases
// toward this value in renderUiTick.
function setRenderTarget(n) {
  renderTargetFrames = Math.max(0, Math.min(renderTotalFrames, n));
}

// Snap the bar to 100% for the finish, once the .mov is in hand.
function completeRenderStatus() {
  renderTargetFrames = renderTotalFrames;
  renderedFrames = renderTotalFrames;
  renderCountEl.textContent = renderTotalFrames;
}

function hideRenderStatus() {
  renderUiActive = false;
  if (renderUiRaf) { cancelAnimationFrame(renderUiRaf); renderUiRaf = null; }
  renderStatus.hidden = true;
}

async function exportMOV() {
  const introDur = state.useAnim ? CFG.contentEnd : 0;
  const totalMs = introDur + CFG.idleDuration;
  const totalFrames = Math.ceil((totalMs / 1000) * CFG.fps);
  const frameDt = 1000 / CFG.fps;
  const sessionId = Date.now().toString();

  showRenderStatus(totalFrames);
  stopLoop();

  // Pipeline: render each frame, snapshot it as a binary PNG, and upload it while
  // the next frames keep rendering. Transfer overlaps rendering (instead of running
  // entirely after it), and several uploads fly at once. The ffmpeg encode is the
  // fast part (<1s); the old bottleneck was ~20 sequential base64 batch round-trips.
  const MAX_INFLIGHT = 6;          // concurrent uploads (also caps blobs held in memory)
  const inflight = new Set();
  let uploaded = 0;
  let failed = null;

  const snapshot = () => new Promise(res => canvas.toBlob(res, 'image/png'));

  for (let f = 0; f < totalFrames && !failed; f++) {
    const timeMs = f * frameDt;
    const introMs = state.useAnim ? timeMs : Infinity;
    render(introMs, timeMs / 1000, true);
    const blob = await snapshot();   // capture before the next render overwrites the canvas
    if (!blob) { failed = new Error('frame capture failed'); break; }

    const task = (async () => {
      try {
        const res = await fetch(`/frame?session=${sessionId}&index=${f}&total=${totalFrames}`, {
          method: 'POST',
          headers: { 'Content-Type': 'image/png' },
          body: blob,
        });
        if (!res.ok) throw new Error(await res.text());
        uploaded++;
        setRenderTarget(uploaded);
      } catch (e) {
        failed = failed || e;
      }
      inflight.delete(task);
    })();
    inflight.add(task);

    if (inflight.size >= MAX_INFLIGHT) await Promise.race(inflight);
  }

  await Promise.allSettled(inflight);

  if (failed) {
    alert('Render upload failed: ' + failed.message);
    hideRenderStatus();
    syncCanvasSize(false);
    startLoop();
    return;
  }

  // Every frame is on the server — trigger the (fast) encode and download the .mov.
  if (renderStatusTitle) renderStatusTitle.textContent = 'Encoding video';
  setRenderTarget(totalFrames);

  let res;
  try {
    res = await fetch(`/finalize?session=${sessionId}&fps=${CFG.fps}&total=${totalFrames}`, {
      method: 'POST',
    });
  } catch (e) {
    alert('Encode request failed: ' + e.message);
    hideRenderStatus(); syncCanvasSize(false); startLoop();
    return;
  }

  if (!res.ok) {
    alert('Server error: ' + (await res.text()));
    hideRenderStatus(); syncCanvasSize(false); startLoop();
    return;
  }

  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `music-ui-${state.title.replace(/\s+/g, '-').toLowerCase()}.mov`;
  a.click();
  URL.revokeObjectURL(a.href);

  completeRenderStatus();                       // fill the bar to 100%
  await new Promise(r => setTimeout(r, 250));   // brief "done" hold
  hideRenderStatus();
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
pickedByInput.addEventListener('input', () => { state.pickedBy = pickedByInput.value; });
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

function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
    themeIcon.src = 'assets/icons/sun.svg';
  } else {
    themeIcon.src = 'assets/icons/moon.svg';
  }
}

themeToggle.addEventListener('click', () => {
  const isLight = document.body.classList.toggle('light-mode');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  themeIcon.src = isLight ? 'assets/icons/sun.svg' : 'assets/icons/moon.svg';
});

initTheme();

document.fonts.ready.then(() => { syncCanvasSize(); startLoop(); });