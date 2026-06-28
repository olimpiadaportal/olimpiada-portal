'use client';

import Image from 'next/image';
import { useAppSettings } from '@/hooks/useAppSettings';

interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function AppLogo({ size = 'md', className = '' }: AppLogoProps) {
  const { appName, loading } = useAppSettings();

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };

  const pixelSizes = { sm: 32, md: 40, lg: 48 };

  if (loading && !appName) {
    return (
      <div className={`${sizeClasses[size]} ${className} bg-gray-200 rounded-lg animate-pulse`} />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} ${className} rounded-lg overflow-hidden flex-shrink-0 shadow-md transition-opacity duration-200 ${loading ? 'opacity-50' : 'opacity-100'}`}
      title={appName}
    >
      <Image
        src="/icon.png"
        alt={appName}
        width={pixelSizes[size]}
        height={pixelSizes[size]}
        className="w-full h-full object-cover"
      />
    </div>
  );
}
