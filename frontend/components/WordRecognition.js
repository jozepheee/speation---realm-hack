import {useLocale} from '../context/LocaleContext';
import {wordRecognition} from '../lib/wordRecognition';
export default function WordRecognition({expected,heard,language}) {
 const {t}=useLocale();
 if(!expected||!heard)return null;
 const status=wordRecognition(expected,heard);
 if(status==='unavailable')return <p lang={language}>{heard}</p>;
 return <div><h3>{t(status==='matches_target'?'Word recognized':'Different word heard')}</h3><p lang={language}><strong>{t('Practice word')}:</strong> {expected}<br/><strong>{t('Recognized answer')}:</strong> {heard}</p>{status==='different_word'&&<p>{t('The recognized answer did not match. Hear the target word and try again.')}</p>}<small>{t('Word recognition and pronunciation are separate checks. The sound feedback is below.')}</small></div>;
}
