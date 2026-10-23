// Curated teaching spellings, gated by an audio-assessment concern.
// These display a reported contrast; they are not an independent word transcript.
const CONTRASTS={
 green:{'g>b':'breen','ɡ>b':'breen'},
 ring:{'ɹ>w':'wing','r>w':'wing'},
 ray:{'ɹ>w':'way','r>w':'way'},
 key:{'k>t':'tea'},
 sip:{'s>ʃ':'ship'},
 fan:{'f>p':'pan'}
};
export function supportedContrast(content,word){
 if(content?.state!=='tentative_observation')return null;
 const key=String(word||'').trim().toLowerCase();
 const plan=content.teaching_plan?.find(item=>item.word?.trim().toLowerCase()===key)?.correction;
 if(plan?.source==='indicwav2vec_character_contrast'&&plan.speech&&plan.heard&&content.concerns?.some(item=>item.word?.trim().toLowerCase()===key&&item.expected_phone===plan.expected_phone))return plan;
 const concern=content.concerns?.find(item=>item.word?.trim().toLowerCase()===key&&item.category==='substitution'&&item.expected_phone&&item.produced_phone);
 if(!concern)return null;
 const heard=CONTRASTS[key]?.[concern.expected_phone+'>'+concern.produced_phone];
 const spoken=content.teaching_plan?.find(item=>item.word?.trim().toLowerCase()===key)?.correction;
 if(!heard&&spoken?.speech&&spoken?.heard&&spoken.expected_phone===concern.expected_phone&&spoken.produced_phone===concern.produced_phone&&spoken.source==='speakable_supported_audio_contrast')return spoken;
 if(!heard)return null;
 return {expected:key,heard,kind:'word',speech:`Oops, that sounded like “${heard}”! Let’s try “${key}” together.`,source:'curated_spelling_of_reported_audio_phone_contrast'};
}
