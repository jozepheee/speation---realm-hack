import { useLocale } from "../context/LocaleContext";
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';
import RecordingStudio from '../components/RecordingStudio';
import CameraEmotionPip from '../components/CameraEmotionPip';
import useLearners from '../hooks/useLearners';
import { portalApi } from '../lib/portalApi';
import styles from '../styles/workspace.module.css';
export default function PracticeStudio() {
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
  const [goals, setGoals] = useState([]),
    [goalId, setGoalId] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [mirror, setMirror] = useState(false);
  const goal = goals.find(item => item.id === goalId);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setGoalId('');
    portalApi(`/learners/${selected}/goals`, {
      signal: controller.signal
    }).then(plan => {
      setGoals(plan);
      setGoalId(plan[0]?.id || '');
    }).catch(err => {
      if (err.name !== 'AbortError') setError(err.message);
    });
    return () => controller.abort();
  }, [selected]);
  async function reference() {
    setBusy(true);
    setError('');
    try {
      const audio = await portalApi(`/learners/${selected}/speak`, {
        method: 'POST',
        body: {
          text: goal.practice_word,
          language: goal.language
        }
      });
      await new Audio(`data:audio/mpeg;base64,${audio.audio_base64}`).play();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return <ProtectedRoute><Head><title>{t("Practice Studio \xB7 Speation")}</title></Head><Navbar /><main className={styles.main}>
    <header className={styles.hero}><p className={styles.eyebrow}>{t("GUIDANCE YOU CAN RETURN TO")}</p><h1>{t("One sound. Your own pace.")}</h1><p>{t("Follow your clinician\u2019s reviewed instructions, hear a reference, and record an attempt.")}</p></header>
    {(error || profileError) && <p className={styles.error} role="alert">{error || t(profileError)}</p>}
    <div className={styles.form}><label>{t("Learner")}<select value={selected} onChange={event => setSelected(event.target.value)}>{learners.map(item => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label><label>{t("Reviewed practice goal")}<select disabled={!goals.length} value={goalId} onChange={event => setGoalId(event.target.value)}>{!goals.length && <option value="">{t("No clinician-approved goals yet")}</option>}{goals.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div>
    {!goal && <section className={styles.panel} style={{
        marginTop: 24
      }}><h2>{t("Your practice plan starts with a reviewed goal.")}</h2><p>{t("Your assigned clinician can author sound targets and guidance. General conversation and communication tools remain available.")}</p><Link className={styles.linkButton} href="/companion">{t("Talk with Maya")}</Link></section>}
    {goal && learner && <><section className={styles.panel} style={{
          marginTop: 24
        }}><p className={styles.eyebrow}>{t(goal.phase)}</p><h2 lang={goal.language}>{goal.practice_word}</h2><p>{t("Target sound: /")}{goal.sound}/</p><p>{goal.instruction}</p><div className={styles.switches}><button className={styles.linkButton} disabled={busy} onClick={reference}>{t("Hear a reference")}</button><button className={styles.linkButton} onClick={() => setMirror(current => !current)}>{mirror ? t("Close mirror") : t("Open optional camera mirror")}</button><Link className={styles.linkButton} href="/companion">{t("Try a new conversation")}</Link></div><p>{t("The camera provides a local mirror and visible face cues. It does not measure internal tongue placement or diagnose articulation.")}</p></section>
      <div style={{
          marginTop: 24
        }}><RecordingStudio key={`${selected}:${goalId}`} learner={{
            ...learner,
            language: goal.language
          }} task="word" expectedText={goal.practice_word} /></div>
      {mirror && <CameraEmotionPip />}
    </>}
  </main></ProtectedRoute>;
}
