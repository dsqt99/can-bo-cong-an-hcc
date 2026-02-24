import React from 'react';
import { Bot, ShieldCheck, Settings as SettingsIcon, Mic, MessageSquare, Monitor } from 'lucide-react';

interface HeaderProps {
    onSettingsClick: () => void;
    mode: 'voice' | 'chat';
    onModeChange: (mode: 'voice' | 'chat') => void;
}

export const Header: React.FC<HeaderProps> = ({ onSettingsClick, mode, onModeChange }) => {
    return (
        <header
            className="relative flex w-full items-center justify-between gap-4 bg-gradient-to-r from-police-green via-police-green to-police-green/95 px-4 sm:px-6 lg:px-8 py-4 shadow-xl"
            role="banner"
        >
            {/* Decorative gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/5 via-transparent to-black/5 pointer-events-none" aria-hidden="true" />

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
                <div
                    className="relative flex h-12 w-12 sm:h-14 sm:w-14 lg:h-16 lg:w-16 items-center justify-center rounded-full bg-gradient-to-br from-police-red to-red-700 shadow-lg ring-2 ring-police-gold/80 transition-transform duration-300 hover:scale-105 cursor-pointer"
                    aria-label="Logo Công an"
                >
                    <ShieldCheck className="h-6 w-6 sm:h-7 sm:w-7 lg:h-9 lg:w-9 text-police-gold drop-shadow-md" aria-hidden="true" />
                    <div className="absolute inset-0 rounded-full border border-white/20 pointer-events-none" aria-hidden="true" />
                    {/* Shine effect */}
                    <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/20 to-transparent pointer-events-none" aria-hidden="true" />
                </div>

                <div className="flex flex-col">
                    <h1 className="text-base sm:text-lg lg:text-xl font-bold uppercase tracking-wide text-white drop-shadow-sm leading-tight">
                        Hỗ trợ Hành chính công
                    </h1>
                    <h2 className="text-sm sm:text-base lg:text-lg font-bold uppercase tracking-wider text-police-gold drop-shadow-sm leading-tight">
                        Công an tỉnh Hưng Yên
                    </h2>
                    <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5">
                        <Bot className="h-3 w-3 text-blue-200" aria-hidden="true" />
                        <span className="text-[10px] sm:text-xs font-medium text-blue-100/90">
                            Trợ lý ảo AI - Hỗ trợ người dân 24/7
                        </span>
                        {/* Desktop badge */}
                        {window.electronAPI?.isElectron && (
                            <span className="flex items-center gap-1 ml-2 px-1.5 py-0.5 rounded bg-white/10 text-[9px] text-white/60 font-medium">
                                <Monitor className="h-2.5 w-2.5" />
                                Desktop
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="relative z-10 flex items-center gap-2 sm:gap-3">
                {/* Mode Toggle */}
                <div
                    className="flex items-center rounded-xl border border-white/15 bg-white/10 p-1 backdrop-blur-sm shadow-inner"
                    role="tablist"
                    aria-label="Chế độ tương tác"
                >
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mode === 'voice'}
                        onClick={() => onModeChange('voice')}
                        className={`flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-police-gold focus-visible:ring-offset-1 focus-visible:ring-offset-police-green ${mode === 'voice'
                            ? 'bg-police-gold text-police-green shadow-md'
                            : 'text-white hover:bg-white/15 active:bg-white/20'
                            }`}
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
                        className={`flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-police-gold focus-visible:ring-offset-1 focus-visible:ring-offset-police-green ${mode === 'chat'
                            ? 'bg-police-gold text-police-green shadow-md'
                            : 'text-white hover:bg-white/15 active:bg-white/20'
                            }`}
                        aria-label="Chế độ Chat"
                    >
                        <MessageSquare className="h-4 w-4" aria-hidden="true" />
                        <span className="hidden sm:inline">Chat</span>
                    </button>
                </div>

                {/* Settings Button */}
                <button
                    onClick={onSettingsClick}
                    className="flex items-center gap-2 rounded-xl bg-white/10 px-3 sm:px-4 py-2.5 text-white shadow-sm transition-all duration-200 hover:bg-white/20 hover:shadow-md active:scale-95 border border-white/10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-police-gold focus-visible:ring-offset-1 focus-visible:ring-offset-police-green"
                    aria-label="Mở cài đặt"
                >
                    <SettingsIcon className="h-5 w-5" aria-hidden="true" />
                    <span className="text-sm font-semibold hidden sm:inline">Cài đặt</span>
                </button>
            </div>
        </header>
    );
};
