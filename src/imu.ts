// Simple peak-to-peak gesture detector over a rolling IMU window.
//
// G2 delivers raw {x, y, z} accelerometer-ish samples through
// `sysEvent.imuData` when `imuControl(true, ImuReportPace.P100)` is active
// (~10 Hz). No built-in head-nod API, so we classify dominant-axis swings:
//
//   nod   = large peak-to-peak Δ on the y-axis (pitch: up/down head motion)
//   shake = large peak-to-peak Δ on the x-axis (yaw: left/right head motion)
//
// Thresholds are empirical — tune on real hardware. Defaults err toward
// "needs a real head gesture" to avoid false-positives during spirited
// parent speech.

export interface ImuSample {
  t: number;
  x: number;
  y: number;
  z: number;
}

export type Gesture = 'nod' | 'shake';

export interface GestureOptions {
  windowMs: number;     // rolling window
  threshold: number;    // peak-to-peak Δ to register (g-ish units)
  cooldownMs: number;   // silence after a trigger to avoid re-firing
  minSamples: number;   // ignore detector until the buffer is warm
}

const DEFAULTS: GestureOptions = {
  windowMs: 500,
  threshold: 0.45,
  cooldownMs: 800,
  minSamples: 5,
};

export class GestureDetector {
  private buf: ImuSample[] = [];
  private lastFireAt = 0;
  private opts: GestureOptions;

  constructor(opts: Partial<GestureOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  reset(): void {
    this.buf = [];
    this.lastFireAt = 0;
  }

  push(sample: ImuSample): Gesture | null {
    this.buf.push(sample);
    const cutoff = sample.t - this.opts.windowMs;
    while (this.buf.length > 0 && this.buf[0].t < cutoff) this.buf.shift();

    if (this.buf.length < this.opts.minSamples) return null;
    if (sample.t - this.lastFireAt < this.opts.cooldownMs) return null;

    const xs = this.buf.map((s) => s.x);
    const ys = this.buf.map((s) => s.y);
    const xPP = Math.max(...xs) - Math.min(...xs);
    const yPP = Math.max(...ys) - Math.min(...ys);

    if (yPP > this.opts.threshold && yPP > xPP * 1.2) {
      this.lastFireAt = sample.t;
      this.buf = [];
      return 'nod';
    }
    if (xPP > this.opts.threshold && xPP > yPP * 1.2) {
      this.lastFireAt = sample.t;
      this.buf = [];
      return 'shake';
    }
    return null;
  }
}
