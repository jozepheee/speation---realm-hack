// Mirror mode: shows the child's face from the front camera, flipped like a
// real mirror, so they can copy the mouth picture. Speech therapists often use
// a mirror for this.
//
// Privacy: the video only goes to the screen. Nothing is recorded, saved, or
// sent anywhere, and the camera turns off as soon as the mirror closes.

import { useEffect, useRef, useState } from 'react'

const PROBLEMS = {
  blocked:
    'Grown-ups: the camera is blocked. Allow it with the icon next to the web address, then open the mirror again.',
  unavailable: "Grown-ups: we couldn't find a camera on this device.",
}

export function MirrorView() {
  const video = useRef(null)
  // status: starting | on | blocked | unavailable
  const [status, setStatus] = useState('starting')

  useEffect(() => {
    let stream = null
    let closed = false

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) return setStatus('unavailable')
      try {
        const camera = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
          audio: false,
        })
        // The mirror closed while we were asking: turn the camera right back off.
        if (closed) return camera.getTracks().forEach((track) => track.stop())
        stream = camera
        const el = video.current
        if (!el) return
        el.srcObject = camera
        // Safari doesn't always start a live camera on its own, so start it here.
        // The mirror shows once the video is actually playing (see onPlaying below).
        await el.play().catch(() => {})
      } catch (error) {
        const blocked = error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
        if (!closed) setStatus(blocked ? 'blocked' : 'unavailable')
      }
    }

    start()
    return () => {
      closed = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const problem = PROBLEMS[status]

  return (
    <figure className="mirror">
      <div className={`mirror__glass ${status === 'on' ? 'mirror__glass--on' : ''}`}>
        <video
          ref={video}
          className="mirror__video"
          autoPlay
          muted
          playsInline
          aria-label="Mirror: your face"
          onPlaying={() => setStatus('on')}
        />
        {status === 'starting' && <span className="mirror__note">Opening the mirror…</span>}
        {problem && <span className="mirror__note mirror__note--problem">{problem}</span>}
        <span className="mirror__shine" aria-hidden="true" />
      </div>
      <figcaption className="mirror__caption">Only you can see this. Nothing is recorded.</figcaption>
    </figure>
  )
}
