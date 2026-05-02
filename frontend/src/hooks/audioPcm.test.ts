import { describe, expect, it } from 'vitest';
import { downsampleFloat32To16k, floatTo16BitPcm } from './audioPcm';

describe('audioPcm helpers', () => {
  it('converts Float32 samples to signed 16-bit PCM little endian', () => {
    const pcm = floatTo16BitPcm(new Float32Array([-1, -0.5, 0, 0.5, 1]));
    const view = new DataView(pcm.buffer);

    expect(view.getInt16(0, true)).toBe(-32768);
    expect(view.getInt16(2, true)).toBe(-16384);
    expect(view.getInt16(4, true)).toBe(0);
    expect(view.getInt16(6, true)).toBe(16383);
    expect(view.getInt16(8, true)).toBe(32767);
  });

  it('downsamples 48kHz mono audio to 16kHz by averaging source windows', () => {
    const input = new Float32Array([1, 1, 1, 0, 0, 0, -1, -1, -1]);
    const output = downsampleFloat32To16k(input, 48000);

    expect(Array.from(output)).toEqual([1, 0, -1]);
  });

  it('returns a copy when input is already 16kHz', () => {
    const input = new Float32Array([0.1, 0.2]);
    const output = downsampleFloat32To16k(input, 16000);

    expect(output).not.toBe(input);
    expect(output.length).toBe(2);
    expect(output[0]).toBeCloseTo(0.1, 5);
    expect(output[1]).toBeCloseTo(0.2, 5);
  });
});
