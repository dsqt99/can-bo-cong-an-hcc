import React, { useState, useEffect } from 'react';
import { Minus, Square, X, Maximize2 } from 'lucide-react';

export const TitleBar: React.FC = () => {
    const [isMaximized, setIsMaximized] = useState(false);

    useEffect(() => {
        const checkMaximized = async () => {
            if (window.electronAPI) {
                const maximized = await window.electronAPI.isMaximized();
                setIsMaximized(maximized);
            }
        };
        checkMaximized();

        // Listen for resize events to update maximize state
        const handleResize = () => checkMaximized();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleMinimize = () => window.electronAPI?.minimize();
    const handleMaximize = async () => {
        await window.electronAPI?.maximize();
        const maximized = await window.electronAPI?.isMaximized();
        setIsMaximized(maximized ?? false);
    };
    const handleClose = () => window.electronAPI?.close();

    return (
        <div className="titlebar-drag relative flex h-10 w-full items-center justify-between bg-gradient-to-r from-police-green via-police-green to-police-green/95 select-none">
            {/* App icon & title area */}
            <div className="flex items-center gap-2.5 pl-4">
                {/* Small shield icon */}
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-police-red/90 shadow-sm">
                    <svg className="h-3 w-3 text-police-gold" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 6h2v2h-2V7zm0 4h2v6h-2v-6z" />
                    </svg>
                </div>
                <span className="text-[11px] font-semibold text-white/80 tracking-wide uppercase">
                    Voice Bot AI — Desktop
                </span>
            </div>

            {/* Window controls */}
            <div className="titlebar-no-drag flex h-full items-center">
                {/* Minimize */}
                <button
                    onClick={handleMinimize}
                    className="flex h-full w-12 items-center justify-center text-white/70 transition-all duration-150 hover:bg-white/15 hover:text-white cursor-pointer"
                    aria-label="Thu nhỏ cửa sổ"
                >
                    <Minus className="h-4 w-4" />
                </button>

                {/* Maximize / Restore */}
                <button
                    onClick={handleMaximize}
                    className="flex h-full w-12 items-center justify-center text-white/70 transition-all duration-150 hover:bg-white/15 hover:text-white cursor-pointer"
                    aria-label={isMaximized ? 'Khôi phục cửa sổ' : 'Phóng to cửa sổ'}
                >
                    {isMaximized ? (
                        <Maximize2 className="h-3.5 w-3.5" />
                    ) : (
                        <Square className="h-3.5 w-3.5" />
                    )}
                </button>

                {/* Close */}
                <button
                    onClick={handleClose}
                    className="flex h-full w-12 items-center justify-center text-white/70 transition-all duration-150 hover:bg-red-600 hover:text-white cursor-pointer"
                    aria-label="Đóng ứng dụng"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
};
