import {useState} from 'react';
import VisibleSpeechDemo from './VisibleSpeechDemo';
import {movementForSound} from '../lib/visualArticulation';
import styles from '../styles/articulation-coach.module.css';
const PLACES={g:'back',ɡ:'back',k:'back',ŋ:'back',θ:'dental',ð:'dental',t:'front',d:'front',n:'front',l:'front',s:'air',z:'air',ʃ:'air',ɹ:'curved',r:'curved',ɻ:'curved',ɭ:'curved'};
export default function ArticulationCoach({word,phone='',produced='',onHear,disabled=false,age=8,cameraSupport,contrast}){
 const [slow,setSlow]=useState(false);if(!word)return null;
 const place=PLACES[phone],movement=movementForSound(phone),voiced=['g','ɡ','d','n','l','z','ɹ','r','b','m','v'].includes(phone);
 const shape=place==='dental'?'M34 182 Q80 149 145 144 Q200 137 245 136 Q261 141 244 151 Q210 167 218 176 L218 187Z':place==='back'?'M34 182 Q34 93 76 65 Q109 42 137 95 Q165 144 218 166 L218 187Z':place==='curved'?'M34 182 Q58 114 127 106 Q162 94 166 122 Q168 153 218 166 L218 187Z':'M34 182 Q75 143 143 130 Q199 119 218 102 Q229 98 225 122 Q205 150 218 166 L218 187Z';
 return <section lang="en" translate="no" className={styles.coach} aria-label="Watch the sound demonstration">
 <div className={styles.heading}><span>Watch · listen · your turn</span><h3>{word}</h3>{contrast?<p>{contrast.speech}</p>:produced&&<p>Oops, that sounded a little different. Let’s try together.</p>}</div>
 {word.trim().toLowerCase()==='green'&&<figure className={styles.wordPicture}><svg viewBox="0 0 380 170" role="img" aria-label="A green leafy branch"><rect width="380" height="170" rx="24" fill="#e9f4dc"/><path d="M55 135Q175 100 325 42" stroke="#826849" strokeWidth="12" fill="none" strokeLinecap="round"/>{[105,155,205,255].map((x,i)=><g key={x} transform={`translate(${x} ${118-i*18})`}><ellipse cx="0" cy="-23" rx="16" ry="32" fill={i%2?'#4b9354':'#78ad50'} transform="rotate(-35)"/><ellipse cx="26" cy="14" rx="15" ry="29" fill="#92bf64" transform="rotate(55 26 14)"/></g>)}</svg><figcaption>green</figcaption></figure>}
 <div className={styles.lesson}>
 {place?<svg viewBox="0 0 300 240" role="img" aria-label={`Illustrated mouth cutaway for the target sound in ${word}`}>
 <rect width="300" height="240" rx="28" fill="#fff0e8"/><path d="M30 65 Q140 20 222 80 L248 100 L248 185 Q140 218 30 200Z" fill="#f7ced8"/>
 <path d="M30 58 Q150 10 234 85" stroke="#d77791" strokeWidth="15" fill="none"/>
 <path d="M35 202 Q147 218 241 185" stroke="#d77791" strokeWidth="14" fill="none"/>
 <rect x="224" y="92" width="15" height="29" rx="4" fill="white"/><rect x="221" y="158" width="16" height="25" rx="4" fill="white"/>
 <path d={shape} fill="#d66d8d"><animate attributeName="opacity" values=".45;1;1;.45" dur={slow?'5s':'3s'} repeatCount="indefinite"/>{place==='back'&&<animate attributeName="d" values={`M34 182 Q45 170 76 162 Q109 152 137 158 Q165 165 218 166 L218 187Z;${shape};${shape};M34 182 Q45 170 76 162 Q109 152 137 158 Q165 165 218 166 L218 187Z`} dur={slow?'5s':'3s'} repeatCount="indefinite"/>}</path>
 <circle cx={place==='back'?88:place==='curved'?151:place==='dental'?244:218} cy={place==='back'?65:place==='curved'?104:place==='dental'?139:100} r="15" fill="none" stroke="#8056d8" strokeWidth="4"><animate attributeName="r" values="11;18;11" dur={slow?'5s':'3s'} repeatCount="indefinite"/></circle>
 <path d="M251 140 Q267 130 289 140" fill="none" stroke="#65a9c9" strokeWidth="5" strokeDasharray="8 8"><animate attributeName="stroke-dashoffset" from="32" to="0" dur="1s" repeatCount="indefinite"/></path>
 {voiced&&<g stroke="#8056d8" fill="none" strokeWidth="4"><path d="M57 214q10 8 20 0t20 0"/><path d="M57 225q10 8 20 0t20 0"/></g>}
 <text x="150" y="29" textAnchor="middle" fontSize="13" fill="#68485b">{place==='back'?'Watch the purple spot at the back':place==='curved'?'Watch the tongue shape':'Watch the purple spot'}</text>
 </svg>:<VisibleSpeechDemo phone={phone}/>}
 <div><p className={styles.cue}>{age>=16?'Watch the demonstration, then repeat the word.':'Watch my mouth picture. Listen… now you try!'}</p>
 <button disabled={disabled} onClick={()=>onHear?.(word)}>▶ Hear “{word}”</button><button disabled={disabled} aria-pressed={slow} onClick={()=>{setSlow(!slow);onHear?.(word,{slow:true});}}>🐢 Hear slowly</button>
 {contrast&&<button disabled={disabled} onClick={()=>onHear?.(contrast.speech)}>Hear Maya’s correction</button>}
 <p>{cameraSupport?.cue||movement.label}</p><small>{movement.visible?'Your mirror can help you copy this visible movement.':'The picture shows inside the mouth. Your camera cannot check this hidden movement.'}</small>
 </div></div><details><summary>For a parent or therapist</summary><p>Illustrative articulation teaching, not a reconstruction of this learner’s tongue or exact phoneme lip sync. Audio assessment determines the practice result; camera observations provide supporting visible geometry only.</p><p>Expected sound: {phone||'Listen to the complete example'}{produced?`; possible heard sound: ${produced}`:''}</p></details>
 </section>;
}
