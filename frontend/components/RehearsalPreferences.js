import {useLocale} from '../context/LocaleContext';
import styles from '../styles/student-studio.module.css';

export const DEFAULT_REHEARSAL_SUPPORT={focus:'clear_explanation',target_word:'',pause_seconds:6,manual_finish:true,repeat_questions:false,outline_prompts:false,discussion_mode:'supportive'};

export default function RehearsalPreferences({value,onChange,scenario,disabled}){
 const {t}=useLocale(),set=(key,next)=>onChange({...value,[key]:next});
 return <fieldset disabled={disabled} className={styles.lobbyDocument}><legend>{t('Make this practice work for me')}</legend>
  <label>{t('My communication focus')}<select value={value.focus} onChange={e=>set('focus',e.target.value)}>
   {[['clear_explanation','Explain my ideas clearly'],['comfortable_pacing','Find a comfortable pace'],['target_word','Use a particular word or sound'],['responding','Respond to questions and other people']].map(([id,label])=><option value={id} key={id}>{t(label)}</option>)}
  </select></label>
  {value.focus==='target_word'&&<label>{t('Word I want to practise')}<input required value={value.target_word} maxLength={100} onChange={e=>set('target_word',e.target.value)}/></label>}
  <label className={styles.check}><input type="checkbox" checked={value.manual_finish} onChange={e=>set('manual_finish',e.target.checked)}/>{t('Let me choose when my answer is finished')}</label>
  <label>{t('Time between words before automatic submission')}<select value={value.pause_seconds} onChange={e=>set('pause_seconds',Number(e.target.value))}>{[4,6,8].map(n=><option key={n} value={n}>{n} {t('seconds')}</option>)}</select></label>
  <label className={styles.check}><input type="checkbox" checked={value.repeat_questions} onChange={e=>set('repeat_questions',e.target.checked)}/>{t('Repeat questions once before I answer')}</label>
  <label className={styles.check}><input type="checkbox" checked={value.outline_prompts} onChange={e=>set('outline_prompts',e.target.checked)}/>{t('Offer a short answer outline when I need support')}</label>
  {scenario==='discussion'&&<label>{t('Discussion style')}<select value={value.discussion_mode} onChange={e=>set('discussion_mode',e.target.value)}><option value="supportive">{t('Supportive · one candidate responds')}</option><option value="challenge">{t('Challenge · two perspectives')}</option></select></label>}
  <small>{t('Answers can last almost three minutes. Comfortable pauses are welcome. Assigned speech goals also guide your feedback.')}</small>
 </fieldset>;
}
