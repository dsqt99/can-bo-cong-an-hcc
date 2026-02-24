import React, { useMemo } from 'react';
import { Mic, MicOff, AlertCircle, PanelRight } from 'lucide-react';
import { AppState, Emotion } from '../types';
import { AudioVisualizer } from './AudioVisualizer';

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
}

const envUrl = import.meta.env.VITE_API_URL || '';
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const HTTP_URL = envUrl
  ? envUrl
  : isLocal
    ? `${window.location.protocol}//${window.location.hostname}:8668`
    : window.location.origin;
const EMOJI_BASE_URL = `${HTTP_URL}/emojis`;
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

// SVG Star Icon Component
const StarIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

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
      className="relative flex h-full w-full flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50"
      aria-label="Khu vực avatar cán bộ ảo"
    >
      {/* Background Pattern - Formal Geometric */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(0,87,61,0.5) 1px, transparent 0)`,
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      {/* Header / Status Bar */}
      <div
        className="absolute top-0 left-0 right-0 z-20 flex justify-between items-center px-4 sm:px-6 h-[52px] sm:h-[60px] glass border-b border-police-green/10"
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
        </div>
      </div>

      {/* Main Avatar Area */}
      <div className="flex-1 relative flex items-center justify-center p-3 sm:p-4 lg:p-6 pt-16 sm:pt-20">

        {/* Avatar Container */}
        <div className="relative z-10 flex flex-col items-center">

          {/* Avatar with enhanced styling */}
          <div className="relative">
            {/* Outer glow ring - animated when active */}
            {(appState === 'listening' || appState === 'speaking') && (
              <div
                className="absolute -inset-3 sm:-inset-4 rounded-full border-4 border-police-gold/30 animate-ripple"
                aria-hidden="true"
              />
            )}

            {/* Main avatar circle */}
            <div
              className={`relative w-36 h-36 sm:w-48 sm:h-48 md:w-56 md:h-56 lg:w-64 lg:h-64 rounded-full shadow-2xl overflow-hidden transition-all duration-500 ${appState === 'listening' ? 'ring-4 ring-red-400/50' :
                appState === 'speaking' ? 'ring-4 ring-police-green/50' :
                  'ring-4 ring-police-gold/30'
                }`}
              style={{
                background: 'linear-gradient(135deg, #dbeafe 0%, #ffffff 50%, #f0fdf4 100%)',
              }}
            >
              {/* Golden border */}
              <div
                className="absolute inset-0 rounded-full border-4 border-police-gold shadow-inner pointer-events-none z-10"
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
          </div>

          {/* Nameplate */}
          <div
            className="mt-3 sm:mt-4 bg-gradient-to-r from-police-green via-police-green to-police-green/95 text-white px-5 sm:px-6 py-2 sm:py-2.5 rounded-xl shadow-lg border-2 border-police-gold relative transform transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl cursor-default"
          >
            <div className="text-center">
              <div className="text-[10px] sm:text-xs text-police-gold font-bold uppercase tracking-widest mb-0.5">
                Cán bộ hỗ trợ
              </div>
              <div className="text-sm sm:text-lg font-bold uppercase tracking-wide">
                Đại úy ảo AI
              </div>
            </div>
            {/* Decorative SVG stars */}
            <StarIcon className="absolute -top-2 -left-2 sm:-top-2.5 sm:-left-2.5 w-4 h-4 sm:w-5 sm:h-5 text-police-gold drop-shadow-md" />
            <StarIcon className="absolute -top-2 -right-2 sm:-top-2.5 sm:-right-2.5 w-4 h-4 sm:w-5 sm:h-5 text-police-gold drop-shadow-md" />
          </div>

          {/* Status Badge */}
          <div
            className={`mt-3 sm:mt-4 flex items-center gap-2 px-4 py-2 rounded-full ${statusConfig.bg} border ${statusConfig.border} transition-all duration-300`}
            role="status"
            aria-live="polite"
          >
            <div className={`w-2 h-2 rounded-full ${statusConfig.dot} ${appState !== 'idle' ? 'animate-pulse' : ''}`} aria-hidden="true" />
            <span className={`text-sm font-semibold ${statusConfig.color}`}>
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
      <div className="relative z-20 p-3 sm:p-4 glass border-t border-slate-200/60 flex justify-center items-center">
        {mode === 'voice' && (
          <button
            onClick={appState === 'listening' ? stopRecording : handleStartListening}
            disabled={appState === 'processing' || appState === 'speaking'}
            className={`
              relative group flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full shadow-lg 
              transition-all duration-300 cursor-pointer
              focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-2
              ${appState === 'listening'
                ? 'bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 ring-4 ring-red-200 scale-105 focus-visible:ring-red-300'
                : 'bg-gradient-to-br from-police-green to-police-green/90 hover:from-police-green/90 hover:to-police-green ring-4 ring-police-green/20 hover:scale-105 focus-visible:ring-police-green/30'
              }
              ${(appState === 'processing' || appState === 'speaking')
                ? 'opacity-50 cursor-not-allowed hover:scale-100'
                : 'active:scale-95'
              }
            `}
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

        {/* Helper text */}
        {mode === 'voice' && appState === 'idle' && (
          <p className="absolute bottom-16 sm:bottom-20 text-xs sm:text-sm text-slate-500 font-medium">
            Nhấn để bắt đầu nói
          </p>
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
