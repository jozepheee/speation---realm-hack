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
 const concern=content.concerns?.find(item=>item.word?.trim().toLowerCase()===key&&item.category==='substitution'&&item.expected_phone&&item.produced_phone);
 if(!concern)return null;
 const heard=CONTRASTS[key]?.[concern.expected_phone+'>'+concern.produced_phone];
 if(!heard)return null;
 return {expected:key,heard,speech:`Oops, that sounded like “${heard}”! Let’s try “${key}” together.`,source:'curated_spelling_of_reported_audio_phone_contrast'};
}
