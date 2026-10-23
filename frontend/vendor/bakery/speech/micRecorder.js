// Keeps the child's try in memory while the browser listens, so we can check
// HOW an R sounded (see rSoundCheck.js). Used only for R words.
//
// Privacy: the sound only lives in memory for this one try. It's never saved,
// uploaded, played back, or logged, and the mic closes as soon as we're done.

const LONGEST_SECONDS = 8
const START_TIMEOUT_MS = 1500

export const canRecord = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

// Starts recording. Resolves to a recorder with stop(), or null if the mic
// couldn't open in time (then the game just skips the sound check).
export async function startRecording() {
  if (!canRecord || typeof AudioContext === 'undefined') return null
  try {
    const stream = await Promise.race([
      navigator.mediaDevices.getUserMedia({
        // Keep the sound natural: no noise filtering or volume leveling,
        // which can smear the very details we measure.
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow mic')), START_TIMEOUT_MS)),
    ])
    const context = new AudioContext()
    const source = context.createMediaStreamSource(stream)
    // A simple tap on the audio. (Old but widely supported, and fine for short tries.)
    const tap = context.createScriptProcessor(4096, 1, 1)
    const chunks = []
    let length = 0
    const maxLength = context.sampleRate * LONGEST_SECONDS
    tap.onaudioprocess = (event) => {
      if (length >= maxLength) return
      const chunk = new Float32Array(event.inputBuffer.getChannelData(0))
      chunks.push(chunk)
      length += chunk.length
    }
    source.connect(tap)
    tap.connect(context.destination)

    return {
      async stop() {
        tap.onaudioprocess = null
        source.disconnect()
        tap.disconnect()
        stream.getTracks().forEach((track) => track.stop())
        const sampleRate = context.sampleRate
        await context.close().catch(() => {})
        const samples = new Float32Array(length)
        let offset = 0
        for (const chunk of chunks) {
          samples.set(chunk, offset)
          offset += chunk.length
        }
        chunks.length = 0
        return { samples, sampleRate }
      },
    }
  } catch {
    return null
  }
}
