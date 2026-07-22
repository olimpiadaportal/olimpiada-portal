// react-native-svg ports of the web About page artwork
// (web-app/src/components/AboutVisuals.tsx): same viewBoxes, same geometry,
// with the CSS custom properties resolved from the theme tokens so light and
// dark behave exactly as they do on the web. Each drawing scales to a caller
// given height through a fixed viewBox inside an aspect-ratio wrapper, the way
// features/analytics/charts.tsx does.
//
// The artwork is decorative — the copy beside it carries the meaning — so it
// is hidden from TalkBack/VoiceOver, mirroring the web's aria-hidden. Each art
// is memoized because all five story drawings stay mounted inside the About
// carousel and would otherwise redraw on every swipe.
import React, { memo } from "react";
import { Platform, View } from "react-native";
import Svg, {
  Circle,
  Ellipse,
  G,
  Line,
  Path,
  Polyline,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import { useTheme } from "@/theme/ThemeProvider";

export type AboutArtProps = {
  /** Rendered height in dp; the width follows the drawing's aspect ratio. */
  height: number;
};

export type AboutArtComponent = React.ComponentType<AboutArtProps>;

/** Numeric accents inside the artwork use the platform monospace, like AppText. */
const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

function ArtFrame({
  w,
  h,
  height,
  children,
}: {
  w: number;
  h: number;
  height: number;
  children: React.ReactNode;
}) {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height, aspectRatio: w / h, maxWidth: "100%", alignSelf: "center" }}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`}>
        {children}
      </Svg>
    </View>
  );
}

/* ---------- Hero: student + rising chart + medal ---------- */
export const AboutHeroArt: AboutArtComponent = memo(function AboutHeroArt({
  height,
}: AboutArtProps) {
  const { tokens } = useTheme();
  return (
    <ArtFrame w={480} h={360} height={height}>
      <Ellipse cx={240} cy={190} rx={215} ry={148} fill={tokens.chipBg} />
      {/* board with bars + trend */}
      <Rect
        x={120}
        y={70}
        width={250}
        height={170}
        rx={16}
        fill={tokens.surface}
        stroke={tokens.border}
        strokeWidth={2}
      />
      <Rect x={150} y={92} width={120} height={12} rx={6} fill={tokens.chipBg} />
      <Rect x={150} y={170} width={28} height={46} rx={6} fill={tokens.accent} opacity={0.35} />
      <Rect x={192} y={146} width={28} height={70} rx={6} fill={tokens.accent} opacity={0.6} />
      <Rect x={234} y={118} width={28} height={98} rx={6} fill={tokens.accent} />
      <Polyline
        points="286,196 306,168 330,178 352,140"
        fill="none"
        stroke={tokens.accent2}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={352} cy={140} r={7} fill={tokens.accent2} />
      {/* medal */}
      <Path d="M386 92l14 26 8-4-12-26z" fill={tokens.accent} />
      <Path d="M422 88l-14 26-8-4 12-26z" fill={tokens.accent} opacity={0.6} />
      <Circle cx={404} cy={126} r={30} fill={tokens.accent2} />
      <Circle cx={404} cy={126} r={18} fill={tokens.surface} />
      <Path
        d="M404 116l3.4 7 7.6 1.1-5.5 5.3 1.3 7.6-6.8-3.6-6.8 3.6 1.3-7.6-5.5-5.3 7.6-1.1z"
        fill={tokens.accent2}
      />
      {/* student figure */}
      <Circle cx={84} cy={212} r={20} fill={tokens.accent} />
      <Rect x={60} y={238} width={48} height={62} rx={20} fill={tokens.accent2} />
      {/* sparkles */}
      <Path d="M70 96l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill={tokens.accent} opacity={0.7} />
      <Path d="M356 268l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill={tokens.accent2} opacity={0.8} />
    </ArtFrame>
  );
});

/* ---------- Block 1: student studying (book, bulb, pencil) ---------- */
export const StudyArt: AboutArtComponent = memo(function StudyArt({ height }: AboutArtProps) {
  const { tokens } = useTheme();
  return (
    <ArtFrame w={420} h={300} height={height}>
      <Ellipse cx={210} cy={165} rx={185} ry={118} fill={tokens.chipBg} />
      {/* desk */}
      <Rect
        x={76}
        y={228}
        width={268}
        height={12}
        rx={6}
        fill={tokens.surface}
        stroke={tokens.border}
        strokeWidth={2}
      />
      {/* student */}
      <Circle cx={210} cy={120} r={22} fill={tokens.accent} />
      <Rect x={172} y={148} width={76} height={52} rx={24} fill={tokens.accent2} />
      {/* open book */}
      <Path
        d="M126 196Q168 182 210 194L210 230Q168 218 126 230Z"
        fill={tokens.surface}
        stroke={tokens.border}
        strokeWidth={2}
      />
      <Path
        d="M294 196Q252 182 210 194L210 230Q252 218 294 230Z"
        fill={tokens.surface}
        stroke={tokens.border}
        strokeWidth={2}
      />
      <Path
        d="M142 203q26-7 52-2M142 213q26-7 52-2"
        fill="none"
        stroke={tokens.accent}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.45}
      />
      <Path
        d="M278 203q-26-7-52-2M278 213q-26-7-52-2"
        fill="none"
        stroke={tokens.accent2}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.5}
      />
      {/* idea bulb */}
      <Circle cx={210} cy={58} r={14} fill={tokens.accent2} />
      <Rect x={204} y={74} width={12} height={8} rx={3} fill={tokens.accent} />
      <Path
        d="M210 30v8M184 40l6 6M236 40l-6 6"
        stroke={tokens.accent2}
        strokeWidth={3}
        strokeLinecap="round"
      />
      {/* pencil */}
      <G transform="rotate(28 302 180)">
        <Rect x={296} y={146} width={12} height={52} rx={5} fill={tokens.accent} />
        <Path d="M296 198l6 14 6-14z" fill={tokens.accent2} />
      </G>
      <Path
        d="M96 84l3.5 9 9 3.5-9 3.5-3.5 9-3.5-9-9-3.5 9-3.5z"
        fill={tokens.accent}
        opacity={0.7}
      />
      <Path d="M332 92l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill={tokens.accent2} opacity={0.8} />
    </ArtFrame>
  );
});

/* ---------- Block 2: parent dashboard + child rows with toggles ---------- */
export const FamilyArt: AboutArtComponent = memo(function FamilyArt({ height }: AboutArtProps) {
  const { tokens } = useTheme();
  return (
    <ArtFrame w={420} h={300} height={height}>
      <Ellipse cx={210} cy={152} rx={190} ry={126} fill={tokens.chipBg} />
      {/* window */}
      <Rect
        x={56}
        y={44}
        width={300}
        height={212}
        rx={16}
        fill={tokens.surface}
        stroke={tokens.border}
        strokeWidth={2}
      />
      <Circle cx={80} cy={66} r={5} fill={tokens.accent} />
      <Circle cx={98} cy={66} r={5} fill={tokens.accent2} />
      <Circle cx={116} cy={66} r={5} fill={tokens.border} />
      <Line x1={56} y1={84} x2={356} y2={84} stroke={tokens.border} strokeWidth={2} />
      {/* add-child button */}
      <Circle cx={332} cy={66} r={11} fill={tokens.accent2} />
      <Path
        d="M332 60v12M326 66h12"
        stroke={tokens.surface}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      {/* parent row */}
      <Circle cx={96} cy={116} r={16} fill={tokens.accent} />
      <Rect x={124} y={104} width={110} height={10} rx={5} fill={tokens.border} />
      <Rect x={124} y={120} width={70} height={8} rx={4} fill={tokens.border} opacity={0.6} />
      {/* child card 1 (active toggle) */}
      <Rect x={80} y={148} width={252} height={40} rx={12} fill={tokens.chipBg} />
      <Circle cx={104} cy={168} r={11} fill={tokens.accent2} />
      <Rect x={124} y={163} width={92} height={9} rx={4.5} fill={tokens.border} />
      <Rect x={284} y={160} width={34} height={17} rx={8.5} fill={tokens.accent} />
      <Circle cx={310} cy={168.5} r={6} fill={tokens.surface} />
      {/* child card 2 (inactive toggle) */}
      <Rect x={80} y={196} width={252} height={40} rx={12} fill={tokens.chipBg} />
      <Circle cx={104} cy={216} r={11} fill={tokens.accent} />
      <Rect x={124} y={211} width={72} height={9} rx={4.5} fill={tokens.border} />
      <Rect x={284} y={208} width={34} height={17} rx={8.5} fill={tokens.border} />
      <Circle cx={292} cy={216.5} r={6} fill={tokens.surface} />
      {/* heart */}
      <Path
        d="M380 142c-6-8-18-2-14 8 2.6 6 14 12 14 12s11.4-6 14-12c4-10-8-16-14-8z"
        fill={tokens.accent2}
        opacity={0.85}
      />
      <Path d="M46 210l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill={tokens.accent} opacity={0.7} />
    </ArtFrame>
  );
});

/* ---------- Block 3: olympiad attempt (25-question card + medal + timer) ---------- */
export const OlympiadArt: AboutArtComponent = memo(function OlympiadArt({
  height,
}: AboutArtProps) {
  const { tokens } = useTheme();
  return (
    <ArtFrame w={420} h={300} height={height}>
      <Ellipse cx={210} cy={155} rx={185} ry={122} fill={tokens.chipBg} />
      {/* question card stack */}
      <Rect
        x={92}
        y={80}
        width={170}
        height={118}
        rx={14}
        transform="rotate(-8 177 139)"
        fill={tokens.pillBg}
        stroke={tokens.border}
        strokeWidth={2}
      />
      <Rect
        x={112}
        y={96}
        width={170}
        height={118}
        rx={14}
        fill={tokens.surface}
        stroke={tokens.border}
        strokeWidth={2}
      />
      <SvgText
        x={138}
        y={158}
        fontFamily={MONO}
        fontWeight="700"
        fontSize={44}
        fill={tokens.accent}
      >
        25
      </SvgText>
      <Rect x={208} y={122} width={58} height={10} rx={5} fill={tokens.border} />
      <Rect x={208} y={140} width={42} height={10} rx={5} fill={tokens.border} opacity={0.6} />
      <Circle cx={140} cy={186} r={7} fill="none" stroke={tokens.accent} strokeWidth={2.5} />
      <Circle cx={166} cy={186} r={7} fill={tokens.accent2} />
      <Circle cx={192} cy={186} r={7} fill="none" stroke={tokens.accent} strokeWidth={2.5} />
      {/* medal */}
      <Path d="M312 64l14 26 8-4-12-26z" fill={tokens.accent} />
      <Path d="M348 60l-14 26-8-4 12-26z" fill={tokens.accent} opacity={0.6} />
      <Circle cx={330} cy={112} r={32} fill={tokens.accent2} />
      <Circle cx={330} cy={112} r={19} fill={tokens.surface} />
      <Path
        d="M330 101l3.6 7.4 8 1.2-5.8 5.6 1.4 8-7.2-3.8-7.2 3.8 1.4-8-5.8-5.6 8-1.2z"
        fill={tokens.accent2}
      />
      {/* timer */}
      <Rect x={318} y={188} width={10} height={8} rx={3} fill={tokens.accent} />
      <Circle cx={323} cy={218} r={20} fill={tokens.surface} stroke={tokens.accent} strokeWidth={3} />
      <Path
        d="M323 218v-11M323 218l8 5"
        stroke={tokens.accent2}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Path d="M76 232l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill={tokens.accent2} opacity={0.8} />
    </ArtFrame>
  );
});

/* ---------- Block 4: analytics (bars + trend + donut) ---------- */
export const AnalyticsArt: AboutArtComponent = memo(function AnalyticsArt({
  height,
}: AboutArtProps) {
  const { tokens } = useTheme();
  return (
    <ArtFrame w={420} h={300} height={height}>
      <Ellipse cx={210} cy={155} rx={190} ry={122} fill={tokens.chipBg} />
      {/* panel */}
      <Rect
        x={56}
        y={64}
        width={280}
        height={180}
        rx={16}
        fill={tokens.surface}
        stroke={tokens.border}
        strokeWidth={2}
      />
      <Line x1={76} y1={128} x2={316} y2={128} stroke={tokens.border} strokeWidth={1.5} />
      <Line x1={76} y1={168} x2={316} y2={168} stroke={tokens.border} strokeWidth={1.5} />
      <Line x1={76} y1={208} x2={316} y2={208} stroke={tokens.border} strokeWidth={1.5} />
      <Rect x={90} y={178} width={30} height={46} rx={6} fill={tokens.accent} opacity={0.35} />
      <Rect x={136} y={150} width={30} height={74} rx={6} fill={tokens.accent} opacity={0.55} />
      <Rect x={182} y={124} width={30} height={100} rx={6} fill={tokens.accent} opacity={0.75} />
      <Rect x={228} y={96} width={30} height={128} rx={6} fill={tokens.accent} />
      <Polyline
        points="88,150 140,130 192,116 244,92 300,84"
        fill="none"
        stroke={tokens.accent2}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={300} cy={84} r={7} fill={tokens.accent2} />
      {/* floating donut card */}
      <Rect
        x={308}
        y={40}
        width={84}
        height={84}
        rx={16}
        fill={tokens.surface}
        stroke={tokens.border}
        strokeWidth={2}
      />
      <Circle cx={350} cy={82} r={24} fill="none" stroke={tokens.chipBg} strokeWidth={10} />
      <Circle
        cx={350}
        cy={82}
        r={24}
        fill="none"
        stroke={tokens.accent2}
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray="113 151"
        transform="rotate(-90 350 82)"
      />
      <Path d="M52 246l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill={tokens.accent} opacity={0.7} />
    </ArtFrame>
  );
});

/* ---------- Block 5: safety (shield + check, lock, child) ---------- */
export const SafetyArt: AboutArtComponent = memo(function SafetyArt({ height }: AboutArtProps) {
  const { tokens } = useTheme();
  return (
    <ArtFrame w={420} h={300} height={height}>
      <Ellipse cx={210} cy={155} rx={190} ry={124} fill={tokens.chipBg} />
      {/* shield */}
      <Path
        d="M210 44l86 30v82c0 56-36 88-86 102-50-14-86-46-86-102V74z"
        fill={tokens.accent}
      />
      <Path
        d="M210 66l64 22v70c0 44-27 70-64 82-37-12-64-38-64-82v-70z"
        fill={tokens.surface}
      />
      <Path
        d="M178 156l26 26 48-52"
        fill="none"
        stroke={tokens.accent2}
        strokeWidth={14}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* lock */}
      <Path
        d="M316 196v-14a16 16 0 0132 0v14"
        fill="none"
        stroke={tokens.accent}
        strokeWidth={6}
        strokeLinecap="round"
      />
      <Rect x={308} y={196} width={48} height={38} rx={10} fill={tokens.accent2} />
      <Circle cx={332} cy={211} r={5} fill={tokens.surface} />
      <Rect x={329} y={213} width={6} height={11} rx={3} fill={tokens.surface} />
      {/* child figure */}
      <Circle cx={96} cy={206} r={15} fill={tokens.accent2} />
      <Rect x={76} y={225} width={40} height={32} rx={15} fill={tokens.accent} />
      <Path d="M352 62l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill={tokens.accent} opacity={0.7} />
      <Path d="M66 92l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill={tokens.accent2} opacity={0.8} />
    </ArtFrame>
  );
});
