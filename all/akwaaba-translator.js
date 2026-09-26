(function(){
"use strict";

var frame=document.getElementById("site");
if(!frame||document.getElementById("akwaabaTranslatorRoot"))return;

var ENDPOINT="https://igaerssbzobutlwvjfwt.supabase.co/functions/v1/akwaaba-translate";
var LANGS={
  en:{label:"English",short:"EN"},
  zh:{label:"中文",short:"中"},
  es:{label:"Español",short:"ES"},
  fr:{label:"Français",short:"FR"}
};
var LOCAL_VERIFIED={
  "product id":{en:"Product ID",zh:"产品编号",es:"ID del producto",fr:"ID du produit",tw:"Product ID"},
  "price":{en:"Price",zh:"价格",es:"Precio",fr:"Prix",tw:"Boɔ"},
  "model":{en:"Model",zh:"型号",es:"Modelo",fr:"Modèle",tw:"Model"},
  "battery":{en:"Battery",zh:"电池",es:"Batería",fr:"Batterie",tw:"Battery"},
  "battery capacity":{en:"Battery capacity",zh:"电池容量",es:"Capacidad de la batería",fr:"Capacité de la batterie",tw:"Battery capacity"},
  "power":{en:"Power",zh:"功率",es:"Potencia",fr:"Puissance",tw:"Ahoɔden"},
  "beam range":{en:"Beam range",zh:"射程",es:"Alcance del haz",fr:"Portée du faisceau",tw:"Baabi a kanea no tumi du"},
  "runtime":{en:"Runtime",zh:"续航",es:"Duración",fr:"Autonomie",tw:"Bere a ɛtumi yɛ adwuma"},
  "working time":{en:"Working time",zh:"工作时间",es:"Tiempo de funcionamiento",fr:"Durée de fonctionnement",tw:"Bere a ɛtumi yɛ adwuma"},
  "dimensions":{en:"Dimensions",zh:"尺寸",es:"Dimensiones",fr:"Dimensions",tw:"Ne kɛse"},
  "rechargeable headlamp":{en:"Rechargeable headlamp",zh:"充电式头灯",es:"Linterna frontal recargable",fr:"Lampe frontale rechargeable",tw:"Rechargeable ti so kanea"},
  "rechargeable searchlight":{en:"Rechargeable searchlight",zh:"充电式探照灯",es:"Reflector recargable",fr:"Projecteur rechargeable",tw:"Rechargeable searchlight"},
  "rechargeable lights":{en:"Rechargeable Lights",zh:"充电灯",es:"Luces recargables",fr:"Lampes rechargeables",tw:"Rechargeable kanea"},
  "solar street lights":{en:"Solar Street Lights",zh:"太阳能路灯",es:"Farolas solares",fr:"Lampadaires solaires",tw:"Owia ahoɔden kwan so nkanea"},
  "lighting & fans":{en:"Lighting & Fans",zh:"照明与风扇",es:"Iluminación y ventiladores",fr:"Éclairage et ventilateurs",tw:"Kanea ne mframa afiri"}
};
var selected=localStorage.getItem("akwaabaLang")||"en";
if(!LANGS[selected]){selected="en";try{localStorage.setItem("akwaabaLang","en")}catch(e){}}
var cache=new Map();
try{
  var savedAkwaabaCache=JSON.parse(localStorage.getItem("akwaabaTranslationCache")||"{}");
  Object.keys(savedAkwaabaCache).forEach(function(k){cache.set(k,savedAkwaabaCache[k])});
}catch(e){}
function persistAkwaabaCache(){
  try{
    var obj={},n=0;
    Array.from(cache.entries()).slice(-250).forEach(function(pair){obj[pair[0]]=pair[1];n++});
    localStorage.setItem("akwaabaTranslationCache",JSON.stringify(obj));
  }catch(e){}
}
var lastText="";
var lastTranslation="";
var ocrScriptPromise=null;
var ocrBusy=false;
var akwaabaOcrWorker=null;
var akwaabaOcrReady=false;

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
  '#akwaabaPanel{pointer-events:auto;position:absolute;width:min(360px,calc(100vw - 24px));max-height:min(620px,82vh);overflow:auto;background:rgba(255,255,255,.98);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(14,91,67,.15);border-radius:20px;box-shadow:0 20px 55px rgba(8,47,39,.22);padding:15px;box-sizing:border-box;display:none;color:#173d32}'+
  '#akwaabaPanel.open{display:block}'+
  '.akwaaba-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.akwaaba-title{display:flex;align-items:center;gap:9px}.akwaaba-logo{width:34px;height:34px;border-radius:11px;background:linear-gradient(145deg,#0e5b43,#178467);color:#fff;display:grid;place-items:center;font-weight:950}.akwaaba-title b{display:block;font-size:14px}.akwaaba-title small{display:block;color:#718078;font-size:11px;margin-top:2px}.akwaaba-close{border:0;background:#eef4f1;color:#173d32;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer}'+
  '.akwaaba-langs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px}.akwaaba-lang{min-height:38px;border:1px solid #dce7e2;background:#fff;color:#425b52;border-radius:10px;font-size:11px;font-weight:850;cursor:pointer;padding:5px}.akwaaba-lang.active{background:#0e5b43;color:#fff;border-color:#0e5b43;box-shadow:0 6px 14px rgba(14,91,67,.16)}'+
  '.akwaaba-state{padding:0;border:0;background:transparent}.akwaaba-result{display:grid;gap:7px}.akwaaba-block{border:1px solid #e0e9e4;border-radius:14px;padding:10px 11px;background:#fff}.akwaaba-block.translation{background:linear-gradient(180deg,#f4fbf7 0%,#ffffff 100%);border-color:#cfe3d8}.akwaaba-block-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px}.akwaaba-label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:900;color:#7c8d85}.akwaaba-language-pill{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:#eaf4ef;color:#0e5b43;font-size:10px;font-weight:900}.akwaaba-original{font-size:13px;line-height:1.5;color:#52665f;word-break:break-word}.akwaaba-output{font-size:17px;line-height:1.5;font-weight:850;color:#102f29;word-break:break-word}.akwaaba-arrow{display:flex;align-items:center;justify-content:center;height:16px;color:#8ba39a;font-weight:900;font-size:14px}.akwaaba-loading{display:flex;align-items:center;gap:9px;color:#52665f;font-size:13px;padding:13px;border-radius:14px;background:#f6f9f7;border:1px solid #e5ece8}.akwaaba-spin{width:16px;height:16px;border:2px solid #cfe1d8;border-top-color:#0e5b43;border-radius:50%;animation:akwaabaSpin .8s linear infinite}@keyframes akwaabaSpin{to{transform:rotate(360deg)}}'+
  '.akwaaba-actions{display:flex;gap:8px;margin-top:11px}.akwaaba-actions button{flex:1;min-height:40px;border-radius:11px;border:1px solid #dce7e2;background:#fff;color:#173d32;font-size:11px;font-weight:850;cursor:pointer}.akwaaba-actions button.primary{background:#d97706;color:#fff;border-color:#d97706}.akwaaba-note{margin-top:10px;font-size:10px;line-height:1.4;color:#819089}.akwaaba-error{color:#9d3f1a;font-size:13px;line-height:1.45;font-weight:700}'+
  '.akwaaba-detected{white-space:pre-wrap}.akwaaba-output{white-space:pre-wrap}.akwaaba-image-box{border:1px solid #dfe9e4;border-radius:12px;padding:7px;background:#fff;margin-bottom:7px;overflow:hidden}.akwaaba-image-box img{display:block;width:100%;height:110px;object-fit:contain;border-radius:8px;background:#f6f9f7}.akwaaba-image-caption{margin-top:5px;font-size:9px;line-height:1.3;color:#6b7b74;font-weight:800}.akwaaba-image-stage{display:grid;gap:7px}'+
  '@media(max-width:620px){#akwaabaOrb{width:58px;height:58px}#akwaabaOrb svg{width:28px;height:28px}#akwaabaPanel{width:calc(100vw - 18px);max-height:84vh;border-radius:18px;padding:10px}.akwaaba-langs{gap:5px}.akwaaba-lang{font-size:10px;padding:5px}.akwaaba-output{font-size:14px;line-height:1.42}.akwaaba-block{padding:9px 10px}.akwaaba-image-box img{height:82px}.akwaaba-image-caption{font-size:9px;margin-top:5px}.akwaaba-actions{position:sticky;bottom:0;background:rgba(255,255,255,.96);backdrop-filter:blur(8px);padding-top:8px;margin-top:10px}}'+
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
    '<div class="akwaaba-state" id="akwaabaState"><div class="akwaaba-output">Drag Akwaaba onto a product image to scan and translate the whole image, or onto normal page text.</div></div>'+
    '<div class="akwaaba-actions"><button class="primary" id="akwaabaTranslateHere" type="button">Translate here</button><button id="akwaabaCopy" type="button">Copy</button></div>'+
    '<div class="akwaaba-note">Akwaaba does not alter the website. Verified catalogue terms are preferred, and uncertain translations are withheld rather than guessed.</div>'+
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
function loadOcr(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  if(ocrScriptPromise)return ocrScriptPromise;
  ocrScriptPromise=new Promise(function(resolve,reject){
    var s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.async=true;
    s.onload=function(){window.Tesseract?resolve(window.Tesseract):reject(new Error("OCR failed to load"))};
    s.onerror=function(){reject(new Error("OCR failed to load"))};
    document.head.appendChild(s);
  });
  return ocrScriptPromise;
}

async function getAkwaabaOcrWorker(){
  if(akwaabaOcrWorker&&akwaabaOcrReady)return akwaabaOcrWorker;
  await loadOcr();
  if(!window.Tesseract)throw new Error("OCR engine unavailable");
  akwaabaOcrWorker=await window.Tesseract.createWorker("eng+chi_sim+spa+fra");
  akwaabaOcrReady=true;
  return akwaabaOcrWorker;
}
function frameElementAt(clientX,clientY){
  var rect=frame.getBoundingClientRect();
  if(clientX<rect.left||clientX>rect.right||clientY<rect.top||clientY>rect.bottom)return null;
  try{
    var d=frame.contentDocument||frame.contentWindow.document;
    return d?d.elementFromPoint(clientX-rect.left,clientY-rect.top):null;
  }catch(e){return null}
}
function imageElementAt(clientX,clientY){
  var fr=frame.getBoundingClientRect(),d;
  if(clientX<fr.left||clientX>fr.right||clientY<fr.top||clientY>fr.bottom)return null;
  try{d=frame.contentDocument||frame.contentWindow.document}catch(e){return null}
  if(!d)return null;
  var x=clientX-fr.left,y=clientY-fr.top;
  var stack=[];
  try{stack=d.elementsFromPoint?d.elementsFromPoint(x,y):[d.elementFromPoint(x,y)]}catch(e){}
  for(var s=0;s<stack.length;s++){
    var el=stack[s];
    if(!el)continue;
    if((el.tagName||"").toLowerCase()==="img")return el;
    var parent=el;
    for(var k=0;parent&&k<5;k++,parent=parent.parentElement){
      if((parent.tagName||"").toLowerCase()==="img")return parent;
      if(parent.querySelector){
        var imgs=parent.querySelectorAll("img");
        for(var j=0;j<imgs.length;j++){
          var rr=imgs[j].getBoundingClientRect();
          if(x>=rr.left&&x<=rr.right&&y>=rr.top&&y<=rr.bottom)return imgs[j];
        }
      }
    }
  }
  var all=d.querySelectorAll("#grid .product-img img,#productModal img,.category-image img");
  for(var i=0;i<all.length;i++){
    var r=all[i].getBoundingClientRect();
    if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)return all[i];
  }
  return null;
}
function prepareWholeImageForOcr(img){
  var nw=img.naturalWidth||0,nh=img.naturalHeight||0;
  if(!nw||!nh)throw new Error("Image is not ready");

  // OCR copy: large enough for small supplier text, but capped for speed/memory.
  var maxSide=1500;
  var minSide=900;
  var scale=Math.min(1,maxSide/Math.max(nw,nh));
  if(Math.max(nw,nh)<minSide)scale=Math.min(2,minSide/Math.max(nw,nh));
  var outW=Math.max(1,Math.round(nw*scale));
  var outH=Math.max(1,Math.round(nh*scale));

  var canvas=document.createElement("canvas");
  canvas.width=outW;canvas.height=outH;
  var ctx=canvas.getContext("2d",{willReadFrequently:true});
  ctx.fillStyle="#fff";ctx.fillRect(0,0,outW,outH);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
  ctx.drawImage(img,0,0,nw,nh,0,0,outW,outH);

  return canvas;
}
function canvasPreview(canvas){
  try{return canvas.toDataURL("image/jpeg",.86)}catch(e){return""}
}
function cleanOcrLines(raw){
  return String(raw||"").split(/\n+/).map(function(line){
    return cleanText(line);
  }).filter(function(x){
    try{return x.length>0&&/[\p{L}\p{N}]/u.test(x)}catch(e){return x.length>0}
  });
}
async function readImageTextAt(clientX,clientY){
  if(ocrBusy)throw new Error("Akwaaba is already reading an image");
  var img=imageElementAt(clientX,clientY);
  if(!img)return {text:"",lines:[],preview:""};
  ocrBusy=true;

  var full=prepareWholeImageForOcr(img);
  var preview=canvasPreview(full);

  state.innerHTML=
    '<div class="akwaaba-image-stage">'+
      '<div class="akwaaba-image-box">'+
        (preview?'<img src="'+preview+'" alt="Full product image being translated">':'')+
        '<div class="akwaaba-image-caption">Full image selected — scanning all visible words</div>'+
      '</div>'+
      '<div class="akwaaba-loading"><span class="akwaaba-spin"></span><span>Reading all text on this image…</span></div>'+
    '</div>';
  openPanel();

  try{
    var worker=await getAkwaabaOcrWorker();
    var result=await worker.recognize(full);
    var raw=(result&&result.data&&result.data.text)||"";
    var lines=cleanOcrLines(raw);
    return {text:lines.join("\n"),lines:lines,preview:preview};
  }finally{
    ocrBusy=false;
  }
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
  var el=frameElementAt(clientX,clientY),best="";
  if(!el)return"";
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
function localVerifiedTranslation(text){
  var raw=cleanText(text),prefix="",body=raw;
  var m=raw.match(/^([A-Za-z]{1,6}-?\d{1,6}(?:-\d+)?)\s+(.+)$/);
  if(m){prefix=m[1]+" ";body=m[2]}
  var key=body.toLowerCase().trim();
  if(LOCAL_VERIFIED[key]&&LOCAL_VERIFIED[key][selected])return prefix+LOCAL_VERIFIED[key][selected];
  var colon=body.match(/^([^:：]{1,40})[:：]\s*(.+)$/);
  if(colon){
    var label=colon[1].toLowerCase().trim();
    if(LOCAL_VERIFIED[label]&&LOCAL_VERIFIED[label][selected])return prefix+LOCAL_VERIFIED[label][selected]+": "+colon[2];
  }
  return "";
}
async function translateText(text,force){
  text=cleanText(text);
  if(!text){showInstruction("I could not find readable text there. Drag Akwaaba directly over a word, product name, button, or sentence.");return}
  lastText=text;
  var key=selected+"|"+text;
  var localHit=localVerifiedTranslation(text);
  if(localHit){
    lastTranslation=localHit;
    cache.set(key,{text:localHit,quality:"verified",confidence:1});
    persistAkwaabaCache();
    renderResult(text,localHit,"verified",1);
    return;
  }
  state.innerHTML='<div class="akwaaba-loading"><span class="akwaaba-spin"></span><span>Akwaaba is translating to '+escapeHtml(LANGS[selected].label)+'…</span></div>';
  openPanel();
  if(cache.has(key)&&!force){
    var cached=cache.get(key);
    renderResult(text,cached.text,cached.quality,cached.confidence);return;
  }
  try{
    var res=await fetch(ENDPOINT,{
      method:"POST",
      headers:{"Content-Type":"application/json","x-akwaaba-client":"ranova-site-v1"},
      body:JSON.stringify({q:text,target:selected})
    });
    var data=await res.json().catch(function(){return{}});
    if(!res.ok||!data.translated){
      lastTranslation="";
      var msg=data&&data.needs_review
        ?"Akwaaba is not confident enough to show a translation for this text. This result has been withheld rather than risk giving a misleading translation."
        :(data.error||"Akwaaba could not verify this translation.");
      state.innerHTML='<div class="akwaaba-quality blocked">⚠ Translation withheld</div><div class="akwaaba-error">'+escapeHtml(msg)+'</div>';
      openPanel();
      return;
    }
    cache.set(key,{text:data.translated,quality:data.quality||"automatic-checked",confidence:data.confidence});persistAkwaabaCache();
    lastTranslation=data.translated;
    renderResult(text,data.translated,data.quality||"automatic-checked",data.confidence);
  }catch(e){
    lastTranslation="";
    state.innerHTML='<div class="akwaaba-quality blocked">⚠ Translation withheld</div><div class="akwaaba-error">Akwaaba could not verify this translation, so no translation is being shown.</div>';
    openPanel();
  }
}
function renderResult(original,translated,quality,confidence){
  lastTranslation=translated;
  var isVerified=quality==="verified";
  var q=isVerified
    ?'<div class="akwaaba-quality verified">✓ Verified catalogue term</div>'
    :'<div class="akwaaba-quality checked">✓ Translation checked'+(typeof confidence==="number"?" · "+Math.round(confidence*100)+"%":"")+'</div>';
  var summary=isVerified
    ?"Matched against Ranova's verified terminology."
    :"Automatic translation passed Akwaaba's safety checks.";
  state.innerHTML=
    '<div class="akwaaba-result">'+
      '<div>'+q+'<div class="akwaaba-summary">'+escapeHtml(summary)+'</div></div>'+
      '<div class="akwaaba-block">'+
        '<div class="akwaaba-block-head"><span class="akwaaba-label">Original text</span><span class="akwaaba-language-pill">Detected source</span></div>'+
        '<div class="akwaaba-original">'+escapeHtml(original)+'</div>'+
      '</div>'+
      '<div class="akwaaba-arrow">↓</div>'+
      '<div class="akwaaba-block translation">'+
        '<div class="akwaaba-block-head"><span class="akwaaba-label">Translation</span><span class="akwaaba-language-pill">'+escapeHtml(LANGS[selected].label)+'</span></div>'+
        '<div class="akwaaba-output">'+escapeHtml(translated)+'</div>'+
      '</div>'+
    '</div>';
  openPanel();
}
function utf8Length(s){
  try{return new TextEncoder().encode(s).length}catch(e){return s.length}
}
function imageTextChunks(lines){
  var chunks=[],current="";
  (lines||[]).forEach(function(line){
    line=cleanText(line);
    if(!line)return;
    var candidate=current?current+"\n"+line:line;
    if(utf8Length(candidate)>520&&current){
      chunks.push(current);
      current=line;
    }else{
      current=candidate;
    }
  });
  if(current)chunks.push(current);
  return chunks;
}
async function translateImageChunk(text){
  var localHit=localVerifiedTranslation(text);
  if(localHit)return {translated:localHit,quality:"verified",confidence:1};
  var res=await fetch(ENDPOINT,{
    method:"POST",
    headers:{"Content-Type":"application/json","x-akwaaba-client":"ranova-site-v1"},
    body:JSON.stringify({q:text,target:selected})
  });
  var data=await res.json().catch(function(){return{}});
  if(!res.ok||!data.translated)throw new Error(data.error||"Translation unavailable");
  return {translated:data.translated,quality:data.quality||"automatic-checked",confidence:data.confidence};
}
async function translateWholeImageText(lines){
  var chunks=imageTextChunks(lines);
  if(!chunks.length)return {translated:"",quality:"automatic-checked"};
  // Translate several chunks concurrently so full-image mode does not become unnecessarily slow.
  var results=await Promise.all(chunks.map(function(chunk){return translateImageChunk(chunk)}));
  var allVerified=results.every(function(x){return x.quality==="verified"});
  var confidences=results.map(function(x){return typeof x.confidence==="number"?x.confidence:null}).filter(function(x){return x!==null});
  var minConfidence=confidences.length?Math.min.apply(Math,confidences):undefined;
  return {
    translated:results.map(function(x){return x.translated}).join("\n"),
    quality:allVerified?"verified":"automatic-checked",
    confidence:minConfidence
  };
}
function renderImageTranslationResult(preview,detected,translated,quality,confidence){
  lastTranslation=translated;
  var isVerified=quality==="verified";
  var q=isVerified
    ?'<div class="akwaaba-quality verified">✓ Verified translation</div>'
    :'<div class="akwaaba-quality checked">✓ Translation checked'+(typeof confidence==="number"?" · "+Math.round(confidence*100)+"%":"")+'</div>';

  state.innerHTML=
    '<div class="akwaaba-result">'+
      '<div>'+q+'<div class="akwaaba-summary">Akwaaba scanned the full image and translated the detected text below.</div></div>'+
      '<div class="akwaaba-image-box">'+
        (preview?'<img src="'+preview+'" alt="Translated image area">':'')+
        '<div class="akwaaba-image-caption">Full image translated by Akwaaba</div>'+
      '</div>'+
      '<div class="akwaaba-block">'+
        '<div class="akwaaba-block-head"><span class="akwaaba-label">Detected text</span><span class="akwaaba-language-pill">OCR</span></div>'+
        '<div class="akwaaba-detected">'+escapeHtml(detected)+'</div>'+
      '</div>'+
      '<div class="akwaaba-arrow">↓</div>'+
      '<div class="akwaaba-block translation">'+
        '<div class="akwaaba-block-head"><span class="akwaaba-label">Translation</span><span class="akwaaba-language-pill">'+escapeHtml(LANGS[selected].label)+'</span></div>'+
        '<div class="akwaaba-output">'+escapeHtml(translated)+'</div>'+
      '</div>'+
    '</div>';
  openPanel();
}
function imageCacheKey(img,x,y){
  var src=(img&&((img.currentSrc||img.src)))||"image";
  return "fullimg|"+src+"|"+selected;
}
async function translateAt(x,y){
  var img=imageElementAt(x,y);
  if(img){
    var key=imageCacheKey(img,x,y);
    if(cache.has(key)){
      var saved=cache.get(key);
      if(saved&&saved.preview&&saved.detected&&saved.translated){
        renderImageTranslationResult(saved.preview,saved.detected,saved.translated,saved.quality,saved.confidence);
        return;
      }
    }
    try{
      var ocr=await readImageTextAt(x,y);
      if(!ocr.text){
        state.innerHTML=
          '<div class="akwaaba-quality blocked">⚠ No clear text detected</div>'+
          (ocr.preview?'<div class="akwaaba-image-box"><img src="'+ocr.preview+'" alt="Image area"><div class="akwaaba-image-caption">Akwaaba checked the full image</div></div>':'')+
          '<div class="akwaaba-error">Akwaaba scanned the full image but could not detect clear readable text.</div>';
        openPanel();
        return;
      }

      state.innerHTML=
        '<div class="akwaaba-image-box">'+
          (ocr.preview?'<img src="'+ocr.preview+'" alt="Full image being translated">':'')+
          '<div class="akwaaba-image-caption">All detected text is being translated to '+escapeHtml(LANGS[selected].label)+'…</div>'+
        '</div>'+
        '<div class="akwaaba-loading"><span class="akwaaba-spin"></span><span>Translating all detected text…</span></div>';
      openPanel();

      var translatedPack;
      try{
        translatedPack=await translateWholeImageText(ocr.lines||cleanOcrLines(ocr.text));
      }catch(err){
        lastTranslation="";
        state.innerHTML=
          '<div class="akwaaba-quality blocked">⚠ Translation withheld</div>'+
          (ocr.preview?'<div class="akwaaba-image-box"><img src="'+ocr.preview+'" alt="Full image"><div class="akwaaba-image-caption">Full image scanned by Akwaaba</div></div>':'')+
          '<div class="akwaaba-block"><div class="akwaaba-block-head"><span class="akwaaba-label">Detected text</span><span class="akwaaba-language-pill">OCR</span></div><div class="akwaaba-detected">'+escapeHtml(ocr.text)+'</div></div>'+
          '<div class="akwaaba-error">'+escapeHtml(err&&err.message?err.message:"Akwaaba could not verify the full image translation.")+'</div>';
        openPanel();
        return;
      }

      var payload={
        preview:ocr.preview,
        detected:ocr.text,
        translated:translatedPack.translated,
        quality:translatedPack.quality||"automatic-checked",
        confidence:translatedPack.confidence
      };
      cache.set(key,payload);
      persistAkwaabaCache();
      renderImageTranslationResult(payload.preview,payload.detected,payload.translated,payload.quality,payload.confidence);
      return;
    }catch(e){
      state.innerHTML='<div class="akwaaba-quality blocked">⚠ Image translation failed</div><div class="akwaaba-error">Akwaaba could not process the full image clearly. Try again with a sharper product image.</div>';
      openPanel();
      return;
    }
  }
  var text=textAt(x,y);
  translateText(text,false);
}
translateHere.onclick=function(){var cc=orbCenter();translateAt(cc.x,cc.y)};
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

function akwaabaOcrWarmup(){
  if(akwaabaOcrReady)return;
  getAkwaabaOcrWorker().catch(function(){});
}
if("requestIdleCallback" in window){
  requestIdleCallback(function(){setTimeout(akwaabaOcrWarmup,1200)},{timeout:5000});
}else{
  setTimeout(akwaabaOcrWarmup,3500);
}

setTimeout(function(){
  if(!localStorage.getItem("akwaabaSeen")){
    orb.classList.add("hint");
    setTimeout(function(){orb.classList.remove("hint")},4200);
    try{localStorage.setItem("akwaabaSeen","1")}catch(e){}
  }
},900);
})();