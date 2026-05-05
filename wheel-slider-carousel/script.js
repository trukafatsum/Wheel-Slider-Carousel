// ─── Config: sections DOM'dan okunur ─────────────────────────────────────────
// Razor migrasyonu: #section-data içindeki <li>'ları @foreach ile üret.
// section sayısı kaç olursa olsun çark otomatik eşit paylaşır.

const sectionNodes = Array.from(document.querySelectorAll("#section-data li"));

function hexToRgb(hex) {
  const c = hex.replace("#", "");
  return [
    parseInt(c.slice(0, 2), 16),
    parseInt(c.slice(2, 4), 16),
    parseInt(c.slice(4, 6), 16),
  ];
}

function parseNums(str) {
  return str.trim().split(/\s+/).map(Number);
}

// sky hex'leri yükleme anında [r,g,b]'ye dönüştürülür — render döngüsünde string parse yok
const themes = {};
sectionNodes.forEach((li) => {
  const id = li.dataset.id;
  themes[id] = {
    title: li.dataset.title,
    copy: li.dataset.copy,
    action: li.dataset.action,
    mapLabel: li.dataset.mapLabel,
    image: li.dataset.image,
    year: li.dataset.year || "",
    genre: li.dataset.genre || "",
    platform: li.dataset.platform || "",
    sky: li.dataset.sky.trim().split(/\s+/).map(hexToRgb),
    glow: parseNums(li.dataset.glow),
    glowColor: parseNums(li.dataset.glowColor),
    ridge: parseNums(li.dataset.ridge),
    crater: parseNums(li.dataset.crater),
    figure: parseFloat(li.dataset.figure),
  };
});

const sectionOrder = sectionNodes.map((li) => li.dataset.id);

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const canvas = document.querySelector("#terrainCanvas");
const ctx = canvas.getContext("2d");
const scene = document.querySelector(".scene");
const boardCard = document.querySelector(".board-card");
const wheelEl = document.querySelector(".wheel");
const labelsLayer = document.querySelector(".wheel__labels");
const segmentsEl = document.querySelector(".wheel__segments");
const activeSliceEl = document.querySelector(".wheel__active-slice");
const lens = document.querySelector(".wheel__lens");
const lensTitle = document.querySelector(".wheel__lens-title");
const contentTitle = document.querySelector(".content h1");
const contentText = document.querySelector(".content p");
const contentButton = document.querySelector(".cta");
const miniMapLabel = document.querySelector(".mini-map__label");
const miniMap = document.querySelector(".mini-map");
const contentEl = document.querySelector(".content");
const currentBackground = document.querySelector(".background--current");
const nextBackground = document.querySelector(".background--next");
const infoButton = document.querySelector(".info-button");
const infoPanel = document.querySelector(".info-panel");
const infoPanelYear = document.querySelector(".info-panel__year");
const infoPanelGenre = document.querySelector(".info-panel__genre");
const infoPanelPlatform = document.querySelector(".info-panel__platform");
const infoPanelSource = document.querySelector(".info-panel__source");

// ─── State ────────────────────────────────────────────────────────────────────
const defaultSection = scene.dataset.defaultSection || sectionOrder[0];

let frame = 0;
let activeSection = defaultSection;
let previousTheme = null;
let transitionStart = 0;
let currentBackgroundLayer = currentBackground;
let nextBackgroundLayer = nextBackground;
let backgroundTimer = null;
let currentWheelRotation = 0;
let targetWheelRotation = 0;
let wheelSettled = false;
let parts = [];
let cachedW = 0;
let cachedH = 0;
let resizeTimer = null;

const wheelMath = { originX: 48.3, originY: 50, radius: 38.5 };
const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

// ─── Renk yardımcıları ────────────────────────────────────────────────────────
function mix(a, b, t) {
  return a + (b - a) * t;
}

function mixArray(from, to, t) {
  return to.map((v, i) => mix(from[i], v, t));
}

function rgb(values, alpha = 1) {
  return `rgba(${Math.round(values[0])}, ${Math.round(values[1])}, ${Math.round(values[2])}, ${alpha})`;
}

