import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useLocale} from '../context/LocaleContext';
import {privateAudio} from '../lib/portalApi';
import {messageWords} from '../lib/messagePractice';
import styles from '../styles/student-studio.module.css';
import RehearsalRetry from './RehearsalRetry';
import {comparableRehearsal,metricChange} from '../lib/rehearsalComparison';

const ASPECTS={relevance:'Answer relevance',structure:'Answer structure',example:'Concrete examples',slide_coverage:'Slide key points',responding_to_others:'Responding to others',constructive_disagreement:'Constructive disagreement',summary:'Summarising'};
const value=(n,suffix='')=>Number.isFinite(n)?`${n}${suffix}`:'—';

function Replay({id,start,end}){
 const {t}=useLocale(),[url,setUrl]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),controller=useRef(null),currentUrl=useRef('');
 useEffect(()=>()=>{controller.current?.abort();if(currentUrl.current)URL.revokeObjectURL(currentUrl.current);},[]);
 async function load(){controller.current?.abort();controller.current=new AbortController();setBusy(true);setError('');try{
  const blob=await privateAudio(`/recordings/${id}/audio`,{signal:controller.current.signal});if(controller.current.signal.aborted)return;
  const next=URL.createObjectURL(blob);if(currentUrl.current)URL.revokeObjectURL(currentUrl.current);currentUrl.current=next;setUrl(next);
 }catch(err){if(err.name!=='AbortError')setError(t('Recording unavailable or no longer retained.'));}finally{if(!controller.current.signal.aborted)setBusy(false);}}
 return <div>{url?<audio controls src={Number.isFinite(start)?`${url}#t=${start},${end}`:url} style={{maxWidth:'100%'}}/>:<button disabled={busy} onClick={load}>{t(busy?'Loading recording…':'Replay my answer')}</button>}{error&&<p role="status">{error}</p>}</div>;
}

export function AnswerMeasurements({turn}){
 const {t}=useLocale(),m=turn?.metrics;
 if(!m)return null;
 return <div><div className={styles.metrics}>
  <span>{t('Speaking pace')}: {value(m.words_per_minute)} {t('words/min')}</span>
  <span>{t('Longer pauses')}: {value(m.pause_count)}</span>
  <span>{t('Filler tokens in recognized text')}: {m.filler_count}</span>
 </div>{!!m.fillers.length&&<p>{m.fillers.map(f=>`${f.text} × ${f.count}`).join(' · ')}. {t('Try a quiet pause, then say your next idea. You do not need to rush.')}</p>}
 {(m.filler_intervals||[]).map((f,i)=><details key={i}><summary>{t('Hear detected filler')} “{f.text}” · {f.start_seconds.toFixed(1)}s</summary><Replay id={turn.recording_id} start={Math.max(0,f.start_seconds-.3)} end={f.end_seconds+.3}/></details>)}
 {!!m.quality_flags?.length&&<p>{t('Recording quality')}: {m.quality_flags.map(flag=>t(flag==='low_signal'?'Low microphone signal':'Audio clipping')).join(' · ')}</p>}</div>;
}

