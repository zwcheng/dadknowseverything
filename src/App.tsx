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
  CARD_CONTAINER_ID,
  CARD_CONTAINER_NAME,
  renderShowing,
  renderIdle,
  renderListening,
  renderThinking,
  upgradeCard,
} from './display';
import { reduce, initialState, type State } from './state';
import { DEMO_QUESTIONS, type Question } from './cards';
import { concatBytes, pcmToWav, toUint8Array } from './pcm';
import { askGeminiAudio, geminiConfigured } from './gemini';
import { getStage, setStage, stageReason } from './stageMode';
import {
  emptyStore,
  ensureActiveKid,
  getActive,
  loadStore,
  saveStore,
  type KidProfile,
  type MemoryStore,
} from './memory/profile';
import {
  appendMoment,
  historyFor,
  momentFromQuestion,
  recent,
} from './memory/history';
import { computeInsights } from './memory/insights';
import { buildMemoryContext } from './memory/context';

const LISTEN_MAX_MS = 8000;
const SPINNER_TICK_MS = 250;
const PCM_SAMPLE_RATE = 16000;

export default function App() {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [bridge, setBridge] = useState<EvenBridgeLike | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [memory, setMemory] = useState<MemoryStore>(emptyStore());
  const [stage, setStageState] = useState<boolean>(getStage());
  const [lastQuestion, setLastQuestion] = useState<string>('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [audioBytes, setAudioBytes] = useState(0);
  const [lastResolve, setLastResolve] = useState<ResolveResult | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<{ battery?: number; wearing?: boolean } | null>(null);
  const [parentName, setParentName] = useState<string>('');

  const audioBuffer = useRef<Uint8Array[]>([]);
  const memoryRef = useRef<MemoryStore>(emptyStore());
  const stateRef = useRef<State>(initialState);
  const savedQIdRef = useRef<string>(''); // dedupe auto-save across re-renders

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { memoryRef.current = memory; }, [memory]);

  // Bootstrap: SDK bridge, startup page, memory store, event subscriptions.
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let statusUnsub: (() => void) | undefined;
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
        x: 0,
        width: 576,
      });
      try {
        await b.createStartUpPageContainer({
          containerTotalNum: 1,
          textObject: [card],
        });
      } catch (err) {
        console.warn('[dk-persona] createStartUpPageContainer failed', err);
      }

      const store = await ensureActiveKid(b);
      if (cancelled) return;
      setMemory(store);

      b.getUserInfo?.().then((u) => { if (!cancelled && u?.name) setParentName(u.name); }).catch(() => {});

      statusUnsub = b.onDeviceStatusChanged?.((status) => {
        setDeviceStatus({ battery: status.batteryLevel, wearing: status.isWearing });
        // Quiet-Tech posture: glasses off mid-listen -> close mic, reset.
        if (status.isWearing === false) {
          const k = stateRef.current.kind;
          if (k === 'listening' || k === 'thinking') {
            b.audioControl?.(false).catch(() => {});
            dispatch({ type: 'reset' });
          }
        }
      });

      unsub = b.onEvenHubEvent((ev: AnyEvent) => {
        if (ev.audioEvent?.audioPcm != null) {
          const chunk = toUint8Array(ev.audioEvent.audioPcm);
          audioBuffer.current.push(chunk);
          setAudioBytes((n) => n + chunk.length);
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
      statusUnsub?.();
    };
  }, []);

  // State-entry side effects.
  useEffect(() => {
    if (!bridge) return;
    let maxTimer: number | undefined;
    let spinnerInterval: number | undefined;
    let cancelled = false;

    if (state.kind === 'listening') {
      audioBuffer.current = [];
      setAudioBytes(0);
      bridge.audioControl?.(true).catch(() => {});
      maxTimer = window.setTimeout(() => dispatch({ type: 'stop-listen' }), LISTEN_MAX_MS);
    } else if (state.kind === 'thinking') {
      spinnerInterval = window.setInterval(() => dispatch({ type: 'spinner-tick' }), SPINNER_TICK_MS);
      bridge.audioControl?.(false).catch(() => {});
      const frames = audioBuffer.current;
      audioBuffer.current = [];
      const mem = currentMemoryBlock();
      (async () => {
        const res = await resolveQuestion(frames, stage, isMock, mem, (p) =>
          dispatch({ type: 'stream-partial', partial: p })
        );
        if (cancelled) return;
        setLastResolve(res);
        setLastQuestion(res.q.text);
        dispatch({ type: 'heard', q: res.q });
      })();
    } else if (state.kind === 'showing') {
      // Auto-save: every presented triad lands in the Wonder Trail. Which
      // option dad used is not recorded (and not load-bearing, since the
      // next question drives the next triad).
      const qKey = `${state.q.text}|${state.q.defensive}`;
      if (savedQIdRef.current !== qKey) {
        savedQIdRef.current = qKey;
        const activeKid = getActive(memoryRef.current);
        if (activeKid) {
          const moment = momentFromQuestion(activeKid.id, state.q);
          appendMoment(bridge, moment).then(setMemory).catch(() => {});
        }
      }
    } else if (state.kind === 'idle') {
      savedQIdRef.current = '';
    }

    return () => {
      cancelled = true;
      if (maxTimer) window.clearTimeout(maxTimer);
      if (spinnerInterval) window.clearInterval(spinnerInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind, bridge, stage, isMock]);

  // Mirror state -> glasses display.
  useEffect(() => {
    if (!bridge) return;
    upgradeCard(bridge, renderForState(state)).catch(() => {});
  }, [state, bridge]);

  const devFire = (t: number) => {
    if (t === EventType.DOUBLE_CLICK) dispatch({ type: 'double' });
    else if (t === EventType.CLICK) dispatch({ type: 'click' });
    setEventLog((log) => [`dev:${t} @${new Date().toLocaleTimeString()}`, ...log].slice(0, 8));
  };

  const devUnworn = () => {
    const k = stateRef.current.kind;
    setDeviceStatus({ battery: deviceStatus?.battery, wearing: false });
    if (k === 'listening' || k === 'thinking') {
      bridge?.audioControl?.(false).catch(() => {});
      dispatch({ type: 'reset' });
    }
    setEventLog((l) => [`dev:unworn @${new Date().toLocaleTimeString()}`, ...l].slice(0, 8));
  };

  const autoDrive = () => {
    const seq: Array<[number, () => void]> = [
      [0, () => dispatch({ type: 'double' })],
      [1500, () => dispatch({ type: 'click' })],
      [6000, () => dispatch({ type: 'reset' })],
    ];
    for (const [delay, fn] of seq) window.setTimeout(fn, delay);
  };

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches?.('input, textarea, [contenteditable="true"]')) return;
      if (e.key === 'd' || e.key === 'D') devFire(EventType.DOUBLE_CLICK);
      else if (e.key === ' ' || e.key === 'Enter') devFire(EventType.CLICK);
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

  const saveProfile = async (p: KidProfile) => {
    if (!bridge) return;
    const fresh = await loadStore(bridge);
    const next: MemoryStore = {
      ...fresh,
      kids: { ...fresh.kids, [p.id]: p },
      activeKidId: p.id,
    };
    await saveStore(bridge, next);
    setMemory(next);
    setEditingProfile(false);
  };

  const resetMemory = async () => {
    if (!bridge) return;
    if (!window.confirm('Clear profile + all Wonder Moments on this device?')) return;
    const empty = emptyStore();
    await saveStore(bridge, empty);
    const seeded = await ensureActiveKid(bridge);
    setMemory(seeded);
  };

  function currentMemoryBlock(): string | undefined {
    const m = memoryRef.current;
    const active = getActive(m);
    if (!active) return undefined;
    const history = historyFor(m, active.id);
    const insights = computeInsights(history);
    return buildMemoryContext(active, recent(history, 5), insights);
  }

  const reason = stageReason();
  const keyConfigured = geminiConfigured();
  const activeKid = getActive(memory);
  const history = historyFor(memory, activeKid?.id ?? null);
  const insights = computeInsights(history);

  return (
    <div className="wrap">
      <header>
        <h1>DadKnowsEVERYTHING: Persona</h1>
        <div className="hdr-right">
          {parentName && <span className="hdr-name">hi, {parentName}</span>}
          {deviceStatus?.battery != null && (
            <span className="hdr-batt" title="G2 battery">{deviceStatus.battery}%</span>
          )}
          {deviceStatus?.wearing === false && (
            <span className="hdr-warn" title="Glasses not worn">unworn</span>
          )}
          <span className={`badge ${isMock ? 'mock' : 'live'}`}>
            {isMock ? 'mock bridge' : 'SDK loaded'}
          </span>
        </div>
      </header>

      <ProfileCard
        kid={activeKid}
        editing={editingProfile}
        insights={insights}
        onEdit={() => setEditingProfile(true)}
        onSave={saveProfile}
        onCancel={() => setEditingProfile(false)}
        onReset={resetMemory}
      />

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
            {reason === 'no-key' && 'No API key \u2014 forced to stage mode'}
            {reason === 'user-toggle' && 'Canned triad, zero network'}
            {reason === 'off' && 'Audio \u2192 Gemini \u2192 Defensive / Offensive / Escape (memory-aware)'}
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
        <div className="diag">
          <span className="diag-chip">audio: {audioBytes.toLocaleString()} B</span>
          {lastResolve && (
            <span className={`diag-chip diag-${lastResolve.source}`}>
              resolve: {lastResolve.source}
              {lastResolve.source === 'short' && ` (${lastResolve.bytes} B, need \u2265 9600)`}
              {lastResolve.source === 'error' && ` \u2014 ${lastResolve.error}`}
              {lastResolve.source === 'live' && ` (${(lastResolve.bytes / 32000).toFixed(1)}s of audio)`}
            </span>
          )}
        </div>
        {import.meta.env.DEV && (
          <div className="mock-controls">
            <button onClick={() => devFire(EventType.DOUBLE_CLICK)}>double (D)</button>
            <button onClick={() => devFire(EventType.CLICK)}>click (Space)</button>
            <button onClick={devUnworn} title="Simulate glasses removed">unworn</button>
            <button onClick={autoDrive} title="One-shot rehearsal">auto-drive (R)</button>
          </div>
        )}
      </section>

      <Timeline history={history} />

      <section className="log">
        <div className="label">Event log</div>
        <ul>{eventLog.map((l, i) => <li key={i}><code>{l}</code></li>)}</ul>
      </section>
    </div>
  );
}