// ─── İçerik & arka plan ───────────────────────────────────────────────────────
function setBackgroundImage(layer, section) {
  layer.style.backgroundImage = `url("${themes[section].image}")`;
}

function updateContent(section) {
  const theme = themes[section];
  contentTitle.textContent = theme.title;
  contentText.textContent = theme.copy;
  contentButton.textContent = theme.action;
  miniMapLabel.textContent = theme.mapLabel;
  lensTitle.textContent = theme.title;
  // Info paneli güncelle (açıksa hemen, kapalıysa bir sonraki açılışta görünür)
  infoPanelYear.textContent = theme.year;
  infoPanelGenre.textContent = theme.genre;
  infoPanelPlatform.textContent = theme.platform;
  if (theme.platform && theme.platform.includes("Bölgesi")) {
    infoPanelSource.innerHTML =
      'Kaynak: <a href="' +
      (sectionNodes.find((li) => li.dataset.id === section)?.dataset.source ||
        "https://goturkiye.com/") +
      '" target="_blank" rel="noopener">goturkiye.com</a>';
  } else {
    infoPanelSource.innerHTML = "";
  }
}

// ─── Çark CSS değişkenleri ────────────────────────────────────────────────────
function getBaseAngle(section) {
  const anchorIndex = sectionOrder.indexOf(defaultSection);
  const sectionIndex = sectionOrder.indexOf(section);
  return (sectionIndex - anchorIndex) * (360 / sectionOrder.length);
}

function syncWheelVars(section) {
  const segmentAngle = 360 / sectionOrder.length;
  // +90: CSS conic-gradient saat açısı (0°=yukarı) ile JS math açısı (0°=sağ) arasındaki farkı kapatır
  const segmentOffset = -segmentAngle / 2 + 90;
  const activeSliceStart = getBaseAngle(section) - segmentAngle / 2 + 90;

  // CSS değişkenleri (active-slice-start ve active-bg hâlâ gerekli)
  scene.style.setProperty("--segment-angle", `${segmentAngle}deg`);
  scene.style.setProperty("--segment-offset", `${segmentOffset}deg`);
  scene.style.setProperty("--active-slice-start", `${activeSliceStart}deg`);
  scene.style.setProperty("--active-bg", `url("${themes[section].image}")`);

  // Segment çizgilerini ve aktif dilimi doğrudan inline style ile güncelle
  // (CSS var() yolunu kaldırarak section sayısı değiştiğinde garanti güncelleme)
  segmentsEl.style.background = `repeating-conic-gradient(
    from ${segmentOffset}deg at 48.3% 50%,
    rgba(238, 248, 245, 0.72) 0 0.28deg,
    transparent 0.28deg ${segmentAngle}deg
  )`;
  activeSliceEl.style.background = `conic-gradient(
    from ${activeSliceStart}deg at 48.3% 50%,
    rgba(255, 255, 255, 0.2) 0 ${segmentAngle}deg,
    transparent ${segmentAngle}deg 360deg
  )`;
}

function syncLensBackground() {
  const rect = lens.getBoundingClientRect();
  const sceneRect = scene.getBoundingClientRect();
  scene.style.setProperty("--lens-bg-left", `${sceneRect.left - rect.left}px`);
  scene.style.setProperty("--lens-bg-top", `${sceneRect.top - rect.top}px`);
  scene.style.setProperty("--scene-width", `${sceneRect.width}px`);
  scene.style.setProperty("--scene-height", `${sceneRect.height}px`);
}

// ─── Part butonları ───────────────────────────────────────────────────────────
function buildPartButtons() {
  parts = sectionOrder.map((section) => {
    const button = document.createElement("button");
    button.className = "part";
    button.dataset.section = section;
    button.type = "button";
    button.textContent = themes[section].title;
    labelsLayer.appendChild(button);
    return button;
  });
}

// ─── Çark animasyonu ──────────────────────────────────────────────────────────
function getNearestAngle(target, reference) {
  let result = target;
  while (result - reference > 180) result -= 360;
  while (result - reference < -180) result += 360;
  return result;
}

