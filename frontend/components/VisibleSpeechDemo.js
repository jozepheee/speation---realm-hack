const PLANS={
 ə:{shape:'relaxed',cue:'Relax your mouth. Listen, then copy the word.',label:'Relaxed mouth opening for the short vowel'},
 ɛ:{shape:'open',cue:'Listen to the short sound in bed, then your word.',label:'Comfortable mouth opening for the vowel in bed'},
 æ:{shape:'open',cue:'Watch the open mouth. Listen to cat, then your word.',label:'Comfortable open mouth for the vowel in cat'},
 ɪ:{shape:'spread',cue:'Listen to sit. Keep the sound short, then try your word.',label:'Gently spread lips for a short vowel'},
 ɑ:{shape:'open',cue:'Open comfortably. Listen, then try your word.',label:'Comfortable open mouth for the target vowel'},
 'ɑː':{shape:'open',cue:'Open comfortably. Listen, then try your word.',label:'Comfortable open mouth for the target vowel'},
 ɔ:{shape:'round',cue:'Watch the rounded lips. Listen, then try your word.',label:'Rounded lips for the target vowel'},
 'ɔː':{shape:'round',cue:'Watch the rounded lips. Listen, then try your word.',label:'Rounded lips for the target vowel'},
 p:{shape:'closed',cue:'Bring your lips together, then open them gently.',label:'Lips closing before a soft release'},
 b:{shape:'closed',cue:'Bring your lips together, then open them with your voice.',label:'Lips closing before a voiced release'},
 m:{shape:'closed',cue:'Keep your lips together and hum gently.',label:'Lips together for a gentle hum'},
 f:{shape:'teeth',cue:'Rest your top teeth gently on your bottom lip. Blow softly.',label:'Upper teeth resting lightly on the lower lip'},
 v:{shape:'teeth',cue:'Rest your top teeth gently on your bottom lip. Add your voice.',label:'Upper teeth resting lightly on the lower lip'},
 w:{shape:'round',cue:'Round your lips gently, then open into your word.',label:'Gently rounded lips'},
 u:{shape:'round',cue:'Round your lips gently, like the long sound in moon.',label:'Gently rounded lips'},
 'uː':{shape:'round',cue:'Round your lips gently, like the long sound in moon.',label:'Gently rounded lips'},
 'iː':{shape:'spread',cue:'Let your lips spread comfortably, like in see.',label:'Comfortably spread lips'},
 i:{shape:'spread',cue:'Let your lips spread comfortably, like in see.',label:'Comfortably spread lips'}
};
export default function VisibleSpeechDemo({phone}){
 const plan=PLANS[phone];if(!plan)return null;
 const round=plan.shape==='round',closed=plan.shape==='closed',teeth=plan.shape==='teeth';
 return <figure lang="en" translate="no" style={{margin:'12px 0'}}><svg viewBox="0 0 240 125" role="img" aria-label={plan.label} style={{width:'100%',maxWidth:260}}>
 <rect width="240" height="125" rx="20" fill="#fff4e8"/><ellipse cx="120" cy="65" rx={round?35:79} ry={round?36:closed?7:22} fill="#78474d" stroke="#ce7c87" strokeWidth="10"><animate attributeName="ry" values={closed?'7;3;3;22;7':round?'36;30;36':'22;17;22'} dur="3s" repeatCount="indefinite"/></ellipse>
 {teeth&&<path d="M52 49 Q120 40 188 49 L181 67 Q120 73 59 67Z" fill="white"/>}
 <path d={round?'M94 20 Q120 13 146 20':'M51 22 Q120 8 189 22'} fill="none" stroke="#d9c5b0" strokeWidth="3"/>
 </svg><figcaption>{plan.cue}</figcaption><small>Teaching picture. Compare only visible lip movement in your mirror.</small></figure>;
}
