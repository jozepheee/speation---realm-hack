import { useLocale } from '../context/LocaleContext';
import styles from '../styles/language-selector.module.css';
export default function LanguageSelector() {
  const { locale, setLocale, t } = useLocale();
  return <label className={styles.selector}><span>{t('App language')}</span><select value={locale} onChange={event => setLocale(event.target.value)} aria-label={t('App language')} translate="no"><option value="en">English</option><option value="ml">മലയാളം</option><option value="hi">हिन्दी</option></select></label>;
}
