import AACLink from '../components/AACLink';
import {useRouter} from 'next/router';
import { useLocale } from "../context/LocaleContext";
import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';
import RecordingStudio from '../components/RecordingStudio';
import useLearners from '../hooks/useLearners';
import { portalApi } from '../lib/portalApi';
import styles from '../styles/workspace.module.css';
const STEPS = ['Understand and listen', 'Try your reviewed word', 'Guidance and another attempt', 'Use it in your world'];
const NAMES = {
  understand: 'Understand your goal',
  listen: 'Hear your reference',
  baseline: 'Your first attempt',
  teach: 'Return to reviewed guidance',
  retest: 'Try a fresh attempt',
  transfer: 'An everyday moment',
  complete: 'Your practice sequence is saved'
};
export default function PracticeHub() {
  const router=useRouter();
  const {
    t, locale
  } = useLocale();
  const {
    learners,
    learner,
    selected,
    setSelected,
    error: profileError
  } = useLearners();
  const [goals, setGoals] = useState([]),
    [goal, setGoal] = useState(''),
    [cycles, setCycles] = useState([]),
    [cycle, setCycle] = useState(null);
  const [record, setRecord] = useState(null),
    [assessment, setAssessment] = useState(null),
    [listening, setListening] = useState(''),
    [referenceUrl, setReferenceUrl] = useState('');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [support, setSupport] = useState('not_recorded'),
    [cueUsed, setCueUsed] = useState(false);
  useEffect(()=>{if(router.isReady&&learners.some(item=>item.id===router.query.learner))setSelected(router.query.learner);},[router.isReady,router.query.learner,learners]);
  useEffect(()=>{if(goals.some(item=>item.id===router.query.goal))setGoal(router.query.goal);},[goals,router.query.goal]);
  const generation = useRef(0),
    requestId = useRef(null),
    audio = useRef(null),
    assessmentRequest = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setCycle(null);
    setRecord(null);
    setAssessment(null);
    setGoals([]);
    setCycles([]);
    setError('');
    setBusy(false);
    setReferenceUrl('');
    audio.current?.pause();
    if (!selected) return;
    const controller = new AbortController();
    Promise.all([portalApi(`/learners/${selected}/goals?include_evidence=true`, {
      signal: controller.signal
    }), portalApi(`/learners/${selected}/practice-cycles`, {
      signal: controller.signal
    })]).then(([plan, history]) => {
      setGoals(plan);
      setGoal(plan[0]?.id || '');
      setCycles(history);
    }).catch(err => {
      if (err.name !== 'AbortError') setError(err.message);
    });
    return () => {
      generation.current += 1;
      controller.abort();
      audio.current?.pause();
    };
  }, [selected]);
  function load(data) {
    assessmentRequest.current += 1;
    setCycle(data);
    setRecord(null);
    setAssessment(null);
    setListening('');
    setReferenceUrl('');
    setSupport('not_recorded');
    setCueUsed(false);
    audio.current?.pause();
    requestId.current = null;
  }
  async function resume(identifier) {
    const current = generation.current;
    setBusy(true);
    setError('');
    try {
      const data = await portalApi(`/practice-cycles/${identifier}`);
      if (current === generation.current) load(data);
    } catch (err) {
      if (current === generation.current) setError(err.message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function start() {
    const current = generation.current;
    setBusy(true);
    setError('');
    try {
      const data = await portalApi(`/learners/${selected}/practice-cycles`, {
        method: 'POST',
        body: {
          goal_id: goal
        }
      });
      if (current === generation.current) load(data);
    } catch (err) {
      if (current === generation.current) setError(err.message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function advance(savedRecord = record) {
    if(savedRecord?.nativeEvent)savedRecord=record;
    const current = generation.current;
    setBusy(true);
    setError('');
    requestId.current ||= crypto.randomUUID();
    try {
      const data = await portalApi(`/practice-cycles/${cycle.id}/advance`, {
        method: 'POST',
        body: {
          request_id: requestId.current,
          expected_stage: cycle.stage,
          ...(savedRecord ? {
            recording_id: savedRecord.id
          } : {}),
          acknowledges_guidance: true,
          support_used: support,
          reviewed_cue_used: cueUsed,
          ...(cycle.stage === 1 ? {
            listening_source: listening
          } : {})
        }
      });
      if (current === generation.current) load(data);
    } catch (err) {
      if (current === generation.current) setError(err.message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function reference() {
    const current = generation.current;
    setBusy(true);
    setError('');
    try {
      const speech = await portalApi(`/practice-cycles/${cycle.id}/reference`, {
        method: 'POST'
      });
      if (current !== generation.current) return;
      setReferenceUrl(`data:audio/mpeg;base64,${speech.audio_base64}`);
      setListening('');
    } catch (err) {
      if (current === generation.current) setError(err.message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function recorded(data) {
    const current = generation.current,
      assessmentId = ++assessmentRequest.current;
    setRecord(data);
    requestId.current = null;
    try {
      const result = await portalApi(`/recordings/${data.id}/assessment`);
      if (current === generation.current && assessmentId === assessmentRequest.current) setAssessment(result);
      if (current === generation.current && assessmentId === assessmentRequest.current) await advance(data);
    } catch (err) {
      if (current === generation.current && assessmentId === assessmentRequest.current) setError(err.message);
    }
  }
  const step = cycle ? cycle.stage <= 1 ? 0 : cycle.stage === 2 ? 1 : cycle.stage <= 4 ? 2 : 3 : 0;
  return <ProtectedRoute><Head><title>{t("Your Practice Path \xB7 Speation")}</title></Head><Navbar /><main className={styles.main}>
    <header className={styles.hero}><p className={styles.eyebrow}>{t("FOUR STEPS. YOUR OWN PATH.")}</p><h1>{t("Choose how to practice today.")}</h1><p>{t("Watch a demonstration, describe a picture, repeat a word or talk with Maya.")}</p></header>
    {!cycle && <nav className={styles.practiceAreas} aria-label={t("Four speech practice areas")}>
      <Link href="/guided-practice?activity=mouth"><strong>{t("1. Mouth & sound practice")}</strong><span>{t("Watch mouth and tongue demonstrations →")}</span></Link>
      <Link href="/guided-practice?activity=picture"><strong>{t("2. Understand & express")}</strong><span>{t("Generate a picture and describe what you see →")}</span></Link>
      <Link href="/guided-practice?activity=word"><strong>{t("3. Words & listening")}</strong><span>{t("Hear a word and record your own attempt →")}</span></Link>
      <Link href="/companion?mode=daily_moment"><strong>{t("4. Talk with Maya")}</strong><span>{t("Use your words in a moment from your day \u2192")}</span></Link>
    </nav>}
    {learner?.age>=16&&<section className={styles.panel}><h2>{t('Prepare for your next presentation or interview')}</h2><p>{t('Bring your slides or report, rehearse relevant questions, and practise your own vocabulary.')}</p><Link href="/speaking-lab">{t('Open Study & career')}</Link></section>}
    <div className={styles.switches}><Link href="/speaking-lab">{t("Speaking studio")}</Link><Link href="/guided-practice?activity=mouth">{t("Optional camera mirror")}</Link><Link href="/speech-translator">{t("Speech translator")}</Link><AACLink href="/communication">{t("AAC")}</AACLink><Link href="/care-progress">{t("Recorded progress")}</Link></div>
    {(error || profileError) && <p className={styles.error} role="alert">{error || t(profileError)}</p>}
    <label className={styles.form}>{t("Learner")}<select disabled={!learners.length} value={selected} onChange={event => setSelected(event.target.value)}>{!learners.length && <option value="">{t("Choose a profile in Family Hub")}</option>}{learners.map(item => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label>
    {!cycle ? <details className={styles.careSequence}><summary>{t("Clinician-guided practice sequence")}</summary><section className={styles.panel} style={{
        marginTop: 24
      }}><h2>{t("Choose an approved goal")}</h2><label className={styles.form}>{t("Reviewed goal")}<select disabled={!goals.length} value={goal} onChange={event => setGoal(event.target.value)}>{!goals.length && <option value="">{t("No clinician-approved goals yet")}</option>}{goals.map(item => <option key={item.id} value={item.id}>{item.title} · {item.language}</option>)}</select></label><button className={styles.linkButton} disabled={busy || !goal || !learner?.consent?.practice_allowed} onClick={start}>{t("Begin a real practice sequence")}</button>{!goals.length && <p>{t("Your assigned clinician must author a goal first. General conversation and communication remain available.")}</p>}
      {goal && <details className={styles.detail}><summary>{t("Why this practice choice is available")}</summary><p>{t("This goal is in your clinician\u2019s plan. These are recent reviewed attempts for the same sound and language.")}</p>
        {(goals.find(item => item.id === goal)?.review_evidence || []).map(item => <article key={item.review_id}><p>{t(item.outcome)} · {t(item.context)} · {new Date(item.created_at).toLocaleDateString(locale)}</p><small>{t("Human review:")} {item.review_id}</small></article>)}
        {!goals.find(item => item.id === goal)?.review_evidence?.length && <p>{t("No recent human reviews were returned for this target. The clinician-authored goal remains available.")}</p>}
        {goals.find(item => item.id === goal)?.evidence_scope_limited && <p>{t("Older evidence falls outside this recent-history view.")}</p>}
      </details>}
      {!!cycles.length && <><h3>{t("Saved sequences")}</h3><div className={styles.roster}>{cycles.map(item => <button key={item.id} disabled={busy} className={styles.learner} onClick={() => resume(item.id)}><strong>{item.goal.title}</strong><span>{item.completed ? t("Participation sequence complete") : t(NAMES[item.stage_name])}</span></button>)}</div></>}
    </section></details> : <>
      <ol className={styles.switches} aria-label={t("Four practice steps")}>{STEPS.map((name, index) => <li key={name} aria-current={step === index ? 'step' : undefined} style={{
            padding: 12,
            borderRadius: 12,
            background: step === index ? '#dfeedd' : '#f2f5ef',
            listStyle: 'none'
          }}>{index + 1}. {t(name)}</li>)}</ol>
      <section className={styles.panel}><p className={styles.eyebrow}>{cycle.goal.language} {t("\xB7 CLINICIAN-AUTHORED GOAL")}</p><h2>{t(NAMES[cycle.stage_name])}</h2><p lang={cycle.goal.language}><strong>{cycle.goal.word}</strong> {t("\xB7 target /")}{cycle.goal.sound}/</p><p>{cycle.goal.instruction}</p>
        {cycle.stage === 1 && <><button className={styles.linkButton} onClick={reference} disabled={busy || !learner.consent?.cloud_processing_allowed}>{t("Request the actual spoken reference")}</button>{referenceUrl && <audio ref={audio} src={referenceUrl} controls style={{
              width: '100%',
              marginTop: 16
            }} />}<label className={styles.form}>{t("How was the reference heard?")}<select value={listening} onChange={event => {
                setListening(event.target.value);
                requestId.current = null;
              }}><option value="">{t("Choose after hearing it")}</option>{referenceUrl && <option value="provider_audio">{t("The synthesized reference above")}</option>}<option value="clinician_live">{t("A clinician demonstrated it live")}</option></select></label></>}
        {cycle.stage === 5 && <p>{t("Use the reviewed word in a sentence, story or moment from your day. Your recording will be reviewed separately from the word task.")}</p>}
        {[2, 4, 5].includes(cycle.stage) && <RecordingStudio key={`${cycle.id}:${cycle.stage}`} learner={{
            ...learner,
            language: cycle.goal.language
          }} task={cycle.stage === 5 ? 'sentence' : 'word'} expectedText={cycle.goal.word} onRecorded={recorded} />}
        {[2, 4, 5].includes(cycle.stage) && <div className={styles.form}><label>{t("What support was used during this attempt?")}<select value={support} onChange={event => {
                setSupport(event.target.value);
                requestId.current = null;
              }}><option value="not_recorded">{t("Not recorded / unsure")}</option><option value="none_reported">{t("No help reported")}</option><option value="verbal">{t("Verbal reminder")}</option><option value="visual">{t("Visual reminder")}</option><option value="modelled">{t("Someone demonstrated it")}</option><option value="mixed">{t("More than one kind of support")}</option></select></label><label className={styles.check}><input type="checkbox" checked={cueUsed} onChange={event => {
                setCueUsed(event.target.checked);
                requestId.current = null;
              }} />{t("We used the clinician\u2019s reviewed instruction for this attempt")}</label><p>{t("This is a participant or supporter report. Your clinician assesses independence separately.")}</p></div>}
        {assessment && <p>{assessment.state === 'awaiting_clinician_review' ? t("This attempt awaits human review. Recognition is not a pronunciation score.") : t("Human-reviewed segments are available in recorded progress.")}</p>}
        {!cycle.completed ? <button className={styles.linkButton} style={{
            marginTop: 20
          }} hidden={[2,4,5].includes(cycle.stage)&&!error} onClick={()=>advance()} disabled={busy || [2, 4, 5].includes(cycle.stage) && !record || cycle.stage === 1 && !listening}>{[2, 4, 5].includes(cycle.stage) ? t("Retry") : cycle.stage === 1 ? t("I heard the reference \xB7 continue") : t("I reviewed this guidance \xB7 continue")}</button> : <><p>{t("Your participation sequence is complete. This does not establish mastery or clinical improvement. Your clinician can review the linked recordings.")}</p><Link href="/care-progress">{t("Review the evidence \u2192")}</Link></>}
        <button className={styles.linkButton} disabled={busy} style={{
            marginLeft: 12
          }} onClick={() => {
            generation.current += 1;
            const current = generation.current;
            audio.current?.pause();
            load(null);
            portalApi(`/learners/${selected}/practice-cycles`).then(data => {
              if (current === generation.current) setCycles(data);
            }).catch(err => {
              if (current === generation.current) setError(err.message);
            });
          }}>{t("Save and return to my sequences")}</button>
      </section>
    </>}
  </main></ProtectedRoute>;
}
