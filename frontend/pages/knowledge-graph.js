import { useLocale } from "../context/LocaleContext";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';
import { portalApi } from '../lib/portalApi';
import { LANGUAGES } from '../components/LearnerWorkspace';
import styles from '../styles/workspace.module.css';
import graphStyles from '../styles/knowledge-graph.module.css';
import { useAuth } from '../context/AuthContext';
const title = (node, t) => node.label || (node.type === 'recording' ? `${t(node.task || node.context || 'Recording')} · ${node.language || ''}` : node.type === 'cycle' ? `${t('Practice')} · ${t(node.stage || '')}` : node.type === 'transfer' ? t('Everyday transfer attempt') : node.type === 'goal' ? node.word || t('Reviewed goal') : node.type === 'learner' ? t('Learner') : node.type === 'target' ? `/${node.sound}/ · ${node.language}` : `${t(node.outcome)} · /${node.sound}/`);
function GraphView({
  graph
}) {
  const {
    t,
    locale
  } = useLocale();
  const shown = graph.nodes.slice(-36);
  const columns = {
    learner: 0,
    observation: 1,
    recording: 2,
    target: 3,
    goal: 4,
    cue: 5,
    cycle: 6,
    transfer: 7
  };
  const counts = {};
  const positions = Object.fromEntries(shown.map(node => {
    const row = counts[node.type] || 0;
    counts[node.type] = row + 1;
    return [node.id, {
      x: 115 + (columns[node.type] || 0) * 225,
      y: 60 + row * 100
    }];
  }));
  const height = Math.max(260, Math.max(0, ...Object.values(counts)) * 100 + 30);
  return <div className={graphStyles.graphWrap}>
    <svg viewBox={`0 0 1800 ${height}`} style={{
      minWidth: 1100
    }} role="img" aria-label={t("Recorded attempts, reviewed outcomes, goals, cues, practice cycles and transfer evidence")}>
      <defs><marker id="graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#8da99d" /></marker></defs>
      {graph.edges.filter(edge => positions[edge.source] && positions[edge.target]).map((edge, i) => {
        const a = positions[edge.source],
          b = positions[edge.target];
        return <path key={i} d={`M${a.x},${a.y} C${a.x + 100},${a.y} ${b.x - 100},${b.y} ${b.x},${b.y}`} fill="none" stroke="#a3b8ae" strokeWidth="1.5" markerEnd="url(#graph-arrow)"><title>{edge.relation}</title></path>;
      })}
      {shown.map(node => {
        const pos = positions[node.id];
        return <g key={node.id} transform={`translate(${pos.x - 88},${pos.y - 27})`}>
        <rect width="176" height="58" rx="13" fill={node.type === 'observation' ? '#eef5ff' : node.type === 'cue' ? '#fff4dc' : '#eff6ed'} stroke="#ccdad0" />
        <text x="12" y="20" fontSize="10" fill="#687c71">{t(node.type)}</text>
        <text x="12" y="41" fontSize="12" fill="#163d38">{title(node, t).slice(0, 24)}</text><title>{title(node, t)}</title>
      </g>;
      })}
    </svg>
    {graph.nodes.length > shown.length && <p>{t("Showing")} {shown.length} {t("of the returned")} {graph.nodes.length} {t("nodes. Inspect all returned records below.")}</p>}
  </div>;
}
export default function KnowledgeGraph() {
  const {
    t,
    locale
  } = useLocale();
  const router = useRouter();
  const {
    loading: authLoading,
    isAuthenticated,
    user
  } = useAuth();
  const role = user?.workspace_role;
  const [learners, setLearners] = useState([]);
  const [selected, setSelected] = useState('');
  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const learner = learners.find(item => item.id === selected);
  useEffect(() => {
    if (!router.isReady || authLoading || !isAuthenticated) return;
    const controller = new AbortController();
    (async () => {
      const roster = await portalApi(role === 'clinician' ? '/clinical/learners' : '/learners', {
        signal: controller.signal
      });
      setLearners(roster);
      const requested = typeof router.query.learner === 'string' ? router.query.learner : '';
      setSelected(roster.some(item => item.id === requested) ? requested : roster[0]?.id || '');
    })().catch(err => {
      if (err.name !== 'AbortError') setError(err.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [router.isReady, router.query.learner, authLoading, isAuthenticated, role]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setGraph(null);
    setError('');
    portalApi(`/knowledge-graph/learners/${selected}`, {
      signal: controller.signal
    }).then(setGraph).catch(err => {
      if (err.name !== 'AbortError') setError(err.message);
    });
    return () => controller.abort();
  }, [selected]);
  async function save(event, kind) {
    event.preventDefault();
    const form = event.currentTarget,
      fields = new FormData(form);
    setBusy(true);
    setError('');
    setMessage('');
    const payload = {
      sound: fields.get('sound'),
      language: fields.get('language'),
      ...(kind === 'observations' ? {
        attempt_id: crypto.randomUUID(),
        outcome: fields.get('outcome'),
        context: fields.get('context'),
        notes: fields.get('notes')
      } : {
        label: fields.get('label'),
        instruction: fields.get('instruction')
      })
    };
    try {
      await portalApi(`/knowledge-graph/learners/${selected}/${kind}`, {
        method: 'POST',
        body: payload
      });
      setMessage('Saved to Memgraph with your reviewer identity.');
      form.reset();
      setGraph(await portalApi(`/knowledge-graph/learners/${selected}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return <ProtectedRoute><Head><title>{t("Speech Knowledge Graph \xB7 Speation")}</title></Head><Navbar />
    <main className={styles.main}>
      <header className={styles.hero}><p className={styles.eyebrow}>{t("EVIDENCE WITH CONNECTIONS")}</p>
        <h1>{t("Understand the path of practice.")}</h1><p>{t("Explore recorded observations, speech targets, and clinician-authored cues. Each record retains its source.")}</p>
      </header>
      <div className={styles.switches}>{role === 'clinician' ? <a href={`/clinician${selected ? '?patient='+encodeURIComponent(selected) : ''}`}>{t("Patient dashboard")}</a> : <a href="/family">{t("Family hub")}</a>}</div>
      <div aria-live="polite">{loading && <p>{t("Loading your learners\u2026")}</p>}{error && <p role="alert" className={styles.error}>{t(error)}</p>}{message && <p className={styles.success}>{t(message)}</p>}</div>
      {!loading && !learners.length && !error && <section className={styles.panel}><h2>{t("No practice history yet.")}</h2><p>{t("Create a learner profile or ask its owner to assign your clinician account. No demonstration records are added to your history.")}</p></section>}
      {!!learners.length && <div className={styles.form}><label>{t("Learner")}<select value={selected} onChange={event => {
            setMessage('');
            setSelected(event.target.value);
          }}>
        {learners.map(item => <option key={item.id} value={item.id}>{item.display_name} · {t(LANGUAGES[item.language])}</option>)}
      </select></label></div>}
      {graph && <section className={styles.panel} style={{
        marginTop: 24
      }}>
        <p className={styles.eyebrow}>{t("MEMGRAPH \xB7 PERSISTED RECORDS")}</p><h2>{learner?.display_name}{t("'s practice graph")}</h2>
        {!graph.nodes.length ? <p>{t("No observations or cues have been recorded yet.")}</p> : <>
          <GraphView graph={graph} />
          <details><summary>{t("Inspect")} {graph.nodes.length} {t("nodes and")} {graph.edges.length} {t("relationships")}</summary>
            <div className={graphStyles.records}>{graph.nodes.map(node => <article key={node.id}>
              <h3>{title(node, t)}</h3><p>{node.notes || node.instruction || t("Speech target connection")}</p>
              {node.source && <small>{t("Source:")} {t(node.source.replaceAll('_', ' '))}</small>}
              {node.review_status && <small>{t("Review:")} {t(node.review_status.replaceAll('_', ' '))}</small>}
              {node.recorded_at && <small>{new Date(node.recorded_at).toLocaleString(locale)}</small>}
              {node.type === 'cue' && node.active === false && <p>{t("Retired")}{node.retirement_reason ? `: ${node.retirement_reason}` : ''}</p>}
              {node.type === 'cue' && node.active !== false && role === 'clinician' && <details><summary>{t("Retire this cue")}{node.goal_id ? t("and its goal") : ''}</summary><form className={styles.form} onSubmit={async event => {
                    event.preventDefault();
                    const reason = new FormData(event.currentTarget).get('reason');
                    setBusy(true);
                    setError('');
                    try {
                      await portalApi(`/knowledge-graph/learners/${selected}/cues/${encodeURIComponent(node.id)}/retire`, {
                        method: 'PATCH',
                        body: {
                          reason
                        }
                      });
                      setGraph(await portalApi(`/knowledge-graph/learners/${selected}`));
                      setMessage('Cue retired; its history remains available.');
                    } catch (err) {
                      setError(err.message);
                    } finally {
                      setBusy(false);
                    }
                  }}><label>{t("Reason for retirement")}<textarea name="reason" maxLength={800} required /></label><button disabled={busy}>{t("Retire reviewed cue")}</button></form></details>}
            </article>)}</div>
            <pre className={graphStyles.raw}>{JSON.stringify(graph.edges, null, 2)}</pre>
          </details>
          {graph.truncated && <p>{t("The returned graph reached its display limit.")}</p>}
        </>}
      </section>}
      {selected && role === 'clinician' && <div className={styles.layout} style={{
        marginTop: 24
      }}>
        <section className={styles.panel}><h2>{t("Record your assessment")}</h2><p>{t("Record an observation you assessed. These are human reviews, separate from automated speech analysis.")}</p>
          <form onSubmit={event => save(event, 'observations')} className={styles.form}>
            <label>{t("Sound or phoneme")}<input name="sound" required maxLength={16} placeholder={t("e.g. p")} /></label>
            <label>{t("Language")}<select name="language" defaultValue={learner?.language}>{Object.entries(LANGUAGES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
            <label>{t("Outcome")}<select name="outcome"><option value="independent">{t("Independent")}</option><option value="supported">{t("With support")}</option><option value="difficulty">{t("Difficulty observed")}</option><option value="uncertain">{t("Uncertain")}</option></select></label>
            <label>{t("Context")}<select name="context">{['sound', 'syllable', 'word', 'sentence', 'conversation', 'listening'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
            <label>{t("Your observation")}<textarea name="notes" required maxLength={1500} /></label>
            <button disabled={busy || !learner?.consent?.practice_allowed}>{t("Save observation")}</button>
          </form>
        </section>
        <section className={styles.panel}><h2>{t("Author a practice cue")}</h2><p>{t("Add individualized guidance for this learner. Your reviewer identity is retained with the cue.")}</p>
          <form onSubmit={event => save(event, 'cues')} className={styles.form}>
            <label>{t("Sound or phoneme")}<input name="sound" required maxLength={16} /></label>
            <label>{t("Language")}<select name="language" defaultValue={learner?.language}>{Object.entries(LANGUAGES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
            <label>{t("Cue title")}<input name="label" required maxLength={100} /></label>
            <label>{t("Instruction")}<textarea name="instruction" required maxLength={1500} /></label>
            <button disabled={busy || !learner?.consent?.practice_allowed}>{t("Save reviewed cue")}</button>
          </form>
        </section>
      </div>}
    </main>
  </ProtectedRoute>;
}
