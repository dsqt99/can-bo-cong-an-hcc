const TARGET_SAMPLE_RATE = 16000;

export const downsampleFloat32To16k = (input: Float32Array, sourceSampleRate: number): Float32Array => {
  if (sourceSampleRate === TARGET_SAMPLE_RATE) {
    return new Float32Array(input);
  }

  if (sourceSampleRate < TARGET_SAMPLE_RATE) {
    throw new Error(`Source sample rate ${sourceSampleRate} is below ${TARGET_SAMPLE_RATE}`);
  }

  const ratio = sourceSampleRate / TARGET_SAMPLE_RATE;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    let count = 0;

    for (let j = start; j < end; j += 1) {
      sum += input[j];
      count += 1;
    }

    output[i] = count > 0 ? sum / count : 0;
  }

  return output;
};

export const floatTo16BitPcm = (input: Float32Array): Int16Array => {
  const output = new Int16Array(input.length);

  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return output;
};

export const pcm16ToArrayBuffer = (pcm: Int16Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(pcm.length * 2);
  const view = new DataView(buffer);

  for (let i = 0; i < pcm.length; i += 1) {
    view.setInt16(i * 2, pcm[i], true);
  }

  return buffer;
};
