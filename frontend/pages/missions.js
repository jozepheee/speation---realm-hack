import { useLocale } from "../context/LocaleContext";
import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';
import useLearners from '../hooks/useLearners';
import MissionCard from '../components/MissionCard';
import { portalApi } from '../lib/portalApi';
import styles from '../styles/workspace.module.css';
export default function Missions() {
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
  const [missions, setMissions] = useState([]),
    [goals, setGoals] = useState([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState(null);
  const generation = useRef(0);
  async function fromPhoto(event) {
    event.preventDefault();
    const current = generation.current;
    setBusy(true);
    setError('');
    const data = new FormData();
    data.append('photo', new FormData(event.currentTarget).get('photo'));
    try {
      const result = await portalApi(`/learners/${selected}/photo-activity`, {
        method: 'POST',
        body: data
      });
      if (current === generation.current) setProposal(result);
    } catch (err) {
      if (current === generation.current) setError(err.message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function refresh(signal) {
    const [activities, plan] = await Promise.all([portalApi(`/learners/${selected}/missions`, {
      signal
    }), portalApi(`/learners/${selected}/goals`, {
      signal
    })]);
    setMissions(activities);
    setGoals(plan);
  }
  useEffect(() => {
    generation.current += 1;
    setProposal(null);
    setMissions([]);
    setGoals([]);
    setBusy(false);
    if (!selected) return;
    const controller = new AbortController();
    refresh(controller.signal).catch(err => {
      if (err.name !== 'AbortError') setError(err.message);
    });
    return () => {
      generation.current += 1;
      controller.abort();
    };
  }, [selected]);
  async function create(event) {
    event.preventDefault();
    const form = event.currentTarget,
      fields = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await portalApi(`/learners/${selected}/missions`, {
        method: 'POST',
        body: {
          title: fields.get('title'),
          instruction: fields.get('instruction'),
          kind: fields.get('kind'),
          due_at: fields.get('due') ? new Date(fields.get('due')).toISOString() : null,
          ...(fields.get('goal') ? {
            goal_id: fields.get('goal')
          } : {})
        }
      });
      form.reset();
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function report(event, id, recordingId) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await portalApi(`/missions/${id}/report`, {
        method: 'POST',
        body: {
          report: fields.get('report'),
          recording_id: recordingId || null
        }
      });
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return <ProtectedRoute><Head><title>{t("My World Missions \xB7 Speation")}</title></Head><Navbar /><main className={styles.main}>
    <header className={styles.hero}><p className={styles.eyebrow}>{t("BEYOND THE SCREEN")}</p><h1>{t("Practice belongs in your world.")}</h1><p>{t("A toy, a breakfast conversation, a story with someone you love. Build small activities around real life.")}</p></header>
    {(error || profileError) && <p className={styles.error} role="alert">{error || t(profileError)}</p>}
    <div className={styles.form}><label>{t("Learner")}<select value={selected} onChange={event => setSelected(event.target.value)}>{learners.map(item => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label></div>
    {learner && <div className={styles.layout} style={{
        marginTop: 24
      }}><section className={styles.panel}><h2>{t("Your activities")}</h2>{!missions.length && <p>{t("No activities yet. Choose a familiar routine and a small, achievable step.")}</p>}
      {missions.map(item => <MissionCard key={`${selected}:${item.id}`} mission={item} learner={learner} goal={goals.find(goal => goal.id === item.goal_id)} onReport={report} busy={busy} />)}
    </section><section className={styles.panel}><h2>{t("Create a real-world mission")}</h2><form key={selected} onSubmit={create} className={styles.form}><label>{t("Activity title")}<input name="title" required maxLength={120} placeholder={t("Tell me about your favorite toy")} /></label><label>{t("Activity type")}<select name="kind"><option value="practice">{t("Everyday practice")}</option><option value="retention">{t("Delayed retention \xB7 reviewed word")}</option><option value="transfer">{t("Real-world transfer \xB7 conversation")}</option></select></label><label>{t("Schedule, optional for everyday practice")}<input name="due" type="datetime-local" /></label><label>{t("Reviewed goal, required for retention and transfer")}<select name="goal"><option value="">{t("General communication activity")}</option>{goals.map(goal => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label><label>{t("How you will practice")}<textarea name="instruction" required maxLength={1500} /></label><button disabled={busy || !learner.consent?.practice_allowed}>{t("Create mission")}</button></form><p>{t("Use the clinician\u2019s guidance for corrective practice. Participation and successful communication can be reported without perfect pronunciation.")}</p></section></div>}
    {learner && <section className={styles.panel} style={{
        marginTop: 24
      }}><h2>{t("A picture from your world")}</h2><p>{t("Choose an object or familiar scene to inspire an activity. The photo is sent to the configured AI provider with cloud permission; the proposal needs your review.")}</p>
      <form className={styles.form} onSubmit={fromPhoto}><label>{t("Photo, up to 2 MiB")}<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required /></label><button disabled={busy || !learner.consent?.cloud_processing_allowed}>{t("Suggest an activity")}</button></form>
      {proposal && <form className={styles.form} key={proposal.proposal_id} onSubmit={async event => {
          event.preventDefault();
          const current = generation.current,
            fields = new FormData(event.currentTarget);
          setBusy(true);
          try {
            await portalApi(`/learners/${selected}/missions`, {
              method: 'POST',
              body: {
                title: fields.get('title'),
                instruction: fields.get('instruction'),
                proposal_id: proposal.proposal_id
              }
            });
            if (current === generation.current) {
              setProposal(null);
              await refresh();
            }
          } catch (err) {
            if (current === generation.current) setError(err.message);
          } finally {
            if (current === generation.current) setBusy(false);
          }
        }}><p>{t("AI-generated proposal: check the objects and edit the activity before saving.")}</p><label>{t("Title")}<input name="title" defaultValue={proposal.title} maxLength={120} required /></label><label>{t("Activity")}<textarea name="instruction" defaultValue={proposal.instruction} maxLength={1500} required /></label><label className={styles.check}><input type="checkbox" required />{t("I reviewed this proposed activity.")}</label><button disabled={busy}>{t("Save reviewed activity")}</button></form>}
    </section>}
  </main></ProtectedRoute>;
}
