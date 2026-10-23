import { useLocale } from "../context/LocaleContext";
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
export default function CareReportDialog({
  report,
  onClose
}) {
  const {
    t, locale
  } = useLocale();
  const dialog = useRef(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const replaced = new Set(report.reviews.map(item => item.supersedes_review_id).filter(Boolean));
  const currentReviews = report.reviews.filter(item => !replaced.has(item.id)).slice(0, 20);
  return createPortal(<div id="speation-print-root"><dialog ref={dialog} onClose={onClose} aria-labelledby="speation-report-title" style={{
      width: 'min(850px, 90vw)',
      maxHeight: '85vh',
      overflow: 'auto',
      border: '1px solid #cedbcf',
      borderRadius: 18,
      padding: 28,
      color: '#173f38',
      background: '#fff'
    }}>
    <div className="speation-report-controls" style={{
        display: 'flex',
        gap: 12,
        justifyContent: 'flex-end'
      }}>
      <button onClick={() => window.print()}>{t("Print / save PDF")}</button><button onClick={() => dialog.current.close()}>{t("Close report")}</button>
    </div>
    <p>{t("Speation \xB7 Care report")}</p><h1 id="speation-report-title">{report.learner.name}</h1>
    <p>{t("Age")} {report.learner.age} · {report.learner.language.toUpperCase()} {t("\xB7 generated")} {new Date(report.generated_at).toLocaleString(locale)}</p>
    <h2>{t("What has been recorded")}</h2><p>{report.summary.recordings} {t("recordings \xB7")} {report.summary.pending_reviews} {t("awaiting review")}</p>
    <p>{t("These are recorded activities and human observations. Completing an activity is separate from pronunciation accuracy or clinical improvement.")}</p>
    <table><thead><tr><th>{t("Human-reviewed outcome")}</th><th>{t("Count")}</th></tr></thead><tbody>{Object.entries(report.summary.reviewed_outcomes).map(([name, count]) => <tr key={name}><td>{name === 'supported' ? t("With support") : name.charAt(0).toUpperCase() + name.slice(1)}</td><td>{count}</td></tr>)}</tbody></table>
    <h2>{t("Current clinician-authored plan")}</h2>
    {!report.goals.some(goal => goal.active) && <p>{t("No active goals are recorded in this report.")}</p>}
    {report.goals.filter(goal => goal.active).map(goal => <section key={goal.id}><h3>{goal.title}</h3><p>/{goal.sound}/ · {goal.language.toUpperCase()} · {t(goal.phase)}</p><p><strong lang={goal.language}>{goal.word}</strong></p><p>{goal.instruction}</p></section>)}
    <h2>{t("Recent reviewed attempts")}</h2><p>{t("Up to 20 current reviews from the returned history. Earlier versions remain in the JSON export.")}</p>
    {!currentReviews.length && <p>{t("No human reviews are recorded in this report.")}</p>}
    {currentReviews.map(review => <section key={review.id}><h3>/{review.sound}/ · {t(review.outcome)} · {t(review.context)}</h3>
      <p>{new Date(review.created_at).toLocaleString(locale)} {t("\xB7 recording segment")} {review.start_seconds}–{review.end_seconds}{t("s")}</p>
      {review.intended_text && <p>{t("Reviewed intended words:")} {review.intended_text}</p>}<p>{review.notes}</p><small>{t("Review")} {review.id} {t("\xB7 reviewer")} {review.reviewer_id}</small>
    </section>)}
    {(report.truncated || report.summary.truncated) && <p>{t("This report is limited to the returned recent history. Older records may be outside its scope.")}</p>}
    {report.ai_review&&<section translate="no" lang="en"><h2>AI progress summary · {report.ai_review.status}</h2><p>Model: {report.ai_review.model}. AI observations remain separate from clinician-reviewed recording outcomes.</p><p>{report.ai_review.content.summary}</p>{['strengths','needs_support','next_steps'].map(key=><div key={key}><h3>{key.replaceAll('_',' ')}</h3><ul>{report.ai_review.content[key].map((item,index)=><li key={index}>{item.text}</li>)}</ul></div>)}{report.ai_review.review_note&&<p>Clinician note: {report.ai_review.review_note}</p>}</section>}
    <p>{t("Audio files are excluded. The export contains recording metadata, review history and any saved AI summary with its review status.")}</p>
    <small>{t("Exported by")} {report.exported_by} {t("\xB7 learner")} {report.learner.id}</small>
  </dialog><style jsx global>{`
    #speation-print-root dialog::backdrop { background: #173f3866; }
    #speation-print-root h1 { font-size: 2rem; }
    #speation-print-root h2 { margin-top: 28px; font-size: 1.2rem; }
    #speation-print-root h3 { font-size: 1rem; }
    #speation-print-root section { border-top: 1px solid #e1e7df; padding: 10px 0; break-inside: avoid; }
    #speation-print-root table { border-collapse: collapse; width: 100%; text-align: left; }
    #speation-print-root td, #speation-print-root th { border-bottom: 1px solid #e1e7df; padding: 10px; }
    #speation-print-root p { line-height: 1.55; }
    #speation-print-root small { overflow-wrap: anywhere; }
    @media print {
      @page { margin: 18mm; }
      body > :not(#speation-print-root) { display: none !important; }
      #speation-print-root dialog { display: block !important; position: static !important; width: 100% !important; max-width: none !important; max-height: none !important; overflow: visible !important; border: 0 !important; padding: 0 !important; }
      #speation-print-root .speation-report-controls { display: none !important; }
      #speation-print-root { color: #111; font-family: Arial, sans-serif; }
    }
  `}</style></div>, document.body);
}
