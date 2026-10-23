import { useLocale } from "../context/LocaleContext";
import { useEffect, useRef, useState } from 'react';
import { portalApi } from '../lib/portalApi';
import styles from '../styles/workspace.module.css';
export default function AudioProposalPanel({
  record,
  enabled,
  onInspect,
  revisionKey
}) {
  const {
    t
  } = useLocale();
  const [rows, setRows] = useState([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  async function load(signal) {
    setRows(await portalApi(`/recordings/${record.id}/audio-proposals`, {
      signal
    }));
  }
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch(err => {
      if (err.name !== 'AbortError') setError(err.message);
    });
    return () => {
      generation.current += 1;
      controller.abort();
    };
  }, [record.id, revisionKey]);
  async function request(event) {
    event.preventDefault();
    const current = generation.current,
      fields = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await portalApi(`/recordings/${record.id}/audio-proposals`, {
        method: 'POST',
        body: {
          start_seconds: Number(fields.get('start')),
          end_seconds: Number(fields.get('end')),
          expected_text: fields.get('text'),
          expected_phone: fields.get('phone')
        }
      });
      if (current === generation.current) await load();
    } catch (err) {
      if (current === generation.current) setError(err.message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function reject(event, id) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await portalApi(`/audio-proposals/${id}/reject`, {
        method: 'POST',
        body: {
          note: new FormData(event.currentTarget).get('note')
        }
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return <details className={styles.detail}><summary>{t("AI audio second look \xB7 clinician review required")}</summary>
    <p>{t("Send a selected segment to the configured audio model. Its tentative observations require your independent listening and assessment. No automatic sound score is released.")}</p>
    {error && <p role="alert" className={styles.error}>{t(error)}</p>}
    <form className={styles.form} onSubmit={request}>
      <label>{t("Expected words")}<input name="text" defaultValue={record.expected_text || ''} required maxLength={300} /></label>
      <label>{t("Expected sound / IPA")}<input name="phone" maxLength={16} required /></label>
      <label>{t("Start, seconds")}<input name="start" type="number" min="0" max={record.duration_seconds} step="0.01" defaultValue="0" required /></label>
      <label>{t("End, seconds \xB7 up to 20 seconds per request")}<input name="end" type="number" min="0.01" max={record.duration_seconds} step="0.01" defaultValue={Math.min(20, record.duration_seconds)} required /></label>
      <button disabled={busy || !enabled || !record.audio_retained}>{busy ? t("Working\u2026") : t("Request audio observations")}</button>
    </form>
    {rows.map(row => <article key={row.id} className={styles.detail}><h4>{t(row.content.state.replaceAll('_', ' '))}</h4><p>{row.content.summary}</p>
      <small>{row.model} · {row.request.start_seconds}–{row.request.end_seconds}{t("s \xB7")} {t(row.decision)}</small>
      {row.content.concerns.map((item, index) => <div key={index}><p>{t(item.category)}: {item.observation}</p><p>{t("Uncertainty:")} {item.uncertainty}</p>
        {row.decision === 'pending' && <button type="button" disabled={busy} onClick={() => onInspect(row, item)}>{t("Inspect and write my assessment")}</button>}</div>)}
      {row.decision === 'pending' && <form onSubmit={event => reject(event, row.id)} className={styles.form}><label>{t("Reason for rejecting this proposal")}<input name="note" maxLength={1500} required /></label><button disabled={busy}>{t("Reject proposal")}</button></form>}
      {row.decision_note && <p>{t("Clinician decision:")} {row.decision_note}</p>}
    </article>)}
  </details>;
}
