import { useLocale } from "../context/LocaleContext";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';
import useLearners from '../hooks/useLearners';
import useAAC from '../hooks/useAAC';
import { portalApi } from '../lib/portalApi';
import styles from '../styles/workspace.module.css';
import { DEFAULTS, SYMBOLS } from '../lib/communicationPhrases';
export default function Communication() {
  const {enabled:aacEnabled}=useAAC();
  const {
    t
  } = useLocale();
  const {
    learners,
    learner,
    selected,
    setSelected,
    error: profileError
  } = useLearners();
  const [phrases, setPhrases] = useState([]),
    [message, setMessage] = useState(''),
    [voices, setVoices] = useState([]),
    [voice, setVoice] = useState('');
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [capabilities,setCapabilities]=useState(null);
  const [editing, setEditing] = useState(null);
  const [language, setLanguage] = useState('en');
  const phraseForm = useRef(null);
  const audio = useRef(null),
    generation = useRef(0);
  useEffect(() => {
    if (!selected||!aacEnabled) return;
    const controller = new AbortController();
    setCapabilities(null);portalApi(`/learners/${selected}/voice-capabilities`,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setCapabilities(value);}).catch(err=>{if(!controller.signal.aborted)setCapabilities({enrollment_available:false,reason:err.message});});
    setMessage('');
    setVoice('');
    generation.current += 1;
    audio.current?.pause();
    setBusy(false);
    setPhrases([]);setCapabilities(null);
    setVoices([]);
    setEditing(null);
    phraseForm.current?.reset();
    setLanguage(learner?.language || 'en');
    Promise.all([portalApi(`/learners/${selected}/phrases`, {
      signal: controller.signal
    }), portalApi(`/learners/${selected}/voices`, {
      signal: controller.signal
    })]).then(([personal, enrolled]) => {
      setPhrases(personal);
      setVoices(enrolled);
    }).catch(err => {
      if (err.name !== 'AbortError') setError(err.message);
    });
    return () => {
      generation.current += 1;
      controller.abort();
      audio.current?.pause();
    };
  }, [selected,aacEnabled]);
  async function speak() {
    const current = generation.current;
    audio.current?.pause();
    setError('');
    setBusy(true);
    try {
      const speech = await portalApi(`/learners/${selected}/speak`, {
        method: 'POST',
        body: {
          text: message,
          language,
          ...(voice ? {
            voice_id: voice
          } : {})
        }
      });
      if (current !== generation.current) return;
      audio.current = new Audio(`data:audio/mpeg;base64,${speech.audio_base64}`);
      await audio.current.play();
    } catch (err) {
      if (current === generation.current) setError(err.message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function savePhrase(event) {
    event.preventDefault();
    const form = event.currentTarget,
      fields = new FormData(form),
      current = generation.current;
    setError('');
    setBusy(true);
    try {
      await portalApi(editing ? `/phrases/${editing}` : `/learners/${selected}/phrases`, {
        method: editing ? 'PATCH' : 'POST',
        body: {
          text: fields.get('text'),
          symbol: fields.get('symbol'),
          language
        }
      });
      const updated = await portalApi(`/learners/${selected}/phrases`);
      if (current === generation.current) {
        setPhrases(updated);
        form.reset();
        setEditing(null);
        setNotice('Personal phrase saved.');
      }
    } catch (err) {
      if (current === generation.current) setError(err.message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function removePhrase(id) {
    const current = generation.current;
    setBusy(true);
    setError('');
    try {
      await portalApi(`/phrases/${id}`, {
        method: 'DELETE'
      });
      if (current === generation.current) {
        setPhrases(items => items.filter(item => item.id !== id));
        if (editing === id) {
          setEditing(null);
          phraseForm.current?.reset();
        }
      }
    } catch (err) {
      if (current === generation.current) setError(err.message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function enroll(event) {
    event.preventDefault();
    const current = generation.current,
      fields = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    const data = new FormData();
    data.append('reference', fields.get('reference'));
    data.append('label', fields.get('label'));
    data.append('authorized_reference', String(fields.get('authorized_reference')==='on'));
    data.append('reference_speaker_is_adult',String(fields.get('reference_speaker_is_adult')==='on'));
    try {
      const enrolled=await portalApi(`/learners/${selected}/voices`, {
        method: 'POST',
        body: data
      });
      const updated = await portalApi(`/learners/${selected}/voices`);
      if (current === generation.current) {
        setVoices(updated);
        setVoice(enrolled.id);
        if(enrolled.preview?.audio_base64){audio.current?.pause();audio.current=new Audio(`data:audio/mpeg;base64,${enrolled.preview.audio_base64}`);void audio.current.play().catch(()=>{});}
        setNotice('Synthetic voice enrolled with the configured provider.');
      }
    } catch (err) {
      if (current === generation.current) setError(err.message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  if(!aacEnabled)return <ProtectedRoute><Head><title>{t("AAC · Speation")}</title></Head><Navbar/><main lang="en" translate="no" className={styles.main}><h1>AAC is switched off</h1><p>Enable AAC in settings to show communication symbols, personal phrases and speech output. Your saved phrases are preserved.</p><Link href="/settings">Open settings</Link></main></ProtectedRoute>;
  return <ProtectedRoute><Head><title>{t("AAC · Speation")}</title></Head><Navbar /><main className={styles.main}>
    <header className={styles.hero}><p className={styles.eyebrow}>{t("COMMUNICATE YOUR WAY")}</p><h1>{t("AAC")}</h1><p>{t("Choose a phrase, combine your words, or type a message. Speech practice is never a requirement for communication.")}</p></header>
    <p><Link href="/quick-words">{t("Open Quick Words \xB7 no account or cloud voice required \u2192")}</Link></p>
    {(error || profileError) && <p role="alert" className={styles.error}>{error || t(profileError)}</p>}{notice && <p className={styles.success}>{t(notice)}</p>}
    <div className={styles.form}><label>{t("Learner")}<select value={selected} onChange={event => setSelected(event.target.value)}>{learners.map(item => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label></div>
    {learner && <><label className={styles.form}>{t("Communication language")}<select value={language} disabled={busy} onChange={event => {
            generation.current += 1;
            audio.current?.pause();
            setLanguage(event.target.value);
            setMessage('');
            setEditing(null);
            phraseForm.current?.reset();
          }}>{[['en', 'English'], ['hi', 'हिन्दी · Hindi'], ['ml', 'മലയാളം · Malayalam']].map(([code, name]) => <option value={code} key={code}>{name}</option>)}</select></label><div className={styles.phraseGrid}>{[...DEFAULTS[language].map(([symbol, text]) => ({
            symbol,
            text
          })), ...phrases.filter(item => item.language === language)].map((item, index) => <button key={item.id || index} onClick={() => setMessage(current => current ? `${current} ${item.text}` : item.text)}><span aria-hidden="true">{SYMBOLS[item.symbol]}</span><strong lang={language}>{item.text}</strong></button>)}</div>
      <section className={styles.panel}><form className={styles.form} onSubmit={event => {
            event.preventDefault();
            speak();
          }}><label>{t("Confirm your message")}<textarea value={message} onChange={event => setMessage(event.target.value)} maxLength={1000} lang={language} /></label>
        <label>{t("Voice")}<select value={voice} onChange={event => setVoice(event.target.value)}><option value="">{t("Companion voice")}</option>{voices.map(item => <option key={item.id} value={item.id}>{item.label} {t("\xB7 synthetic")}</option>)}</select></label>
        <div className={styles.switches}><button disabled={busy || !message.trim()}>{t("Speak this message")}</button><button type="button" onClick={() => audio.current?.pause()}>{t("Stop voice")}</button><button type="button" onClick={() => {
                audio.current?.pause();
                setMessage('');
              }}>{t("Clear message")}</button></div></form>
        <p>{t("The message remains editable. Cloud voice playback requires its own permission; the communication board works without it.")}</p>
      </section><div className={styles.layout} style={{
          marginTop: 24
        }}>
        <section className={styles.panel}><h2>{t("Words that matter to you")}</h2><form ref={phraseForm} className={styles.form} onSubmit={savePhrase}><label>{t("Your phrase")}<input name="text" required maxLength={300} /></label><label>{t("Symbol")}<select name="symbol">{Object.keys(SYMBOLS).map(item => <option key={item} value={item}>{item}</option>)}</select></label><button disabled={busy}>{editing ? t("Save phrase changes") : t("Save personal phrase")}</button>{editing && <button type="button" onClick={() => {
                setEditing(null);
                phraseForm.current.reset();
              }}>{t("Cancel edit")}</button>}</form>
          {phrases.filter(item => item.language === language).map(item => <article className={styles.detail} key={item.id}><p lang={item.language}>{item.text}</p><div className={styles.switches}><button disabled={busy} onClick={() => {
                  setEditing(item.id);
                  phraseForm.current.elements.text.value = item.text;
                  phraseForm.current.elements.symbol.value = item.symbol;
                  phraseForm.current.elements.text.focus();
                }}>{t("Edit phrase")}</button><button disabled={busy} onClick={() => removePhrase(item.id)}>{t("Remove phrase")}</button></div></article>)}
        </section>
        <section className={styles.panel}><h2>{t("Personal voice")}</h2><p>{t("Enroll an authorized reference to create a synthetic voice resemblance. This does not restore or predict an original healthy voice.")}</p><p role="status">{capabilities?.reason?t(capabilities.reason):!capabilities?t("Checking voice enrollment access…"):null}</p><p>{capabilities?.provider==='openrouter_fish'?t("Your reference is encrypted on this server. Fish via OpenRouter receives it each time you request speech with this voice."):null}</p><form className={styles.form} onSubmit={enroll}><label>{t("Voice label")}<input name="label" required maxLength={80} /></label><label>{t("Authorized reference, 10\u201360 seconds")}<input name="reference" type="file" accept="audio/*" required /></label><label className={styles.check}><input name="authorized_reference" type="checkbox" required />{t("I have permission to use this voice reference and send it to the speech provider.")}</label><label className={styles.check}><input name="reference_speaker_is_adult" type="checkbox" required/>{t("The speaker in this recording is an adult aged 18 or older.")}</label><button disabled={busy || !capabilities?.enrollment_available || !learner.consent?.cloud_processing_allowed}>{t("Enroll synthetic voice")}</button></form>
          {voices.map(item => <div key={item.id} className={styles.detail}><strong>{item.label}</strong><button className={styles.linkButton} style={{
                marginLeft: 12
              }} onClick={async () => {
                try {
                  await portalApi(`/voices/${item.id}`, {
                    method: 'DELETE'
                  });
                  setVoices(current => current.filter(row => row.id !== item.id));
                  if (voice === item.id) setVoice('');
                  setNotice('Voice removed from your board. Provider deletion is queued and retried automatically.');
                } catch (err) {
                  setError(err.message);
                }
              }}>{t("Delete voice")}</button></div>)}
        </section>
      </div></>}
  </main></ProtectedRoute>;
}
