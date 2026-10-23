// The big microphone button. While listening it pulses and shows a moving waveform.

import { MicIcon } from './icons.jsx'
import {useContext} from 'react';
import {BakerySpeech} from '../../../components/BakeryGame';

const BAR_COUNT = 7

export function MicButton({ listening, disabled, onPress }) {
  const speech=useContext(BakerySpeech);
  const phase=speech?.captureState;
  const label=phase==='requesting'?'Allow the microphone in your browser…':phase==='recording'?(speech?.practiceLevel==='sound'?'Listening — make the sound, then pause.':'Listening — say the word, then pause.'):phase==='sending'?'Microphone off — sending your answer…':phase==='processing'?'Microphone off — checking your sounds…':'Starting the microphone…';
  return (
    <div className={`mic ${listening&&phase==='recording' ? 'mic--listening' : ''}`}>
      <div className="mic__wave" aria-hidden="true">
        {Array.from({ length: BAR_COUNT }, (_, i) => (
          <span key={i} style={{ '--i': i }} />
        ))}
      </div>
      <button
        type="button"
        className="mic__button"
        onClick={onPress}
        disabled={disabled || listening}
        aria-label={listening ? label : 'Tap and say the word'}
      >
        <MicIcon size={46} />
      </button>
      <div className="mic__wave" aria-hidden="true">
        {Array.from({ length: BAR_COUNT }, (_, i) => (
          <span key={i} style={{ '--i': BAR_COUNT - i }} />
        ))}
      </div>
      <p className="mic__label" aria-live="polite">
        {listening ? label : 'Tap and say it'}
      </p>
      {listening&&phase==='recording'&&<meter aria-label="Live microphone input level" min="0" max="1" value={Math.min(1,(speech?.inputLevel||0)*4)} style={{width:120,height:12}}/>}
    </div>
  )
}
