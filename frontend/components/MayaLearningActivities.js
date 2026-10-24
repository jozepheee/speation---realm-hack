import MeaningConfirmation from './MeaningConfirmation';
import Wordy from './Wordy';
import {useEffect,useRef,useState} from 'react';
import {useAuth} from '../context/AuthContext';
import {portalApi} from '../lib/portalApi';
import {saveLearningEvent,startLearningSession} from '../lib/learningSessionClient';
import {pronunciationResult} from '../lib/pronunciationResult';
import PronunciationResult from './PronunciationResult';
import ArticulationCoach from './ArticulationCoach';
import {supportedContrast} from '../lib/supportedContrast';
import {childSpeechPractice} from '../lib/childSpeechPractice';
import StoryScene from './StoryScene';
import RecordingStudio from './RecordingStudio';
import CompanionMessageLesson from './CompanionMessageLesson';
import MayaScheduledChecks from './MayaScheduledChecks';
import {speechExampleCache} from '../lib/speechExampleCache';
import {offlineStoryPackage} from '../lib/offlineStoryPackage';
import {learningStoryRevision,storyNeedsRefresh} from '../lib/learningStoryRevision';
import {boundedOperation} from '../lib/boundedOperation';
import styles from '../styles/maya-learning.module.css';

export default function MayaLearningActivities({conversationRevision='',activityChoice,onActivityChange,hideNavigation=false,immersiveMessage=false,onMirrorHost,assessment,learner,goals=[],suggestedTarget,onHear,onTeachingSpeech,onStopSpeech,onFeedback,onChooseTarget,onBusyChange,onBeforeRecord,onCompare}){
 const {user}=useAuth(),scope=`${user?.id}:${learner.id}`,storageKey=`speation:adventure:${scope}:${learner.language}`;
 const [activity,setActivity]=useState('message'),[target,setTarget]=useState(suggestedTarget||''),[interest,setInterest]=useState('');
 const [messageBusy,setMessageBusy]=useState(false),[checkBusy,setCheckBusy]=useState(false),[checkActive,setCheckActive]=useState(false);
 const [story,setStory]=useState(null),[storySession,setStorySession]=useState(null),[step,setStep]=useState(0),[attempt,setAttempt]=useState(null),[storyFeedback,setStoryFeedback]=useState(null),[storyTurn,setStoryTurn]=useState(0),[done,setDone]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[recording,setRecording]=useState(false),[notice,setNotice]=useState(''),[filmPlaying,setFilmPlaying]=useState(false);
 const [personalPlan,setPersonalPlan]=useState(null),[planError,setPlanError]=useState(''),[planRevision,setPlanRevision]=useState(0);
 const [planLoading,setPlanLoading]=useState(true);
 const autoStoryKey=useRef('');
 const lastTargetPlan=useRef('');
 const ml=learner.language==='ml',say=(en,mal)=>ml?mal:en;
 const request=useRef(null),version=useRef(0);
 const generationTimer=useRef(null);
 useEffect(()=>{if(activityChoice&&['message','story','wordy'].includes(activityChoice)){onStopSpeech?.();setActivity(activityChoice);setError('');}},[activityChoice]);
 useEffect(()=>{if(suggestedTarget&&!target)setTarget(suggestedTarget);},[suggestedTarget]);
 const planBusy=useRef(false);planBusy.current=busy||recording||messageBusy||checkBusy||checkActive||filmPlaying;
 const personalTarget=personalPlan?.targets?.find(item=>item.word.toLocaleLowerCase()===target.trim().toLocaleLowerCase()&&!item.requires_confirmation);
 useEffect(()=>{const controller=new AbortController();let timer,failures=0;setPlanError('');
  async function load(){setPlanLoading(true);try{const value=await portalApi(`/learners/${learner.id}/personal-learning-plan?language=${learner.language}`,{signal:controller.signal});
   if(controller.signal.aborted)return;setPersonalPlan(value);const usable=value.targets.filter(item=>!item.requires_confirmation);
   failures=0;setPlanError('');
   if(usable.length&&!planBusy.current){
    const freshKey=learner.language+':'+usable.filter(item=>item.intent_confirmed_recording_ids?.length).map(item=>item.word+':'+item.intent_confirmed_recording_ids.join(',')).join('|');
    const fresh=usable.find(item=>item.intent_confirmed_recording_ids?.length);
    if(fresh&&freshKey!==lastTargetPlan.current)setTarget(fresh.word);
    else setTarget(previous=>usable.some(item=>item.word.toLocaleLowerCase()===previous.trim().toLocaleLowerCase())?previous:usable[0].word);
    lastTargetPlan.current=freshKey;
   }
   timer=setTimeout(load,value.pending_observations?5000:15000);
  }catch(err){if(!controller.signal.aborted){setPlanError((ml?'പരിശീലന വാക്കുകൾ എടുക്കാനായില്ല. വീണ്ടും ശ്രമിക്കുന്നു. ':'Your saved practice words could not load. Retrying. ')+err.message);timer=setTimeout(load,Math.min(30000,5000*++failures));}}
  finally{if(!controller.signal.aborted)setPlanLoading(false);}}
  void load();return()=>{controller.abort();clearTimeout(timer);};
 },[learner.id,learner.language,activityChoice,planRevision,conversationRevision]);
 useEffect(()=>{if(story&&target&&story.target.toLocaleLowerCase()!==target.trim().toLocaleLowerCase()&&!planBusy.current){setStory(null);setStorySession(null);setDone(false);setStep(0);}},[target]);
 useEffect(()=>{
  if(activity!=='story'||!personalPlan||planBusy.current)return;
  const recent=personalPlan.targets.find(item=>!item.requires_confirmation);
  if(storyNeedsRefresh(story,personalPlan)){
   autoStoryKey.current='';setStory(null);setStorySession(null);setDone(false);setStep(0);setAttempt(null);setStoryFeedback(null);
   if(recent)setTarget(recent.word);
  }
 },[activity,personalPlan,story,busy,recording,messageBusy,checkBusy,checkActive,filmPlaying]);
 function selectPersonal(item){onStopSpeech?.();setTarget(item.word);if(story&&story.target.toLocaleLowerCase()!==item.word.toLocaleLowerCase()){setStory(null);setStorySession(null);setDone(false);}setError('');}
 function syncStory(value){setStorySession(value);setStep(Math.min(2,value.position));setDone(['completed','finished'].includes(value.status));}
 useEffect(()=>{
  const current=++version.current;
  setBusy(false);autoStoryKey.current='';
  try{const value=JSON.parse(localStorage.getItem(storageKey)||'null');
   if(value?.story?.scenes?.length===3){setStory({...value.story,session_id:value.session_id});setTarget(value.story.target);setStep(value.session_id?(value.step||0):0);setDone(!!value.done);
    if(value.session_id)portalApi(`/learning-sessions/${value.session_id}`).then(result=>{if(current===version.current)syncStory(result);}).catch(()=>{if(current===version.current)setNotice('Saved activity is available here. Reconnect to sync progress; no offline assessment is made.');});
   }
  }catch{}
  return()=>{version.current++;clearTimeout(generationTimer.current);request.current?.abort();onStopSpeech?.();};
 },[storageKey]);
 useEffect(()=>{if(story)try{localStorage.setItem(storageKey,JSON.stringify({story,step,done,session_id:storySession?.id||story.session_id}));}catch{}},[story,step,done,storySession?.id,storageKey]);
 useEffect(()=>{onBusyChange?.(busy||recording||messageBusy||checkBusy||checkActive||filmPlaying);return()=>onBusyChange?.(false);},[busy,recording,messageBusy,checkBusy,checkActive,filmPlaying]);
 function choose(next){if(busy||recording||messageBusy)return;onStopSpeech?.();setActivity(next);onActivityChange?.(next);setError('');setNotice('');}
 async function createStorySession(value){return startLearningSession(scope,{kind:'story',target:value.target,language:learner.language,personalized:!!value.personal_target,practice_words:value.practice_words||[value.target],story:{title:value.title,scenes:value.scenes}});}
 async function downloadStory(){
  setError('');setBusy(true);
  try{const examples={};let size=0;for(const scene of story.scenes){const saved=await speechExampleCache(scope,scene.sentence,learner.language).catch(()=>null);const audio=saved?.audio_base64;if(typeof audio==='string'&&/^[A-Za-z0-9+/=\r\n]+$/.test(audio)&&size+audio.length<15000000){examples[scene.sentence]=audio;size+=audio.length;}}
   const url=URL.createObjectURL(new Blob([offlineStoryPackage(story,examples)],{type:'text/html;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='speation-offline-story.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('Offline story downloaded. It includes saved voice examples where available and does not record or grade speech.');
  }catch(err){setError(err.message);}finally{setBusy(false);}
 }
 async function generate(){
  onStopSpeech?.();setBusy(true);setError('');const current=++version.current;request.current?.abort();request.current=new AbortController();
  // Include authentication/session lookup in the deadline, not just fetch.
  clearTimeout(generationTimer.current);
  generationTimer.current=setTimeout(()=>{if(current!==version.current)return;version.current++;request.current?.abort();setBusy(false);setError(say('Story preparation took too long. Try again; your practice words are saved.','കഥ തയ്യാറാക്കാൻ കൂടുതൽ സമയം എടുത്തു. വീണ്ടും ശ്രമിക്കാം; നിങ്ങളുടെ വാക്കുകൾ സൂക്ഷിച്ചിട്ടുണ്ട്.'));},60000);
  try{const value=await portalApi(`/learners/${learner.id}/learning-adventure`,{method:'POST',body:{target:target.trim(),interest:interest.trim()||(learner.age>=16?'A useful everyday situation':ml?'ഒരു സ്കൂൾ ദിനത്തിലെ ചെറിയ സാഹസം':'A little adventure on a school day'),language:learner.language,personalized:!!personalTarget},signal:request.current.signal,timeoutMs:90000});
   value.plan_revision=value.plan_revision||learningStoryRevision(personalPlan);
   if(current!==version.current)return;setPersonalPlan(previous=>previous?{...previous,revision:value.plan_revision}:previous);setStory(value);setStep(0);setAttempt(null);setStoryFeedback(null);setDone(false);setStorySession(null);
   const saved=await createStorySession(value);if(current!==version.current)return;syncStory(saved);
  }catch(err){if(current===version.current&&err.name!=='AbortError')setError(err.message);}finally{if(current===version.current){clearTimeout(generationTimer.current);setBusy(false);}}
 }
 function cancelStoryPreparation(){version.current++;clearTimeout(generationTimer.current);request.current?.abort();setBusy(false);setError(say('Story preparation stopped. You can retry or choose another activity.','കഥ തയ്യാറാക്കുന്നത് നിർത്തി. വീണ്ടും ശ്രമിക്കാം അല്ലെങ്കിൽ മറ്റൊരു പരിശീലനം തിരഞ്ഞെടുക്കാം.'));}
 async function storyEvent(action,record=attempt){
  onStopSpeech?.();setBusy(true);setError('');const current=version.current;
  try{const session=storySession||await createStorySession(story);
   const saved=await saveLearningEvent(scope,session,{action,index:step,...(action==='scene'?{recording_id:record.id}:{})});
   if(current!==version.current)return;syncStory(saved);setAttempt(null);setStoryFeedback(null);
   if(saved.status==='paused')setNotice('Your place is saved. Resume when you are ready.');
  }catch(err){if(current===version.current)setError(`Your recording is kept. Retry saving this step: ${err.message}`);}finally{if(current===version.current)setBusy(false);}
 }
 useEffect(()=>{
  if(activity!=='story'||!personalPlan||personalPlan.pending_observations||!personalTarget||story&&!done||busy||recording||messageBusy||checkBusy||checkActive||filmPlaying)return;
  const key=learningStoryRevision(personalPlan)+':'+personalTarget.word;
  if(autoStoryKey.current===key)return;autoStoryKey.current=key;void generate();
 },[activity,personalPlan,target,story,done,busy,recording,messageBusy,checkBusy,checkActive,filmPlaying]);
 const scene=story?.scenes[step],storyConcern=pronunciationResult(storyFeedback,story?.scenes[step]?.sentence).concerns[0];
 return <section lang={learner.language} translate="no" className={`${styles.panel} ${immersiveMessage&&activity==='message'?styles.messageOverlay:''}`} aria-label="Learn with Maya activities">{!immersiveMessage&&activity==='message'&&<header className={styles.welcome}><span>YOUR LEARNING WORLD</span><h2>Let’s make something happen.</h2><p>Choose an adventure. Maya will help you along the way.</p></header>}


 {!hideNavigation&&<nav aria-label="Learning activities">{[['message','My message'],['story','Story adventure'],['wordy','Wordy']].map(([id,label])=><button key={id} aria-pressed={activity===id} disabled={busy||recording||messageBusy||checkBusy||checkActive} onClick={()=>choose(id)}>{label}</button>)}</nav>} {!immersiveMessage&&activity==='message'&&!busy&&!recording&&!messageBusy&&<MayaScheduledChecks learner={learner} goals={goals} onBeforeRecord={onBeforeRecord} onStopSpeech={onStopSpeech} onBusyChange={setCheckBusy} onActiveChange={setCheckActive}/>}
 {personalPlan?.targets?.some(item=>!item.requires_confirmation)&&<section aria-label="Your personal practice targets" className={styles.welcome}><small>{say('YOUR PERSONAL PRACTICE','നിങ്ങളുടെ പരിശീലനം')}</small><h3>{learner.language==='ml'?'നിങ്ങളുടെ വാക്കുകൾ പരിശീലിക്കാം':'Words from your messages and practice goals'}</h3><p>{say('These words guide your story and practice.','ഈ വാക്കുകൾ ചേർത്താണ് കഥയും പരിശീലനവും ഒരുക്കുന്നത്.')}</p><div>{personalPlan.targets.filter(item=>!item.requires_confirmation).map(item=><button key={item.word} disabled={busy||recording||messageBusy||checkBusy||checkActive||filmPlaying} aria-pressed={personalTarget?.word===item.word} onClick={()=>selectPersonal(item)}>{item.word}</button>)}</div></section>}
 {!!personalPlan?.pending_observations&&<p role="status">{say('Checking recent conversation recordings…','അടുത്തിടെ പറഞ്ഞ വാക്കുകൾ പരിശോധിക്കുന്നു…')}</p>}
 {personalPlan?.meaning_confirmations?.slice(0,1).map(item=><MeaningConfirmation key={item.id} learner={learner} item={item} onHear={onHear} onBeforeRecord={onBeforeRecord} onBusyChange={setMessageBusy} onResolved={()=>setPlanRevision(value=>value+1)}/>)}
 {planError&&<div role="alert"><p>{planError}</p><button onClick={()=>setPlanRevision(value=>value+1)}>{say('Retry saved words','വീണ്ടും ശ്രമിക്കാം')}</button></div>}
 <fieldset disabled={checkActive} style={{border:0,padding:0,margin:0,minWidth:0}}>
 {activity==='message'&&<CompanionMessageLesson personalTarget={personalTarget} immersive={immersiveMessage} onCompare={onCompare} draftScope={scope} learner={learner} onHear={onHear} onStopSpeech={onStopSpeech} onBeforeRecord={onBeforeRecord} onBusyChange={setMessageBusy} onFeedback={onFeedback}/>}
 {activity==='story'&&(!personalPlan?<><h3>{say('Loading your saved practice words','നിങ്ങളുടെ പരിശീലന വാക്കുകൾ എടുക്കുന്നു')}</h3><p role="status">{planLoading?say('Checking the words from your latest Daily conversation…','അവസാന സംഭാഷണത്തിലെ വാക്കുകൾ പരിശോധിക്കുന്നു…'):say('Your saved words have not loaded yet. Use Retry saved words above; you do not need to record the conversation again.','സൂക്ഷിച്ച വാക്കുകൾ എടുക്കാനായില്ല. മുകളിലെ ബട്ടൺ തൊട്ട് വീണ്ടും ശ്രമിക്കാം; സംഭാഷണം വീണ്ടും പറയേണ്ടതില്ല.')}</p></>:<>
 {!story||done?<><h3>{say(done?'Story finished':'Your story is getting ready',done?'കഥ പൂർത്തിയായി':'നിങ്ങളുടെ കഥ തയ്യാറാക്കുന്നു')}</h3>
 {personalTarget?<><p role="status">{busy?say('Creating your animated scenes. This can take up to one minute.','നിങ്ങളുടെ ആനിമേഷൻ രംഗങ്ങൾ ഒരുക്കുന്നു. ഒരു മിനിറ്റ് വരെ എടുത്തേക്കാം.'):error?say('Your story is not ready yet. Your practice words are saved.','കഥ ഇതുവരെ തയ്യാറായിട്ടില്ല. നിങ്ങളുടെ പരിശീലന വാക്കുകൾ സൂക്ഷിച്ചിട്ടുണ്ട്.'):say('Maya is making an animated story with your practice words.','നിങ്ങൾ പരിശീലിക്കേണ്ട വാക്കുകൾ ചേർത്ത് മായ ഒരു കഥ ഒരുക്കുന്നു.')}</p>{busy&&<button onClick={cancelStoryPreparation}>{say('Stop preparing','തയ്യാറാക്കുന്നത് നിർത്താം')}</button>}{error&&<button disabled={busy} onClick={()=>generate()}>{say('Try again','വീണ്ടും ശ്രമിക്കൂ')}</button>}{done&&<button disabled={busy} onClick={()=>{autoStoryKey.current='';setStory(null);setDone(false);}}>{say('Another story','മറ്റൊരു കഥ')}</button>}</>:
 personalPlan?.meaning_confirmations?.length?<p>{say('First, confirm what you wanted to say.','ആദ്യം നിങ്ങൾ ഉദ്ദേശിച്ച സന്ദേശം ഉറപ്പാക്കാം.')}</p>:
 personalPlan?.pending_observations?<p role="status">{say('Checking your latest conversation…','നിങ്ങളുടെ സംഭാഷണം പരിശോധിക്കുന്നു…')}</p>:<><p>{say('Tell Maya one message. Your story will use the words that need supported practice.','മായയോട് ഒരു സന്ദേശം പറയൂ. പരിശീലിക്കേണ്ട വാക്കുകൾ ചേർത്ത് കഥ ഒരുക്കാം.')}</p><button onClick={()=>choose('message')}>{say('Tell Maya something','മായയോട് പറയാം')}</button></>}
 </>:
 <><p>{say('Scene','രംഗം')} {step+1} / 3</p><progress value={step} max={3}/><h3>{story.title}</h3>{story.practice_words?.length>0&&<p>{say('Practice words:','പരിശീലന വാക്കുകൾ:')} {story.practice_words.join(' · ')}</p>}<StoryScene key={`${story.title}:${step}`} scene={scene} title={story.title} index={step} onHear={onHear} onStopSpeech={onStopSpeech} onPlayingChange={setFilmPlaying} disabled={busy||recording}/><p className={styles.line}>{scene.sentence}</p><button disabled={busy||recording||filmPlaying} onClick={()=>onHear(scene.sentence)}>{say('Hear my line','വാക്യം കേൾക്കാം')}</button>
 {storySession?.status==='paused'?<button disabled={busy} onClick={()=>storyEvent('resume')}>Resume story</button>:<RecordingStudio draftScope={scope} key={`${storySession?.id||story.title}:${step}:${storyTurn}`} learner={learner} task="sentence" expectedText={scene.sentence} maxDuration={30} showSendButton disabled={busy||filmPlaying} beforeRecord={async()=>{onStopSpeech?.();await onBeforeRecord?.();}} onBusyChange={setRecording} showFeedback={false} readFeedback={false} onRecorded={async record=>{setAttempt(record);const content=record.coaching?.content;if(record.coaching)onFeedback?.(record.coaching);setError('');setStoryFeedback(content||{state:'insufficient_evidence',concerns:[],summary:record.coaching_error||'No audio assessment is available for this recording.'});try{if(pronunciationResult(content,scene.sentence).noSpecificDifference){await boundedOperation(onHear(ml?'നിങ്ങളുടെ വാക്യം സൂക്ഷിച്ചു. ഈ പരിശോധനയിൽ പ്രത്യേക വ്യത്യാസം കണ്ടെത്തിയില്ല. കഥ തുടരാം.':'Your sentence is saved. No specific difference was flagged. You can continue the story.'),{timeoutMs:15000});return;}if(content?.state==='no_clear_difference'&&!content.concerns?.length){await onHear('That sounded clear! You can continue the story, or try the line again.');return;}if(content){const concern=pronunciationResult(content,scene.sentence).concerns[0],plan=content.teaching_plan?.find(item=>item.word===concern?.word),word=concern?.word||scene.sentence;await boundedOperation(onHear([supportedContrast(content,word)?.speech,childSpeechPractice(learner.language,word,plan?.expected_phone||concern?.expected_phone,pronunciationResult(content,scene.sentence).state==='uncertain').speech].filter(Boolean).join(' ')),{timeoutMs:15000});}}catch(err){setNotice('Your result is saved below. Maya’s voice could not play; use Hear my line to retry.');}}} />}
 {attempt&&<PronunciationResult content={storyFeedback} record={attempt} expected={scene.sentence} onHear={onHear} onStopSpeech={onStopSpeech} disabled={busy||recording||filmPlaying} onRetry={()=>{onStopSpeech?.();setStoryFeedback(null);setAttempt(null);setStoryTurn(value=>value+1);}}/>}
 {storyConcern&&<ArticulationCoach word={storyConcern.word} phone={storyConcern.expected_phone||''} produced={storyConcern.produced_phone||''} contrast={supportedContrast(storyFeedback,storyConcern.word)} cameraSupport={storyFeedback.camera_support} onHear={onHear} disabled={busy||recording} age={learner.age}/>}
 <button disabled={busy||recording||!attempt||storySession?.status==='paused'} onClick={()=>storyEvent('scene')}>{step===2?say('Finish adventure','കഥ പൂർത്തിയാക്കാം'):say('Continue the story','കഥ തുടരാം')}</button><details><summary>{say('More options','മറ്റ് വഴികൾ')}</summary><button disabled={busy||recording||storySession?.status==='paused'} onClick={()=>storyEvent('skip')}>{say('Skip this scene','ഈ രംഗം ഒഴിവാക്കാം')}</button><button disabled={busy||recording} onClick={()=>storyEvent('pause')}>{say('Take a break','വിശ്രമിക്കാം')}</button><button disabled={busy||recording} onClick={()=>storyEvent('finish')}>{say('Finish for now','ഇവിടെ നിർത്താം')}</button></details></>}
 </>)}
 {activity==='wordy'&&(!personalPlan?<p role="status">{say('Loading your saved practice words…','നിങ്ങളുടെ പരിശീലന വാക്കുകൾ എടുക്കുന്നു…')}</p>:personalTarget?<Wordy key={`${learner.language}:${target}`} learner={learner} scope={scope} target={target} personalTarget={personalTarget} onHear={onHear} onStopSpeech={onStopSpeech} onBeforeRecord={onBeforeRecord} onBusyChange={setCheckBusy} onFeedback={onFeedback}/>:<p>{say('Your supported practice words will appear here after a conversation or a therapist goal. Confirm any pending message above first.','സംഭാഷണത്തിനോ പരിശീലന ലക്ഷ്യത്തിനോ ശേഷം വാക്കുകൾ ഇവിടെ കാണാം. മുകളിൽ കാത്തിരിക്കുന്ന സന്ദേശം ആദ്യം ഉറപ്പാക്കാം.')}</p>)}
 {activity==='story'&&story&&<button disabled={busy||recording} onClick={downloadStory}>{say('Download this story','കഥ ഡൗൺലോഡ് ചെയ്യാം')}</button>}
 </fieldset>{busy&&<p role="status">{say('Preparing your activity…','നിങ്ങളുടെ പരിശീലനം തയ്യാറാക്കുന്നു…')}</p>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}

