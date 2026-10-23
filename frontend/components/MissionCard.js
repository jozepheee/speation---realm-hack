import { useLocale } from "../context/LocaleContext";
import { useEffect, useState } from 'react';
import RecordingStudio from './RecordingStudio';
import styles from '../styles/workspace.module.css';
export default function MissionCard({
  mission,
  learner,
  goal,
  onReport,
  busy
}) {
  const {
    t, locale
  } = useLocale();
  const [recording, setRecording] = useState(null),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const waiting = mission.due_at && new Date(mission.due_at).getTime() > now;
  const check = ['retention', 'transfer'].includes(mission.kind);
  return <article className={styles.detail}><h3>{mission.title}</h3><p>{mission.instruction}</p>
    <p>{t(mission.kind || "practice")}{mission.due_at ? t("\xB7 Scheduled: {value0}", {
        value0: new Date(mission.due_at).toLocaleString(locale)
      }) : ''}</p>
    {mission.source === 'owner_reviewed_ai_proposal' && <small>{t("AI-assisted proposal \xB7 reviewed and saved by the profile owner")}</small>}
    {mission.completed_at ? <><span className={styles.badge}>{t("Reported complete")}</span><p>{mission.report}</p><small>{t("Family or participant report; recording assessments appear separately in the care record.")}</small></> : waiting ? <p>{t("This check opens at its scheduled time. You can return when it suits you.")}</p> : <>{check && goal && <RecordingStudio learner={{
        ...learner,
        language: goal.language
      }} task={mission.kind === 'retention' ? 'word' : 'conversation'} expectedText={mission.kind === 'retention' ? goal.practice_word : ''} onRecorded={setRecording} />}
        {check && !goal && <p>{t("This goal has been retired. Ask your clinician to create a check for the current plan.")}</p>}
        {recording && <p>{t("A fresh recording is ready to link to this experience.")}</p>}
        <form onSubmit={event => onReport(event, mission.id, recording?.id)} className={styles.form}>
          <label>{t("What happened?")}<textarea name="report" required maxLength={1500} placeholder={t("What you tried, what helped, and anything to discuss with the clinician")} /></label>
          <button disabled={busy || !learner.consent?.practice_allowed || check && (!recording || !goal)}>{t("Record this experience")}</button>
        </form></>}
  </article>;
}
