import React, { useMemo } from 'react';
import { Mic, MicOff, AlertCircle, PanelRight, ShieldCheck, X } from 'lucide-react';
import { AppState, Emotion } from '../types';
import { AudioVisualizer } from './AudioVisualizer';
import { EMOJI_BASE_URL } from '../config/api';

interface AvatarSectionProps {
  appState: AppState;
  emotion: Emotion;
  isConnected: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  error: string | null;
  inputAnalyser: AnalyserNode | null;
  outputAnalyser: AnalyserNode | null;
  isConversationActive: boolean;
  mode: 'voice' | 'chat';
  isChatVisible?: boolean;
  onToggleChat?: () => void;
  onEndConversation?: () => void;
}

const EMOJI_MAP: Record<string, string> = {
  'NEUTRAL': 'happy.jpeg',
  'HAPPY': 'happy.jpeg',
  'SAD': 'sad.jpeg',
  'ANGRY': 'angry.jpeg',
  'SURPRISED': 'suprise.jpeg',
  'THINKING': 'happy.jpeg',
  'LISTENING': 'happy.jpeg',
  'SPEAKING': 'happy.jpeg',
};

// Removed StarIcon as it is no longer used

export const AvatarSection: React.FC<AvatarSectionProps> = ({
  appState,
  emotion,
  isConnected,
  startRecording,
  stopRecording,
  error,
  inputAnalyser,
  outputAnalyser,
  isConversationActive,
  mode,
  isChatVisible = true,
  onToggleChat,
  onEndConversation,
}) => {
  const currentGif = useMemo(() => {
    let filename = EMOJI_MAP['NEUTRAL'];

    if (appState === 'listening') {
      filename = EMOJI_MAP['LISTENING'];
    } else if (appState === 'speaking') {
      filename = EMOJI_MAP[emotion] || EMOJI_MAP['SPEAKING'];
    } else {
      filename = EMOJI_MAP[emotion] || EMOJI_MAP['NEUTRAL'];
    }

    return `${EMOJI_BASE_URL}/${filename}`;
  }, [appState, emotion]);

  const handleStartListening = () => {
    if (appState === 'idle' || appState === 'processing') {
      startRecording();
    }
  };

  const getStatusText = () => {
    switch (appState) {
      case 'listening': return 'Đang nghe bạn nói...';
      case 'processing': return 'Đang xử lý...';
      case 'speaking': return 'Đang trả lời...';
      default: return 'Sẵn sàng hỗ trợ';
    }
  };

  const getStatusConfig = () => {
    switch (appState) {
      case 'listening':
        return {
          color: 'text-red-600',
          bg: 'bg-red-50',
          border: 'border-red-200',
          dot: 'bg-red-500'
        };
      case 'processing':
        return {
          color: 'text-blue-600',
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          dot: 'bg-blue-500'
        };
      case 'speaking':
        return {
          color: 'text-emerald-600',
          bg: 'bg-emerald-50',
          border: 'border-emerald-200',
          dot: 'bg-emerald-500'
        };
      default:
        return {
          color: 'text-slate-600',
          bg: 'bg-slate-50',
          border: 'border-slate-200',
          dot: 'bg-slate-400'
        };
    }
  };

  const statusConfig = getStatusConfig();

  return (
    <section
      className="relative flex h-full w-full flex-col overflow-hidden bg-[#FAFAFA]"
      aria-label="Khu vực avatar cán bộ ảo"
    >
      {/* Background Masked Pattern */}
      <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-slate-100 to-transparent pointer-events-none" aria-hidden="true" />
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none mix-blend-multiply" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #00573D 1px, transparent 0)`,
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      {/* Header / Status Bar */}
      <div
        className="absolute top-0 left-0 right-0 z-20 flex justify-between items-center px-4 sm:px-6 h-[52px] sm:h-[60px] bg-white/70 backdrop-blur-xl border-b border-black/5"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div
            className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shadow-sm transition-colors duration-300 ${isConnected ? 'bg-police-green' : 'bg-red-500'
              } ${isConnected ? 'animate-pulse' : ''}`}
            aria-hidden="true"
          />
          <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-police-green">
            {isConnected ? 'Hệ thống trực tuyến' : 'Đang kết nối...'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Conversation Mode Indicator */}
          {mode === 'voice' && isConversationActive && (
            <div
              className="flex items-center gap-2 px-3 sm:px-4 py-1.5 bg-police-green/10 rounded-full border border-police-green/20 animate-fade-in"
              role="status"
              aria-label="Đang trong cuộc đàm thoại"
            >
              <div className="w-2 h-2 rounded-full bg-police-green animate-pulse" aria-hidden="true" />
              <span className="text-[10px] sm:text-xs font-bold text-police-green uppercase tracking-wide">
                Đang đàm thoại
              </span>
            </div>
          )}

          {!isChatVisible && onToggleChat && (
            <button
              onClick={onToggleChat}
              className="p-1.5 text-slate-400 hover:text-police-green hover:bg-police-green/10 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-police-green/50 cursor-pointer"
              aria-label="Mở hội thoại"
              title="Mở hội thoại"
            >
              <PanelRight className="h-5 w-5" aria-hidden="true" />
            </button>
          )}

          {/* End Conversation Button */}
          {onEndConversation && (
            <button
              onClick={onEndConversation}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-police-red/10 hover:bg-police-red/20 border border-police-red/20 hover:border-police-red/40 rounded-lg text-police-red text-xs font-semibold uppercase tracking-wider transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-police-red/50"
              aria-label="Kết thúc cuộc trò chuyện"
              title="Kết thúc cuộc trò chuyện"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Kết thúc</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Avatar Area */}
      <div className="flex-1 relative flex items-center justify-center p-3 sm:p-4 lg:p-6 pt-16 sm:pt-20">

        {/* Avatar Container */}
        <div className="relative z-10 flex flex-col items-center">

          {/* Avatar with enhanced styling */}
          <div className="relative flex flex-col items-center">
            {/* Outer glow ring - animated when active */}
            {(appState === 'listening' || appState === 'speaking') && (
              <div
                className="absolute -inset-3 sm:-inset-4 rounded-full border-4 border-police-gold/30 animate-ripple z-0"
                aria-hidden="true"
              />
            )}

            {/* Main avatar circle */}
            <div
              className={`relative z-10 w-40 h-40 sm:w-48 sm:h-48 md:w-56 md:h-56 lg:w-60 lg:h-60 rounded-full shadow-[0_16px_40px_rgba(0,0,0,0.1)] overflow-hidden transition-all duration-500 ease-out ${appState === 'listening' ? 'ring-4 ring-red-500/20 shadow-[0_16px_40px_rgba(218,37,29,0.2)]' :
                appState === 'speaking' ? 'ring-4 ring-police-green/20 shadow-[0_16px_40px_rgba(0,87,61,0.2)]' :
                  'ring-1 ring-black/5'
                }`}
              style={{
                background: '#F0F0F0',
              }}
            >
              {/* Golden inner shadow border instead of thick stroke */}
              <div
                className="absolute inset-0 rounded-full border border-police-gold/40 shadow-[inset_0_4px_16px_rgba(255,204,0,0.2)] pointer-events-none z-10"
                aria-hidden="true"
              />

              {/* Image */}
              <img
                src={currentGif}
                alt="Cán bộ ảo AI"
                className="w-full h-full object-cover transition-transform duration-500"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  const fallback = 'https://via.placeholder.com/300x300?text=CA+AI';
                  if (target.src !== fallback) {
                    target.src = fallback;
                  }
                }}
              />

              {/* Subtle shine effect */}
              <div
                className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/20 pointer-events-none z-20"
                aria-hidden="true"
              />
            </div>

            {/* Nameplate - strictly overlapping the avatar */}
            <div
              className="absolute -bottom-4 sm:-bottom-5 z-20 bg-white/95 backdrop-blur-xl text-slate-900 px-4 sm:px-5 py-2 sm:py-2.5 rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.08)] border border-black/5 flex items-center gap-3 w-max transform transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(0,0,0,0.12)] cursor-default"
              style={{ transitionTimingFunction: 'var(--ease-spring)' }}
            >
              <div className="flex items-center justify-center bg-slate-50 rounded-full p-2 border border-black/5 shadow-inner">
                <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-police-gold drop-shadow-sm" aria-hidden="true" />
              </div>
              <div className="text-left">
                <div className="text-[10px] sm:text-[11px] text-slate-500 font-bold uppercase tracking-[0.15em] mb-0.5">
                  Cán bộ hỗ trợ
                </div>
                <div className="text-sm sm:text-base font-bold tracking-tight text-slate-900 leading-none">
                  Đại úy ảo AI
                </div>
              </div>
            </div>
          </div>

          {/* Status Badge */}
          <div
            className={`mt-10 flex items-center gap-2 px-4 py-2 sm:py-2.5 rounded-full ${statusConfig.bg} border ${statusConfig.border} transition-all duration-300 shadow-sm`}
            role="status"
            aria-live="polite"
          >
            <div className={`w-2 h-2 rounded-full ${statusConfig.dot} ${appState !== 'idle' ? 'animate-pulse' : ''}`} aria-hidden="true" />
            <span className={`text-xs sm:text-sm font-semibold ${statusConfig.color}`}>
              {getStatusText()}
            </span>
          </div>

        </div>

        {/* Visualizer Background */}
        <div className="absolute inset-0 z-0 opacity-15 pointer-events-none" aria-hidden="true">
          <AudioVisualizer
            analyser={appState === 'listening' ? inputAnalyser : outputAnalyser}
            color={appState === 'listening' ? '#DA251D' : '#00573D'}
            mode="wave"
            isActive={appState === 'listening' || appState === 'speaking'}
          />
        </div>
      </div>

      {/* Footer Controls */}
      <div className="relative z-20 p-4 sm:p-5 bg-white/50 backdrop-blur-xl border-t border-black/5 flex justify-center items-center h-28 sm:h-32">
        {mode === 'voice' && (
          <button
            onClick={appState === 'listening' ? stopRecording : handleStartListening}
            disabled={appState === 'processing' || appState === 'speaking'}
            className={`
              relative group flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full
              transition-all duration-300 cursor-pointer
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-4
              ${appState === 'listening'
                ? 'bg-red-500 hover:bg-red-600 shadow-[0_8px_32px_rgba(239,68,68,0.4)] hover:-translate-y-1 focus-visible:ring-red-500'
                : 'bg-police-green hover:bg-police-green/90 shadow-[0_8px_32px_rgba(0,87,61,0.3)] hover:-translate-y-1 focus-visible:ring-police-green'
              }
              ${(appState === 'processing' || appState === 'speaking')
                ? 'opacity-60 cursor-not-allowed hover:translate-y-0 !shadow-none'
                : 'active:translate-y-px active:scale-[0.98]'
              }
            `}
            style={{ transitionTimingFunction: 'var(--ease-spring)' }}
            aria-label={appState === 'listening' ? 'Dừng ghi âm' : 'Bắt đầu nói'}
          >
            {appState === 'listening' ? (
              <>
                {/* Ping animation */}
                <div className="absolute inset-0 rounded-full border-2 border-white/30 animate-ping" aria-hidden="true" />
                <MicOff className="w-7 h-7 sm:w-8 sm:h-8 text-white drop-shadow-md" aria-hidden="true" />
              </>
            ) : (
              <Mic className="w-7 h-7 sm:w-8 sm:h-8 text-white drop-shadow-md" aria-hidden="true" />
            )}

            {/* Button shine effect */}
            <div
              className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/20 to-transparent pointer-events-none"
              aria-hidden="true"
            />
          </button>
        )}

        {/* Error message */}
        {error && (
          <div
            className="absolute bottom-20 sm:bottom-24 flex items-center gap-2 bg-red-50 text-red-700 px-4 py-2.5 rounded-xl text-sm font-medium shadow-md animate-fade-in border border-red-200"
            role="alert"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </section>
  );
};
