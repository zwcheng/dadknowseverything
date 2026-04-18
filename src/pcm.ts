// Small audio utilities: normalize the bridge's audioPcm payload (which may
// arrive as Uint8Array, number[], or base64 string), concatenate frames, and
// wrap them in a WAV container for Gemini's generateContent inlineData.

export function toUint8Array(input: unknown): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (Array.isArray(input)) return new Uint8Array(input as number[]);
  if (typeof input === 'string') {
    const bin = atob(input);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return new Uint8Array(0);
}

export function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

// Minimal RIFF/WAVE header for PCM16 mono data.
export function pcmToWav(pcmBytes: Uint8Array, sampleRate: number): Uint8Array {
  const dataLen = pcmBytes.length;
  const buf = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buf);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);        // PCM fmt chunk size
  view.setUint16(20, 1, true);         // PCM format
  view.setUint16(22, 1, true);         // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);         // block align
  view.setUint16(34, 16, true);        // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataLen, true);
  new Uint8Array(buf, 44).set(pcmBytes);
  return new Uint8Array(buf);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    s += String.fromCharCode.apply(null, Array.from(sub) as number[]);
  }
  return btoa(s);
}
