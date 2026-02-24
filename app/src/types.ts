export interface Message {
    id: string;
    type: 'user' | 'ai';
    text: string;
    timestamp: string;
    isTemporary?: boolean;
    audioData?: string;
}

export type Emotion = 'HAPPY' | 'SAD' | 'NEUTRAL' | 'THINKING' | 'SURPRISED' | 'ANGRY';

export type AppState = 'idle' | 'listening' | 'processing' | 'speaking';

export interface WebSocketMessage {
    type: 'transcript' | 'ai_response' | 'ai_stream_chunk' | 'ai_processing' | 'audio' | 'recording_started' | 'recording_stopped' | 'error' | 'stt_error' | 'user_speaking';
    text?: string;
    isFinal?: boolean;
    emotion?: Emotion;
    data?: string;
    message?: string;
    isProcessing?: boolean;
}

// Electron API type definitions
export interface ElectronAPI {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    platform: string;
    isElectron: boolean;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}
