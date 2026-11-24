import { useState } from 'react';
import { Share2, ChevronDown, ArrowLeft } from 'lucide-react';

// ── Single source of truth for supported languages ──────────────────────────
export const LANGUAGES: Record<string, string> = {
  'en-IN': 'English',
  'hi-IN': 'हिंदी',
  'bn-IN': 'বাংলা',
  'gu-IN': 'ગુજરાતી',
  'kn-IN': 'ಕನ್ನಡ',
  'ml-IN': 'മലയാളം',
  'mr-IN': 'मराठी',
  'od-IN': 'ଓଡ଼ିଆ',
  'pa-IN': 'ਪੰਜਾਬੀ',
  'ta-IN': 'தமிழ்',
  'te-IN': 'తెలుగు',
  'kha-IN': 'Khasi',
  'grt-IN': 'Garo',
  'lbj-IN': 'ལ་དྭགས་སྐད་ (Ladakhi)',
  'lbj-WY': 'Ladakhi (Wylie)',
};

/** Read the best available language from localStorage. */
export function getStoredLang(): string {
  return (
    localStorage.getItem('landing_display_lang') ||
    'en-IN'
  );
}

export interface NavbarProps {
  /** Show a back-arrow button on the left */
  onBack?: () => void;
  /**
   * Called when the user clicks the language badge/button.
   * If omitted the language pill is display-only.
   */
  onLanguageClick?: () => void;
  /**
   * Language name to display (e.g. "हिंदी").
   * Defaults to reading from localStorage via getStoredLang().
   */
  selectedLanguage?: string;
  /**
   * Called when an inline language is selected (only used when
   * `showInlineDropdown` is true).
   */
  onSelectLanguage?: (code: string) => void;
  /**
   * When true, an inline drop-down is rendered instead of delegating
   * to a modal via onLanguageClick.  Used by UserSetupModal.
   */
  showInlineDropdown?: boolean;
  /**
   * Visual variant:
   *  - 'white'       → white bg + bottom border (default, for info/setup screens)
   *  - 'transparent' → no bg (for gradient screens like BodyPart / Avatar)
   *  - 'shadow'      → white bg + shadow-sm (for chat screen)
   */
  variant?: 'white' | 'transparent' | 'shadow';
  /** Extra Tailwind classes added to the outer <div> */
  className?: string;
  /** Make the bar sticky to the top (default: true for 'white' and 'shadow') */
  sticky?: boolean;
}

export default function Navbar({
  onBack,
  onLanguageClick,
  selectedLanguage,
  onSelectLanguage,
  showInlineDropdown = false,
  variant = 'white',
  className = '',
  sticky,
}: NavbarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  // Internal code tracks selection when this navbar owns the dropdown
  const [internalCode, setInternalCode] = useState<string>(() => getStoredLang());

  // Resolve display language:
  // - if parent controls it via selectedLanguage prop, use that
  // - otherwise use internal state (self-managed dropdown)
  const displayLang = selectedLanguage ?? LANGUAGES[internalCode] ?? 'English';

  // When user picks a language in the inline dropdown:
  // - update internal state so the pill re-renders immediately
  // - persist to localStorage
  // - bubble up to parent if they also need to react (e.g. translations)
  const handleSelect = (code: string) => {
    setInternalCode(code);
    localStorage.setItem('landing_display_lang', code);
    onSelectLanguage?.(code);
    setDropdownOpen(false);
  };

  // Sticky default: true for opaque variants
  const isSticky = sticky ?? (variant !== 'transparent');

  const outerBase = [
    isSticky ? 'sticky top-0 z-30' : '',
    variant === 'white'       ? 'bg-white border-b border-gray-200' : '',
    variant === 'shadow'      ? 'bg-white shadow-sm' : '',
    variant === 'transparent' ? '' : '',
    'px-3 sm:px-4 py-3 flex items-center justify-between flex-shrink-0',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleLangClick = () => {
    if (showInlineDropdown) {
      setDropdownOpen(o => !o);
    } else if (onLanguageClick) {
      onLanguageClick();
    }
  };

  return (
    <div className={outerBase}>
      {/* ── Left: optional back + logo ─────────────────────────────── */}
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">S</span>
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-800">Sahayak</div>
          <div className="text-[10px] sm:text-xs text-gray-500">Your First Aid Assistant</div>
        </div>
      </div>

      {/* ── Right: share + language ────────────────────────────────── */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          className="text-gray-400 hover:text-gray-600 transition-colors hidden sm:block"
          aria-label="Share"
        >
          <Share2 className="w-5 h-5" />
        </button>

        {/* Language button / badge */}
        <div className="relative">
          <button
            onClick={handleLangClick}
            className={`flex items-center gap-1 text-sm border border-gray-200 rounded-full px-3 py-1.5 transition-colors ${
              onLanguageClick || showInlineDropdown
                ? 'text-gray-700 hover:bg-gray-50 cursor-pointer'
                : 'text-gray-700 cursor-default'
            }`}
            aria-label="Language"
          >
            <span className="font-semibold">{displayLang}</span>
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${
                dropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Inline dropdown */}
          {showInlineDropdown && dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
              {Object.entries(LANGUAGES).map(([code, name]) => {
                const active =
                  selectedLanguage === name ||
                  (!selectedLanguage && internalCode === code);
                return (
                  <button
                    key={code}
                    onClick={() => handleSelect(code)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      active
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Click-outside overlay for inline dropdown */}
      {showInlineDropdown && dropdownOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setDropdownOpen(false)}
        />
      )}
    </div>
  );
}
