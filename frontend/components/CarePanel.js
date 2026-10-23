import { useLocale } from "../context/LocaleContext";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import PatientPerformance from './PatientPerformance';
import ClinicalTasks from './ClinicalTasks';
import ClinicalDemonstrations from './ClinicalDemonstrations';
import GuidedPracticeReview from './GuidedPracticeReview';
import EvidencePlayer from './EvidencePlayer';
import ReviewedActivityEditor from './ReviewedActivityEditor';
import AudioProposalPanel from './AudioProposalPanel';
import CareReportDialog from './CareReportDialog';
import AICareReport from './AICareReport';
import { portalApi, privateAudio } from '../lib/portalApi';
import { LANGUAGES } from './LearnerWorkspace';
import styles from '../styles/workspace.module.css';
export default function CarePanel({
  learner,
  clinical = false,
  view = "all"
}) {
  const {
    t,
    locale
  } = useLocale();
  const [summary, setSummary] = useState(null),
    [records, setRecords] = useState([]),
    [goals, setGoals] = useState([]);
  const [record, setRecord] = useState(null),
    [reviews, setReviews] = useState([]),
    [audio, setAudio] = useState('');
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const [revision, setRevision] = useState(null);
  const [proposalId, setProposalId] = useState(null);
  const [printReport, setPrintReport] = useState(null);
  const selection = useRef(0),
    rangeForm = useRef(null),audioRequest=useRef(null);
  useEffect(() => () => {
    selection.current += 1;
    audioRequest.current?.abort();
  }, []);
  async function refresh(signal) {
    const [overview, recordings, plan] = await Promise.all([portalApi(`/learners/${learner.id}/care-summary`, {
      signal
    }), portalApi(`/learners/${learner.id}/recordings`, {
      signal
    }), portalApi(`/learners/${learner.id}/goals`, {
      signal
    })]);
    setSummary(overview);
    setRecords(recordings);
    setGoals(plan);
  }
  useEffect(() => {
    const controller = new AbortController();
    setRecord(null);
    setSummary(null); setRecords([]); setGoals([]);
    setError('');
    refresh(controller.signal).catch(err => {
      if (err.name !== 'AbortError') setError(err.message);
    });
    return () => controller.abort();
  }, [learner.id]);
  useEffect(() => {
    if (!record) return;
    const controller = new AbortController();
    setReviews([]);
    portalApi(`/recordings/${record.id}/reviews`, {
      signal: controller.signal
    }).then(setReviews).catch(err => {
      if (err.name !== 'AbortError') setError(err.message);
    });
    return () => controller.abort();
  }, [record?.id]);
  useEffect(() => () => {
    if (audio) URL.revokeObjectURL(audio);
  }, [audio]);
  async function playRecording(item) {
    const current = ++selection.current;
    audioRequest.current?.abort();
    const controller=new AbortController();audioRequest.current=controller;
    setError('');
    setAudio('');
    setRecord(item);
    setRevision(null);
    setProposalId(null);
    if (!item.audio_retained) return;
    try {
      const blob = await privateAudio(`/recordings/${item.id}/audio`,{signal:controller.signal});
      if (current === selection.current) setAudio(URL.createObjectURL(blob));
    } catch (err) {
      if (current === selection.current) setError(err.message);
    }
  }
  async function review(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const fields = new FormData(event.currentTarget);
    try {
      await portalApi(`/recordings/${record.id}/reviews`, {
        method: 'POST',
        body: {
          sound: fields.get('sound'),
          outcome: fields.get('outcome'),
          context: fields.get('context'),
          start_seconds: Number(fields.get('start')),
          end_seconds: Number(fields.get('end')),
          intended_text: fields.get('intent'),
          notes: fields.get('notes'),
          expected_phone: fields.get('expected_phone') || null,
          produced_phone: fields.get('produced_phone') || null,
          error_category: fields.get('error_category') || null,
          supersedes_review_id: revision,
          proposal_id: proposalId
        }
      });
      setNotice(revision ? 'Revised review saved. The earlier version remains in the audit history.' : 'Your review is saved.');
      setRevision(null);
      setProposalId(null);
      rangeForm.current?.reset();
      setReviews(await portalApi(`/recordings/${record.id}/reviews`));
      await refresh();
      try {
        await portalApi(`/knowledge-graph/learners/${learner.id}/sync`, {
          method: 'POST'
        });
      } catch (err) {
        setNotice(`Your review is saved. Graph synchronization can be retried: ${err.message}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function addGoal(event) {
    event.preventDefault();
    const form = event.currentTarget,
      fields = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await portalApi(`/learners/${learner.id}/goals`, {
        method: 'POST',
        body: {
          title: fields.get('title'),
          sound: fields.get('sound'),
          language: fields.get('language'),
          practice_word: fields.get('word'),
          instruction: fields.get('instruction'),
          phase: fields.get('phase')
        }
      });
      form.reset();
      await refresh();
      setNotice('Reviewed practice goal saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function downloadReport() {
    setBusy(true);
    setError('');
    try {
      const report = await portalApi(`/learners/${learner.id}/care-report`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {
        type: 'application/json'
      }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `care-report-${learner.id}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Care report downloaded. It contains private learner information; audio files are excluded.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  function revise(item) {
    const form = rangeForm.current;
    if (!form) return;
    for (const [name, value] of Object.entries({
      sound: item.sound,
      outcome: item.outcome,
      context: item.context,
      start: item.start_seconds,
      end: item.end_seconds,
      intent: item.intended_text,
      notes: item.notes,
      expected_phone: item.expected_phone,
      produced_phone: item.produced_phone,
      error_category: item.error_category
    })) {
      form.elements[name].value = value ?? '';
    }
    setRevision(item.id);
    setProposalId(null);
    form.elements.notes.focus();
  }
  function inspectProposal(row, concern) {
    setRevision(null);
    setProposalId(row.id);
    const form = rangeForm.current;
    if (!form) return;
    form.reset();
    form.elements.sound.value = row.request.expected_phone;
    form.elements.expected_phone.value = row.request.expected_phone;
    form.elements.start.value = row.request.start_seconds;
    form.elements.end.value = row.request.end_seconds;
    form.elements.intent.value = row.request.expected_text;
    form.elements.outcome.value = 'uncertain';
    form.elements.error_category.value = 'uncertain';
    form.elements.notes.value = '';
    form.elements.notes.focus();
    setNotice('Replay the audio and write your own assessment. The AI proposal has not been accepted.');
  }
  return <div style={{
    marginTop: 24
  }}>
    {["all","overview"].includes(view)&&<AICareReport learner={learner} clinical={clinical}/>}
    <div aria-live="polite">{error && <p className={styles.error} role="alert">{t(error)}</p>}{notice && <p className={styles.success}>{t(notice)}</p>}</div>
    {!summary && !error && <p role="status">{t("Loading patient records…")}</p>}
    {summary && ["all", "overview"].includes(view) && <section className={styles.panel}>
      <p className={styles.eyebrow}>{t("RECORDED ACTIVITY \xB7 HUMAN-REVIEWED OUTCOMES")}</p><h2>{t("Practice, with context")}</h2>
      {clinical && <PatientPerformance summary={summary} records={records} goals={goals} />}
      <p>{summary.recordings} {t("recordings \xB7")} {summary.pending_reviews} {t("awaiting review")}</p>
      <button type="button" disabled={busy} onClick={downloadReport}>{t("Download this learner\u2019s care report")}</button>
      <button type="button" disabled={busy} onClick={async () => {
        setBusy(true);
        setError('');
        try {
          setPrintReport(await portalApi(`/learners/${learner.id}/care-report`));
        } catch (err) {
          setError(err.message);
        } finally {
          setBusy(false);
        }
      }}>{t("Open readable report")}</button>
      {!Object.values(summary.reviewed_outcomes).some(Boolean) ? <p>{t("No reviewed outcomes yet. Progress will appear as attempts are assessed.")}</p> : <div className={styles.outcomes}>{Object.entries(summary.reviewed_outcomes).map(([name, count]) => <div key={t(name)}><strong>{count}</strong><span>{t(name)}</span><div style={{
            height: 5,
            background: '#dae9d9',
            width: `${count / Math.max(1, ...Object.values(summary.reviewed_outcomes)) * 100}%`,
            marginTop: 10
          }} /></div>)}</div>}
      {summary.truncated && <p>{t("This summary covers the most recent 1,000 records.")}</p>}
      {clinical && !!summary.review_differences?.length && <details className={styles.detail}><summary>{summary.review_differences.length} {t("segments with different current review outcomes")}</summary><p>{t("These reviews concern the same marked segment. Replay it and consider the intended words and review context before revising an assessment.")}</p>
        {summary.review_differences.map((item, index) => <article key={index}><h3>/{item.sound}/ · {t(item.context)} · {item.start_seconds}–{item.end_seconds}{t("s")}</h3>
          {item.reviews.map(row => <p key={row.review_id}>{t(row.outcome)} {t("\xB7 review")} {row.review_id} · {new Date(row.created_at).toLocaleString(locale)}</p>)}
          <button type="button" disabled={busy} onClick={async () => {
            try {
              await playRecording(await portalApi(`/recordings/${item.recording_id}`));
            } catch (err) {
              setError(err.message);
            }
          }}>{t("Inspect this recording")}</button>
        </article>)}
      </details>}
      {!!summary.targets?.length && <><h3>{t("Reviewed targets in context")}</h3><div style={{
          overflowX: 'auto'
        }}><table style={{
            width: '100%',
            textAlign: 'left',
            borderSpacing: 12
          }}><thead><tr><th>{t("Target")}</th><th>{t("Context")}</th><th>{t("Independent")}</th><th>{t("Supported")}</th><th>{t("Difficulty")}</th><th>{t("Uncertain")}</th></tr></thead><tbody>{summary.targets.map(item => <tr key={`${item.language}:${item.sound}:${t(item.context)}`}><td>/{item.sound}/ · {item.language}</td><td>{t(item.context)}</td>{['independent', 'supported', 'difficulty', 'uncertain'].map(outcome => <td key={t(outcome)}>{item.outcomes[outcome]}</td>)}</tr>)}</tbody></table></div><p>{t("Counts reflect the latest review of each recording, sound, and context. They are observations rather than an estimate of clinical improvement.")}</p></>}
      {!!summary.review_timeline?.length && <details><summary>{t("Review timeline")}</summary><div style={{
          display: 'flex',
          gap: 12,
          overflowX: 'auto',
          padding: '18px 0'
        }}>{summary.review_timeline.map(day => <div key={day.date} style={{
            minWidth: 105
          }}><small>{day.date}</small>{Object.entries(day.outcomes).filter(([, count]) => count).map(([outcome, count]) => <p key={t(outcome)} style={{
              margin: '6px 0',
              fontSize: '.8rem'
            }}>{count} {t(outcome)}</p>)}</div>)}</div></details>}
    </section>}
    {summary && clinical && ["all", "reviews"].includes(view) && <GuidedPracticeReview key={learner.id} learner={learner} onInspect={async id => {
      try { await playRecording(await portalApi(`/recordings/${id}`)); } catch (err) { setError(err.message); }
    }} />}
    {summary && <div className={view === "all" ? styles.layout : undefined} style={{
      marginTop: 24
    }}>
      {["all", "reviews"].includes(view) && <section className={styles.panel}><h2>{clinical ? t("Review queue & recordings") : t("Your recordings")}</h2>
        <label className={styles.form}>{t("Show recordings")}<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">{t("All recordings")}</option><option value="pending">{t("Awaiting human review")}</option><option value="recognition">{t("Recognition unavailable")}</option></select></label>
        {!records.length && <p>{t("No recordings yet.")}</p>}
        <div className={styles.roster}>{records.filter(item => filter === 'all' || (filter === 'pending' ? item.review_status === 'pending' : !!item.recognition_error)).map(item => <button className={styles.learner} key={item.id} onClick={() => playRecording(item)}>
          <span><strong>{item.transcript?.slice(0, 70) || t("Recording awaiting transcription")}</strong><small>{new Date(item.created_at).toLocaleString(locale)} · {item.duration_seconds}{t("s \xB7")} {item.language}</small></span>
          <span className={styles.badge}>{t(item.review_status)}</span>
        </button>)}</div>
        {record && <div className={styles.detail}>
          <h3>{t("Inspect this attempt")}</h3>{audio && <EvidencePlayer key={audio} src={audio} duration={record.duration_seconds} timings={record.words} reviews={reviews} onRange={clinical ? (start, end) => {
            if (rangeForm.current) {
              rangeForm.current.elements.start.value = start;
              rangeForm.current.elements.end.value = end;
            }
          } : undefined} />}
          {!record.audio_retained && <p>{t("Audio was not retained. A transcript alone cannot establish pronunciation correctness.")}</p>}
          {record.transcript && <p lang={record.language}>{record.transcript}</p>}
          {!clinical && <Link href={`/speech-translator?recording=${record.id}`}>{t("Correct recognition and confirm your intended message \u2192")}</Link>}
          <p>{t("Age at recording:")} {record.quality.learner_age_at_recording ?? t("Not recorded")} {t("\xB7 dialect:")} {record.quality.dialect || t("unspecified")}</p>
          {record.recognition_error && <p>{t("Recognition:")} {record.recognition_error.replaceAll('_', ' ')}</p>}
          <details><summary>{t("Recognition timing and signal measurements")}</summary><pre style={{
              overflow: 'auto',
              maxHeight: 220,
              fontSize: '.75rem'
            }}>{JSON.stringify({
                words: record.words,
                quality: record.quality,
                model: record.recognition_model
              }, null, 2)}</pre></details>
          {reviews.map(item => <article key={item.id} className={styles.detail}><strong>/{item.sound}/ · {t(item.outcome)} · {item.start_seconds}–{item.end_seconds}{t("s")}</strong>{item.superseded && <p>{t("Earlier version \xB7 replaced by a later review")}</p>}{item.error_category && <p>{t(item.error_category)} {t("\xB7 expected /")}{item.expected_phone || '?'} {t("/ \xB7 produced /")}{item.produced_phone || t("not specified")}/</p>}<p>{item.notes}</p>{item.intended_text && <p>{t("Reviewed intended words:")} {item.intended_text}</p>}<small>{t("Human review \xB7")} {new Date(item.created_at).toLocaleString(locale)}</small>{clinical && !item.superseded && <button type="button" disabled={busy} onClick={() => revise(item)}>{t("Revise this review")}</button>}</article>)}
          {clinical && <form ref={rangeForm} key={record.id} onSubmit={review} className={styles.form}>
            {proposalId && <p>{t("This human review will record your decision on the selected AI proposal.")} <button type="button" onClick={() => {
                setProposalId(null);
                rangeForm.current.reset();
              }}>{t("Detach proposal")}</button></p>}
            <h3>{revision ? t("Revise assessed segment") : t("Annotate an assessed segment")}</h3>{revision && <button type="button" onClick={() => {
              setRevision(null);
              rangeForm.current.reset();
            }}>{t("Cancel revision")}</button>}<label>{t("Sound")}<input name="sound" required maxLength={16} /></label>
            <div className={styles.layout}><label>{t("Start, seconds")}<input name="start" type="number" min="0" step="0.01" defaultValue="0" required /></label><label>{t("End, seconds")}<input name="end" type="number" min="0.01" max={record.duration_seconds} step="0.01" defaultValue={record.duration_seconds} required /></label></div>
            <label>{t("Outcome")}<select name="outcome">{['independent', 'supported', 'difficulty', 'uncertain'].map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
            <label>{t("Context")}<select name="context">{['sound', 'syllable', 'word', 'sentence', 'conversation', 'listening'].map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
            <label>{t("Expected speech sound (IPA), if assessed")}<input name="expected_phone" maxLength={16} /></label><label>{t("Produced speech sound (IPA), if assessed")}<input name="produced_phone" maxLength={16} /></label><label>{t("Human-assessed error category")}<select name="error_category"><option value="">{t("No categorized error label")}</option><option value="substitution">{t("Substitution")}</option><option value="omission">{t("Omission")}</option><option value="distortion">{t("Distortion")}</option><option value="uncertain">{t("Uncertain")}</option></select></label>
            <label>{t("Confirmed intended words")}<input name="intent" maxLength={2000} /></label><label>{t("Evidence and guidance")}<textarea name="notes" required maxLength={1500} /></label>
            <button disabled={busy || !learner.consent?.practice_allowed}>{t("Save clinician review")}</button>
          </form>}
          {clinical && <AudioProposalPanel key={record.id} record={record} enabled={learner.consent?.cloud_processing_allowed && learner.consent?.practice_allowed} onInspect={inspectProposal} revisionKey={reviews.length} />}
        </div>}
      </section>}
      {["all", "tasks"].includes(view) && <section className={styles.panel}><h2>{t("Reviewed practice plan")}</h2>
        {!goals.length && <p>{t("No active goals have been authored yet.")}</p>}
        {goals.map(goal => <article key={goal.id} className={styles.detail}><h3>{goal.title}</h3><p>/{goal.sound}/ · {t(LANGUAGES[goal.language])} · {t(goal.phase)}</p><strong lang={goal.language}>{goal.practice_word}</strong><p>{goal.instruction}</p>
          {clinical && <button className={styles.linkButton} onClick={async () => {
            try {
              await portalApi(`/goals/${goal.id}/archive`, {
                method: 'PATCH'
              });
              await refresh();
            } catch (err) {
              setError(err.message);
            }
          }}>{t("Archive goal")}</button>}
        </article>)}
        {clinical && <form onSubmit={addGoal} className={styles.form}>
          <h3>{t("Create a goal")}</h3><label>{t("Goal title")}<input name="title" maxLength={120} required /></label><label>{t("Sound")}<input name="sound" maxLength={16} required /></label>
          <label>{t("Language")}<select name="language" defaultValue={learner.language}>{Object.entries(LANGUAGES).map(([code, name]) => <option key={code} value={code}>{t(name)}</option>)}</select></label>
          <label>{t("Practice word")}<input name="word" maxLength={120} required /></label><label>{t("Reviewed instruction")}<textarea name="instruction" maxLength={1500} required /></label>
          <label>{t("Phase")}<select name="phase"><option value={"establishment"}>{t("establishment")}</option><option value={"generalization"}>{t("generalization")}</option><option value={"maintenance"}>{t("maintenance")}</option></select></label>
          <button disabled={busy || !learner.consent?.practice_allowed}>{t("Save practice goal")}</button>
        </form>}
      </section>}
    </div>}
    {summary && clinical && ["all", "tasks"].includes(view) && <ClinicalTasks key={`tasks:${learner.id}`} learner={learner} goals={goals} />}
    {summary && clinical && ["all", "tasks"].includes(view) && <ClinicalDemonstrations key={`demos:${learner.id}`} learner={learner}/>}
    {summary && ["all", "tasks"].includes(view) && <ReviewedActivityEditor key={learner.id} learner={learner} clinical={clinical} goals={goals} />}
    {printReport && <CareReportDialog report={printReport} onClose={() => setPrintReport(null)} />}
  </div>;
}
