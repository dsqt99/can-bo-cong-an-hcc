import React from 'react';
import { Bot, Mic, MessageSquare } from 'lucide-react';
import logoBCA from '../../assets/Logo-Bo-Cong-An.webp';

interface HeaderProps {
  onSettingsClick?: () => void;
  mode: 'voice' | 'chat';
  onModeChange: (mode: 'voice' | 'chat') => void;
}

export const Header: React.FC<HeaderProps> = ({ mode, onModeChange }) => {
  return (
    <header
      className="relative flex w-full items-center justify-between gap-4 bg-slate-900 px-4 sm:px-6 lg:px-8 py-4 shadow-[0_4px_32px_rgba(0,0,0,0.15)] z-40 border-b border-white/5"
      role="banner"
    >
      {/* Ambient glow instead of generic gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(0,87,61,0.4)_0%,transparent_70%)] pointer-events-none" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-police-green/50 to-transparent pointer-events-none" aria-hidden="true" />

      {/* Subtle pattern overlay */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1' fill-rule='evenodd'%3E%3Ccircle cx='3' cy='3' r='1'/%3E%3C/g%3E%3C/svg%3E")`,
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex items-center gap-3 sm:gap-4">
        {/* Logo/Badge */}
        <img
          src={logoBCA}
          alt="Logo Công an"
          className="h-12 w-auto sm:h-14 object-contain drop-shadow-md transition-transform duration-300 hover:-translate-y-0.5 cursor-pointer"
          style={{ transitionTimingFunction: 'var(--ease-spring)' }}
        />

        <div className="flex flex-col">
          <h1 className="text-base sm:text-lg font-bold uppercase tracking-tight text-white/90 drop-shadow-sm leading-tight">
            Hỗ trợ Hành chính công
          </h1>
          <h2 className="text-sm sm:text-base font-bold uppercase tracking-widest text-[#FFF3C4] drop-shadow-sm leading-tight">
            Công an Hưng Yên
          </h2>
          <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5">
            <Bot className="h-3 w-3 text-blue-200" aria-hidden="true" />
            <span className="text-[10px] sm:text-xs font-medium text-blue-100/90">
              Trợ lý ảo AI - Hỗ trợ người dân 24/7
            </span>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex items-center gap-2 sm:gap-3">
        {/* Mode Toggle */}
        <div
          className="flex items-center rounded-xl border border-white/5 bg-white/5 p-1 backdrop-blur-md shadow-inner"
          role="tablist"
          aria-label="Chế độ tương tác"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'voice'}
            onClick={() => onModeChange('voice')}
            className={`flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-police-gold focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900 ${mode === 'voice'
              ? 'bg-police-green text-white shadow-md ring-1 ring-white/10'
              : 'text-white/70 hover:bg-white/5 hover:text-white active:bg-white/10'
              }`}
            style={mode === 'voice' ? { transitionTimingFunction: 'var(--ease-spring)' } : {}}
            aria-label="Chế độ Giọng nói"
          >
            <Mic className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Voice</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'chat'}
            onClick={() => onModeChange('chat')}
            className={`flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-police-gold focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900 ${mode === 'chat'
              ? 'bg-police-green text-white shadow-md ring-1 ring-white/10'
              : 'text-white/70 hover:bg-white/5 hover:text-white active:bg-white/10'
              }`}
            style={mode === 'chat' ? { transitionTimingFunction: 'var(--ease-spring)' } : {}}
            aria-label="Chế độ Chat"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Chat</span>
          </button>
        </div>

      </div>
    </header>
  );
};
