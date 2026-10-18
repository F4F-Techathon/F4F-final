import { onBeforeUnmount, ref } from 'vue'

interface SpeechResult { isFinal: boolean; 0: { transcript: string } }
interface Recognition { lang: string; interimResults: boolean; continuous: boolean; onstart: (() => void) | null; onresult: ((e: { results: ArrayLike<SpeechResult> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; start(): void; stop(): void; abort(): void }
interface SpeechOptions {
  continuous?: boolean
  /** Keep listening until stop(): a session the browser ends early (a pause, a network hiccup to the speech
   *  service) is followed by a new one, and the words keep adding up. Used while the talk button is held. */
  resume?: boolean
  onComplete?: (text: string) => void
}

// Browsers end a recognition session on their own, even in continuous mode: Chrome after a pause or when its
// connection to the speech service stalls, often after the first phrase. A held button resumes at most this
// many times before it gives up and keeps what it has.
const MAX_RESUMES = 20
// Errors that only end the current session; everything else is reported.
const SESSION_ENDS = new Set(['no-speech', 'aborted', 'network'])

// Live words are for display; completion is delivered only after final results and the end event.
export function useSpeechInput(onText: (text: string) => void, options: SpeechOptions = {}) {
  const listening = ref(false), error = ref(''), transcript = ref('')
  let recognition: Recognition | undefined
  let stopping = false
  let heard = '' // words from sessions that already ended
  let resumes = 0
  const speechWindow = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  const ctor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition

  // Wait for onend: releasing the button can still be followed by final recognition results.
  function stop() {
    if (!recognition || stopping) return
    stopping = true
    try { recognition.stop() }
    catch { cancel(); error.value = '语音暂时没连上，再长按试试。' }
  }

  // Disconnect before aborting so leaving the page never submits a canceled recording.
  function cancel() {
    const current = recognition
    recognition = undefined
    listening.value = false
    if (!current) return
    current.onstart = null; current.onresult = null; current.onerror = null; current.onend = null
    current.abort()
  }

  function fail(message: string) {
    error.value = message
    listening.value = false
  }

  // One browser session; with `resume` a session ending before stop() hands over to the next.
  function open() {
    const current = new ctor!()
    let sessionText = '', sessionFinal = '', lost = ''
    recognition = current
    current.lang = 'zh-CN'; current.interimResults = true; current.continuous = options.continuous ?? true
    // A permission prompt may delay startup until after the user has already released.
    current.onstart = () => {
      if (recognition !== current || !stopping) return
      try { current.stop() }
      catch { cancel(); fail('语音暂时没连上，再长按试试。') }
    }
    current.onresult = (event) => {
      if (recognition !== current) return
      const results = Array.from(event.results)
      sessionText = results.map((result) => result[0].transcript).join('')
      sessionFinal = results.filter((result) => result.isFinal).map((result) => result[0].transcript).join('')
      transcript.value = heard + sessionText
      onText(transcript.value)
    }
    current.onerror = (event) => {
      if (recognition !== current) return
      if (options.resume && !stopping && SESSION_ENDS.has(event.error)) { lost = event.error; return }
      fail(event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? '请允许使用麦克风，再长按试试。'
        : event.error === 'audio-capture' ? '没连上麦克风，检查后再试试。'
          : event.error === 'no-speech' ? '没听清，再说一次吧。'
            : event.error === 'network' ? '语音服务连不上（需要能访问浏览器的语音服务），再试一次吧。' : '语音连接断开了，再试一次吧。')
    }
    current.onend = () => {
      if (recognition !== current) return
      const resuming = options.resume && !stopping && !error.value && resumes < MAX_RESUMES
      // Released: only confirmed words count. Cut off mid-hold: the words still in progress are kept too,
      // or they would vanish from what the user just watched appear.
      heard += resuming ? sessionText : sessionFinal
      if (resuming) {
        resumes++
        try { open(); return } catch { /* Keep what was heard. */ }
      }
      recognition = undefined
      listening.value = false
      if (error.value) return
      const text = heard.trim()
      if (!text) { error.value = lost === 'network' ? '语音服务连不上（需要能访问浏览器的语音服务），再试一次吧。' : '没听清，再说一次吧。'; return }
      options.onComplete?.(text)
    }
    current.start()
  }

  // Each recording owns its words, preventing a retry from reusing earlier ones.
  function start() {
    if (listening.value) return
    cancel()
    stopping = false
    heard = ''; resumes = 0
    error.value = ''; transcript.value = ''
    if (!ctor) { error.value = '当前浏览器暂不支持语音，请换个支持语音的浏览器。'; return }
    try { open(); listening.value = true }
    catch { cancel(); error.value = '语音暂时没连上，再长按试试。' }
  }

  onBeforeUnmount(cancel)
  return { listening, error, transcript, start, stop, cancel }
}
