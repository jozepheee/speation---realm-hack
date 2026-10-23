// Original screen interface retained; sound decisions come only from Speation's
// authenticated audio assessment. No spelling distance or browser-text grading.
export function makeWordCheck(sound,item){
 return {word:item.word??item.say,soundId:sound.id,nearMisses:item.nearMisses??{}};
}
