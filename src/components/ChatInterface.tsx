import { ChevronDown, Mic, Send, Maximize2, Volume2, X, AlertCircle, Phone, MapPin, History, MessageSquare, Plus, Menu, Navigation } from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';
import { streamChat, speechToTextTranslate, translateText, textToSpeech, getHistory, lookupSessions, getGPSCoords } from '../lib/api';
import type { GPSCoords } from '../lib/api';
import { FormattedMessage } from './FormattedMessage';
import Navbar from './Navbar';

// ───────────────────────────────────────────────────────────────────
// LocalStorage helpers for past chats
// ───────────────────────────────────────────────────────────────────
const CHAT_STORAGE_KEY = 'sahayak_chats';

interface ChatRecord {
  chatId:       string;
  chatNum:      number;
  firstMessage: string;
  timestamp:    string;
}

function loadChatRecords(): ChatRecord[] {
  try { return JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) ?? '[]'); }
  catch { return []; }
}

function saveChatRecord(record: ChatRecord): void {
  const existing = loadChatRecords().filter(r => r.chatId !== record.chatId);
  existing.unshift(record); // newest first
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(existing.slice(0, 20)));
}

function purgeExpiredRecords(validIds: string[]): void {
  const kept = loadChatRecords().filter(r => validIds.includes(r.chatId));
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(kept));
}

const SILENCE_THRESHOLD = 8;
const SILENCE_DURATION = 4500;

