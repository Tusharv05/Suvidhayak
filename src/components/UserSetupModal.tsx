import { useState, useRef, useEffect } from 'react';
import { User, Weight, Calendar } from 'lucide-react';
import { translateText } from '../lib/api';
import Navbar, { LANGUAGES } from './Navbar';

const SEP = '\n~~~~\n';

// English string table
const EN: string[] = [
  /* 0  */ 'Tell us about you',
  /* 1  */ 'So we can give you the right medical advice',
  /* 2  */ 'Age',
  /* 3  */ 'e.g. 30',
  /* 4  */ 'Please enter a valid age (6 – 70)',
  /* 5  */ 'Gender',
  /* 6  */ 'Male',
  /* 7  */ 'Female',
  /* 8  */ 'Other',
  /* 9  */ 'Weight',
  /* 10 */ 'Please enter a valid weight (1 – 300 kg)',
  /* 11 */ 'e.g. 68',
  /* 12 */ 'kg',
  /* 13 */ 'Continue',
  /* 14 */ 'Your First Aid Assistant',
  /* 15 */ 'Select gender to continue',
];

const HI: string[] = [
  /* 0  */ 'अपने बारे में बताएं',
  /* 1  */ 'ताकि हम आपको सही चिकित्सीय सलाह दे सकें',
  /* 2  */ 'उम्र',
  /* 3  */ 'उदा. 30',
  /* 4  */ 'कृपया मान्य उम्र दर्ज करें (6 – 70)',
  /* 5  */ 'लिंग',
  /* 6  */ 'पुरुष',
  /* 7  */ 'महिला',
  /* 8  */ 'अन्य',
  /* 9  */ 'वज़न',
  /* 10 */ 'कृपया मान्य वज़न दर्ज करें (1 – 300 किग्रा)',
  /* 11 */ 'उदा. 68',
  /* 12 */ 'किग्रा',
  /* 13 */ 'जारी रखें',
  /* 14 */ 'आपका प्राथमिक चिकित्सा सहायक',
  /* 15 */ 'जारी रखने के लिए लिंग चुनें',
];

export interface SetupData {
  age: number;
  gender: string;
  weight: number | null;
  langCode: string;
}

interface UserSetupModalProps {
  onContinue: (data: SetupData) => void;
}

