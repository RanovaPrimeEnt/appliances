(()=>{
"use strict";
let deferredPrompt=null;
const installBtn=document.getElementById("installCustomerApp");
const updateNote=document.getElementById("customerUpdateNote");
const globalBtn=document.getElementById("globalInstallRanova");
const installHelp=document.getElementById("installHelp");
const closeHelp=document.getElementById("closeInstallHelp");

function note(text){
  if(!updateNote)return;
  updateNote.textContent=text||"";
  updateNote.classList.toggle("hide",!text);
}
function nativeShell(){
  return /RANOVA-(Android|iOS)\//i.test(navigator.userAgent);
}
function standalone(){
  return nativeShell() || window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone===true;
}
function isiOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent)}
function isAndroid(){return /android/i.test(navigator.userAgent)}
function syncButtons(){
  const installed=standalone();
  [installBtn,globalBtn].forEach(btn=>{
    if(!btn)return;
    btn.style.display=installed?"none":"inline-flex";
    btn.classList.toggle("hide",installed);
  });
}
function openHelp(){
  if(!installHelp || nativeShell())return;
  const title=installHelp.querySelector("[data-install-title]");
  const body=installHelp.querySelector("[data-install-body]");
  if(isiOS()){
    title.textContent="Install RANOVA on iPhone";
    body.innerHTML='<b>1.</b> Open this page in Safari.<br><b>2.</b> Tap the Share button.<br><b>3.</b> Choose <b>Add to Home Screen</b>.<br><b>4.</b> Tap <b>Add</b>.<br><br>RANOVA will appear on your Home Screen like an app.';
  }else if(isAndroid()){
    title.textContent="Install RANOVA on Android";
    body.innerHTML='<b>1.</b> Open this page in Chrome.<br><b>2.</b> Tap <b>Install RANOVA</b> again if the install prompt appears.<br><b>3.</b> If it does not, tap Chrome menu <b>⋮</b> → <b>Install app</b> or <b>Add to Home screen</b>.';
  }else{
    title.textContent="Install RANOVA";
    body.innerHTML='Use your browser menu and choose <b>Install app</b>, <b>Apps → Install this site as an app</b>, or <b>Add to Home Screen</b>.';
  }
  installHelp.style.display="grid";
}
async function install(){
  if(standalone())return;
  if(deferredPrompt){
    deferredPrompt.prompt();
    const choice=await deferredPrompt.userChoice.catch(()=>null);
    if(choice?.outcome==="accepted"){syncButtons();return}
    deferredPrompt=null;
  }
  openHelp();
}

window.addEventListener("beforeinstallprompt",e=>{
  if(nativeShell())return;
  e.preventDefault();
  deferredPrompt=e;
  syncButtons();
});
window.addEventListener("appinstalled",()=>{
  deferredPrompt=null;
  syncButtons();
  note("RANOVA is installed on this device.");
  setTimeout(()=>note(""),3500);
});
[installBtn,globalBtn].forEach(btn=>{if(btn)btn.addEventListener("click",install)});
if(closeHelp)closeHelp.addEventListener("click",()=>installHelp.style.display="none");
if(installHelp)installHelp.addEventListener("click",e=>{if(e.target===installHelp)installHelp.style.display="none"});
syncButtons();

if("serviceWorker" in navigator){
  // RANOVA_SW_FORCE_UPDATE_20260929
  navigator.serviceWorker.getRegistration("./").then(reg=>{
    if(reg){reg.update().catch(()=>{});if(reg.waiting)reg.waiting.postMessage({type:"SKIP_WAITING"})}
  }).catch(()=>{});
  window.addEventListener("load",async()=>{
    try{
      const reg=await navigator.serviceWorker.register("./rpe-v2-sw.js?v=20261001-21",{scope:"./",updateViaCache:"none"});
      reg.update().catch(()=>{});
      setInterval(()=>reg.update().catch(()=>{}),30*60*1000);
      if(reg.waiting)reg.waiting.postMessage({type:"SKIP_WAITING"});
      reg.addEventListener("updatefound",()=>{
        const worker=reg.installing;
        if(!worker)return;
        worker.addEventListener("statechange",()=>{
          if(worker.state==="installed"&&navigator.serviceWorker.controller){
            note("Updating RANOVA…");
            worker.postMessage({type:"SKIP_WAITING"});
          }
        });
      });
      navigator.serviceWorker.addEventListener("controllerchange",()=>{
        note("");
      });
    }catch(err){console.error("RANOVA install/update setup failed",err)}
  });
}
})();