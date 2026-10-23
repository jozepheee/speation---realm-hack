import { useLocale } from "../context/LocaleContext";
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';
import useLearners from '../hooks/useLearners';
import useGamepadNavigation from '../hooks/useGamepadNavigation';
import RecordingStudio from '../components/RecordingStudio';
import ArcadeActivities from '../components/ArcadeActivities';
import SpeechAdventure from '../components/SpeechAdventure';
const BakeryGame=dynamic(()=>import('../components/BakeryGame'),{ssr:false});
import { portalApi } from '../lib/portalApi';
import styles from '../styles/arcade.module.css';
const GardenScene = dynamic(() => import('../components/GardenScene'), {
  ssr: false
});
const ALL_GAMES = [{
  id: 'memory',
  name: 'Memory Meadow',
  tag: 'LOOK · DISCOVER · CONNECT',
  description: 'Find the little wonders that belong together.',
  icon: 'leaf'
}, {
  id: 'listening',
  name: 'Echo Islands',
  tag: 'LISTEN · CHOOSE · EXPLORE',
  description: 'Listen to a practice word and sail to its island.',
  icon: 'shell'
}, {
  id: 'story',
  name: 'Story Constellation',
  tag: 'IMAGINE · EXPRESS · CREATE',
  description: 'Tell your story aloud to light the stars and move your rocket.',
  icon: 'star'
}, {
  id: 'syllable',
  name: 'Syllable Skybridge',
  tag: 'ARRANGE · BUILD · DISCOVER',
  description: 'Speak longer words to build a skybridge and help Pip cross.',
  icon: 'moon'
}, {
  id: 'picture',
  name: 'Wonder Atlas',
  tag: 'NOTICE · NAME · CONNECT',
  description: 'Connect illustrated objects with regional words.',
  icon: 'flower'
}, {
  id: 'rhythm',
  name: 'Moonbeat Harbor',
  tag: 'LISTEN · TAP · FLOW',
  description: 'Find a comfortable rhythm through light, sound and movement.',
  icon: 'sun'
}];
const GAMES = ['listening', 'syllable', 'story'].map(id => ALL_GAMES.find(game => game.id === id));
function Symbol({
  name
}) {
  const {
    t
  } = useLocale();
  const paths = {
    leaf: 'M12 40 C6 18 26 5 43 7 C43 27 31 44 12 40 M12 40 L33 18',
    moon: 'M34 7 C13 4 5 21 11 34 C19 51 43 47 47 27 C31 35 21 21 34 7',
    star: 'M28 5 L34 21 L51 21 L38 32 L43 49 L28 39 L13 49 L18 32 L5 21 L22 21 Z',
    flower: 'M28 19 C8 0 2 26 19 28 C0 46 26 53 28 36 C46 56 55 29 36 28 C56 8 29 1 28 19 Z',
    shell: 'M8 39 C-1 15 13 5 28 7 C45 5 59 20 47 39 L28 49 Z M28 49 L28 12 M28 49 L13 15 M28 49 L43 15',
    sun: 'M28 8 L28 2 M28 54 L28 48 M8 28 L2 28 M54 28 L48 28 M13 13 L8 8 M43 43 L48 48 M13 43 L8 48 M43 13 L48 8'
  };
  return <svg viewBox="0 0 56 56" role="img" aria-label={t(name)}><path d={paths[name]} fill={name === 'sun' || name === 'leaf' || name === 'shell' ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />{name === 'sun' && <circle cx="28" cy="28" r="12" fill="currentColor" />}</svg>;
}
function LegacyArcade() {
  const {
    t
  } = useLocale();
  const {
    learners,
    learner,
    selected,
    setSelected,
    error: profileError,
    loading: profilesLoading
  } = useLearners();
  const [world, setWorld] = useState(null),
    [session, setSession] = useState(null),
    [flipped, setFlipped] = useState([]),
    [matched, setMatched] = useState([]);
  const [step, setStep] = useState(0),
    [feedback, setFeedback] = useState(''),
    [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [quiet, setQuiet] = useState(false),
    [sound, setSound] = useState(false),
    [cosmetic, setCosmetic] = useState('cloud');
  const timer = useRef(null),
    player = useRef(null),
    generation = useRef(0);
  const effects = useRef(null);
  const playRoot = useRef(null),
    [controller, setController] = useState(false);
  const controllerStatus = useGamepadNavigation(controller, playRoot);
  const [difficulty, setDifficulty] = useState('starter');
  useEffect(()=>{if(learner)setDifficulty(learner.age>=8?'growing':'starter');},[selected]);
  const [cooperative, setCooperative] = useState(false);
  const startRequest = useRef(null),
    answerRequest = useRef(null);
  useEffect(() => {
    setQuiet(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    return () => {
      generation.current += 1;
      clearTimeout(timer.current);
      player.current?.pause();
      effects.current?.close().catch(() => {});
    };
  }, []);
  useEffect(() => {
    const current = ++generation.current;
    clearTimeout(timer.current);
    player.current?.pause();
    setBusy(false);
    setWorld(null);
    setSession(null);
    setError('');
    if (!selected) return;
    const controller = new AbortController();
    portalApi(`/learners/${selected}/adventure`, {
      signal: controller.signal
    }).then(data => {
      if (current === generation.current) setWorld(data);
    }).catch(err => {
      if (err.name !== 'AbortError' && current === generation.current) setError(err.message);
    });
    return () => controller.abort();
  }, [selected]);
  useEffect(() => {
    if (session) window.scrollTo({
      top: 0,
      behavior: 'instant'
    });
  }, [session?.id, step]);
  function loadSession(data) {
    startRequest.current = null;
    answerRequest.current = null;
    setSession(data);
    setStep(data.responses.length);
    setMatched(data.responses.filter(item => item.matched).flatMap(item => item.pair || []));
    setFlipped([]);
    setFeedback('');
    setText('');
  }
  function leaveGame() {
    const current = ++generation.current;
    clearTimeout(timer.current);
    player.current?.pause();
    setSession(null);
    setBusy(false);
    startRequest.current = null;
    answerRequest.current = null;
    portalApi(`/learners/${selected}/adventure`).then(data => {
      if (current === generation.current) setWorld(data);
    }).catch(error => {
      if (current === generation.current) setError(error.message);
    });
  }
  async function resumeGame(id) {
    const current = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const saved = await portalApi(`/games/${id}`);
      if (current === generation.current) loadSession(saved);
    } catch (error) {
      if (current === generation.current) setError(error.message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function start(game) {
    const current = generation.current,
      setup = {
        game,
        difficulty,
        cooperative: game === 'memory' && cooperative
      };
    const fingerprint = JSON.stringify([selected, setup]);
    if (startRequest.current?.fingerprint !== fingerprint) startRequest.current = {
      fingerprint,
      id: crypto.randomUUID()
    };
    setBusy(true);
    setError('');
    try {
      const data = await portalApi(`/learners/${selected}/games`, {
        method: 'POST',
        body: {
          ...setup,
          request_id: startRequest.current.id
        }
      });
      if (current === generation.current) loadSession(data);
    } catch (err) {
      if (current === generation.current) setError(err.message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  function toggleSound(enabled) {
    setSound(enabled);
    effects.current?.close().catch(() => {});
    effects.current = null;
    if (!enabled) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) {
      setSound(false);
      setError('Sound effects are unavailable in this browser.');
      return;
    }
    try {
      const context = new Context();
      effects.current = context;
      context.resume().catch(() => {
        if (effects.current === context) {
          context.close().catch(() => {});
          effects.current = null;
          setSound(false);
          setError('Sound effects could not start. You can continue quietly.');
        }
      });
    } catch {
      setSound(false);
      setError('Sound effects could not start. You can continue quietly.');
    }
  }
  function chime() {
    const context = effects.current;
    if (!sound || context?.state !== 'running') return;
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(990, context.currentTime + .15);
    gain.gain.setValueAtTime(.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .5);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + .5);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
  async function answer(body) {
    const current = generation.current;
    setBusy(true);
    setError('');
    const fingerprint = JSON.stringify([session.id, step, body]);
    if (answerRequest.current?.fingerprint !== fingerprint) answerRequest.current = {
      fingerprint,
      id: crypto.randomUUID()
    };
    try {
      const outcome = await portalApi(`/games/${session.id}/answer`, {
        method: 'POST',
        body: {
          request_id: answerRequest.current.id,
          challenge: step,
          ...body
        }
      });
      if (current !== generation.current) return;
      answerRequest.current = null;
      const next = [...session.responses, outcome.result];
      setSession(current => ({
        ...current,
        responses: next,
        completed: outcome.completed
      }));
      setStep(next.length);
      if (outcome.result.matched) {
        chime();
        setFeedback('A lovely connection.');
      } else setFeedback(session.game === 'story' ? 'Your story is growing.' : 'Keep exploring. Every attempt counts.');
      if (outcome.result.pair) {
        if (outcome.result.matched) setMatched(current => [...current, ...outcome.result.pair]);
        timer.current = setTimeout(() => {
          setFlipped([]);
          setBusy(false);
        }, quiet ? 250 : 900);
      } else setBusy(false);
      if (outcome.completed) {
        chime();
        const refreshed = await portalApi(`/learners/${selected}/adventure`);
        if (current === generation.current) setWorld(refreshed);
      }
      if (current === generation.current) setText('');
    } catch (err) {
      if (current !== generation.current) return;
      setError(err.message);
      setBusy(false);
      setFlipped([]);
      try {
        const saved = await portalApi(`/games/${session.id}`);
        if (current === generation.current) loadSession(saved);
      } catch {/* The saved game remains resumable when the connection returns. */}
    }
  }
  function flip(index) {
    if (busy || flipped.includes(index) || matched.includes(index)) return;
    const next = [...flipped, index];
    setFlipped(next);
    if (next.length === 2) answer({
      pair: next
    });
  }
  function listen() {
    player.current?.pause();
    player.current = new Audio(`data:audio/mpeg;base64,${session.challenges[step].audio_base64}`);
    player.current.play().catch(err => setError(err.message));
  }
  async function voiceOutcome(outcome){
    setSession(outcome.session);setStep(outcome.session.responses.length);setFeedback('Your voice moved the adventure.');chime();
    if(outcome.session.completed){const current=generation.current;try{const refreshed=await portalApi(`/learners/${selected}/adventure`);if(current===generation.current)setWorld(refreshed);}catch(err){if(current===generation.current)setError(err.message);}}
  }
  async function recordEvidence(record) {
    const current = generation.current;
    try {
      await portalApi(`/games/${session.id}/recordings/${record.id}`, {
        method: 'POST'
      });
      if (current === generation.current && session.game === 'story' && record.transcript) setText(record.transcript);
    } catch (err) {
      if (current === generation.current) setError(`Recording saved. Linking it to this adventure needs retry: ${err.message}`);
    }
  }
  return <ProtectedRoute><Head><title>{t("Sky Gardens \xB7 Speation Arcade")}</title></Head>{!session && <Navbar />}
    <main ref={playRoot} className={`${styles.world} ${session ? styles.activeWorld : ''} ${quiet ? styles.quiet : ''}`} data-cosmetic={cosmetic}>
      <div className={styles.landscape} /><div className={styles.veil} />
      <div className={styles.content}>
        <header className={styles.header}><Link href="/companion">{t("\u2190 Back to Maya")}</Link><span>{t("SPEATION \xB7 PLAY WITH PURPOSE")}</span><div className={styles.wallet}>✦ {world?.stars ?? '—'} <small>{t("adventure stars")}</small></div></header>
        <details className={styles.gameSettings}><summary>{t("Practice settings")}</summary><div className={styles.controls}><label>{t("Learner")}<select value={selected} onChange={event => setSelected(event.target.value)}>{learners.map(item => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label>
          <label><input type="checkbox" checked={quiet} onChange={event => setQuiet(event.target.checked)} />{t("Quiet motion")}</label><label><input type="checkbox" checked={sound} onChange={event => toggleSound(event.target.checked)} />{t("Sound effects")}</label>
          {!!world?.cosmetics.length && <label>{t("Sky style")}<select value={cosmetic} onChange={event => setCosmetic(event.target.value)}>{world.cosmetics.map(item => <option key={item} value={item}>{t(item)}</option>)}</select></label>}
          <label><input type="checkbox" checked={controller} onChange={event => setController(event.target.checked)} />{t("Controller navigation")}</label>{controller && <small role="status">{t(controllerStatus)}</small>}
          {!session && <label>{t("Game level")}<select disabled={busy} value={difficulty} onChange={event => setDifficulty(event.target.value)}><option value="starter">{t("Starter \xB7 3 memory pairs")}</option><option value="growing">{t("Growing \xB7 4 memory pairs")}</option><option value="challenge">{t("Challenge \xB7 6 memory pairs")}</option></select></label>}
          {!session && <label><input type="checkbox" checked={cooperative} onChange={event => setCooperative(event.target.checked)} />{t("Memory Meadow: play together and take turns")}</label>}
        </div>
        </details>
        {(error || profileError) && <p className={styles.error} role="alert">{error || t(profileError)}</p>}
        {busy && <p role="status" aria-live="polite">{session ? t("Saving your move\u2026") : t("Opening your adventure\u2026")}</p>}
        {!session ? <>
          <section className={styles.hero}><p>{t("A LITTLE COURAGE. A LITTLE WONDER.")}</p><h1>{learner?.age >= 13 ? t("Your voice. Your adventure.") : t("Small steps. Wonderful worlds.")}</h1><span>{t("Explore at your own pace. Your effort lights the way.")}</span><div className={styles.scene}><GardenScene quiet={quiet} /></div></section>
          {!learner ? <p className={styles.empty}>{profilesLoading ? t("Loading your learner profiles\u2026") : <>{t("Create your learner profile in the")} <Link href="/family">{t("family hub")}</Link> {t("to begin.")}</>}</p> : <div className={styles.games}>{GAMES.map((game, index) => <button className={styles.game} key={game.id} onClick={() => start(game.id)} disabled={busy || !learner.consent?.practice_allowed}>
            <span className={styles.number}>0{index + 1}</span><div className={styles.gameIcon}><Symbol name={game.icon} /></div><small>{t(game.tag)}</small><h2>{t(game.name)}</h2><p>{t(game.description)}</p><span className={styles.play}>{t("Enter this world")} <span>↗</span></span>
          </button>)}</div>}
          {learner && <details className={styles.otherActivities}><summary>{t("Other activities")}</summary><p>{t("Optional memory, picture and pacing activities.")}</p><div>{ALL_GAMES.filter(game => !GAMES.includes(game)).map(game => <button key={game.id} disabled={busy || !learner.consent?.practice_allowed} onClick={() => start(game.id)}>{t(game.name)}</button>)}</div></details>}
          {world && <section className={styles.journey}><div><small>{t("YOUR JOURNEY")}</small><h2>{world.last_7_days_completed} {t("adventures in the past seven days")}</h2><p>{t("Stars celebrate participation. Take breaks whenever you need them.")}</p></div><div className={styles.collectibles}>{['cloud', 'moon', 'aurora', 'sunrise'].map((item, index) => <div key={item} className={world.cosmetics.includes(item) ? styles.unlocked : styles.locked}><Symbol name={['leaf', 'moon', 'star', 'sun'][index]} /><span>{t(item)}</span></div>)}</div></section>}
          {world?.history.some(item => !item.completed) && <section className={styles.resume}><h3>{t("Continue an adventure")}</h3>{world.history.filter(item => !item.completed).slice(0, 3).map(item => <button key={item.id} disabled={busy} onClick={() => resumeGame(item.id)}>{t(ALL_GAMES.find(game => game.id === item.game)?.name)} ↗</button>)}</section>}
        </> : <section className={styles.playfield}>
          <div className={styles.playhead}><button onClick={leaveGame}>{t("\u2190 Garden map")}</button><span>{t(ALL_GAMES.find(game => game.id === session.game)?.name)}</span><small>{session.game === 'memory' ? t("{value0} connections", {
                value0: matched.length / 2
              }) : t("{value0} / 3 moments", {
                value0: Math.min(step + 1, 3)
              })}</small></div>
          <progress className={styles.adventureProgress} aria-label={t("Adventure participation progress")} max={session.game === 'memory' ? session.challenges[0].cards.length : 3} value={session.game === 'memory' ? matched.length : Math.min(step, 3)} />
          {session.completed && <div className={styles.starburst} aria-hidden="true">{Array.from({
              length: 18
            }, (_, index) => <span key={index} style={{
              '--particle': index,
              '--angle': `${index * 20}deg`,
              '--distance': `${95 + index % 4 * 24}px`
            }}>✦</span>)}</div>}
          {session.completed ? <div className={styles.celebration}><div className={styles.orbit}><Symbol name="star" /></div><small>{t("AN ADVENTURE COMPLETED")}</small><h1>{t("You showed up.")}<br />{t("That matters.")}</h1><p>{t("Three adventure stars for your participation.")}</p><button onClick={leaveGame}>{t("Explore another world \u2197")}</button></div> : <>
            <div className={styles.instructions}><small>{t("TAKE YOUR TIME")}</small><h2>{session.game === 'memory' ? t("Find the wonders that belong together.") : session.game === 'listening' ? t("Listen. Which word did you hear?") : session.game === 'syllable' ? t("Build your syllable skybridge.") : session.game === 'picture' ? t("A little wonder. A word to discover.") : session.game === 'rhythm' ? t("Let your own rhythm light the harbor.") : t(session.challenges[step]?.prompt)}</h2></div>
            {session.game === 'memory' && <>{session.cooperative && <p role="status">{step % 2 === 0 ? t("Your turn") : t("Your helper\u2019s turn")} {t("\xB7 choose a pair together. You share this adventure.")}</p>}<div className={styles.memory}>{session.challenges[0].cards.map((name, index) => <button key={index} className={`${styles.card} ${flipped.includes(index) || matched.includes(index) ? styles.revealed : ''} ${matched.includes(index) ? styles.matched : ''}`} disabled={busy || matched.includes(index)} onClick={() => flip(index)} aria-label={flipped.includes(index) || matched.includes(index) ? name : t("Reveal card {value0}", {
                  value0: index + 1
                })}><span className={styles.back} aria-hidden="true">✦</span><span className={styles.face} aria-hidden="true"><Symbol name={name} /></span></button>)}</div></>}
            {['listening', 'syllable', 'story'].includes(session.game) && <SpeechAdventure key={`${session.id}:${step}`} sessionId={session.id} onVoiceOutcome={voiceOutcome} game={session.game} challenge={session.challenges[step]} learner={learner} busy={busy} quiet={quiet} onAnswer={answer} onListen={listen} onRecorded={recordEvidence} text={text} onText={setText} />}
            {['picture', 'rhythm'].includes(session.game) && <><ArcadeActivities key={`${session.id}:${step}`} game={session.game} challenge={session.challenges[step]} onAnswer={answer} busy={busy} quiet={quiet} language={learner.language} /><details className={styles.optionalSpeech}><summary>{t("Optional speech attempt \xB7 saved for human review")}</summary><RecordingStudio key={`${session.id}:${step}:audio`} learner={learner} task="word" expectedText={session.challenges[step]?.word || ''} onRecorded={recordEvidence} /></details></>}
            <p className={styles.feedback} aria-live="polite">{t(feedback)}</p>
          </>}
        </section>}
      </div>
    </main>
  </ProtectedRoute>;
}

export default function Arcade(){
 const {t}=useLocale();
 const {learner,loading}=useLearners();
 if(loading)return <ProtectedRoute><p role="status">{t('Opening your bakery…')}</p></ProtectedRoute>;
 if(!learner)return <LegacyArcade/>;
 return <ProtectedRoute><BakeryGame key={learner.id} learner={learner}/></ProtectedRoute>;
}
