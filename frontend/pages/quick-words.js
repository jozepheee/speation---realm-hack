import { useLocale } from "../context/LocaleContext";
import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import LanguageSelector from '../components/LanguageSelector';
import { DEFAULTS, SYMBOLS } from '../lib/communicationPhrases';
import AACLink from '../components/AACLink';
import useAAC from '../hooks/useAAC';
import styles from '../styles/workspace.module.css';

// This legacy AAC entry follows the same optional visibility setting.
export default function QuickWords() {
  const {enabled:aacEnabled}=useAAC();
  const {
    t
  } = useLocale();
  const [language, setLanguage] = useState('en'),
    [message, setMessage] = useState(''),
    [notice, setNotice] = useState('');
  const utterance = useRef(null),
    dialog = useRef(null);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  useEffect(()=>{if(!aacEnabled)window.speechSynthesis?.cancel();},[aacEnabled]);
  function speak() {
    window.speechSynthesis?.cancel();
    setNotice('');
    if (!window.speechSynthesis) {
      setNotice('On-device voice is unavailable. You can show your message below.');
      return;
    }
    const voices = window.speechSynthesis.getVoices().filter(voice => voice.localService && voice.lang.toLowerCase().split('-')[0] === language);
    if (!voices.length) {
      setNotice('No on-device voice for this language is available. Your message is still ready to show.');
      return;
    }
    const request = new SpeechSynthesisUtterance(message);
    request.lang = voices[0].lang;
    request.voice = voices[0];
    request.onerror = () => setNotice('Voice playback was unavailable. Show your message instead.');
    utterance.current = request;
    window.speechSynthesis.speak(request);
  }
  if(!aacEnabled)return <main lang="en" translate="no" className={styles.main}><h1>AAC is switched off</h1><p>Enable AAC in settings to show communication tools. Your saved phrases are preserved.</p><Link href="/settings">Open settings</Link></main>;
  return <><Head><title>{t("Quick Words \xB7 Speation")}</title></Head><main className={styles.main} style={{
      marginTop: 35
    }}>
    <LanguageSelector /><AACLink href="/communication">{t("\u2190 AAC")}</AACLink><header className={styles.hero}><p className={styles.eyebrow}>{t("NO ACCOUNT OR CLOUD VOICE REQUIRED")}</p><h1>{t("Say what matters.")}</h1><p>{t("Choose everyday words or type a message. This board keeps your message on this page.")}</p></header>
    <label className={styles.form}>{t("Language")}<select value={language} onChange={event => {
          window.speechSynthesis?.cancel();
          setLanguage(event.target.value);
          setMessage('');
          setNotice('');
        }}><option value="en">{t("English")}</option><option value="hi">हिन्दी</option><option value="ml">മലയാളം</option></select></label>
    <div className={styles.phraseGrid}>{DEFAULTS[language].map(([symbol, text]) => <button key={symbol} onClick={() => setMessage(current => (current ? current + ' ' : '') + text)}><span aria-hidden="true">{SYMBOLS[symbol]}</span><strong lang={language}>{text}</strong></button>)}</div>
    <section className={styles.panel}><label className={styles.form}>{t("My message")}<textarea value={message} maxLength={1000} onChange={event => setMessage(event.target.value)} lang={language} /></label><div className={styles.switches}><button className={styles.linkButton} disabled={!message.trim()} onClick={() => dialog.current?.showModal()}>{t("Show my message")}</button><button className={styles.linkButton} disabled={!message.trim()} onClick={speak}>{t("Use an on-device voice")}</button><button className={styles.linkButton} onClick={() => window.speechSynthesis?.cancel()}>{t("Stop voice")}</button><button className={styles.linkButton} onClick={() => {
            window.speechSynthesis?.cancel();
            setMessage('');
          }}>{t("Clear")}</button></div>{notice && <p role="status">{t(notice)}</p>}<p>{t("Offline use becomes available after this board has been loaded and its public files cached. Personal records and messages are never included in that cache.")}</p></section>
    <dialog ref={dialog} aria-label={t("Your communication message")} style={{
        background: '#fcfcf5',
        color: '#263f36',
        border: 0,
        borderRadius: 24,
        padding: '8vw',
        maxWidth: '96vw'
      }}><p lang={language} style={{
          fontSize: 'clamp(2rem, 6vw, 5rem)',
          textAlign: 'center',
          overflowWrap: 'anywhere'
        }}>{message}</p><form method="dialog"><button autoFocus style={{
            marginTop: 40,
            padding: '15px 30px'
          }}>{t("Back to my words")}</button></form></dialog>
  </main></>;
}