function setWheelTarget(section, snap = false) {
  targetWheelRotation = getNearestAngle(
    -getBaseAngle(section),
    currentWheelRotation,
  );
  if (snap) {
    currentWheelRotation = targetWheelRotation;
    wheelSettled = true;
  } else {
    wheelSettled = false;
  }
}

function renderWheel() {
  const delta = targetWheelRotation - currentWheelRotation;
  const settled = Math.abs(delta) < 0.01;

  if (!settled) {
    currentWheelRotation += delta * 0.13;
    wheelSettled = false;
  } else if (!wheelSettled) {
    // son frame: tam değere kilitle ve DOM'a yaz, sonra dur
    currentWheelRotation = targetWheelRotation;
    wheelSettled = true;
  } else {
    return; // çark durmuş — gereksiz DOM yazımını atla
  }

  scene.style.setProperty("--wheel-rotation", `${currentWheelRotation}deg`);

  parts.forEach((button) => {
    const displayAngle =
      getBaseAngle(button.dataset.section) + currentWheelRotation;
    const radians = (displayAngle * Math.PI) / 180;
    const x = wheelMath.originX + Math.cos(radians) * wheelMath.radius;
    const y = wheelMath.originY + Math.sin(radians) * wheelMath.radius;
    button.style.left = `${x}%`;
    button.style.top = `${y}%`;
    button.style.transform = `translate(-50%, -50%) rotate(${displayAngle + 90}deg)`;
    button.classList.toggle(
      "is-active",
      button.dataset.section === activeSection,
    );
    button.classList.toggle("is-behind", Math.cos(radians) < -0.52);
  });
}

// ─── Görüntü ön yükleme ───────────────────────────────────────────────────────
sectionOrder.forEach((id) => {
  const img = new Image();
  img.src = themes[id].image;
});

// ─── Section seçimi ───────────────────────────────────────────────────────────
function selectSection(section) {
  if (section === activeSection) return;

  previousTheme = themes[activeSection];
  activeSection = section;
  transitionStart = performance.now();
  scene.dataset.section = section;
  updateContent(section);
  syncWheelVars(section);
  setWheelTarget(section);
  scene.classList.remove("is-changing");
  void scene.offsetWidth;
  scene.classList.add("is-changing");

  setBackgroundImage(nextBackgroundLayer, section);
  nextBackgroundLayer.classList.add("is-visible");
  currentBackgroundLayer.classList.remove("is-visible");

  window.clearTimeout(backgroundTimer);
  backgroundTimer = window.setTimeout(() => {
    const oldCurrent = currentBackgroundLayer;
    currentBackgroundLayer = nextBackgroundLayer;
    nextBackgroundLayer = oldCurrent;
    nextBackgroundLayer.classList.remove("is-visible");
    setBackgroundImage(nextBackgroundLayer, section);
  }, 920);
}

// ─── Klavye navigasyonu ───────────────────────────────────────────────────────
window.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const idx = sectionOrder.indexOf(activeSection);
  const next =
    e.key === "ArrowRight"
      ? sectionOrder[(idx + 1) % sectionOrder.length]
      : sectionOrder[(idx - 1 + sectionOrder.length) % sectionOrder.length];
  selectSection(next);
});

// ─── Canvas & arazi ───────────────────────────────────────────────────────────
function resizeCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const rect = scene.getBoundingClientRect();
  cachedW = rect.width;
  cachedH = rect.height;
  canvas.width = Math.floor(rect.width * ratio);
  canvas.height = Math.floor(rect.height * ratio);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  syncLensBackground();
  drawTerrain();
}

function onResize() {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(resizeCanvas, 150);
}

