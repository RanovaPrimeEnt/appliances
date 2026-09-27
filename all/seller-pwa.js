(()=>{
"use strict";
let deferredPrompt=null;
const buttons=[...document.querySelectorAll("[data-install-seller]")];
const help=document.getElementById("sellerInstallHelp");
const close=document.getElementById("closeSellerInstallHelp");
function installed(){return matchMedia("(display-mode: standalone)").matches||navigator.standalone===true}
function isiOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent)}
function isAndroid(){return /android/i.test(navigator.userAgent)}
function sync(){buttons.forEach(b=>{b.style.display=installed()?"none":"inline-flex";b.classList.remove("hide")})}
function showHelp(){
  if(!help)return;
  const title=help.querySelector("[data-title]"),body=help.querySelector("[data-body]");
  if(isiOS()){
    title.textContent="Install RANOVA Seller on iPhone";
    body.innerHTML="<b>1.</b> Open this Seller Center in Safari.<br><b>2.</b> Tap Share.<br><b>3.</b> Choose <b>Add to Home Screen</b>.<br><b>4.</b> Tap <b>Add</b>.";
  }else if(isAndroid()){
    title.textContent="Install RANOVA Seller on Android";
    body.innerHTML="<b>1.</b> Open this page in Chrome.<br><b>2.</b> Tap <b>Install RANOVA Seller</b> again if Chrome shows the prompt.<br><b>3.</b> Otherwise use Chrome <b>⋮ → Install app</b> or <b>Add to Home screen</b>.";
  }else{
    title.textContent="Install RANOVA Seller";
    body.innerHTML="Use your browser menu and select <b>Install app</b> or <b>Add to Home Screen</b>.";
  }
  help.style.display="grid";
}
async function install(){
  if(installed())return;
  if(deferredPrompt){
    deferredPrompt.prompt();
    const choice=await deferredPrompt.userChoice.catch(()=>null);
    if(choice?.outcome==="accepted"){sync();return}
    deferredPrompt=null;
  }
  showHelp();
}
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;sync()});
window.addEventListener("appinstalled",()=>{deferredPrompt=null;sync()});
buttons.forEach(b=>b.addEventListener("click",install));
if(close)close.onclick=()=>help.style.display="none";
if(help)help.addEventListener("click",e=>{if(e.target===help)help.style.display="none"});
sync();
if("serviceWorker" in navigator){
  addEventListener("load",async()=>{
    try{
      const reg=await navigator.serviceWorker.register("../seller-sw.js",{scope:"./",updateViaCache:"none"});
      reg.update().catch(()=>{});
      setInterval(()=>reg.update().catch(()=>{}),5*60*1000);
      if(reg.waiting)reg.waiting.postMessage({type:"SKIP_WAITING"});
      reg.addEventListener("updatefound",()=>{
        const w=reg.installing;if(!w)return;
        w.addEventListener("statechange",()=>{if(w.state==="installed"&&navigator.serviceWorker.controller)w.postMessage({type:"SKIP_WAITING"})});
      });
      let refreshing=false;
      navigator.serviceWorker.addEventListener("controllerchange",()=>{if(refreshing)return;refreshing=true;setTimeout(()=>location.reload(),500)});
    }catch(e){console.error("Seller app install/update failed",e)}
  });
}
})();