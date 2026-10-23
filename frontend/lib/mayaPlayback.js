// The WebRTC SDK appends hidden audio elements. Autoplay can reject playback
// after asynchronous permission/token requests have consumed the click gesture.
export function watchMayaPlayback(onBlocked) {
  const existing=new Set(document.querySelectorAll('audio'));
  const owned=new Set(),blocked=new Set(),listeners=new Map();let stopped=false;
  const report=()=>{if(!stopped)onBlocked(blocked.size>0);};
  async function play(element){
    if(stopped)return;
    // SDK elements can be inserted before their remote stream is attached.
    // Empty media is not an autoplay failure; retry once metadata arrives.
    if(!element.srcObject&&!element.currentSrc&&!element.getAttribute('src'))return;
    try{element.muted=false;await element.play();if(!stopped){blocked.delete(element);report();}}
    catch(error){if(!stopped&&owned.has(element)&&error.name==='NotAllowedError'){blocked.add(element);report();}}
  }
  function check(){for(const element of document.querySelectorAll('audio')){
    if(!existing.has(element)&&!owned.has(element)){
      owned.add(element);
      const retry=()=>void play(element),playing=()=>{blocked.delete(element);report();};
      listeners.set(element,{retry,playing});element.addEventListener('loadedmetadata',retry);element.addEventListener('canplay',retry);element.addEventListener('playing',playing);
      void play(element);
    }
  }
  for(const element of owned)if(!element.isConnected){const {retry,playing}=listeners.get(element);element.removeEventListener('loadedmetadata',retry);element.removeEventListener('canplay',retry);element.removeEventListener('playing',playing);listeners.delete(element);owned.delete(element);blocked.delete(element);report();}}
  const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true});
  return {check,resume(){for(const element of owned)void play(element);},stop(){stopped=true;observer.disconnect();for(const [element,{retry,playing}] of listeners){element.removeEventListener('loadedmetadata',retry);element.removeEventListener('canplay',retry);element.removeEventListener('playing',playing);}listeners.clear();owned.clear();blocked.clear();}};
}
