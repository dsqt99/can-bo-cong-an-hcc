import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message, AppState, SessionHistoryItem } from '../types';
import { User, Send, Volume2, VolumeX, Loader2, ShieldCheck, MessageCircle, PanelRightClose, MessageSquarePlus, History } from 'lucide-react';
import { TTS_API_URL } from '../config/api';

interface MessageListProps {
  messages: Message[];
  transcript: string;
  isRecording: boolean;
  mode: 'voice' | 'chat';
  onSendMessage: (text: string) => void;
  isConnected: boolean;
  appState: AppState;
  streamingAiText: string;
  isAiProcessing: boolean;
  isSttProcessing: boolean;
  sessionHistory: SessionHistoryItem[];
  onClearSession: () => void;
  onLoadSession: (id: string) => void;
  currentSessionId?: string;
  onToggleChat?: () => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  transcript,
  isRecording,
  mode,
  onSendMessage,
  isConnected,
  appState,
  streamingAiText,
  isAiProcessing,
  isSttProcessing,
  sessionHistory,
  onClearSession,
  onLoadSession,
  currentSessionId,
  onToggleChat,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [loadingMessageId, setLoadingMessageId] = useState<string | null>(null);
  const [audioCache, setAudioCache] = useState<Record<string, string>>({});
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, transcript, streamingAiText]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
        } catch (e) {
          // Already stopped
          console.debug('Audio already stopped during cleanup', e);
        }
      }
    };
  }, []);

  const handlePlayClick = async (msg: Message) => {
    // If stopping current playback
    if (playingMessageId === msg.id) {
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
        } catch (e) {
          console.debug('Audio already stopped', e);
        }
      }
      setPlayingMessageId(null);
      return;
    }

    // Prepare audio data
    let audio = msg.audioData || audioCache[msg.id];

    // If no audio (only for AI), fetch TTS
    if (!audio && msg.type === 'ai' && msg.text) {
      setLoadingMessageId(msg.id);
      try {
        const res = await fetch(TTS_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: msg.text })
        });
        if (!res.ok) throw new Error('TTS Failed');

        const blob = await res.blob();
        const reader = new FileReader();
        await new Promise((resolve) => {
          reader.onloadend = resolve;
          reader.readAsDataURL(blob);
        });
        audio = (reader.result as string).split(',')[1];
        setAudioCache(prev => ({ ...prev, [msg.id]: audio! }));
      } catch (e) {
        console.error(e);
        return;
      } finally {
        setLoadingMessageId(null);
      }
    }

    if (audio) {
      playAudio(msg.id, audio);
    }
  };

  const playAudio = async (messageId: string, audioData: string) => {
    // Stop any currently playing audio
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (e) {
        // Already stopped
        console.debug('Audio already stopped', e);
      }
    }

    // Initialize AudioContext if needed
    if (!audioContextRef.current) {
      const AudioContextConstructor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) {
        console.error('AudioContext not supported');
        return;
      }
      audioContextRef.current = new AudioContextConstructor();
    }

    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    setPlayingMessageId(messageId);

    // Audio data might be multiple chunks separated by '|'
    const audioChunks = audioData.split('|');

    // Play chunks sequentially
    const playChunk = async (index: number) => {
      if (index >= audioChunks.length) {
        setPlayingMessageId(null);
        return;
      }

      try {
        const chunk = audioChunks[index];
        const binaryString = window.atob(chunk);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const audioBuffer = await audioContextRef.current!.decodeAudioData(bytes.buffer.slice(0));
        const source = audioContextRef.current!.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current!.destination);

        currentSourceRef.current = source;

        source.onended = () => {
          playChunk(index + 1);
        };

        source.start(0);
      } catch (err) {
        console.error('Error playing audio chunk:', err);
        playChunk(index + 1);
      }
    };

    await playChunk(0);
  };

  const lastMessageIsUser = messages.length > 0 && messages[messages.length - 1].type === 'user';
  const shouldShowTranscript = isRecording && transcript && !lastMessageIsUser;
  const canSend = mode === 'chat' && isConnected && appState !== 'processing' && draft.trim().length > 0;

  return (
    <section
      className="flex h-full w-full flex-col bg-white border-l border-black/5"
      aria-label="Khu vực hội thoại"
    >
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between border-b border-black/5 bg-white/70 backdrop-blur-xl px-4 sm:px-6 h-[52px] sm:h-[60px] z-10">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shadow-sm bg-police-green animate-pulse" aria-hidden="true" />
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-police-green">
            Hội thoại trực tuyến
          </h2>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowHistoryPanel((v) => !v)}
            className="p-1.5 text-slate-400 hover:text-police-green hover:bg-police-green/10 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-police-green/50 cursor-pointer"
            aria-label="Xem lịch sử phiên chat"
            title="Lịch sử phiên chat"
          >
            <History className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            onClick={onClearSession}
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 cursor-pointer"
            aria-label="Tạo cuộc hội thoại mới"
            title="Tạo cuộc hội thoại mới"
          >
            <MessageSquarePlus className="h-5 w-5" aria-hidden="true" />
          </button>
          {onToggleChat && (
            <button
              onClick={onToggleChat}
              className="p-1.5 text-slate-400 hover:text-police-green hover:bg-police-green/10 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-police-green/50 cursor-pointer"
              aria-label="Ẩn hội thoại"
              title="Ẩn hội thoại"
            >
              <PanelRightClose className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {showHistoryPanel && (
        <div className="border-b border-black/5 bg-white px-4 sm:px-6 py-3 max-h-48 overflow-y-auto">
          {sessionHistory.length === 0 ? (
            <p className="text-xs text-slate-500">Chưa có lịch sử phiên chat.</p>
          ) : (
            <div className="space-y-2">
              {sessionHistory.map((session) => (
                <button
                  key={session.id}
                  onClick={() => {
                    onLoadSession(session.id);
                    setShowHistoryPanel(false);
                  }}
                  className={`w-full text-left rounded-xl border px-3 py-2 transition-colors cursor-pointer ${session.id === currentSessionId
                      ? 'border-police-green/40 bg-police-green/5'
                      : 'border-slate-200 hover:bg-slate-50'
                    }`}
                >
                  <div className="text-xs font-semibold text-slate-800 truncate">{session.title}</div>
                  <div className="text-[11px] text-slate-500 truncate">{session.lastPreview || 'Không có nội dung'}</div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    {new Date(session.updatedAt).toLocaleString('vi-VN')} • {session.messageCount} tin nhắn
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages Container */}
      <div
        ref={messagesContainerRef}
        className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6 scrollbar-thin"
        role="log"
        aria-live="polite"
        aria-label="Lịch sử tin nhắn"
      >
        {/* Empty State */}
        {messages.length === 0 && !shouldShowTranscript && !streamingAiText && !isAiProcessing && !isSttProcessing && (
          <div className="flex h-full flex-col items-center justify-center text-slate-500 py-8 animate-fade-in">
            <div className="mb-6 sm:mb-8 rounded-[2rem] bg-slate-50 p-6 sm:p-8 border border-black/5 shadow-[0_8px_32px_rgba(0,0,0,0.03)] transition-transform duration-500 hover:-translate-y-2 hover:shadow-[0_16px_48px_rgba(0,0,0,0.06)]"
              style={{ transitionTimingFunction: 'var(--ease-spring)' }}
            >
              <ShieldCheck className="h-10 w-10 sm:h-12 sm:w-12 text-police-green opacity-90" aria-hidden="true" />
            </div>
            <p className="text-sm sm:text-base font-bold text-slate-900 tracking-tight text-center max-w-xs leading-relaxed">
              Hệ thống Hành chính công
              <br />
              <span className="text-police-green">Công an Hưng Yên</span>
            </p>
            <p className="mt-3 text-xs sm:text-sm text-slate-500 text-center max-w-xs leading-relaxed">
              {mode === 'voice'
                ? 'Nhấn biểu tượng Micro bên trái để bắt đầu hỏi đáp với Cán bộ ảo'
                : 'Nhập câu hỏi của bạn vào ô bên dưới để được giải đáp'}
            </p>

            {/* Quick suggestions for chat mode */}
            {mode === 'chat' && (
              <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-sm">
                <button
                  onClick={() => setDraft('Hướng dẫn làm căn cước công dân')}
                  className="text-[13px] px-4 py-2.5 bg-white border border-slate-200/60 rounded-xl text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-all duration-300 cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] active:translate-y-0 active:scale-[0.98]"
                  style={{ transitionTimingFunction: 'var(--ease-spring)' }}
                >
                  <MessageCircle className="w-4 h-4 inline mr-2 opacity-60" aria-hidden="true" />
                  Làm CCCD
                </button>
                <button
                  onClick={() => setDraft('Thủ tục đăng ký xác nhận nơi cư trú')}
                  className="text-[13px] px-4 py-2.5 bg-white border border-slate-200/60 rounded-xl text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-all duration-300 cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] active:translate-y-0 active:scale-[0.98]"
                  style={{ transitionTimingFunction: 'var(--ease-spring)' }}
                >
                  <MessageCircle className="w-4 h-4 inline mr-2 opacity-60" aria-hidden="true" />
                  Đăng ký cư trú
                </button>
              </div>
            )}
          </div>
        )}

        {/* Message List */}
        {messages.map((msg, index) => (
          <article
            key={msg.id}
            className={`flex w-full items-start gap-2.5 sm:gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500 ${msg.type === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            style={{ animationDelay: `${Math.min(index * 50, 200)}ms` }}
          >
            {/* Avatar */}
            <div
              className={`flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.06)] ring-1 transition-all duration-300 cursor-default ${msg.type === 'user'
                ? 'bg-slate-50 ring-black/5'
                : 'bg-[#F0F0F0] ring-black/5'
                }`}
              aria-hidden="true"
            >
              {msg.type === 'user' ? (
                <User className="h-4 w-4 sm:h-4 sm:w-4 text-slate-700" />
              ) : (
                <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5 text-police-green" />
              )}
            </div>

            <div className={`flex flex-col gap-1.5 max-w-[85%] sm:max-w-[80%]`}>
              {/* Name Label */}
              <span
                className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider ${msg.type === 'user' ? 'text-right text-blue-700/80' : 'text-left text-police-green/80'
                  }`}
              >
                {msg.type === 'user' ? 'Công dân' : 'Cán bộ hỗ trợ'}
              </span>

              {/* Message Bubble */}
              <div
                className={`px-4 py-3 sm:px-5 sm:py-3.5 text-sm shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-all duration-300 hover:shadow-[0_8px_16px_rgba(0,0,0,0.04)] ${msg.type === 'user'
                  ? 'bg-slate-900 text-white rounded-[20px] rounded-tr-md'
                  : 'bg-slate-50/80 text-slate-900 border border-black/5 backdrop-blur-md rounded-[20px] rounded-tl-md'
                  }`}
              >
                {msg.type === 'user' ? (
                  <p className="whitespace-pre-wrap leading-[1.7] font-normal">
                    {msg.text}
                  </p>
                ) : (
                  <div className="prose prose-sm prose-slate max-w-none prose-p:leading-[1.75] prose-p:my-1.5 prose-headings:my-2.5 prose-li:leading-[1.7]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                )}
                <time
                  className={`mt-2 block text-[10px] font-medium ${msg.type === 'user' ? 'text-blue-200' : 'text-slate-400'
                    }`}
                  dateTime={msg.timestamp}
                >
                  {msg.timestamp}
                </time>
              </div>

              {/* Audio playback button */}
              {(msg.audioData || (msg.type === 'ai' && msg.text)) && (
                <button
                  onClick={() => handlePlayClick(msg)}
                  disabled={loadingMessageId === msg.id}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all duration-300 shadow-[0_2px_4px_rgba(0,0,0,0.02)] border cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 hover:-translate-y-[1px] active:translate-y-px active:scale-[0.98] ${msg.type === 'user'
                    ? 'self-end bg-white text-slate-600 hover:bg-slate-50 border-slate-200 focus-visible:ring-slate-300'
                    : 'self-start bg-white text-police-green hover:bg-police-green/5 border-police-green/20 focus-visible:ring-police-green/30'
                    } ${playingMessageId === msg.id ? 'ring-2 ring-offset-1 ring-police-green/50 bg-police-green/5 text-police-green' : ''} ${loadingMessageId === msg.id ? 'opacity-50 cursor-wait hover:translate-y-0 active:scale-100' : ''
                    }`}
                  style={{ transitionTimingFunction: 'var(--ease-spring)' }}
                  aria-label={playingMessageId === msg.id ? 'Dừng phát' : 'Phát lại tin nhắn'}
                >
                  {loadingMessageId === msg.id ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      <span>Đang tải...</span>
                    </>
                  ) : playingMessageId === msg.id ? (
                    <>
                      <VolumeX className="h-3 w-3" aria-hidden="true" />
                      <span>Dừng</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="h-3 w-3" aria-hidden="true" />
                      <span>{msg.audioData || audioCache[msg.id] ? 'Phát lại' : 'Đọc tin nhắn'}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </article>
        ))}

        {/* Interim Transcript */}
        {shouldShowTranscript && (
          <div
            className="flex w-full flex-row-reverse items-start gap-2.5 sm:gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300"
            role="status"
            aria-label="Đang nghe..."
          >
            <div className="flex relative h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-black/5 shadow-[0_4px_12px_rgba(0,0,0,0.06)]" aria-hidden="true">
              <div className="absolute inset-0 rounded-2xl border-2 border-slate-400/50 animate-ping opacity-60" />
              <User className="h-4 w-4 sm:h-4 sm:w-4 text-slate-700 relative z-10" />
            </div>
            
            <div className="flex flex-col gap-1.5 max-w-[85%] sm:max-w-[80%]">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-right text-blue-700/80">
                Đang nghe bạn nói...
              </span>
              <div className="px-4 py-3 sm:px-5 sm:py-3.5 text-sm bg-slate-800 text-slate-200 rounded-[20px] rounded-tr-md shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                <p className="whitespace-pre-wrap leading-[1.7] font-normal">
                  {transcript || <span className="opacity-50 italic">Hãy bắt đầu nói...</span>}
                  <span className="inline-block w-1.5 h-4 ml-1 bg-white/70 animate-[pulse_1s_ease-in-out_infinite] rounded-sm align-middle" />
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Citizen/STT Processing Indicator */}
        {!shouldShowTranscript && isSttProcessing && (
          <div
            className="flex w-full flex-row-reverse items-start gap-2.5 sm:gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300"
            role="status"
            aria-label="Đang xử lý giọng nói công dân"
          >
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-black/5 shadow-[0_4px_12px_rgba(0,0,0,0.06)]" aria-hidden="true">
              <User className="h-4 w-4 sm:h-4 sm:w-4 text-slate-700" />
            </div>
            <div className="flex flex-col gap-1.5 max-w-[85%] sm:max-w-[80%] items-end">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-blue-700/80 flex items-center gap-2">
                <span className="flex items-center gap-0.5">
                  <span className="w-1 h-1 bg-blue-500/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 bg-blue-500/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 bg-blue-500/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                Đang xử lý giọng nói...
              </span>
              <div className="px-4 py-3 sm:px-5 sm:py-3.5 text-sm bg-slate-900 border border-slate-700 text-slate-300 rounded-[20px] rounded-tr-md shadow-[0_4px_16px_rgba(0,0,0,0.1)]">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />
                  <span className="font-medium whitespace-pre-wrap leading-relaxed">
                    {transcript || "Đang chuyển âm thanh thành văn bản..."}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Processing Indicator */}
        {isAiProcessing && (
          <div
            className="flex w-full flex-row items-start gap-2.5 sm:gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300"
            role="status"
            aria-label="AI đang xử lý"
          >
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-2xl bg-[#F0F0F0] ring-1 ring-black/5 shadow-[0_4px_12px_rgba(0,0,0,0.06)]" aria-hidden="true">
              <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5 text-police-green" />
            </div>
            <div className="flex flex-col gap-1.5 max-w-[85%] sm:max-w-[80%]">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-left text-police-green/80 flex items-center gap-2">
                Cán bộ hỗ trợ
                <span className="flex items-center gap-0.5">
                  <span className="w-1 h-1 bg-police-green/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 bg-police-green/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 bg-police-green/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </span>
              <div className="px-4 py-3 sm:px-5 sm:py-3.5 text-sm bg-slate-50/80 border border-black/5 backdrop-blur-md rounded-[20px] rounded-tl-md shadow-sm">
                <div className="flex items-center gap-3 text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin text-police-green" aria-hidden="true" />
                  <span className="font-medium">Đang suy nghĩ câu trả lời...</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Streaming Response */}
        {streamingAiText && !isAiProcessing && (
          <div
            className="flex w-full flex-row items-start gap-2.5 sm:gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300"
            role="status"
            aria-label="AI đang trả lời"
          >
            <div className="flex relative h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-2xl bg-[#F0F0F0] ring-1 ring-police-gold/50 shadow-[0_4px_12px_rgba(0,0,0,0.06)]" aria-hidden="true">
              <div className="absolute inset-0 rounded-2xl border-2 border-police-green/30 animate-[pulse_2s_ease-in-out_infinite]" />
              <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5 text-police-green relative z-10" />
            </div>
            <div className="flex flex-col gap-1.5 max-w-[85%] sm:max-w-[80%]">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-left text-police-green/80 flex items-center gap-2">
                Cán bộ hỗ trợ
                <span className="flex items-center gap-0.5">
                  <span className="w-1.5 h-1.5 bg-police-green rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-police-green rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-police-green rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </span>
              <div className="px-4 py-3 sm:px-5 sm:py-3.5 text-sm bg-slate-50/80 border border-black/5 backdrop-blur-md rounded-[20px] rounded-tl-md shadow-[0_2px_12px_rgba(0,0,0,0.04)] relative">
                <div className="prose prose-sm prose-slate max-w-none prose-p:leading-[1.75] prose-p:my-1.5 prose-headings:my-2.5 prose-li:leading-[1.7]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {streamingAiText}
                  </ReactMarkdown>
                  <span className="inline-block w-[2px] h-[1.1em] ml-0.5 bg-police-green/70 animate-[pulse_1s_ease-in-out_infinite] rounded-sm align-text-bottom" aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} className="h-1" />
      </div>

      {/* Chat Input */}
      {mode === 'chat' && (
        <form
          className="flex-shrink-0 border-t border-slate-200 bg-white/90 backdrop-blur-sm p-3 sm:p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.03)]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSend) return;
            const text = draft.trim();
            setDraft('');
            onSendMessage(text);
          }}
        >
          <div className="flex items-end gap-2 sm:gap-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={isConnected ? 'Nhập câu hỏi của bạn tại đây...' : 'Đang kết nối...'}
              rows={1}
              className="w-full min-h-[44px] sm:min-h-[48px] max-h-32 resize-none rounded-2xl border border-black/10 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition-all duration-300 focus:border-police-green focus:ring-4 focus:ring-police-green/10 focus:bg-white placeholder:text-slate-400 disabled:opacity-50"
              style={{ transitionTimingFunction: 'var(--ease-spring)' }}
              disabled={!isConnected}
              aria-label="Nhập tin nhắn"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!canSend) return;
                  const text = draft.trim();
                  setDraft('');
                  onSendMessage(text);
                }
              }}
            />
            <button
              type="submit"
              disabled={!canSend}
              className={`flex h-[44px] w-[44px] sm:h-[48px] sm:w-[48px] shrink-0 items-center justify-center rounded-2xl shadow-sm transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${canSend
                ? 'bg-police-green text-white hover:bg-police-green/90 hover:-translate-y-[2px] hover:shadow-[0_8px_16px_rgba(0,87,61,0.2)] active:translate-y-px active:scale-[0.96] focus-visible:ring-police-green/30'
                : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                }`}
              style={{ transitionTimingFunction: 'var(--ease-spring)' }}
              aria-label="Gửi tin nhắn"
            >
              <Send className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-2 text-center text-[9px] sm:text-[10px] text-slate-400 leading-relaxed">
            Hệ thống AI có thể đưa ra thông tin chưa chính xác.
            <br className="sm:hidden" />
            Vui lòng kiểm tra lại các thông tin quan trọng.
          </p>
        </form>
      )}
    </section>
  );
};
