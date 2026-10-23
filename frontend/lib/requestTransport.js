// Keep the deadline active until the response body is consumed, including audio.
async function requestTransport(url,options={},format='json',timeoutMs=45000){
 const controller=new AbortController(),signal=options.signal;
 let timedOut=false;
 const abort=()=>controller.abort(signal?.reason);
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
 try{
  const response=await fetch(url,{...options,signal:controller.signal});
  let data;
  if(format==='blob')data=await response.blob();
  else if(response.status===204)data={};
  else try{data=await response.json();}catch(error){
   if(controller.signal.aborted)throw error;
   if(response.ok)throw new Error('The server returned an unreadable response. Please retry.');
   data={};
  }
  return {response,data};
 }catch(error){
  if(timedOut)throw new Error('The request timed out. Check your connection and retry.');
  throw error;
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
module.exports={requestTransport};