export default function UserSetupModal({ onContinue }: UserSetupModalProps) {
  const [ageInput, setAgeInput]     = useState('');
  const [gender, setGender]         = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [ageError, setAgeError]     = useState('');
  const [genderError, setGenderError] = useState(false);
  const [weightError, setWeightError] = useState('');

  const [selectedLang, setSelectedLang] = useState<string>(
    () => localStorage.getItem('landing_display_lang') ?? 'en-IN',
  );
  const [strings, setStrings]           = useState<string[]>(EN);
  const [isTranslating, setIsTranslating] = useState(false);

  const cache = useRef<Record<string, string[]>>({
    'en-IN': EN,
    'en-US': EN,
    'hi-IN': HI,
  });

  const s = (i: number) => strings[i] ?? EN[i];

  // ── Apply language ──────────────────────────────────────────────────────
  const applyLanguage = async (code: string) => {
    setSelectedLang(code);
    localStorage.setItem('landing_display_lang', code);
    if (code === 'en-IN' || code === 'en-US') { setStrings(EN); return; }
    if (cache.current[code]) { setStrings(cache.current[code]); return; }

    setIsTranslating(true);
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 3000)
      );
      const r: any = await Promise.race([
        translateText(EN.join(SEP), 'en-IN', code),
        timeoutPromise,
      ]);
      const parts = r.translated_text
        .split(/~~~~/)
        .map((p: string) => p.replace(/^\n|\n$/g, '').trim());
      const result = EN.map((en, i) => parts[i]?.trim() || en);
      cache.current[code] = result;
      setStrings(result);
    } catch {
      setStrings(EN);
    } finally {
      setIsTranslating(false);
    }
  };

  // Restore previously selected language on mount
  useEffect(() => {
    const saved = localStorage.getItem('landing_display_lang') ?? 'en-IN';
    if (saved !== 'en-IN') applyLanguage(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleContinue = () => {
    let ok = true;

    const ageNum = parseInt(ageInput.trim(), 10);
    if (!ageInput.trim() || isNaN(ageNum) || ageNum < 6 || ageNum > 70) {
      setAgeError(s(4));
      ok = false;
    } else {
      setAgeError('');
    }

    if (!gender) {
      setGenderError(true);
      ok = false;
    } else {
      setGenderError(false);
    }

    const weightNum = parseFloat(weightInput.trim());
    if (!weightInput.trim() || isNaN(weightNum) || weightNum < 1 || weightNum > 300) {
      setWeightError(s(10));
      ok = false;
    } else {
      setWeightError('');
    }

    if (!ok) return;

    onContinue({ age: ageNum, gender, weight: weightNum, langCode: selectedLang });
  };

  const isReady = ageInput.trim() !== '' && gender !== '' && weightInput.trim() !== '';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <Navbar
        variant="white"
        showInlineDropdown
        selectedLanguage={LANGUAGES[selectedLang] ?? 'English'}
        onSelectLanguage={(code) => applyLanguage(code)}
      />

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        {/* Card */}
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg overflow-hidden">

          {/* Card header strip */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-5">
            <h2 className="text-xl font-bold text-white">{s(0)}</h2>
            <p className="text-blue-100 text-sm mt-1">{s(1)}</p>
          </div>

          {/* Form body */}
          <div className="px-6 py-6 space-y-5">

            {/* Age */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
                <Calendar className="w-4 h-4 text-blue-500" />
                {s(2)} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={6}
                max={70}
                value={ageInput}
                onChange={(e) => { setAgeInput(e.target.value); setAgeError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
                placeholder={s(3)}
                className={`w-full px-4 py-3 rounded-xl border text-gray-800 text-base focus:outline-none focus:ring-2 transition-colors ${
                  ageError
                    ? 'border-red-400 focus:ring-red-200'
                    : 'border-gray-200 focus:border-blue-400 focus:ring-blue-100'
                }`}
              />
              {ageError && <p className="text-red-500 text-xs mt-1.5">{ageError}</p>}
            </div>

            {/* Gender */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
                <User className="w-4 h-4 text-blue-500" />
                {s(5)} <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Male', 'Female', 'Other'] as const).map((g, idx) => (
                  <button
                    key={g}
                    onClick={() => { setGender(g); setGenderError(false); }}
                    className={`py-3 rounded-xl text-sm font-medium transition-all ${
                      gender === g
                        ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-200'
                        : genderError
                        ? 'bg-white text-gray-700 border border-red-300 hover:border-red-400'
                        : 'bg-white text-gray-700 border border-gray-200 hover:border-blue-300 hover:text-blue-600'
                    }`}
                  >
                    {s(6 + idx)}
                  </button>
                ))}
              </div>
              {genderError && (
                <p className="text-red-500 text-xs mt-1.5">{s(15)}</p>
              )}
            </div>

            {/* Weight (required) */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
                <Weight className="w-4 h-4 text-blue-500" />
                {s(9)} <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={weightInput}
                  onChange={(e) => { setWeightInput(e.target.value); setWeightError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
                  placeholder={s(11)}
                  className={`flex-1 px-4 py-3 rounded-xl border text-gray-800 text-base focus:outline-none focus:ring-2 transition-colors ${
                    weightError
                      ? 'border-red-400 focus:ring-red-200'
                      : 'border-gray-200 focus:border-blue-400 focus:ring-blue-100'
                  }`}
                />
                <span className="text-sm font-semibold text-gray-500 w-8">{s(12)}</span>
              </div>
              {weightError && <p className="text-red-500 text-xs mt-1.5">{weightError}</p>}
            </div>

            {/* Continue button */}
            <button
              onClick={handleContinue}
              disabled={!isReady}
              className={`w-full py-3.5 rounded-xl font-semibold text-sm sm:text-base transition-all duration-200 ${
                isReady
                  ? 'bg-blue-600 text-white shadow-lg hover:bg-blue-700 active:scale-[0.98]'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {s(13)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
