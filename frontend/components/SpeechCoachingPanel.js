import {useLocale} from '../context/LocaleContext';
import styles from '../styles/companion.module.css';
export default function SpeechCoachingPanel({feedback,busy,error,onHear,onPractice,disabled=false}){
 const {t}=useLocale();if(!feedback&&!busy&&!error)return null;
 const content=feedback?.content;
 const activities=content?.concerns?.length?content.concerns:(content?.teaching_plan||[]);
 return <section className={styles.speechCoach}>
  <h3>{t('Maya’s audio coaching')}</h3>
  {busy&&<p role="status">{t('Listening to your recorded attempt…')}</p>}
  {error&&<p role="alert">{t(error)}</p>}
  {content&&<>
   <small>{t('AI practice suggestions — not a clinical assessment')}</small>
   <p>{content.summary}</p>
   {activities.map((item,index)=><article key={index}>
    <h4>{item.word}</h4>
    {item.expected_phone&&<p>{t('Target sound')}: /{item.expected_phone}/{item.produced_phone&&<> · {t('Possible heard sound')}: /{item.produced_phone}/</>}</p>}
    {item.observation&&<p>{item.observation}</p>}
    <p>{item.practice_tip}</p>
    {item.uncertainty&&<small>{item.uncertainty}</small>}
    <div>
     <button disabled={disabled} onClick={()=>onHear(item.word)}>{t('Hear the word')}</button>
     <button disabled={disabled} onClick={()=>onPractice(item.word)}>{t('Try this word again')}</button>
    </div>
   </article>)}
  </>}
 </section>;
}
