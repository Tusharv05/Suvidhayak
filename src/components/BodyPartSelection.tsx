import { Mic, Send } from 'lucide-react';
import Navbar, { LANGUAGES } from './Navbar';
import { useState, useRef, useEffect } from 'react';
import { speechToTextTranslate, translateText } from '../lib/api';

const SILENCE_THRESHOLD = 8;   // RMS level below which audio is considered silence
const SILENCE_DURATION = 4500; // ms of silence before auto-stopping

// ── Avatar selection ───────────────────────────────────────────────────────────────
function getAvatarInfo(age?: number, gender?: string): { src: string; aspectMatch: boolean } {
  const g = (gender ?? 'Male').toLowerCase();
  const a = age ?? 25;
  const isFemale = g === 'female';
  if (a <= 17) {
    // boychild is 353×688 (matches canvas); girlchild is 240×580 (needs "meet")
    return isFemale
      ? { src: '/girlchild.svg', aspectMatch: false }
      : { src: '/boychild.svg', aspectMatch: true };
  }
  if (a >= 50) {
    return { src: isFemale ? '/oldwoman.svg' : '/oldman.svg', aspectMatch: true };
  }
  // 18–49
  return { src: isFemale ? '/youngwoman.svg' : '/youngman.svg', aspectMatch: true };
}

// ── UI string translation ────────────────────────────────────────────────────
const BS_EN = [
  /* 0 */ 'Tell us your problem',
  /* 1 */ 'You can tap where it hurts or type',
  /* 2 */ 'Describe your symptoms...',
  /* 3 */ 'Send',
];
const BS_SEP = '\n~~~~\n';

type BodyPart =
  | 'chest'
  | 'abdomen'
  | 'leftUpperArm'
  | 'rightUpperArm'
  | 'leftElbow'
  | 'rightElbow'
  | 'leftForearm'
  | 'rightForearm'
  | 'leftHand'
  | 'rightHand'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftLeg'
  | 'rightLeg'
  | 'leftKnee'
  | 'rightKnee'
  | 'leftFoot'
  | 'rightFoot'
  | 'jaw'
  | 'forehead'
  | 'leftEye'
  | 'rightEye'
  | 'leftEar'
  | 'rightEar'
  | 'nose'
  | 'torso';

interface BodyPartSelectionProps {
  onContinue?: (selectedParts: BodyPart[], initialMessage?: string) => void;
  initialLang?: string;
  initialAge?: number;
  initialGender?: string;
}

