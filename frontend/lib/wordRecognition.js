export function wordRecognition(expected,heard) {
 const key=value=>(value||'').normalize('NFC').toLowerCase().replace(/[\u200c\u200d]/g,'').replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim();
 const target=key(expected),actual=key(heard);
 if(!target||!actual||target.includes(' '))return 'unavailable';
 return target===actual?'matches_target':'different_word';
}
export function practiceFeedbackTitle(state,expected,heard) {
 if(wordRecognition(expected,heard)==='different_word')return 'Answer did not match — try again';
 return state==='tentative_observation'?'Try this sound':state==='no_clear_difference'?'No clear sound difference heard':'Could not assess this attempt clearly';
}
