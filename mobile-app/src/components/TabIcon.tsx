// Custom inline-SVG tab icons (mirrors the web's stroke-icon language — no
// icon fonts, no external assets).
import React from "react";
import type { ColorValue } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

export type TabIconName =
  | "home"
  | "chart"
  | "medal"
  | "card"
  | "news"
  | "arena"
  | "test"
  | "rank";

export function TabIcon({
  name,
  color,
  size = 22,
}: {
  name: TabIconName;
  color: ColorValue;
  size?: number;
}) {
  const s = { stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" as const };
  switch (name) {
    case "home":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" {...s} />
        </Svg>
      );
    case "chart":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 20V10M10 20V4M16 20v-7M21 20H3" {...s} />
        </Svg>
      );
    case "medal":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={12} cy={9} r={5} {...s} />
          <Path d="m8.5 13.5-2 7L12 18l5.5 2.5-2-7" {...s} />
        </Svg>
      );
    case "card":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x={3} y={5} width={18} height={14} rx={3} {...s} />
          <Path d="M3 10h18" {...s} />
        </Svg>
      );
    case "news":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x={4} y={4} width={16} height={16} rx={2} {...s} />
          <Path d="M8 9h8M8 13h8M8 17h5" {...s} />
        </Svg>
      );
    case "arena":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="m13 2-8 12h6l-2 8 8-12h-6l2-8z" {...s} />
        </Svg>
      );
    case "test":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x={5} y={3} width={14} height={18} rx={2} {...s} />
          <Path d="M9 8h6M9 12h6M9 16h3" {...s} />
        </Svg>
      );
    case "rank":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M8 21V10m8 11v-5M4 21h16M12 3l1.7 3.4 3.8.6-2.7 2.7.6 3.8L12 11.7l-3.4 1.8.6-3.8L6.5 7l3.8-.6L12 3z" {...s} />
        </Svg>
      );
    default:
      return null;
  }
}
