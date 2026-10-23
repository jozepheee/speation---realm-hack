import { useLocale } from "../context/LocaleContext";
import { useEffect, useState } from 'react';
import { portalApi } from '../lib/portalApi';
import styles from '../styles/workspace.module.css';
export default function ReviewedActivityEditor({
  learner,
  clinical,
  goals
}) {
  const {
    t
  } = useLocale();
  const [activities, setActivities] = useState([]),
    [kind, setKind] = useState('syllable'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),[loading,setLoading]=useState(true);
  async function refresh(signal) {
    setLoading(true);
    try{const rows=await portalApi(`/learners/${learner.id}/activities`,{signal});if(!signal?.aborted)setActivities(rows);}
    finally{if(!signal?.aborted)setLoading(false);}
  }
  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal).catch(err => {
      if (err.name !== 'AbortError') setError(err.message);
    });
    return () => controller.abort();
  }, [learner.id]);
  async function save(event) {
    event.preventDefault();
    const form = event.currentTarget,
      values = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await portalApi(`/learners/${learner.id}/activities`, {
        method: 'POST',
        body: {
          kind,
          title: values.get('title'),
          word: values.get('word'),
          instruction: values.get('instruction'),
          language: values.get('language'),
          min_age: Number(values.get('min_age')),
          max_age: Number(values.get('max_age')),
          goal_id: values.get('goal') || null,
          difficulty: values.get('difficulty'),
          ...(kind === 'syllable' ? {
            syllables: values.get('syllables').split('|').map(piece => piece.trim())
          } : kind === 'picture' ? {
            picture: values.get('picture')
          } : {
            beat_intervals: values.get('beats').split(',').map(Number)
          })
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
  return <section className={styles.panel} style={{
    marginTop: 24
  }}><p className={styles.eyebrow}>{t("REVIEWED CONTENT \xB7 SHARED ACROSS PRACTICE AND PLAY")}</p><h2>{t("Activity catalogue")}</h2>
    {error && <p role="alert" className={styles.error}>{t(error)}</p>}
    {loading?<p role="status">{t('Loading patient activity…')}</p>:!error&&!activities.length && <p>{t("No activities are approved for this learner\u2019s age yet.")}</p>}
    {activities.map(activity => <article key={activity.id} className={styles.detail}><h3>{activity.title}</h3><p>{t(activity.kind)} · {activity.language} {t("\xB7 ages")} {activity.min_age}–{activity.max_age}</p><strong lang={activity.language}>{activity.word}</strong><p>{activity.instruction}</p>
      <p>{t("Reviewed level:")} {t(activity.content.difficulty || "starter")}</p>
      {activity.kind === 'syllable' && <p>{t("Reviewed pieces:")} {activity.content.syllables.join(' · ')}</p>}
      {activity.kind === 'picture' && <p>{t("Reviewed image association:")} {activity.content.picture}</p>}
      {activity.kind === 'rhythm' && <p>{t("Pattern intervals:")} {activity.content.beat_intervals.join(', ')} {t("seconds")}</p>}
      {clinical && <button className={styles.linkButton} disabled={busy} onClick={async () => {
        setBusy(true);
        try {
          await portalApi(`/activities/${activity.id}/archive`, {
            method: 'PATCH'
          });
          await refresh();
        } catch (err) {
          setError(err.message);
        } finally {
          setBusy(false);
        }
      }}>{t("Retire activity")}</button>}
    </article>)}
    {clinical && <form className={styles.form} onSubmit={save}><h3>{t("Author an approved activity")}</h3>
      <label>{t("Activity type")}<select value={kind} onChange={event => setKind(event.target.value)}><option value="syllable">{t("Syllable puzzle")}</option><option value="picture">{t("Picture and word matching")}</option><option value="rhythm">{t("Rhythm and pacing")}</option></select></label>
      <label>{t("Title")}<input name="title" required maxLength={120} /></label><label>{t("Practice word or phrase")}<input name="word" required maxLength={120} /></label>
      <label>{t("Language")}<select name="language" defaultValue={learner.language}><option value="en">{t("English")}</option><option value="hi">{t("Hindi")}</option><option value="ml">{t("Malayalam")}</option></select></label>
      <label>{t("Reviewed activity level")}<select name="difficulty"><option value="starter">{t("Starter")}</option><option value="growing">{t("Growing")}</option><option value="challenge">{t("Challenge")}</option></select></label>
      <label>{t("Approved goal, optional")}<select name="goal"><option value="">{t("General reviewed activity")}</option>{goals.map(goal => <option key={goal.id} value={goal.id}>{goal.title} · {goal.language}</option>)}</select></label>
      <div className={styles.layout}><label>{t("Minimum age")}<input type="number" min={4} max={21} name="min_age" defaultValue={4} required /></label><label>{t("Maximum age")}<input type="number" min={4} max={21} name="max_age" defaultValue={21} required /></label></div>
      <label>{t("Reviewed instruction")}<textarea name="instruction" required maxLength={1500} /></label>
      {kind === 'syllable' && <label>{t("Correct syllable pieces, separated by |")}<input name="syllables" required placeholder={t("Enter the reviewed pieces in order")} /><small>{t("Use your linguistic assessment; the app does not infer syllables from letters.")}</small></label>}
      {kind === 'picture' && <label>{t("Illustrated object")}<select name="picture">{['water', 'apple', 'home', 'car', 'tree', 'sun', 'cat', 'ball'].map(name => <option key={name} value={name}>{t(name)}</option>)}</select></label>}
      {kind === 'rhythm' && <label>{t("Successive intervals in seconds, separated by commas")}<input name="beats" required placeholder="0.8, 0.8, 1.2" /><small>{t("Provide 2\u20138 intervals between 0.25 and 2.5 seconds. This is a pacing activity, not an assessment.")}</small></label>}
      <button disabled={busy || !learner.consent?.practice_allowed}>{t("Save clinician-approved activity")}</button>
    </form>}
  </section>;
}
