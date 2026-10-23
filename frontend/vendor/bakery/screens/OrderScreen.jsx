import { useEffect } from 'react'
import { ArrowIcon } from '../components/icons.jsx'
import { Art, Button, Scene, SpeakButton } from '../components/ui.jsx'
import { LINES } from '../speech/lines.js'
import { speak } from '../speech/speak.js'

export function OrderScreen({ sound, onBegin }) {
  const line = LINES.order(sound)

  useEffect(() => {
    speak(line)
  }, [line])

  return (
    <Scene mood="idle" says="Ooh, a new order!">
      <div className="center-zone center-zone--right">
        <article className="ticket" aria-label="New order">
          <span className="ticket__pin" aria-hidden="true" />
          <h1 className="ticket__title">New order!</h1>
          <Art src={sound.icon} alt={sound.treat} className="ticket__treat" />
          <p className="ticket__line">{sound.orderLine}</p>
          <SpeakButton text={line} label="Hear the order" />
        </article>
      </div>

      <div className="counter-front">
        <Button onClick={onBegin}>
          On it! <ArrowIcon />
        </Button>
      </div>
    </Scene>
  )
}