export default function RehearsalReport({session,sessions=[],onWord,learner,onUpdated,onPracticeBusy}){
 const {t}=useLocale(),report=session.report||{},a=report.analytics,turns=session.content.turns||[];
 const previous=sessions.find(s=>s.id!==session.id&&comparableRehearsal(session,s)&&s.status==='completed'&&s.report?.analytics&&new Date(s.created_at)<new Date(session.created_at));
 const baseline=previous?.report.analytics;
 const aspects=a?.aspects||[];
 const strong=aspects.filter(x=>x.observation==='strength'),improve=aspects.filter(x=>x.observation==='improve');
 return <section aria-label={t('Your detailed rehearsal report')} className={styles.card}>
  <h3>{t('Your detailed rehearsal report')}</h3><h4>{session.content.goal}</h4>
  <section aria-label={t('Your next useful step')} className={styles.card}><h4>{t('What worked → one priority → try it again')}</h4>
   <p><strong>{t('What worked')}: </strong>{report.strengths?.[0]||t('Your saved answers are available to review.')}</p>
   <p><strong>{t('One priority')}: </strong>{improve[0]?.next_step||report.next_practice?.[0]||t('Choose one answer and explain one clear idea with an example.')}</p>
   {improve[0]&&<><blockquote>“{improve[0].evidence}”</blockquote><Replay id={improve[0].recording_id}/></>}
   <p>{t('The measurements below describe this recording. Faster speech or fewer pauses does not automatically mean better communication.')}</p>
  </section>
  {learner&&onUpdated&&<RehearsalRetry learner={learner} session={session} onUpdated={onUpdated} onBusyChange={onPracticeBusy}/>}
  {!!report.retry_comparisons?.length&&<section aria-label={t('Original and retry comparison')}><h4>{t('Same question: before and after practice')}</h4>{report.retry_comparisons.map(pair=><article className={styles.card} key={pair.retry_recording_id}>
   <h4>{session.content.steps[pair.position]?.prompt}</h4><p>{pair.support_used}</p>
   <div className={styles.twoColumns}><section><h5>{t('Original answer')}</h5><p>{turns.find(turn=>turn.recording_id===pair.original_recording_id)?.heard}</p><Replay id={pair.original_recording_id}/></section><section><h5>{t('Fresh retry')}</h5><p>{turns.find(turn=>turn.recording_id===pair.retry_recording_id)?.heard}</p><Replay id={pair.retry_recording_id}/></section></div>
   {pair.after_feedback?<><p><strong>{t('Evidence-based observation')}: </strong>{pair.after_feedback.strength}</p>{pair.after_feedback.aspects?.map((aspect,i)=><blockquote key={i}>“{aspect.evidence}” — {aspect.next_step}</blockquote>)}<p>{pair.after_feedback.suggestion}</p></>:<p>{t('Coaching is pending or unavailable. Both attempts remain available.')}</p>}
   <div style={{overflowX:'auto'}}><table><caption>{t('Measured changes, not an improvement grade')}</caption><thead><tr><th>{t('Measure')}</th><th>{t('Original')}</th><th>{t('Retry')}</th><th>{t('Change')}</th></tr></thead><tbody>{[['words_per_minute','Words/min'],['pause_count','Longer pauses'],['filler_count','Filler tokens in transcript']].map(([key,label])=>{const change=metricChange(pair.before?.[key],pair.after?.[key]);return <tr key={key}><th>{t(label)}</th><td>{value(pair.before?.[key])}</td><td>{value(pair.after?.[key])}</td><td>{change===null?'—':`${change>0?'+':''}${change}`}</td></tr>;})}</tbody></table></div>
   <p>{t(pair.sound_check?.state==='queued'||pair.sound_check?.state==='processing'?'Retry sound review is still running.':'Review the retry’s separate sound observations before drawing conclusions about pronunciation.')}</p>
   <p><strong>{t('Retry sound review')}: </strong>{t({needs_confirmation:'Possible differences need your confirmation',no_clear_difference:'No clear difference detected; this is not a perfect-pronunciation verdict',insufficient_evidence:'Not enough evidence to judge',unavailable:'Audio review unavailable',disabled:'Audio review was not enabled',queued:'Queued',processing:'Processing'}[pair.sound_check?.state]||'Not assessed')}</p>
   {(pair.sound_check?.concerns||[]).map(item=><article key={item.word}><strong>{item.word}</strong><p>{item.observation}</p><p>{item.practice_tip}</p><Replay id={pair.retry_recording_id} start={item.start_seconds} end={item.end_seconds}/></article>)}
  </article>)}</section>}
  {report.sound_review&&<section aria-label={t('Sound review from your recordings')}>
   <h4>{t('Sound review from your recordings')}</h4>
   <p>{t('These suggestions come from your audio, separately from the transcript. Confirm the intended word before practising. They are tentative observations, not a pronunciation grade.')}</p>
   {!!report.sound_review.pending&&<p role="status">{t('Checking sounds in the background…')} {report.sound_review.pending} {t('answers remaining. You can leave this page and return later.')}</p>}
   {!!report.sound_review.unavailable&&<p>{report.sound_review.unavailable} {t('answers could not be checked. Your communication feedback is still available.')}</p>}
   {(report.sound_review.concerns||[]).map(item=><article className={styles.card} key={item.word.toLocaleLowerCase()}>
    <h4>{t('Did you mean')} “{item.word}”?</h4><p>{item.observation}</p>
    {item.expected_phone&&item.produced_phone&&<p>{t('Possible sound difference')}: /{item.produced_phone}/ → /{item.expected_phone}/</p>}
    <p>{item.practice_tip}</p><small>{item.uncertainty}</small>
    <Replay id={item.recording_id} start={item.start_seconds} end={item.end_seconds}/>
    <button onClick={()=>onWord?.(item.word,`Confirmed practice target from my rehearsal: ${item.word}`,session.language)}>{t('Yes, practise this word')}</button>
   </article>)}
   {!report.sound_review.pending&&!report.sound_review.concerns?.length&&!!report.sound_review.reviewed&&<p>{t('No supported sound target was identified. This does not mean every sound was assessed as correct.')}</p>}
  </section>}
  {!!report.feedback_pending&&<p role="status">{t('Your report includes the answers saved so far. Maya is finishing coaching for')} {report.feedback_pending} {t('answers. The report will update automatically.')}</p>}
  <p>{t('Your next step')}: {report.next_practice?.[0]||t('Review one answer and choose one thing to practise.')}</p>
  <div className={styles.twoColumns}><section><h4>{t('Your strengths')}</h4>{report.strengths?.length?report.strengths.map((x,i)=><p key={i}>{x}</p>):<p>{t('No feedback available yet.')}</p>}
   {strong.map((x,i)=><blockquote key={i}><strong>{t(ASPECTS[x.aspect])}</strong><p>“{x.evidence}”</p><p>{x.next_step}</p></blockquote>)}</section>
   <section><h4>{t('Areas to work on')}</h4>{report.next_practice?.map((x,i)=><p key={i}>{x}</p>)}
   {improve.map((x,i)=><blockquote key={i}><strong>{t(ASPECTS[x.aspect])}</strong><p>“{x.evidence}”</p><p>{x.next_step}</p></blockquote>)}</section></div>
  {!a?<p>{t('Detailed measurements were not collected for this older session. Start a new rehearsal to collect them.')}</p>:<>
   <h4>{t('Pace, pauses and fillers')}</h4><div className={styles.metrics}>
    <span>{t('Speaking pace')}: {value(a.words_per_minute)} {t('words/min')}</span>
    <span>{t('Speech-only pace')}: {value(a.speech_only_words_per_minute)} {t('words/min')}</span>
    <span>{t('Recorded speaking turns')}: {value(a.recorded_seconds,' s')}</span>
    <span>{t('Recognized words')}: {a.word_count}</span>
    <span>{t('Longer pauses')}: {value(a.pause_count)}</span>
    <span>{t('Total pause time')}: {value(a.pause_seconds,' s')}</span>
    <span>{t('Longest pause')}: {value(a.longest_pause_seconds,' s')}</span>
    <span>{t('Detected fillers')}: {a.filler_count}</span>
    <span>{t('Fillers per 100 words')}: {value(a.fillers_per_100_words)}</span>
    <span>{t('Adjacent repeated words')}: {a.repeated_start_count}</span>
   </div>
   <p>{t('Pause timing available for')} {a.pause_coverage_answers} / {a.total_answers} {t('answers')}. {t('A dash means unavailable, not zero.')}</p>
   {!!a.fillers.length?<><p>{a.fillers.map(x=>`${x.text} × ${x.count}`).join(' · ')}</p><p>{t('Try a quiet pause, then say your next idea. You do not need to rush.')}</p></>:<p>{t('No fillers were detected in the transcript. Recognition may omit them.')}</p>}
   {!!a.repeated_starts.length&&<p>{t('Adjacent repeated words')}: {a.repeated_starts.map(x=>`${x.text} × ${x.count}`).join(' · ')}. {t('Repetition may be intentional. Replay before choosing a practice goal.')}</p>}
   <h4>{t('Participation and coverage')}</h4><div className={styles.metrics}>
    <span>{t('Contributions')}: {a.participation.learner_contributions}</span><span>{t('Questions answered')}: {a.participation.questions_answered}</span>
    {session.scenario==='presentation'&&<span>{t('Slides explained')}: {a.participation.slides_explained}</span>}
    <span>{t('Retries')}: {report.retries}</span><span>{t('Support phrases used')}: {report.repair_uses}</span>
   </div>
   <details><summary>{t('Time per slide and question')}</summary><div style={{overflowX:'auto'}}><table><thead><tr><th>{t('Slide or question')}</th><th>{t('Answers')}</th><th>{t('Recorded seconds')}</th></tr></thead><tbody>{a.per_step.map(s=><tr key={s.position}><td>{s.prompt}{s.follow_up?` · ${t('Follow-up')}`:''}</td><td>{s.answers}</td><td>{s.recorded_seconds}</td></tr>)}</tbody></table></div></details>
   <h4>{t('Compared with a similar rehearsal')}</h4>{baseline?<><p>{t('Same goal, material and support settings. Questions may differ. Previous rehearsal')}: {new Date(previous.created_at).toLocaleDateString()}</p><div className={styles.metrics}><span>{t('Speaking pace')}: {value(baseline.words_per_minute)} → {value(a.words_per_minute)}</span><span>{t('Fillers per 100 words')}: {value(baseline.fillers_per_100_words)} → {value(a.fillers_per_100_words)}</span><span>{t('Longest pause')}: {value(baseline.longest_pause_seconds,' s')} → {value(a.longest_pause_seconds,' s')}</span></div></>:<p>{t('No comparable previous rehearsal with this goal, material and support was found. Use the same-question retry above for a direct comparison.')}</p>}
   <p>{t('Faster speech or fewer pauses is not automatically better. Choose a comfortable pace and communicate your meaning.')}</p>
  </>}
  <h4>{t('Review and practise your answers')}</h4>{turns.map((turn,index)=><details key={turn.recording_id}><summary>{t('Answer')} {index+1} · {session.content.steps[turn.position]?.prompt}</summary><p lang={session.language}>{turn.heard}</p><AnswerMeasurements turn={turn}/><Replay id={turn.recording_id}/>{turn.feedback?<><p><strong>{t('Strength')}: </strong>{turn.feedback.strength}</p><p><strong>{t('Next step')}: </strong>{turn.feedback.suggestion}</p><p><strong>{t('Example answer')}: </strong>{turn.feedback.example}</p></>:<p>{t(turn.feedback_error||'No feedback available yet.')}</p>}
   <Link href={{pathname:'/speech-translator',query:{recording:turn.recording_id}}}>{t('Check sounds in this recording')}</Link>
   <p>{t('Choose a word to hear and practise. A transcript alone does not establish a pronunciation error.')}</p><div className={styles.metrics}>{messageWords(turn.heard).filter(w=>w.length>1&&!turn.metrics?.fillers.some(f=>f.text===w.toLocaleLowerCase())).slice(0,40).map(word=><button key={word} onClick={()=>onWord?.(word,turn.heard,session.language)}>{word}</button>)}</div>
   {!!turn.metrics?.pauses.length&&<p>{t('Longer pause intervals')}: {turn.metrics.pauses.map(p=>`${p.start_seconds}–${p.end_seconds} s`).join(' · ')}</p>}
  </details>)}
  <p>{t('Self-reported effort')}: {report.effort_before??'—'} → {report.effort_after??'—'}</p>{report.reflection&&<p>{report.reflection}</p>}
  <details><summary>{t('How these observations are calculated')}</summary>{a?.limitations.map((line,i)=><p key={i}>{t(line)}</p>)}<p>{t('Content feedback uses your transcript and reviewed material. Sound feedback uses a separate audio check. No diagnosis or confidence score is inferred.')}</p></details>
 </section>;
}
