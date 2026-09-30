/* Apply readable size floors without replacing larger, page-specific sizes. */
(function(){
  'use strict';
  var path=window.location.pathname,part=path.split('/').filter(Boolean).pop()||'index';
  if(!part.includes('.'))part='index';else part=part.replace(/\.html$/,'');
  document.documentElement.setAttribute('data-ranova-page',part);
  document.documentElement.setAttribute('data-ranova-surface',path.includes('/rpe-v2/')?'app':'site');
  var roots=new Set(),scheduled=false;
  var ignored='SCRIPT,STYLE,NOSCRIPT,SVG,PATH,META,LINK';
  function apply(element){
    if(!(element instanceof HTMLElement)||ignored.split(',').includes(element.tagName)||element.closest('svg,[aria-hidden="true"]'))return;
    var hasText=Array.prototype.some.call(element.childNodes,function(n){return n.nodeType===3&&n.textContent.trim()});
    var form=/^(INPUT|SELECT|TEXTAREA)$/.test(element.tagName);
    if(!hasText&&!form&&!(/^H[1-4]$/.test(element.tagName)&&element.textContent.trim()))return;
    // Icon-only controls keep their own visual sizes.
    if(!form&&element.textContent.trim()&&!/[A-Za-z0-9\u00c0-\u024f]/.test(element.textContent))return;
    var tag=element.tagName,inProduct=!!element.closest('.product,.product-card'),minimum=14;
    if(form||/^(P|LI|DD|LABEL)$/.test(tag))minimum=inProduct&&!form?14:16;
    if(tag==='H1')minimum=28;
    else if(tag==='H2')minimum=24;
    else if(tag==='H3')minimum=inProduct?16:20;
    else if(tag==='H4')minimum=18;
    if(element.matches('.price,.detail-price,.cart-unit-price,.summary-row.total b,#detailProductTotal,#fairBuyerTotal'))minimum=16;
    var size=parseFloat(getComputedStyle(element).fontSize);
    if(Number.isFinite(size)&&size<minimum){
      element.style.setProperty('--ranova-text-size',minimum+'px');
      element.style.setProperty('font-size',minimum+'px','important');
      element.setAttribute('data-ranova-text-size','');
    }
  }
  function scan(root){apply(root);if(root.querySelectorAll)root.querySelectorAll('*').forEach(apply)}
  function enqueue(root){
    if(!root)return;roots.add(root);
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(function(){scheduled=false;var batch=Array.from(roots);roots.clear();batch.forEach(function(root){if(root.isConnected)scan(root)})});
  }
  function start(){
    enqueue(document.body);
    new MutationObserver(function(records){records.forEach(function(record){
      if(record.type==='characterData')enqueue(record.target.parentElement);
      else record.addedNodes.forEach(function(node){if(node.nodeType===1)enqueue(node);else if(node.nodeType===3)enqueue(node.parentElement)});
    })}).observe(document.body,{childList:true,subtree:true,characterData:true});
    window.addEventListener('load',function(){enqueue(document.body)},{once:true});
    document.querySelectorAll('link[rel="stylesheet"]').forEach(function(link){link.addEventListener('load',function(){enqueue(document.body)},{once:true})});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
