import { useLocale } from "../context/LocaleContext";
import { useEffect, useState } from 'react';
import { DEFAULTS, SYMBOLS } from '../lib/communicationPhrases';
import { portalApi } from '../lib/portalApi';
import styles from '../styles/phrase-composer.module.css';
export default function PhraseComposer({
  learnerId,
  language,
  value,
  onChange,
  disabled = false,
  maxLength = 2000
}) {
  const {
    t
  } = useLocale();
  const [open, setOpen] = useState(false),
    [personal, setPersonal] = useState(null),
    [notice, setNotice] = useState('');
  useEffect(() => {
    if (!open || !learnerId) return;
    const controller = new AbortController();
    setNotice('Loading your personal phrases…');
    portalApi(`/learners/${learnerId}/phrases`, {
      signal: controller.signal
    }).then(items => {
      if (controller.signal.aborted) return;
      setPersonal({
        learnerId,
        language,
        items: items.filter(item => item.language === language)
      });
      setNotice('');
    }).catch(error => {
      if (!controller.signal.aborted && error.name !== 'AbortError') setNotice('Personal phrases are unavailable. Everyday phrases still work.');
    });
    return () => controller.abort();
  }, [open, learnerId, language]);
  const phrases = [...(DEFAULTS[language] || DEFAULTS.en).map(([symbol, text]) => ({
    symbol,
    text
  })), ...(personal?.learnerId === learnerId && personal?.language === language ? personal.items : [])];
  return <details className={styles.composer} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t("Use communication phrases")}</summary>
    {open && <><p>{t("Add phrases to your message, then send when you are ready.")}</p>
      {notice && <p role="status">{t(notice)}</p>}
      <div className={styles.phrases}>{phrases.map((item, index) => {
          const next = value ? `${value} ${item.text}` : item.text;
          return <button type="button" key={item.id || index} disabled={disabled || next.length > maxLength} onClick={() => onChange(next)} lang={language}><span aria-hidden="true">{SYMBOLS[item.symbol] || SYMBOLS.help}</span>{item.text}</button>;
        })}</div>
    </>}
  </details>;
}
