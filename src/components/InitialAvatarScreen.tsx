import { Mic } from 'lucide-react';
import Navbar, { LANGUAGES } from './Navbar';
import { useState, useRef, useEffect } from 'react';
import { translateText } from '../lib/api';

// ── UI string translation ────────────────────────────────────────────────────
const IA_EN = [
  /* 0 */ 'Tell us your problem',
  /* 1 */ 'You can tap where it hurts or type',
  /* 2 */ 'Ask your questions',
  /* 3 */ 'Start Speaking',
];
const IA_SEP = '\n~~~~\n';

interface InitialAvatarScreenProps {
  onContinue: () => void;
}

export default function InitialAvatarScreen({ onContinue }: InitialAvatarScreenProps) {
  const [currentLang, setCurrentLang] = useState<string>(
    () => localStorage.getItem('landing_display_lang')
      || 'en-IN',
  );
  const [iaStrings, setIaStrings] = useState<string[]>(IA_EN);
  const iaCache = useRef<Record<string, string[]>>({ 'en-IN': IA_EN });

  useEffect(() => {
    const code = currentLang;
    if (code === 'en-IN' || code === 'en-US') { setIaStrings(IA_EN); return; }
    if (iaCache.current[code]) { setIaStrings(iaCache.current[code]); return; }
    translateText(IA_EN.join(IA_SEP), 'en-IN', code)
      .then((r) => {
        const parts = r.translated_text.split(/~~~~/).map((p: string) => p.trim());
        const result = IA_EN.map((en, i) => parts[i]?.trim() || en);
        iaCache.current[code] = result;
        setIaStrings(result);
      })
      .catch(() => setIaStrings(IA_EN));
  }, [currentLang]);

  const ia = (i: number) => iaStrings[i] ?? IA_EN[i];

  return (
    <div 
      className="min-h-screen bg-gradient-to-b from-[#E9DDFB] via-[#D6C4F7] to-[#C4ACEF] flex flex-col cursor-pointer"
      onClick={onContinue}
    >
      <Navbar
        variant="transparent"
        sticky={false}
        showInlineDropdown
        selectedLanguage={LANGUAGES[currentLang] ?? 'English'}
        onSelectLanguage={(code) => setCurrentLang(code)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center px-3 sm:px-4 pt-2 pointer-events-none">
        <div className="text-center mb-2">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-800">{ia(0)}</h2>
          <p className="text-purple-600 text-xs sm:text-sm mt-1">
            {ia(1)}
          </p>
        </div>

        {/* Clean Avatar - No Interactive Regions */}
        <div className="relative w-full max-w-sm sm:max-w-md mx-auto">
          <img 
            src="/adultmaleimage.svg" 
            alt="Body diagram" 
            className="w-full h-auto object-contain select-none"
            draggable="false"
          />
        </div>

        {/* Input Field */}
        <div className="w-full max-w-sm sm:max-w-md mt-3 sm:mt-4">
          <input
            type="text"
            placeholder={ia(2)}
            className="w-full px-3 sm:px-4 py-2 sm:py-3 rounded-xl bg-white border-none outline-none text-sm sm:text-base text-gray-700 shadow-sm"
            readOnly
          />
        </div>

        {/* Start Speaking Button */}
        <button 
          className="w-full max-w-sm sm:max-w-md bg-[#2F66F3] text-white py-2.5 sm:py-3 rounded-xl mt-2 sm:mt-3 flex items-center justify-center gap-2 font-medium shadow-lg text-sm sm:text-base"
        >
          <Mic size={18} className="sm:w-5 sm:h-5" />
          {ia(3)}
        </button>
      </div>
    </div>
  );
}
