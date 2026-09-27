(()=>{
"use strict";
let deferredPrompt=null;
const installBtn=document.getElementById("installAdminApp");
const updateNote=document.getElementById("adminUpdateNote");

function setNote(text){
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
  setNote("RANOVA Admin is installed on this device.");
  setTimeout(()=>setNote(""),3500);
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
    setNote("On iPhone/iPad: Share → Add to Home Screen. On supported desktop/Android browsers use the browser Install App option.");
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
          if(worker.state==="installed" && navigator.serviceWorker.controller){
            setNote("Updating RANOVA Admin…");
            worker.postMessage({type:"SKIP_WAITING"});
          }
        });
      });

      let refreshing=false;
      navigator.serviceWorker.addEventListener("controllerchange",()=>{
        if(refreshing)return;
        refreshing=true;
        setNote("RANOVA Admin updated. Reloading…");
        setTimeout(()=>location.reload(),700);
      });
    }catch(err){
      console.error("Admin app install/update setup failed",err);
    }
  });
}
})();