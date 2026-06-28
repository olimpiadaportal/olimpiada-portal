'use client'

import React, { useState } from 'react'

interface ContextFlipCardProps {
  contextText: string
  contextImageUrl?: string
  labelText?: string
  tapToSeeImageText?: string
  tapToSeeTextText?: string
}

export function ContextFlipCard({
  contextText,
  contextImageUrl,
  labelText = '📝 Situasiya',
  tapToSeeImageText = 'Şəkli görmək üçün klikləyin',
  tapToSeeTextText = 'Mətni görmək üçün klikləyin',
}: ContextFlipCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  const hasImage = !!contextImageUrl

  return (
    <div
      className={`mb-4 ${hasImage ? 'cursor-pointer select-none' : ''}`}
      style={{ perspective: '1200px' }}
      onClick={() => hasImage && setIsFlipped(prev => !prev)}
    >
      <div
        style={{
          position: 'relative',
          transformStyle: 'preserve-3d',
          transition: 'transform 0.35s ease',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          minHeight: '80px',
        }}
      >
        {/* Front — context text */}
        <div
          style={{ backfaceVisibility: 'hidden' }}
          className="p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg"
        >
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">
            {labelText}
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
            {contextText}
          </p>
          {hasImage && (
            <p className="text-xs text-blue-500 dark:text-blue-400 mt-2 italic">
              🖼 {tapToSeeImageText}
            </p>
          )}
        </div>

        {/* Back — context image */}
        {hasImage && (
          <div
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              position: 'absolute',
              inset: 0,
            }}
            className="p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg flex flex-col items-center justify-center"
          >
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-3 self-start">
              {labelText}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={contextImageUrl}
              alt="Context figure"
              className="max-w-full max-h-80 object-contain rounded"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
            <p className="text-xs text-blue-500 dark:text-blue-400 mt-2 italic self-start">
              🔤 {tapToSeeTextText}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
