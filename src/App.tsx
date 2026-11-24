import { useState, useEffect } from 'react';
import SplashScreen from './components/SplashScreen';
import ImportantInformation from './components/ImportantInformation';
import UserSetupModal from './components/UserSetupModal';
import type { SetupData } from './components/UserSetupModal';
import BodyPartSelection from './components/BodyPartSelection';
import ChatInterface from './components/ChatInterface';

type Screen = 'splash' | 'info' | 'setup' | 'bodyPart' | 'chat';

function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('splash');
  const [selectedBodyParts, setSelectedBodyParts] = useState<string[]>([]);
  const [initialMessage, setInitialMessage] = useState<string | undefined>(undefined);
  const [setupData, setSetupData] = useState<SetupData | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setCurrentScreen('info'), 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleBodyPartContinue = (selectedParts: string[], message?: string) => {
    setSelectedBodyParts(selectedParts);
    setInitialMessage(message?.trim() || undefined);
    setCurrentScreen('chat');
  };

  const handleSetupContinue = (data: SetupData) => {
    setSetupData(data);
    setCurrentScreen('bodyPart');
  };

  const handleNewChat = () => {
    setSetupData(null);
    setSelectedBodyParts([]);
    setInitialMessage(undefined);
    setCurrentScreen('setup');
  };

  if (currentScreen === 'splash')   return <SplashScreen />;
  if (currentScreen === 'info')     return <ImportantInformation onContinue={() => setCurrentScreen('setup')} />;
  if (currentScreen === 'setup')    return <UserSetupModal onContinue={handleSetupContinue} />;
  if (currentScreen === 'bodyPart') return <BodyPartSelection onContinue={handleBodyPartContinue as any} initialLang={setupData?.langCode} initialAge={setupData?.age} initialGender={setupData?.gender} />;

  return (
    <ChatInterface
      selectedBodyParts={selectedBodyParts as any}
      initialMessage={initialMessage}
      initialAge={setupData?.age}
      initialGender={setupData?.gender}
      initialWeight={setupData?.weight ?? undefined}
      initialLang={setupData?.langCode}
      onBack={handleNewChat}
    />
  );
}

export default App;
