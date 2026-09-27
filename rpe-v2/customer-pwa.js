(()=>{
"use strict";
let deferredPrompt=null;
const installBtn=document.getElementById("installCustomerApp");
const updateNote=document.getElementById("customerUpdateNote");

function note(text){
  if(!updateNote)return;
  updateNote.textContent=text||"";
  updateNote.classList.toggle("hide",!text);
}

window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault();
  deferredPrompt=e;
  if(installBtn)installBtn.classList.remove("hide");
});

window.addEventListener("appinstalled",()=>{
  deferredPrompt=null;
  if(installBtn)installBtn.classList.add("hide");
  note("RANOVA is installed on this device.");
  setTimeout(()=>note(""),3500);
});

if(installBtn){
  installBtn.addEventListener("click",async()=>{
    if(deferredPrompt){
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(()=>null);
      deferredPrompt=null;
      installBtn.classList.add("hide");
      return;
    }
    note("On iPhone/iPad: Share → Add to Home Screen. On Android/desktop use the browser Install App option.");
  });
}

if("serviceWorker" in navigator){
  window.addEventListener("load",async()=>{
    try{
      const reg=await navigator.serviceWorker.register("./rpe-v2-sw.js",{scope:"./"});
      reg.update().catch(()=>{});
      setInterval(()=>reg.update().catch(()=>{}),5*60*1000);

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

      let refreshing=false;
      navigator.serviceWorker.addEventListener("controllerchange",()=>{
        if(refreshing)return;
        refreshing=true;
        note("RANOVA updated. Reloading…");
        setTimeout(()=>location.reload(),700);
      });
    }catch(err){
      console.error("RANOVA install/update setup failed",err);
    }
  });
}
})();