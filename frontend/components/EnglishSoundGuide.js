import {useState} from 'react';
import {useLocale} from '../context/LocaleContext';
import {MouthDiagram} from '../vendor/bakery/components/MouthDiagram';
import {childSpeechPractice} from '../lib/childSpeechPractice';
import VisibleSpeechDemo from './VisibleSpeechDemo';
export default function EnglishSoundGuide({target,feedback,onHear,disabled}){
 const {t}=useLocale(),[open,setOpen]=useState(false);
 const plan=feedback?.content?.teaching_plan?.[0];
 const word=plan?.word||target?.word||target?.expected_text||'';
 const phone=plan?.expected_phone||target?.sound||target?.pronunciation_reference?.words?.[0]?.variants?.[0]?.[0]||'';
 const id={s:'S',ɹ:'R',r:'R',k:'K'}[phone];
 if(!word)return null;
 const cue=childSpeechPractice('en',word,phone);
 return <section className="english-sound-guide" aria-label={t('Watch and listen')} style={{maxWidth:340}}>
  <button aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{t(open?'Hide sound guide':'Watch and listen')}</button>
  {open&&<div><p>{cue.hint||t('Listen to the word slowly, then try it once.')}</p>{id?<MouthDiagram soundId={id}/>:<VisibleSpeechDemo phone={phone}/>}<p><small>{t('Example of making the target sound; this does not measure your mouth or tongue.')}</small></p><button disabled={disabled} onClick={()=>onHear(cue.speech)}>{t('Hear a slow example')}</button></div>}
 </section>;
}
