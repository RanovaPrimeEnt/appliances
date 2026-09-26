(function(){
"use strict";

var frame=document.getElementById("site");
if(!frame||document.getElementById("akwaabaTranslatorRoot"))return;

var ENDPOINT="https://igaerssbzobutlwvjfwt.supabase.co/functions/v1/akwaaba-translate";
var LANGS={
  en:{label:"English",short:"EN"},
  zh:{label:"中文",short:"中"},
  es:{label:"Español",short:"ES"},
  tw:{label:"Twi",short:"TW"}
};
var selected=localStorage.getItem("akwaabaLang")||"en";
if(!LANGS[selected])selected="en";
var cache=new Map();
var lastText="";
var lastTranslation="";

var root=document.createElement("div");
root.id="akwaabaTranslatorRoot";
root.innerHTML=
  '<style>'+
  '#akwaabaTranslatorRoot{position:fixed;inset:0;pointer-events:none;z-index:2147483000;font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif}'+
  '#akwaabaOrb{pointer-events:auto;position:absolute;width:64px;height:64px;border:0;border-radius:50%;padding:0;display:grid;place-items:center;cursor:grab;touch-action:none;background:linear-gradient(145deg,#fff,#f2f7f4);box-shadow:0 12px 28px rgba(8,47,39,.22),0 0 0 3px rgba(255,255,255,.92);color:#0e5b43;user-select:none;-webkit-user-select:none;transition:box-shadow .18s ease,transform .18s ease}'+
  '#akwaabaOrb:active{cursor:grabbing;transform:scale(.97)}'+
  '#akwaabaOrb.dragging{box-shadow:0 16px 36px rgba(8,47,39,.28),0 0 0 5px rgba(217,119,6,.24)}'+
  '#akwaabaOrb svg{width:31px;height:31px;display:block}'+
  '#akwaabaOrb .a-badge{position:absolute;right:-2px;bottom:-2px;min-width:24px;height:24px;border-radius:999px;background:#d97706;color:#fff;display:grid;place-items:center;font:900 11px/1 system-ui;border:2px solid #fff;box-sizing:border-box}'+
  '#akwaabaOrb .a-pulse{position:absolute;inset:-7px;border:2px solid rgba(217,119,6,.25);border-radius:50%;animation:akwaabaPulse 2.2s ease-out infinite;pointer-events:none}'+
  '@keyframes akwaabaPulse{0%{transform:scale(.85);opacity:.75}70%,100%{transform:scale(1.25);opacity:0}}'+
  '#akwaabaHint{pointer-events:none;position:absolute;right:76px;top:50%;transform:translateY(-50%);white-space:nowrap;background:#102f29;color:#fff;padding:8px 10px;border-radius:10px;font-size:12px;font-weight:800;box-shadow:0 8px 18px rgba(0,0,0,.12);opacity:0;transition:opacity .18s ease}'+
  '#akwaabaOrb.hint #akwaabaHint{opacity:1}'+
  '#akwaabaPanel{pointer-events:auto;position:absolute;width:min(360px,calc(100vw - 24px));max-height:min(510px,72vh);overflow:auto;background:rgba(255,255,255,.98);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(14,91,67,.15);border-radius:20px;box-shadow:0 20px 55px rgba(8,47,39,.22);padding:15px;box-sizing:border-box;display:none;color:#173d32}'+
  '#akwaabaPanel.open{display:block}'+
  '.akwaaba-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.akwaaba-title{display:flex;align-items:center;gap:9px}.akwaaba-logo{width:34px;height:34px;border-radius:11px;background:linear-gradient(145deg,#0e5b43,#178467);color:#fff;display:grid;place-items:center;font-weight:950}.akwaaba-title b{display:block;font-size:14px}.akwaaba-title small{display:block;color:#718078;font-size:11px;margin-top:2px}.akwaaba-close{border:0;background:#eef4f1;color:#173d32;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer}'+
  '.akwaaba-langs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px}.akwaaba-lang{min-height:38px;border:1px solid #dce7e2;background:#fff;color:#425b52;border-radius:10px;font-size:11px;font-weight:850;cursor:pointer;padding:5px}.akwaaba-lang.active{background:#0e5b43;color:#fff;border-color:#0e5b43;box-shadow:0 6px 14px rgba(14,91,67,.16)}'+
  '.akwaaba-state{padding:13px;border-radius:14px;background:#f6f9f7;border:1px solid #e5ece8}.akwaaba-label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:900;color:#7c8d85;margin-bottom:5px}.akwaaba-original{font-size:13px;line-height:1.45;color:#52665f;margin-bottom:11px;word-break:break-word}.akwaaba-output{font-size:16px;line-height:1.45;font-weight:800;color:#102f29;word-break:break-word}.akwaaba-loading{display:flex;align-items:center;gap:9px;color:#52665f;font-size:13px}.akwaaba-spin{width:16px;height:16px;border:2px solid #cfe1d8;border-top-color:#0e5b43;border-radius:50%;animation:akwaabaSpin .8s linear infinite}@keyframes akwaabaSpin{to{transform:rotate(360deg)}}'+
  '.akwaaba-actions{display:flex;gap:8px;margin-top:11px}.akwaaba-actions button{flex:1;min-height:40px;border-radius:11px;border:1px solid #dce7e2;background:#fff;color:#173d32;font-size:11px;font-weight:850;cursor:pointer}.akwaaba-actions button.primary{background:#d97706;color:#fff;border-color:#d97706}.akwaaba-note{margin-top:10px;font-size:10px;line-height:1.4;color:#819089}.akwaaba-error{color:#9d3f1a;font-size:13px;line-height:1.45;font-weight:700}'+
  '@media(max-width:620px){#akwaabaOrb{width:58px;height:58px}#akwaabaOrb svg{width:28px;height:28px}#akwaabaPanel{width:calc(100vw - 20px);max-height:64vh;border-radius:18px;padding:13px}.akwaaba-langs{gap:5px}.akwaaba-lang{font-size:10px}}'+
  '@media(prefers-reduced-motion:reduce){#akwaabaOrb,.a-pulse,.akwaaba-spin{animation:none!important;transition:none!important}}'+
  '</style>'+
  '<button id="akwaabaOrb" type="button" aria-label="Akwaaba AI Translator. Drag over text to translate.">'+
    '<span class="a-pulse"></span>'+
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m15.5 15.5 5 5"></path><path d="M8 10.5h5M10.5 8v5" opacity=".7"></path></svg>'+
    '<span class="a-badge">A</span>'+
    '<span id="akwaabaHint">Drag me over text</span>'+
  '</button>'+
  '<section id="akwaabaPanel" role="dialog" aria-label="Akwaaba AI Translator">'+
    '<div class="akwaaba-head"><div class="akwaaba-title"><span class="akwaaba-logo">A</span><span><b>Akwaaba AI Translator</b><small>Point • Drag • Translate</small></span></div><button class="akwaaba-close" id="akwaabaClose" type="button" aria-label="Close">×</button></div>'+
    '<div class="akwaaba-langs" id="akwaabaLangs"></div>'+
    '<div class="akwaaba-state" id="akwaabaState"><div class="akwaaba-output">Drag the magnifier over any text on the page, then release it.</div></div>'+
    '<div class="akwaaba-actions"><button class="primary" id="akwaabaTranslateHere" type="button">Translate here</button><button id="akwaabaCopy" type="button">Copy</button></div>'+
    '<div class="akwaaba-note">Akwaaba does not replace or alter the website text. Only the text you point at is translated in this floating window.</div>'+
  '</section>';

document.body.appendChild(root);

var orb=document.getElementById("akwaabaOrb");
var panel=document.getElementById("akwaabaPanel");
var state=document.getElementById("akwaabaState");
var langs=document.getElementById("akwaabaLangs");
var closeBtn=document.getElementById("akwaabaClose");
var copyBtn=document.getElementById("akwaabaCopy");
var translateHere=document.getElementById("akwaabaTranslateHere");

Object.keys(LANGS).forEach(function(code){
  var b=document.createElement("button");
  b.type="button";
  b.className="akwaaba-lang"+(code===selected?" active":"");
  b.dataset.lang=code;
  b.textContent=LANGS[code].label;
  b.onclick=function(){
    selected=code;
    localStorage.setItem("akwaabaLang",selected);
    Array.prototype.forEach.call(langs.children,function(x){x.classList.toggle("active",x.dataset.lang===selected)});
    if(lastText)translateText(lastText,true);
  };
  langs.appendChild(b);
});

function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function defaultPosition(){
  var size=window.innerWidth<=620?58:64;
  return {left:window.innerWidth-size-20,top:window.innerHeight-size-(window.innerWidth<=620?100:24)};
}
function loadPosition(){
  try{
    var p=JSON.parse(localStorage.getItem("akwaabaPos")||"null");
    if(p&&Number.isFinite(p.left)&&Number.isFinite(p.top))return p;
  }catch(e){}
  return defaultPosition();
}
function setPosition(left,top,save){
  var size=orb.offsetWidth||64;
  left=clamp(left,8,Math.max(8,window.innerWidth-size-8));
  top=clamp(top,8,Math.max(8,window.innerHeight-size-8));
  orb.style.left=left+"px";orb.style.top=top+"px";orb.style.right="auto";orb.style.bottom="auto";
  if(save)try{localStorage.setItem("akwaabaPos",JSON.stringify({left:left,top:top}))}catch(e){}
  positionPanel();
}
var p=loadPosition();setPosition(p.left,p.top,false);

function positionPanel(){
  if(!panel.classList.contains("open"))return;
  var r=orb.getBoundingClientRect(),pw=Math.min(360,window.innerWidth-24),ph=Math.min(panel.scrollHeight||330,window.innerHeight*.72);
  var left=r.right+12;
  if(left+pw>window.innerWidth-10)left=r.left-pw-12;
  left=clamp(left,10,window.innerWidth-pw-10);
  var top=clamp(r.top,10,window.innerHeight-ph-10);
  panel.style.left=left+"px";panel.style.top=top+"px";
}
function openPanel(){panel.classList.add("open");positionPanel()}
function closePanel(){panel.classList.remove("open")}
closeBtn.onclick=closePanel;
window.addEventListener("resize",function(){var r=orb.getBoundingClientRect();setPosition(r.left,r.top,false)});

function showInstruction(msg){
  state.innerHTML='<div class="akwaaba-output">'+escapeHtml(msg||"Drag the magnifier over any text on the page, then release it.")+'</div>';
  openPanel();
}
function escapeHtml(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]})}
function cleanText(s){
  return String(s||"").replace(/\s+/g," ").replace(/^\s+|\s+$/g,"").slice(0,800);
}
function readableText(el){
  if(!el)return"";
  var tag=(el.tagName||"").toLowerCase();
  if(tag==="script"||tag==="style"||tag==="svg"||tag==="path")return"";
  if(tag==="img")return cleanText(el.alt||el.getAttribute("aria-label")||"");
  if(tag==="input"||tag==="textarea")return cleanText(el.value||el.placeholder||el.getAttribute("aria-label")||"");
  return cleanText(el.innerText||el.textContent||el.getAttribute&&el.getAttribute("aria-label")||"");
}
function textAt(clientX,clientY){
  var rect=frame.getBoundingClientRect();
  if(clientX<rect.left||clientX>rect.right||clientY<rect.top||clientY>rect.bottom)return"";
  var d;
  try{d=frame.contentDocument||frame.contentWindow.document}catch(e){return""}
  if(!d)return"";
  var x=clientX-rect.left,y=clientY-rect.top,el=d.elementFromPoint(x,y),best="";
  for(var i=0;el&&i<6;i++,el=el.parentElement){
    var t=readableText(el);
    if(t&&t.length<=280){best=t;break}
    if(!best&&t)best=t.slice(0,280);
  }
  return cleanText(best);
}
function orbCenter(){
  var r=orb.getBoundingClientRect();
  return {x:r.left+r.width/2,y:r.top+r.height/2};
}
async function translateText(text,force){
  text=cleanText(text);
  if(!text){showInstruction("I could not find readable text there. Drag Akwaaba directly over a word, product name, button, or sentence.");return}
  lastText=text;
  var key=selected+"|"+text;
  state.innerHTML='<div class="akwaaba-loading"><span class="akwaaba-spin"></span><span>Akwaaba is translating to '+escapeHtml(LANGS[selected].label)+'…</span></div>';
  openPanel();
  if(cache.has(key)&&!force){
    renderResult(text,cache.get(key));return;
  }
  try{
    var res=await fetch(ENDPOINT,{
      method:"POST",
      headers:{"Content-Type":"application/json","x-akwaaba-client":"ranova-site-v1"},
      body:JSON.stringify({q:text,target:selected})
    });
    var data=await res.json().catch(function(){return{}});
    if(!res.ok||!data.translated)throw new Error(data.error||"Translation unavailable");
    cache.set(key,data.translated);
    lastTranslation=data.translated;
    renderResult(text,data.translated);
  }catch(e){
    state.innerHTML='<div class="akwaaba-error">Translation is temporarily unavailable. Check your connection and try again.</div>';
    openPanel();
  }
}
function renderResult(original,translated){
  lastTranslation=translated;
  state.innerHTML=
    '<div class="akwaaba-label">Original</div><div class="akwaaba-original">'+escapeHtml(original)+'</div>'+
    '<div class="akwaaba-label">'+escapeHtml(LANGS[selected].label)+'</div><div class="akwaaba-output">'+escapeHtml(translated)+'</div>';
  openPanel();
}
function translateAt(x,y){
  var text=textAt(x,y);
  translateText(text,false);
}
translateHere.onclick=function(){var c=orbCenter();translateAt(c.x,c.y)};
copyBtn.onclick=function(){
  if(!lastTranslation){showInstruction("Translate something first, then you can copy the result.");return}
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(lastTranslation).then(function(){
      var old=copyBtn.textContent;copyBtn.textContent="Copied";setTimeout(function(){copyBtn.textContent=old},1200);
    });
  }else{
    var ta=document.createElement("textarea");ta.value=lastTranslation;document.body.appendChild(ta);ta.select();try{document.execCommand("copy")}catch(e){}ta.remove();
  }
};

