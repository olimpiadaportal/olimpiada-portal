'use client';

import { ReactNode } from 'react';

interface SettingCardProps {
  title: string;
  description: string;
  children: ReactNode;
  variant?: 'default' | 'warning' | 'info';
}

export default function SettingCard({ 
  title, 
  description, 
  children, 
  variant = 'default' 
}: SettingCardProps) {
  const borderColor = {
    default: 'border-gray-200',
    warning: 'border-yellow-200',
    info: 'border-blue-200',
  }[variant];

  const bgColor = {
    default: 'bg-white',
    warning: 'bg-yellow-50',
    info: 'bg-blue-50',
  }[variant];

  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg p-6`}>
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-600 mt-1">{description}</p>
      </div>
      {children}
    </div>
  );
}
