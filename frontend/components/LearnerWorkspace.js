import AACSetting from './AACSetting';
import AACLink from './AACLink';
import IntakeSummary from './IntakeSummary';
import {useRouter} from 'next/router';
import { useLocale } from "../context/LocaleContext";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import Navbar from './Navbar';
import ProtectedRoute from './ProtectedRoute';
import { portalApi } from '../lib/portalApi';
import styles from '../styles/workspace.module.css';
import CarePanel from './CarePanel';
import ClinicalWorkload from './ClinicalWorkload';
import WeeklyRoutine from './WeeklyRoutine';
import { useAuth } from '../context/AuthContext';
export const LANGUAGES = {
  en: 'English',
  hi: 'हिन्दी · Hindi',
  ml: 'മലയാളം · Malayalam'
};
const POLICY = '2026-10-14-v1';
export default function LearnerWorkspace({
  clinical = false
}) {
  const {
    t
  } = useLocale();
  const {
    isAuthenticated,
    loading: authLoading
  } = useAuth();
  const [learners, setLearners] = useState([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [role, setRole] = useState('');
  const [age, setAge] = useState(7);
  const router=useRouter();
  const learner = learners.find(item => item.id === selected);
  async function refresh(signal) {
    const [account, roster] = await Promise.all([portalApi('/workspace/me', {
      signal
    }), portalApi(clinical ? '/clinical/learners' : '/learners', {
      signal
    })]);
    setRole(account.role);
    setLearners(roster);
    setSelected(current => roster.some(item => item.id === current) ? current : roster[0]?.id || '');
  }
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    const controller = new AbortController();
    refresh(controller.signal).catch(err => {
      if (err.name !== 'AbortError') setError(err.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [clinical, authLoading, isAuthenticated]);
  async function act(action, success) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      await refresh();
      setMessage(success);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  function createLearner(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    act(async () => {
      const created=await portalApi('/learners', {
        method: 'POST',
        body: {
          display_name: fields.get('name'),
          age: Number(age),
          language: fields.get('language'),
          relationship: age < 18 ? 'guardian' : 'self',
          consent: {
            practice_allowed: true,
            cloud_processing_allowed: fields.has('cloud'),
            retain_audio_allowed: fields.has('retain'),
            policy_version: POLICY,
            authorized_to_consent: true
          }
        }
      });
      form.reset();
      setSelected(created.id);
      if(fields.has('cloud')&&fields.has('retain'))void router.push(`/maya-checkin?learner=${created.id}`);
    }, 'Profile and consent choices saved.');
  }
  function assign(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    act(() => portalApi(`/learners/${selected}/clinician`, {
      method: 'PUT',
      body: {
        clinician_email: fields.get('email'),
        active: fields.get('action') === 'grant'
      }
    }), 'Clinician access updated.');
  }
  function setConsent(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const practice = fields.has('practice');
    act(() => portalApi(`/learners/${selected}/consent`, {
      method: 'POST',
      body: {
        practice_allowed: practice,
        cloud_processing_allowed: practice && fields.has('cloud'),
        retain_audio_allowed: practice && fields.has('retain'),
        policy_version: POLICY,
        authorized_to_consent: true
      }
    }), 'Consent choices recorded. Withdrawing practice consent also withdraws processing and retention permissions.');
  }
  return <ProtectedRoute>
    <Head><title>{clinical ? t("Clinician Workspace") : t("Family & Participant Hub")} {t("\xB7 Speation")}</title></Head>
    <Navbar />
    <main className={styles.main}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>{clinical ? t("HUMAN GUIDANCE") : t("YOUR PEOPLE. THEIR PACE.")}</p>
        <h1>{clinical ? t("Care starts with understanding.") : t("A place for every voice.")}</h1>
        <p>{clinical ? t("Review your assigned learners and build an evidence-based record of their practice.") : t("Manage profiles, choose languages, and decide who can support your learning.")}</p>
      </header>
      <div className={styles.switches}><Link href="/family">{t("Family & participant hub")}</Link><Link href="/clinician">{t("Clinician workspace")}</Link><Link href="/knowledge-graph">{t("Speech knowledge graph")}</Link></div>
      <div className={styles.switches}><Link href="/companion">{t("Meet Maya")}</Link><Link href="/practice-hub">{t("Four-step practice")}</Link><Link href="/arcade">{t("Speech Arcade")}</Link><Link href="/missions">{t("My World Missions")}</Link><AACLink href="/communication">{t("AAC")}</AACLink><Link href="/speech-translator">{t("Speech translator")}</Link></div>
      <div aria-live="polite">{loading && <p>{t("Loading your workspace\u2026")}</p>}{error && <p role="alert" className={styles.error}>{t(error)}</p>}{message && <p className={styles.success}>{t(message)}</p>}</div>
      {!loading && error && <button disabled={busy} onClick={() => act(() => Promise.resolve(), 'Workspace refreshed.')}>{t("Retry workspace")}</button>}
      {!loading && clinical && role && role !== 'clinician' && <section className={styles.panel}><h2>{t("Clinician access")}</h2><p>{t("Submit your professional details to request clinician access, or check the status of your application.")}</p><Link href="/clinician-application" className={styles.linkButton}>{t("Your clinician application \u2192")}</Link></section>}
      {!loading && clinical && role === 'clinician' && <ClinicalWorkload onSelect={setSelected} />}
      {!loading && (!clinical || role === 'clinician') && <div className={styles.layout}>
        <section className={styles.panel}>
          <p className={styles.eyebrow}>{clinical ? t("ASSIGNED LEARNERS") : t("YOUR PROFILES")}</p>
          <h2>{learners.length} {learners.length === 1 ? t("learner") : t("learners")}</h2>
          {!learners.length && <p>{clinical ? t("No learners are assigned yet. A guardian or self-managed participant can grant access using your registered email.") : t("Create a profile to begin. Ages 4\u201317 use a guardian-managed profile; ages 18\u201321 manage their own profile.")}</p>}
          <div className={styles.roster}>{learners.map(item => <button key={item.id} className={`${styles.learner} ${selected === item.id ? styles.selected : ''}`} onClick={() => setSelected(item.id)}>
            <span className={styles.initial}>{item.display_name.charAt(0)}</span><span><strong>{item.display_name}</strong><small>{t("Age")} {item.age} · {t(LANGUAGES[item.language])}</small></span>
            <span className={styles.badge}>{item.consent?.practice_allowed ? t("Active") : t("Paused")}</span>
          </button>)}</div>
          {learner && <div className={styles.detail}>
            <h3>{learner.display_name}</h3><p>{learner.relationship === 'self' ? t("Self-managed") : t("Guardian-managed")} {t("profile")}</p>
            <Link className={styles.linkButton} href={`/knowledge-graph?learner=${learner.id}`}>{t("Explore practice evidence \u2192")}</Link>
            {!clinical && <><AACSetting/>
              <form key={learner.id + learner.consent?.recorded_at} onSubmit={setConsent} className={styles.form}>
                <h3>{t("Consent choices")}</h3>
                <label className={styles.check}><input name="practice" type="checkbox" defaultChecked={learner.consent?.practice_allowed} />{t("Allow practice")}</label>
                <label className={styles.check}><input name="cloud" type="checkbox" defaultChecked={learner.consent?.cloud_processing_allowed} />{t("Allow cloud speech processing")}</label>
                <label className={styles.check}><input name="retain" type="checkbox" defaultChecked={learner.consent?.retain_audio_allowed} />{t("Allow private recording retention")}</label>
                <p className={styles.hint}>{t("These choices are recorded in your consent history. Withdrawing cloud permission disables cloud features and queues enrolled synthetic voices for provider deletion. Withdrawing retention queues private recordings for deletion.")}</p>
                <button disabled={busy}>{t("Save choices")}</button>
              </form>
              <form onSubmit={assign} className={styles.form}><h3>{t("Clinician access")}</h3>
                <label>{t("Clinician email")}<input name="email" type="email" required placeholder={t("Registered clinician email")} /></label>
                <label>{t("Access")}<select name="action"><option value="grant">{t("Grant access")}</option><option value="revoke">{t("Revoke access")}</option></select></label>
                <button disabled={busy}>{t("Update access")}</button>
              </form>
            </>}
          </div>}
        </section>
        {!clinical && <section className={styles.panel}>
          <p className={styles.eyebrow}>{t("NEW BEGINNINGS")}</p><h2>{t("Create a learner profile")}</h2>
          <form onSubmit={createLearner} className={styles.form}>
            <label>{t("Display name")}<input name="name" required maxLength={80} placeholder={t("A first name or nickname")} /></label>
            <label>{t("Age")}<input name="age" type="number" min={4} max={21} value={age} onChange={event => setAge(Number(event.target.value))} required /></label>
            <label>{t("Practice language")}<select name="language">{Object.entries(LANGUAGES).map(([code, name]) => <option key={code} value={code}>{t(name)}</option>)}</select></label>
            <p>{age < 18 ? t("Create this profile only if you are authorized to act as the learner\u2019s guardian.") : t("Create this self-managed profile for yourself.")}</p>
            <label className={styles.check}><input type="checkbox" required />{t("I am authorized to consent to practice for this profile.")}</label>
            <label className={styles.check}><input name="cloud" type="checkbox" />{t("Allow cloud speech processing")}</label>
            <label className={styles.check}><input name="retain" type="checkbox" />{t("Allow private recording retention")}</label>
            <button disabled={busy}>{busy ? t("Saving\u2026") : t("Create profile")}</button>
          </form>
        </section>}
        {clinical && <section className={styles.panel}><p className={styles.eyebrow}>{t("REVIEW WITH CONTEXT")}</p><h2>{t("Every observation has a source.")}</h2>
          <p>{t("Select an assigned learner to review their speech knowledge graph. Record assessed observations and author individualized cues there.")}</p>
          <p>{t("No performance is inferred from an empty history. Independent, supported, difficult, and uncertain attempts remain distinct.")}</p>
          {learner && <Link className={styles.linkButton} href={`/knowledge-graph?learner=${learner.id}`}>{t("Review")} {learner.display_name} →</Link>}
        </section>}
      </div>}
      {learner && !clinical && <IntakeSummary key={`intake-${learner.id}`} learner={learner}/>}
      {learner && <CarePanel key={learner.id} learner={learner} clinical={clinical} />}
      {learner && <WeeklyRoutine key={`routine:${learner.id}`} learner={learner} editable={!clinical} />}
    </main>
  </ProtectedRoute>;
}