var drag=null;
orb.addEventListener("pointerdown",function(e){
  if(e.button!=null&&e.button!==0)return;
  var r=orb.getBoundingClientRect();
  drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,offsetX:e.clientX-r.left,offsetY:e.clientY-r.top,moved:false};
  try{orb.setPointerCapture(e.pointerId)}catch(err){}
});
orb.addEventListener("pointermove",function(e){
  if(!drag||e.pointerId!==drag.id)return;
  var dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;
  if(Math.hypot(dx,dy)>5)drag.moved=true;
  if(drag.moved){
    closePanel();orb.classList.add("dragging");
    setPosition(e.clientX-drag.offsetX,e.clientY-drag.offsetY,false);
  }
});
function endDrag(e){
  if(!drag||e.pointerId!==drag.id)return;
  var moved=drag.moved;
  drag=null;orb.classList.remove("dragging");
  var r=orb.getBoundingClientRect();setPosition(r.left,r.top,true);
  if(moved){var c=orbCenter();translateAt(c.x,c.y)}
  else{panel.classList.contains("open")?closePanel():showInstruction("Drag the magnifier over any word or sentence, then release it. Choose your preferred language above.")}
}
orb.addEventListener("pointerup",endDrag);
orb.addEventListener("pointercancel",function(e){if(drag&&e.pointerId===drag.id){drag=null;orb.classList.remove("dragging")}});
orb.addEventListener("keydown",function(e){
  if(e.key==="Enter"||e.key===" "){e.preventDefault();panel.classList.contains("open")?closePanel():showInstruction()}
});

setTimeout(function(){
  if(!localStorage.getItem("akwaabaSeen")){
    orb.classList.add("hint");
    setTimeout(function(){orb.classList.remove("hint")},4200);
    try{localStorage.setItem("akwaabaSeen","1")}catch(e){}
  }
},900);
})();