import { useState, useEffect, useRef, useCallback } from 'react';
import { Message, AppState, WebSocketMessage, Emotion } from '../types';
import { SettingsData } from '../components/Settings';
import { WS_CHAT_URL } from '../config/api';

export const useAudioStream = (settings?: SettingsData) => {
    const [isConnected, setIsConnected] = useState(false);
    const [appState, setAppState] = useState<AppState>('idle');
    const [transcript, setTranscript] = useState('');
    const [emotion, setEmotion] = useState<Emotion>('NEUTRAL');
    const [messages, setMessages] = useState<Message[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [streamingAiText, setStreamingAiText] = useState<string>('');
    const [isAiProcessing, setIsAiProcessing] = useState(false);

    const socketRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<number | null>(null);
    const reconnectAttemptRef = useRef(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioQueueRef = useRef<ArrayBuffer[]>([]);
    const isPlayingRef = useRef(false);
    const currentSettingsRef = useRef<SettingsData | undefined>(settings);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const isConversationActiveRef = useRef(false);

    // Audio Analysis for Visualization
    const [inputAnalyser, setInputAnalyser] = useState<AnalyserNode | null>(null);
    const [outputAnalyser, setOutputAnalyser] = useState<AnalyserNode | null>(null);
    const handleWebSocketMessageRef = useRef<(data: WebSocketMessage) => void | Promise<void>>(() => { });
    const lastVoiceActivityAtRef = useRef<number | null>(null);
    const didAutoStopSegmentRef = useRef(false);

    // Audio storage for playback
    const currentAiAudioChunksRef = useRef<string[]>([]);
    const userRecordedAudioRef = useRef<Blob[]>([]);

    // Track connection state to avoid duplicate connects
    const isConnectingRef = useRef(false);
    // Track appState in ref for use in callbacks
    const appStateRef = useRef<AppState>('idle');
    useEffect(() => { appStateRef.current = appState; }, [appState]);

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
                userRecordedAudioRef.current = [];
                break;

            case 'recording_stopped':
                break;

            case 'transcript':
                if (data.text) {
                    setTranscript(data.text);
                    if (data.isFinal) {
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
                setStreamingAiText('');
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
                audioQueueRef.current = [];
                if (isPlayingRef.current) {
                    isPlayingRef.current = false;
                    setAppState('listening');
                }
                break;

            case 'error':
            case 'stt_error':
                setError(data.message || 'Có lỗi xảy ra');
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

    // --- Audio Recording ---
    const startRecording = async () => {
        isConversationActiveRef.current = true;
        setIsConversationActive(true);
        await _startMediaRecorder();
    };

    const _startMediaRecorder = async () => {
        try {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                return;
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

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

            const source = audioContextRef.current.createMediaStreamSource(stream);
            const analyser = audioContextRef.current.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            setInputAnalyser(analyser);
            lastVoiceActivityAtRef.current = performance.now();
            didAutoStopSegmentRef.current = false;

            const chunks: Blob[] = [];

            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunks.push(event.data);
                    userRecordedAudioRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                if (chunks.length === 0) return;

                const audioBlob = new Blob(chunks, { type: 'audio/webm' });
                console.log(`📦 Audio recorded: ${audioBlob.size} bytes, ${chunks.length} chunks`);

                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    const base64Audio = (reader.result as string).split(',')[1];
                    if (socketRef.current?.readyState === WebSocket.OPEN) {
                        socketRef.current.send(JSON.stringify({
                            type: 'audio_complete',
                            data: base64Audio,
                            mimeType: 'audio/webm'
                        }));
                    }
                };
            };

            mediaRecorder.start(100);
            mediaRecorderRef.current = mediaRecorder;

            setAppState('listening');
            setTranscript('');

        } catch (err) {
            console.error('Microphone Error:', err);
            setError('Không thể truy cập microphone');
            isConversationActiveRef.current = false;
        }
    };

    // Client-side silence detection
    useEffect(() => {
        if (appState !== 'listening' || !inputAnalyser || !isConversationActiveRef.current) return;

        const SILENCE_MS = 1500;
        const RMS_THRESHOLD = 0.01;

        const dataArray = new Uint8Array(inputAnalyser.fftSize);
        const intervalId = window.setInterval(() => {
            if (appStateRef.current !== 'listening') return;
            if (mediaRecorderRef.current?.state !== 'recording') return;

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
                return;
            }

            const last = lastVoiceActivityAtRef.current;
            if (last == null) {
                lastVoiceActivityAtRef.current = now;
                return;
            }

            if (!didAutoStopSegmentRef.current && now - last >= SILENCE_MS) {
                didAutoStopSegmentRef.current = true;
                setAppState('processing');

                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                    mediaRecorderRef.current.stop();
                }

                if (mediaStreamRef.current) {
                    mediaStreamRef.current.getTracks().forEach((track) => track.stop());
                    mediaStreamRef.current = null;
                }
            }
        }, 100);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [appState, inputAnalyser]);

    const stopRecording = useCallback(() => {
        isConversationActiveRef.current = false;
        setIsConversationActive(false);
        stopMediaRecorder();
    }, []);

    const stopMediaRecorder = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }

        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
        }
    };

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
                    _startMediaRecorder();
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

            source.onended = () => {
                playNextInQueue();
            };
            source.start(0);
        } catch (err) {
            console.error('Audio decode error:', err);
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
    };
};
