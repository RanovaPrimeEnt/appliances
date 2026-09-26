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
        '.product-img img[src*="/images/lighting/"]{object-fit:cover!important;object-position:center 7%!important;transform:none!important}' +
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
      card.innerHTML='<div class="category-image"><img src="./images/lighting/product-11.jpg" alt="Square ceiling fan light" loading="lazy" decoding="async"></div>'+
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
    if(typeof w.render==='function')w.render();
    return true;
  }

  frame.addEventListener('load',mount);
  if(!mount()){
    var attempts=0,timer=setInterval(function(){if(mount()||++attempts>=40)clearInterval(timer)},500);
  }
})();
