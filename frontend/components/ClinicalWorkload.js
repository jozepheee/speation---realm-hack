import { useLocale } from "../context/LocaleContext";
import { useEffect, useState } from 'react';
import { portalApi } from '../lib/portalApi';
import styles from '../styles/workspace.module.css';
export default function ClinicalWorkload({
  onSelect
}) {
  const {
    t, locale
  } = useLocale();
  const [data, setData] = useState(null),
    [error, setError] = useState('');
  const [query, setQuery] = useState(''),
    [loading, setLoading] = useState(false);
  async function load(signal) {
    setLoading(true);
    setError('');
    try {
      setData(await portalApi('/clinical/workload', {
        signal
      }));
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, []);
  const rows = (data?.learners || []).filter(item => `${item.name} ${item.language}`.toLowerCase().includes(query.toLowerCase()));
  return <section className={styles.panel} style={{
    marginBottom: 24
  }}>
    <p className={styles.eyebrow}>{t("YOUR ASSIGNED CASELOAD")}</p><h2>{t("What needs your attention")}</h2>
    <p>{t("Pending recordings and uncertain human assessments help you plan your next review.")}</p>
    <button disabled={loading} onClick={() => load()}>{loading ? t("Refreshing\u2026") : t("Refresh workload")}</button>
    {error && <p role="alert" className={styles.error}>{t(error)}</p>}
    {data && <><div className={styles.outcomes}>
      <div><strong>{data.learners.reduce((sum, item) => sum + item.pending, 0)}</strong><span>{t("Awaiting review")}</span></div>
      <div><strong>{data.learners.reduce((sum, item) => sum + item.uncertain, 0)}</strong><span>{t("Uncertain assessments")}</span></div>
    </div><label className={styles.form}>{t("Find a learner")}<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className={styles.roster}>{rows.map(item => <button key={item.learner_id} className={styles.learner} onClick={() => onSelect(item.learner_id)}>
        <span><strong>{item.name}</strong><small>{item.language.toUpperCase()} · {item.recordings} {t("recordings \xB7")} {item.uncertain} {t("uncertain")}</small>
          <small>{item.oldest_pending ? t("Oldest pending: {value0}", {
                value0: new Date(item.oldest_pending).toLocaleString(locale)
              }) : t("No recordings awaiting review")}</small></span>
        <span className={styles.badge}>{item.pending} {t("pending")}</span>
      </button>)}</div>{!rows.length && <p>{t("No assigned learners match this view.")}</p>}
      {data.truncated && <p>{t("Showing the first 500 learners, ordered by pending review count.")}</p>}</>}
  </section>;
}
