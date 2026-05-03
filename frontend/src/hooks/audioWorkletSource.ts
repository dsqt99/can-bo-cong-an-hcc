import { downsampleFloat32To16k, floatTo16BitPcm, pcm16ToArrayBuffer } from './audioPcm';
import { createPcmWorkletUrl } from './audioWorkletProcessor';

interface StartPcmCaptureOptions {
  audioContext: AudioContext;
  stream: MediaStream;
  onPcmChunk: (chunk: ArrayBuffer) => void;
}

interface PcmCaptureHandle {
  source: MediaStreamAudioSourceNode;
  node: AudioWorkletNode | ScriptProcessorNode;
  stop: () => void;
}

const emitPcm = (samples: Float32Array, sampleRate: number, onPcmChunk: (chunk: ArrayBuffer) => void) => {
  const downsampled = downsampleFloat32To16k(samples, sampleRate);
  if (downsampled.length === 0) return;
  const pcm = floatTo16BitPcm(downsampled);
  onPcmChunk(pcm16ToArrayBuffer(pcm));
};

export const startPcmCapture = async ({
  audioContext,
  stream,
  onPcmChunk,
}: StartPcmCaptureOptions): Promise<PcmCaptureHandle> => {
  const source = audioContext.createMediaStreamSource(stream);

  if (audioContext.audioWorklet) {
    try {
      const url = createPcmWorkletUrl();
      await audioContext.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);

      const node = new AudioWorkletNode(audioContext, 'pcm-capture-processor');
      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        emitPcm(event.data, audioContext.sampleRate, onPcmChunk);
      };
      source.connect(node);

      return {
        source,
        node,
        stop: () => {
          node.port.onmessage = null;
          source.disconnect();
          node.disconnect();
        },
      };
    } catch (error) {
      console.warn('AudioWorklet failed, falling back to ScriptProcessor:', error);
    }
  }

  const node = audioContext.createScriptProcessor(4096, 1, 1);
  node.onaudioprocess = (event) => {
    emitPcm(event.inputBuffer.getChannelData(0), audioContext.sampleRate, onPcmChunk);
  };
  source.connect(node);
  node.connect(audioContext.destination);

  return {
    source,
    node,
    stop: () => {
      node.onaudioprocess = null;
      source.disconnect();
      node.disconnect();
    },
  };
};
