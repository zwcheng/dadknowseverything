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
import { concatBytes, pcmToWav, toUint8Array } from './pcm';
import { askGeminiAudio, askGeminiText, geminiConfigured } from './gemini';
import { getStage, setStage, stageReason } from './stageMode';
import { nextTone, type Tone } from './tones';
import { nextMode, MODE_LABEL, type Mode } from './modes';
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
import { GestureDetector } from './imu';
import { TOPIC_IMAGE, IMAGE_CONTAINER_ID, IMAGE_CONTAINER_NAME, imageContainer, IMAGE_W, IMAGE_H, imagesEnabled } from './assets/topicImages';

const LISTEN_MAX_MS = 8000;
const SAVED_MS = 1400;
const TRANSCRIPT_MS = 700;
const SPINNER_TICK_MS = 100;
const IMU_REPORT_PACE = 100;   // ms = ~10 Hz
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

  const audioBuffer = useRef<Uint8Array[]>([]);
  const toneRef = useRef<Tone>('simple');
  const modeRef = useRef<Mode>('answer');
  const memoryRef = useRef<MemoryStore>(emptyStore()); // always up-to-date for async callers
  const stateRef = useRef<State>(initialState);
  const gestureDetector = useRef(new GestureDetector());
  const lastImageTopicRef = useRef<string>('');
  const [mode, setModeState] = useState<Mode>('answer');
  const [deviceStatus, setDeviceStatus] = useState<{ battery?: number; wearing?: boolean } | null>(null);
  const [parentName, setParentName] = useState<string>('');

  // Keep state mirrored for async callbacks (device status listener).
  useEffect(() => { stateRef.current = state; }, [state]);

  // Keep memoryRef mirrored so async Gemini calls see the latest store.
  useEffect(() => { memoryRef.current = memory; }, [memory]);

  // Bootstrap: load SDK / bridge, create the startup page, subscribe events,
  // seed or load the memory store (active kid + history).
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let statusUnsub: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const { bridge: b, mock } = await loadBridge();
      if (cancelled) return;
      setBridge(b);
      setIsMock(mock);

      const useImages = imagesEnabled();
      const card = textContainer({
        id: CARD_CONTAINER_ID,
        name: CARD_CONTAINER_NAME,
        content: renderIdle(),
        capture: true,
        // When images are on, shift the text container right so the icon
        // has space in the top-left corner of the 576×288 canvas.
        x: useImages ? (IMAGE_W + 12) : 0,
        width: useImages ? (576 - IMAGE_W - 12) : 576,
      });
      try {
        const startup: { containerTotalNum: number; textObject: unknown[]; imageObject?: unknown[] } = {
          containerTotalNum: useImages ? 2 : 1,
          textObject: [card],
        };
        if (useImages) startup.imageObject = [imageContainer()];
        await b.createStartUpPageContainer(startup);
      } catch (err) {
        console.warn('[wondercue] createStartUpPageContainer failed', err);
      }

      const store = await ensureActiveKid(b);
      if (cancelled) return;
      setMemory(store);

      // Best-effort user info seed — show "Hi, <name>" in the header if the
      // host app supplies it. Not required for the flow to work.
      b.getUserInfo?.().then((u) => { if (!cancelled && u?.name) setParentName(u.name); }).catch(() => {});

      statusUnsub = b.onDeviceStatusChanged?.((status) => {
        setDeviceStatus({ battery: status.batteryLevel, wearing: status.isWearing });
        // Quiet-Tech posture: if the parent takes the glasses off mid-listen,
        // stop the mic and return to idle. Don't fight for attention.
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
          audioBuffer.current.push(toUint8Array(ev.audioEvent.audioPcm));
          return;
        }
        // IMU samples for nod/shake gesture detection (active only while
        // SHOWING; see the effect below that toggles imuControl).
        if (ev.sysEvent?.imuData) {
          const d = ev.sysEvent.imuData;
          const g = gestureDetector.current.push({ t: Date.now(), x: d.x, y: d.y, z: d.z });
          if (g === 'nod') {
            setEventLog((log) => [`gesture:nod @${new Date().toLocaleTimeString()}`, ...log].slice(0, 8));
            dispatch({ type: 'double' });
          } else if (g === 'shake') {
            setEventLog((log) => [`gesture:shake @${new Date().toLocaleTimeString()}`, ...log].slice(0, 8));
            dispatch({ type: 'scroll-top' });
          }
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
      statusUnsub?.();
    };
  }, []);

  // Activate IMU only while a card is showing — battery hygiene and avoids
  // false triggers during speech. Gesture detector is also reset here so
  // stale motion from entering the state doesn't fire immediately.
  useEffect(() => {
    if (!bridge) return;
    if (state.kind === 'showing') {
      gestureDetector.current.reset();
      bridge.imuControl?.(true, IMU_REPORT_PACE).catch(() => {});
      return () => { bridge.imuControl?.(false).catch(() => {}); };
    }
  }, [state.kind, bridge]);

  // When the topic on the showing card changes, push the matching pixel-art
  // icon into the image container. Guarded by the images-enabled flag.
  useEffect(() => {
    if (!bridge) return;
    if (!imagesEnabled()) return;
    if (state.kind !== 'showing' && state.kind !== 'transcript') return;
    const topic = state.kind === 'showing' ? state.q.topic : state.q.topic;
    if (lastImageTopicRef.current === topic) return;
    lastImageTopicRef.current = topic;
    const data = TOPIC_IMAGE[topic];
    if (!data) return;
    bridge.updateImageRawData?.({
      containerID: IMAGE_CONTAINER_ID,
      containerName: IMAGE_CONTAINER_NAME,
      data,
    }).catch((err) => console.warn('[wondercue] updateImageRawData failed', err));
  }, [state, bridge]);

  // State-entry side effects.
  useEffect(() => {
    if (!bridge) return;
    let maxTimer: number | undefined;
    let savedTimer: number | undefined;
    let transcriptTimer: number | undefined;
    let spinnerInterval: number | undefined;
    let cancelled = false;

    if (state.kind === 'listening') {
      toneRef.current = activeInsights().preferredTone;
      modeRef.current = mode;
      audioBuffer.current = [];
      bridge.audioControl?.(true).catch(() => {});
      maxTimer = window.setTimeout(() => dispatch({ type: 'stop-listen' }), LISTEN_MAX_MS);
    } else if (state.kind === 'thinking') {
      spinnerInterval = window.setInterval(() => dispatch({ type: 'spinner-tick' }), SPINNER_TICK_MS);
      const retoneQ = state.retone?.q;
      const retoneKind = state.retone?.kind;
      const mem = currentMemoryBlock();
      if (retoneQ) {
        // A retone reuses the same question text but flips either the tone
        // (swipe-up) or the mode (swipe-down) before asking Gemini again.
        let nextToneVal = toneRef.current;
        let nextModeVal = modeRef.current;
        if (retoneKind === 'tone') {
          nextToneVal = nextTone(toneRef.current);
          toneRef.current = nextToneVal;
        } else if (retoneKind === 'mode') {
          nextModeVal = nextMode(modeRef.current);
          modeRef.current = nextModeVal;
          setModeState(nextModeVal);
        }
        (async () => {
          if (stage || !geminiConfigured()) {
            if (cancelled) return;
            dispatch({ type: 'heard', q: retoneQ, tone: nextToneVal, mode: nextModeVal });
            return;
          }
          try {
            const q = await askGeminiText(retoneQ.text, nextToneVal, nextModeVal, mem);
            if (cancelled) return;
            dispatch({ type: 'heard', q, tone: nextToneVal, mode: nextModeVal });
          } catch (err) {
            console.warn('[wondercue] retone failed; staying with prior q', err);
            if (cancelled) return;
            dispatch({ type: 'heard', q: retoneQ, tone: nextToneVal, mode: nextModeVal });
          }
        })();
      } else {
        bridge.audioControl?.(false).catch(() => {});
        const frames = audioBuffer.current;
        audioBuffer.current = [];
        (async () => {
          const tone = toneRef.current;
          const modeNow = modeRef.current;
          const q = await resolveQuestion(frames, stage, isMock, tone, modeNow, mem, (p) =>
            dispatch({ type: 'stream-say', partial: p })
          );
          if (cancelled) return;
          setLastQuestion(q.text);
          dispatch({ type: 'heard', q, tone, mode: modeNow });
        })();
      }
    } else if (state.kind === 'transcript') {
      transcriptTimer = window.setTimeout(() => dispatch({ type: 'show-cards' }), TRANSCRIPT_MS);
    } else if (state.kind === 'saved') {
      const activeKid = getActive(memoryRef.current);
      if (activeKid && bridge) {
        const moment = momentFromQuestion(activeKid.id, state.q, state.tone, state.mode);
        appendMoment(bridge, moment).then(setMemory).catch(() => {});
      }
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
  }, [state.kind, bridge, stage, isMock, mode]);

  // Mirror state → glasses display.
  useEffect(() => {
    if (!bridge) return;
    upgradeCard(bridge, renderForState(state)).catch(() => {});
  }, [state, bridge]);

  const devFire = (t: number) => {
    if (t === EventType.DOUBLE_CLICK) dispatch({ type: 'double' });
    else if (t === EventType.CLICK) dispatch({ type: 'click' });
    else if (t === EventType.SCROLL_TOP) dispatch({ type: 'scroll-top' });
    else if (t === EventType.SCROLL_BOTTOM) dispatch({ type: 'scroll-bottom' });
    setEventLog((log) => [`dev:${t} @${new Date().toLocaleTimeString()}`, ...log].slice(0, 8));
  };

  // Synthesize a head gesture by feeding the gesture detector directly
  // (bypasses the bridge entirely so the simulation works whether the real
  // SDK or the mock is loaded). Only useful during SHOWING because imuControl
  // is off elsewhere.
  // Synthesize a head gesture locally. Builds 6 samples spanning 300ms
  // with one dominant axis, feeds them into the same detector the real
  // IMU stream uses. Works whether the mock or real SDK is loaded.
  const devGesture = (kind: 'nod' | 'shake') => {
    const axisBig = kind === 'nod' ? 'y' : 'x';
    const peaks = [0, 0.6, -0.55, 0.4, -0.3, 0];
    const t0 = Date.now();
    let fired: 'nod' | 'shake' | null = null;
    for (let i = 0; i < peaks.length; i++) {
      const sample = { t: t0 + i * 60, x: 0, y: 0, z: 0 };
      (sample as any)[axisBig] = peaks[i];
      const g = gestureDetector.current.push(sample);
      if (g) { fired = g; break; }
    }
    if (fired === 'nod') {
      setEventLog((l) => [`gesture:nod(dev) @${new Date().toLocaleTimeString()}`, ...l].slice(0, 8));
      dispatch({ type: 'double' });
    } else if (fired === 'shake') {
      setEventLog((l) => [`gesture:shake(dev) @${new Date().toLocaleTimeString()}`, ...l].slice(0, 8));
      dispatch({ type: 'scroll-top' });
    }
  };

  // Simulate the glasses being removed (drives the same side-effect the real
  // onDeviceStatusChanged would fire with isWearing=false).
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
      if ((e.target as HTMLElement)?.matches?.('input, textarea, [contenteditable="true"]')) return;
      if (e.key === 'd' || e.key === 'D') devFire(EventType.DOUBLE_CLICK);
      else if (e.key === ' ' || e.key === 'Enter') devFire(EventType.CLICK);
      else if (e.key === 't' || e.key === 'T') devFire(EventType.SCROLL_TOP);
      else if (e.key === 'b' || e.key === 'B') devFire(EventType.SCROLL_BOTTOM);
      else if (e.key === 'n' || e.key === 'N') devGesture('nod');
      else if (e.key === 's' || e.key === 'S') devGesture('shake');
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

  // Mode toggle from the phone UI. If a card is currently showing, retone it
  // through the state machine so the card flips; otherwise just set the mode
  // so the next utterance uses it.
  const toggleMode = () => {
    const nxt = nextMode(mode);
    setModeState(nxt);
    modeRef.current = nxt;
    if (state.kind === 'showing') dispatch({ type: 'scroll-bottom' });
  };

  const saveProfile = async (p: KidProfile) => {
    if (!bridge) return;
    // Re-read the freshest store so concurrent appendMoment writes aren't
    // stomped by an in-memory snapshot.
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

  function activeInsights() {
    const active = getActive(memoryRef.current);
    const history = active ? historyFor(memoryRef.current, active.id) : [];
    return computeInsights(history);
  }

  const reason = stageReason();
  const keyConfigured = geminiConfigured();
  const currentTone: Tone | null =
    state.kind === 'showing' ? state.tone :
    state.kind === 'transcript' ? state.tone :
    null;
  const currentMode: Mode =
    state.kind === 'showing' ? state.mode :
    state.kind === 'transcript' ? state.mode :
    mode;
  const activeKid = getActive(memory);
  const history = historyFor(memory, activeKid?.id ?? null);
  const insights = computeInsights(history);

  return (
    <div className="wrap">
      <header>
        <h1>DadKnowsEVERYTHING</h1>
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
            {reason === 'no-key' && 'No API key — forced to stage mode'}
            {reason === 'user-toggle' && 'Canned Q/A, zero network'}
            {reason === 'off' && 'Audio → Gemini → Say / Ask / Try (streaming, memory-aware)'}
          </span>
          {currentTone && <span className="tone-chip">tone: {currentTone}</span>}
        </div>
        <div className="mode-row" style={{ marginTop: 8 }}>
          <button
            className={currentMode === 'answer' ? 'on' : 'off'}
            onClick={toggleMode}
            title="Swipe-down (or B) to toggle on glasses"
          >
            {MODE_LABEL[currentMode]}
          </button>
          <span className="mode-note">
            {currentMode === 'answer'
              ? 'Direct Say / Ask / Try — default posture'
              : 'Playful counter-question grounded in the kid\u2019s question · safety override in prompt'}
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
            <button onClick={() => devFire(EventType.DOUBLE_CLICK)}>double (D)</button>
            <button onClick={() => devFire(EventType.CLICK)}>click (Space)</button>
            <button onClick={() => devFire(EventType.SCROLL_TOP)}>swipe-up (T)</button>
            <button onClick={() => devFire(EventType.SCROLL_BOTTOM)}>swipe-down (B)</button>
            <button onClick={() => devGesture('nod')} title="Simulate a head nod (only fires when showing)">nod (N)</button>
            <button onClick={() => devGesture('shake')} title="Simulate a head shake (only fires when showing)">shake (S)</button>
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
    const interests = kid.interests.join(', ') || '—';
    return (
      <section className="profile">
        <div className="label">Kid profile · memory</div>
        <div className="profile-row">
          <div className="profile-summary">
            <strong>{kid.name}</strong> · age {kid.age} · {interests}
            <div className="profile-sub">
              {insights.totalMoments} Wonder Moments
              {insights.dominantTopic && ` · top topic: ${insights.dominantTopic}`}
              {insights.preferredTone && ` · preferred tone: ${insights.preferredTone}`}
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
        <div className="profile-sub">No saved moments yet. Double-press on a shown card to save.</div>
      ) : (
        <ul>
          {items.map((m) => (
            <li key={m.id}>
              <span className="topic">{m.topic}</span>
              <span className="t-q">{m.question}</span>
              <span className="t-say">{m.say}</span>
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
    case 'thinking': return renderThinking(state.tick);
    case 'transcript': return renderTranscript(state.q);
    case 'showing': return renderCard(state.q, state.card, state.tone, state.mode);
    case 'saved': return renderSaved(state.q);
  }
}

// Decide how to turn the captured audio into a Question.
async function resolveQuestion(
  frames: Uint8Array[],
  stage: boolean,
  mock: boolean,
  tone: Tone,
  mode: Mode,
  memoryBlock: string | undefined,
  onPartialSay: (s: string) => void,
): Promise<Question> {
  const canned = () => {
    const base = DEMO_QUESTIONS[Math.floor(Math.random() * DEMO_QUESTIONS.length)];
    if (mode === 'answer') return base;
    // Stage-mode Bounce: repurpose the canned content into the Bounce
    // shape so the demo works offline. Not as funny as live Gemini, but
    // the shape lets the whole flow run.
    return {
      ...base,
      say: `What color should the ${stagedNoun(base.text)} be?`.slice(0, 60),
      ask: `Who decides what colors things are?`.slice(0, 50),
      try: base.say.slice(0, 55),
    };
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
    return await askGeminiAudio(wav, tone, mode, { onPartialSay }, memoryBlock);
  } catch (err) {
    console.warn('[wondercue] Gemini failed; falling back to canned:', err);
    return canned();
  }
}

// Crude noun lift from a canned question text, just for the stage-mode Bounce
// fallback to feel grounded. Picks the last non-function word.
function stagedNoun(q: string): string {
  const stop = new Set(['the', 'a', 'an', 'is', 'are', 'out', 'in', 'at', 'on', 'of']);
  const words = q.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  for (let i = words.length - 1; i >= 0; i--) if (!stop.has(words[i])) return words[i];
  return 'thing';
}