function noise(x, y) {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function getTheme() {
  const target = themes[activeSection];
  if (!previousTheme) return target;

  const elapsed = performance.now() - transitionStart;
  const amount = Math.min(elapsed / 760, 1);
  const eased = 1 - Math.pow(1 - amount, 3);

  if (amount >= 1) {
    previousTheme = null;
    return target;
  }

  // sky zaten [r,g,b] array — hexToRgb çağrısı yok
  return {
    sky: target.sky.map((rgbArr, i) =>
      mixArray(previousTheme.sky[i], rgbArr, eased),
    ),
    glow: mixArray(previousTheme.glow, target.glow, eased),
    glowColor: mixArray(previousTheme.glowColor, target.glowColor, eased),
    ridge: mixArray(previousTheme.ridge, target.ridge, eased),
    crater: mixArray(previousTheme.crater, target.crater, eased),
    figure: mix(previousTheme.figure, target.figure, eased),
  };
}

function drawRidge(points, color, width) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.restore();
}

function makeRidge(w, h, baseY, amp, count, drift) {
  const points = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    points.push({
      x: t * w,
      y:
        baseY +
        Math.sin(t * 9 + drift) * amp +
        Math.sin(t * 21 + drift * 0.7) * amp * 0.28 +
        (noise(t + drift, baseY) - 0.5) * amp * 0.62,
    });
  }
  return points;
}