// ────────────────────── subcomponents ──────────────────────

function ProfileCard(props: {
  kid: KidProfile | null;
  editing: boolean;
  insights: ReturnType<typeof computeInsights>;
  onEdit: () => void;
  onSave: (kid: KidProfile) => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const { kid, editing, insights, onEdit, onSave, onCancel, onReset } = props;

  if (!kid) {
    return (
      <section className="profile empty">
        <div className="label">Kid profile</div>
        <div className="profile-empty">No active profile.</div>
      </section>
    );
  }

  if (!editing) {
    const interests = kid.interests.join(', ') || '\u2014';
    return (
      <section className="profile">
        <div className="label">Kid profile · memory</div>
        <div className="profile-row">
          <div className="profile-summary">
            <strong>{kid.name}</strong> · age {kid.age} · {interests}
            <div className="profile-sub">
              {insights.totalMoments} Wonder Moments
              {insights.dominantTopic && ` \u00b7 top topic: ${insights.dominantTopic}`}
            </div>
          </div>
          <div className="profile-actions">
            <button onClick={onEdit}>edit</button>
            <button onClick={onReset} className="danger">reset</button>
          </div>
        </div>
      </section>
    );
  }

  return <ProfileEditor kid={kid} onSave={onSave} onCancel={onCancel} />;
}

function ProfileEditor(props: { kid: KidProfile; onSave: (kid: KidProfile) => void; onCancel: () => void }) {
  const { kid, onSave, onCancel } = props;
  const [name, setName] = useState(kid.name);
  const [age, setAge] = useState(String(kid.age));
  const [interestsText, setInterestsText] = useState(kid.interests.join(', '));
  const [level, setLevel] = useState(kid.languageLevel);

  return (
    <section className="profile editing">
      <div className="label">Editing kid profile</div>
      <div className="profile-grid">
        <label>Name <input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Age <input type="number" min={2} max={14} value={age} onChange={(e) => setAge(e.target.value)} /></label>
        <label className="wide">
          Interests (comma-separated)
          <input value={interestsText} onChange={(e) => setInterestsText(e.target.value)} />
        </label>
        <label>
          Reading level
          <select value={level} onChange={(e) => setLevel(e.target.value as KidProfile['languageLevel'])}>
            <option value="preschool">preschool</option>
            <option value="early-elementary">early elementary</option>
            <option value="late-elementary">late elementary</option>
          </select>
        </label>
      </div>
      <div className="profile-actions">
        <button
          className="primary"
          onClick={() => onSave({
            ...kid,
            name: name.trim() || 'Kid',
            age: Number(age) || kid.age,
            interests: interestsText.split(',').map((s) => s.trim()).filter(Boolean),
            languageLevel: level,
          })}
        >save</button>
        <button onClick={onCancel}>cancel</button>
      </div>
    </section>
  );
}

function Timeline(props: { history: ReturnType<typeof historyFor> }) {
  const items = props.history.slice(-8).reverse();
  return (
    <section className="trail">
      <div className="label">Wonder Trail ({props.history.length})</div>
      {items.length === 0 ? (
        <div className="profile-sub">No moments yet. Each question + triad auto-saves here.</div>
      ) : (
        <ul>
          {items.map((m) => (
            <li key={m.id}>
              <span className="topic">{m.topic}</span>
              <span className="t-q">{m.question}</span>
              <span className="t-say">D: {m.defensive}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ────────────────────── helpers ──────────────────────

function renderForState(state: State): string {
  switch (state.kind) {
    case 'idle': return renderIdle();
    case 'listening': return renderListening();
    case 'thinking': return renderThinking(state.tick, state.partialDefensive);
    case 'showing': return renderShowing(state.q);
  }
}

export interface ResolveResult {
  q: Question;
  source: 'live' | 'short' | 'error' | 'stage' | 'mock';
  bytes: number;
  error?: string;
}

async function resolveQuestion(
  frames: Uint8Array[],
  stage: boolean,
  mock: boolean,
  memoryBlock: string | undefined,
  onPartialDefensive: (s: string) => void,
): Promise<ResolveResult> {
  const canned = (): Question => {
    return DEMO_QUESTIONS[Math.floor(Math.random() * DEMO_QUESTIONS.length)];
  };

  if (stage) return { q: canned(), source: 'stage', bytes: 0 };
  if (mock) return { q: canned(), source: 'mock', bytes: 0 };

  const pcm = concatBytes(frames);
  const MIN_PCM_BYTES = 2 * PCM_SAMPLE_RATE * 0.3;
  if (pcm.length < MIN_PCM_BYTES) {
    console.warn(`[dk-persona] audio too short (${pcm.length} bytes); falling back to canned`);
    return { q: canned(), source: 'short', bytes: pcm.length };
  }

  try {
    const wav = pcmToWav(pcm, PCM_SAMPLE_RATE);
    const q = await askGeminiAudio(wav, { onPartialDefensive }, memoryBlock);
    return { q, source: 'live', bytes: pcm.length };
  } catch (err) {
    const msg = String((err as Error)?.message || err).slice(0, 160);
    console.warn('[dk-persona] Gemini failed; falling back to canned:', msg);
    return { q: canned(), source: 'error', bytes: pcm.length, error: msg };
  }
}
