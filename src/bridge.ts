// Thin wrapper over @evenrealities/even_hub_sdk.
// Normalizes the bridge surface for WonderCue and provides a mock fallback so
// the phone-side UI can render in plain Chrome (no simulator).
//
// Note: the SDK's real API takes **object** arguments (e.g.
// `textContainerUpgrade({ containerID, containerName, content })`). Events from
// a text container arrive on `event.textEvent`, not `sysEvent`.

type Unsub = () => void;

export interface StartupContainers {
  textObject?: unknown[];
  listObject?: unknown[];
  imageObject?: unknown[];
}

export interface TextUpgradeArg {
  containerID: number;
  containerName: string;
  content: string;
  contentOffset?: number;
  contentLength?: number;
}

export interface DeviceStatus {
  batteryLevel?: number;
  isWearing?: boolean;
  isCharging?: boolean;
  isInCase?: boolean;
  connectType?: number;
  [k: string]: unknown;
}

export interface UserInfo {
  uid?: number;
  name?: string;
  avatar?: string;
  country?: string;
  [k: string]: unknown;
}

export interface ImageUpdateArg {
  containerID: number;
  containerName: string;
  data: number[] | Uint8Array | string;
}

export interface EvenBridgeLike {
  createStartUpPageContainer: (arg: StartupContainers & { containerTotalNum?: number }) => Promise<number>;
  rebuildPageContainer: (arg: StartupContainers & { containerTotalNum?: number }) => Promise<boolean>;
  textContainerUpgrade: (arg: TextUpgradeArg) => Promise<boolean>;
  updateImageRawData?: (arg: ImageUpdateArg) => Promise<string | boolean>;
  shutDownPageContainer?: (exitMode?: number) => Promise<boolean>;
  audioControl?: (isOpen: boolean) => Promise<boolean>;
  imuControl?: (isOpen: boolean, reportFrq?: number) => Promise<boolean>;
  getDeviceInfo?: () => Promise<unknown>;
  getUserInfo?: () => Promise<UserInfo>;
  setLocalStorage?: (key: string, value: string) => Promise<boolean>;
  getLocalStorage?: (key: string) => Promise<string>;
  onEvenHubEvent: (cb: (event: AnyEvent) => void) => Unsub;
  onDeviceStatusChanged?: (cb: (status: DeviceStatus) => void) => Unsub;
}

export interface AnyEvent {
  textEvent?: { eventType?: number; containerID?: number; containerName?: string };
  listEvent?: { eventType?: number; containerID?: number; containerName?: string; currentSelectItemIndex?: number };
  sysEvent?: { eventType?: number; imuData?: { x: number; y: number; z: number }; [k: string]: unknown };
  audioEvent?: { audioPcm?: Uint8Array | number[] | string };
  [k: string]: unknown;
}

// Mirrors SDK's OsEventTypeList.
export const EventType = {
  CLICK: 0,
  SCROLL_TOP: 1,
  SCROLL_BOTTOM: 2,
  DOUBLE_CLICK: 3,
  FOREGROUND_ENTER: 4,
  FOREGROUND_EXIT: 5,
  ABNORMAL_EXIT: 6,
  SYSTEM_EXIT: 7,
  IMU_DATA_REPORT: 8,
} as const;

// Pulls a normalized eventType off an EvenHubEvent regardless of which payload
// envelope it came in on (text container vs list container vs sys event).
export function getEventType(ev: AnyEvent): number | undefined {
  return ev.textEvent?.eventType ?? ev.listEvent?.eventType ?? ev.sysEvent?.eventType;
}

let cached: EvenBridgeLike | null = null;
let isMock = false;
let sdkCache: any = null;

