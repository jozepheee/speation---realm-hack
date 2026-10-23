import { useLocale } from "../context/LocaleContext";
import { useEffect, useRef, useState } from 'react';

// Peaks come from decoded retained PCM. Markers keep their original provenance.
export default function EvidencePlayer({
  src,
  duration,
  timings = [],
  reviews = [],
  onRange
}) {
  const {
    t
  } = useLocale();
  const player = useRef(null),
    stopAt = useRef(null);
  const [peaks, setPeaks] = useState([]),
    [position, setPosition] = useState(0),
    [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let current = true,
      context;
    setPeaks([]);
    setPosition(0);
    setError('');
    stopAt.current = null;
    (async () => {
      try {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return;
        context = new Context();
        const response = await fetch(src, {
          signal: controller.signal
        });
        const decoded = await context.decodeAudioData(await response.arrayBuffer());
        const pcm = decoded.getChannelData(0),
          buckets = 240,
          size = Math.max(1, Math.ceil(pcm.length / buckets));
        const measured = Array.from({
          length: buckets
        }, (_, bucket) => {
          let peak = 0;
          for (let index = bucket * size; index < Math.min(pcm.length, (bucket + 1) * size); index += 1) peak = Math.max(peak, Math.abs(pcm[index]));
          return peak;
        });
        if (current) setPeaks(measured);
      } catch (err) {
        if (current && err.name !== 'AbortError') setError('Waveform preview is unavailable. The original audio controls remain available.');
      } finally {
        await context?.close().catch(() => {});
      }
    })();
    return () => {
      current = false;
      controller.abort();
      player.current?.pause();
    };
  }, [src]);
  async function playSegment(start, end) {
    if (!player.current || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration + .01) return;
    player.current.currentTime = start;
    stopAt.current = end;
    onRange?.(start, end);
    try {
      await player.current.play();
    } catch {
      setError('Use the audio controls to allow playback.');
    }
  }
  return <div>
    {!!peaks.length && <svg viewBox="0 0 720 100" role="img" aria-label={t("Measured audio waveform")} style={{
      width: '100%',
      background: '#edf3ed',
      borderRadius: 12
    }}>
      {peaks.map((peak, index) => <line key={index} x1={index * 3 + 1} x2={index * 3 + 1} y1={50 - peak * 46} y2={50 + peak * 46} stroke="#4e8062" strokeWidth="2" />)}
      <line x1={position / Math.max(duration, .001) * 720} x2={position / Math.max(duration, .001) * 720} y1="0" y2="100" stroke="#965332" strokeWidth="2" />
    </svg>}
    <audio ref={player} src={src} controls style={{
      width: '100%'
    }} onSeeking={() => setPosition(player.current.currentTime)} onTimeUpdate={() => {
      const time = player.current.currentTime;
      setPosition(time);
      if (stopAt.current !== null && time >= stopAt.current) {
        player.current.pause();
        stopAt.current = null;
      }
    }} onEnded={() => {
      stopAt.current = null;
    }} />
    {error && <p role="status">{t(error)}</p>}
    {!!timings.length && <details><summary>{t("Recognition timing \xB7 not sound-error annotations")}</summary><div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 12
      }}>{timings.map((item, index) => {
          const start = Number(item.start),
            end = Number(item.end);
          return <button key={index} type="button" disabled={!Number.isFinite(start) || !Number.isFinite(end) || end > duration + .01} onClick={() => playSegment(start, end)}>
        {item.word || item.text || t("Segment {value0}", {
              value0: index + 1
            })} · {start.toFixed(2)}–{end.toFixed(2)}{t("s")}</button>;
        })}</div></details>}
    {!!reviews.length && <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12
    }}>{reviews.map(review => <button key={review.id} type="button" onClick={() => playSegment(review.start_seconds, review.end_seconds)}>{t("Replay reviewed /")}{review.sound}/ · {review.start_seconds}–{review.end_seconds}{t("s")}</button>)}</div>}
  </div>;
}
