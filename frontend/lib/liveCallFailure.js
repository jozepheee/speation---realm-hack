// Tool errors are reported by the SDK without closing its media connection.
export function recoverableVoiceError(message,context){
 return !!context?.clientToolName||/^Client tool (execution failed|with name )/.test(String(message||''));
}
export function voiceDisconnectMessage(details){
 const message=details?.message||details?.closeReason||details?.context?.reason;
 const reason=typeof message==='string'?message.replace(/[\r\n]/g,' ').slice(0,300):'';
 if(details?.reason==='agent')return 'Maya ended the voice session'+(reason?': '+reason:'. Please reconnect.');
 return 'The voice connection closed'+(reason?': '+reason:'. Please reconnect.');
}
