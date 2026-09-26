(function(){
  'use strict';
  var frame=document.getElementById('site');
  var products=window.RPE_LIGHTING_PRODUCTS||[];
  var translations=window.RPE_LIGHTING_ENGLISH||{};
  if(!frame||!products.length)return;

  function mount(){
    var doc;
    try{doc=frame.contentDocument}catch(e){return false}
    if(!doc||!doc.getElementById('grid')||!doc.getElementById('modalImage'))return false;
    if(doc.getElementById('rpeTranslatedPhotoStyle'))return true;
    var style=doc.createElement('style');style.id='rpeTranslatedPhotoStyle';
    style.textContent=
      '.rpe-photo-stage{position:relative;display:block;width:100%;container-type:inline-size;line-height:0;flex:none}' +
      '.rpe-photo-stage>img{display:block!important;width:100%!important;height:auto!important;max-height:none!important;padding:0!important;transform:none!important;object-fit:contain!important}' +
      '.product-img .rpe-photo-stage{width:min(100%,calc(var(--rpe-ratio) * 240px));max-height:100%}' +
      '@media(max-width:620px){.product-img .rpe-photo-stage{width:min(100%,calc(var(--rpe-ratio) * 285px))}}' +
      '.modal-image:has(.rpe-photo-stage){background:#fff!important;min-height:0!important;align-self:start!important}.modal-image .rpe-photo-stage{width:100%;align-self:start}' +
      '.rpe-photo-english{position:absolute;inset:0;pointer-events:none;overflow:hidden;font:600 2.25cqw/1.18 Arial,sans-serif;color:#222}' +
      '.rpe-photo-english .rpe-mask{position:absolute;box-sizing:border-box;overflow:hidden;padding:.6cqw 1.2cqw;background:#fff;white-space:pre-line;line-height:1.19}' +
      '.rpe-photo-english .rpe-head{color:#fff;background:linear-gradient(105deg,#d91717 0 45%,#090909 45%);font-size:3.1cqw;font-weight:800;padding:1.7cqw 2.2cqw}' +
      '.rpe-photo-english .rpe-spec{font-size:2.4cqw;line-height:1.42}' +
      '.rpe-photo-english .rpe-tag{background:#111;color:#fff;font-size:2cqw;font-weight:700}' +
      '.rpe-photo-english .rpe-foot{color:#b23a3a;text-align:right;font-size:1.55cqw}' +
      '.rpe-photo-english .rpe-blue{background:#3384c8;color:#fff;text-align:center;font-size:2.3cqw}' +
      '.rpe-photo-english .rpe-teal{background:#2bd3d0;font-size:2.7cqw;line-height:1.55}' +
      '.rpe-photo-english .rpe-scenic{background:#f4f1e9;text-align:center;font-size:3cqw;line-height:1.25}' +
      '.rpe-photo-english .rpe-badge{border-radius:50%;text-align:center;color:#fff;font-size:2.5cqw;padding:2cqw .2cqw}' +
      '.rpe-photo-english .rpe-orange{background:#c5551d}.rpe-photo-english .rpe-cyan{background:#168cbb}' +
      '.rpe-photo-english .rpe-mini{background:#b51b1b;color:#fff;border-radius:50%;text-align:center;padding:.5cqw 0;font-size:1.4cqw}' +
      '.product-img .rpe-photo-english{font-size:2.25cqw}';
    doc.head.appendChild(style);

    function findRow(rows,key){var row=rows.find(function(r){return r[0]===key});return row?row[1]:''}
    function add(cover,klass,x,y,w,h,value){
      var el=doc.createElement('span');el.className='rpe-mask '+klass;
      el.style.left=x+'%';el.style.top=y+'%';el.style.width=w+'%';el.style.height=h+'%';
      el.textContent=value;cover.appendChild(el);
    }
    function draw(cover,item){
      var n=item.cataloguePage,rows=translations[n]||[];
      if(!rows.length)return;
      var model=findRow(rows,'Model')||item.name.split(' ')[0];
      if(n<=5&&n!==2){
        add(cover,'rpe-badge rpe-orange',4,52,20,19,'Winter\nheat');
        add(cover,'rpe-badge rpe-cyan',74,43,20,19,'Summer\ncool');
        add(cover,'rpe-scenic',8,73,84,23,'Full-spectrum bladeless fan light\nCooling and heating · Supplier airflow claim: 7.2 m/s');
      }else if([2,6,10,11].indexOf(n)>=0){
        var shape=n===2?'Rectangular':n===6?'Long oval':n===10?'Round':'Square';
        add(cover,'rpe-blue',3,2,23,20,shape+'\n'+findRow(rows,'Supplier power label'));
        add(cover,'rpe-blue',3,74,94,21,
          'Room: '+findRow(rows,'Suggested room area')+'  ·  Fan: six speeds\n'+
          'Light: three colours  ·  '+findRow(rows,'Controls'));
      }else if(n===8||n===9){
        add(cover,'rpe-teal',8,49,92,34,
          'Model: FD009\nSize: '+findRow(rows,'Approximate size')+'\n'+
          'Power label: '+findRow(rows,'Supplier power label')+'  ·  Area: '+findRow(rows,'Suggested room area')+'\n'+
          'Offline voice control · dimming · six fan speeds');
      }else{
        var compact=n>=12&&n<=19;
        add(cover,'rpe-head',0,1,100,11,'Model: '+model+'      '+(compact?findRow(rows,'Brightness'):'Rechargeable searchlight'));
        if(compact){
          add(cover,'rpe-spec',1,13,36,21,
            'High-brightness LED\nBattery display · Type-C\nSOS flash');
          add(cover,'rpe-spec',36,13,9,17,'');
          add(cover,'rpe-spec',1,34,29,8,'Runtime: '+findRow(rows,'Supplier runtime claim'));
          add(cover,'rpe-spec',29,34,9,8,'');
          add(cover,'rpe-tag',0,42,17,7,'Li-ion');
          add(cover,'rpe-spec',77,29,23,15,'Type-C cable pictured\nWhite light option');
        }else{
          add(cover,'rpe-spec',1,13,n===21?35:40,24,
            'Battery: '+findRow(rows,'Supplier battery label')+'\n'+
            'Power label: '+findRow(rows,'Supplier power label')+'\n'+
            'Beam: '+findRow(rows,'Supplier beam-range claim')+'\n'+
            'Runtime: '+findRow(rows,'Supplier runtime claim'));
          if(n!==37)add(cover,'rpe-tag',1,37,n===22?40:24,14,'LED light\nModes vary');
          if(n===37){
            add(cover,'rpe-spec',0,38,42,5,'Check pictured accessories');
            add(cover,'rpe-spec',2,62,38,5,'Box · headband pictured');
            add(cover,'rpe-spec',11,86,22,5,'Cable pictured');
          }else if(n!==20){
            add(cover,'rpe-mini',54,14,7,7,'Ask');
            add(cover,'rpe-mini',78,14,7,7,'Ask');
          }
        }
        add(cover,'rpe-foot',56,93,44,7,'Supplier dimensions; verify actual item');
      }
    }
    function wrap(img,item){
      var stage=img.parentElement;
      if(!stage.classList.contains('rpe-photo-stage')){
        stage=doc.createElement('span');stage.className='rpe-photo-stage';
        img.parentNode.insertBefore(stage,img);stage.appendChild(img);
        var cover=doc.createElement('span');cover.className='rpe-photo-english';cover.setAttribute('aria-hidden','true');stage.appendChild(cover);
      }
      stage.style.setProperty('--rpe-ratio',String(item.cataloguePage===21?664/621:1));
      var cover=stage.querySelector('.rpe-photo-english');
      if(cover.dataset.page!==String(item.cataloguePage)){
        cover.replaceChildren();draw(cover,item);cover.dataset.page=String(item.cataloguePage);
      }
      cover.hidden=img.getAttribute('src')!==item.image;
    }
    function refresh(){
      doc.querySelectorAll('.product-img img[src*="/images/lighting/source-"]').forEach(function(img){
        var item=products.find(function(p){return p.image===img.getAttribute('src')});
        if(item)wrap(img,item);
      });
      var modal=doc.getElementById('modalImage'),title=doc.getElementById('modalTitle');
      var item=products.find(function(p){return title&&p.name===title.textContent});
      if(item)wrap(modal,item);
      else if(modal.parentElement.classList.contains('rpe-photo-stage'))
        modal.parentElement.querySelector('.rpe-photo-english').hidden=true;
    }
    new MutationObserver(refresh).observe(doc.getElementById('grid'),{childList:true});
    new MutationObserver(refresh).observe(doc.getElementById('modalImage'),{attributes:true,attributeFilter:['src']});
    refresh();
    return true;
  }
  frame.addEventListener('load',mount);
  if(!mount()){var tries=0,timer=setInterval(function(){if(mount()||++tries>=40)clearInterval(timer)},500)}
})();
