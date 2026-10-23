// Short spoken demonstrations; technical acoustic observations stay in sound details.
export function childSpeechPractice(language,word,phone='',unclear=false,attempt=0) {
 const hints={
  en:{s:'Try a gentle snake sound, like in sun.',ɹ:'Listen to the first sound in red. Keep your tongue comfortable and try red slowly.',r:'Listen to the first sound in red. Keep your tongue comfortable and try red slowly.',k:'Watch the mouth picture. Listen to key, then try your word.',m:'Close your lips gently and hum, like in moon.',p:'Close your lips, then open them gently, like in pen.',f:'Try the soft air sound in fun.',ə:'Try a soft “uh”, like the beginning of about.',ɛ:'Try the short sound in bed.',ɪ:'Try the short sound in sit.', 'iː':'Try the long sound in see.'},
  hi:{'t̪':'जीभ हल्के से दाँतों के पास रखें।','p':'होंठ मिलाएँ, फिर धीरे खोलें।','kʰ':'थोड़ी हवा के साथ ख कहें।'},
  ml:{'p':'ചുണ്ടുകൾ ചേർത്ത് പതുക്കെ തുറക്കൂ.','m':'ചുണ്ടുകൾ ചേർത്ത് മൃദുവായി മൂളൂ.','ɻ':'നാവിന്റെ അറ്റം അല്പം പിന്നിലേക്ക് വളയ്ക്കൂ. ബലം വേണ്ട.'}
 };
 const alternatives={
  s:['Keep your teeth close and let a little air out.','Listen to sun. Try the start of sun, then your word.'],
  p:['Bring your lips together, then let them pop open softly.','Watch your lips close in the mirror, then try your word.'],
  m:['Keep your lips together and make a gentle hum.','Hum softly first, then try your word.'],
  f:['Rest your top teeth gently on your bottom lip and blow softly.','Watch the teeth and lip in the mirror, then try your word.'],
  k:['Keep your tongue tip low and try the start of key.','Listen to key, then try your word slowly.'],
  r:['Listen to red. Try it slowly without pushing your tongue.','Listen once more, relax, then try your word.'],
  'ɹ':['Listen to red. Try it slowly without pushing your tongue.','Listen once more, relax, then try your word.']
 };
 const hint=language==='en'&&['g','ɡ','k','t','d','ɹ','r'].includes(phone)?'Watch the mouth picture. Listen, then copy the word.':language==='en'&&attempt>0?(alternatives[phone]?.[Math.min(attempt-1,1)]||'Listen once, take your time, then try your word slowly.'):(hints[language]?.[phone]||'');
 const lines={
  en:{title:`Let’s practise “${word}”.`,listen:`Listen: ${word}.`,turn:'Now you try.',unclear:'I couldn’t hear that clearly.'},
  hi:{title:`आओ “${word}” बोलें।`,listen:`सुनो: ${word}।`,turn:'अब तुम बोलो।',unclear:'मुझे ठीक से सुनाई नहीं दिया।'},
  ml:{title:`“${word}” നമുക്ക് പറഞ്ഞുനോക്കാം.`,listen:`കേൾക്കൂ: ${word}.`,turn:'ഇനി നീ പറഞ്ഞുനോക്കൂ.',unclear:'എനിക്ക് വ്യക്തമായി കേൾക്കാനായില്ല.'}
 };
 const line=lines[language]||lines.en;
 return {title:line.title,hint,turn:line.turn,speech:[unclear?line.unclear:'',hint,line.listen,line.turn].filter(Boolean).join(' ')};
}

export function practiceOutcome(feedback,phase,differentWord=false) {
 if(feedback?.state!=='no_clear_difference'||feedback.concerns?.length||differentWord)return 'retry';
 return phase==='word'?'offer_sentence':'finished';
}

export function childPracticeResult(language,outcome) {
 const lines={
  en:{offer_sentence:'That sounded clear! Want to try it in a sentence?',finished:'All done for now. Thanks for practising with me!'},
  hi:{offer_sentence:'इस बार साफ़ सुनाई दिया! अब इसे वाक्य में बोलोगे?',finished:'अभी के लिए हो गया। मेरे साथ बोलने के लिए धन्यवाद!'},
  ml:{offer_sentence:'ഇത്തവണ വ്യക്തമായി കേട്ടു! ഇനി ഒരു വാക്യത്തിൽ പറഞ്ഞുനോക്കണോ?',finished:'ഇന്നത്തേക്ക് കഴിഞ്ഞു. എന്റെ കൂടെ പരിശീലിച്ചതിന് നന്ദി!'}
 };
 return (lines[language]||lines.en)[outcome];
}
