export function messageWords(text) {
 const seen=new Set();
 return ((text||'').normalize('NFC').match(/[\p{L}\p{M}][\p{L}\p{M}\u200c\u200d]*(?:['’][\p{L}\p{M}][\p{L}\p{M}\u200c\u200d]*)*/gu)||[]).filter(word=>{
  const key=word.toLocaleLowerCase();if(seen.has(key))return false;seen.add(key);return true;
 }).slice(0,80);
}
export function uncertainRecognitionWords(record) {
 return [...new Set((record?.words||[]).filter(item=>item.unit==='word'&&Number.isFinite(item.model_probability)&&item.model_probability<.75).map(item=>item.text))];
}
