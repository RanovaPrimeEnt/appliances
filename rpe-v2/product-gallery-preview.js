/* RANOVA product gallery preview: isolated enhancement for existing marketplace. */
(() => {
  "use strict";
  const INTERVAL = 4200;
  let timer = null, currentId = null, observer = null;
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const getProducts = () => typeof marketSellerProducts !== "undefined" ? marketSellerProducts : [];
  const getCurrent = () => typeof marketProductCurrent !== "undefined" ? marketProductCurrent : null;
  const imagesOf = p => [...new Set([p?.primary_image_url, ...(Array.isArray(p?.image_urls) ? p.image_urls : [])].filter(x => typeof x === "string" && /^https?:\/\//i.test(x)))];
  function stop() { if (timer) clearInterval(timer); timer = null; }
  function mount() {
    const host = $("marketProductImage"), panel = $("marketProductPanel"), p = getCurrent();
    if (!host || !panel || !p || !panel.classList.contains("active")) { stop(); return; }
    if (host.dataset.ranovaGallery === String(p.id)) return;
    stop();
    const urls = imagesOf(p);
    if (!urls.length) return;
    currentId = String(p.id);
    host.dataset.ranovaGallery = currentId;
    let index = 0, pauseUntil = 0;
    host.innerHTML = '<div class="rnv-gallery" aria-label="Product images"><div class="rnv-gallery-track">' +
      urls.map((url, i) => '<div class="rnv-gallery-slide"><img src="' + escapeHtml(url) + '" alt="' + escapeHtml((p.name || "Product") + " photo " + (i+1)) + '" loading="' + (i ? "lazy" : "eager") + '" decoding="async"></div>').join("") +
      '</div><div class="rnv-gallery-count" aria-live="polite">1 / ' + urls.length + '</div>' +
      (urls.length > 1 ? '<button type="button" class="rnv-gallery-prev" aria-label="Previous image">‹</button><button type="button" class="rnv-gallery-next" aria-label="Next image">›</button><div class="rnv-gallery-dots">' + urls.map((_, i) => '<button type="button" data-index="' + i + '" aria-label="Show photo ' + (i+1) + '"></button>').join("") + '</div>' : '') + '</div>';
    const track = host.querySelector(".rnv-gallery-track");
    const count = host.querySelector(".rnv-gallery-count");
    const dots = [...host.querySelectorAll(".rnv-gallery-dots button")];
    const show = (n, manual = false) => {
      index = (n + urls.length) % urls.length;
      if (manual) pauseUntil = Date.now() + 9000;
      track.scrollTo({left: index * track.clientWidth, behavior: "smooth"});
      count.textContent = (index + 1) + " / " + urls.length;
      dots.forEach((d, i) => {d.classList.toggle("selected", i === index); d.setAttribute("aria-current", String(i === index));});
    };
    if (urls.length > 1) {
      host.querySelector(".rnv-gallery-prev").addEventListener("click", () => show(index - 1, true));
      host.querySelector(".rnv-gallery-next").addEventListener("click", () => show(index + 1, true));
      dots.forEach((d, i) => d.addEventListener("click", () => show(i, true)));
      let scrollDebounce;
      track.addEventListener("scroll", () => {
        clearTimeout(scrollDebounce);
        scrollDebounce = setTimeout(() => {
          index = Math.max(0, Math.min(urls.length - 1, Math.round(track.scrollLeft / (track.clientWidth || 1))));
          count.textContent = (index + 1) + " / " + urls.length;
          dots.forEach((d, i) => d.classList.toggle("selected", i === index));
          pauseUntil = Date.now() + 9000;
        }, 150);
      }, {passive: true});
      show(0);
      timer = setInterval(() => {
        if (document.hidden || Date.now() < pauseUntil || !panel.classList.contains("active") || String(getCurrent()?.id) !== currentId) return;
        show(index + 1);
      }, INTERVAL);
    }
    renderRelated(p);
  }
  function renderRelated(p) {
    const main = $("marketProductPanel")?.querySelector(".mpd-main");
    if (!main) return;
    let section = $("rnvRelatedProducts");
    if (!section) { section = document.createElement("section"); section.id = "rnvRelatedProducts"; section.className = "rnv-related"; main.appendChild(section); }
    const normalize = s => String(s || "").trim().toLowerCase();
    const cat = normalize(p.category);
    const pool = getProducts().filter(x => x && x.id !== p.id && cat && normalize(x.category) === cat);
    const selected = pool.slice(0, 12);
    section.innerHTML = '<h2>More products like this</h2>' +
      (selected.length ? '<div class="rnv-related-grid">' + selected.map(x => {
        const url = imagesOf(x)[0];
        const price = x.price == null ? "Ask for price" : (typeof money === "function" ? money(x.price, x.currency || "GHS") : String(x.price) + " " + (x.currency || "GHS"));
        return '<button type="button" class="rnv-related-card" data-related-id="' + escapeHtml(x.id) + '">' +
          (url ? '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(x.name || "Product") + '" loading="lazy">' : '<span class="rnv-related-placeholder">No image</span>') +
          '<span class="rnv-related-name">' + escapeHtml(x.name || "Product") + '</span><strong>' + escapeHtml(price) + '</strong></button>';
      }).join("") + '</div>' : '<p>More products in this category will appear here.</p>');
    section.querySelectorAll("[data-related-id]").forEach(button => button.addEventListener("click", () => {
      if (typeof openMarketplaceProduct === "function") openMarketplaceProduct(button.dataset.relatedId);
    }));
  }
  function init() {
    const host = $("marketProductImage");
    if (!host) return;
    observer = new MutationObserver(() => {
      const p = getCurrent();
      if (p && host.dataset.ranovaGallery !== String(p.id)) mount();
      else if (p && !host.querySelector(".rnv-gallery") && host.children.length) { delete host.dataset.ranovaGallery; mount(); }
    });
    observer.observe(host, {childList:true});
    document.addEventListener("click", e => {
      if (e.target.closest("[data-mh-product],[data-home-seller-product],[data-market-product],[data-related-id]")) setTimeout(mount, 350);
      if (e.target.closest("#marketProductBack")) stop();
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else mount(); });
    setTimeout(mount, 400);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();