function drawTerrain() {
  const w = cachedW;
  const h = cachedH;
  const theme = getTheme();

  // sky[n] artık [r,g,b] array — rgb() doğrudan kabul eder
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, rgb(theme.sky[0]));
  bg.addColorStop(0.42, rgb(theme.sky[1]));
  bg.addColorStop(1, rgb(theme.sky[2]));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const gx = w * theme.glow[0];
  const gy = h * theme.glow[1];
  const gr = w * theme.glow[2];
  const glow = ctx.createRadialGradient(gx, gy, 20, gx, gy, gr);
  glow.addColorStop(0, rgb(theme.glowColor, 0.24));
  glow.addColorStop(
    0.22,
    rgb(mixArray(theme.glowColor, [30, 48, 48], 0.55), 0.17),
  );
  glow.addColorStop(0.72, "rgba(4, 9, 10, 0.42)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  for (let layer = 0; layer < 15; layer += 1) {
    const y = h * (0.18 + layer * 0.052);
    const amp = 34 + layer * 8;
    const ridge = makeRidge(w, h, y, amp, 96, layer * 0.75 + frame * 0.002);
    const ridgeColor = [
      theme.ridge[0] + layer * 5,
      theme.ridge[1] + layer * 5,
      theme.ridge[2] + layer * 4,
    ];
    drawRidge(ridge, rgb(ridgeColor, 0.11 + layer * 0.012), 2 + layer * 0.22);
  }

  for (let i = 0; i < 260; i += 1) {
    const x = noise(i, 4.1) * w;
    const y = noise(i, 9.8) * h;
    const size = 0.45 + Math.abs(noise(i, 12.2)) * 1.6;
    const alpha = 0.04 + Math.abs(noise(i, 17.7)) * 0.13;
    ctx.fillStyle = `rgba(235, 238, 231, ${alpha})`;
    ctx.fillRect(x, y, size, size);
  }

  ctx.save();
  ctx.translate(w * theme.crater[0], h * theme.crater[1]);
  ctx.rotate(-0.2);
  const craterR = Math.min(w, h) * theme.crater[2];
  const crater = ctx.createRadialGradient(0, 0, 10, 0, 0, craterR);
  crater.addColorStop(0, "rgba(0, 0, 0, 0.5)");
  crater.addColorStop(0.38, "rgba(26, 44, 46, 0.38)");
  crater.addColorStop(0.56, "rgba(226, 230, 221, 0.18)");
  crater.addColorStop(0.83, "rgba(0, 0, 0, 0.05)");
  crater.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = crater;
  ctx.scale(1.2, 0.72);
  ctx.beginPath();
  ctx.arc(0, 0, Math.min(w, h) * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = `rgba(3, 4, 5, ${theme.figure})`;
  ctx.beginPath();
  ctx.ellipse(w * 0.82, h * 0.83, 13, 38, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(2, 3, 3, 0.72)";
  ctx.beginPath();
  ctx.arc(w * 0.82, h * 0.74, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ─── Ana döngü ────────────────────────────────────────────────────────────────
const terrainInterval = prefersReducedMotion ? 30 : 5;

function tick() {
  frame += 1;
  renderWheel();
  if (frame % terrainInterval === 0) drawTerrain();
  requestAnimationFrame(tick);
}

// ─── Başlangıç ────────────────────────────────────────────────────────────────
window.addEventListener("resize", onResize);
window.addEventListener("scroll", syncLensBackground, { passive: true });

// Wheel hover ile gelir, sadece lens click ile gizlenir
let wheelCooldown = false;

boardCard.addEventListener("mouseenter", () => {
  if (wheelCooldown) return;
  scene.classList.add("wheel--visible");
});

lens.addEventListener("click", (e) => {
  e.stopPropagation();
  scene.classList.remove("wheel--visible");
  wheelCooldown = true;
  setTimeout(() => {
    wheelCooldown = false;
  }, 1200);
});

// Dilim tıklaması — açısal hesaplamayla hangi section'a tıklandığını bul
function getSectionFromClickAngle(localAngle) {
  let best = null;
  let bestDist = Infinity;
  sectionOrder.forEach((section) => {
    const base = getBaseAngle(section);
    let diff = (((localAngle - base) % 360) + 360) % 360;
    if (diff > 180) diff -= 360;
    const dist = Math.abs(diff);
    if (dist < bestDist) {
      bestDist = dist;
      best = section;
    }
  });
  return best;
}

wheelEl.addEventListener("click", (e) => {
  if (e.target.closest(".wheel__lens")) return;
  const rect = wheelEl.getBoundingClientRect();
  // Lens merkezi = hesaplama origin'i
  const cx = rect.left + rect.width * (wheelMath.originX / 100);
  const cy = rect.top + rect.height * (wheelMath.originY / 100);
  const dx = e.clientX - cx;
  const dy = e.clientY - cy;
  // Lens iç çemberinin dışında mı? (iç yarıçap: ~%23.6 of wheel width)
  const innerRadius = rect.width * 0.236;
  if (Math.sqrt(dx * dx + dy * dy) < innerRadius) return;
  // Açıyı wheel'in lokal koordinatına çevir (wheel rotation'ı çıkar)
  const angle = Math.atan2(dy, dx) * (180 / Math.PI) - currentWheelRotation;
  const section = getSectionFromClickAngle(angle);
  if (section) selectSection(section);
});

// ─── Info butonu ─────────────────────────────────────────────────────────────
infoButton.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = infoPanel.classList.toggle("is-open");
  infoButton.setAttribute("aria-expanded", String(isOpen));
  infoPanel.setAttribute("aria-hidden", String(!isOpen));
});

// Panel dışına tıklayınca kapat
scene.addEventListener("click", (e) => {
  if (!infoPanel.classList.contains("is-open")) return;
  if (e.target.closest(".info-button") || e.target.closest(".info-panel"))
    return;
  infoPanel.classList.remove("is-open");
  infoButton.setAttribute("aria-expanded", "false");
  infoPanel.setAttribute("aria-hidden", "true");
});

// Aside: content hizalamasını left ↔ center arasında toggle eder (varsayılan: left)
contentEl.classList.add("content--left");
miniMap.addEventListener("click", () => {
  contentEl.classList.toggle("content--left");
});

// Wheel slide-in tamamlanınca lens arka planını yeniden hesapla
// (init sırasında wheel off-screen olduğundan syncLensBackground yanlış offset üretiyor)
wheelEl.addEventListener("transitionend", (e) => {
  if (
    e.propertyName === "transform" &&
    scene.classList.contains("wheel--visible")
  ) {
    syncLensBackground();
  }
});

buildPartButtons();
updateContent(activeSection);
syncWheelVars(activeSection);
setBackgroundImage(currentBackgroundLayer, activeSection);
setBackgroundImage(nextBackgroundLayer, activeSection);
currentBackgroundLayer.classList.add("is-visible");
setWheelTarget(activeSection, true);
wheelSettled = false; // snap sonrası bir pozisyon pass'ı zorla
renderWheel();
parts.forEach((b) => b.classList.add("is-placed"));
//scene.classList.add("wheel--visible");
syncLensBackground();
resizeCanvas();
tick();
