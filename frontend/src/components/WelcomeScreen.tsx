import React from 'react';
import { MessageCircle, Shield, Wifi, WifiOff } from 'lucide-react';
import { EMOJI_BASE_URL } from '../config/api';
import logoUrl from '../../assets/Logo-Bo-Cong-An.webp';

interface WelcomeScreenProps {
  onStartConversation: () => void;
  isConnected: boolean;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onStartConversation,
  isConnected,
}) => {
  const avatarUrl = `${EMOJI_BASE_URL}/happy.jpeg`;

  return (
    <div className="relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-police-green via-[#002a1e] to-police-blue animate-welcome-fade-in">
      {/* Dot pattern overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage: `radial-gradient(circle at 1.5px 1.5px, rgba(255,204,0,0.12) 1.5px, transparent 0)`,
          backgroundSize: '36px 36px',
        }}
      />

      {/* Glow orbs */}
      <div className="absolute top-[-80px] left-[-80px] w-[360px] h-[360px] rounded-full bg-police-green/20 blur-[120px] pointer-events-none" aria-hidden="true" />
      <div className="absolute bottom-[-80px] right-[-80px] w-[360px] h-[360px] rounded-full bg-police-blue/25 blur-[120px] pointer-events-none" aria-hidden="true" />

      {/* Content card */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-6 py-8 max-w-md w-full text-center">

        {/* Logo */}
        <img
          src={logoUrl}
          alt="Logo Bộ Công an"
          className="h-16 w-16 sm:h-20 sm:w-20 object-contain drop-shadow-[0_4px_16px_rgba(255,204,0,0.4)]"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />

        {/* Welcome text */}
        <div className="space-y-1.5">
          <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-police-gold/80">
            Hệ thống Trợ lý ảo AI
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
            Chào mừng đến với
          </h1>
          <h2 className="text-base sm:text-lg font-semibold text-white/80 leading-snug">
            Hỗ trợ Hành chính công
            <br />
            Công an Hưng Yên
          </h2>
        </div>

        {/* Avatar section */}
        <div className="relative flex items-center justify-center py-2">
          {/* Ripple rings */}
          <div className="absolute w-[220px] h-[220px] sm:w-[260px] sm:h-[260px] rounded-full border border-police-gold/20 animate-welcome-ripple-slow" aria-hidden="true" />
          <div className="absolute w-[190px] h-[190px] sm:w-[230px] sm:h-[230px] rounded-full border border-police-gold/30 animate-welcome-ripple-medium" aria-hidden="true" />

          {/* Avatar container */}
          <div
            className="relative w-40 h-40 sm:w-48 sm:h-48 rounded-full overflow-hidden
                       ring-4 ring-police-gold/60
                       shadow-[0_0_40px_rgba(255,204,0,0.25),0_16px_48px_rgba(0,0,0,0.4)]
                       animate-welcome-avatar-float"
            style={{ background: '#F0F0F0' }}
          >
            {/* Shine overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/20 pointer-events-none z-10" aria-hidden="true" />

            <img
              src={avatarUrl}
              alt="Cán bộ hỗ trợ AI"
              className="w-full h-full object-cover"
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                const fallback = 'https://via.placeholder.com/300x300?text=CA+AI';
                if (el.src !== fallback) el.src = fallback;
              }}
            />
          </div>

          {/* Shield badge */}
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-full px-4 py-1.5 shadow-lg">
            <Shield className="w-3.5 h-3.5 text-police-gold" aria-hidden="true" />
            <span className="text-[11px] font-bold text-white uppercase tracking-wide">Đại úy ảo AI</span>
          </div>
        </div>

        {/* Description */}
        <p className="text-white/60 text-sm leading-relaxed max-w-xs">
          Giải đáp thông tin hành chính công &amp; hỗ trợ người dân 24/7
        </p>

        {/* CTA button */}
        <button
          onClick={onStartConversation}
          disabled={!isConnected}
          className="
            group relative flex items-center gap-3 px-8 py-4 rounded-2xl
            bg-police-gold text-police-green font-extrabold text-base sm:text-lg
            shadow-[0_8px_32px_rgba(255,204,0,0.35),0_2px_8px_rgba(0,0,0,0.2)]
            hover:shadow-[0_12px_40px_rgba(255,204,0,0.5),0_4px_16px_rgba(0,0,0,0.3)]
            hover:-translate-y-1
            active:translate-y-px active:scale-[0.98]
            transition-all duration-300 cursor-pointer
            disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-[0_8px_32px_rgba(255,204,0,0.35)]
            focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-police-gold/50
          "
          style={{ transitionTimingFunction: 'var(--ease-spring)' }}
          aria-label="Bắt đầu cuộc trò chuyện với cán bộ ảo AI"
        >
          {/* Button shine */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-transparent via-white/20 to-white/40 pointer-events-none" aria-hidden="true" />

          <MessageCircle
            className="relative w-5 h-5 sm:w-6 sm:h-6 transition-transform duration-300 group-hover:scale-110"
            aria-hidden="true"
          />
          <span className="relative">Bắt đầu cuộc trò chuyện</span>
        </button>

        {/* Connection status */}
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-colors duration-300 ${
            isConnected
              ? 'bg-white/10 text-white/70 border border-white/10'
              : 'bg-red-500/20 text-red-300 border border-red-400/30'
          }`}
          role="status"
          aria-live="polite"
          aria-label={isConnected ? 'Hệ thống trực tuyến' : 'Đang kết nối...'}
        >
          {isConnected ? (
            <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          <span className="flex items-center gap-1.5">
            {isConnected ? (
              <>
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"
                  aria-hidden="true"
                />
                Hệ thống trực tuyến
              </>
            ) : (
              <>
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"
                  aria-hidden="true"
                />
                Đang kết nối...
              </>
            )}
          </span>
        </div>

      </div>
    </div>
  );
};
