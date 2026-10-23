import {useLocale} from '../context/LocaleContext';
import styles from '../styles/discussion-meeting.module.css';
export default function RehearsalSupportBar({support,onManual,onPause,onRepeat,onSlow,onOutline,disabled}){
 const {t}=useLocale();
 return <div role="group" aria-label={t('My speaking support')} className={styles.supportBar}>
  <button disabled={disabled} onClick={onPause}>{t('Give me a moment')}</button>
  <button disabled={disabled} onClick={onRepeat}>{t('Repeat that')}</button>
  <button disabled={disabled} onClick={onSlow}>{t('Speak more slowly')}</button>
  <button onClick={()=>onManual(true)}>{t('Let me finish')}</button>
  <button disabled={disabled} onClick={onOutline}>{t('Help me organise my answer')}</button>
  <label><input type="checkbox" checked={support.manual_finish} onChange={e=>onManual(e.target.checked)}/>{t('I choose when to send')}</label>
 </div>;
}
