// Hand-rolled react-native-svg ports of the web dashboard charts
// (web-app/src/components/AnalyticsDashboard.tsx WeeklyBars / TrendLine):
// same geometry and visual rules, colors resolved from the theme tokens
// instead of CSS variables. Both scale to the container width via a fixed
// viewBox inside an aspect-ratio wrapper.
import React from "react";
import { View } from "react-native";
import Svg, { Circle, Line, Path, Polygon, Polyline, Text as SvgText } from "react-native-svg";
import { useTheme } from "@/theme/ThemeProvider";

const W = 340;
const H = 180;

function ChartFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ width: "100%", aspectRatio: W / H }}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        {children}
      </Svg>
    </View>
  );
}

/**
 * Weekly practice: 7 labeled bars, rounded data-end, hairline gridlines,
 * muted axis text, value label on the peak bar only.
 */
export function WeeklyBars({
  values,
  days,
  ariaLabel,
}: {
  values: number[];
  days: string[];
  ariaLabel: string;
}) {
  const { tokens } = useTheme();
  const padL = 30;
  const padR = 10;
  const padT = 20;
  const padB = 28;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const baseY = padT + ih;
  const max = Math.max(...values, 1);
  const nice = Math.max(4, Math.ceil(max / 2) * 2);
  const slot = iw / Math.max(values.length, 1);
  const bw = Math.min(24, slot * 0.55);
  const peak = values.indexOf(max);
  const ticks = [0, nice / 2, nice];

  return (
    <ChartFrame label={ariaLabel}>
      {ticks.map((tv) => {
        const y = baseY - (tv / nice) * ih;
        return (
          <React.Fragment key={tv}>
            <Line x1={padL} x2={W - padR} y1={y} y2={y} stroke={tokens.border} strokeWidth={1} />
            <SvgText x={padL - 6} y={y + 3.5} textAnchor="end" fontSize={10} fill={tokens.muted}>
              {String(tv)}
            </SvgText>
          </React.Fragment>
        );
      })}
      {values.map((v, i) => {
        const h = (v / nice) * ih;
        const x = padL + slot * i + (slot - bw) / 2;
        const y = baseY - h;
        const r = Math.min(4, h);
        const d = `M ${x} ${baseY} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + bw - r} ${y} Q ${x + bw} ${y} ${x + bw} ${y + r} L ${x + bw} ${baseY} Z`;
        return (
          <React.Fragment key={i}>
            <Path d={d} fill={tokens.accent} />
            {i === peak && v > 0 ? (
              <SvgText
                x={x + bw / 2}
                y={y - 5}
                textAnchor="middle"
                fontSize={11}
                fontWeight="700"
                fill={tokens.text}
              >
                {String(v)}
              </SvgText>
            ) : null}
            <SvgText
              x={padL + slot * i + slot / 2}
              y={H - 8}
              textAnchor="middle"
              fontSize={10}
              fill={tokens.muted}
            >
              {days[i] ?? ""}
            </SvgText>
          </React.Fragment>
        );
      })}
    </ChartFrame>
  );
}

/**
 * Accuracy trend: single 2px line (secondary accent) + soft area wash,
 * surface-ringed dots, endpoint direct label, sparse x labels. Degrades to a
 * single centered dot when only one day has data. Values are clamped 0..100.
 */
export function TrendLine({
  points,
  ariaLabel,
}: {
  points: { label: string; value: number }[];
  ariaLabel: string;
}) {
  const { tokens } = useTheme();
  const padL = 34;
  const padR = 26;
  const padT = 16;
  const padB = 28;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const baseY = padT + ih;
  const n = points.length;
  if (n === 0) return null;
  const xAt = (i: number) => (n === 1 ? padL + iw / 2 : padL + (iw * i) / (n - 1));
  const pts = points.map(
    (p, i) => [xAt(i), baseY - (Math.min(100, Math.max(0, p.value)) / 100) * ih] as const,
  );
  const line = pts.map((p) => `${p[0]},${p[1]}`).join(" ");
  const area = `${pts[0][0]},${baseY} ${line} ${pts[n - 1][0]},${baseY}`;
  const stroke = tokens.accent2;
  const last = pts[n - 1];
  const step = Math.max(1, Math.ceil(n / 6));
  const showLabel = (i: number) => i === n - 1 || (i % step === 0 && n - 1 - i >= step / 2);

  return (
    <ChartFrame label={ariaLabel}>
      {[0, 25, 50, 75, 100].map((tv) => {
        const y = baseY - (tv / 100) * ih;
        return (
          <React.Fragment key={tv}>
            <Line x1={padL} x2={W - padR} y1={y} y2={y} stroke={tokens.border} strokeWidth={1} />
            {tv % 50 === 0 ? (
              <SvgText x={padL - 6} y={y + 3.5} textAnchor="end" fontSize={10} fill={tokens.muted}>
                {String(tv)}
              </SvgText>
            ) : null}
          </React.Fragment>
        );
      })}
      {n > 1 ? (
        <>
          <Polygon points={area} fill={stroke} opacity={0.08} />
          <Polyline
            points={line}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      ) : null}
      {pts.map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={4} fill={stroke} stroke={tokens.surface} strokeWidth={2} />
      ))}
      <SvgText
        x={last[0]}
        y={Math.max(11, last[1] - 10)}
        textAnchor="middle"
        fontSize={11}
        fontWeight="700"
        fill={tokens.text}
      >
        {`${Math.round(points[n - 1].value)}%`}
      </SvgText>
      {pts.map(([x], i) =>
        showLabel(i) ? (
          <SvgText key={`l${i}`} x={x} y={H - 8} textAnchor="middle" fontSize={10} fill={tokens.muted}>
            {points[i].label}
          </SvgText>
        ) : null,
      )}
    </ChartFrame>
  );
}
