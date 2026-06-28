"use client";

import FlowFieldBackground from "@/components/ui/flow-field-background";

interface LandingBackgroundProps {
  children: React.ReactNode;
}

export function LandingBackground({ children }: LandingBackgroundProps) {
  return (
    <div className="relative min-h-screen">
      {/* Fixed background layer */}
      <div className="fixed inset-0 -z-10">
        <FlowFieldBackground
          color="#3b82f6"
          trailOpacity={0.1}
          particleCount={100}
          speed={0.4}
          className="bg-gradient-to-br from-gray-950 via-gray-900 to-blue-950"
        />
        {/* Gradient overlay for better content readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-gray-900/50 to-gray-900/80 pointer-events-none" />
      </div>
      {/* Content layer */}
      <div className="relative z-0">
        {children}
      </div>
    </div>
  );
}
