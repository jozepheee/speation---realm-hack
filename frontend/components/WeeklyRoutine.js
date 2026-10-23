import { useLocale } from "../context/LocaleContext";
import { useEffect, useState } from 'react';
import { portalApi } from '../lib/portalApi';
import styles from '../styles/workspace.module.css';
export default function WeeklyRoutine({
  learner,
  editable = false,
  clinical = false
}) {
  const {
    t, locale
  } = useLocale();
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load(signal) {
    setData(await portalApi(`/learners/${learner.id}/routine`, {
      signal
    }));
  }
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch(err => {
      if (err.name !== 'AbortError') setError(err.message);
    });
    return () => controller.abort();
  }, [learner.id]);
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await portalApi(`/learners/${learner.id}/routine`, {
        method: 'PUT',
        body: {
          target_days: Number(new FormData(event.currentTarget).get('days')),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        }
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return <section className={styles.panel} style={{
    marginTop: 24
  }}>
    <p className={styles.eyebrow}>{clinical ? t("PATIENT PARTICIPATION") : t("A ROUTINE THAT FITS YOUR LIFE")}</p><h2>{clinical ? t("Weekly practice participation") : t("Small moments, across your week")}</h2>
    <p>{t("Recording an attempt, completing a game, or reporting a family activity counts as participation. Missed days carry no penalty.")}</p>
    {error && <p className={styles.error} role="alert">{t(error)}</p>}
    {data?.configured ? <><p><strong>{data.participation_days.length} {t("of")} {data.target_days} {t("planned days")}</strong> {t("\xB7 week beginning")} {data.week_start} · {data.timezone}</p>
      <div className={styles.outcomes}>{Array.from({
          length: 7
        }, (_, index) => {
          const date = new Date(`${data.week_start}T12:00:00Z`);
          date.setUTCDate(date.getUTCDate() + index);
          const id = date.toISOString().slice(0, 10),
            done = data.participation_days.includes(id);
          return <div key={id}><strong aria-label={done ? t("Participation recorded") : t("No activity recorded")}>{done ? '✦' : '○'}</strong><span>{date.toLocaleDateString(locale, {
                weekday: 'short',
                timeZone: 'UTC'
              })}</span></div>;
        })}</div>{data.truncated && <p>{t("Participation reflects the first 2,000 activities of each type this week.")}</p>}</> : data && <p>{t("Choose a comfortable number of days. You can change it whenever life changes.")}</p>}
    {editable && <form className={styles.form} onSubmit={save}><label>{t("Days you would like to participate each week")}<select name="days" key={data?.target_days || 'new'} defaultValue={data?.target_days || 3}>{[1, 2, 3, 4, 5, 6, 7].map(value => <option key={value} value={value}>{value} {value === 1 ? t("day") : t("days")}</option>)}</select></label><button disabled={busy}>{t("Save my flexible routine")}</button></form>}
    <button type="button" disabled={busy} onClick={() => load().catch(err => setError(err.message))}>{t("Refresh participation")}</button>
  </section>;
}
