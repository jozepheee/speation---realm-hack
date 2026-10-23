import { useLocale } from "../context/LocaleContext";
import { useEffect, useRef, useState } from 'react';
import styles from '../styles/arcade.module.css';
export function PictureObject({
  name
}) {
  const {
    t
  } = useLocale();
  const shapes = {
    water: <><path d="M60 12C45 36 27 52 27 75a33 33 0 0066 0C93 52 75 36 60 12Z" fill="#76c7df" /><path d="M42 76c0 13 7 20 17 20" fill="none" stroke="#e4faff" strokeWidth="6" strokeLinecap="round" /></>,
    apple: <><path d="M60 45c-37-28-58 18-36 52 13 22 25 9 36 9s23 13 36-9c22-34 1-80-36-52Z" fill="#e78377" /><path d="M59 43V23" stroke="#795e40" strokeWidth="7" strokeLinecap="round" /><path d="M62 25c9-22 27-20 28-20-2 20-12 25-28 20" fill="#7cac78" /></>,
    home: <><path d="M23 59h74v51H23Z" fill="#f4d99a" /><path d="M10 59 60 12l50 47Z" fill="#d28c7b" /><path d="M49 76h23v34H49Z" fill="#a0b4c6" /><rect x="30" y="70" width="15" height="15" rx="3" fill="#fff8e2" /></>,
    car: <><path d="m26 52 12-25h43l15 25 14 8v34H10V61Z" fill="#9db8df" /><path d="M43 35h31l11 18H34Z" fill="#e7f5fa" /><circle cx="31" cy="96" r="13" fill="#465167" /><circle cx="91" cy="96" r="13" fill="#465167" /></>,
    tree: <><path d="M54 60h12v53H54Z" fill="#aa8262" /><circle cx="60" cy="43" r="29" fill="#80b78c" /><circle cx="39" cy="58" r="22" fill="#8ac296" /><circle cx="80" cy="58" r="23" fill="#70a784" /></>,
    sun: <><g stroke="#e9b45e" strokeWidth="6" strokeLinecap="round"><path d="M60 7v14m0 78v14M7 60h14m78 0h14M22 22l10 10m56 56 10 10M22 98l10-10m56-56 10-10" /></g><circle cx="60" cy="60" r="29" fill="#f8d37a" /></>,
    cat: <><path d="M24 53 21 13l31 22h16l31-22-3 40a43 43 0 01-72 0Z" fill="#d5ac87" /><ellipse cx="60" cy="68" rx="39" ry="34" fill="#d5ac87" /><circle cx="45" cy="62" r="4" fill="#445353" /><circle cx="75" cy="62" r="4" fill="#445353" /><path d="m55 76 5 6 5-6Z" fill="#ba7e77" /><path d="M21 78 6 74m15 13L6 91m93-13 15-4m-15 13 15 4" stroke="#897566" strokeWidth="3" /></>,
    ball: <><circle cx="60" cy="60" r="45" fill="#a7bbdf" /><path d="M26 30c44 3 43 45 70 60M21 82c29-30 54-27 82-33" fill="none" stroke="#f4e2a4" strokeWidth="13" /></>
  };
  return <svg viewBox="0 0 120 120" role="img" aria-label={t("Illustration of {value0}", {
    value0: name
  })}>{shapes[name]}</svg>;
}
export default function ArcadeActivities({
  game,
  challenge,
  onAnswer,
  busy,
  quiet,
  language
}) {
  const {
    t
  } = useLocale();
  const [order, setOrder] = useState([]),
    [taps, setTaps] = useState([]),
    [playing, setPlaying] = useState(false),
    [pulse, setPulse] = useState(-1);
  const tapTimes = useRef([]),
    context = useRef(null),
    timers = useRef([]),
    generation = useRef(0);
  function clearPattern() {
    generation.current += 1;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    context.current?.close().catch(() => {});
    context.current = null;
  }
  useEffect(() => {
    setOrder([]);
    setTaps([]);
    tapTimes.current = [];
    setPlaying(false);
    setPulse(-1);
    return clearPattern;
  }, [challenge.id, game]);
  async function playPattern() {
    clearPattern();
    setPlaying(true);
    setPulse(-1);
    const current = generation.current;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (Context) {
      try {
        context.current = new Context();
        await context.current.resume();
      } catch {
        if (current !== generation.current) return;
        context.current?.close().catch(() => {});
        context.current = null;
      }
    }
    if (current !== generation.current) return;
    const times = [0];
    challenge.beat_intervals.forEach(interval => times.push(times[times.length - 1] + interval));
    times.forEach((time, index) => {
      if (context.current) {
        const sound = context.current.createOscillator(),
          volume = context.current.createGain(),
          at = context.current.currentTime + time + .1;
        sound.type = 'sine';
        sound.frequency.value = index === 0 ? 660 : 440;
        volume.gain.setValueAtTime(.08, at);
        volume.gain.exponentialRampToValueAtTime(.001, at + .14);
        sound.connect(volume);
        volume.connect(context.current.destination);
        sound.start(at);
        sound.stop(at + .16);
        sound.onended = () => {
          sound.disconnect();
          volume.disconnect();
        };
      }
      timers.current.push(setTimeout(() => setPulse(index), (time + .1) * 1000));
    });
    timers.current.push(setTimeout(() => {
      setPlaying(false);
      setPulse(-1);
      clearPattern();
    }, (times[times.length - 1] + .4) * 1000));
  }
  function tap() {
    if (busy || playing || tapTimes.current.length > challenge.beat_intervals.length) return;
    tapTimes.current.push(performance.now());
    setTaps([...tapTimes.current]);
  }
  const intervals = taps.slice(1).map((value, index) => (value - taps[index]) / 1000);
  return <div className={styles.activityWorld}>
    <p className={styles.reviewedTag}>{t(challenge.source==='built_in_learning_activity'?'PLAY & LEARN ·':'CLINICIAN-AUTHORED ·')} {language?.toUpperCase()} · {challenge.difficulty || t("starter")}</p><h3 lang={language}>{challenge.word}</h3><p>{challenge.instruction}</p>
    {game === 'syllable' && <><div className={styles.syllableSlots} aria-label={t("Your syllable sequence")}>{challenge.pieces.map((_, index) => <button key={index} className={order[index] !== undefined ? styles.filledSlot : ''} disabled={busy || order[index] === undefined} onClick={() => setOrder(order.filter((_, position) => position !== index))} aria-label={t("Position {value0}{value1}", {
          value0: index + 1,
          value1: order[index] !== undefined ? ': ' + challenge.pieces[order[index]] : ', empty'
        })} onDragOver={event => event.preventDefault()} onDrop={event => {
          event.preventDefault();
          if (busy) return;
          const value = Number(event.dataTransfer.getData('text/plain'));
          if (Number.isInteger(value) && value >= 0 && value < challenge.pieces.length && !order.includes(value)) setOrder([...order, value]);
        }}>
      {order[index] !== undefined ? challenge.pieces[order[index]] : <span>✧</span>}</button>)}</div>
      <div className={styles.syllableTiles}>{challenge.pieces.map((piece, index) => <button key={index} draggable={!busy && !order.includes(index)} onDragStart={event => event.dataTransfer.setData('text/plain', String(index))} disabled={busy || order.includes(index)} onClick={() => setOrder([...order, index])} lang={language}>{piece}</button>)}</div>
      <p>{t("Select or drag tiles into order. Select a placed tile to remove it.")}</p><button className={styles.activitySubmit} disabled={busy || order.length !== challenge.pieces.length} onClick={() => onAnswer({
        order
      })}>{t("Send my syllable sequence \u2192")}</button></>}
    {game === 'picture' && <><div className={styles.pictureIsland}><PictureObject name={challenge.picture} /><div /></div><div className={styles.choices}>{challenge.options.map((word, choice) => <button key={choice} disabled={busy} lang={language} onClick={() => onAnswer({
          choice
        })}>{word}</button>)}</div><p>{t("Choose the word associated with the illustration.")}</p></>}
    {game === 'rhythm' && <><div className={styles.rhythmOrbit} data-quiet={quiet}>{Array.from({
          length: challenge.beat_intervals.length + 1
        }, (_, index) => <span key={index} className={pulse === index || taps.length > index ? styles.beatLit : ''} style={{
          '--beat-index': index
        }} />)}<button className={styles.tapMoon} onClick={tap} disabled={busy || playing || intervals.length === challenge.beat_intervals.length} aria-label={t("Tap the rhythm. Space or Enter also works.")}>✦<small>{playing ? t("Listen & watch") : taps.length ? t("Keep your rhythm") : t("Tap to begin")}</small></button></div>
      <div className={styles.rhythmActions}><button disabled={busy || playing} onClick={playPattern}>{t("Hear and see the reference pattern")}</button><button disabled={busy || playing} onClick={() => {
          setTaps([]);
          tapTimes.current = [];
        }}>{t("Start my taps again")}</button><button disabled={busy || intervals.length !== challenge.beat_intervals.length} onClick={() => onAnswer({
          tap_intervals: intervals
        })}>{t("Save my rhythm \u2192")}</button></div><p>{taps.length} {t("of")} {challenge.beat_intervals.length + 1} {t("taps \xB7")} {intervals.length ? intervals.map(value => value.toFixed(2) + 's').join(' · ') : t("Use your own comfortable movement.")}</p><p>{t("Pacing differences describe this interaction, not a speech diagnosis.")}</p></>}
  </div>;
}
