import { Phone, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface ImportantInformationProps {
  onContinue: () => void;
}

export default function ImportantInformation({ onContinue }: ImportantInformationProps) {
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
        
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4 z-10">
          <h1 className="text-lg font-semibold text-gray-800">Medical Information</h1>
        </div>

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
                    <h2 className="text-cyan-600 text-xl font-bold mb-3">Welcome to Swasthya Sahayak</h2>
                    <p className="text-gray-600 text-sm leading-relaxed">
                      Your trusted health companion for quick, reliable help in everyday concerns and emergencies.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-red-400 to-red-500 rounded-3xl p-6 mb-6 shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <img src="/Container.png" alt="Emergency" className="w-12 h-12" />
              <h2 className="text-white text-xl font-bold">Emergency helpline</h2>
            </div>
            <p className="text-white text-sm mb-5 leading-relaxed">
              If you are experiencing a life-threatening emergency, shortness of breath, or severe pain, call for help immediately.
            </p>
            <button className="w-full bg-white rounded-full py-3.5 px-6 flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors shadow-md">
              <Phone size={18} className="text-red-500" />
              <span className="text-red-500 font-bold text-base">Call 112</span>
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
                <h2 className="text-cyan-600 text-lg font-bold mb-2">Disclaimer</h2>
                <p className="text-gray-600 text-sm leading-relaxed">
                  This app provides general info only and is not a substitute for professional medical advice. Always consult a doctor.
                </p>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-gray-500 text-xs font-bold tracking-wider mb-4 uppercase">
              Detailed Guidelines
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
                  <h4 className="font-semibold text-gray-800 text-base">Special Care Groups</h4>
                  <p className="text-gray-500 text-sm">Pregnancy, Elderly, Children</p>
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
                      <h5 className="font-semibold text-gray-800 text-sm">Consult a doctor if you are:</h5>
                    </div>

                    <div className="space-y-4">
                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-800 font-medium text-sm">Pregnant or breastfeeding</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-800 font-medium text-sm">Infants or young children</p>
                          <p className="text-gray-500 text-xs mt-1">Seeking advice for their care</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-800 font-medium text-sm">Elderly (60+ years)</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-800 font-medium text-sm">Having chronic illnesses</p>
                          <p className="text-gray-500 text-xs mt-1">Diabetes, BP, heart disease, asthma, or kidney problems</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-800 font-medium text-sm">Allergic to medicines</p>
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
                  <h4 className="font-semibold text-gray-800 text-base">Usage Guidelines</h4>
                  <p className="text-gray-500 text-sm">Dosage, Mixing Meds</p>
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
                      <h5 className="font-semibold text-gray-800 text-sm">Usage Guidelines</h5>
                    </div>

                    <div className="space-y-4">
                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-cyan-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-800 font-medium text-sm">Basic guidance only</p>
                          <p className="text-gray-500 text-xs mt-1">Meant for standard first-aid and common OTC usage.</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-cyan-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-800 font-medium text-sm">Do not exceed dosage</p>
                          <p className="text-gray-500 text-xs mt-1">Follow recommended limits carefully.</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-cyan-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-800 font-medium text-sm">Avoid mixing medicines</p>
                          <p className="text-gray-500 text-xs mt-1">Do not mix without professional medical advice.</p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-cyan-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-800 font-medium text-sm">Stop if symptoms worsen</p>
                          <p className="text-gray-500 text-xs mt-1">Discontinue use and consult a doctor immediately.</p>
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
                I have read and understand the disclaimer, emergency warning, and usage guidelines.
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
              I Understand & Agree
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
