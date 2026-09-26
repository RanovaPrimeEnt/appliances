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

    function supplierRows(p){
      try{return (window.RPE_LIGHTING_ENGLISH||{})[String(p.cataloguePage)]||[]}catch(e){return[]}
    }
    function rowValue(p,label){
      var row=supplierRows(p).find(function(r){return r[0]===label});
      return row?String(row[1]||""):"";
    }
    function firstNumber(v){
      var m=String(v||"").replace(/,/g,"").match(/\d+(?:\.\d+)?/);
      return m?Number(m[0]):null;
    }
    function lastNumber(v){
      var matches=String(v||"").replace(/,/g,"").match(/\d+(?:\.\d+)?/g);
      return matches&&matches.length?Number(matches[matches.length-1]):null;
    }
    function rechargeSpec(p){
      var power=firstNumber(rowValue(p,"Supplier power label"));
      var battery=firstNumber(rowValue(p,"Supplier battery label"));
      var beam=lastNumber(rowValue(p,"Supplier beam-range claim"));
      var runtime=lastNumber(rowValue(p,"Supplier runtime claim"));
      var diameter=firstNumber(rowValue(p,"Front diameter"));
      var brightness=firstNumber(rowValue(p,"Brightness"));
      return {
        power:power==null?Infinity:power,
        battery:battery==null?Infinity:battery,
        beam:beam==null?Infinity:beam,
        runtime:runtime==null?Infinity:runtime,
        diameter:diameter==null?Infinity:diameter,
        brightness:brightness==null?Infinity:brightness
      };
    }
    function compareRechargeable(a,b){
      var A=rechargeSpec(a),B=rechargeSpec(b);
      // Primary order: supplier power claim, then battery capacity, beam range and runtime.
      // Products whose supplier sheet does not state power/battery are kept after fully specified models.
      return A.power-B.power ||
        A.battery-B.battery ||
        A.beam-B.beam ||
        A.runtime-B.runtime ||
        A.brightness-B.brightness ||
        A.diameter-B.diameter ||
        String(a.name||"").localeCompare(String(b.name||""),undefined,{numeric:true,sensitivity:"base"});
    }
    var orderedAdditions=additions.slice().sort(function(a,b){
      var ar=a.category==="Rechargeable Lights",br=b.category==="Rechargeable Lights";
      if(ar&&br)return compareRechargeable(a,b);
      if(ar!==br)return ar?1:-1;
      return (a.cataloguePage||0)-(b.cataloguePage||0);
    });

    var known=new Set(products.map(function(p){return p.id}));
    orderedAdditions.forEach(function(p){if(!known.has(p.id)){products.push(p);known.add(p.id)}});

    if(!d.getElementById('rpeLightingStyle')){
      var style=d.createElement('style');style.id='rpeLightingStyle';
      style.textContent=
        '.category-cards.rpeFourCategories{grid-template-columns:repeat(6,minmax(0,1fr))!important}' +
        '.modal.open{z-index:6000!important}' +
        '#rpeLightingCategoryCard .category-image img{object-fit:cover!important;object-position:center 8%!important;transform:none!important}' +'#rpeRechargeableCategoryCard .category-image{background:#fff!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important}#rpeRechargeableCategoryCard .category-image img{display:block!important;width:100%!important;height:100%!important;object-fit:contain!important;object-position:center center!important;transform:none!important;opacity:1!important;filter:none!important;background:#fff!important;padding:4px!important;box-sizing:border-box!important}' +
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
    if(cards){
      if(!d.getElementById('rpeLightingCategoryCard')){
        var card=d.createElement('button');
        card.id='rpeLightingCategoryCard';card.type='button';card.className='category-card';
        card.innerHTML='<div class="category-image"><img src="./images/lighting/source-11.jpg" alt="Ceiling fan lights" loading="lazy" decoding="async"></div>'+
          '<div><small>CEILING LIGHTING</small><h3>Lighting &amp; Fans</h3><span>Ceiling fan lights →</span></div>';
        card.onclick=function(){w.setActiveCategory('Lighting & Fans');d.getElementById('products').scrollIntoView({behavior:'smooth',block:'start'})};
        cards.appendChild(card);
      }
      if(!d.getElementById('rpeRechargeableCategoryCard')){
        var rechargeable=d.createElement('button');
        rechargeable.id='rpeRechargeableCategoryCard';rechargeable.type='button';rechargeable.className='category-card';
        rechargeable.innerHTML='<div class="category-image"><img src="./images/lighting/source-41.jpg" alt="F288 rechargeable searchlight" loading="eager" decoding="async"></div>'+
          '<div><small>PORTABLE LIGHTING</small><h3>Rechargeable Lights</h3><span>Searchlights &amp; headlamps →</span></div>';
        rechargeable.onclick=function(){w.setActiveCategory('Rechargeable Lights');d.getElementById('products').scrollIntoView({behavior:'smooth',block:'start'})};
        cards.appendChild(rechargeable);
      }
      if(!d.getElementById('rpeRechargeableVisibilityFix')){
        var rechargeStyle=d.createElement('style');
        rechargeStyle.id='rpeRechargeableVisibilityFix';
        rechargeStyle.textContent='#rpeRechargeableCategoryCard .category-image{background:#fff!important;overflow:hidden!important;display:flex!important;align-items:center!important;justify-content:center!important}#rpeRechargeableCategoryCard .category-image img{display:block!important;width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important;object-position:center!important;transform:none!important;opacity:1!important;filter:none!important;background:#fff!important;padding:3px!important;box-sizing:border-box!important}@media(max-width:700px){#rpeRechargeableCategoryCard .category-image{height:210px!important;min-height:210px!important}#rpeRechargeableCategoryCard .category-image img{object-fit:contain!important;transform:none!important;padding:2px!important}}@media(max-width:420px){#rpeRechargeableCategoryCard .category-image{height:190px!important;min-height:190px!important}}';
        d.head.appendChild(rechargeStyle);
      }
    }
    var filters=d.querySelector('.filters');
    if(filters){
      if(!d.getElementById('rpeLightingFilter')){
        var filter=d.createElement('button');filter.id='rpeLightingFilter';filter.type='button';
        filter.className='filter';filter.dataset.cat='Lighting & Fans';filter.textContent='Lighting & Fans';
        filter.onclick=function(){w.setActiveCategory('Lighting & Fans')};
        filters.appendChild(filter);
      }
      if(!d.getElementById('rpeRechargeableFilter')){
        var rechargeFilter=d.createElement('button');rechargeFilter.id='rpeRechargeableFilter';rechargeFilter.type='button';
        rechargeFilter.className='filter';rechargeFilter.dataset.cat='Rechargeable Lights';rechargeFilter.textContent='Rechargeable Lights';
        rechargeFilter.onclick=function(){w.setActiveCategory('Rechargeable Lights')};
        filters.appendChild(rechargeFilter);
      }
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