export async function loadBridge(timeoutMs = 1500): Promise<{ bridge: EvenBridgeLike; mock: boolean }> {
  if (cached) return { bridge: cached, mock: isMock };

  try {
    sdkCache = await import('@evenrealities/even_hub_sdk');
    // Expose the SDK module globally so small helper files (topicImages,
    // textContainer builder) can pull class constructors without carrying
    // the import themselves.
    (window as any).__evenSdkCache = sdkCache;
    const real = await Promise.race<EvenBridgeLike | null>([
      sdkCache.waitForEvenAppBridge() as Promise<EvenBridgeLike>,
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (real) {
      cached = real;
      isMock = false;
      return { bridge: cached, mock: false };
    }
  } catch (err) {
    console.warn('[wondercue] SDK import or bridge wait failed; using mock.', err);
  }

  cached = createMockBridge();
  isMock = true;
  return { bridge: cached, mock: true };
}

function createMockBridge(): EvenBridgeLike {
  const listeners = new Set<(e: AnyEvent) => void>();
  const statusListeners = new Set<(s: DeviceStatus) => void>();
  (window as any).__wcMockFire = (eventType: number) => {
    for (const cb of listeners) cb({ textEvent: { eventType, containerID: 1, containerName: 'card' } });
  };
  // Synthesize a short IMU burst mimicking a nod (large y swing) or
  // shake (large x swing) so the detector can be exercised in plain
  // Chrome without hardware.
  (window as any).__wcMockImuBurst = (kind: 'nod' | 'shake' = 'nod') => {
    const axisBig = kind === 'nod' ? 'y' : 'x';
    const axisSmall = kind === 'nod' ? 'x' : 'y';
    const peaks = [0, 0.6, -0.5, 0.4, -0.3, 0];
    peaks.forEach((p, i) => {
      setTimeout(() => {
        const sample: any = { x: 0, y: 0, z: 0 };
        sample[axisBig] = p;
        sample[axisSmall] = p * 0.1;
        for (const cb of listeners) cb({ sysEvent: { eventType: 8, imuData: sample } });
      }, i * 60);
    });
  };
  (window as any).__wcMockStatus = (patch: Partial<DeviceStatus>) => {
    for (const cb of statusListeners) cb({ batteryLevel: 85, isWearing: true, isCharging: false, isInCase: false, ...patch });
  };
  return {
    async createStartUpPageContainer(arg) {
      console.info('[mock] createStartUpPageContainer', arg);
      return 0;
    },
    async rebuildPageContainer(arg) {
      console.info('[mock] rebuildPageContainer', arg);
      return true;
    },
    async textContainerUpgrade(arg) {
      console.info('[mock] textContainerUpgrade', arg);
      return true;
    },
    async updateImageRawData(arg) {
      console.info('[mock] updateImageRawData', { id: arg.containerID, len: Array.isArray(arg.data) ? arg.data.length : undefined });
      return 'success';
    },
    async audioControl(open) {
      console.info('[mock] audioControl', open);
      return true;
    },
    async imuControl(open, freq) {
      console.info('[mock] imuControl', open, freq);
      return true;
    },
    async getUserInfo() {
      return { uid: 0, name: 'Parent', country: 'US' };
    },
    async setLocalStorage(k, v) {
      localStorage.setItem(`wc:${k}`, v);
      return true;
    },
    async getLocalStorage(k) {
      return localStorage.getItem(`wc:${k}`) ?? '';
    },
    onEvenHubEvent(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    onDeviceStatusChanged(cb) {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
  };
}

// Build a TextContainerProperty instance (uses the real SDK class when loaded
// so the underlying protobuf normalization runs; falls back to a plain object).
export function textContainer(opts: {
  id: number;
  name: string;
  content: string;
  capture?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  padding?: number;
  borderWidth?: number;
  borderColor?: number;
}): unknown {
  const base = {
    xPosition: opts.x ?? 0,
    yPosition: opts.y ?? 0,
    width: opts.width ?? 576,
    height: opts.height ?? 288,
    borderWidth: opts.borderWidth ?? 0,
    borderColor: opts.borderColor ?? 5,
    paddingLength: opts.padding ?? 6,
    containerID: opts.id,
    containerName: opts.name,
    content: opts.content,
    isEventCapture: opts.capture ? 1 : 0,
  };
  if (sdkCache?.TextContainerProperty) return new sdkCache.TextContainerProperty(base);
  return base;
}
