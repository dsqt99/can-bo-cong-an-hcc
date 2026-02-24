import React, { useState, useEffect } from 'react';
import { X, Save, Settings2, Mic, Volume2, Cpu, Server, Gauge, Eye, EyeOff, ChevronDown } from 'lucide-react';

interface SettingsProps {
    isOpen: boolean;
    onClose: () => void;
    settings: SettingsData;
    onSave: (settings: SettingsData) => void;
}

export interface SettingsData {
    // LLM
    aiModel: string;
    llmApiUrl: string;
    llmApiKey: string;
    // STT
    sttModel: string;
    // TTS
    ttsEngine: string;
    ttsVoice: string;
    ttsModel: string;
    speakingRate: number;
    // Other
    systemPrompt: string;
    mcpServer: string;
}

const TTS_VOICES = [
    'Tuyên (nam miền Bắc)',
    'Vĩnh (nam miền Nam)',
    'Bình (nam miền Bắc)',
    'Đoan (nữ miền Nam)',
    'Ngọc (nữ miền Bắc)',
    'Ly (nữ miền Bắc)',
];

const STT_MODELS = [
    { value: 'tiny', label: 'Tiny – Nhanh nhất' },
    { value: 'base', label: 'Base – Cân bằng' },
    { value: 'small', label: 'Small – Chính xác hơn' },
    { value: 'medium', label: 'Medium – Độ chính xác cao' },
    { value: 'large-v2', label: 'Large v2 – Tốt nhất' },
    { value: 'large-v3', label: 'Large v3 – Mới nhất' },
];

