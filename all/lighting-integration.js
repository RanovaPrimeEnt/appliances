(function(){
  'use strict';
  var frame=document.getElementById('site');
  var additions=window.RPE_LIGHTING_PRODUCTS||[];
  if(!frame||!additions.length)return;

  function mount(){
    var w,d,products;
    try{w=frame.contentWindow;d=frame.contentDocument;products=w.PRODUCTS}
    catch(e){return false}
    if(!d||!Array.isArray(products)||!d.getElementById('grid'))return false;

    var known=new Set(products.map(function(p){return p.id}));
    additions.forEach(function(p){if(!known.has(p.id)){products.push(p);known.add(p.id)}});

    if(!d.getElementById('rpeLightingStyle')){
      var style=d.createElement('style');style.id='rpeLightingStyle';
      style.textContent=
        '.category-cards.rpeFourCategories{grid-template-columns:repeat(5,minmax(0,1fr))!important}' +
        '.modal.open{z-index:6000!important}' +
        '#rpeLightingCategoryCard .category-image img{object-fit:cover!important;object-position:center 8%!important;transform:none!important}' +
        '.product-img img[src*="/images/lighting/source-"]{object-fit:contain!important;object-position:center!important;transform:none!important;padding:8px!important;box-sizing:border-box!important;background:#f7f9f8!important}' +
        '.product:hover .product-img img[src*="/images/lighting/source-"]{transform:none!important}' +
        '.rpe-source-label{position:absolute;bottom:9px;left:9px;z-index:2;background:rgba(255,255,255,.96);color:#214135;border:1px solid #cbd9d2;border-radius:8px;padding:5px 8px;font-size:10px;font-weight:700;line-height:1.2;max-width:calc(100% - 75px)}' +
        '.rpe-source-note{font-size:12px!important;line-height:1.5!important;color:#53645c!important;margin:6px 0 14px!important;padding:10px 12px;background:#f3f7f4;border-radius:10px}' +
        '.rpe-image-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px}.rpe-image-tabs[hidden],.rpe-source-note[hidden]{display:none!important}.rpe-image-tabs button{border:1px solid #cbd9d2;background:#fff;border-radius:8px;padding:8px 12px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}.rpe-image-tabs button[aria-pressed="true"]{background:#0e5b43;color:#fff;border-color:#0e5b43}' +
        '.rpe-english-panel{margin:12px 0 16px;padding:16px;border:1px solid #cbd9d2;border-radius:12px;background:#fff;color:#173d32}.rpe-english-panel[hidden]{display:none!important}.rpe-english-panel h3{font-size:17px!important;margin:0 0 10px!important}.rpe-english-panel dl{margin:0}.rpe-english-panel dl div{display:grid;grid-template-columns:minmax(105px,38%) 1fr;gap:10px;padding:7px 0;border-top:1px solid #e7ede9;font-size:13px;line-height:1.5}.rpe-english-panel dt{font-weight:700}.rpe-english-panel dd{margin:0}.rpe-english-panel p{font-size:11px!important;line-height:1.5!important;color:#53645c!important;margin:11px 0 0!important}' +
        '.modal-image:has(img[src*="/images/lighting/"]){align-items:start!important;overflow:auto!important;max-height:72vh!important}' +
        '.modal-image img[src*="/images/lighting/"]{width:100%!important;height:auto!important;max-height:none!important;object-fit:contain!important}' +
        '@media(max-width:1180px){.category-cards.rpeFourCategories{grid-template-columns:repeat(2,minmax(0,1fr))!important}}' +
        '@media(max-width:700px){.category-cards.rpeFourCategories{grid-template-columns:1fr!important}' +
        '.modal-image:has(img[src*="/images/lighting/"]){min-height:0!important;max-height:62vh!important}}';
      d.head.appendChild(style);
    }

    var cards=d.querySelector('.category-cards');
    if(cards&&!d.getElementById('rpeLightingCategoryCard')){
      var card=d.createElement('button');
      card.id='rpeLightingCategoryCard';card.type='button';card.className='category-card';
      card.innerHTML='<div class="category-image"><img src="./images/lighting/source-11.jpg" alt="Square ceiling fan light" loading="lazy" decoding="async"></div>'+
        '<div><small>LIGHTING &amp; FANS</small><h3>Lighting &amp; Fans</h3><span>Ceiling fan lights &amp; rechargeable lights →</span></div>';
      card.onclick=function(){w.setActiveCategory('Lighting & Fans');d.getElementById('products').scrollIntoView({behavior:'smooth',block:'start'})};
      cards.appendChild(card);
    }
    var filters=d.querySelector('.filters');
    if(filters&&!d.getElementById('rpeLightingFilter')){
      var filter=d.createElement('button');filter.id='rpeLightingFilter';filter.type='button';
      filter.className='filter';filter.dataset.cat='Lighting & Fans';filter.textContent='Lighting & Fans';
      filter.onclick=function(){w.setActiveCategory('Lighting & Fans')};
      filters.appendChild(filter);
    }
    Array.prototype.forEach.call(d.querySelectorAll('.stats div'),function(box){
      var label=box.querySelector('span'),value=box.querySelector('strong');
      if(!label||!value)return;
      if(/Main categories/i.test(label.textContent))value.textContent=String(d.querySelectorAll('.category-cards .category-card').length);
      if(/Catalogue items/i.test(label.textContent))value.textContent=String(products.length);
    });
    function markReferenceImages(){
      // Translation overlays/panels have been retired. Keep original supplier artwork untouched.
      Array.prototype.forEach.call(d.querySelectorAll('.rpe-source-label,#rpeSourceNote,#rpeLightingImageTabs,#rpeEnglishPanel,.rpe-photo-english'),function(el){
        el.remove();
      });
    }
    if(!w.__rpeLightingObserver){
      w.__rpeLightingObserver=true;
      var grid=d.getElementById('grid'),modalImage=d.getElementById('modalImage');
      new MutationObserver(markReferenceImages).observe(grid,{childList:true,subtree:true});
      if(modalImage)new MutationObserver(markReferenceImages).observe(modalImage,{attributes:true,attributeFilter:['src']});
    }
    if(typeof w.render==='function')w.render();
    markReferenceImages();
    return true;
  }

  frame.addEventListener('load',mount);
  if(!mount()){
    var attempts=0,timer=setInterval(function(){if(mount()||++attempts>=40)clearInterval(timer)},500);
  }
})();
