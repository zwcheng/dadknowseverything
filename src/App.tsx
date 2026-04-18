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
  renderSaved,
  upgradeCard,
} from './display';
import { reduce, initialState, type State } from './state';
import { DEMO_QUESTIONS, type Question } from './cards';
import { appendTrail, loadTrail, type TrailItem } from './trail';
import { concatBytes, pcmToWav, toUint8Array } from './pcm';
import { askGemini, geminiConfigured } from './gemini';
import { getStage, setStage, stageReason } from './stageMode';

const LISTEN_MAX_MS = 8000; // hard cap on a single utterance
const SAVED_MS = 1400;
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
        // Audio frames are only collected while LISTENING (checked in the handler below).
        if (ev.audioEvent?.audioPcm != null) {
          audioBuffer.current.push(toUint8Array(ev.audioEvent.audioPcm));
          return;
        }

        const t = getEventType(ev);
        if (t == null) return;
        setEventLog((log) => [`event:${t} @${new Date().toLocaleTimeString()}`, ...log].slice(0, 8));
        if (t === EventType.DOUBLE_CLICK) dispatch({ type: 'double' });
        else if (t === EventType.CLICK) dispatch({ type: 'click' });
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

  // Drive transitions: listening start/stop + thinking resolution + saved auto-return.
  useEffect(() => {
    if (!bridge) return;
    let maxTimer: number | undefined;
    let savedTimer: number | undefined;
    let cancelled = false;

    if (state.kind === 'listening') {
      audioBuffer.current = [];
      bridge.audioControl?.(true).catch(() => {});
      maxTimer = window.setTimeout(() => dispatch({ type: 'stop-listen' }), LISTEN_MAX_MS);
    } else if (state.kind === 'thinking') {
      bridge.audioControl?.(false).catch(() => {});
      const frames = audioBuffer.current;
      audioBuffer.current = [];
      (async () => {
        const q = await resolveQuestion(frames, qCursor.current, stage, isMock);
        if (cancelled) return;
        qCursor.current += 1;
        setLastQuestion(q.text);
        dispatch({ type: 'thinking-done', q });
      })();
    } else if (state.kind === 'saved') {
      appendTrail(bridge, state.q).then(setTrail).catch(() => {});
      savedTimer = window.setTimeout(() => dispatch({ type: 'saved-done' }), SAVED_MS);
    }

    return () => {
      cancelled = true;
      if (maxTimer) window.clearTimeout(maxTimer);
      if (savedTimer) window.clearTimeout(savedTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind, bridge, stage, isMock]);

  // Mirror state → glasses display.
  useEffect(() => {
    if (!bridge) return;
    upgradeCard(bridge, renderForState(state)).catch(() => {});
  }, [state, bridge]);

  // Dev-only gesture simulation: works whether the real SDK is loaded (no
  // Flutter host) or the mock is in use. Dispatches directly.
  const devFire = (t: number) => {
    if (t === EventType.DOUBLE_CLICK) dispatch({ type: 'double' });
    else if (t === EventType.CLICK) dispatch({ type: 'click' });
    setEventLog((log) => [`dev:${t} @${new Date().toLocaleTimeString()}`, ...log].slice(0, 8));
  };

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') devFire(EventType.DOUBLE_CLICK);
      else if (e.key === ' ' || e.key === 'Enter') devFire(EventType.CLICK);
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
            title={!keyConfigured ? 'Set VITE_GEMINI_API_KEY in .env.local' : ''}
          >
            {stage ? 'Stage mode (canned)' : 'Live Gemini'}
          </button>
          <span className="mode-note">
            {reason === 'no-key' && 'No API key — forced to stage mode'}
            {reason === 'user-toggle' && 'Canned Q/A, zero network'}
            {reason === 'off' && 'Audio → Gemini → Say / Ask / Try'}
          </span>
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
            <button onClick={() => devFire(EventType.DOUBLE_CLICK)}>double-press (D)</button>
            <button onClick={() => devFire(EventType.CLICK)}>single-press (Space)</button>
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
    case 'thinking': return renderThinking();
    case 'showing': return renderCard(state.q, state.card);
    case 'saved': return renderSaved(state.q);
  }
}

// Decide how to turn the captured audio into a Question:
// - stage mode OR browser mock OR no audio OR Gemini error → canned round-robin
// - otherwise call Gemini with a WAV payload
async function resolveQuestion(
  frames: Uint8Array[],
  cursor: number,
  stage: boolean,
  mock: boolean
): Promise<Question> {
  const canned = () => DEMO_QUESTIONS[cursor % DEMO_QUESTIONS.length];

  if (stage || mock) return canned();

  const pcm = concatBytes(frames);
  const MIN_PCM_BYTES = 2 * PCM_SAMPLE_RATE * 0.3; // 300ms of PCM16 mono
  if (pcm.length < MIN_PCM_BYTES) {
    console.warn('[wondercue] audio too short or missing; falling back to canned');
    return canned();
  }

  try {
    const wav = pcmToWav(pcm, PCM_SAMPLE_RATE);
    return await askGemini(wav);
  } catch (err) {
    console.warn('[wondercue] Gemini failed; falling back to canned:', err);
    return canned();
  }
}
