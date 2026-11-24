import { Phone, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import Navbar, { LANGUAGES } from './Navbar';

// ── Predefined translations for all landing-page strings ─────────────────────
// Keys match the BCP-47 codes exported from Navbar.tsx
type LangStrings = {
  welcome: string;
  welcomeSub: string;
  emergencyTitle: string;
  emergencyBody: string;
  call112: string;
  disclaimerTitle: string;
  disclaimerBody: string;
  guidelinesHeading: string;
  specialCareTitle: string;
  specialCareSub: string;
  specialCareSubheading: string;
  pregnant: string;
  infants: string;
  infantsSub: string;
  elderly: string;
  chronic: string;
  chronicSub: string;
  allergic: string;
  usageTitle: string;
  usageSub: string;
  usageSubheading: string;
  basicGuidance: string;
  basicGuidanceSub: string;
  dontExceed: string;
  dontExceedSub: string;
  avoidMixing: string;
  avoidMixingSub: string;
  stopWorsen: string;
  stopWorsenSub: string;
  checkboxLabel: string;
  agreeBtn: string;
};

const T: Record<string, LangStrings> = {
  'en-IN': {
    welcome: 'Welcome to Swasthya Sahayak',
    welcomeSub: 'Your trusted health companion for quick, reliable help in everyday concerns and emergencies.',
    emergencyTitle: 'Emergency helpline',
    emergencyBody: 'If you are experiencing a life-threatening emergency, shortness of breath, or severe pain, call for help immediately.',
    call112: 'Call 112',
    disclaimerTitle: 'Disclaimer',
    disclaimerBody: 'This app provides general info only and is not a substitute for professional medical advice. Always consult a doctor.',
    guidelinesHeading: 'Detailed Guidelines',
    specialCareTitle: 'Special Care Groups',
    specialCareSub: 'Pregnancy, Elderly, Children',
    specialCareSubheading: 'Consult a doctor if you are:',
    pregnant: 'Pregnant or breastfeeding',
    infants: 'Infants or young children',
    infantsSub: 'Seeking advice for their care',
    elderly: 'Elderly (60+ years)',
    chronic: 'Having chronic illnesses',
    chronicSub: 'Diabetes, BP, heart disease, asthma, or kidney problems',
    allergic: 'Allergic to medicines',
    usageTitle: 'Usage Guidelines',
    usageSub: 'Dosage, Mixing Meds',
    usageSubheading: 'Usage Guidelines',
    basicGuidance: 'Basic guidance only',
    basicGuidanceSub: 'Meant for standard first-aid and common OTC usage.',
    dontExceed: 'Do not exceed dosage',
    dontExceedSub: 'Follow recommended limits carefully.',
    avoidMixing: 'Avoid mixing medicines',
    avoidMixingSub: 'Do not mix without professional medical advice.',
    stopWorsen: 'Stop if symptoms worsen',
    stopWorsenSub: 'Discontinue use and consult a doctor immediately.',
    checkboxLabel: 'I have read and understand the disclaimer, emergency warning, and usage guidelines.',
    agreeBtn: 'I Understand & Agree',
  },
  'hi-IN': {
    welcome: 'स्वास्थ्य सहायक में आपका स्वागत है',
    welcomeSub: 'रोज़मर्रा की समस्याओं और आपात स्थितियों में त्वरित, विश्वसनीय सहायता के लिए आपका भरोसेमंद स्वास्थ्य साथी।',
    emergencyTitle: 'आपातकालीन हेल्पलाइन',
    emergencyBody: 'यदि आप जीवन-खतरनाक आपात स्थिति, सांस की तकलीफ या तेज दर्द अनुभव कर रहे हैं, तो तुरंत मदद के लिए कॉल करें।',
    call112: '112 पर कॉल करें',
    disclaimerTitle: 'अस्वीकरण',
    disclaimerBody: 'यह ऐप केवल सामान्य जानकारी प्रदान करता है और पेशेवर चिकित्सा सलाह का विकल्प नहीं है। हमेशा डॉक्टर से परामर्श लें।',
    guidelinesHeading: 'विस्तृत दिशानिर्देश',
    specialCareTitle: 'विशेष देखभाल समूह',
    specialCareSub: 'गर्भावस्था, बुजुर्ग, बच्चे',
    specialCareSubheading: 'डॉक्टर से परामर्श करें यदि आप:',
    pregnant: 'गर्भवती या स्तनपान करा रही हैं',
    infants: 'शिशु या छोटे बच्चे',
    infantsSub: 'उनकी देखभाल के लिए सलाह चाहते हैं',
    elderly: 'बुजुर्ग (60+ वर्ष)',
    chronic: 'पुरानी बीमारियाँ हैं',
    chronicSub: 'मधुमेह, रक्तचाप, हृदय रोग, अस्थमा, या गुर्दे की समस्या',
    allergic: 'दवाओं से एलर्जी है',
    usageTitle: 'उपयोग दिशानिर्देश',
    usageSub: 'खुराक, दवाओं का मिश्रण',
    usageSubheading: 'उपयोग दिशानिर्देश',
    basicGuidance: 'केवल बुनियादी मार्गदर्शन',
    basicGuidanceSub: 'मानक प्राथमिक चिकित्सा और सामान्य OTC उपयोग के लिए।',
    dontExceed: 'खुराक से अधिक न लें',
    dontExceedSub: 'अनुशंसित सीमाओं का ध्यानपूर्वक पालन करें।',
    avoidMixing: 'दवाओं को मिलाने से बचें',
    avoidMixingSub: 'पेशेवर चिकित्सा सलाह के बिना न मिलाएं।',
    stopWorsen: 'लक्षण बिगड़ने पर रोकें',
    stopWorsenSub: 'उपयोग बंद करें और तुरंत डॉक्टर से परामर्श लें।',
    checkboxLabel: 'मैंने अस्वीकरण, आपातकालीन चेतावनी और उपयोग दिशानिर्देश पढ़ और समझ लिए हैं।',
    agreeBtn: 'मैं समझता/समझती हूँ और सहमत हूँ',
  },
  'bn-IN': {
    welcome: 'স্বাস্থ্য সহায়কে আপনাকে স্বাগতম',
    welcomeSub: 'প্রতিদিনের উদ্বেগ ও জরুরি পরিস্থিতিতে দ্রুত, নির্ভরযোগ্য সাহায্যের জন্য আপনার বিশ্বস্ত স্বাস্থ্য সঙ্গী।',
    emergencyTitle: 'জরুরি হেল্পলাইন',
    emergencyBody: 'যদি আপনি জীবন-বিপদজনক জরুরি অবস্থা, শ্বাসকষ্ট বা তীব্র ব্যথা অনুভব করেন, তাহলে অবিলম্বে সাহায্যের জন্য কল করুন।',
    call112: '112 কল করুন',
    disclaimerTitle: 'দাবিত্যাগ',
    disclaimerBody: 'এই অ্যাপটি শুধুমাত্র সাধারণ তথ্য প্রদান করে এবং পেশাদার চিকিৎসা পরামর্শের বিকল্প নয়। সবসময় একজন ডাক্তারের পরামর্শ নিন।',
    guidelinesHeading: 'বিস্তারিত নির্দেশিকা',
    specialCareTitle: 'বিশেষ যত্ন গোষ্ঠী',
    specialCareSub: 'গর্ভাবস্থা, বয়স্ক, শিশু',
    specialCareSubheading: 'ডাক্তারের পরামর্শ নিন যদি আপনি:',
    pregnant: 'গর্ভবতী বা বুকের দুধ খাওয়াচ্ছেন',
    infants: 'শিশু বা ছোট বাচ্চা',
    infantsSub: 'তাদের যত্নের জন্য পরামর্শ চাইছেন',
    elderly: 'বয়স্ক (৬০+ বছর)',
    chronic: 'দীর্ঘস্থায়ী রোগ আছে',
    chronicSub: 'ডায়াবেটিস, রক্তচাপ, হৃদরোগ, হাঁপানি বা কিডনির সমস্যা',
    allergic: 'ওষুধে অ্যালার্জি আছে',
    usageTitle: 'ব্যবহারের নির্দেশিকা',
    usageSub: 'মাত্রা, ওষুধ মিশ্রণ',
    usageSubheading: 'ব্যবহারের নির্দেশিকা',
    basicGuidance: 'শুধুমাত্র মৌলিক নির্দেশনা',
    basicGuidanceSub: 'মানক প্রাথমিক চিকিৎসা ও সাধারণ OTC ব্যবহারের জন্য।',
    dontExceed: 'মাত্রা অতিক্রম করবেন না',
    dontExceedSub: 'সুপারিশকৃত সীমা সাবধানে মেনে চলুন।',
    avoidMixing: 'ওষুধ মেশানো এড়িয়ে চলুন',
    avoidMixingSub: 'পেশাদার চিকিৎসা পরামর্শ ছাড়া মেশাবেন না।',
    stopWorsen: 'লক্ষণ খারাপ হলে বন্ধ করুন',
    stopWorsenSub: 'ব্যবহার বন্ধ করুন এবং অবিলম্বে ডাক্তারের পরামর্শ নিন।',
    checkboxLabel: 'আমি দাবিত্যাগ, জরুরি সতর্কতা এবং ব্যবহারের নির্দেশিকা পড়েছি ও বুঝেছি।',
    agreeBtn: 'আমি বুঝি ও সম্মত',
  },
  'gu-IN': {
    welcome: 'સ્વાસ્થ્ય સહાયકમાં આપનું સ્વાગત છે',
    welcomeSub: 'રોજિંદી સમસ્યાઓ અને કટોકટીઓમાં ઝડપી, વિશ્વસનીય મદદ માટે આપનો ભરોસાપાત્ર આરોગ્ય સાથી।',
    emergencyTitle: 'ઇમર્જન્સી હેલ્પલાઇન',
    emergencyBody: 'જો તમે જીવ-જોખમી કટોકટી, શ્વાસ લેવામાં તકલીફ અથવા તીવ્ર દુખાવો અનુભવો છો, તો તરત જ મદદ માટે ફોન કરો।',
    call112: '112 પર કૉલ કરો',
    disclaimerTitle: 'અસ્વીકૃતિ',
    disclaimerBody: 'આ એપ ફક્ત સામાન્ય માહિતી આપે છે અને તે વ્યાવસાયિક તબીબી સલાહનો વિકલ્પ નથી. હંમેશા ડૉક્ટરની સલાહ લો।',
    guidelinesHeading: 'વિગતવાર માર્ગદર્શિકા',
    specialCareTitle: 'વિશેષ સંભાળ જૂથો',
    specialCareSub: 'ગર્ભાવસ્થા, વૃદ્ધ, બાળકો',
    specialCareSubheading: 'ડૉક્ટરની સલાહ લો જો તમે:',
    pregnant: 'ગર્ભવતી અથવા સ્તનપાન કરાવો છો',
    infants: 'શિશુ અથવા નાના બાળકો',
    infantsSub: 'તેમની સંભાળ માટે સલાહ ઇચ્છો છો',
    elderly: 'વૃદ્ધ (60+ વર્ષ)',
    chronic: 'ક્રોનિક રોગ ધરાવો છો',
    chronicSub: 'ડાયાબિટીસ, BP, હૃદયરોગ, અસ્થમા, અથવા કિડની સમસ્યા',
    allergic: 'દવાઓ પ્રત્યે એલર્જી છે',
    usageTitle: 'ઉપયોગ માર્ગદર્શિકા',
    usageSub: 'ડોઝ, દવાઓ મિક્સ કરવી',
    usageSubheading: 'ઉપયોગ માર્ગદર્શિકા',
    basicGuidance: 'ફક્ત મૂળભૂત માર્ગદર્શન',
    basicGuidanceSub: 'સ્ટાન્ડર્ડ ફર્સ્ટ-એઇડ અને સામાન્ય OTC ઉપયોગ માટે।',
    dontExceed: 'ડોઝ ઓળંગશો નહીં',
    dontExceedSub: 'ભલામણ કરેલ મર્યાદાઓ કાળજીપૂર્વક અનુસરો।',
    avoidMixing: 'દવાઓ મિક્સ કરવાનું ટાળો',
    avoidMixingSub: 'વ્યાવસાયિક તબીબી સલાહ વિના ભેળવશો નહીં।',
    stopWorsen: 'લક્ષણો વધુ ખરાબ થાય તો બંધ કરો',
    stopWorsenSub: 'ઉપયોગ બંધ કરો અને તરત ડૉક્ટરની સલાહ લો।',
    checkboxLabel: 'મેં અસ્વીકૃતિ, ઇમર્જન્સી ચેતવણી અને ઉપયોગ માર્ગદર્શિકા વાંચ્યાં અને સમજ્યાં છે।',
    agreeBtn: 'હું સમજુ છું અને સહમત છું',
  },
  'kn-IN': {
    welcome: 'ಸ್ವಾಸ್ಥ್ಯ ಸಹಾಯಕಕ್ಕೆ ಸ್ವಾಗತ',
    welcomeSub: 'ದೈನಂದಿನ ಸಮಸ್ಯೆಗಳು ಮತ್ತು ತುರ್ತು ಸಂದರ್ಭಗಳಲ್ಲಿ ತ್ವರಿತ, ವಿಶ್ವಾಸಾರ್ಹ ಸಹಾಯಕ್ಕಾಗಿ ನಿಮ್ಮ ನಂಬಿಕಾರ್ಹ ಆರೋಗ್ಯ ಸಂಗಾತಿ।',
    emergencyTitle: 'ತುರ್ತು ಸಹಾಯವಾಣಿ',
    emergencyBody: 'ನೀವು ಜೀವ-ಬೆದರಿಕೆಯ ತುರ್ತು, ಉಸಿರಾಟದ ತೊಂದರೆ ಅಥವಾ ತೀವ್ರ ನೋವು ಅನುಭವಿಸುತ್ತಿದ್ದರೆ ತಕ್ಷಣ ಸಹಾಯಕ್ಕಾಗಿ ಕರೆ ಮಾಡಿ।',
    call112: '112 ಕರೆ ಮಾಡಿ',
    disclaimerTitle: 'ಹಕ್ಕು ತ್ಯಾಗ',
    disclaimerBody: 'ಈ ಅಪ್ಲಿಕೇಶನ್ ಕೇವಲ ಸಾಮಾನ್ಯ ಮಾಹಿತಿಯನ್ನು ಒದಗಿಸುತ್ತದೆ ಮತ್ತು ವೃತ್ತಿಪರ ವೈದ್ಯಕೀಯ ಸಲಹೆಯ ಪರ್ಯಾಯವಲ್ಲ. ಯಾವಾಗಲೂ ವೈದ್ಯರನ್ನು ಸಂಪರ್ಕಿಸಿ।',
    guidelinesHeading: 'ವಿವರವಾದ ಮಾರ್ಗಸೂಚಿಗಳು',
    specialCareTitle: 'ವಿಶೇಷ ಆರೈಕೆ ಗುಂಪುಗಳು',
    specialCareSub: 'ಗರ್ಭಾವಸ್ಥೆ, ವೃದ್ಧರು, ಮಕ್ಕಳು',
    specialCareSubheading: 'ವೈದ್ಯರನ್ನು ಸಂಪರ್ಕಿಸಿ ನೀವು:',
    pregnant: 'ಗರ್ಭಿಣಿ ಅಥವಾ ಎದೆಹಾಲು ಕುಡಿಸುತ್ತಿದ್ದೀರಾ',
    infants: 'ಶಿಶುಗಳು ಅಥವಾ ಚಿಕ್ಕ ಮಕ್ಕಳು',
    infantsSub: 'ಅವರ ಆರೈಕೆಗೆ ಸಲಹೆ ಪಡೆಯಲು',
    elderly: 'ವೃದ್ಧರು (60+ ವರ್ಷ)',
    chronic: 'ದೀರ್ಘಕಾಲೀನ ಕಾಯಿಲೆ ಇದೆ',
    chronicSub: 'ಮಧುಮೇಹ, ರಕ್ತದೊತ್ತಡ, ಹೃದ್ರೋಗ, ಆಸ್ತಮಾ ಅಥವಾ ಮೂತ್ರಪಿಂಡ ಸಮಸ್ಯೆ',
    allergic: 'ಔಷಧಿಗಳಿಗೆ ಅಲರ್ಜಿ ಇದೆ',
    usageTitle: 'ಬಳಕೆ ಮಾರ್ಗಸೂಚಿಗಳು',
    usageSub: 'ಡೋಸೇಜ್, ಔಷಧಿ ಮಿಶ್ರಣ',
    usageSubheading: 'ಬಳಕೆ ಮಾರ್ಗಸೂಚಿಗಳು',
    basicGuidance: 'ಕೇವಲ ಮೂಲ ಮಾರ್ಗದರ್ಶನ',
    basicGuidanceSub: 'ಪ್ರಮಾಣಿತ ಪ್ರಥಮ ಚಿಕಿತ್ಸೆ ಮತ್ತು ಸಾಮಾನ್ಯ OTC ಬಳಕೆಗಾಗಿ।',
    dontExceed: 'ಡೋಸ್ ಮೀರಬೇಡಿ',
    dontExceedSub: 'ಶಿಫಾರಸು ಮಾಡಿದ ಮಿತಿಗಳನ್ನು ಎಚ್ಚರಿಕೆಯಿಂದ ಅನುಸರಿಸಿ।',
    avoidMixing: 'ಔಷಧಿ ಮಿಶ್ರಣ ತಪ್ಪಿಸಿ',
    avoidMixingSub: 'ವೃತ್ತಿಪರ ವೈದ್ಯಕೀಯ ಸಲಹೆ ಇಲ್ಲದೆ ಮಿಶ್ರಣ ಮಾಡಬೇಡಿ।',
    stopWorsen: 'ರೋಗಲಕ್ಷಣಗಳು ಹದಗೆಟ್ಟರೆ ನಿಲ್ಲಿಸಿ',
    stopWorsenSub: 'ಬಳಕೆ ನಿಲ್ಲಿಸಿ ಮತ್ತು ತಕ್ಷಣ ವೈದ್ಯರನ್ನು ಸಂಪರ್ಕಿಸಿ।',
    checkboxLabel: 'ನಾನು ಹಕ್ಕು ತ್ಯಾಗ, ತುರ್ತು ಎಚ್ಚರಿಕೆ ಮತ್ತು ಬಳಕೆ ಮಾರ್ಗಸೂಚಿಗಳನ್ನು ಓದಿ ಅರ್ಥ ಮಾಡಿಕೊಂಡಿದ್ದೇನೆ।',
    agreeBtn: 'ನಾನು ಅರ್ಥ ಮಾಡಿಕೊಂಡಿದ್ದೇನೆ ಮತ್ತು ಒಪ್ಪಿಗೆ ನೀಡುತ್ತೇನೆ',
  },
  'ml-IN': {
    welcome: 'സ്വാസ്ഥ്യ സഹായകിലേക്ക് സ്വാഗതം',
    welcomeSub: 'ദൈനംദിന ആശങ്കകളിലും അടിയന്തര ഘട്ടങ്ങളിലും വേഗത്തിലും വിശ്വസനീയമായും സഹായിക്കുന്ന നിങ്ങളുടെ ആരോഗ്യ കൂട്ടാളി।',
    emergencyTitle: 'അടിയന്തര ഹെൽപ്പ്‌ലൈൻ',
    emergencyBody: 'ജീവൻ അപകടകരമായ അടിയന്തരാവസ്ഥ, ശ്വാസതടസ്സം, അല്ലെങ്കിൽ കടുത്ത വേദന അനുഭവിക്കുകയാണെങ്കിൽ ഉടൻ സഹായം തേടുക।',
    call112: '112 വിളിക്കൂ',
    disclaimerTitle: 'നിരാകരണം',
    disclaimerBody: 'ഈ ആപ്പ് പൊതുവായ വിവരങ്ങൾ മാത്രം നൽകുന്നു, ഇത് പ്രൊഫഷണൽ വൈദ്യ ഉപദേശത്തിന്റെ പകരമല്ല. എപ്പോഴും ഒരു ഡോക്ടറെ കാണുക।',
    guidelinesHeading: 'വിശദമായ മാർഗ്ഗനിർദ്ദേശങ്ങൾ',
    specialCareTitle: 'പ്രത്യേക പരിചരണ ഗ്രൂപ്പുകൾ',
    specialCareSub: 'ഗർഭകാലം, വൃദ്ധർ, കുട്ടികൾ',
    specialCareSubheading: 'ഡോക്ടറെ കാണുക, നിങ്ങൾ:',
    pregnant: 'ഗർഭിണിയോ മുലയൂട്ടുന്നവളോ ആണ്',
    infants: 'ശിശുക്കൾ അല്ലെങ്കിൽ ചെറിയ കുട്ടികൾ',
    infantsSub: 'അവരുടെ പരിചരണത്തിനായി ഉപദേശം തേടുന്നു',
    elderly: 'വൃദ്ധർ (60+ വയസ്സ്)',
    chronic: 'വിട്ടുമാറാത്ത രോഗങ്ങൾ ഉണ്ട്',
    chronicSub: 'പ്രമേഹം, രക്തസമ്മർദ്ദം, ഹൃദ്രോഗം, ആസ്ത്മ, അല്ലെങ്കിൽ വൃക്ക പ്രശ്നങ്ങൾ',
    allergic: 'മരുന്നുകളോട് അലർജിയുണ്ട്',
    usageTitle: 'ഉപയോഗ മാർഗ്ഗനിർദ്ദേശങ്ങൾ',
    usageSub: 'ഡോസേജ്, മരുന്ന് മിശ്രണം',
    usageSubheading: 'ഉപയോഗ മാർഗ്ഗനിർദ്ദേശങ്ങൾ',
    basicGuidance: 'അടിസ്ഥാന മാർഗ്ഗദർശനം മാത്രം',
    basicGuidanceSub: 'സ്റ്റാൻഡേർഡ് ഫസ്റ്റ് എയ്ഡ്, സാധാരണ OTC ഉപയോഗത്തിനായി।',
    dontExceed: 'ഡോസ് കവിയരുത്',
    dontExceedSub: 'ശുപാർശ ചെയ്ത പരിധികൾ ശ്രദ്ധാപൂർവ്വം പിന്തുടരുക।',
    avoidMixing: 'മരുന്നുകൾ കലർത്തുന്നത് ഒഴിവാക്കുക',
    avoidMixingSub: 'പ്രൊഫഷണൽ വൈദ്യ ഉപദേശം കൂടാതെ കലർത്തരുത്।',
    stopWorsen: 'രോഗലക്ഷണങ്ങൾ വഷളായാൽ നിർത്തുക',
    stopWorsenSub: 'ഉപയോഗം നിർത്തി ഉടൻ ഡോക്ടറെ കാണുക।',
    checkboxLabel: 'ഞാൻ നിരാകരണം, അടിയന്തര മുന്നറിയിപ്പ്, ഉപയോഗ മാർഗ്ഗനിർദ്ദേശങ്ങൾ എന്നിവ വായിച്ചു മനസ്സിലാക്കി.',
    agreeBtn: 'ഞാൻ മനസ്സിലാക്കി, സമ്മതിക്കുന്നു',
  },
  'mr-IN': {
    welcome: 'स्वास्थ्य सहायकमध्ये आपले स्वागत आहे',
    welcomeSub: 'रोजच्या समस्या आणि आणीबाणीच्या वेळी जलद, विश्वासार्ह मदतीसाठी आपला विश्वासू आरोग्य साथीदार।',
    emergencyTitle: 'आणीबाणी हेल्पलाइन',
    emergencyBody: 'जर तुम्हाला जीवघेणी आणीबाणी, श्वास घेण्यास त्रास किंवा तीव्र वेदना होत असतील तर त्वरित मदतीसाठी कॉल करा।',
    call112: '112 वर कॉल करा',
    disclaimerTitle: 'अस्वीकरण',
    disclaimerBody: 'हे अॅप केवळ सामान्य माहिती देते आणि व्यावसायिक वैद्यकीय सल्ल्याचा पर्याय नाही. नेहमी डॉक्टरांचा सल्ला घ्या।',
    guidelinesHeading: 'तपशीलवार मार्गदर्शक तत्त्वे',
    specialCareTitle: 'विशेष काळजी गट',
    specialCareSub: 'गर्भधारणा, वृद्ध, मुले',
    specialCareSubheading: 'डॉक्टरांचा सल्ला घ्या जर तुम्ही:',
    pregnant: 'गर्भवती किंवा स्तनपान करत आहात',
    infants: 'अर्भके किंवा लहान मुले',
    infantsSub: 'त्यांच्या काळजीसाठी सल्ला शोधत आहात',
    elderly: 'वृद्ध (60+ वर्षे)',
    chronic: 'जुनाट आजार आहेत',
    chronicSub: 'मधुमेह, रक्तदाब, हृदयरोग, दमा, किंवा मूत्रपिंड समस्या',
    allergic: 'औषधांवर ऍलर्जी आहे',
    usageTitle: 'वापर मार्गदर्शक तत्त्वे',
    usageSub: 'डोस, औषधे मिसळणे',
    usageSubheading: 'वापर मार्गदर्शक तत्त्वे',
    basicGuidance: 'केवळ मूलभूत मार्गदर्शन',
    basicGuidanceSub: 'मानक प्रथमोपचार आणि सामान्य OTC वापरासाठी।',
    dontExceed: 'डोस ओलांडू नका',
    dontExceedSub: 'शिफारस केलेल्या मर्यादांचे काळजीपूर्वक पालन करा।',
    avoidMixing: 'औषधे मिसळणे टाळा',
    avoidMixingSub: 'व्यावसायिक वैद्यकीय सल्ल्याशिवाय मिसळू नका।',
    stopWorsen: 'लक्षणे बिघडल्यास थांबा',
    stopWorsenSub: 'वापर बंद करा आणि त्वरित डॉक्टरांचा सल्ला घ्या।',
    checkboxLabel: 'मी अस्वीकरण, आणीबाणी इशारा आणि वापर मार्गदर्शक तत्त्वे वाचली आणि समजली आहेत।',
    agreeBtn: 'मी समजतो/समजते आणि सहमत आहे',
  },
  'od-IN': {
    welcome: 'ସ୍ୱାସ୍ଥ୍ୟ ସହାୟକକୁ ସ୍ୱାଗତ',
    welcomeSub: 'ଦୈନନ୍ଦିନ ସମସ୍ୟା ଓ ଜରୁରିକାଳୀନ ସ୍ଥିତିରେ ଦ୍ରୁତ, ବିଶ୍ୱସ୍ତ ସାହାଯ୍ୟ ପାଇଁ ଆପଣଙ୍କ ନିର୍ଭରଯୋଗ୍ୟ ସ୍ୱାସ୍ଥ୍ୟ ସାଥୀ।',
    emergencyTitle: 'ଜରୁରିକାଳୀନ ସହାୟତା',
    emergencyBody: 'ଯଦି ଆପଣ ଜୀବନ ବିପଦ ଜଙ୍କ ଆପଦ, ଶ୍ୱାସ କଷ୍ଟ ବା ଭୀଷଣ ଯନ୍ତ୍ରଣା ଅନୁଭବ କରୁଛନ୍ତି, ତୁରନ୍ତ ସାହାଯ୍ୟ ପାଇଁ ଫୋନ କରନ୍ତୁ।',
    call112: '112 କୁ ଫୋନ କରନ୍ତୁ',
    disclaimerTitle: 'ଦାୟଦ୍ୱାର ଅସ୍ୱୀକୃତି',
    disclaimerBody: 'ଏହି ଆପ ଷ୍ଟ୍ କେବଳ ସାଧାରଣ ତଥ୍ୟ ଦିଏ ଓ ବୃତ୍ତିଗତ ଚିକିତ୍ସା ପରାମର୍ଶର ବିକଳ୍ପ ନୁହେଁ। ସର୍ବଦା ଡାକ୍ତରଙ୍କ ସହ ପରାମର୍ଶ କରନ୍ତୁ।',
    guidelinesHeading: 'ବିସ୍ତୃତ ନିର୍ଦ୍ଦେଶାବଳୀ',
    specialCareTitle: 'ବିଶେଷ ଯତ୍ନ ଗୋଷ୍ଠୀ',
    specialCareSub: 'ଗର୍ଭାବସ୍ଥା, ବୃଦ୍ଧ, ଶିଶୁ',
    specialCareSubheading: 'ଡାକ୍ତରଙ୍କ ସହ ପରାମର୍ଶ ଯଦି ଆପଣ:',
    pregnant: 'ଗର୍ଭବତୀ ବା ସ୍ତନ୍ୟ ପ୍ରଦାନ କରୁଛନ୍ତି',
    infants: 'ଶିଶୁ ବା ଛୋଟ ପିଲା',
    infantsSub: 'ସେମାନଙ୍କ ଯତ୍ନ ପାଇଁ ପରାମର୍ଶ ଚାହୁଁଛନ୍ତି',
    elderly: 'ବୃଦ୍ଧ (60+ ବର୍ଷ)',
    chronic: 'ଦୀର୍ଘ ରୋଗ ଅଛି',
    chronicSub: 'ମଧୁମେହ, ରକ୍ତଚାପ, ହୃଦ ରୋଗ, ଆଜ୍ମା, ବା କିଡ଼ନୀ ସମସ୍ୟା',
    allergic: 'ଔଷଧ ପ୍ରତି ଏଲର୍ଜି ଅଛି',
    usageTitle: 'ବ୍ୟବହାର ନିର୍ଦ୍ଦେଶ',
    usageSub: 'ଡୋଜ, ଔଷଧ ମିଶ୍ରଣ',
    usageSubheading: 'ବ୍ୟବହାର ନିର୍ଦ୍ଦେଶ',
    basicGuidance: 'କେବଳ ମୂଳ ମାର୍ଗଦର୍ଶନ',
    basicGuidanceSub: 'ମାନକ ପ୍ରଥମ ସାହାଯ୍ୟ ଓ ସାଧାରଣ OTC ବ୍ୟବହାର ପାଇଁ।',
    dontExceed: 'ଡୋଜ ଅତିକ୍ରମ କରନ୍ତୁ ନାହିଁ',
    dontExceedSub: 'ନିର୍ଦ୍ଧାରିତ ସୀମା ମାନି ଚଳନ୍ତୁ।',
    avoidMixing: 'ଔଷଧ ମିଶ୍ରଣ ଏଡ଼ାନ୍ତୁ',
    avoidMixingSub: 'ବୃତ୍ତିଗତ ଚିକିତ୍ସା ପରାମର୍ଶ ବିନା ମିଶ୍ରଣ କରନ୍ତୁ ନାହିଁ।',
    stopWorsen: 'ଲକ୍ଷଣ ଖରାପ ହେଲେ ବନ୍ଦ କରନ୍ତୁ',
    stopWorsenSub: 'ବ୍ୟବହାର ବନ୍ଦ କରି ତୁରନ୍ତ ଡାକ୍ତରଙ୍କ ସହ ଯୋଗାଯୋଗ କରନ୍ତୁ।',
    checkboxLabel: 'ମୁଁ ଦାୟଦ୍ୱାର ଅସ୍ୱୀକୃତି, ଜରୁରି ସତର୍କତା ଓ ବ୍ୟବହାର ନିର୍ଦ୍ଦେଶ ପଢ଼ି ବୁଝିଛି।',
    agreeBtn: 'ମୁଁ ବୁଝିଛି ଓ ସହମତ',
  },
  'pa-IN': {
    welcome: 'ਸਵਾਸਥਯ ਸਹਾਇਕ ਵਿੱਚ ਤੁਹਾਡਾ ਸੁਆਗਤ ਹੈ',
    welcomeSub: 'ਰੋਜ਼ਾਨਾ ਦੀਆਂ ਸਮੱਸਿਆਵਾਂ ਅਤੇ ਐਮਰਜੈਂਸੀ ਵਿੱਚ ਤੇਜ਼, ਭਰੋਸੇਮੰਦ ਮਦਦ ਲਈ ਤੁਹਾਡਾ ਭਰੋਸੇਯੋਗ ਸਿਹਤ ਸਾਥੀ।',
    emergencyTitle: 'ਐਮਰਜੈਂਸੀ ਹੈਲਪਲਾਈਨ',
    emergencyBody: 'ਜੇ ਤੁਸੀਂ ਜੀਵਨ-ਖ਼ਤਰੇ ਵਾਲੀ ਐਮਰਜੈਂਸੀ, ਸਾਹ ਲੈਣ ਵਿੱਚ ਮੁਸ਼ਕਲ ਜਾਂ ਭਿਆਨਕ ਦਰਦ ਮਹਿਸੂਸ ਕਰ ਰਹੇ ਹੋ, ਤਾਂ ਤੁਰੰਤ ਮਦਦ ਲਈ ਫ਼ੋਨ ਕਰੋ।',
    call112: '112 ਤੇ ਕਾਲ ਕਰੋ',
    disclaimerTitle: 'ਡਿਸਕਲੇਮਰ',
    disclaimerBody: 'ਇਹ ਐਪ ਕੇਵਲ ਆਮ ਜਾਣਕਾਰੀ ਦਿੰਦੀ ਹੈ ਅਤੇ ਪੇਸ਼ੇਵਰ ਡਾਕਟਰੀ ਸਲਾਹ ਦਾ ਬਦਲ ਨਹੀਂ। ਹਮੇਸ਼ਾ ਡਾਕਟਰ ਨਾਲ ਸਲਾਹ ਕਰੋ।',
    guidelinesHeading: 'ਵਿਸਤ੍ਰਿਤ ਦਿਸ਼ਾ-ਨਿਰਦੇਸ਼',
    specialCareTitle: 'ਵਿਸ਼ੇਸ਼ ਦੇਖਭਾਲ ਗਰੁੱਪ',
    specialCareSub: 'ਗਰਭ, ਬਜ਼ੁਰਗ, ਬੱਚੇ',
    specialCareSubheading: 'ਡਾਕਟਰ ਨਾਲ ਸਲਾਹ ਕਰੋ ਜੇ ਤੁਸੀਂ:',
    pregnant: 'ਗਰਭਵਤੀ ਜਾਂ ਦੁੱਧ ਚੁੰਘਾ ਰਹੇ ਹੋ',
    infants: 'ਨਵਜੰਮੇ ਜਾਂ ਛੋਟੇ ਬੱਚੇ',
    infantsSub: 'ਉਨ੍ਹਾਂ ਦੀ ਦੇਖਭਾਲ ਲਈ ਸਲਾਹ ਚਾਹੁੰਦੇ ਹੋ',
    elderly: 'ਬਜ਼ੁਰਗ (60+ ਸਾਲ)',
    chronic: 'ਪੁਰਾਣੀਆਂ ਬਿਮਾਰੀਆਂ ਹਨ',
    chronicSub: 'ਸ਼ੂਗਰ, ਬੀਪੀ, ਦਿਲ ਦੀ ਬਿਮਾਰੀ, ਦਮਾ, ਜਾਂ ਗੁਰਦੇ ਦੀ ਸਮੱਸਿਆ',
    allergic: 'ਦਵਾਈਆਂ ਤੋਂ ਐਲਰਜੀ ਹੈ',
    usageTitle: 'ਵਰਤੋਂ ਸੰਬੰਧੀ ਦਿਸ਼ਾ-ਨਿਰਦੇਸ਼',
    usageSub: 'ਖੁਰਾਕ, ਦਵਾਈਆਂ ਮਿਲਾਉਣਾ',
    usageSubheading: 'ਵਰਤੋਂ ਸੰਬੰਧੀ ਦਿਸ਼ਾ-ਨਿਰਦੇਸ਼',
    basicGuidance: 'ਕੇਵਲ ਬੁਨਿਆਦੀ ਮਾਰਗਦਰਸ਼ਨ',
    basicGuidanceSub: 'ਮਿਆਰੀ ਪਹਿਲੀ ਸਹਾਇਤਾ ਅਤੇ ਆਮ OTC ਵਰਤੋਂ ਲਈ।',
    dontExceed: 'ਖੁਰਾਕ ਵੱਧ ਨਾ ਲਓ',
    dontExceedSub: 'ਸਿਫ਼ਾਰਸ਼ ਕੀਤੀਆਂ ਸੀਮਾਵਾਂ ਧਿਆਨ ਨਾਲ ਮੰਨੋ।',
    avoidMixing: 'ਦਵਾਈਆਂ ਮਿਲਾਉਣ ਤੋਂ ਬਚੋ',
    avoidMixingSub: 'ਪੇਸ਼ੇਵਰ ਡਾਕਟਰੀ ਸਲਾਹ ਤੋਂ ਬਿਨਾਂ ਨਾ ਮਿਲਾਓ।',
    stopWorsen: 'ਲੱਛਣ ਵਿਗੜਨ ਤੇ ਰੋਕੋ',
    stopWorsenSub: 'ਵਰਤੋਂ ਬੰਦ ਕਰੋ ਅਤੇ ਤੁਰੰਤ ਡਾਕਟਰ ਨਾਲ ਸੰਪਰਕ ਕਰੋ।',
    checkboxLabel: 'ਮੈਂ ਡਿਸਕਲੇਮਰ, ਐਮਰਜੈਂਸੀ ਚੇਤਾਵਨੀ, ਅਤੇ ਵਰਤੋਂ ਸੰਬੰਧੀ ਦਿਸ਼ਾ-ਨਿਰਦੇਸ਼ ਪੜ੍ਹ ਅਤੇ ਸਮਝ ਲਏ ਹਨ।',
    agreeBtn: 'ਮੈਂ ਸਮਝਦਾ/ਸਮਝਦੀ ਹਾਂ ਅਤੇ ਸਹਿਮਤ ਹਾਂ',
  },
  'ta-IN': {
    welcome: 'சுவாஸ்த்ய சகாயக்கில் உங்களை வரவேற்கிறோம்',
    welcomeSub: 'அன்றாட கவலைகள் மற்றும் அவசரநிலைகளில் விரைவான, நம்பகமான உதவிக்கான உங்கள் நம்பகத்தகு சுகாதார தோழர்.',
    emergencyTitle: 'அவசர உதவி எண்',
    emergencyBody: 'உயிருக்கு அபாயகரமான அவசரநிலை, மூச்சுத்திணறல் அல்லது கடுமையான வலியை உணர்ந்தால், உடனே உதவிக்கு அழையுங்கள்.',
    call112: '112 அழையுங்கள்',
    disclaimerTitle: 'மறுப்பு',
    disclaimerBody: 'இந்த ஆப்ஸ் பொதுவான தகவல்களை மட்டும் வழங்குகிறது மற்றும் தொழில்முறை மருத்துவ ஆலோசனைக்கு மாற்றாகாது. எப்போதும் மருத்துவரை அணுகவும்.',
    guidelinesHeading: 'விரிவான வழிகாட்டுதல்கள்',
    specialCareTitle: 'சிறப்பு கவனிப்பு குழுக்கள்',
    specialCareSub: 'கர்ப்பம், முதியோர், குழந்தைகள்',
    specialCareSubheading: 'மருத்துவரை அணுகவும் நீங்கள்:',
    pregnant: 'கர்ப்பிணி அல்லது தாய்ப்பால் கொடுப்பவர்',
    infants: 'குழந்தைகள் அல்லது சிறு குழந்தைகள்',
    infantsSub: 'அவர்களின் பராமரிப்புக்கு ஆலோசனை தேடுகிறீர்கள்',
    elderly: 'முதியோர் (60+ வயது)',
    chronic: 'நாள்பட்ட நோய்கள் உள்ளன',
    chronicSub: 'நீரிழிவு, ரத்த அழுத்தம், இதய நோய், ஆஸ்துமா, அல்லது சிறுநீரக பிரச்சினை',
    allergic: 'மருந்துகளில் ஒவ்வாமை உள்ளது',
    usageTitle: 'பயன்பாட்டு வழிகாட்டுதல்கள்',
    usageSub: 'அளவு, மருந்து கலத்தல்',
    usageSubheading: 'பயன்பாட்டு வழிகாட்டுதல்கள்',
    basicGuidance: 'அடிப்படை வழிகாட்டுதல் மட்டும்',
    basicGuidanceSub: 'நிலையான முதலுதவி மற்றும் பொதுவான OTC பயன்பாட்டிற்காக.',
    dontExceed: 'அளவை மீறாதீர்கள்',
    dontExceedSub: 'பரிந்துரைக்கப்பட்ட வரம்புகளை கவனமாக பின்பற்றவும்.',
    avoidMixing: 'மருந்துகளை கலப்பதை தவிர்க்கவும்',
    avoidMixingSub: 'தொழில்முறை மருத்துவ ஆலோசனை இல்லாமல் கலக்காதீர்கள்.',
    stopWorsen: 'அறிகுறிகள் மோசமாகினால் நிறுத்தவும்',
    stopWorsenSub: 'பயன்பாட்டை நிறுத்தி உடனே மருத்துவரை அணுகவும்.',
    checkboxLabel: 'நான் மறுப்பு, அவசர எச்சரிக்கை மற்றும் பயன்பாட்டு வழிகாட்டுதல்களை படித்து புரிந்துகொண்டேன்.',
    agreeBtn: 'நான் புரிந்துகொண்டேன் & சம்மதிக்கிறேன்',
  },
  'te-IN': {
    welcome: 'స్వాస్థ్య సహాయక్‌కు స్వాగతం',
    welcomeSub: 'రోజువారీ సమస్యలు మరియు అత్యవసర పరిస్థితులలో వేగంగా, నమ్మకంగా సహాయం చేసే మీ ఆరోగ్య సహచరుడు.',
    emergencyTitle: 'అత్యవసర సహాయవాహిని',
    emergencyBody: 'మీరు జీవన-ప్రమాదకర అత్యవసరం, శ్వాస తీసుకోవడంలో ఇబ్బంది లేదా తీవ్రమైన నొప్పి అనుభవిస్తున్నట్లయితే వెంటనే సహాయం కోసం కాల్ చేయండి.',
    call112: '112కి కాల్ చేయండి',
    disclaimerTitle: 'నిరాకరణ',
    disclaimerBody: 'ఈ యాప్ సాధారణ సమాచారాన్ని మాత్రమే అందిస్తుంది మరియు ప్రొఫెషనల్ వైద్య సలహాకు ప్రత్యామ్నాయం కాదు. ఎల్లప్పుడూ వైద్యుడిని సంప్రదించండి.',
    guidelinesHeading: 'వివరణాత్మక మార్గదర్శకాలు',
    specialCareTitle: 'ప్రత్యేక శ్రద్ధ అవసరమైన వర్గాలు',
    specialCareSub: 'గర్భావస్థ, వృద్ధులు, పిల్లలు',
    specialCareSubheading: 'వైద్యుడిని సంప్రదించండి మీరు:',
    pregnant: 'గర్భవతి లేదా స్తన్యం ఇస్తున్నారు',
    infants: 'శిశువులు లేదా చిన్న పిల్లలు',
    infantsSub: 'వారి సంరక్షణకు సలహా కోరుతున్నారు',
    elderly: 'వృద్ధులు (60+ సంవత్సరాలు)',
    chronic: 'దీర్ఘకాలిక వ్యాధులు ఉన్నాయి',
    chronicSub: 'మధుమేహం, రక్తపోటు, గుండె జబ్బు, ఆస్తమా, లేదా మూత్రపిండ సమస్యలు',
    allergic: 'మందులకు అలెర్జీ ఉంది',
    usageTitle: 'వినియోగ మార్గదర్శకాలు',
    usageSub: 'మోతాదు, మందుల మిశ్రమం',
    usageSubheading: 'వినియోగ మార్గదర్శకాలు',
    basicGuidance: 'ప్రాథమిక మార్గదర్శనం మాత్రమే',
    basicGuidanceSub: 'ప్రామాణిక ప్రథమ చికిత్స మరియు సాధారణ OTC వినియోగానికి.',
    dontExceed: 'మోతాదు మించవద్దు',
    dontExceedSub: 'సిఫార్సు చేసిన పరిమితులను జాగ్రత్తగా పాటించండి.',
    avoidMixing: 'మందులు కలపడం మానుకోండి',
    avoidMixingSub: 'ప్రొఫెషనల్ వైద్య సలహా లేకుండా కలపవద్దు.',
    stopWorsen: 'లక్షణాలు తీవ్రమైతే ఆపుకోండి',
    stopWorsenSub: 'వినియోగం ఆపి వెంటనే వైద్యుడిని సంప్రదించండి.',
    checkboxLabel: 'నేను నిరాకరణ, అత్యవసర హెచ్చరిక మరియు వినియోగ మార్గదర్శకాలను చదివి అర్థం చేసుకున్నాను.',
    agreeBtn: 'నాకు అర్థమైంది & అంగీకరిస్తున్నాను',
  },
};

// Fall back to English for any unrecognised language code
const getT = (code: string): LangStrings => T[code] ?? T['en-IN'];

interface ImportantInformationProps {
  onContinue: () => void;
}

export default function ImportantInformation({ onContinue }: ImportantInformationProps) {
  const [currentLang, setCurrentLang] = useState<string>(
    () => localStorage.getItem('landing_display_lang')
      || 'en-IN',
  );
  const t = getT(currentLang);

  const [expandedSections, setExpandedSections] = useState<{
    specialCare: boolean;
    usage: boolean;
  }>({
    specialCare: false,
    usage: false,
  });
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const toggleSection = (section: 'specialCare' | 'usage') => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleAgree = () => {
    if (agreedToTerms) {
      onContinue();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto bg-white min-h-screen">
        {/* Top blue bar */}
        <div className="h-1 bg-gradient-to-r from-cyan-500 to-blue-500"></div>

        <Navbar
          variant="white"
          showInlineDropdown
          selectedLanguage={LANGUAGES[currentLang] ?? 'English'}
          onSelectLanguage={(code) => {
            setCurrentLang(code);
            localStorage.setItem('landing_display_lang', code);
          }}
        />

        <div className="px-4 pb-32">
          <div className="relative mt-4 mb-36">
            <div className="bg-gradient-to-br from-cyan-50 via-blue-50 to-cyan-100 rounded-3xl overflow-hidden p-4">
              <img
                src="/image.png"
                alt="Doctor"
                className="w-full h-auto block"
                style={{ imageRendering: '-webkit-optimize-contrast', maxWidth: '100%' }}
              />
            </div>
            
            {/* Welcome Message overlapping the doctor image */}
            <div className="absolute -bottom-32 left-3 right-3">
              <div className="bg-white rounded-3xl px-6 py-10 shadow-xl">
                <div className="flex gap-4 items-start">
                  <div className="flex-1 pt-1">
                    <h2 className="text-cyan-600 text-xl font-bold mb-3">{t.welcome}</h2>
                    <p className="text-gray-600 text-sm leading-relaxed">
                      {t.welcomeSub}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-red-400 to-red-500 rounded-3xl p-6 mb-6 shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <img src="/Container.png" alt="Emergency" className="w-12 h-12" />
              <h2 className="text-white text-xl font-bold">{t.emergencyTitle}</h2>
            </div>
            <p className="text-white text-sm mb-5 leading-relaxed">
              {t.emergencyBody}
            </p>
            <button className="w-full bg-white rounded-full py-3.5 px-6 flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors shadow-md">
              <Phone size={18} className="text-red-500" />
              <span className="text-red-500 font-bold text-base">{t.call112}</span>
            </button>
          </div>

          {/* Disclaimer */}
          <div className="bg-white rounded-3xl px-6 py-8 shadow-lg mb-6">
            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-cyan-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-2xl font-bold">i</span>
                </div>
              </div>
              <div className="flex-1 pt-1">
                <h2 className="text-cyan-600 text-lg font-bold mb-2">{t.disclaimerTitle}</h2>
                <p className="text-gray-600 text-sm leading-relaxed">
                  {t.disclaimerBody}
                </p>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-gray-500 text-xs font-bold tracking-wider mb-4 uppercase">
              {t.guidelinesHeading}
            </h3>

            <div className="bg-white border border-gray-200 rounded-2xl mb-4 shadow-sm overflow-hidden">
              <button
                onClick={() => toggleSection('specialCare')}
                className="w-full px-6 py-5 flex items-center gap-4 hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <h4 className="font-semibold text-gray-800 text-base">{t.specialCareTitle}</h4>
                  <p className="text-gray-500 text-sm">{t.specialCareSub}</p>
                </div>
                <div className="text-gray-400">
                  {expandedSections.specialCare ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </button>

              {expandedSections.specialCare && (
                <div className="px-6 pb-6 border-t border-gray-100">
                  <div className="pt-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </div>
                      <h5 className="font-semibold text-gray-800 text-sm">{t.specialCareSubheading}</h5>
                    </div>

                    <div className="space-y-4">
                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-800 font-medium text-sm">{t.pregnant}</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-800 font-medium text-sm">{t.infants}</p>
                          <p className="text-gray-500 text-xs mt-1">{t.infantsSub}</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-800 font-medium text-sm">{t.elderly}</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-800 font-medium text-sm">{t.chronic}</p>
                          <p className="text-gray-500 text-xs mt-1">{t.chronicSub}</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-800 font-medium text-sm">{t.allergic}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <button
                onClick={() => toggleSection('usage')}
                className="w-full px-6 py-5 flex items-center gap-4 hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 bg-cyan-50 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <h4 className="font-semibold text-gray-800 text-base">{t.usageTitle}</h4>
                  <p className="text-gray-500 text-sm">{t.usageSub}</p>
                </div>
                <div className="text-gray-400">
                  {expandedSections.usage ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </button>

              {expandedSections.usage && (
                <div className="px-6 pb-6 border-t border-gray-100">
                  <div className="pt-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 bg-cyan-50 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <h5 className="font-semibold text-gray-800 text-sm">{t.usageSubheading}</h5>
                    </div>

                    <div className="space-y-4">
                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-cyan-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-800 font-medium text-sm">{t.basicGuidance}</p>
                          <p className="text-gray-500 text-xs mt-1">{t.basicGuidanceSub}</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-cyan-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-800 font-medium text-sm">{t.dontExceed}</p>
                          <p className="text-gray-500 text-xs mt-1">{t.dontExceedSub}</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-cyan-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-800 font-medium text-sm">{t.avoidMixing}</p>
                          <p className="text-gray-500 text-xs mt-1">{t.avoidMixingSub}</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-cyan-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-800 font-medium text-sm">{t.stopWorsen}</p>
                          <p className="text-gray-500 text-xs mt-1">{t.stopWorsenSub}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 shadow-lg">
          <div className="max-w-2xl mx-auto">
            <label className="flex items-start gap-3 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-1 w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-sm text-gray-700">
                {t.checkboxLabel}
              </span>
            </label>
            <button
              onClick={handleAgree}
              disabled={!agreedToTerms}
              className={`w-full rounded-full py-4 font-semibold text-white text-base transition-all ${
                agreedToTerms
                  ? 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/30'
                  : 'bg-gray-300 cursor-not-allowed'
              }`}
            >
              {t.agreeBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
