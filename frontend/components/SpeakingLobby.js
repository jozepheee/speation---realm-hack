import {useLocale} from '../context/LocaleContext';
import styles from '../styles/student-studio.module.css';
import RehearsalPreferences from './RehearsalPreferences';

export default function SpeakingLobby({scenario,onScenario,goal,onGoal,material,materials,materialId,onMaterial,
 soundChecks,onSoundChecks,audioRetained,fileInput,onUpload,useResume,onUseResume,allowCloud,onAllowCloud,cloudAllowed,busy,blocked,onStart,review,preferences,onPreferences}){
 const {t}=useLocale(),interview=scenario==='interview',presentation=scenario==='presentation',profile=material?.resume_profile;
 const usesMaterial=presentation||(interview&&useResume),needsParse=interview&&usesMaterial&&!profile;
 const disabled=blocked||!cloudAllowed||!allowCloud||(!interview&&!presentation&&!goal.trim())||(usesMaterial&&!material);
 const roles={interview:'Maya · Interviewer',discussion:'Maya + 3 AI candidates',presentation:'Maya + AI audience'};
 return <section className={styles.lobby} aria-label={t('Meeting lobby')}>
  <div className={styles.activityChoices} role="group" aria-label={t('Choose your activity')}>
   {[[ 'interview','Mock interview','A one-to-one interview with Maya.' ],['discussion','Group discussion','Exchange ideas with three AI candidates.'],['presentation','Presentation','Present your slides and answer audience questions.']].map(([id,title,description])=><button type="button" key={id} disabled={blocked} aria-pressed={scenario===id} onClick={()=>onScenario(id)}><strong>{t(title)}</strong><span>{t(description)}</span></button>)}
  </div>
  <div className={styles.lobbyGrid}>
   <section className={styles.lobbyPreview}>
    <span className={styles.lobbyBadge}>{t('ENGLISH · PRIVATE PRACTICE')}</span>
    <div className={styles.lobbyPortrait} role="img" aria-label={t('Maya, your AI practice partner')}/>
    <h3>{t(roles[scenario])}</h3><p>{t(interview?'Questions, follow-ups and a report with practical next steps.':presentation?'Your slides on the main stage, with audience questions afterward.':'Three rounds: your view, a response to others, and common ground.')}</p>
    {scenario==='discussion'&&<div className={styles.candidateBadges}>{['Asha','Rohan','Neha'].map((name,index)=><span key={name}><i style={{backgroundPosition:['100% 0%','0% 100%','100% 100%'][index]}}/>{name}</span>)}</div>}
    <small>{t(interview?'Maya opens the microphone after each question. You can turn automatic microphone off in the meeting.':'Your microphone turns on only when you choose to record.')}</small>
   </section>
   <form className={styles.lobbyForm} onSubmit={onStart}>
    <h3>{t(interview?'Get ready for your interview':presentation?'Get ready to present':'Join the discussion')}</h3>
    <label>{t(interview?'Role or interview goal':presentation?'What is your presentation about?':'Discussion topic')}<textarea rows="2" value={goal} disabled={blocked} maxLength={1000} required={scenario==='discussion'} onChange={event=>onGoal(event.target.value)} placeholder={t(interview?'For example: a software engineering internship':presentation?'Optional: Maya can use your slide titles.':'For example: Should AI tools be allowed in classrooms?')}/></label>
    {scenario==='discussion'&&<div className={styles.chips}>{['Should AI tools be allowed in classrooms?','Remote work or office work?','How can colleges become more inclusive?'].map(topic=><button type="button" key={topic} disabled={blocked} onClick={()=>onGoal(topic)}>{t(topic)}</button>)}</div>}
    {scenario!=='discussion'&&<div className={styles.lobbyDocument}>
     <div className={styles.row}><strong>{t(interview?'Résumé · optional':'Your slides')}</strong>{interview&&material&&useResume&&<button type="button" disabled={blocked} onClick={()=>onUseResume(false)}>{t('Continue without résumé')}</button>}</div>
     <label>{t(interview?'Upload résumé':'Upload slides')}<input ref={fileInput} type="file" accept=".pdf,.pptx" disabled={blocked} onChange={event=>onUpload(event.target.files?.[0])}/></label>
     {!!materials.length&&<label>{t('Or choose a saved file')}<select value={materialId} disabled={blocked} onChange={event=>onMaterial(event.target.value)}><option value="">{t('No file selected')}</option>{materials.map(doc=><option key={doc.id} value={doc.id}>{doc.title}</option>)}</select></label>}
     {material&&<p className={styles.fileReady}><strong>{material.title}</strong> · {material.section_count} {t('pages / slides')}</p>}
     {interview&&material&&!useResume&&<button type="button" disabled={blocked} onClick={()=>onUseResume(true)}>{t('Use this résumé')}</button>}
     <small>{t(interview?'Maya extracts your skills, projects, experience and education. Without a résumé, she uses your role and goal.':'PDF or PPTX, up to 15 MB. Slides are displayed in your meeting.')}</small>
    </div>}
    {interview&&useResume&&profile&&<section className={styles.profileSummary} aria-label={t('Your résumé profile')}>
     <h4>{t('What Maya found in your résumé')}</h4><p>{profile.summary}</p>
     {!!profile.skills.length&&<><h4>{t('Skills')}</h4><div className={styles.chips}>{profile.skills.map(item=><span key={item.label}>{item.label}</span>)}</div></>}
     {!!profile.projects.length&&<><h4>{t('Projects')}</h4>{profile.projects.map(item=><article key={item.label}><strong>{item.label}</strong><p>{item.detail}</p></article>)}</>}
     {[[ 'experience','Experience' ],['education','Education'],['achievements','Achievements']].map(([key,label])=>!!profile[key].length&&<div key={key}><h4>{t(label)}</h4>{profile[key].map(item=><p key={item.label}><strong>{item.label}</strong>{item.detail?` · ${item.detail}`:''}</p>)}</div>)}
     <details><summary>{t('See résumé evidence')}</summary>{['skills','projects','experience','education','achievements'].flatMap(key=>profile[key].map(item=><blockquote key={`${key}:${item.label}`}><strong>{item.label} · {t('Page')} {item.page}</strong><p>“{item.evidence}”</p></blockquote>))}</details>
     <p>{t('Starting confirms that this profile reflects your résumé. You can correct the document below first.')}</p>
    </section>}
    {preferences&&<RehearsalPreferences value={preferences} onChange={onPreferences} scenario={scenario} disabled={blocked}/>}
    <label className={styles.check}><input type="checkbox" checked={allowCloud} disabled={blocked||!cloudAllowed} onChange={event=>onAllowCloud(event.target.checked)}/>{t('Let Maya use AI to read my selected material and coach my answers.')}</label>
    {!cloudAllowed&&<p role="status">{t('Enable cloud processing in your learner permissions to practise with Maya.')}</p>}
    <button className={styles.joinButton} disabled={disabled}>{t(busy?'Preparing…':needsParse?'Read my résumé':interview?'Start interview':presentation?'Start presentation':'Join group discussion')}</button>
    <label className={styles.check}><input type="checkbox" checked={!!soundChecks&&!!audioRetained} disabled={blocked||!cloudAllowed||!audioRetained} onChange={event=>onSoundChecks(event.target.checked)}/>{t('Review my recorded audio for possible sound differences in the background and include suggestions in my report.')}</label>
    {!audioRetained&&<small>{t('Sound review requires recording retention permission in learner settings.')}</small>}
    {!allowCloud&&cloudAllowed&&<small>{t('Choose the AI permission above to continue.')}</small>}
    {needsParse&&<small>{t('You will see the extracted profile before starting your interview.')}</small>}
    {material&&scenario!=='discussion'&&<details className={styles.documentReview}><summary>{t('Review or correct document text')}</summary>{review}</details>}
   </form>
  </div>
 </section>;
}
