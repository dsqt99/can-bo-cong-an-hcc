export interface Message {
  id: string;
  type: 'user' | 'ai';
  text: string;
  timestamp: string;
  isTemporary?: boolean; // Cho interim transcripts
  audioData?: string; // Base64 audio data for playback
}

export interface SessionHistoryItem {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  lastPreview: string;
}

export type Emotion = 'HAPPY' | 'SAD' | 'NEUTRAL' | 'THINKING' | 'SURPRISED' | 'ANGRY';

export type AppState = 'idle' | 'listening' | 'processing' | 'speaking';

export interface WebSocketMessage {
  type: 'transcript' | 'ai_response' | 'ai_stream_chunk' | 'ai_processing' | 'stt_processing' | 'audio' | 'recording_started' | 'recording_stopped' | 'error' | 'stt_error' | 'user_speaking' | 'session_init' | 'audio_stream_start' | 'audio_stream_stop';
  text?: string;
  isFinal?: boolean;
  emotion?: Emotion;
  data?: string; // Base64 audio
  message?: string; // Error message
  isProcessing?: boolean; // For ai_processing type
  session_id?: string;
}

