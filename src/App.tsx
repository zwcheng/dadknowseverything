import { useEffect, useReducer, useRef, useState } from 'react';
import {
  loadBridge,
  textContainer,
  EventType,
  getEventType,
  type EvenBridgeLike,
  type AnyEvent,
} from './bridge';
import {
  PAGE_ID,
  CARD_CONTAINER_ID,
  CARD_CONTAINER_NAME,
  renderCard,
  renderIdle,
  renderListening,
  renderThinking,
  renderTranscript,
  renderSaved,
  upgradeCard,
} from './display';
import { reduce, initialState, type State } from './state';
import { DEMO_QUESTIONS, type Question } from './cards';
import { appendTrail, loadTrail, type TrailItem } from './trail';
import { concatBytes, pcmToWav, toUint8Array } from './pcm';
import { askGeminiAudio, askGeminiText, geminiConfigured } from './gemini';
import { getStage, setStage, stageReason } from './stageMode';
import { TONES, nextTone, type Tone } from './tones';

const LISTEN_MAX_MS = 8000;
const SAVED_MS = 1400;
const TRANSCRIPT_MS = 700;
const SPINNER_TICK_MS = 100;
const PCM_SAMPLE_RATE = 16000;

export default function App() {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [bridge, setBridge] = useState<EvenBridgeLike | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [trail, setTrail] = useState<TrailItem[]>([]);
  const [stage, setStageState] = useState<boolean>(getStage());
  const [lastQuestion, setLastQuestion] = useState<string>('');

  const audioBuffer = useRef<Uint8Array[]>([]);
  const qCursor = useRef(0);
  const toneRef = useRef<Tone>('simple');   // tone for the CURRENT utterance

  // Bootstrap: load SDK / bridge, create the startup page, subscribe to events.
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const { bridge: b, mock } = await loadBridge();
      if (cancelled) return;
      setBridge(b);
      setIsMock(mock);

      const card = textContainer({
        id: CARD_CONTAINER_ID,
        name: CARD_CONTAINER_NAME,
        content: renderIdle(),
        capture: true,
      });
      try {
        await b.createStartUpPageContainer({ containerTotalNum: 1, textObject: [card] });
      } catch (err) {
        console.warn('[wondercue] createStartUpPageContainer failed', err);
      }

      setTrail(await loadTrail(b));

      unsub = b.onEvenHubEvent((ev: AnyEvent) => {
        if (ev.audioEvent?.audioPcm != null) {
          audioBuffer.current.push(toUint8Array(ev.audioEvent.audioPcm));
          return;
        }

        const t = getEventType(ev);
        if (t == null) return;
        setEventLog((log) => [`event:${t} @${new Date().toLocaleTimeString()}`, ...log].slice(0, 8));
        if (t === EventType.DOUBLE_CLICK) dispatch({ type: 'double' });
        else if (t === EventType.CLICK) dispatch({ type: 'click' });
        else if (t === EventType.SCROLL_TOP) dispatch({ type: 'scroll-top' });
        else if (t === EventType.SCROLL_BOTTOM) dispatch({ type: 'scroll-bottom' });
        else if (t === EventType.FOREGROUND_EXIT || t === EventType.ABNORMAL_EXIT) {
          b.audioControl?.(false).catch(() => {});
          dispatch({ type: 'reset' });
        }
      });
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  // State-entry side effects: listen start, audio collection, Gemini call,
  // spinner ticking, transcript timer, saved auto-return.
  useEffect(() => {
    if (!bridge) return;
    let maxTimer: number | undefined;
    let savedTimer: number | undefined;
    let transcriptTimer: number | undefined;
    let spinnerInterval: number | undefined;
    let cancelled = false;

    if (state.kind === 'listening') {
      toneRef.current = 'simple';
      audioBuffer.current = [];
      bridge.audioControl?.(true).catch(() => {});
      maxTimer = window.setTimeout(() => dispatch({ type: 'stop-listen' }), LISTEN_MAX_MS);
    } else if (state.kind === 'thinking') {
      spinnerInterval = window.setInterval(() => dispatch({ type: 'spinner-tick' }), SPINNER_TICK_MS);
      const retoneQ = state.retone?.q;
      if (retoneQ) {
        const tone = nextTone(toneRef.current);
        toneRef.current = tone;
        (async () => {
          // Stage mode stays offline: cycle tone label without re-querying.
          if (stage || !geminiConfigured()) {
            if (cancelled) return;
            dispatch({ type: 'heard', q: retoneQ, tone });
            return;
          }
          try {
            const q = await askGeminiText(retoneQ.text, tone);
            if (cancelled) return;
            dispatch({ type: 'heard', q, tone });
          } catch (err) {
            console.warn('[wondercue] retone failed; staying with prior q', err);
            if (cancelled) return;
            dispatch({ type: 'heard', q: retoneQ, tone });
          }
        })();
      } else {
        bridge.audioControl?.(false).catch(() => {});
        const frames = audioBuffer.current;
        audioBuffer.current = [];
        (async () => {
          const tone = toneRef.current;
          const q = await resolveQuestion(frames, qCursor.current, stage, isMock, tone, (p) =>
            dispatch({ type: 'stream-say', partial: p })
          );
          if (cancelled) return;
          qCursor.current += 1;
          setLastQuestion(q.text);
          dispatch({ type: 'heard', q, tone });
        })();
      }
    } else if (state.kind === 'transcript') {
      transcriptTimer = window.setTimeout(() => dispatch({ type: 'show-cards' }), TRANSCRIPT_MS);
    } else if (state.kind === 'saved') {
      appendTrail(bridge, state.q).then(setTrail).catch(() => {});
      savedTimer = window.setTimeout(() => dispatch({ type: 'saved-done' }), SAVED_MS);
    }

    return () => {
      cancelled = true;
      if (maxTimer) window.clearTimeout(maxTimer);
      if (savedTimer) window.clearTimeout(savedTimer);
      if (transcriptTimer) window.clearTimeout(transcriptTimer);
      if (spinnerInterval) window.clearInterval(spinnerInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind, bridge, stage, isMock]);

  // Mirror state → glasses display on every dispatch.
  useEffect(() => {
    if (!bridge) return;
    upgradeCard(bridge, renderForState(state)).catch(() => {});
  }, [state, bridge]);

  // Dev gesture simulation: keyboard + buttons, always available in dev.
  const devFire = (t: number) => {
    if (t === EventType.DOUBLE_CLICK) dispatch({ type: 'double' });
    else if (t === EventType.CLICK) dispatch({ type: 'click' });
    else if (t === EventType.SCROLL_TOP) dispatch({ type: 'scroll-top' });
    else if (t === EventType.SCROLL_BOTTOM) dispatch({ type: 'scroll-bottom' });
    setEventLog((log) => [`dev:${t} @${new Date().toLocaleTimeString()}`, ...log].slice(0, 8));
  };

  // Stage auto-drive: one keystroke drives a full rehearsal from idle.
  const autoDrive = () => {
    const seq: Array<[number, () => void]> = [
      [0, () => dispatch({ type: 'double' })],
      [1200, () => dispatch({ type: 'click' })],
      [2200, () => dispatch({ type: 'click' })],
      [3000, () => dispatch({ type: 'click' })],
      [3800, () => dispatch({ type: 'click' })],
      [4600, () => dispatch({ type: 'double' })],
    ];
    for (const [delay, fn] of seq) window.setTimeout(fn, delay);
  };

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') devFire(EventType.DOUBLE_CLICK);
      else if (e.key === ' ' || e.key === 'Enter') devFire(EventType.CLICK);
      else if (e.key === 't' || e.key === 'T') devFire(EventType.SCROLL_TOP);
      else if (e.key === 'r' || e.key === 'R') autoDrive();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleStage = () => {
    const next = !stage;
    setStage(next);
    setStageState(next);
  };

  const reason = stageReason();
  const keyConfigured = geminiConfigured();
  const currentTone: Tone | null =
    state.kind === 'showing' ? state.tone :
    state.kind === 'transcript' ? state.tone :
    null;

  return (
    <div className="wrap">
      <header>
        <h1>DadKnowsEVERYTHING</h1>
        <span className={`badge ${isMock ? 'mock' : 'live'}`}>
          {isMock ? 'mock bridge' : 'SDK loaded'}
        </span>
      </header>

      <section className="mode">
        <div className="label">AI mode</div>
        <div className="mode-row">
          <button
            className={stage ? 'off' : 'on'}
            onClick={toggleStage}
            disabled={!keyConfigured}
            title={!keyConfigured ? 'Set VITE_GEMINI_API_KEY in .env' : ''}
          >
            {stage ? 'Stage mode (canned)' : 'Live Gemini'}
          </button>
          <span className="mode-note">
            {reason === 'no-key' && 'No API key — forced to stage mode'}
            {reason === 'user-toggle' && 'Canned Q/A, zero network'}
            {reason === 'off' && 'Audio → Gemini → Say / Ask / Try (streaming)'}
          </span>
          {currentTone && <span className="tone-chip">tone: {currentTone}</span>}
        </div>
      </section>

      <section className="glasses">
        <div className="label">G2 display preview</div>
        <pre className="screen">{renderForState(state)}</pre>
      </section>

      <section className="controls">
        <div className="label">
          State: <code>{state.kind}</code>
          {lastQuestion && <span className="last-q"> · last Q: "{lastQuestion}"</span>}
        </div>
        {import.meta.env.DEV && (
          <div className="mock-controls">
            <button onClick={() => devFire(EventType.DOUBLE_CLICK)}>double (D)</button>
            <button onClick={() => devFire(EventType.CLICK)}>click (Space)</button>
            <button onClick={() => devFire(EventType.SCROLL_TOP)}>swipe-up (T)</button>
            <button onClick={autoDrive} title="One-shot rehearsal">auto-drive (R)</button>
          </div>
        )}
      </section>

      <section className="trail">
        <div className="label">Wonder Trail ({trail.length})</div>
        <ul>
          {trail.slice(-5).reverse().map((item, i) => (
            <li key={i}>
              <span className="topic">{item.topic}</span> {item.text}
            </li>
          ))}
        </ul>
      </section>

      <section className="log">
        <div className="label">Event log</div>
        <ul>{eventLog.map((l, i) => <li key={i}><code>{l}</code></li>)}</ul>
      </section>
    </div>
  );
}

function renderForState(state: State): string {
  switch (state.kind) {
    case 'idle': return renderIdle();
    case 'listening': return renderListening();
    case 'thinking': return renderThinking(state.tick);
    case 'transcript': return renderTranscript(state.q);
    case 'showing': return renderCard(state.q, state.card, state.tone);
    case 'saved': return renderSaved(state.q);
  }
}

// Decide how to turn the captured audio into a Question.
async function resolveQuestion(
  frames: Uint8Array[],
  cursor: number,
  stage: boolean,
  mock: boolean,
  tone: Tone,
  onPartialSay: (s: string) => void
): Promise<Question> {
  const canned = () => {
    // Round-robin through DEMO_QUESTIONS. Tone cycling in stage mode just
    // picks a different canned entry to demonstrate variation.
    const toneIdx = TONES.indexOf(tone);
    const base = DEMO_QUESTIONS[cursor % DEMO_QUESTIONS.length];
    return toneIdx <= 0 ? base : { ...base, say: `[${tone}] ${base.say}`.slice(0, 60) };
  };

  if (stage || mock) return canned();

  const pcm = concatBytes(frames);
  const MIN_PCM_BYTES = 2 * PCM_SAMPLE_RATE * 0.3; // 300ms of PCM16 mono
  if (pcm.length < MIN_PCM_BYTES) {
    console.warn('[wondercue] audio too short or missing; falling back to canned');
    return canned();
  }

  try {
    const wav = pcmToWav(pcm, PCM_SAMPLE_RATE);
    return await askGeminiAudio(wav, tone, { onPartialSay });
  } catch (err) {
    console.warn('[wondercue] Gemini failed; falling back to canned:', err);
    return canned();
  }
}
