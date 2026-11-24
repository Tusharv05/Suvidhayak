import { Stethoscope } from 'lucide-react';

export default function SplashScreen() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 sm:px-6">
      <div className="flex flex-col items-center">
        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-blue-600 rounded-full flex items-center justify-center mb-6 sm:mb-8">
          <Stethoscope className="w-10 h-10 sm:w-12 sm:h-12 text-white" strokeWidth={2.5} />
        </div>

        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-blue-600 mb-3 sm:mb-4 text-center">
          Swasthya Sahayak
        </h1>

        <p className="text-base sm:text-lg text-gray-600 mb-1.5 sm:mb-2 text-center">
          Your First Aid Assistant
        </p>
        <p className="text-sm sm:text-base text-gray-500 text-center">
          Quick help for common sickness.
        </p>

        <p className="text-gray-400 mt-8 sm:mt-12 text-sm sm:text-base">Loading</p>
      </div>
    </div>
  );
}
