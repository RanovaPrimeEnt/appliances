(()=>{
"use strict";
let deferredPrompt=null;
const installBtn=document.getElementById("installAdminApp");
const updateNote=document.getElementById("adminUpdateNote");
const help=document.getElementById("adminInstallHelp");
const close=document.getElementById("closeAdminInstallHelp");
function installed(){return matchMedia("(display-mode: standalone)").matches||navigator.standalone===true}
function isiOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent)}
function isAndroid(){return /android/i.test(navigator.userAgent)}
function setNote(text){if(!updateNote)return;updateNote.textContent=text||"";updateNote.classList.toggle("hide",!text)}
function sync(){if(!installBtn)return;installBtn.style.display=installed()?"none":"inline-flex";installBtn.classList.remove("hide")}
function showHelp(){
  if(!help)return;
  const title=help.querySelector("[data-title]"),body=help.querySelector("[data-body]");
  if(isiOS()){title.textContent="Install RANOVA Admin on iPhone";body.innerHTML="<b>1.</b> Open this Admin Console in Safari.<br><b>2.</b> Tap Share.<br><b>3.</b> Choose <b>Add to Home Screen</b>.<br><b>4.</b> Tap <b>Add</b>."}
  else if(isAndroid()){title.textContent="Install RANOVA Admin on Android";body.innerHTML="<b>1.</b> Open this page in Chrome.<br><b>2.</b> Tap <b>Install app</b> when prompted.<br><b>3.</b> Otherwise use Chrome <b>⋮ → Install app</b> or <b>Add to Home screen</b>."}
  else{title.textContent="Install RANOVA Admin";body.innerHTML="Use your browser menu and choose <b>Install app</b> or <b>Add to Home Screen</b>."}
  help.style.display="grid";
}
async function install(){
  if(installed())return;
  if(deferredPrompt){deferredPrompt.prompt();const c=await deferredPrompt.userChoice.catch(()=>null);if(c?.outcome==="accepted"){sync();return}deferredPrompt=null}
  showHelp();
}
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;sync()});
window.addEventListener("appinstalled",()=>{deferredPrompt=null;sync();setNote("RANOVA Admin is installed on this device.");setTimeout(()=>setNote(""),3500)});
if(installBtn)installBtn.addEventListener("click",install);
if(close)close.onclick=()=>help.style.display="none";
if(help)help.addEventListener("click",e=>{if(e.target===help)help.style.display="none"});
sync();
if("serviceWorker" in navigator){
  window.addEventListener("load",async()=>{
    try{
      const reg=await navigator.serviceWorker.register("./rpe-v2-sw.js",{scope:"./",updateViaCache:"none"});
      reg.update().catch(()=>{});setInterval(()=>reg.update().catch(()=>{}),5*60*1000);
      if(reg.waiting)reg.waiting.postMessage({type:"SKIP_WAITING"});
      reg.addEventListener("updatefound",()=>{const w=reg.installing;if(!w)return;w.addEventListener("statechange",()=>{if(w.state==="installed"&&navigator.serviceWorker.controller){setNote("Updating RANOVA Admin…");w.postMessage({type:"SKIP_WAITING"})}})});
      let refreshing=false;navigator.serviceWorker.addEventListener("controllerchange",()=>{if(refreshing)return;refreshing=true;setNote("RANOVA Admin updated. Reloading…");setTimeout(()=>location.reload(),700)});
    }catch(e){console.error("Admin app install/update setup failed",e)}
  });
}
})();