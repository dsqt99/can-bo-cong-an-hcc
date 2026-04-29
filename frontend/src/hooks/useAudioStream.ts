import { useState, useEffect, useRef, useCallback } from 'react';
import { Message, AppState, WebSocketMessage, Emotion, SessionHistoryItem } from '../types';
import { SettingsData } from '../components/Settings';
import { WS_CHAT_URL } from '../config/api';

const SESSION_HISTORY_KEY = 'voiceBotSessionHistoryV1';

interface SessionArchive extends SessionHistoryItem {
  messages: Message[];
}

export const useAudioStream = (settings?: SettingsData) => {
  const [isConnected, setIsConnected] = useState(false);
  const [appState, setAppState] = useState<AppState>('idle');
  const [transcript, setTranscript] = useState('');
  const [emotion, setEmotion] = useState<Emotion>('NEUTRAL');
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [streamingAiText, setStreamingAiText] = useState<string>('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isSttProcessing, setIsSttProcessing] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const currentSettingsRef = useRef<SettingsData | undefined>(settings);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const isConversationActiveRef = useRef(false);

  // Track current playing audio source for barge-in interruption
  const currentSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  // Audio Analysis for Visualization
  const [inputAnalyser, setInputAnalyser] = useState<AnalyserNode | null>(null);
  const [outputAnalyser, setOutputAnalyser] = useState<AnalyserNode | null>(null);
  const handleWebSocketMessageRef = useRef<(data: WebSocketMessage) => void | Promise<void>>(() => { });

  // Audio storage for playback
  const currentAiAudioChunksRef = useRef<string[]>([]);
  const userRecordedAudioRef = useRef<Blob[]>([]);

  // Track connection state to avoid duplicate connects
  const isConnectingRef = useRef(false);

  // Streaming audio refs (MediaRecorder for recording + AudioWorklet/ScriptProcessor for streaming)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null);

  // Silence detection refs
  const lastVoiceActivityAtRef = useRef<number | null>(null);
  const didAutoStopSegmentRef = useRef(false);
  const firstVoiceDetectedRef = useRef(false);

  const loadSessionArchives = (): SessionArchive[] => {
    try {
      const raw = localStorage.getItem(SESSION_HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((x) => x && typeof x.id === 'string' && Array.isArray(x.messages));
    } catch {
      return [];
    }
  };

  const persistSessionArchives = (archives: SessionArchive[]) => {
    // Strip heavy audioData from messages before persisting to avoid QuotaExceededError
    const stripped = archives.map((session) => ({
      ...session,
      messages: session.messages.map((msg) => ({
        ...msg,
        audioData: undefined, // Never persist audio blobs to localStorage
      })),
    }));

    // Try to save, progressively trim if quota exceeded
    const tryStore = (data: SessionArchive[]) => {
      try {
        localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(data));
      } catch (e) {
        if (data.length > 1) {
          // Drop the oldest session and retry
          tryStore(data.slice(0, data.length - 1));
        } else {
          // Cannot even store 1 session – clear and give up gracefully
          try { localStorage.removeItem(SESSION_HISTORY_KEY); } catch (_) { /* ignore */ }
          console.warn('localStorage quota exceeded – session history cleared');
        }
      }
    };

    tryStore(stripped);

    setSessionHistory(
      archives
        .map(({ id, title, updatedAt, messageCount, lastPreview }) => ({ id, title, updatedAt, messageCount, lastPreview }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    );
  };

  const makeSessionTitle = (sessionMessages: Message[]) => {
    const firstUserMessage = sessionMessages.find((m) => m.type === 'user')?.text?.trim();
    if (firstUserMessage) {
      return firstUserMessage.length > 40 ? `${firstUserMessage.slice(0, 40)}…` : firstUserMessage;
    }
    return 'Phiên hội thoại';
  };

  const snapshotCurrentSessionToHistory = useCallback((sessionMessages: Message[]) => {
    if (!sessionMessages.length) return;
    const id = sessionId || `local-${Date.now()}`;
    const now = new Date().toISOString();
    const archive: SessionArchive = {
      id,
      title: makeSessionTitle(sessionMessages),
      updatedAt: now,
      messageCount: sessionMessages.length,
      lastPreview: sessionMessages[sessionMessages.length - 1]?.text?.slice(0, 60) || '',
      messages: sessionMessages,
    };

    const existing = loadSessionArchives();
    const withoutCurrent = existing.filter((x) => x.id !== id);
    persistSessionArchives([archive, ...withoutCurrent].slice(0, 20)); // cap at 20 sessions
  }, [sessionId]);

  // Track appState in ref for use in callbacks
  const appStateRef = useRef<AppState>('idle');
  useEffect(() => { appStateRef.current = appState; }, [appState]);

  useEffect(() => {
    persistSessionArchives(loadSessionArchives());
  }, []);

  useEffect(() => {
    if (!sessionId || messages.length === 0) return;
    snapshotCurrentSessionToHistory(messages);
  }, [messages, sessionId, snapshotCurrentSessionToHistory]);

  // --- WebSocket Connection ---
  useEffect(() => {
    let isMounted = true;

    const connect = () => {
      if (isConnectingRef.current) return;
      isConnectingRef.current = true;

      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (socketRef.current) {
        try {
          socketRef.current.onclose = null;
          socketRef.current.close();
        } catch (_) { /* ignore */ }
        socketRef.current = null;
      }

      const socket = new WebSocket(WS_CHAT_URL);

      socket.onopen = () => {
        if (!isMounted) return;
        console.log('WebSocket Connected');
        setIsConnected(true);
        setError(null);
        reconnectAttemptRef.current = 0;
        isConnectingRef.current = false;
      };

      socket.onclose = () => {
        if (!isMounted) return;
        console.log('WebSocket Disconnected');
        setIsConnected(false);
        isConnectingRef.current = false;
        const attempt = reconnectAttemptRef.current + 1;
        reconnectAttemptRef.current = attempt;
        const delayMs = Math.min(5000, 500 * attempt);
        reconnectTimeoutRef.current = window.setTimeout(() => {
          if (isMounted) connect();
        }, delayMs);
      };

      socket.onerror = (err) => {
        console.error('WebSocket Error:', err);
        if (isMounted) setError('Kết nối thất bại. Đang thử lại...');
        isConnectingRef.current = false;
        try { socket.close(); } catch (_) { /* ignore */ }
      };

      socket.onmessage = async (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          handleWebSocketMessageRef.current(data);
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };

      socketRef.current = socket;
    };

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
      }
      isConnectingRef.current = false;
    };
  }, []);

  // --- Message Handling ---
  const handleWebSocketMessage = async (data: WebSocketMessage) => {
    switch (data.type) {
      case 'recording_started':
        setAppState('listening');
        setTranscript('');
        setIsSttProcessing(false);
        userRecordedAudioRef.current = [];
        break;

      case 'session_init':
        if (data.session_id) {
          setSessionId(data.session_id);
        }
        break;

      case 'recording_stopped':
        break;

      case 'transcript':
        if (data.text) {
          setTranscript(data.text);
          setIsSttProcessing(true);
          if (data.isFinal) {
            setIsSttProcessing(false);
            // Save user message
            if (userRecordedAudioRef.current.length > 0) {
              const audioBlob = new Blob(userRecordedAudioRef.current, { type: 'audio/webm' });
              const reader = new FileReader();
              reader.readAsDataURL(audioBlob);
              reader.onloadend = () => {
                const base64String = (reader.result as string).split(',')[1];
                addMessage('user', data.text!, base64String);
                userRecordedAudioRef.current = [];
              };
            } else {
              addMessage('user', data.text);
            }
            setAppState('processing');
          }
        }
        break;

      case 'ai_processing':
        setIsAiProcessing(data.isProcessing ?? true);
        if (data.isProcessing) {
          setStreamingAiText('');
        }
        break;

      case 'stt_processing':
        setIsSttProcessing(data.isProcessing ?? true);
        break;

      case 'ai_stream_chunk':
        if (data.text) {
          setStreamingAiText(data.text);
          setIsAiProcessing(false);
        }
        break;

      case 'ai_response':
        if (data.text) {
          const combinedAudio = currentAiAudioChunksRef.current.length > 0
            ? currentAiAudioChunksRef.current.join('|')
            : undefined;
          addMessage('ai', data.text, combinedAudio);
          currentAiAudioChunksRef.current = [];
          setStreamingAiText('');
          setIsAiProcessing(false);
          if (data.emotion) setEmotion(data.emotion);
          setAppState('speaking');
        }
        break;

      case 'audio':
        if (data.data) {
          currentAiAudioChunksRef.current.push(data.data);
          const binaryString = window.atob(data.data);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          queueAudio(bytes.buffer);
        }
        break;

      case 'user_speaking':
        // Barge-in: immediately stop all audio playback
        audioQueueRef.current = [];
        if (currentSourceNodeRef.current) {
          try {
            currentSourceNodeRef.current.onended = null;
            currentSourceNodeRef.current.stop();
          } catch (_) { /* already stopped */ }
          currentSourceNodeRef.current = null;
        }
        isPlayingRef.current = false;
        setOutputAnalyser(null);
        // Transition to listening if conversation is active
        if (isConversationActiveRef.current) {
          setAppState('listening');
        } else {
          setAppState('idle');
        }
        break;

      case 'error':
      case 'stt_error':
        setError(data.message || 'Có lỗi xảy ra');
        setIsSttProcessing(false);
        setIsAiProcessing(false);
        setAppState('idle');
        break;
    }
  };

  useEffect(() => {
    handleWebSocketMessageRef.current = handleWebSocketMessage;
  });

  const addMessage = (type: 'user' | 'ai', text: string, audioData?: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        type,
        text,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        audioData,
      },
    ]);
  };

  const sendChatMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    stopMediaRecorder();
    setTranscript('');
    addMessage('user', trimmed);
    setAppState('processing');

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'chat_message', text: trimmed }));
    } else {
      setError('Chưa kết nối tới server');
      setAppState('idle');
    }
  };

  useEffect(() => {
    currentSettingsRef.current = settings;
  }, [settings]);

  const [isConversationActive, setIsConversationActive] = useState(false);

  // --- Barge-in: interrupt AI playback ---
  const interruptPlayback = () => {
    audioQueueRef.current = [];
    if (currentSourceNodeRef.current) {
      try {
        currentSourceNodeRef.current.onended = null;
        currentSourceNodeRef.current.stop();
      } catch (_) { /* already stopped */ }
      currentSourceNodeRef.current = null;
    }
    isPlayingRef.current = false;
    setOutputAnalyser(null);
    currentAiAudioChunksRef.current = [];
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'user_speaking' }));
    }
  };

  // --- Audio Recording with real-time streaming ---
  const startRecording = async () => {
    isConversationActiveRef.current = true;
    setIsConversationActive(true);
    await _startStreamingRecording();
  };

  const _startStreamingRecording = async () => {
    try {
      // If AI is currently speaking, interrupt it (barge-in)
      if (appStateRef.current === 'speaking' || isPlayingRef.current) {
        interruptPlayback();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Setup AudioContext
      if (!audioContextRef.current) {
        const AudioContextConstructor =
          window.AudioContext ??
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextConstructor) {
          throw new Error('AudioContext is not supported');
        }
        audioContextRef.current = new AudioContextConstructor();
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Setup Analyser for Microphone visualization
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      setInputAnalyser(analyser);

      // Tell backend to start STT stream
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'audio_stream_start' }));
      }

      // Use MediaRecorder to capture audio as webm chunks and stream to backend
      const chunks: Blob[] = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
          userRecordedAudioRef.current.push(event.data);

          // Stream the chunk to backend as binary
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            event.data.arrayBuffer().then((buffer) => {
              if (socketRef.current?.readyState === WebSocket.OPEN) {
                socketRef.current.send(buffer);
              }
            });
          }
        }
      };

      mediaRecorder.onstop = () => {
        // Signal backend to stop STT stream
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ type: 'audio_stream_stop' }));
        }
      };

      mediaRecorder.start(100); // Send chunks every 100ms
      mediaRecorderRef.current = mediaRecorder;

      // Reset silence detection refs
      lastVoiceActivityAtRef.current = performance.now();
      didAutoStopSegmentRef.current = false;
      firstVoiceDetectedRef.current = false;

      // Set state
      setAppState('listening');
      setTranscript('');

    } catch (err) {
      console.error('Microphone Error:', err);
      setError('Không thể truy cập microphone');
      isConversationActiveRef.current = false;
    }
  };

  const stopRecording = useCallback(() => {
    isConversationActiveRef.current = false;
    setIsConversationActive(false);
    stopMediaRecorder();
    setAppState('processing');
  }, []);

  const stopMediaRecorder = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop(); // This triggers onstop → sends audio_stream_stop
    }
    mediaRecorderRef.current = null;

    if (workletNodeRef.current) {
      try {
        (workletNodeRef.current as any).disconnect?.();
      } catch (_) { /* ignore */ }
      workletNodeRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  // Client-side silence detection — auto-stop after SILENCE_MS of quiet
  useEffect(() => {
    if (appState !== 'listening' || !inputAnalyser || !isConversationActiveRef.current) return;

    const SILENCE_MS = 1800;
    const RMS_THRESHOLD = 0.015;

    const dataArray = new Uint8Array(inputAnalyser.fftSize);
    const intervalId = window.setInterval(() => {
      if (appStateRef.current !== 'listening') return;
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return;

      inputAnalyser.getByteTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sumSquares += v * v;
      }

      const rms = Math.sqrt(sumSquares / dataArray.length);
      const now = performance.now();

      if (rms > RMS_THRESHOLD) {
        lastVoiceActivityAtRef.current = now;
        if (!firstVoiceDetectedRef.current) {
          firstVoiceDetectedRef.current = true;
        }
        return;
      }

      // Don't trigger silence detection until user has spoken at least once
      if (!firstVoiceDetectedRef.current) {
        lastVoiceActivityAtRef.current = now;
        return;
      }

      const last = lastVoiceActivityAtRef.current;
      if (last == null) {
        lastVoiceActivityAtRef.current = now;
        return;
      }

      if (!didAutoStopSegmentRef.current && now - last >= SILENCE_MS) {
        didAutoStopSegmentRef.current = true;
        console.log('🔇 Silence detected, auto-stopping recording for STT finalization');
        setAppState('processing');
        stopMediaRecorder();
      }
    }, 100);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [appState, inputAnalyser]);


  // --- Audio Playback Queue ---
  const queueAudio = (buffer: ArrayBuffer) => {
    audioQueueRef.current.push(buffer);
    if (!isPlayingRef.current) {
      playNextInQueue();
    }
  };

  const playNextInQueue = async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setOutputAnalyser(null);

      if (currentAiAudioChunksRef.current.length > 0) {
        const combinedAudio = currentAiAudioChunksRef.current.join('|');
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.type === 'ai') {
            if (lastMsg.audioData) return prev;
            const newMessages = [...prev];
            newMessages[prev.length - 1] = {
              ...lastMsg,
              audioData: combinedAudio
            };
            return newMessages;
          }
          return prev;
        });
        currentAiAudioChunksRef.current = [];
      }

      if (appStateRef.current === 'speaking') {
        if (isConversationActiveRef.current) {
          _startStreamingRecording();
        } else {
          setAppState('idle');
          setEmotion('NEUTRAL');
        }
      }
      return;
    }

    isPlayingRef.current = true;
    setAppState('speaking');

    if (!audioContextRef.current) {
      const AudioContextConstructor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) {
        throw new Error('AudioContext is not supported');
      }
      audioContextRef.current = new AudioContextConstructor();
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    const nextBuffer = audioQueueRef.current.shift();
    if (!nextBuffer) return;

    try {
      const audioBuffer = await audioContextRef.current.decodeAudioData(nextBuffer);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(audioContextRef.current.destination);
      setOutputAnalyser(analyser);

      currentSourceNodeRef.current = source;

      source.onended = () => {
        currentSourceNodeRef.current = null;
        playNextInQueue();
      };
      source.start(0);
    } catch (err) {
      console.error('Audio decode error:', err);
      currentSourceNodeRef.current = null;
      playNextInQueue();
    }
  };

  const updateSettings = useCallback((newSettings: SettingsData) => {
    currentSettingsRef.current = newSettings;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'update_settings',
        settings: newSettings
      }));
    }
  }, []);

  const clearCurrentSession = useCallback(async () => {
    snapshotCurrentSessionToHistory(messages);
    setMessages([]);
    setTranscript('');
    setStreamingAiText('');
    setIsAiProcessing(false);
    setIsSttProcessing(false);
    setAppState('idle');

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'new_session' }));
    }
  }, [messages, snapshotCurrentSessionToHistory]);

  const loadSessionFromHistory = useCallback((historyId: string) => {
    const archives = loadSessionArchives();
    const found = archives.find((x) => x.id === historyId);
    if (!found) return;
    setMessages(found.messages || []);
    setTranscript('');
    setStreamingAiText('');
    setIsAiProcessing(false);
    setIsSttProcessing(false);
    setAppState('idle');
  }, []);

  return {
    isConnected,
    appState,
    transcript,
    emotion,
    messages,
    error,
    startRecording,
    stopRecording,
    sendChatMessage,
    updateSettings,
    isConversationActive,
    inputAnalyser,
    outputAnalyser,
    streamingAiText,
    isAiProcessing,
    isSttProcessing,
    sessionId,
    sessionHistory,
    clearCurrentSession,
    loadSessionFromHistory,
  };
};