// ── Avatar selection based on age + gender ──────────────────────────────────────────
function getAvatarInfo(age?: number, gender?: string): { src: string; aspectMatch: boolean } {
  const g = (gender ?? 'Male').toLowerCase();
  const a = age ?? 25;
  const isFemale = g === 'female';
  if (a <= 17) {
    // girlchild is 240×580 (needs "meet"); boychild is 353×688 (same as canvas)
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

type BodyPart = 
  | 'chest'
  | 'abdomen'
  | 'pelvis'
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
  | 'leftCalf'
  | 'rightCalf'
  | 'leftFoot'
  | 'rightFoot'
  | 'head'
  | 'forehead'
  | 'leftEye'
  | 'rightEye'
  | 'leftEar'
  | 'rightEar'
  | 'nose'
  | 'torso';

interface Message {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
  type?: 'normal' | 'yes-no' | 'age-input' | 'gender-input' | 'weight-input' | 'advice' | 'temperature-input';
}

interface AdviceData {
  medicine: string;
  dosage: string;
  instruction: string;
}

interface Hospital {
  name: string;
  distance: string;
  time: string;
  phone: string;
  lat?: number;
  lon?: number;
}

interface EmergencyI18n {
  showingNear: string;
  callNationalEmergency: string;
  distanceLabel: string;
  phoneLabel: string;
  callHospital: string;
  callEmergency112: string;
  openMap: string;
  searchPlaceholder: string;
  searchBtn: string;
}

const DEFAULT_EMERGENCY_I18N: EmergencyI18n = {
  showingNear: 'Showing hospitals near',
  callNationalEmergency: '📞 Call 112 — National Emergency',
  distanceLabel: 'Distance:',
  phoneLabel: 'Phone:',
  callHospital: 'Call Hospital',
  callEmergency112: 'Call Emergency (112)',
  openMap: 'Open Google Map',
  searchPlaceholder: 'Enter city or 6-digit pincode (e.g. Delhi, 110001)',
  searchBtn: 'Search',
};

interface ChatInterfaceProps {
  selectedBodyParts?: BodyPart[];
  onBack?: () => void;
  /** Pre-filled symptom message typed on the BodyPartSelection screen */
  initialMessage?: string;
  /** Pre-collected from UserSetupModal */
  initialAge?: number;
  initialGender?: string;
  initialWeight?: number;
  /** BCP-47 language code chosen in UserSetupModal (e.g. 'hi-IN') */
  initialLang?: string;
}

export default function ChatInterface({
  selectedBodyParts = [],
  onBack,
  initialMessage,
  initialAge,
  initialGender,
  initialWeight,
  initialLang,
}: ChatInterfaceProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [showYesNo, setShowYesNo] = useState(false);
  const [showAdvice, _setShowAdvice] = useState(false);
  const [showTemperatureInput, setShowTemperatureInput] = useState(false);
  const [showEndChatModal, setShowEndChatModal] = useState(false);
  const [emergencyMsgId, setEmergencyMsgId] = useState<string | null>(null);
  const [emergencyI18n, setEmergencyI18n] = useState<EmergencyI18n>(DEFAULT_EMERGENCY_I18N);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [adviceData, _setAdviceData] = useState<AdviceData | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [detectedCity, setDetectedCity] = useState<string>('');
  const [locationInput, setLocationInput] = useState('');
  const [locationSearching, setLocationSearching] = useState(false);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const weight = initialWeight != null ? String(initialWeight) : '';
  const [temperature, setTemperature] = useState('');

  // ── Backend API state ───────────────────────────────────────
  const [chatId, setChatId] = useState<string | null>(null);
  const [activeBodyParts, setActiveBodyParts] = useState<BodyPart[]>(selectedBodyParts);
  const [isThinking, setIsThinking] = useState(false);


  const [collectedAge, setCollectedAge] = useState<number | null>(() => initialAge ?? null);
  const [collectedGender, setCollectedGender] = useState<string | null>(() => initialGender ?? null);

  // ── Past chats ───────────────────────────────────────────
  const [pastChats, setPastChats] = useState<ChatRecord[]>([]);
  const [showPastChats, setShowPastChats] = useState(false);
  const [loadingPastChat, setLoadingPastChat] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceAnimFrameRef = useRef<number>(0);
  /** Holds the currently playing Audio element so it can be stopped */
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  /** Set to true when the user requests TTS stop, breaks the chunk playback loop */
  const ttsAbortRef = useRef(false);

  // ── Sarvam AI state ──────────────────────────────────────────────────────────
  /** BCP-47 language code detected via STT or translate (e.g. "hi-IN", "ta-IN") */
  const [detectedLang, setDetectedLang] = useState<string>(
    () => localStorage.getItem('landing_display_lang') || 'en-IN'
  );
  /** The latest AI response text (used for TTS) */
  const [lastAiResponse, setLastAiResponse] = useState<string>('');
  const [isTTSPlaying, setIsTTSPlaying] = useState(false);
  const [isProcessingSTT, setIsProcessingSTT] = useState(false);
  /** Tracks which message bubble is currently being played via TTS */
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  /** Holds the English transcript when the input box is showing user-language text from voice */
  const inputEnglishRef = useRef<string>('');
  /** Tracks the first user message sent in a new session (for past-chat heading) */
  const firstUserMessageRef = useRef<string>('');
  /** BCP-47 language code detected from the user's first typed/spoken message (e.g. 'hi-IN') */
  const uiLangCodeRef = useRef<string>('');
  /** Guards against React StrictMode double-firing the init useEffect */
  const initDoneRef = useRef(false);
  /** Cached GPS coordinates (fetched on mount so emergency response is instant) */
  const userCoordsRef = useRef<GPSCoords | null>(null);
  /** Translated header label for the chat panel */
  const [ciHeaderLabel, setCiHeaderLabel] = useState('Tell us your problem');
  const ciHeaderCache = useRef<Record<string, string>>({ 'en-IN': 'Tell us your problem', 'en-US': 'Tell us your problem' });

  // Translate the panel header label when the detected language changes
  useEffect(() => {
    const code = detectedLang;
    if (code === 'en-IN' || code === 'en-US') { setCiHeaderLabel('Tell us your problem'); return; }
    if (ciHeaderCache.current[code]) { setCiHeaderLabel(ciHeaderCache.current[code]); return; }
    translateText('Tell us your problem', 'en-IN', code)
      .then((r) => {
        const t = r.translated_text?.trim() || 'Tell us your problem';
        ciHeaderCache.current[code] = t;
        setCiHeaderLabel(t);
      })
      .catch(() => setCiHeaderLabel('Tell us your problem'));
  }, [detectedLang]);

  // BCP-47 code → display name map (matches language modal list)
  const LANG_CODE_TO_NAME: Record<string, string> = {
    'hi-IN': 'Hindi', 'en-IN': 'English', 'bn-IN': 'Bengali',
    'te-IN': 'Telugu', 'mr-IN': 'Marathi', 'ta-IN': 'Tamil',
    'gu-IN': 'Gujarati', 'ur-IN': 'Urdu', 'kn-IN': 'Kannada',
    'ml-IN': 'Malayalam',
    'kha-IN': 'Khasi', 'grt-IN': 'Garo',
    'lbj-IN': 'Ladakhi', 'lbj-WY': 'Ladakhi',
  };

  const VOICE_SUPPORTED_LANGUAGES = ['en-IN', 'hi-IN', 'bn-IN', 'gu-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'od-IN', 'pa-IN', 'ta-IN', 'te-IN'];
  const isVoiceSupported = (langCode: string) => VOICE_SUPPORTED_LANGUAGES.includes(langCode);

  // Store detected BCP-47 code, update both the ref and the navbar label
  const applyDetectedLang = (code: string) => {
    uiLangCodeRef.current = code;
    const name = LANG_CODE_TO_NAME[code];
    if (name) setSelectedLanguage(name);
  };

  // Translate an English prompt into the user's detected language (no-op if English)
  const localizePrompt = async (text: string): Promise<string> => {
    const lc = uiLangCodeRef.current;
    if (!lc || lc.startsWith('en')) return text;
    try {
      const r = await translateText(text, 'en-IN', lc);
      return r.translated_text || text;
    } catch {
      return text;
    }
  };


  useEffect(() => {
    getGPSCoords({ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 })
      .then((coords) => { userCoordsRef.current = coords; })
      .catch(() => { /* permission denied or unsupported — handled lazily in handleEmergency */ });
  }, []);

  useEffect(() => {
    if (initDoneRef.current) return;
    initDoneRef.current = true;

    // Apply language chosen in UserSetupModal to navbar + TTS/translation
    if (initialLang) applyDetectedLang(initialLang);

    // Sync body-map selection into active body parts
    setActiveBodyParts(selectedBodyParts);

    const isHindi = (initialLang && initialLang.startsWith('hi')) || (uiLangCodeRef.current && uiLangCodeRef.current.startsWith('hi'));
    const rawGreeting = selectedBodyParts.length > 0
      ? (isHindi
          ? `मैं देख रहा हूँ कि आपने चुना है: ${selectedBodyParts.join(', ')}। कृपया वर्णन करें कि क्या समस्या हो रही है।`
          : `I see you selected: ${selectedBodyParts.join(', ')}. Please describe what is happening.`)
      : (isHindi
          ? 'नमस्ते! कृपया अपने लक्षण बताएं या बताएं कि कहां दर्द हो रहा है।'
          : 'Hello! Please describe your symptoms or tell me where it hurts.');

    const initialGreeting: Message = {
      id: '1',
      sender: 'ai',
      text: rawGreeting,
      timestamp: getCurrentTime(),
      type: 'normal',
    };

    // Render initial message immediately so screen is never blank
    if (initialMessage?.trim()) {
      const userBubble: Message = {
        id: '2',
        sender: 'user',
        text: initialMessage.trim(),
        timestamp: getCurrentTime(),
        type: 'normal',
      };
      setMessages([initialGreeting, userBubble]);
      setTimeout(() => {
        sendToAPI(initialMessage.trim(), initialAge ?? 25, initialGender ?? 'Other');
      }, 0);
    } else {
      setMessages([initialGreeting]);
    }

    // In background, translate greeting only if custom non-Hindi/non-English language selected
    const initAsync = async () => {
      const lc = uiLangCodeRef.current;
      if (lc && !lc.startsWith('en') && !lc.startsWith('hi')) {
        try {
          const greetingText = await localizePrompt(rawGreeting);
          if (greetingText && greetingText !== rawGreeting) {
            setMessages(prev => prev.map(m => m.id === '1' ? { ...m, text: greetingText } : m));
          }
        } catch { /* fallback to default */ }
      }
    };
    initAsync();
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Validate stored past chats against the API on mount ──────────────────
  useEffect(() => {
    const records = loadChatRecords();
    if (records.length === 0) return;
    lookupSessions(records.map(r => r.chatId)).then(results => {
      const validIds: string[] = [];
      const valid: ChatRecord[] = [];
      results.forEach(s => {
        if (!s.valid) return;
        const rec = records.find(r => r.chatId === s.chat_id);
        if (!rec) return;
        validIds.push(s.chat_id);
        valid.push({
          ...rec,
          firstMessage: s.first_message ?? rec.firstMessage,
        });
      });
      purgeExpiredRecords(validIds);
      setPastChats(valid);
    }).catch(() => {
      // offline / server down — show what we have in storage
      setPastChats(records);
    });
  }, []);

  const getCurrentTime = () => {
    const now = new Date();
    return `${now.toLocaleDateString('en-US', { weekday: 'short' })} ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  };

  const stopRecording = () => {
    cancelAnimationFrame(silenceAnimFrameRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    if (mediaRecorderRef.current?.state === 'recording') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    setIsSpeaking(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // ── Start browser native SpeechRecognition for immediate live feedback ──
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = detectedLang || 'en-IN';

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

      // ── Silence detection via Web Audio ────────────────────────────
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
          stopRecording();
          return;
        }
        silenceAnimFrameRef.current = requestAnimationFrame(checkSilence);
      };

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        cancelAnimationFrame(silenceAnimFrameRef.current);
        audioCtx.close().catch(() => {});
        audioContextRef.current = null;
        stream.getTracks().forEach(track => track.stop());

        if (audioChunksRef.current.length > 0) {
          setIsProcessingSTT(true);
          try {
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const file = new File([blob], 'recording.webm', { type: 'audio/webm' });
            const result = await speechToTextTranslate(file);
            const englishTranscript = result.transcript?.trim() ?? '';
            const langCode = result.language_code ?? '';
            if (langCode) {
              setDetectedLang(langCode);
              localStorage.setItem('landing_display_lang', langCode);
            }
            if (englishTranscript) {
              inputEnglishRef.current = englishTranscript;
              const isNonEnglish = langCode && langCode !== 'en-IN' && langCode !== 'en-US';
              if (isNonEnglish) {
                try {
                  const back = await translateText(englishTranscript, 'en-IN', langCode);
                  setInputText(back.translated_text || englishTranscript);
                } catch {
                  setInputText(englishTranscript);
                }
              } else {
                setInputText(englishTranscript);
              }
            }
          } catch (err) {
            console.warn('Sarvam STT notice (using live transcript):', err);
          } finally {
            setIsProcessingSTT(false);
          }
        }
      };

      mediaRecorder.start(250);
      setIsSpeaking(true);
      silenceAnimFrameRef.current = requestAnimationFrame(checkSilence);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please check permissions in your browser.');
    }
  };

  // ── Core API call: streams a patient message to the backend ────────────────
  const sendToAPI = async (text: string, apiAge: number, apiGender: string) => {
    if (isThinking) return;

    // Add user message to chat (only when called from setup completion, not duplicate add)
    setIsThinking(true);

    // Placeholder AI bubble filled token-by-token
    const aiMsgId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: aiMsgId,
      sender: 'ai' as const,
      text: 'Thinking...',
      timestamp: getCurrentTime(),
      type: 'normal' as const,
    }]);

    const bodyPartHint = !chatId && activeBodyParts.length > 0 ? activeBodyParts[0] : null;
    const weightKg = weight ? parseFloat(weight) : null;

    // Capture whether this is a new session (chatId still null)
    const isNewSession = !chatId;
    if (isNewSession) firstUserMessageRef.current = text;

    // Track accumulated response for translation + TTS
    let accumulatedResponse = '';

    await streamChat(
      { message: text, chatId, age: apiAge, gender: apiGender, weight: weightKg, bodyPart: bodyPartHint },
      {
        onToken: (token) => {
          accumulatedResponse += token;
          const snapshot = accumulatedResponse;
          setMessages(prev => prev.map(m =>
            m.id === aiMsgId
              ? { ...m, text: snapshot }
              : m
          ));
        },
        onMetadata: (meta) => {
          // ── save new session to localStorage ──
          if (isNewSession) {
            const existing = loadChatRecords();
            const maxNum = existing.length > 0 ? Math.max(...existing.map(r => r.chatNum)) : 0;
            const newRecord: ChatRecord = {
              chatId:       meta.chat_id,
              chatNum:      maxNum + 1,
              firstMessage: firstUserMessageRef.current.slice(0, 100),
              timestamp:    new Date().toISOString(),
            };
            saveChatRecord(newRecord);
            setPastChats(prev => [newRecord, ...prev.filter(r => r.chatId !== meta.chat_id)]);
          }
          setChatId(meta.chat_id);
          if (meta.body_parts && meta.body_parts.length > 0) {
            setActiveBodyParts(meta.body_parts as BodyPart[]);
          }
          if (meta.emergency_status === 'emergency') handleEmergency(aiMsgId);
        },
        onDone: async () => {
          setIsThinking(false);
          // LLM already replies in the user's language — store as-is for TTS
          setLastAiResponse(accumulatedResponse);
        },
        onError: (err) => {
          setMessages(prev => prev.map(m =>
            m.id === aiMsgId
              ? { ...m, text: `Sorry, something went wrong: ${err}` }
              : m
          ));
          setIsThinking(false);
        },
      }
    );
  };

  // ── Send message: age/gender/weight pre-collected from UserSetupModal ──────
  const handleUserMessage = (text: string) => {
    if (!text.trim() || isThinking) return;

    // Add user bubble immediately
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      sender: 'user' as const,
      text,
      timestamp: getCurrentTime(),
      type: 'normal' as const,
    }]);

    sendToAPI(text, collectedAge ?? 25, collectedGender ?? 'Other');
  };


  const fetchHospitalsForCoords = async (
    lat: number, lon: number, apiKey: string,
    fallbackNone?: string, fallbackErr?: string, fallbackErrDist?: string
  ) => {
    setLocationSearching(true);
    try {
      const url =
        `https://api.geoapify.com/v2/places` +
        `?categories=healthcare.hospital,healthcare.clinic_or_praxis` +
        `&filter=circle:${lon},${lat},5000` +
        `&bias=proximity:${lon},${lat}` +
        `&limit=3` +
        `&apiKey=${apiKey}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.features && data.features.length > 0) {
        const fetched: Hospital[] = data.features.map((f: any) => {
          const p = f.properties;
          const distM: number = p.distance ?? 0;
          const distStr = distM < 1000
            ? `${Math.round(distM)} m`
            : `${(distM / 1000).toFixed(1)} km`;
          const timeMin = Math.max(1, Math.round((distM / 1000 / 20) * 60));
          const phone: string =
            p.datasource?.raw?.phone ?? p.contact?.phone ?? p.phone ?? 'N/A';
          return {
            name: p.name ?? 'Hospital',
            distance: distStr,
            time: `~${timeMin}min`,
            phone,
            lat: p.lat,
            lon: p.lon,
          };
        });
        setHospitals(fetched);
      } else {
        // Widen to 20 km if nothing found nearby
        const url2 =
          `https://api.geoapify.com/v2/places` +
          `?categories=healthcare.hospital` +
          `&filter=circle:${lon},${lat},20000` +
          `&bias=proximity:${lon},${lat}` +
          `&limit=3` +
          `&apiKey=${apiKey}`;
        const res2 = await fetch(url2);
        const data2 = await res2.json();
        if (data2.features && data2.features.length > 0) {
          const fetched2: Hospital[] = data2.features.map((f: any) => {
            const p = f.properties;
            const distM: number = p.distance ?? 0;
            const distStr = distM < 1000
              ? `${Math.round(distM)} m`
              : `${(distM / 1000).toFixed(1)} km`;
            const timeMin = Math.max(1, Math.round((distM / 1000 / 20) * 60));
            const phone: string =
              p.datasource?.raw?.phone ?? p.contact?.phone ?? p.phone ?? 'N/A';
            return {
              name: p.name ?? 'Hospital',
              distance: distStr,
              time: `~${timeMin}min`,
              phone,
              lat: p.lat,
              lon: p.lon,
            };
          });
          setHospitals(fetched2);
        } else {
          setHospitals([{
            name: fallbackNone ?? 'No hospitals found in this area',
            distance: '',
            time: '',
            phone: '112',
            lat,
            lon,
          }]);
        }
      }
    } catch {
      setHospitals([{
        name: fallbackErr ?? 'Emergency Services',
        distance: fallbackErrDist ?? 'Call immediately',
        time: '',
        phone: '112',
      }]);
    } finally {
      setLocationSearching(false);
    }
  };

  const handleEmergency = (attachMsgId: string) => {
    const t = (s: string) => localizePrompt(s);
    Promise.all([
      t('Getting your locationâ€¦'),
      t('Hospitals Near Your Location'),
      t('Tap to view on map'),
      t('Could not detect location'),
      t('Enter your pincode below'),
      t('No hospitals found in this area'),
      t('Emergency Services'),
      t('Call immediately'),
      t('Showing hospitals near'),
      t('ðŸ“ž Call 112 â€” National Emergency'),
      t('Distance:'),
      t('Phone:'),
      t('Call Hospital'),
      t('Call Emergency (112)'),
      t('Open Google Map'),
      t('Enter city or 6-digit pincode (e.g. Delhi, 110001)'),
      t('Search'),
    ]).then(async ([
      gettingLocationText, hospitalsNearText, tapViewText,
      cantDetectText, enterPincodeText,
      noHospitalsText, emergSvcText, callImmText,
      showingNear, callNationalEmergency,
      distanceLabel, phoneLabel, callHospital, callEmergency112,
      openMap, searchPlaceholder, searchBtn,
    ]) => {
      setEmergencyI18n({
        showingNear, callNationalEmergency,
        distanceLabel, phoneLabel, callHospital, callEmergency112,
        openMap, searchPlaceholder, searchBtn,
      });

      setHospitals([{ name: gettingLocationText, distance: '', time: '', phone: '' }]);
      setDetectedCity('');
      setLocationInput('');
      setEmergencyMsgId(attachMsgId);

      const apiKey = (import.meta.env.VITE_GEOAPIFY_API_KEY as string) ?? '';

      const runWithCoords = async (lat: number, lon: number) => {
        try {
          const revUrl = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&apiKey=${apiKey}`;
          const revRes = await fetch(revUrl);
          const revData = await revRes.json();
          const props = revData.features?.[0]?.properties;
          const city = props?.city ?? props?.county ?? props?.state ?? '';
          setDetectedCity(city);
        } catch { /* ignore â€” still search hospitals */ }

        if (!apiKey || apiKey === 'YOUR_GEOAPIFY_API_KEY') {
          setHospitals([{ name: hospitalsNearText, distance: tapViewText, time: '', phone: '112', lat, lon }]);
          return;
        }
        await fetchHospitalsForCoords(lat, lon, apiKey, noHospitalsText, emergSvcText, callImmText);
      };

      let savedLoc: { lat: number; lon: number; city: string } | null = null;
      try {
        const raw = localStorage.getItem('swasthya_saved_location');
        if (raw) savedLoc = JSON.parse(raw);
      } catch {}

      if (savedLoc && savedLoc.lat && savedLoc.lon) {
        setDetectedCity(savedLoc.city);
        await runWithCoords(savedLoc.lat, savedLoc.lon);
      } else if (userCoordsRef.current) {
        await runWithCoords(userCoordsRef.current.latitude, userCoordsRef.current.longitude);
      } else {
        try {
          const coords = await getGPSCoords({ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
          userCoordsRef.current = coords;
          await runWithCoords(coords.latitude, coords.longitude);
        } catch (err) {
          console.warn('Geolocation error:', err);
          setShowLocationSearch(true);
          setHospitals([{ name: cantDetectText, distance: enterPincodeText, time: '', phone: '112' }]);
        }
      }
    });
  };

  // Re-detect fresh GPS coordinates directly from device
  const requestFreshGPS = async () => {
    setLocationSearching(true);
    try {
      localStorage.removeItem('swasthya_saved_location');
      const coords = await getGPSCoords({ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
      userCoordsRef.current = coords;
      const apiKey = (import.meta.env.VITE_GEOAPIFY_API_KEY as string) ?? '';
      try {
        const revUrl = `https://api.geoapify.com/v1/geocode/reverse?lat=${coords.latitude}&lon=${coords.longitude}&apiKey=${apiKey}`;
        const revRes = await fetch(revUrl);
        const revData = await revRes.json();
        const props = revData.features?.[0]?.properties;
        const city = props?.city ?? props?.county ?? props?.state ?? '';
        if (city) setDetectedCity(city);
      } catch {}
      await fetchHospitalsForCoords(coords.latitude, coords.longitude, apiKey);
      setShowLocationSearch(false);
    } catch (err) {
      console.warn('GPS error:', err);
      alert('Could not access live device GPS. Please check browser permissions or enter your city/pincode.');
      setShowLocationSearch(true);
    } finally {
      setLocationSearching(false);
    }
  };

  // Search by manually entered pincode / city
  const handleLocationSearch = async () => {
    const query = locationInput.trim();
    if (!query) return;
    const apiKey = (import.meta.env.VITE_GEOAPIFY_API_KEY as string) ?? '';
    const [searchingText, notFoundText, failedText, noHospText, emergSvcText, callImmText] = await Promise.all([
      localizePrompt(`Searching hospitals near "${query}"…`),
      localizePrompt(`"${query}" not found. Try a different pincode or city.`),
      localizePrompt('Search failed. Please try again.'),
      localizePrompt('No hospitals found in this area'),
      localizePrompt('Emergency Services'),
      localizePrompt('Call immediately'),
    ]);
    setHospitals([{ name: searchingText, distance: '', time: '', phone: '' }]);
    setLocationSearching(true);
    try {
      let geoUrl = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(query)}&lang=en&filter=countrycode:in&limit=1&apiKey=${apiKey}`;
      let geoRes = await fetch(geoUrl);
      let geoData = await geoRes.json();
      let feat = geoData.features?.[0];
      if (!feat) {
        geoUrl = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(query)}&lang=en&limit=1&apiKey=${apiKey}`;
        geoRes = await fetch(geoUrl);
        geoData = await geoRes.json();
        feat = geoData.features?.[0];
      }
      if (!feat) {
        setHospitals([{ name: notFoundText, distance: '', time: '', phone: '112' }]);
        return;
      }
      const [lon, lat] = feat.geometry.coordinates as [number, number];
      const city = feat.properties?.city ?? feat.properties?.county ?? feat.properties?.state ?? query;
      setDetectedCity(city);
      setLocationInput('');
      setShowLocationSearch(false);
      try {
        localStorage.setItem('swasthya_saved_location', JSON.stringify({ lat, lon, city }));
      } catch {}
      await fetchHospitalsForCoords(lat, lon, apiKey, noHospText, emergSvcText, callImmText);
    } catch {
      setHospitals([{ name: failedText, distance: '', time: '', phone: '112' }]);
    } finally {
      setLocationSearching(false);
    }
  };

  const handleYesNoResponse = async (response: 'yes' | 'no') => {
    setShowYesNo(false);
    const userResponse: Message = {
      id: crypto.randomUUID(),
      sender: 'user',
      text: response === 'yes' ? 'Yes' : 'No',
      timestamp: getCurrentTime(),
      type: 'normal'
    };
    setMessages(prev => [...prev, userResponse]);

  };



  /** Split text into chunks ≤ maxLen chars, breaking on sentence then word boundaries. */
  const splitTTSChunks = (text: string, maxLen = 400): string[] => {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    const sentences = text.split(/(?<=[.!?।])\ +/);
    let current = '';
    for (const sentence of sentences) {
      const joined = current ? `${current} ${sentence}` : sentence;
      if (joined.length <= maxLen) {
        current = joined;
      } else {
        if (current) chunks.push(current.trim());
        if (sentence.length > maxLen) {
          const words = sentence.split(' ');
          current = '';
          for (const word of words) {
            const next = current ? `${current} ${word}` : word;
            if (next.length <= maxLen) {
              current = next;
            } else {
              if (current) chunks.push(current.trim());
              current = word;
            }
          }
        } else {
          current = sentence;
        }
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks.filter((c) => c.length > 0);
  };

  /** Play text through Sarvam text-to-speech in the user's detected language.
   *  Long responses are split into ≤400-char chunks and played sequentially. */
  const handleTextToSpeech = async (text: string, msgId?: string) => {
    if (isTTSPlaying || !text.trim()) return;
    setIsTTSPlaying(true);
    ttsAbortRef.current = false;
    if (msgId) setPlayingMsgId(msgId);
    const lang = uiLangCodeRef.current || localStorage.getItem('landing_display_lang') || detectedLang || 'en-IN';
    const chunks = splitTTSChunks(text.trim());

    const playChunk = (chunk: string): Promise<void> =>
      new Promise<void>((resolve) => {
        textToSpeech(chunk, lang)
          .then((result) => {
            if (result.audios && result.audios.length > 0) {
              const audioBytes = Uint8Array.from(atob(result.audios[0]), (c) => c.charCodeAt(0));
              const audioBlob = new Blob([audioBytes], { type: 'audio/wav' });
              const audioUrl = URL.createObjectURL(audioBlob);
              const audio = new Audio(audioUrl);
              currentAudioRef.current = audio;
              const done = () => { URL.revokeObjectURL(audioUrl); resolve(); };
              audio.onended = done;
              audio.onerror = done;
              audio.addEventListener('pause', done, { once: true });
              audio.play().catch(done);
            } else if ('speechSynthesis' in window) {
              const utter = new SpeechSynthesisUtterance(chunk);
              utter.lang = lang;
              utter.onend = () => resolve();
              utter.onerror = () => resolve();
              window.speechSynthesis.speak(utter);
            } else {
              resolve();
            }
          })
          .catch(() => {
            if ('speechSynthesis' in window) {
              const utter = new SpeechSynthesisUtterance(chunk);
              utter.lang = lang;
              utter.onend = () => resolve();
              utter.onerror = () => resolve();
              window.speechSynthesis.speak(utter);
            } else {
              resolve();
            }
          });
      });

    try {
      for (const chunk of chunks) {
        if (ttsAbortRef.current) break;
        await playChunk(chunk);
      }
    } finally {
      currentAudioRef.current = null;
      setIsTTSPlaying(false);
      setPlayingMsgId(null);
    }
  };

  const handleListenToAdvice = () => {
    const adviceText = adviceData
      ? `${adviceData.medicine}. Dosage: ${adviceData.dosage}. ${adviceData.instruction}`
      : lastAiResponse;
    if (adviceText) handleTextToSpeech(adviceText);
  };

  const stopTTS = () => {
    ttsAbortRef.current = true;
    currentAudioRef.current?.pause();
    currentAudioRef.current = null;
    setIsTTSPlaying(false);
    setPlayingMsgId(null);
  };

  const handleTemperatureSubmit = () => {
    if (temperature.trim()) {
      setShowTemperatureInput(false);
      
      // Add user's temperature as a message
      const tempMessage: Message = {
        id: crypto.randomUUID(),
        sender: 'user',
        text: `${temperature}°F`,
        timestamp: getCurrentTime(),
        type: 'normal'
      };
      setMessages(prev => [...prev, tempMessage]);
      
      // Show end chat modal after temperature is entered
      setTimeout(() => {
        setShowEndChatModal(true);
      }, 500);
    }
  };

  const handleContinueChat = () => {
    setShowEndChatModal(false);
    // Continue with more questions or diagnosis
  };

  const handleEndChat = () => {
    setShowEndChatModal(false);
    // Session stays alive for 24 h — do NOT delete it here
    if (onBack) onBack();
  };

  const handleLanguageSelect = (language: string) => {
    setSelectedLanguage(language);
    setShowLanguageModal(false);
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;
    const displayText = inputText.trim();
    setInputText('');

    // Scroll to bottom immediately
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

    // If the input box is showing user-language text from voice, use the English backing text
    const englishFromVoice = inputEnglishRef.current;
    inputEnglishRef.current = '';

    // Voice input: show user-language bubble, send to backend
    if (englishFromVoice) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        sender: 'user' as const,
        text: displayText,
        timestamp: getCurrentTime(),
        type: 'normal' as const,
      }]);
      sendToAPI(displayText, collectedAge ?? 25, collectedGender ?? 'Other');
      return;
    }

    // Typed text: send exactly as-is — backend detects language and responds in kind
    handleUserMessage(displayText);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  // ── Load a past chat session by id ───────────────────────────────────
  const loadPastChat = async (record: ChatRecord) => {
    if (isThinking) return;
    setLoadingPastChat(record.chatId);
    try {
      const history = await getHistory(record.chatId);
      if (history.length === 0) {
        // Session expired — remove from storage and list
        purgeExpiredRecords(pastChats.filter(r => r.chatId !== record.chatId).map(r => r.chatId));
        setPastChats(prev => prev.filter(r => r.chatId !== record.chatId));
        return;
      }
      const msgs: Message[] = [];
      history.forEach((h, i) => {
        msgs.push({ id: `h-u-${i}`, sender: 'user', text: h.user_input, timestamp: h.timestamp, type: 'normal' });
        msgs.push({ id: `h-a-${i}`, sender: 'ai', text: h.assistant_response, timestamp: h.timestamp, type: 'normal' });
      });
      setMessages(msgs);
      setChatId(record.chatId);
      // Mark age+gender as already collected so the user can type directly
      // without being asked again — the existing chatId is all the API needs.
      setCollectedAge(prev => prev ?? 25);
      setCollectedGender(prev => prev ?? 'Unknown');
      // Reset emergency state so it doesn't bleed into other chats
      setEmergencyMsgId(null);
      setHospitals([]);
      setDetectedCity('');
      setLocationInput('');
      setShowPastChats(false);
    } catch (e) {
      console.error('Failed to load past chat:', e);
    } finally {
      setLoadingPastChat(null);
    }
  };

  const toggleSpeaking = () => {
    if (isSpeaking) {
      stopRecording();
    } else {
      startRecording();
    }
  };


  // Render avatar with body part highlights - using exact SVG from BodyPartSelection
  const renderAvatar = (size: 'small' | 'large' = 'large') => {
    // Use activeBodyParts (updated by API auto-detection) instead of the initial prop
    const isSelected = (part: BodyPart) => activeBodyParts.includes(part);
    const avatar = getAvatarInfo(initialAge, initialGender);
    
    return (
      <div className={`relative ${size === 'small' ? 'w-16 sm:w-20' : 'w-32 sm:w-36 lg:w-40'} flex-shrink-0`}>
        <svg
          viewBox={size === 'small' ? "0 0 353 200" : "0 0 353 688"}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          xmlnsXlink="http://www.w3.org/1999/xlink"
          className="w-full h-auto"
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

          {/* Head */}
          <g transform="translate(8, 20) scale(0.94, 0.92)">
            <path
              d="M206.5 159.5C205.7 167.1 197.167 172 193 173.5C191.833 173.833 188.6 175 185 177C180.5 179.5 166.5 177.5 159.5 176C152.5 174.5 144.5 165.5 143.5 163.5C142.5 161.5 140.5 152 140 150C139.5 148 138 128.5 138.5 124C139 119.5 143 109.5 144.5 99.4999C146 89.4999 150 91.4998 152.5 89.4998C155 87.4998 184.5 86.4998 196 89.4998C207.5 92.4998 205.5 104 206.5 106.5C207.5 109 206.5 113.5 209 120C211.5 126.5 207.5 150 206.5 159.5Z"
              fill={isSelected('head') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('head') ? '0.8' : '1'}
              stroke={isSelected('head') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Forehead */}
          <g transform="translate(8, 57) scale(0.95, 0.50)">
            <path
              d="M152.5 89.4998C155 87.4998 184.5 86.4998 196 89.4998C207.5 92.4998 205.5 104 206.5 106.5C207.5 109 206.5 113.5 209 120C210 122.5 209 125 208 127C207 129 205 130 203 131C201 132 198 132.5 195 132.5H150C148 132.5 146 132 144 131C142 130 140.5 128.5 139.5 126.5C138.5 124.5 138 122 138.5 120C139 117 141 112 143 109.5C144.5 104 146 95 148 92C150 89.4999 152.5 89.4998 152.5 89.4998Z"
              fill={isSelected('forehead') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('forehead') ? '0.8' : '1'}
              stroke={isSelected('forehead') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Left Eye */}
          <g transform="translate(160, 132) scale(0.94, 0.92)">
            <path
              d="M0 0C4.261 0.328 5.875 2.116 6.35 4.041C6.648 5.248 5.902 6.427 4.813 7.025C-1.854 10.685 -7.282 9.053 -9.673 6.921C-10.277 6.382 -10.545 5.542 -10.236 4.795C-9.245 2.402 -5.526 -0.425 0 0Z"
              fill={isSelected('leftEye') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('leftEye') ? '0.8' : '1'}
              stroke={isSelected('leftEye') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Right Eye */}
          <g transform="translate(186, 132) scale(0.94, 0.92)">
            <path
              d="M0 0C-4.262 0.328 -5.876 2.116 -6.351 4.041C-6.649 5.248 -5.903 6.427 -4.813 7.025C1.853 10.685 7.281 9.053 9.672 6.921C10.276 6.382 10.545 5.542 10.235 4.795C9.244 2.402 5.525 -0.425 0 0Z"
              fill={isSelected('rightEye') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('rightEye') ? '0.8' : '1'}
              stroke={isSelected('rightEye') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Nose */}
          <g transform="translate(183, 148) scale(0.94, 0.92)">
            <path
              d="M0 0L-4.113 -17.951C-4.53 -19.768 -6.148 -21.057 -8.012 -21.057H-10.638C-12.503 -21.057 -14.121 -19.768 -14.537 -17.951L-18.651 0C-19.05 1.742 -18.245 3.537 -16.68 4.398L-11.253 7.383C-10.053 8.043 -8.598 8.043 -7.398 7.383L-1.971 4.398C-0.405 3.537 0.399 1.742 0 0Z"
              fill={isSelected('nose') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('nose') ? '0.8' : '1'}
              stroke={isSelected('nose') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Left Ear */}
          <g transform="translate(137, 136) scale(0.50, 0.78) scale(-1, 1)">
            <path
              d="M0 0C-2 0 -5 2 -7 5C-9 8 -10 12 -10 16C-10 20 -9 24 -7 27C-5 30 -2 32 0 32C2 32 4 31 6 29C7 27 8 24 8 21L8 11C8 8 7 5 6 3C4 1 2 0 0 0Z"
              fill={isSelected('leftEar') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('leftEar') ? '0.8' : '1'}
              stroke={isSelected('leftEar') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Right Ear */}
          <g transform="translate(210, 136) scale(0.50, 0.78) scale(-1, 1)">
            <path
              d="M0 0C2 0 5 2 7 5C9 8 10 12 10 16C10 20 9 24 7 27C5 30 2 32 0 32C-2 32 -4 31 -6 29C-7 27 -8 24 -8 21L-8 11C-8 8 -7 5 -6 3C-4 1 -2 0 0 0Z"
              fill={isSelected('rightEar') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('rightEar') ? '0.8' : '1'}
              stroke={isSelected('rightEar') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Torso */}
          <g transform="translate(8, 11) scale(0.95, 0.97)">
            <path
              d="M195 180.597V180.152C195 177.541 192.539 175.63 190.009 176.277L174.542 180.233C173.859 180.408 173.143 180.399 172.465 180.208L156.966 175.837C155.218 175.344 153.357 176.09 152.435 177.654L143.663 192.527C142.943 193.749 142.923 195.262 143.612 196.502L151.357 210.443C152.062 211.712 153.401 212.5 154.854 212.5H192.646C194.099 212.5 195.438 211.712 196.143 210.443L203.697 196.846C204.485 195.427 204.338 193.672 203.324 192.404L195.877 183.096C195.309 182.386 195 181.505 195 180.597Z"
              fill={isSelected('torso') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('torso') ? '0.8' : '1'}
              stroke={isSelected('torso') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Left Shoulder */}
          <g transform="translate(139, 203) scale(0.85, 0.85) rotate(47)">
            <path
              d="M0 0C-2 2 -10 15 -12 20C-14 25 -16 30 -17 32C-18 34 -11 37 -5 37C1 37 8 35 10 33C12 31 14 26 15 20C16 14 14 8 12 4C10 0 5 -2 0 0Z"
              fill={isSelected('leftShoulder') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('leftShoulder') ? '0.8' : '1'}
              stroke={isSelected('leftShoulder') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Right Shoulder */}
          <g transform="translate(209, 203) scale(-0.80, 0.86) rotate(47)">
            <path
              d="M0 0C-2 2 -10 15 -12 20C-14 25 -16 30 -17 32C-18 34 -11 37 -5 37C1 37 8 35 10 33C12 31 14 26 15 20C16 14 14 8 12 4C10 0 5 -2 0 0Z"
              fill={isSelected('rightShoulder') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('rightShoulder') ? '0.8' : '1'}
              stroke={isSelected('rightShoulder') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Chest */}
          <g transform="translate(17, 04) scale(0.90, 0.99)">
            <path
              d="M241.457 228.864C236.269 222.797 141.811 226.296 109.361 228.832C109.079 228.854 108.808 228.886 108.565 229.033C105.158 231.088 118.326 243.587 117.121 260.244C116.952 276.437 116.866 292.103 117.121 294.038C117.622 297.845 225.817 292.014 230.325 291.538C232.576 291.3 231.822 278.467 230.325 263.677C228.824 248.844 244.718 232.677 241.457 228.864Z"
              fill={isSelected('chest') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('chest') ? '0.8' : '1'}
              stroke={isSelected('chest') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Abdomen */}
          <g transform="translate(7, 11) scale(0.96, 0.98)">
            <path
              d="M232.5 296C232.5 287.953 197.109 298.813 122.427 297.048C121.222 297.02 120.036 297.517 119.557 298.622C114.393 310.531 113.5 365.3 113.5 369C113.5 379 238.5 376.545 238.5 372C238.5 359.5 232.5 306.5 232.5 296Z"
              fill={isSelected('abdomen') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('abdomen') ? '0.8' : '1'}
              stroke={isSelected('abdomen') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Pelvis */}
          <g transform="translate(7, 10) scale(0.96, 0.98)">
            <path
              d="M237 375C211.884 377.955 168.336 384.305 116.867 373.03C115.415 372.712 113.903 373.23 113.398 374.628C108.5 388.196 108.5 448.379 108.5 452.039V452.039C108.5 462.039 242 462.199 242 452.039C242 440.5 247.428 373.773 237 375Z"
              fill={isSelected('pelvis') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('pelvis') ? '0.8' : '1'}
              stroke={isSelected('pelvis') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Left Upper Arm */}
          <g transform="translate(25, 14) scale(0.85, 0.90)">
            <path
              d="M109 243L102.356 226.994C100.908 223.506 95.8779 223.783 94.8214 227.409L85 265L80 295L85 310L94 312L109 308L114.823 289.075C114.94 288.694 115 288.297 115 287.899V256.41C115 255.811 114.865 255.22 114.606 254.679L109 243Z"
              fill={isSelected('leftUpperArm') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('leftUpperArm') ? '0.8' : '1'}
              stroke={isSelected('leftUpperArm') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Left Elbow */}
          <g transform="translate(25, 14) scale(0.85, 0.90)">
            <ellipse
              cx="94"
              cy="311"
              rx="15"
              ry="12"
              fill={isSelected('leftElbow') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('leftElbow') ? '0.8' : '1'}
              stroke={isSelected('leftElbow') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Left Forearm */}
          <g transform="translate(18, 14) scale(0.92, 0.90)">
            <path
              d="M109 308L94 312L85 310L80 320L76.0883 335C76.0295 335.2 75.9867 335.4 75.9603 335.6L67.1994 361.427C67.0713 362.437 67.3336 363.459 67.9327 364.282L69.9977 367.122C70.638 368.002 70.8918 369.106 70.7004 370.178L69.3399 377.797C68.902 380.249 70.7871 382.5 73.2776 382.5H84H86.8319C88.6881 382.5 90.3005 381.223 90.7256 379.416L94 365.5L109 308Z"
              fill={isSelected('leftForearm') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('leftForearm') ? '0.8' : '1'}
              stroke={isSelected('leftForearm') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Left Hand */}
          <g transform="translate(21, 17) scale(0.88, 0.90)">
            <path
              d="M91.9562 409.372L87.1599 386.19C86.7756 384.332 85.1396 383 83.2429 383H75C72.7909 383 71 384.791 71 387V419.075C71 419.683 71.139 420.284 71.4065 420.831L80.0693 438.551C81.0154 440.486 83.5852 440.915 85.1084 439.392C85.9594 438.541 86.2488 437.278 85.8534 436.141L78.877 416.084C78.6312 415.377 78.6002 414.613 78.788 413.889L79.3373 411.771C80.122 408.744 84.3664 408.599 85.3552 411.566C85.9594 413.378 88.029 414.235 89.738 413.381L90.0993 413.2C91.5147 412.493 92.2768 410.921 91.9562 409.372Z"
              fill={isSelected('leftHand') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('leftHand') ? '0.8' : '1'}
              stroke={isSelected('leftHand') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Right Upper Arm */}
          <g transform="translate(25, 14) scale(0.86, 0.90)">
            <path
              d="M239.5 243L246.144 226.994C247.592 223.506 252.622 223.783 253.679 227.409L263.5 265L268.5 295L263.5 310L254.5 312L239.5 308L233.677 289.075C233.56 288.694 233.5 288.297 233.5 287.899V256.41C233.5 255.811 233.635 255.22 233.894 254.679L239.5 243Z"
              fill={isSelected('rightUpperArm') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('rightUpperArm') ? '0.8' : '1'}
              stroke={isSelected('rightUpperArm') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Right Elbow */}
          <g transform="translate(25, 14) scale(0.86, 0.90)">
            <ellipse
              cx="254.5"
              cy="311"
              rx="15"
              ry="12"
              fill={isSelected('rightElbow') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('rightElbow') ? '0.8' : '1'}
              stroke={isSelected('rightElbow') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Right Forearm */}
          <g transform="translate(14, 14) scale(0.92, 0.90)">
            <path
              d="M239.5 308L254.5 312L263.5 310L268.5 320L272.419 335C272.473 335.2 272.513 335.4 272.54 335.6L282.398 362.767C282.465 363.252 282.444 363.744 282.334 364.221L279.641 375.891C279.547 376.295 279.518 376.71 279.552 377.123L279.639 378.168C279.833 380.5 277.993 382.5 275.653 382.5H264.5H261.668C259.812 382.5 258.2 381.223 257.774 379.416L254.5 365.5L239.5 308Z"
              fill={isSelected('rightForearm') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('rightForearm') ? '0.8' : '1'}
              stroke={isSelected('rightForearm') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Right Hand */}
          <g transform="translate(24, 17) scale(0.88, 0.90)">
            <path
              d="M257.544 409.372L262.34 386.19C262.724 384.332 264.36 383 266.257 383H274.5C276.709 383 278.5 384.791 278.5 387V419.075C278.5 419.683 278.361 420.284 278.094 420.831L269.431 438.551C268.485 440.486 265.915 440.915 264.392 439.392C263.541 438.541 263.251 437.278 263.647 436.141L270.623 416.084C270.869 415.377 270.9 414.613 270.712 413.889L270.163 411.771C269.378 408.744 265.134 408.599 264.145 411.566C263.541 413.378 261.471 414.235 259.762 413.381L259.401 413.2C257.985 412.493 257.223 410.921 257.544 409.372Z"
              fill={isSelected('rightHand') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('rightHand') ? '0.8' : '1'}
              stroke={isSelected('rightHand') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Right Thigh */}
          <g transform="translate(25, 55) scale(0.88, 0.85)">
            <path
              d="M200.062 589.996L186.062 477.996C185.764 475.609 187.625 473.5 190.031 473.5H229.295C231.583 473.5 233.404 475.415 233.29 477.7L227.69 589.7C227.584 591.829 225.826 593.5 223.695 593.5H204.031C202.014 593.5 200.312 591.998 200.062 589.996Z"
              fill={isSelected('rightLeg') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('rightLeg') ? '0.8' : '1'}
              stroke={isSelected('rightLeg') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Right Knee */}
          <g transform="translate(25, -12) scale(0.88, 0.85)">
            <ellipse
              cx="213"
              cy="594"
              rx="18"
              ry="14"
              fill={isSelected('rightKnee') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('rightKnee') ? '0.8' : '1'}
              stroke={isSelected('rightKnee') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Right Calf */}
          <g transform="translate(-69, -12) scale(0.88, 0.92) skewY(-7) rotate(-8)">
            <path
              d="M223 595C221 596 218 597 216 598L210 625C209 630 208 640 207.5 650C207 660 206.5 670 206 680L223 682L227 682C227.5 672 228 662 228.5 652C229 642 229.5 632 230 622L224 595C223.5 595 223 595 223 595Z"
              fill={isSelected('rightCalf') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('rightCalf') ? '0.8' : '1'}
              stroke={isSelected('rightCalf') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Right Foot */}
          <g transform="translate(18, 10) scale(0.88, 0.92)">
            <path
              d="M242.592 633C242.963 630.398 233.004 611.049 226.912 601.501C226.116 600.254 224.673 599.604 223.203 599.771L206.348 601.687C204.69 601.875 203.324 603.073 202.919 604.691L200.092 616C199.613 619.514 200.787 628.231 208.982 635.993C209.682 636.656 210.621 637.001 211.585 636.998C224.497 636.958 242.111 636.368 242.592 633Z"
              fill={isSelected('rightFoot') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('rightFoot') ? '0.8' : '1'}
              stroke={isSelected('rightFoot') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Left Thigh */}
          <g transform="translate(21, 55) scale(0.88, 0.85)">
            <path
              d="M149.438 590.496L163.438 478.496C163.736 476.109 161.875 474 159.469 474H120.205C117.917 474 116.096 475.915 116.21 478.2L121.81 590.2C121.916 592.329 123.674 594 125.805 594H145.469C147.486 594 149.188 592.498 149.438 590.496Z"
              fill={isSelected('leftLeg') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('leftLeg') ? '0.8' : '1'}
              stroke={isSelected('leftLeg') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Left Knee */}
          <g transform="translate(21, -12) scale(0.88, 0.85)">
            <ellipse
              cx="136"
              cy="594"
              rx="18"
              ry="14"
              fill={isSelected('leftKnee') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('leftKnee') ? '0.8' : '1'}
              stroke={isSelected('leftKnee') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Left Calf */}
          <g transform="translate(113, -82) scale(0.88, 0.92) skewY(-5) rotate(8)">
            <path
              d="M126 595C128 596 131 597 133 598L139 625C140 630 141 640 141.5 650C142 660 142.5 670 143 680L126 682L122 682C121.5 672 121 662 120.5 652C120 642 119.5 632 119 622L125 595C125.5 595 126 595 126 595Z"
              fill={isSelected('leftCalf') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('leftCalf') ? '0.8' : '1'}
              stroke={isSelected('leftCalf') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>

          {/* Left Foot */}
          <g transform="translate(18, 10) scale(0.88, 0.92)">
            <path
              d="M107 634C106.628 631.398 116.588 612.049 122.68 602.501C123.476 601.254 124.919 600.604 126.389 600.771L143.244 602.687C144.901 602.875 146.268 604.073 146.673 605.691L149.5 617C149.979 620.514 148.805 629.231 140.61 636.993C139.91 637.656 138.971 638.001 138.006 637.998C125.095 637.958 107.481 637.368 107 634Z"
              fill={isSelected('leftFoot') ? '#DC2626' : 'transparent'}
              fillOpacity={isSelected('leftFoot') ? '0.8' : '1'}
              stroke={isSelected('leftFoot') ? '#DC2626' : 'transparent'}
              strokeWidth="2"
            />
          </g>
        </svg>
      </div>
    );
  };

  // Full-width layout with avatar at top
  if (isFullscreen) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#E9DDFB] via-[#D6C4F7] to-[#C4ACEF]">
        {/* Header */}
        <Navbar
          variant="shadow"
          onBack={onBack}
          selectedLanguage={selectedLanguage}
          onLanguageClick={() => setShowLanguageModal(true)}
        />

        {/* Main Content - Full Width */}
        <div className="flex-1 flex flex-col px-3 sm:px-4 py-3 sm:py-4">
          {/* Full-screen sidebar overlay */}
          {showSidebar && (
            <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-[#E9DDFB] via-[#D6C4F7] to-[#C4ACEF]">
              {/* Sidebar header */}
              <div className="flex items-center justify-between px-4 py-4 border-b border-purple-300/50">
                <div className="flex items-center gap-2">
                  <History size={18} className="text-purple-700" />
                  <span className="text-base font-bold text-purple-900">Chat History</span>
                </div>
                <button
                  onClick={() => setShowSidebar(false)}
                  className="w-8 h-8 rounded-full bg-white/70 flex items-center justify-center text-gray-700 hover:bg-white shadow"
                  title="Close"
                >
                  <X size={16} />
                </button>
              </div>
              {/* Sidebar body */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {/* Body part display */}
                {activeBodyParts.length > 0 && (
                  <div className="bg-white/70 rounded-2xl p-3 mb-3 flex flex-col items-center gap-2">
                    <span className="text-xs font-semibold text-purple-700 self-start">Selected Area</span>
                    <div className="w-28">
                      {renderAvatar('large')}
                    </div>
                  </div>
                )}

                {/* New Chat button */}
                <button
                  onClick={() => { setShowSidebar(false); onBack?.(); }}
                  disabled={isThinking}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow transition-colors mb-3"
                >
                  <Plus size={15} />
                  New Chat
                </button>
                {/* Past chat rows */}
                {pastChats.length === 0 && (
                  <p className="text-center text-sm text-gray-500 py-8">No past chats yet.</p>
                )}
                {pastChats.map(rec => (
                  <button
                    key={rec.chatId}
                    onClick={() => { loadPastChat(rec); setShowSidebar(false); }}
                    disabled={loadingPastChat === rec.chatId}
                    className={`w-full text-left px-4 py-3 rounded-xl transition-colors shadow-sm ${
                      chatId === rec.chatId
                        ? 'bg-purple-100 border border-purple-300 text-purple-900'
                        : 'bg-white/80 hover:bg-white border border-transparent hover:border-purple-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare size={13} className="text-purple-500 flex-shrink-0" />
                      <span className="font-bold text-purple-600 text-xs">Chat #{rec.chatNum}</span>
                      {loadingPastChat === rec.chatId && (
                        <span className="text-[10px] text-gray-400 ml-auto animate-pulse">Loading…</span>
                      )}
                    </div>
                    <div className="text-gray-700 line-clamp-2 leading-tight text-sm">
                      {rec.firstMessage}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sticky hamburger button — fixed to top-left, always visible while scrolling */}
          <button
            onClick={() => setShowSidebar(true)}
            className="fixed top-16 left-4 z-40 w-10 h-10 rounded-full bg-white/90 border border-purple-300 flex items-center justify-center text-purple-700 hover:bg-white shadow-lg backdrop-blur-sm"
            title="Open menu"
          >
            <Menu size={18} />
          </button>

          {/* Avatar at Top */}
          <div className="flex items-start gap-2 sm:gap-3 mb-3 sm:mb-4 pl-14">
            {renderAvatar('small')}
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-800">{ciHeaderLabel}</h2>
            </div>
          </div>

          {/* Thermometer Visualization (when temperature input is active) */}
          {showTemperatureInput && (
            <div className="flex justify-center items-center gap-3 mb-4">
              {/* Temperature Display */}
              <div className="text-4xl sm:text-5xl font-bold text-gray-800">
                {temperature || '99'}
              </div>
              
              {/* Thermometer Body */}
              <div className="relative flex items-center gap-2">
                {/* Fahrenheit Scale */}
                <div className="flex flex-col justify-between h-[340px] sm:h-[380px] text-[10px] sm:text-xs text-gray-600 pr-1">
                  <div className="flex items-center gap-1">
                    <span className="font-medium">°F</span>
                  </div>
                  <span>120</span>
                  <span>100</span>
                  <span>80</span>
                  <span>60</span>
                  <span>40</span>
                  <span>20</span>
                  <span>0</span>
                </div>

                {/* Thermometer Tube */}
                <div className="relative w-[60px] sm:w-[70px] h-[340px] sm:h-[380px] bg-white rounded-full shadow-lg flex flex-col items-center">
                  {/* Scale Marks */}
                  <div className="absolute inset-0 flex flex-col justify-between py-3 px-2">
                    {[...Array(7)].map((_, i) => (
                      <div key={i} className="w-2 h-[1px] bg-gray-300" />
                    ))}
                  </div>
                  
                  {/* Mercury Tube Container */}
                  <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-1 sm:w-1.5 h-[calc(100%-48px)] bg-gray-200 rounded-full overflow-hidden">
                    {/* Mercury Fill */}
                    <div 
                      className="absolute bottom-0 w-full bg-gradient-to-t from-red-600 to-red-400 rounded-full transition-all duration-300"
                      style={{
                        height: `${Math.min(100, Math.max(5, ((parseFloat(temperature || '99') - 0) / 120) * 100))}%`
                      }}
                    />
                  </div>
                  
                  {/* Thermometer Bulb */}
                  <div className="absolute bottom-0 w-10 sm:w-12 h-10 sm:h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-full shadow-md" />
                </div>

                {/* Celsius Scale */}
                <div className="flex flex-col justify-between h-[340px] sm:h-[380px] text-[10px] sm:text-xs text-gray-600 pl-1">
                  <div className="flex items-center gap-1">
                    <span className="font-medium">°C</span>
                  </div>
                  <span>50</span>
                  <span>40</span>
                  <span>30</span>
                  <span>20</span>
                  <span>10</span>
                  <span>0</span>
                  <span>-10</span>
                </div>
              </div>
            </div>
          )}

          {/* Messages Area */}
          <div className="flex-1 bg-white rounded-2xl shadow-md p-3 sm:p-4 mb-3 sm:mb-4 overflow-y-auto pb-24">
            {messages.map((message) => (
              <React.Fragment key={message.id}>
              <div className={`flex flex-col ${message.sender === 'user' ? 'items-end' : 'items-start'} gap-2 mb-4`}>
                <div className="flex items-center gap-2">
                  {message.sender === 'ai' && (
                    <>
                      <span className="text-sm font-medium text-gray-700">AI Voice</span>
                      <span className="text-xs text-gray-400">{message.timestamp}</span>
                    </>
                  )}
                  {message.sender === 'user' && (
                    <>
                      <span className="text-xs text-gray-400">{message.timestamp}</span>
                      <span className="text-sm font-medium text-green-600">You</span>
                    </>
                  )}
                </div>
                <div className={`relative ${
                  message.sender === 'user'
                    ? 'bg-white border border-gray-200 rounded-2xl rounded-tr-none'
                    : 'bg-[#D2E3FC] rounded-2xl rounded-tl-none'
                } px-4 py-3 max-w-[85%]`}>
                  {message.sender === 'ai'
                    ? <FormattedMessage
                        text={message.text}
                        msgId={message.id}
                        onSpeak={isVoiceSupported(detectedLang) ? handleTextToSpeech : undefined}
                        stopTTS={stopTTS}
                        playingId={playingMsgId}
                        isTTSPlaying={isTTSPlaying}
                        isEmergency={emergencyMsgId === message.id}
                      />
                    : <p className="text-sm text-gray-800">{message.text}</p>
                  }
                </div>
              </div>
              {emergencyMsgId === message.id && (
                <div className="mb-4 space-y-3">
                  {/* Location Bar with Change City and Live GPS controls */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-3 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs sm:text-sm text-blue-900 font-semibold">
                        <MapPin size={16} className="text-blue-600 flex-shrink-0" />
                        <span>
                          {detectedCity
                            ? <>{emergencyI18n.showingNear} <span className="text-blue-700 underline font-bold">{detectedCity}</span></>
                            : 'Detecting location / स्थान का पता लगाया जा रहा है...'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowLocationSearch(prev => !prev)}
                          className="text-xs bg-white hover:bg-blue-100 text-blue-700 border border-blue-300 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 shadow-sm"
                        >
                          ✏️ {detectedLang?.startsWith('hi') ? 'शहर/पिनकोड बदलें' : 'Change City/Pincode'}
                        </button>
                        <button
                          type="button"
                          onClick={requestFreshGPS}
                          disabled={locationSearching}
                          className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 shadow-sm disabled:opacity-50"
                          title="Get current GPS location"
                        >
                          <Navigation size={12} /> {detectedLang?.startsWith('hi') ? 'लाइव GPS' : 'Live GPS'}
                        </button>
                      </div>
                    </div>

                    {/* Location search input */}
                    {(showLocationSearch || !detectedCity) && (
                      <div className="mt-3 pt-3 border-t border-blue-200/80">
                        <p className="text-xs text-blue-800 mb-1.5 font-medium">
                          {detectedLang?.startsWith('hi')
                            ? 'यदि आपका शहर गलत है, तो अपना सही शहर या 6-अंक का पिनकोड लिखें:'
                            : 'If your location is incorrect, enter your city or 6-digit pincode:'}
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={locationInput}
                            onChange={(e) => setLocationInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleLocationSearch()}
                            placeholder={emergencyI18n.searchPlaceholder}
                            className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                          />
                          <button
                            type="button"
                            onClick={handleLocationSearch}
                            disabled={!locationInput.trim() || locationSearching}
                            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                          >
                            {emergencyI18n.searchBtn}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Call 112 Emergency Button */}
                  <a
                    href="tel:112"
                    className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold px-4 py-3.5 rounded-xl shadow-lg transition-colors"
                  >
                    <Phone size={20} />
                    {emergencyI18n.callNationalEmergency}
                  </a>
                  <div className="space-y-3">
                    {hospitals.map((hospital, index) => (
                      <div key={index} className="bg-white rounded-xl p-4 shadow-md border border-gray-200">
                        {hospital.phone === '' ? (
                          <div className="flex items-center gap-3 py-2">
                            <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                            <p className="text-sm text-gray-600 font-medium">{hospital.name}</p>
                          </div>
                        ) : (
                          <>
                            <h4 className="font-semibold text-blue-700 text-sm sm:text-base mb-1">{hospital.name}</h4>
                            {hospital.distance && (
                              <p className="text-xs sm:text-sm text-gray-600 mb-0.5">
                                {emergencyI18n.distanceLabel} {hospital.distance}{hospital.time ? ` (${hospital.time})` : ''}
                              </p>
                            )}
                            {hospital.phone && (
                              <p className="text-xs sm:text-sm text-gray-600 mb-3">{emergencyI18n.phoneLabel} {hospital.phone}</p>
                            )}
                            <div className="flex flex-col gap-2">
                              {hospital.phone && hospital.phone !== '' && (
                                <button
                                  onClick={() => window.location.href = `tel:${hospital.phone}`}
                                  className="w-full px-4 py-2.5 rounded-lg bg-[#7C3AED] text-white font-medium hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                                >
                                  <Phone size={18} />
                                  {hospital.phone === '112' ? emergencyI18n.callEmergency112 : emergencyI18n.callHospital}
                                </button>
                              )}
                              {(hospital.lat && hospital.lon) ? (
                                <button
                                  onClick={() => window.open(
                                    `https://www.google.com/maps/search/hospitals/@${hospital.lat},${hospital.lon},15z`,
                                    '_blank'
                                  )}
                                  className="px-4 py-2 border border-[#7C3AED] text-[#7C3AED] font-medium hover:bg-purple-50 transition-colors flex items-center justify-center gap-2 rounded-lg"
                                >
                                  <MapPin size={18} />
                                  {emergencyI18n.openMap}
                                </button>
                              ) : null}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              </React.Fragment>
            ))}
            
            {/* Advice Card */}
            {showAdvice && adviceData && (
              <div className="mt-4 bg-[#2F66F3] rounded-2xl p-4 sm:p-5 text-white max-w-md shadow-lg">
                <h3 className="text-base sm:text-lg font-bold mb-3">Rx: {adviceData.medicine}</h3>
                
                <div className="space-y-3">
                  <div>
                    <p className="font-semibold text-sm sm:text-base mb-1">Dosage:</p>
                    <p className="text-sm sm:text-base">{adviceData.dosage}</p>
                  </div>
                  
                  <div>
                    <p className="font-semibold text-sm sm:text-base mb-1">Instruction:</p>
                    <p className="text-sm sm:text-base leading-relaxed">{adviceData.instruction}</p>
                  </div>
                </div>
                
                <button
                  onClick={handleListenToAdvice}
                  className="mt-4 w-full bg-white text-gray-700 px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium hover:bg-gray-50 transition-colors"
                >
                  <Volume2 size={18} className="sm:w-5 sm:h-5" />
                  Listen to advice
                </button>
              </div>
            )}
            
            {/* Temperature Input Screen */}
            {showTemperatureInput && (
              <div className="mt-4 space-y-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">Temperature in F°</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && temperature) {
                        handleTemperatureSubmit();
                      }
                    }}
                    placeholder="99"
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-purple-300"
                  />
                  <span className="text-gray-600 font-medium">F°</span>
                </div>
                {temperature && (
                  <button
                    onClick={handleTemperatureSubmit}
                    className="w-full px-4 py-3 rounded-xl bg-[#2F66F3] text-white font-medium hover:bg-blue-700 transition-colors"
                  >
                    Continue
                  </button>
                )}
              </div>
            )}
            
            {/* Yes/No Buttons */}
            {showYesNo && (
              <div className="flex justify-center gap-3 mt-4 mb-2">
                <button
                  onClick={() => handleYesNoResponse('no')}
                  className="px-8 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  No
                </button>
                <button
                  onClick={() => handleYesNoResponse('yes')}
                  className="px-8 py-2.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
                >
                  Yes
                </button>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area — sticky at bottom */}
          <div className="fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-[#C4ACEF] to-[#D6C4F7] px-3 py-3 flex gap-1.5 sm:gap-2 shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="|"
              className="flex-1 px-3 sm:px-4 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300 text-xs sm:text-sm"
            />
            {/* Mic button – tap to start/stop voice input */}
            <button
              onClick={toggleSpeaking}
              disabled={isProcessingSTT || !isVoiceSupported(detectedLang)}
              title={
                !isVoiceSupported(detectedLang)
                  ? 'Voice input not supported in this language'
                  : isProcessingSTT
                  ? 'Processing…'
                  : isSpeaking
                  ? 'Stop recording'
                  : 'Start voice input'
              }
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-white transition-colors ${
                !isVoiceSupported(detectedLang)
                  ? 'bg-gray-300 cursor-not-allowed text-gray-400'
                  : isProcessingSTT
                  ? 'bg-yellow-500 cursor-wait animate-pulse'
                  : isSpeaking
                  ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              <Mic size={16} className="sm:w-5 sm:h-5" />
            </button>
            {/* Send button */}
            <button
              onClick={handleSendMessage}
              disabled={!inputText.trim() || isThinking}
              className="w-9 h-9 sm:w-10 sm:h-10 bg-[#2F66F3] rounded-lg flex items-center justify-center text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} className="sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Side-by-side layout (default)

  // Side-by-side layout (default)
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#E9DDFB] via-[#D6C4F7] to-[#C4ACEF]">
      {/* Header */}
      <Navbar
        variant="shadow"
        onBack={onBack}
        selectedLanguage={selectedLanguage}
        onLanguageClick={() => setShowLanguageModal(true)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-row px-3 sm:px-4 lg:px-6 py-3 sm:py-4 gap-2 sm:gap-3 lg:gap-4">
        {/* Avatar Section - Left Side (visible on all screen sizes) */}
        <div className="flex flex-col items-center gap-3 flex-shrink-0">
          {renderAvatar()}
          
          {/* Thermometer - shown when temperature input is active */}
          {showTemperatureInput && (
            <div className="relative flex items-center gap-3">
              {/* Temperature display */}
              <div className="text-3xl font-bold text-gray-800">
                {temperature || '99'}
              </div>
              
              {/* Thermometer body */}
              <div className="relative bg-white rounded-full shadow-lg p-3" style={{ width: '80px', height: '450px' }}>
                {/* Header with F and C labels */}
                <div className="absolute top-2 left-0 right-0 flex justify-between px-2 text-xs font-semibold text-gray-700">
                  <span>°F</span>
                  <span>°C</span>
                </div>
                
                {/* Main thermometer tube area */}
                <div className="absolute top-8 left-0 right-0 bottom-16 flex justify-center items-center">
                  {/* Left scale (Fahrenheit) */}
                  <div className="absolute left-1 top-0 bottom-0 flex flex-col justify-between text-[9px] font-medium text-gray-600">
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-px bg-gray-400"></span>
                      <span>120</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-px bg-gray-400"></span>
                      <span>110</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-px bg-gray-400"></span>
                      <span>100</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-px bg-gray-400"></span>
                      <span>90</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-px bg-gray-400"></span>
                      <span>80</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-px bg-gray-400"></span>
                      <span>70</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-px bg-gray-400"></span>
                      <span>60</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-px bg-gray-400"></span>
                      <span>50</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-px bg-gray-400"></span>
                      <span>40</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-px bg-gray-400"></span>
                      <span>30</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-px bg-gray-400"></span>
                      <span>20</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-px bg-gray-400"></span>
                      <span>10</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-px bg-gray-400"></span>
                      <span>0</span>
                    </div>
                  </div>
                  
                  {/* Right scale (Celsius) */}
                  <div className="absolute right-1 top-0 bottom-0 flex flex-col justify-between text-[9px] font-medium text-gray-600">
                    <div className="flex items-center gap-1">
                      <span>50</span>
                      <span className="w-2 h-px bg-gray-400"></span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>40</span>
                      <span className="w-2 h-px bg-gray-400"></span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>30</span>
                      <span className="w-2 h-px bg-gray-400"></span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>20</span>
                      <span className="w-2 h-px bg-gray-400"></span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>10</span>
                      <span className="w-2 h-px bg-gray-400"></span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>0</span>
                      <span className="w-2 h-px bg-gray-400"></span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>-10</span>
                      <span className="w-2 h-px bg-gray-400"></span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>-20</span>
                      <span className="w-2 h-px bg-gray-400"></span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>-30</span>
                      <span className="w-2 h-px bg-gray-400"></span>
                    </div>
                  </div>
                  
                  {/* Mercury tube */}
                  <div className="w-4 h-full bg-gray-300 rounded-full relative overflow-hidden border border-gray-400">
                    <div 
                      className="absolute bottom-0 w-full bg-gradient-to-t from-red-600 via-red-500 to-red-400 transition-all duration-300"
                      style={{ 
                        height: temperature 
                          ? `${Math.min(100, Math.max(5, ((parseFloat(temperature) - 0) / 120) * 100))}%` 
                          : '82.5%' 
                      }}
                    />
                  </div>
                </div>
                
                {/* Bulb at bottom */}
                <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2">
                  <div className="w-12 h-12 bg-red-600 rounded-full border-2 border-red-700 shadow-md" />
                </div>
              </div>
            </div>
          )}

          {/* New Chat Button */}
          {(chatId || messages.length > 0) && (
            <button
              onClick={() => onBack?.()}
              disabled={isThinking}
              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
            >
              <Plus size={13} />
              New Chat
            </button>
          )}

          {/* Past Chats Panel */}
          {pastChats.length > 0 && (
            <div className="w-full">
              <button
                onClick={() => setShowPastChats(s => !s)}
                className="w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 bg-white/80 backdrop-blur-sm rounded-xl text-xs font-semibold text-gray-700 shadow-sm hover:bg-white transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <History size={13} className="text-purple-600" />
                  <span>Past Chats</span>
                  <span className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                    {pastChats.length}
                  </span>
                </div>
                <ChevronDown size={13} className={`text-gray-500 transition-transform duration-200 ${showPastChats ? 'rotate-180' : ''}`} />
              </button>
              {showPastChats && (
                <div className="mt-1.5 space-y-1 max-h-52 overflow-y-auto pr-0.5">
                  {pastChats.map(rec => (
                    <button
                      key={rec.chatId}
                      onClick={() => loadPastChat(rec)}
                      disabled={loadingPastChat === rec.chatId}
                      className={`w-full text-left px-2.5 py-2 rounded-xl text-xs transition-colors shadow-sm ${
                        chatId === rec.chatId
                          ? 'bg-purple-100 border border-purple-300 text-purple-900'
                          : 'bg-white/80 hover:bg-white border border-transparent hover:border-purple-200'
                      }`}
                    >
                      <div className="flex items-center gap-1 mb-0.5">
                        <MessageSquare size={10} className="text-purple-500 flex-shrink-0" />
                        <span className="font-bold text-purple-600 text-[10px]">Chat #{rec.chatNum}</span>
                        {loadingPastChat === rec.chatId && (
                          <span className="text-[9px] text-gray-400 ml-auto animate-pulse">Loading...</span>
                        )}
                      </div>
                      <div className="text-gray-700 line-clamp-2 leading-tight text-[11px]">
                        {rec.firstMessage}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Chat Messages Section - Right Side */}
        <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-md overflow-hidden relative">
          {/* Expand to Fullscreen Button */}
          <button
            onClick={() => setIsFullscreen(true)}
            className="absolute top-3 left-3 sm:top-4 sm:left-4 z-10 w-6 h-6 sm:w-7 sm:h-7 bg-white border-2 border-purple-400 rounded flex items-center justify-center text-purple-600 shadow-md hover:bg-purple-50"
            title="Expand Chat"
          >
            <Maximize2 size={14} className="sm:w-4 sm:h-4" />
          </button>

          {/* Messages Area */}
          <div className="flex-1 p-3 sm:p-4 overflow-y-auto">
            {messages.map((message) => (
              <React.Fragment key={message.id}>
              <div className={`flex flex-col ${message.sender === 'user' ? 'items-end' : 'items-start'} gap-2 mb-4`}>
                <div className="flex items-center gap-2">
                  {message.sender === 'ai' && (
                    <>
                      <span className="text-sm font-medium text-gray-700">AI Voice</span>
                      <span className="text-xs text-gray-400">{message.timestamp}</span>
                    </>
                  )}
                  {message.sender === 'user' && (
                    <>
                      <span className="text-xs text-gray-400">{message.timestamp}</span>
                      <span className="text-sm font-medium text-green-600">You</span>
                    </>
                  )}
                </div>
                <div className={`relative ${
                  message.sender === 'user'
                    ? 'bg-white border border-gray-200 rounded-2xl rounded-tr-none'
                    : 'bg-[#D2E3FC] rounded-2xl rounded-tl-none'
                } px-4 py-3 max-w-[85%]`}>
                  {message.sender === 'ai'
                    ? <FormattedMessage
                        text={message.text}
                        msgId={message.id}
                        onSpeak={isVoiceSupported(detectedLang) ? handleTextToSpeech : undefined}
                        stopTTS={stopTTS}
                        playingId={playingMsgId}
                        isTTSPlaying={isTTSPlaying}
                        isEmergency={emergencyMsgId === message.id}
                      />
                    : <p className="text-sm text-gray-800">{message.text}</p>
                  }
                </div>
              </div>
              {emergencyMsgId === message.id && (
                <div className="mb-4 space-y-3">
                  {/* Location Bar with Change City and Live GPS controls */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-3 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs sm:text-sm text-blue-900 font-semibold">
                        <MapPin size={16} className="text-blue-600 flex-shrink-0" />
                        <span>
                          {detectedCity
                            ? <>{emergencyI18n.showingNear} <span className="text-blue-700 underline font-bold">{detectedCity}</span></>
                            : 'Detecting location / स्थान का पता लगाया जा रहा है...'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowLocationSearch(prev => !prev)}
                          className="text-xs bg-white hover:bg-blue-100 text-blue-700 border border-blue-300 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 shadow-sm"
                        >
                          ✏️ {detectedLang?.startsWith('hi') ? 'शहर/पिनकोड बदलें' : 'Change City/Pincode'}
                        </button>
                        <button
                          type="button"
                          onClick={requestFreshGPS}
                          disabled={locationSearching}
                          className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 shadow-sm disabled:opacity-50"
                          title="Get current GPS location"
                        >
                          <Navigation size={12} /> {detectedLang?.startsWith('hi') ? 'लाइव GPS' : 'Live GPS'}
                        </button>
                      </div>
                    </div>

                    {/* Location search input */}
                    {(showLocationSearch || !detectedCity) && (
                      <div className="mt-3 pt-3 border-t border-blue-200/80">
                        <p className="text-xs text-blue-800 mb-1.5 font-medium">
                          {detectedLang?.startsWith('hi')
                            ? 'यदि आपका शहर गलत है, तो अपना सही शहर या 6-अंक का पिनकोड लिखें:'
                            : 'If your location is incorrect, enter your city or 6-digit pincode:'}
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={locationInput}
                            onChange={(e) => setLocationInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleLocationSearch()}
                            placeholder={emergencyI18n.searchPlaceholder}
                            className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                          />
                          <button
                            type="button"
                            onClick={handleLocationSearch}
                            disabled={!locationInput.trim() || locationSearching}
                            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                          >
                            {emergencyI18n.searchBtn}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Call 112 Emergency Button */}
                  <a
                    href="tel:112"
                    className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold px-4 py-3.5 rounded-xl shadow-lg transition-colors"
                  >
                    <Phone size={20} />
                    {emergencyI18n.callNationalEmergency}
                  </a>
                  <div className="space-y-3">
                    {hospitals.map((hospital, index) => (
                      <div key={index} className="bg-white rounded-xl p-4 shadow-md border border-gray-200">
                        {hospital.phone === '' ? (
                          <div className="flex items-center gap-3 py-2">
                            <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                            <p className="text-sm text-gray-600 font-medium">{hospital.name}</p>
                          </div>
                        ) : (
                          <>
                            <h4 className="font-semibold text-blue-700 text-sm sm:text-base mb-1">{hospital.name}</h4>
                            {hospital.distance && (
                              <p className="text-xs sm:text-sm text-gray-600 mb-0.5">
                                {emergencyI18n.distanceLabel} {hospital.distance}{hospital.time ? ` (${hospital.time})` : ''}
                              </p>
                            )}
                            {hospital.phone && (
                              <p className="text-xs sm:text-sm text-gray-600 mb-3">{emergencyI18n.phoneLabel} {hospital.phone}</p>
                            )}
                            <div className="flex flex-col gap-2">
                              {hospital.phone && hospital.phone !== '' && (
                                <button
                                  onClick={() => window.location.href = `tel:${hospital.phone}`}
                                  className="w-full px-4 py-2.5 rounded-lg bg-[#7C3AED] text-white font-medium hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                                >
                                  <Phone size={18} />
                                  {hospital.phone === '112' ? emergencyI18n.callEmergency112 : emergencyI18n.callHospital}
                                </button>
                              )}
                              {(hospital.lat && hospital.lon) ? (
                                <button
                                  onClick={() => window.open(
                                    `https://www.google.com/maps/search/hospitals/@${hospital.lat},${hospital.lon},15z`,
                                    '_blank'
                                  )}
                                  className="px-4 py-2 border border-[#7C3AED] text-[#7C3AED] font-medium hover:bg-purple-50 transition-colors flex items-center justify-center gap-2 rounded-lg"
                                >
                                  <MapPin size={18} />
                                  {emergencyI18n.openMap}
                                </button>
                              ) : null}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              </React.Fragment>
            ))}
            
            {/* Advice Card */}
            {showAdvice && adviceData && (
              <div className="mt-4 bg-[#2F66F3] rounded-2xl p-4 sm:p-5 text-white max-w-md shadow-lg">
                <h3 className="text-base sm:text-lg font-bold mb-3">Rx: {adviceData.medicine}</h3>
                
                <div className="space-y-3">
                  <div>
                    <p className="font-semibold text-sm sm:text-base mb-1">Dosage:</p>
                    <p className="text-sm sm:text-base">{adviceData.dosage}</p>
                  </div>
                  
                  <div>
                    <p className="font-semibold text-sm sm:text-base mb-1">Instruction:</p>
                    <p className="text-sm sm:text-base leading-relaxed">{adviceData.instruction}</p>
                  </div>
                </div>
                
                <button
                  onClick={handleListenToAdvice}
                  className="mt-4 w-full bg-white text-gray-700 px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium hover:bg-gray-50 transition-colors"
                >
                  <Volume2 size={18} className="sm:w-5 sm:h-5" />
                  Listen to advice
                </button>
              </div>
            )}
            
            {/* Temperature Input Screen */}
            {showTemperatureInput && (
              <div className="mt-4 space-y-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">Temperature in F°</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && temperature) {
                        handleTemperatureSubmit();
                      }
                    }}
                    placeholder="99"
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-purple-300"
                  />
                  <span className="text-gray-600 font-medium">F°</span>
                </div>
                {temperature && (
                  <button
                    onClick={handleTemperatureSubmit}
                    className="w-full px-4 py-3 rounded-xl bg-[#2F66F3] text-white font-medium hover:bg-blue-700 transition-colors"
                  >
                    Continue
                  </button>
                )}
              </div>
            )}
            
            {/* Yes/No Buttons */}
            {showYesNo && (
              <div className="flex justify-center gap-3 mt-4 mb-2">
                <button
                  onClick={() => handleYesNoResponse('no')}
                  className="px-8 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  No
                </button>
                <button
                  onClick={() => handleYesNoResponse('yes')}
                  className="px-8 py-2.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
                >
                  Yes
                </button>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 sm:p-4 border-t border-gray-100 flex gap-1.5 sm:gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="|"
              className="flex-1 px-3 sm:px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-300 text-xs sm:text-sm"
            />
            {/* Mic button – tap to start/stop voice input */}
            <button
              onClick={toggleSpeaking}
              disabled={isProcessingSTT || !isVoiceSupported(detectedLang)}
              title={
                !isVoiceSupported(detectedLang)
                  ? 'Voice input not supported in this language'
                  : isProcessingSTT
                  ? 'Processing…'
                  : isSpeaking
                  ? 'Stop recording'
                  : 'Start voice input'
              }
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-white transition-colors ${
                !isVoiceSupported(detectedLang)
                  ? 'bg-gray-300 cursor-not-allowed text-gray-400'
                  : isProcessingSTT
                  ? 'bg-yellow-500 cursor-wait animate-pulse'
                  : isSpeaking
                  ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              <Mic size={16} className="sm:w-5 sm:h-5" />
            </button>
            {/* Send button */}
            <button
              onClick={handleSendMessage}
              disabled={!inputText.trim() || isThinking}
              className="w-9 h-9 sm:w-10 sm:h-10 bg-[#2F66F3] rounded-lg flex items-center justify-center text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} className="sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      </div>
      
      {/* End Chat Modal */}
      {showEndChatModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 relative">
            <button
              onClick={() => setShowEndChatModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
            
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="w-6 h-6 text-orange-500" />
              </div>
              
              <h3 className="text-lg font-semibold text-gray-800 mb-2">End Chat</h3>
              <p className="text-sm text-gray-600 mb-6">
                Are you sure you want to end this chat? Once you end the chat you will not be able to view th advice again.
              </p>
              
              <div className="w-full space-y-3">
                <button
                  onClick={handleListenToAdvice}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Volume2 size={18} />
                  Listen to advice
                </button>
                
                <button
                  onClick={handleContinueChat}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  Continue Chat
                </button>
                
                <button
                  onClick={handleEndChat}
                  className="w-full px-4 py-3 rounded-lg bg-[#7C3AED] text-white font-medium hover:bg-[#6D28D9] transition-colors"
                >
                  End Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Language Selection Modal */}
      {showLanguageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm relative max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Select Language</h3>
                <p className="text-sm text-gray-500 mt-1">Choose your preferred language</p>
              </div>
              <button
                onClick={() => setShowLanguageModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-2">
                {[
                  { name: 'Hindi', native: 'हिंदी' },
                  { name: 'English', native: 'English' },
                  { name: 'Bengali', native: 'বাংলা' },
                  { name: 'Telugu', native: 'తెలుగు' },
                  { name: 'Marathi', native: 'मराठी' },
                  { name: 'Tamil', native: 'தமிழ்' },
                  { name: 'Gujarati', native: 'ગુજરાતી' },
                  { name: 'Urdu', native: 'اردو' },
                  { name: 'Kannada', native: 'ಕನ್ನಡ' },
                  { name: 'Malayalam', native: 'മലയാളം' }
                ].map((language) => (
                  <button
                    key={language.name}
                    onClick={() => handleLanguageSelect(language.name)}
                    className={`w-full px-4 py-3 rounded-lg text-left transition-colors ${
                      selectedLanguage === language.name
                        ? 'bg-[#2F66F3] text-white'
                        : 'bg-white border border-gray-200 text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    <span className="font-medium">{language.native}</span>
                    {language.name !== language.native && (
                      <span className={`ml-2 text-sm ${
                        selectedLanguage === language.name ? 'text-blue-100' : 'text-gray-500'
                      }`}>
                        ({language.name})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

