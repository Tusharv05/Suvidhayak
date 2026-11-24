import { useState } from 'react';
import { ChevronDown, Share2 } from 'lucide-react';

interface UserSetupFormProps {
  onContinue: (age: number, gender: string) => void;
}

export default function UserSetupForm({ onContinue }: UserSetupFormProps) {
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [ageError, setAgeError] = useState('');

  const handleContinue = () => {
    const ageNum = parseInt(age, 10);
    if (!age || isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
      setAgeError('Please enter a valid age between 1 and 120');
      return;
    }
    if (!gender) return;
    onContinue(ageNum, gender);
  };

  const isReady = age.trim() !== '' && gender !== '';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#E9DDFB] via-[#D6C4F7] to-[#C4ACEF] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 sm:p-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[#2F66F3] rounded-lg flex items-center justify-center text-white font-bold text-base sm:text-lg">
            S
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-semibold text-gray-800">Sahayak</h1>
            <p className="text-[10px] sm:text-xs text-gray-600">Your First Aid Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button className="w-7 h-7 sm:w-8 sm:h-8 bg-white rounded-full flex items-center justify-center shadow-sm">
            <Share2 size={14} className="sm:w-4 sm:h-4 text-gray-600" />
          </button>
          <button className="flex items-center gap-0.5 sm:gap-1 bg-white px-2 sm:px-3 py-1 sm:py-1.5 rounded-full shadow-sm">
            <span className="text-[10px] sm:text-sm text-gray-700">Language</span>
            <ChevronDown size={14} className="sm:w-4 sm:h-4 text-gray-600" />
            <span className="text-[10px] sm:text-sm font-medium text-gray-800">English</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 sm:px-6 gap-6">
        <div className="text-center">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-800">Tell us about yourself</h2>
          <p className="text-purple-600 text-xs sm:text-sm mt-1">
            So the assistant can give you the right advice
          </p>
        </div>

        <div className="w-full max-w-sm space-y-5">
          {/* Age input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Your Age</label>
            <input
              type="number"
              min={1}
              max={120}
              value={age}
              onChange={(e) => {
                setAge(e.target.value);
                setAgeError('');
              }}
              placeholder="e.g. 30"
              className="w-full px-4 py-3 rounded-xl bg-white border border-transparent focus:border-purple-400 focus:outline-none text-gray-800 shadow-sm text-base"
            />
            {ageError && (
              <p className="text-red-500 text-xs mt-1">{ageError}</p>
            )}
          </div>

          {/* Gender selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
            <div className="grid grid-cols-3 gap-2">
              {(['Male', 'Female', 'Other'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGender(g)}
                  className={`py-3 rounded-xl font-medium text-sm transition-all ${
                    gender === g
                      ? 'bg-[#2F66F3] text-white shadow-md'
                      : 'bg-white text-gray-700 border border-gray-200 hover:border-purple-300'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Continue button */}
          <button
            onClick={handleContinue}
            disabled={!isReady}
            className={`w-full py-3 rounded-xl font-medium transition-colors text-sm sm:text-base ${
              isReady
                ? 'bg-[#2F66F3] text-white shadow-lg hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