export const Settings: React.FC<SettingsProps> = ({ isOpen, onClose, settings, onSave }) => {
    const [formData, setFormData] = useState<SettingsData>(settings);
    const [showApiKey, setShowApiKey] = useState(false);
    const [activeSection, setActiveSection] = useState<string>('llm');

    useEffect(() => {
        if (isOpen) {
            setFormData(settings);
            setShowApiKey(false);
        }
    }, [isOpen, settings]);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
        onClose();
    };

    const handleChange = (field: keyof SettingsData, value: string | number) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const sliderPercentage = ((formData.speakingRate - 0.5) / 1.5) * 100;

    const Section = ({ id, icon, title, children }: { id: string; icon: React.ReactNode; title: string; children: React.ReactNode }) => (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
                type="button"
                onClick={() => setActiveSection(activeSection === id ? '' : id)}
                className="w-full flex items-center justify-between px-4 py-3.5 bg-slate-50 hover:bg-slate-100 transition-colors duration-150 cursor-pointer"
                aria-expanded={activeSection === id}
            >
                <span className="flex items-center gap-2.5 text-sm font-bold text-slate-700 uppercase tracking-wide">
                    {icon}
                    {title}
                </span>
                <ChevronDown
                    className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${activeSection === id ? 'rotate-180' : ''}`}
                />
            </button>
            {activeSection === id && (
                <div className="p-4 space-y-4 border-t border-slate-200 bg-white">
                    {children}
                </div>
            )}
        </div>
    );

    const inputCls = "w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-police-green/30 focus:border-police-green transition-all duration-200 hover:border-slate-300 shadow-sm text-slate-700 text-sm";
    const labelCls = "block text-sm font-semibold text-slate-700 mb-1.5";

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl m-4 border border-slate-200 animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <header className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white/95 backdrop-blur-sm px-5 py-4 z-10 rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-police-green to-police-green/80 shadow-md">
                            <Settings2 className="h-4.5 w-4.5 text-white" aria-hidden="true" />
                        </div>
                        <div>
                            <h2 id="settings-title" className="text-lg font-bold text-slate-900">Cài đặt hệ thống</h2>
                            <p className="text-xs text-slate-500">Thay đổi có hiệu lực ngay khi lưu</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-slate-100 transition-all duration-200 hover:scale-110 active:scale-95 text-slate-500 hover:text-slate-700 cursor-pointer"
                        aria-label="Đóng cài đặt"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </header>

                {/* Content */}
                <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-3">

                    {/* ── LLM ── */}
                    <Section id="llm" icon={<Cpu className="h-4 w-4 text-police-green" />} title="Model ngôn ngữ (LLM)">
                        <div>
                            <label htmlFor="aiModel" className={labelCls}>Tên model</label>
                            <input
                                id="aiModel"
                                type="text"
                                value={formData.aiModel}
                                onChange={(e) => handleChange('aiModel', e.target.value)}
                                className={inputCls}
                                placeholder="vd: chatbot-cahy, qwen-text, gemini-2.5-flash"
                            />
                        </div>
                        <div>
                            <label htmlFor="llmApiUrl" className={labelCls}>API Base URL</label>
                            <input
                                id="llmApiUrl"
                                type="text"
                                value={formData.llmApiUrl}
                                onChange={(e) => handleChange('llmApiUrl', e.target.value)}
                                className={inputCls}
                                placeholder="vd: https://chat.anm05.com/api"
                            />
                        </div>
                        <div>
                            <label htmlFor="llmApiKey" className={labelCls}>API Key</label>
                            <div className="relative">
                                <input
                                    id="llmApiKey"
                                    type={showApiKey ? 'text' : 'password'}
                                    value={formData.llmApiKey}
                                    onChange={(e) => handleChange('llmApiKey', e.target.value)}
                                    className={`${inputCls} pr-10`}
                                    placeholder="Bearer token / API key..."
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowApiKey(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                                    aria-label={showApiKey ? 'Ẩn API key' : 'Hiện API key'}
                                >
                                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label htmlFor="systemPrompt" className={labelCls}>System Prompt</label>
                            <textarea
                                id="systemPrompt"
                                value={formData.systemPrompt}
                                onChange={(e) => handleChange('systemPrompt', e.target.value)}
                                rows={4}
                                className={`${inputCls} resize-none`}
                                placeholder="Nhập system prompt cho AI..."
                            />
                        </div>
                    </Section>

                    {/* ── STT ── */}
                    <Section id="stt" icon={<Mic className="h-4 w-4 text-police-green" />} title="Nhận diện giọng nói (STT)">
                        <div>
                            <label htmlFor="sttModel" className={labelCls}>Whisper Model</label>
                            <select
                                id="sttModel"
                                value={formData.sttModel}
                                onChange={(e) => handleChange('sttModel', e.target.value)}
                                className={inputCls}
                            >
                                {STT_MODELS.map(m => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                            <p className="mt-1.5 text-xs text-slate-500">
                                Model lớn hơn = chính xác hơn nhưng chậm hơn. Server STT: <code className="bg-slate-100 px-1 rounded text-slate-600">cahy-stt.anm05.com</code>
                            </p>
                        </div>
                    </Section>

                    {/* ── TTS ── */}
                    <Section id="tts" icon={<Volume2 className="h-4 w-4 text-police-green" />} title="Chuyển văn bản → giọng nói (TTS)">
                        <div>
                            <label htmlFor="ttsVoice" className={labelCls}>Giọng đọc</label>
                            <select
                                id="ttsVoice"
                                value={formData.ttsVoice}
                                onChange={(e) => handleChange('ttsVoice', e.target.value)}
                                className={inputCls}
                            >
                                {TTS_VOICES.map(v => (
                                    <option key={v} value={v}>{v}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label htmlFor="speakingRate" className="flex items-center justify-between text-sm font-semibold text-slate-700 mb-2">
                                <span className="flex items-center gap-2">
                                    <Gauge className="h-4 w-4 text-police-green" />
                                    Tốc độ nói
                                </span>
                                <span className="text-police-green font-bold">{formData.speakingRate.toFixed(1)}x</span>
                            </label>
                            <input
                                id="speakingRate"
                                type="range"
                                min="0.5"
                                max="2.0"
                                step="0.1"
                                value={formData.speakingRate}
                                onChange={(e) => handleChange('speakingRate', parseFloat(e.target.value))}
                                className="w-full h-3 rounded-lg appearance-none cursor-pointer shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-police-green focus-visible:ring-offset-2"
                                style={{
                                    background: `linear-gradient(to right, #00573D 0%, #00573D ${sliderPercentage}%, #e2e8f0 ${sliderPercentage}%, #e2e8f0 100%)`
                                }}
                                aria-valuemin={0.5}
                                aria-valuemax={2.0}
                                aria-valuenow={formData.speakingRate}
                            />
                            <div className="flex justify-between text-[11px] text-slate-500 font-medium mt-1.5 px-0.5">
                                <span>0.5x Chậm</span>
                                <span>1.0x Bình thường</span>
                                <span>2.0x Nhanh</span>
                            </div>
                        </div>
                    </Section>

                    {/* ── Advanced ── */}
                    <Section id="advanced" icon={<Server className="h-4 w-4 text-police-green" />} title="Nâng cao">
                        <div>
                            <label htmlFor="mcpServer" className={labelCls}>MCP Server URL</label>
                            <input
                                id="mcpServer"
                                type="text"
                                value={formData.mcpServer}
                                onChange={(e) => handleChange('mcpServer', e.target.value)}
                                className={inputCls}
                                placeholder="Nhập URL MCP server..."
                            />
                        </div>
                    </Section>

                    {/* Actions */}
                    <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-3 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 font-semibold shadow-sm cursor-pointer"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            className="flex items-center justify-center gap-2 px-5 py-2.5 text-white bg-gradient-to-r from-police-green to-police-green/90 rounded-xl hover:from-police-green/90 hover:to-police-green transition-all duration-200 font-semibold shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                        >
                            <Save className="h-4 w-4" />
                            Lưu & Áp dụng
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};
