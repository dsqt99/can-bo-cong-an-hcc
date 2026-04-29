import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { AvatarSection } from './components/AvatarSection';
import { MessageList } from './components/MessageList';
import { WelcomeScreen } from './components/WelcomeScreen';
import { SettingsData } from './components/Settings';
import { useAudioStream } from './hooks/useAudioStream';

function App() {
  const [mode, setMode] = useState<'voice' | 'chat'>('voice');
  const [currentScreen, setCurrentScreen] = useState<'welcome' | 'chat'>('welcome');
  const [settings] = useState<SettingsData>(() => {
    const saved = localStorage.getItem('voiceBotSettingsV4');
    return saved ? JSON.parse(saved) : {} as SettingsData;
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
    isSttProcessing,
    sessionId,
    sessionHistory,
    clearCurrentSession,
    loadSessionFromHistory,
  } = useAudioStream(settings);

  const isRecording = mode === 'voice' && appState === 'listening';

  const handleStartConversation = () => {
    setCurrentScreen('chat');
  };

  const handleEndConversation = () => {
    if (appState === 'listening') {
      stopRecording();
    }
    clearCurrentSession();
    setCurrentScreen('welcome');
    setMode('voice');
  };

  useEffect(() => {
    if (settings && Object.keys(settings).length > 0) {
      updateSettings(settings);
    }
  }, [settings, updateSettings]);

  useEffect(() => {
    if (mode === 'chat' && isConversationActive) {
      stopRecording();
    }
  }, [mode, isConversationActive, stopRecording]);

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

      {currentScreen === 'welcome' ? (
        <WelcomeScreen
          onStartConversation={handleStartConversation}
          isConnected={isConnected}
        />
      ) : (
        <>
          {/* Header Area */}
          <Header
            mode={mode}
            onModeChange={setMode}
          />

          {/* Main Content Area */}
          <main
            id="main-content"
            className="flex flex-1 flex-col lg:flex-row overflow-hidden w-full"
          >
            {/* Left: Avatar Section */}
            <div className={`relative min-w-0 w-full transition-all duration-300 ${isChatVisible ? 'flex-[2] h-1/2 lg:h-full' : 'flex-1 h-full'}`}>
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
                onEndConversation={handleEndConversation}
              />
            </div>

            {/* Right: Chat Section */}
            {isChatVisible && (
              <div className="flex-[3] relative min-w-0 w-full h-1/2 lg:h-full transition-all duration-300 animate-fade-in">
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
                  isSttProcessing={isSttProcessing}
                  sessionHistory={sessionHistory}
                  onClearSession={clearCurrentSession}
                  onLoadSession={loadSessionFromHistory}
                  currentSessionId={sessionId}
                  onToggleChat={() => setIsChatVisible(false)}
                />
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
}

export default App;
