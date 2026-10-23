// Rhubarb timing is an animation reference, never evidence about learner speech.
export const SPEECH_MORPHS = ['viseme_PP','viseme_FF','viseme_TH','viseme_DD','viseme_kk','viseme_CH','viseme_SS','viseme_nn','viseme_RR','viseme_aa','viseme_E','viseme_I','viseme_O','viseme_U'];
const RHUBARB = {
 A:{viseme_PP:.9}, B:{viseme_DD:.65}, C:{viseme_E:.8},
 D:{viseme_aa:.85}, E:{viseme_O:.75}, F:{viseme_U:.85},
 G:{viseme_FF:.8}, H:{viseme_nn:.75}, X:{}
};
export function timedVisemes(alignment,time,speaking){
 if(speaking&&Array.isArray(alignment?.visemeCues)&&Number.isFinite(time)){
  const cue=alignment.visemeCues.find(item=>time>=item.start&&time<item.end);
  return cue?.morph&&SPEECH_MORPHS.includes(cue.morph)?{[cue.morph]:.8}:{};
 }
 if(!speaking||!Array.isArray(alignment?.mouthCues)||!Number.isFinite(time))return null;
 const cue=alignment.mouthCues.find(item=>Number.isFinite(item.start)&&Number.isFinite(item.end)&&time>=item.start&&time<item.end)?.value||'X';
 return RHUBARB[cue]||RHUBARB.X;
}
