import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message, AppState } from '../types';
import { User, Send, Volume2, VolumeX, Loader2, ShieldCheck, MessageCircle, PanelRightClose } from 'lucide-react';
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
  onToggleChat,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [loadingMessageId, setLoadingMessageId] = useState<string | null>(null);
  const [audioCache, setAudioCache] = useState<Record<string, string>>({});

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
      className="flex h-full w-full flex-col bg-gradient-to-b from-slate-50 to-white border-l border-slate-200/80"
      aria-label="Khu vực hội thoại"
    >
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between border-b border-police-green/10 bg-white/90 backdrop-blur-sm px-4 sm:px-6 h-[52px] sm:h-[60px] shadow-sm">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shadow-sm bg-police-green animate-pulse" aria-hidden="true" />
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-police-green">
            Hội thoại trực tuyến
          </h2>
        </div>

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
      </header>

      {/* Messages Container */}
      <div
        ref={messagesContainerRef}
        className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6 scrollbar-thin"
        role="log"
        aria-live="polite"
        aria-label="Lịch sử tin nhắn"
      >
        {/* Empty State */}
        {messages.length === 0 && !shouldShowTranscript && !streamingAiText && !isAiProcessing && (
          <div className="flex h-full flex-col items-center justify-center text-slate-500 py-8">
            <div className="mb-5 sm:mb-6 rounded-full bg-gradient-to-br from-slate-50 to-white p-5 sm:p-6 shadow-lg border-2 border-police-green/15 transition-transform duration-300 hover:scale-105">
              <ShieldCheck className="h-12 w-12 sm:h-16 sm:w-16 text-police-green" aria-hidden="true" />
            </div>
            <p className="text-sm sm:text-base font-bold text-police-green uppercase tracking-wide text-center max-w-xs leading-relaxed">
              Hệ thống hỗ trợ Hành chính công
              <br />
              <span className="text-police-gold">Công an tỉnh Hưng Yên</span>
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
                  className="text-xs px-3 py-2 bg-white border border-slate-200 rounded-full text-slate-600 hover:bg-slate-50 hover:border-police-green/30 hover:text-police-green transition-all duration-200 cursor-pointer shadow-sm"
                >
                  <MessageCircle className="w-3 h-3 inline mr-1.5" aria-hidden="true" />
                  Làm CCCD
                </button>
                <button
                  onClick={() => setDraft('Thủ tục đăng ký xác nhận nơi cư trú')}
                  className="text-xs px-3 py-2 bg-white border border-slate-200 rounded-full text-slate-600 hover:bg-slate-50 hover:border-police-green/30 hover:text-police-green transition-all duration-200 cursor-pointer shadow-sm"
                >
                  <MessageCircle className="w-3 h-3 inline mr-1.5" aria-hidden="true" />
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
              className={`flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full shadow-md ring-2 transition-all duration-300 hover:scale-110 cursor-default ${msg.type === 'user'
                ? 'bg-gradient-to-br from-blue-500 to-blue-600 ring-blue-200'
                : 'bg-gradient-to-br from-police-green to-police-green/90 ring-police-gold/50'
                }`}
              aria-hidden="true"
            >
              {msg.type === 'user' ? (
                <User className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              ) : (
                <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5 text-police-gold" />
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
                className={`px-4 py-3 sm:px-5 sm:py-3.5 text-sm shadow-md transition-all duration-300 hover:shadow-lg ${msg.type === 'user'
                  ? 'message-user'
                  : 'message-ai'
                  }`}
              >
                {msg.type === 'user' ? (
                  <p className="whitespace-pre-wrap leading-relaxed font-medium">
                    {msg.text}
                  </p>
                ) : (
                  <div className="prose prose-sm prose-slate max-w-none prose-p:leading-relaxed prose-p:my-1 prose-headings:my-2">
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
                  className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wide transition-all duration-200 shadow-sm border cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${msg.type === 'user'
                    ? 'self-end bg-white text-blue-700 hover:bg-blue-50 border-blue-100 focus-visible:ring-blue-300'
                    : 'self-start bg-white text-police-green hover:bg-police-green/5 border-police-green/20 focus-visible:ring-police-green/30'
                    } ${playingMessageId === msg.id ? 'ring-2 ring-offset-1 ring-police-gold' : ''} ${loadingMessageId === msg.id ? 'opacity-70 cursor-wait' : ''
                    }`}
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
            aria-label="Đang ghi nhận giọng nói"
          >
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 shadow-md ring-2 ring-blue-200" aria-hidden="true">
              <User className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            </div>
            <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-blue-50 px-4 py-3 sm:px-5 sm:py-3.5 text-sm text-blue-900 shadow-md border border-blue-200 animate-pulse">
              <p className="font-medium">{transcript}<span className="animate-typing-blink">_</span></p>
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
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-police-green to-police-green/90 shadow-md ring-2 ring-police-gold/50" aria-hidden="true">
              <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5 text-police-gold" />
            </div>
            <div className="flex flex-col gap-1.5 max-w-[85%]">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-left text-police-green/80">
                Cán bộ hỗ trợ
              </span>
              <div className="message-ai px-4 py-3 sm:px-5 sm:py-3.5 text-sm">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-police-green" aria-hidden="true" />
                  <span className="text-slate-600 font-medium">Đang xử lý câu hỏi của bạn...</span>
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
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-police-green to-police-green/90 shadow-md ring-2 ring-police-gold/50 animate-pulse" aria-hidden="true">
              <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5 text-police-gold" />
            </div>
            <div className="flex flex-col gap-1.5 max-w-[85%]">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-left text-police-green/80">
                Cán bộ hỗ trợ
              </span>
              <div className="message-ai px-4 py-3 sm:px-5 sm:py-3.5 text-sm prose prose-sm prose-slate max-w-none prose-p:leading-relaxed prose-p:my-1 prose-headings:my-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {streamingAiText}
                </ReactMarkdown>
                <span className="inline-block w-2 h-4 ml-1 bg-police-green/80 animate-typing-blink rounded-sm" aria-hidden="true" />
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
              rows={2}
              className="w-full resize-none rounded-xl border border-slate-300 bg-slate-50 px-3 sm:px-4 py-2.5 sm:py-3 text-sm text-slate-800 shadow-inner outline-none transition-all duration-200 focus:border-police-green focus:ring-2 focus:ring-police-green/20 focus:bg-white placeholder:text-slate-400 disabled:opacity-60"
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
              className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl shadow-lg transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${canSend
                ? 'bg-gradient-to-br from-police-green to-police-green/90 text-white hover:from-police-green/90 hover:to-police-green hover:scale-105 active:scale-95 focus-visible:ring-police-green/30'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
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
