import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { AvatarSection } from './components/AvatarSection';
import { MessageList } from './components/MessageList';
import { Settings, SettingsData } from './components/Settings';
import { useAudioStream } from './hooks/useAudioStream';

const DEFAULT_SETTINGS: SettingsData = {
  // LLM
  aiModel: 'chatbot-cahy',
  llmApiUrl: 'https://chat.anm05.com/api',
  llmApiKey: '',
  // STT
  sttModel: 'large-v3',
  // TTS
  ttsEngine: 'vieneu',
  ttsVoice: 'Ngọc (nữ miền Bắc)',
  ttsModel: 'vi-VN-Standard-A',
  speakingRate: 1.0,
  // Other
  systemPrompt: 'You are a helpful voice assistant. Keep your responses concise and conversational. You also need to output an emotion tag at the start of your response like [HAPPY], [SAD], [NEUTRAL], [THINKING], [SURPRISED], [ANGRY]. Example: \'[HAPPY] Hello! How can I help you today?\'',
  mcpServer: '',
};

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mode, setMode] = useState<'voice' | 'chat'>('voice');
  const [settings, setSettings] = useState<SettingsData>(() => {
    const saved = localStorage.getItem('voiceBotSettingsV4');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const [isChatVisible, setIsChatVisible] = useState(true);

  const {
    isConnected,
    appState,
    transcript,
    emotion,
    messages,
    error,
    startRecording,
    stopRecording,
    sendChatMessage,
    updateSettings,
    inputAnalyser,
    outputAnalyser,
    isConversationActive,
    streamingAiText,
    isAiProcessing,
  } = useAudioStream(settings);

  const isRecording = mode === 'voice' && appState === 'listening';

  useEffect(() => {
    updateSettings(settings);
  }, [settings, updateSettings]);

  useEffect(() => {
    if (mode === 'chat' && isConversationActive) {
      stopRecording();
    }
  }, [mode, isConversationActive, stopRecording]);

  const handleSaveSettings = (newSettings: SettingsData) => {
    setSettings(newSettings);
    localStorage.setItem('voiceBotSettingsV4', JSON.stringify(newSettings));
  };

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50 font-sans text-slate-900 antialiased"
    >
      {/* Skip to main content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-police-green focus:text-white focus:rounded-lg focus:shadow-lg"
      >
        Bỏ qua đến nội dung chính
      </a>

      {/* Header Area */}
      <Header
        onSettingsClick={() => setIsSettingsOpen(true)}
        mode={mode}
        onModeChange={setMode}
      />

      {/* Main Content Area */}
      <main
        id="main-content"
        className="flex flex-1 flex-col lg:flex-row overflow-hidden w-full"
      >
        {/* Left: Avatar Section */}
        <div className={`relative min-w-0 w-full transition-all duration-300 ${isChatVisible ? 'flex-[1] h-1/2 lg:h-full' : 'flex-1 h-full'}`}>
          <AvatarSection
            appState={appState}
            emotion={emotion}
            isConnected={isConnected}
            startRecording={startRecording}
            stopRecording={stopRecording}
            error={error}
            inputAnalyser={inputAnalyser}
            outputAnalyser={outputAnalyser}
            isConversationActive={isConversationActive}
            mode={mode}
            isChatVisible={isChatVisible}
            onToggleChat={() => setIsChatVisible(true)}
          />
        </div>

        {/* Right: Chat Section */}
        {isChatVisible && (
          <div className="flex-[1] relative min-w-0 w-full h-1/2 lg:h-full transition-all duration-300 animate-fade-in">
            <MessageList
              messages={messages}
              transcript={transcript}
              isRecording={isRecording}
              mode={mode}
              onSendMessage={sendChatMessage}
              isConnected={isConnected}
              appState={appState}
              streamingAiText={streamingAiText}
              isAiProcessing={isAiProcessing}
              onToggleChat={() => setIsChatVisible(false)}
            />
          </div>
        )}
      </main>

      {/* Settings Modal */}
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />
    </div>
  );
}

export default App;