const BodyPartSelection = ({ onContinue, initialLang = 'en-IN', initialAge, initialGender }: BodyPartSelectionProps) => {
  // Read language from localStorage — prefer sarvam_language_code (detected by STT) then the UI selection
  const [currentLang, setCurrentLang] = useState<string>(
    () => localStorage.getItem('landing_display_lang')
      || initialLang
      || 'en-IN',
  );
  const [bsStrings, setBsStrings] = useState<string[]>(BS_EN);
  const bsCache = useRef<Record<string, string[]>>({ 'en-IN': BS_EN });
  const [selectedParts, setSelectedParts] = useState<Set<BodyPart>>(new Set());
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessingSTT, setIsProcessingSTT] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceAnimFrameRef = useRef<number>(0);
  /** Holds the English transcript when the input box shows the user's language text */
  const englishInputRef = useRef<string>('');

  // ── Translate UI strings when language changes ───────────────────────────
  useEffect(() => {
    const code = currentLang;
    if (code === 'en-IN' || code === 'en-US') { setBsStrings(BS_EN); return; }
    if (bsCache.current[code]) { setBsStrings(bsCache.current[code]); return; }
    translateText(BS_EN.join(BS_SEP), 'en-IN', code)
      .then((r) => {
        const parts = r.translated_text.split(/~~~~/).map((p: string) => p.trim());
        const result = BS_EN.map((en, i) => parts[i]?.trim() || en);
        bsCache.current[code] = result;
        setBsStrings(result);
      })
      .catch(() => setBsStrings(BS_EN));
  }, [currentLang]);

  const bs = (i: number) => bsStrings[i] ?? BS_EN[i];

  const stopAllRecording = () => {
    cancelAnimationFrame(silenceAnimFrameRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    setIsListening(false);
  };

  const toggleMic = async () => {
    if (isListening) {
      stopAllRecording();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // ── Start browser native SpeechRecognition for immediate live feedback ──
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = currentLang || 'en-IN';

          recognition.onresult = (event: any) => {
            let fullText = '';
            for (let i = 0; i < event.results.length; ++i) {
              fullText += event.results[i][0].transcript;
            }
            if (fullText.trim()) {
              setInputText(fullText.trim());
            }
          };

          recognition.onerror = (e: any) => {
            console.warn('SpeechRecognition notice:', e.error);
          };

          recognition.onend = () => {
            recognitionRef.current = null;
          };

          recognition.start();
          recognitionRef.current = recognition;
        } catch (e) {
          console.warn('SpeechRecognition init error:', e);
        }
      }

      // ── Silence detection via Web Audio ───────────────────────────────
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      let silenceStart = Date.now();
      let hasHeardSpeech = false;

      const checkSilence = () => {
        analyser.getByteFrequencyData(freqData);
        const rms = Math.sqrt(freqData.reduce((s, v) => s + v * v, 0) / freqData.length);
        if (rms >= SILENCE_THRESHOLD) {
          hasHeardSpeech = true;
          silenceStart = Date.now();
        } else if (hasHeardSpeech && (Date.now() - silenceStart >= SILENCE_DURATION)) {
          // Auto-stop only after speech was detected and then followed by silence
          stopAllRecording();
          return;
        }
        silenceAnimFrameRef.current = requestAnimationFrame(checkSilence);
      };

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        cancelAnimationFrame(silenceAnimFrameRef.current);
        audioCtx.close().catch(() => {});
        audioContextRef.current = null;
        stream.getTracks().forEach((t) => t.stop());

        if (audioChunksRef.current.length > 0) {
          setIsProcessingSTT(true);
          try {
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const file = new File([blob], 'recording.webm', { type: 'audio/webm' });
            const result = await speechToTextTranslate(file);
            const englishTranscript = result.transcript?.trim() ?? '';
            const langCode = result.language_code ?? '';
            if (langCode) localStorage.setItem('landing_display_lang', langCode);

            if (englishTranscript) {
              englishInputRef.current = englishTranscript;
              const isNonEnglish = langCode && langCode !== 'en-IN' && langCode !== 'en-US';
              if (isNonEnglish) {
                try {
                  const back = await translateText(englishTranscript, 'en-IN', langCode);
                  setInputText((prev) =>
                    prev ? prev + ' ' + (back.translated_text || englishTranscript) : (back.translated_text || englishTranscript)
                  );
                } catch {
                  setInputText((prev) => (prev ? prev + ' ' + englishTranscript : englishTranscript));
                }
              } else {
                setInputText(englishTranscript);
              }
            }
          } catch (err) {
            console.warn('Sarvam STT notice (using live transcript if available):', err);
          } finally {
            setIsProcessingSTT(false);
          }
        }
      };

      mediaRecorder.start(250);
      setIsListening(true);
      silenceAnimFrameRef.current = requestAnimationFrame(checkSilence);
    } catch {
      alert('Could not access microphone. Please allow microphone permission in your browser.');
    }
  };

  const handleSend = () => {
    // Always pass the text as shown in the input box — backend detects the language.
    const msgToSend = inputText.trim();
    englishInputRef.current = '';
    onContinue?.(Array.from(selectedParts) as any, msgToSend || undefined);
  };

  const toggleBodyPart = (part: BodyPart) => {
    setSelectedParts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(part)) {
        newSet.delete(part);
      } else {
        // Limit selection to 2 body parts
        if (newSet.size < 2) {
          newSet.add(part);
        }
      }
      return newSet;
    });
  };

  const isSelected = (part: BodyPart) => selectedParts.has(part);

  const avatar = getAvatarInfo(initialAge, initialGender);
  const age = initialAge ?? 25;
  const gender = (initialGender ?? 'Male').toLowerCase();
  const isFemale = gender === 'female';
  
  // Determine avatar type
  let avatarType: 'childMale' | 'childFemale' | 'adultMale' | 'adultFemale' | 'elderlyMale' | 'elderlyFemale';
  if (age <= 17) {
    avatarType = isFemale ? 'childFemale' : 'childMale';
  } else if (age >= 50) {
    avatarType = isFemale ? 'elderlyFemale' : 'elderlyMale';
  } else {
    avatarType = isFemale ? 'adultFemale' : 'adultMale';
  }

  // Helper function to get transform based on avatar type
  const getTransform = (part: string) => {
    const transforms: Record<string, Record<typeof avatarType, string>> = {
      jaw: {
        childMale: 'translate(39, 68) scale(0.77, 0.74)',
        childFemale: 'translate(-28, -13) scale(1.20, 0.98)',
        adultMale: 'translate(11, 9) scale(0.93, 0.90)',
        adultFemale: 'translate(13, 42) scale(0.94, 0.76)',
        elderlyMale: 'translate(14, 19) scale(0.92, 0.89)',
        elderlyFemale: 'translate(30, 37) scale(0.80, 0.77)',
      },
      forehead: {
        childMale: 'translate(36, 102) scale(0.79, 0.34)',
        childFemale: 'translate(-9, 10) scale(1.08, 0.58)',
        adultMale: 'translate(8, 57) scale(0.95, 0.50)',
        adultFemale: 'translate(35, 86) scale(0.80, 0.37)',
        elderlyMale: 'translate(9, 68) scale(0.94, 0.49)',
        elderlyFemale: 'translate(14, 72) scale(0.90, 0.47)',
      },
      leftEye: {
        childMale: 'translate(157, 159) scale(0.84, 0.92)',
        childFemale: 'translate(160, 110) scale(1.30, 1.29)',
        adultMale: 'translate(160, 132) scale(0.94, 0.92)',
        adultFemale: 'translate(163, 143) scale(0.88, 0.85)',
        elderlyMale: 'translate(163, 143) scale(0.93, 0.91)',
        elderlyFemale: 'translate(160, 142) scale(0.89, 0.86)',
      },
      rightEye: {
        childMale: 'translate(189, 159) scale(0.84, 0.92)',
        childFemale: 'translate(202, 110) scale(1.30, 1.29)',
        adultMale: 'translate(186, 132) scale(0.94, 0.92)',
        adultFemale: 'translate(187, 143) scale(0.88, 0.85)',
        elderlyMale: 'translate(188, 143) scale(0.93, 0.91)',
        elderlyFemale: 'translate(183, 142) scale(0.89, 0.86)',
      },
      nose: {
        childMale: 'translate(182, 175) scale(0.84, 0.82)',
        childFemale: 'translate(190, 126) scale(1.05, 1.17)',
        adultMale: 'translate(183, 148) scale(0.94, 0.92)',
        adultFemale: 'translate(182, 160) scale(0.82, 0.81)',
        elderlyMale: 'translate(183, 155) scale(0.93, 0.91)',
        elderlyFemale: 'translate(180, 158) scale(0.86, 0.84)',
      },
      leftEar: {
        childMale: 'translate(133, 164) scale(0.40, 0.68) scale(-1, 1)',
        childFemale: 'translate(122, 114) scale(0.68, 0.95) scale(-1, 1)',
        adultMale: 'translate(137, 136) scale(0.50, 0.78) scale(-1, 1)',
        adultFemale: 'translate(141, 144) scale(0.48, 0.75) scale(-1, 1)',
        elderlyMale: 'translate(140, 143) scale(0.49, 0.77) scale(-1, 1)',
        elderlyFemale: 'translate(136, 144) scale(0.47, 0.74) scale(-1, 1)',
      },
      rightEar: {
        childMale: 'translate(213, 164) scale(0.40, 0.68) scale(-1, 1)',
        childFemale: 'translate(240, 114) scale(0.68, 0.95) scale(-1, 1)',
        adultMale: 'translate(210, 136) scale(0.50, 0.78) scale(-1, 1)',
        adultFemale: 'translate(211, 144) scale(0.48, 0.75) scale(-1, 1)',
        elderlyMale: 'translate(211, 143) scale(0.49, 0.77) scale(-1, 1)',
        elderlyFemale: 'translate(204, 144) scale(0.47, 0.74) scale(-1, 1)',
      },
      torso: {
        childMale: 'translate(78, 120) scale(0.55, 0.55)',
        childFemale: 'translate(19, 16) scale(0.93, 0.95)',
        adultMale: 'translate(8, 11) scale(0.95, 0.97)',
        adultFemale: 'translate(60, 64) scale(0.67, 0.72)',
        elderlyMale: 'translate(65, 80) scale(0.64, 0.66)',
        elderlyFemale: 'translate(65, 75) scale(0.62, 0.65)',
      },
      leftShoulder: {
        childMale: 'translate(142, 228) scale(0.75, 0.75) rotate(47)',
        childFemale: 'translate(145, 204) scale(0.73, 0.74) rotate(47)',
        adultMale: 'translate(139, 203) scale(0.85, 0.85) rotate(47)',
        adultFemale: 'translate(150, 206) scale(0.83, 0.84) rotate(47)',
        elderlyMale: 'translate(145, 210) scale(0.84, 0.84) rotate(47)',
        elderlyFemale: 'translate(145, 205) scale(0.82, 0.83) rotate(47)',
      },
      rightShoulder: {
        childMale: 'translate(206, 228) scale(-0.70, 0.76) rotate(47)',
        childFemale: 'translate(214, 204) scale(-0.75, 0.80) rotate(47)',
        adultMale: 'translate(209, 203) scale(-0.80, 0.86) rotate(47)',
        adultFemale: 'translate(208, 204) scale(-0.78, 0.85) rotate(47)',
        elderlyMale: 'translate(208, 210) scale(-0.79, 0.85) rotate(47)',
        elderlyFemale: 'translate(209, 205) scale(-0.77, 0.84) rotate(47)',
      },
      chest: {
        childMale: 'translate(40, 53) scale(0.75, 0.89)',
        childFemale: 'translate(28, -80) scale(0.88, 1.38)',
        adultMale: 'translate(17, 4) scale(0.90, 0.99)',
        adultFemale: 'translate(48, 18) scale(0.74, 0.92)',
        elderlyMale: 'translate(22, 13) scale(0.89, 0.98)',
        elderlyFemale: 'translate(18, 6) scale(0.87, 0.97)',
      },
      abdomen: {
        childMale: 'translate(37, 70) scale(0.77, 0.85)',
        childFemale: 'translate(-6, 20) scale(1.08, 1.08)',
        adultMale: 'translate(7, 11) scale(0.96, 0.98)',
        adultFemale: 'translate(21, 23) scale(0.88, 0.92)',
        elderlyMale: 'translate(8, 28) scale(0.95, 0.97)',
        elderlyFemale: 'translate(8, 13) scale(0.93, 0.96)',
      },
      leftUpperArm: {
        childMale: 'translate(42, 55) scale(0.75, 0.80)',
        childFemale: 'translate(32, 32) scale(0.80, 0.85)',
        adultMale: 'translate(25, 14) scale(0.85, 0.90)',
        adultFemale: 'translate(43, 24) scale(0.77, 0.83)',
        elderlyMale: 'translate(30, 15) scale(0.84, 0.89)',
        elderlyFemale: 'translate(30, 16) scale(0.82, 0.88)',
      },
      rightUpperArm: {
        childMale: 'translate(45, 65) scale(0.75, 0.80)',
        childFemale: 'translate(53, 32) scale(0.80, 0.85)',
        adultMale: 'translate(25, 14) scale(0.86, 0.90)',
        adultFemale: 'translate(45, 27) scale(0.77, 0.83)',
        elderlyMale: 'translate(30, 15) scale(0.85, 0.89)',
        elderlyFemale: 'translate(26, 16) scale(0.83, 0.88)',
      },
      leftElbow: {
        childMale: 'translate(40, 62) scale(0.75, 0.80)',
        childFemale: 'translate(32, 53) scale(0.73, 0.79)',
        adultMale: 'translate(25, 14) scale(0.85, 0.90)',
        adultFemale: 'translate(43, 24) scale(0.76, 0.82)',
        elderlyMale: 'translate(34, 35) scale(0.80, 0.84)',
        elderlyFemale: 'translate(26, 16) scale(0.82, 0.88)',
      },
      rightElbow: {
        childMale: 'translate(48, 62) scale(0.76, 0.80)',
        childFemale: 'translate(76, 53) scale(0.74, 0.79)',
        adultMale: 'translate(25, 14) scale(0.86, 0.90)',
        adultFemale: 'translate(45, 27) scale(0.76, 0.82)',
        elderlyMale: 'translate(41, 35) scale(0.80, 0.84)',
        elderlyFemale: 'translate(26, 16) scale(0.83, 0.88)',
      },
      leftForearm: {
        childMale: 'translate(32, 88) scale(0.77, 0.75)',
        childFemale: 'translate(08, 10) scale(0.80, 0.99)',
        adultMale: 'translate(18, 14) scale(0.92, 0.90)',
        adultFemale: 'translate(36, 28) scale(0.79, 0.84)',
        elderlyMale: 'translate(19, 25) scale(0.91, 0.89)',
        elderlyFemale: 'translate(19, 16) scale(0.89, 0.88)',
      },
      rightForearm: {
        childMale: 'translate(48, 88) scale(0.77, 0.75)',
        childFemale: 'translate(75, 07) scale(0.80, 0.99)',
        adultMale: 'translate(14, 14) scale(0.92, 0.90)',
        adultFemale: 'translate(43, 28) scale(0.79, 0.84)',
        elderlyMale: 'translate(15, 25) scale(0.91, 0.89)',
        elderlyFemale: 'translate(15, 16) scale(0.89, 0.88)',
      },
      leftHand: {
        childMale: 'translate(28, 72) scale(0.78, 0.80)',
        childFemale: 'translate(04, 89) scale(0.80, 0.81)',
        adultMale: 'translate(21, 17) scale(0.88, 0.90)',
        adultFemale: 'translate(23, 18) scale(0.86, 0.89)',
        elderlyMale: 'translate(22, 28) scale(0.87, 0.89)',
        elderlyFemale: 'translate(22, 19) scale(0.85, 0.88)',
      },
      rightHand: {
        childMale: 'translate(44, 72) scale(0.78, 0.80)',
        childFemale: 'translate(86, 89) scale(0.79, 0.81)',
        adultMale: 'translate(24, 17) scale(0.88, 0.90)',
        adultFemale: 'translate(29, 18) scale(0.86, 0.89)',
        elderlyMale: 'translate(25, 28) scale(0.87, 0.89)',
        elderlyFemale: 'translate(25, 19) scale(0.85, 0.88)',
      },
      leftLeg: {
        childMale: 'translate(37, 53) scale(0.78, 0.85)',
        childFemale: 'translate(40, 47) scale(0.76, 0.98)',
        adultMale: 'translate(21, 55) scale(0.88, 0.85)',
        adultFemale: 'translate(25, 61) scale(0.86, 0.84)',
        elderlyMale: 'translate(22, 56) scale(0.87, 0.84)',
        elderlyFemale: 'translate(22, 57) scale(0.85, 0.83)',
      },
      rightLeg: {
        childMale: 'translate(37, 53) scale(0.78, 0.85)',
        childFemale: 'translate(53, 47) scale(0.76, 0.98)',
        adultMale: 'translate(25, 55) scale(0.88, 0.85)',
        adultFemale: 'translate(25, 61) scale(0.86, 0.84)',
        elderlyMale: 'translate(26, 56) scale(0.87, 0.84)',
        elderlyFemale: 'translate(26, 57) scale(0.85, 0.83)',
      },
      leftKnee: {
        childMale: 'translate(38, 20) scale(0.79, 0.77)',
        childFemale: 'translate(40, 100) scale(0.77, 0.75)',
        adultMale: 'translate(21, -12) scale(0.88, 0.85)',
        adultFemale: 'translate(27, -5) scale(0.86, 0.84)',
        elderlyMale: 'translate(22, -11) scale(0.87, 0.84)',
        elderlyFemale: 'translate(22, -10) scale(0.85, 0.83)',
      },
      rightKnee: {
        childMale: 'translate(34, 30) scale(0.78, 0.75)',
        childFemale: 'translate(51, 105) scale(0.76, 0.74)',
        adultMale: 'translate(25, -12) scale(0.88, 0.85)',
        adultFemale: 'translate(25, -5) scale(0.86, 0.84)',
        elderlyMale: 'translate(26, -11) scale(0.87, 0.84)',
        elderlyFemale: 'translate(26, -10) scale(0.85, 0.83)',
      },
      leftFoot: {
        childMale: 'translate(34, 68) scale(0.78, 0.82)',
        childFemale: 'translate(45, 145) scale(0.76, 0.81)',
        adultMale: 'translate(18, 10) scale(0.88, 0.92)',
        adultFemale: 'translate(29, 14) scale(0.86, 0.91)',
        elderlyMale: 'translate(22, 11) scale(0.87, 0.91)',
        elderlyFemale: 'translate(27, 15) scale(0.85, 0.90)',
      },
      rightFoot: {
        childMale: 'translate(37 , 68) scale(0.78, 0.82)',
        childFemale: 'translate(53, 145) scale(0.76, 0.81)',
        adultMale: 'translate(18, 10) scale(0.88, 0.92)',
        adultFemale: 'translate(25, 14) scale(0.86, 0.91)',
        elderlyMale: 'translate(22 , 11) scale(0.87, 0.91)',
        elderlyFemale: 'translate(19, 15) scale(0.85, 0.90)',
      },
    };
    return transforms[part]?.[avatarType] || transforms[part]?.adultMale || '';
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#E9DDFB] via-[#D6C4F7] to-[#C4ACEF] flex flex-col">
      <Navbar variant="transparent" sticky={false} showInlineDropdown selectedLanguage={LANGUAGES[currentLang] ?? 'English'} onSelectLanguage={(code) => { setCurrentLang(code); }} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-3 sm:px-4">
        <div className="text-center mb-3">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-800">{bs(0)}</h2>
          <p className="text-purple-600 text-xs sm:text-sm mt-1">
            {bs(1)}
          </p>
        </div>

        {/* Interactive Body Diagram */}
        <div className="relative w-full max-w-xs sm:max-w-sm mx-auto flex items-center justify-center">
          <svg
            width="353"
            height="688"
            viewBox="0 0 353 688"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            xmlnsXlink="http://www.w3.org/1999/xlink"
            className="max-w-full h-auto"
            preserveAspectRatio="xMidYMid meet"
          >
            <g>
              <image
                href={avatar.src}
                x="19"
                y="4"
                width="315"
                height="680"
                preserveAspectRatio={avatar.aspectMatch ? 'xMidYMid slice' : 'xMidYMid meet'}
              />
            </g>

            {/* Jaw */}
            <g transform={getTransform('jaw')}>
            <path
              d="M150 175 Q162 200 175 200 Q188 200 200 175 Q192 178 185 180 Q178 182 163 180 Q156 178 150 175 Z"
              fill={isSelected('jaw') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('jaw') ? '0.8' : '1'}
              stroke={isSelected('jaw') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('jaw')}
            />
            </g>

            {/* Forehead */}
            <g transform={getTransform('forehead')}>
            <path
              d="M152.5 89.4998C155 87.4998 184.5 86.4998 196 89.4998C207.5 92.4998 205.5 104 206.5 106.5C207.5 109 206.5 113.5 209 120C210 122.5 209 125 208 127C207 129 205 130 203 131C201 132 198 132.5 195 132.5H150C148 132.5 146 132 144 131C142 130 140.5 128.5 139.5 126.5C138.5 124.5 138 122 138.5 120C139 117 141 112 143 109.5C144.5 104 146 95 148 92C150 89.4999 152.5 89.4998 152.5 89.4998Z"
              fill={isSelected('forehead') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('forehead') ? '0.8' : '1'}
              stroke={isSelected('forehead') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('forehead')}
            />
            </g>

            {/* Left Eye */}
            <g transform={getTransform('leftEye')}>
            <path
              d="M0 0C4.261 0.328 5.875 2.116 6.35 4.041C6.648 5.248 5.902 6.427 4.813 7.025C-1.854 10.685 -7.282 9.053 -9.673 6.921C-10.277 6.382 -10.545 5.542 -10.236 4.795C-9.245 2.402 -5.526 -0.425 0 0Z"
              fill={isSelected('leftEye') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('leftEye') ? '0.8' : '1'}
              stroke={isSelected('leftEye') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('leftEye')}
            />
            </g>

            {/* Right Eye */}
            <g transform={getTransform('rightEye')}>
            <path
              d="M0 0C-4.262 0.328 -5.876 2.116 -6.351 4.041C-6.649 5.248 -5.903 6.427 -4.813 7.025C1.853 10.685 7.281 9.053 9.672 6.921C10.276 6.382 10.545 5.542 10.235 4.795C9.244 2.402 5.525 -0.425 0 0Z"
              fill={isSelected('rightEye') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('rightEye') ? '0.8' : '1'}
              stroke={isSelected('rightEye') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('rightEye')}
            />
            </g>

            {/* Nose */}
            <g transform={getTransform('nose')}>
            <path
              d="M0 0L-4.113 -17.951C-4.53 -19.768 -6.148 -21.057 -8.012 -21.057H-10.638C-12.503 -21.057 -14.121 -19.768 -14.537 -17.951L-18.651 0C-19.05 1.742 -18.245 3.537 -16.68 4.398L-11.253 7.383C-10.053 8.043 -8.598 8.043 -7.398 7.383L-1.971 4.398C-0.405 3.537 0.399 1.742 0 0Z"
              fill={isSelected('nose') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('nose') ? '0.8' : '1'}
              stroke={isSelected('nose') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('nose')}
            />
            </g>

            {/* Left Ear */}
            <g transform={getTransform('leftEar')}>
            <path
              d="M0 0C-2 0 -5 2 -7 5C-9 8 -10 12 -10 16C-10 20 -9 24 -7 27C-5 30 -2 32 0 32C2 32 4 31 6 29C7 27 8 24 8 21L8 11C8 8 7 5 6 3C4 1 2 0 0 0Z"
              fill={isSelected('leftEar') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('leftEar') ? '0.8' : '1'}
              stroke={isSelected('leftEar') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('leftEar')}
            />
            </g>

            {/* Right Ear */}
            <g transform={getTransform('rightEar')}>
            <path
              d="M0 0C2 0 5 2 7 5C9 8 10 12 10 16C10 20 9 24 7 27C5 30 2 32 0 32C-2 32 -4 31 -6 29C-7 27 -8 24 -8 21L-8 11C-8 8 -7 5 -6 3C-4 1 -2 0 0 0Z"
              fill={isSelected('rightEar') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('rightEar') ? '0.8' : '1'}
              stroke={isSelected('rightEar') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('rightEar')}
            />
            </g>

            {/* Torso */}
            <g transform={getTransform('torso')}>
            <path
              d="M195 180.597V180.152C195 177.541 192.539 175.63 190.009 176.277L174.542 180.233C173.859 180.408 173.143 180.399 172.465 180.208L156.966 175.837C155.218 175.344 153.357 176.09 152.435 177.654L143.663 192.527C142.943 193.749 142.923 195.262 143.612 196.502L151.357 210.443C152.062 211.712 153.401 212.5 154.854 212.5H192.646C194.099 212.5 195.438 211.712 196.143 210.443L203.697 196.846C204.485 195.427 204.338 193.672 203.324 192.404L195.877 183.096C195.309 182.386 195 181.505 195 180.597Z"
              fill={isSelected('torso') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('torso') ? '0.8' : '1'}
              stroke={isSelected('torso') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('torso')}
            />
            </g>

            {/* Left Shoulder */}
            <g transform={getTransform('leftShoulder')}>
            <path
              d="M0 0C-2 2 -10 15 -12 20C-14 25 -16 30 -17 32C-18 34 -11 37 -5 37C1 37 8 35 10 33C12 31 14 26 15 20C16 14 14 8 12 4C10 0 5 -2 0 0Z"

              fill={isSelected('leftShoulder') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('leftShoulder') ? '0.8' : '1'}
              stroke={isSelected('leftShoulder') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('leftShoulder')}
            />
            </g>

            {/* Right Shoulder */}
            <g transform={getTransform('rightShoulder')}>
            <path
              d="M0 0C-2 2 -10 15 -12 20C-14 25 -16 30 -17 32C-18 34 -11 37 -5 37C1 37 8 35 10 33C12 31 14 26 15 20C16 14 14 8 12 4C10 0 5 -2 0 0Z"
              fill={isSelected('rightShoulder') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('rightShoulder') ? '0.8' : '1'}
              stroke={isSelected('rightShoulder') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('rightShoulder')}
            />
            </g>

            {/* Chest */}
            <g transform={getTransform('chest')}>
            <path
              d="M241.457 228.864C236.269 222.797 141.811 226.296 109.361 228.832C109.079 228.854 108.808 228.886 108.565 229.033C105.158 231.088 118.326 243.587 117.121 260.244C116.952 276.437 116.866 292.103 117.121 294.038C117.622 297.845 225.817 292.014 230.325 291.538C232.576 291.3 231.822 278.467 230.325 263.677C228.824 248.844 244.718 232.677 241.457 228.864Z"
              fill={isSelected('chest') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('chest') ? '0.8' : '1'}
              stroke={isSelected('chest') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('chest')}
            />
            </g>

            {/* Abdomen */}
            <g transform={getTransform('abdomen')}>
            <path
              d="M232.5 296C232.5 287.953 197.109 298.813 122.427 297.048C121.222 297.02 120.036 297.517 119.557 298.622C114.393 310.531 113.5 365.3 113.5 369C113.5 379 238.5 376.545 238.5 372C238.5 359.5 232.5 306.5 232.5 296Z"
              fill={isSelected('abdomen') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('abdomen') ? '0.8' : '1'}
              stroke={isSelected('abdomen') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('abdomen')}
            />
            </g>

            {/* Left Upper Arm */}
            <g transform={getTransform('leftUpperArm')}>
            <path
              d="M109 243L102.356 226.994C100.908 223.506 95.8779 223.783 94.8214 227.409L85 265L80 295L85 310L94 312L109 308L114.823 289.075C114.94 288.694 115 288.297 115 287.899V256.41C115 255.811 114.865 255.22 114.606 254.679L109 243Z"
              fill={isSelected('leftUpperArm') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('leftUpperArm') ? '0.8' : '1'}
              stroke={isSelected('leftUpperArm') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('leftUpperArm')}
            />
            </g>

            {/* Left Elbow */}
            <g transform={getTransform('leftElbow')}>
            <ellipse
              cx="94"
              cy="311"
              rx="15"
              ry="12"
              fill={isSelected('leftElbow') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('leftElbow') ? '0.8' : '1'}
              stroke={isSelected('leftElbow') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('leftElbow')}
            />
            </g>

            {/* Left Forearm */}
            <g transform={getTransform('leftForearm')}>
            <path
              d="M109 308L94 312L85 310L80 320L76.0883 335C76.0295 335.2 75.9867 335.4 75.9603 335.6L67.1994 361.427C67.0713 362.437 67.3336 363.459 67.9327 364.282L69.9977 367.122C70.638 368.002 70.8918 369.106 70.7004 370.178L69.3399 377.797C68.902 380.249 70.7871 382.5 73.2776 382.5H84H86.8319C88.6881 382.5 90.3005 381.223 90.7256 379.416L94 365.5L109 308Z"
              fill={isSelected('leftForearm') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('leftForearm') ? '0.8' : '1'}
              stroke={isSelected('leftForearm') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('leftForearm')}
            />
            </g>

            {/* Left Hand */}
            <g transform={getTransform('leftHand')}>
            <path
              d="M91.9562 409.372L87.1599 386.19C86.7756 384.332 85.1396 383 83.2429 383H75C72.7909 383 71 384.791 71 387V419.075C71 419.683 71.139 420.284 71.4065 420.831L80.0693 438.551C81.0154 440.486 83.5852 440.915 85.1084 439.392C85.9594 438.541 86.2488 437.278 85.8534 436.141L78.877 416.084C78.6312 415.377 78.6002 414.613 78.788 413.889L79.3373 411.771C80.122 408.744 84.3664 408.599 85.3552 411.566C85.9594 413.378 88.029 414.235 89.738 413.381L90.0993 413.2C91.5147 412.493 92.2768 410.921 91.9562 409.372Z"
              fill={isSelected('leftHand') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('leftHand') ? '0.8' : '1'}
              stroke={isSelected('leftHand') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('leftHand')}
            />
            </g>

            {/* Right Upper Arm */}
            <g transform={getTransform('rightUpperArm')}>
            <path
              d="M239.5 243L246.144 226.994C247.592 223.506 252.622 223.783 253.679 227.409L263.5 265L268.5 295L263.5 310L254.5 312L239.5 308L233.677 289.075C233.56 288.694 233.5 288.297 233.5 287.899V256.41C233.5 255.811 233.635 255.22 233.894 254.679L239.5 243Z"
              fill={isSelected('rightUpperArm') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('rightUpperArm') ? '0.8' : '1'}
              stroke={isSelected('rightUpperArm') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('rightUpperArm')}
            />
            </g>

            {/* Right Elbow */}
            <g transform={getTransform('rightElbow')}>
            <ellipse
              cx="254.5"
              cy="311"
              rx="15"
              ry="12"
              fill={isSelected('rightElbow') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('rightElbow') ? '0.8' : '1'}
              stroke={isSelected('rightElbow') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('rightElbow')}
            />
            </g>

            {/* Right Forearm */}
            <g transform={getTransform('rightForearm')}>
            <path
              d="M239.5 308L254.5 312L263.5 310L268.5 320L272.419 335C272.473 335.2 272.513 335.4 272.54 335.6L282.398 362.767C282.465 363.252 282.444 363.744 282.334 364.221L279.641 375.891C279.547 376.295 279.518 376.71 279.552 377.123L279.639 378.168C279.833 380.5 277.993 382.5 275.653 382.5H264.5H261.668C259.812 382.5 258.2 381.223 257.774 379.416L254.5 365.5L239.5 308Z"
              fill={isSelected('rightForearm') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('rightForearm') ? '0.8' : '1'}
              stroke={isSelected('rightForearm') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('rightForearm')}
            />
            </g>

            {/* Right Hand */}
            <g transform={getTransform('rightHand')}>
            <path
              d="M257.544 409.372L262.34 386.19C262.724 384.332 264.36 383 266.257 383H274.5C276.709 383 278.5 384.791 278.5 387V419.075C278.5 419.683 278.361 420.284 278.094 420.831L269.431 438.551C268.485 440.486 265.915 440.915 264.392 439.392C263.541 438.541 263.251 437.278 263.647 436.141L270.623 416.084C270.869 415.377 270.9 414.613 270.712 413.889L270.163 411.771C269.378 408.744 265.134 408.599 264.145 411.566C263.541 413.378 261.471 414.235 259.762 413.381L259.401 413.2C257.985 412.493 257.223 410.921 257.544 409.372Z"
              fill={isSelected('rightHand') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('rightHand') ? '0.8' : '1'}
              stroke={isSelected('rightHand') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('rightHand')}
            />
            </g>

            {/* Right Leg */}
            {/* Right Thigh */}
            <g transform={getTransform('rightLeg')}>
            <path
              d="M200.062 589.996L186.062 477.996C185.764 475.609 187.625 473.5 190.031 473.5H229.295C231.583 473.5 233.404 475.415 233.29 477.7L227.69 589.7C227.584 591.829 225.826 593.5 223.695 593.5H204.031C202.014 593.5 200.312 591.998 200.062 589.996Z"
              fill={isSelected('rightLeg') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('rightLeg') ? '0.8' : '1'}
              stroke={isSelected('rightLeg') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('rightLeg')}
            />
            </g>

            {/* Right Knee */}
            <g transform={getTransform('rightKnee')}>
            <ellipse
              cx="213"
              cy="594"
              rx="18"
              ry="14"
              fill={isSelected('rightKnee') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('rightKnee') ? '0.8' : '1'}
              stroke={isSelected('rightKnee') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('rightKnee')}
            />
            </g>

            {/* Right Foot */}
            <g transform={getTransform('rightFoot')}>
            <path
              d="M242.592 633C242.963 630.398 233.004 611.049 226.912 601.501C226.116 600.254 224.673 599.604 223.203 599.771L206.348 601.687C204.69 601.875 203.324 603.073 202.919 604.691L200.092 616C199.613 619.514 200.787 628.231 208.982 635.993C209.682 636.656 210.621 637.001 211.585 636.998C224.497 636.958 242.111 636.368 242.592 633Z"
              fill={isSelected('rightFoot') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('rightFoot') ? '0.8' : '1'}
              stroke={isSelected('rightFoot') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('rightFoot')}
            />
            </g>

            {/* Left Leg */}
            {/* Left Thigh */}
            <g transform={getTransform('leftLeg')}>
            <path
              d="M149.438 590.496L163.438 478.496C163.736 476.109 161.875 474 159.469 474H120.205C117.917 474 116.096 475.915 116.21 478.2L121.81 590.2C121.916 592.329 123.674 594 125.805 594H145.469C147.486 594 149.188 592.498 149.438 590.496Z"
              fill={isSelected('leftLeg') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('leftLeg') ? '0.8' : '1'}
              stroke={isSelected('leftLeg') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('leftLeg')}
            />
            </g>

            {/* Left Knee */}
            <g transform={getTransform('leftKnee')}>
            <ellipse
              cx="136"
              cy="594"
              rx="18"
              ry="14"
              fill={isSelected('leftKnee') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('leftKnee') ? '0.8' : '1'}
              stroke={isSelected('leftKnee') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('leftKnee')}
            />
            </g>

            {/* Left Foot */}
            <g transform={getTransform('leftFoot')}>
            <path
              d="M107 634C106.628 631.398 116.588 612.049 122.68 602.501C123.476 601.254 124.919 600.604 126.389 600.771L143.244 602.687C144.901 602.875 146.268 604.073 146.673 605.691L149.5 617C149.979 620.514 148.805 629.231 140.61 636.993C139.91 637.656 138.971 638.001 138.006 637.998C125.095 637.958 107.481 637.368 107 634Z"
              fill={isSelected('leftFoot') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('leftFoot') ? '0.8' : '1'}
              stroke={isSelected('leftFoot') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
              className="cursor-pointer hover:fill-red-200 transition-all duration-200"
              onClick={() => toggleBodyPart('leftFoot')}
            />
            </g>
          </svg>
        </div>

        {/* Selected Parts Display */}
        {selectedParts.size > 0 && (
          <div className="mt-2 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2 justify-center">
            {Array.from(selectedParts).map(part => (
              <span 
                key={part}
                className="bg-red-100 text-red-700 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-medium border border-red-300"
              >
                {part.replace(/([A-Z])/g, ' $1').trim()}
              </span>
            ))}
          </div>
        )}

        {/* Input Field */}
        <div className="w-full max-w-sm sm:max-w-md mt-3 sm:mt-4">
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={isListening ? 'Listening... Speak now...' : bs(2)}
            className="w-full px-3 sm:px-4 py-2 sm:py-3 rounded-xl bg-white border-none outline-none text-sm sm:text-base text-gray-700 shadow-sm"
          />
        </div>

        {/* Action Buttons: Mic + Send */}
        <div className="w-full max-w-sm sm:max-w-md flex gap-2 mt-2 sm:mt-3">
          {/* Mic Button */}
          <button
            onClick={toggleMic}
            disabled={isProcessingSTT}
            className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center shadow-lg transition-colors ${
              isListening
                ? 'bg-red-500 text-white animate-pulse'
                : isProcessingSTT
                ? 'bg-gray-200 text-gray-400 cursor-wait'
                : 'bg-white text-[#2F66F3] border border-[#2F66F3]'
            }`}
            title={isListening ? 'Stop recording' : isProcessingSTT ? 'Processing…' : 'Speak your symptoms'}
          >
            <Mic size={20} />
          </button>

          {/* Send Button */}
          <button
            onClick={handleSend}
            className="flex-1 bg-[#2F66F3] text-white py-2.5 sm:py-3 rounded-xl flex items-center justify-center gap-2 font-medium shadow-lg text-sm sm:text-base"
          >
            <Send size={18} className="sm:w-5 sm:h-5" />
            {bs(3)}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BodyPartSelection;
