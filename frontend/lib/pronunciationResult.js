// Assessment display never turns unflagged words or a clean transcript into a correctness grade.
export function pronunciationResult(content,expected=''){
 const words=[...new Set((expected.match(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu)||[]).map(word=>word.toLowerCase()))];
 const concerns=[];const seen=new Set();
 if(content?.state==='tentative_observation')for(const item of content.concerns||[]){
  const word=String(item.word||'').trim();const key=word.toLowerCase();
  if(!key||!words.includes(key)||seen.has(key)||item.category==='uncertain')continue;
  seen.add(key);concerns.push({...item,word});
 }
 const state=content?.state==='no_clear_difference'&&!content.concerns?.length?'clear':concerns.length?'practice':'uncertain';
 return {state,title:state==='clear'?'That sounded clear!':state==='practice'?'Here’s what to practise':'I couldn’t check that clearly',
  concerns,unflagged:words.filter(word=>!seen.has(word)),
  explanation:state==='clear'?'No clear pronunciation difference was heard in this recording.':state==='practice'?'These words may need another try. Other words were not individually marked correct.':'Your recording is saved. This result does not mean you said it incorrectly.'};
}
