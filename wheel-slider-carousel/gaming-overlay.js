/**
 * gaming-overlay.js
 * Sadece index-gaming.html için — script.js'e dokunmadan çalışır.
 * Logo, .content bloğunun ÜSTÜNDE kalan boşluğu ölçerek dinamik boyutlanır.
 * Doğal piksel boyutundan (naturalWidth/naturalHeight) font yoğunluğu tahmin edilir.
 */
(function () {
  // ─── Logo haritası ────────────────────────────────────────────────────────
  const logoMap = {};
  document.querySelectorAll("#section-data li").forEach(function (li) {
    if (li.dataset.logo) logoMap[li.dataset.id] = li.dataset.logo;
  });

  const scene = document.querySelector(".scene");
  if (!scene) return;

  // ─── Logo <img> — scene'e absolute olarak ekle ───────────────────────────
  const img = document.createElement("img");
  img.id = "gaming-logo-img";
  img.alt = "";
  img.draggable = false;
  scene.appendChild(img);

  // ─── CSS: yatayda ortalı, dikeyde üst bölümde ─────────────────────────────
  const style = document.createElement("style");
  style.textContent =
    "#gaming-logo-img {" +
    "  position: absolute;" +
    "  top: 8%;" +
    "  left: 50%;" +
    "  transform: translateX(-50%);" +
    "  z-index: 2;" +
    "  display: none;" +
    "  object-fit: contain;" +
    "  pointer-events: none;" +
    "  opacity: 0.92;" +
    "  filter: drop-shadow(0 4px 28px rgba(0,0,0,0.9));" +
    "  transition: opacity 280ms ease;" +
    "}" +
    "#gaming-logo-img.is-fading { opacity: 0; }";
  document.head.appendChild(style);

  // ─── Boyutlandırma: tüm logolar için sabit hedef yükseklik ─────────────────
  // naturalWidth/naturalHeight'dan bağımsız — her logo sahne yüksekliğinin
  // %30'u kadar yüksek görünür. Genişlik aspect ratio'ya göre otomatik ayarlanır.
  function applySize(sectionId) {
    var nw = img.naturalWidth;
    var nh = img.naturalHeight;
    if (!nw || !nh) return;

    var sw = scene.offsetWidth || 800;
    var sh = scene.offsetHeight || 450;

    // Sabit hedef yükseklik — logo ne olursa olsun aynı görsel ağırlık
    var th = Math.round(sh * 0.3);
    var tw = Math.round((th * nw) / nh);

    // Genişlik sahnenin %60'ını geçmesin
    if (tw > sw * 0.6) {
      tw = Math.round(sw * 0.6);
      th = Math.round((tw * nh) / nw);
    }

    // ─── Bölüme özgü overridelar ────────────────────────────────────────
    if (sectionId === "01") {
      // SEA — daha küçük
      tw = Math.round(tw * 0.65);
      img.style.top = "0%";
    } else if (sectionId === "02") {
      // ZSZC — daha büyük, daha yukarıda
      tw = Math.round(tw * 1.45);
      th = Math.round(th * 1.45);
      img.style.top = "-7%";
    } else if (sectionId === "03") {
      // FlySRO — daha yukarıda, daha küçük
      tw = Math.round(tw * 0.85);
      img.style.top = "0%";
    } else if (sectionId === "04") {
      // Pharos — daha küçük
      tw = Math.round(tw * 0.5);
      img.style.top = "0%";
    } else if (sectionId === "06") {
      // vSRO-TR — daha yukarıda, daha küçük
      tw = Math.round(tw * 0.65);
      img.style.top = "1%";
    } else {
      img.style.top = "";
    }

    img.style.width = tw + "px";
    img.style.height = th + "px";
  }

  // ─── Logo değiştir ────────────────────────────────────────────────────────
  var timer = null;

  function showLogo(sectionId, animate) {
    var url = logoMap[sectionId];

    if (!url) {
      img.style.display = "none";
      return;
    }

    img.style.display = "block";

    if (animate) {
      img.classList.add("is-fading");
      clearTimeout(timer);
      timer = setTimeout(function () {
        img.src = url;
        img.onload = function () {
          applySize(sectionId);
          img.classList.remove("is-fading");
        };
        img.onerror = function () {
          img.style.display = "none";
        };
      }, 300);
    } else {
      img.classList.remove("is-fading");
      img.src = url;
      img.onload = function () {
        applySize(sectionId);
      };
      img.onerror = function () {
        img.style.display = "none";
      };
    }
  }

  // ─── İlk yükleme ─────────────────────────────────────────────────────────
  showLogo(scene.dataset.defaultSection || "01", false);

  // ─── Section değişikliğini izle ───────────────────────────────────────────
  new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      if (m.attributeName === "data-section")
        showLogo(scene.dataset.section, true);
    });
  }).observe(scene, { attributes: true, attributeFilter: ["data-section"] });
})();
