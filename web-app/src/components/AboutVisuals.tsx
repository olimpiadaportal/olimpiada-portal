// Round 8 — About page inline-SVG illustrations (server-safe, no client JS).
// All artwork is original, built from brand tokens (var(--accent) purple,
// var(--accent-2) orange in light mode) so both themes work automatically.
// Every SVG is decorative: aria-hidden + focusable="false". No external assets.

type SvgProps = { className?: string };

/* ---------- Hero: student + rising chart + medal ---------- */
export function AboutHeroArt({ className }: SvgProps) {
  return (
    <svg viewBox="0 0 480 360" aria-hidden="true" focusable="false" className={className}>
      <ellipse cx="240" cy="190" rx="215" ry="148" fill="var(--chip-bg)" />
      {/* board with bars + trend */}
      <rect x="120" y="70" width="250" height="170" rx="16" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
      <rect x="150" y="92" width="120" height="12" rx="6" fill="var(--chip-bg)" />
      <rect x="150" y="170" width="28" height="46" rx="6" fill="var(--accent)" opacity="0.35" />
      <rect x="192" y="146" width="28" height="70" rx="6" fill="var(--accent)" opacity="0.6" />
      <rect x="234" y="118" width="28" height="98" rx="6" fill="var(--accent)" />
      <polyline points="286,196 306,168 330,178 352,140" fill="none" stroke="var(--accent-2)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="352" cy="140" r="7" fill="var(--accent-2)" />
      {/* medal */}
      <path d="M386 92l14 26 8-4-12-26z" fill="var(--accent)" />
      <path d="M422 88l-14 26-8-4 12-26z" fill="var(--accent)" opacity="0.6" />
      <circle cx="404" cy="126" r="30" fill="var(--accent-2)" />
      <circle cx="404" cy="126" r="18" fill="var(--surface)" />
      <path d="M404 116l3.4 7 7.6 1.1-5.5 5.3 1.3 7.6-6.8-3.6-6.8 3.6 1.3-7.6-5.5-5.3 7.6-1.1z" fill="var(--accent-2)" />
      {/* student figure */}
      <circle cx="84" cy="212" r="20" fill="var(--accent)" />
      <rect x="60" y="238" width="48" height="62" rx="20" fill="var(--accent-2)" />
      {/* sparkles */}
      <path d="M70 96l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="var(--accent)" opacity="0.7" />
      <path d="M356 268l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="var(--accent-2)" opacity="0.8" />
    </svg>
  );
}

/* ---------- Block 1: student studying (book, bulb, pencil) ---------- */
export function StudyArt({ className }: SvgProps) {
  return (
    <svg viewBox="0 0 420 300" aria-hidden="true" focusable="false" className={className}>
      <ellipse cx="210" cy="165" rx="185" ry="118" fill="var(--chip-bg)" />
      {/* desk */}
      <rect x="76" y="228" width="268" height="12" rx="6" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
      {/* student */}
      <circle cx="210" cy="120" r="22" fill="var(--accent)" />
      <rect x="172" y="148" width="76" height="52" rx="24" fill="var(--accent-2)" />
      {/* open book */}
      <path d="M126 196Q168 182 210 194L210 230Q168 218 126 230Z" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
      <path d="M294 196Q252 182 210 194L210 230Q252 218 294 230Z" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
      <path d="M142 203q26-7 52-2M142 213q26-7 52-2" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" opacity="0.45" />
      <path d="M278 203q-26-7-52-2M278 213q-26-7-52-2" fill="none" stroke="var(--accent-2)" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
      {/* idea bulb */}
      <circle cx="210" cy="58" r="14" fill="var(--accent-2)" />
      <rect x="204" y="74" width="12" height="8" rx="3" fill="var(--accent)" />
      <path d="M210 30v8M184 40l6 6M236 40l-6 6" stroke="var(--accent-2)" strokeWidth="3" strokeLinecap="round" />
      {/* pencil */}
      <g transform="rotate(28 302 180)">
        <rect x="296" y="146" width="12" height="52" rx="5" fill="var(--accent)" />
        <path d="M296 198l6 14 6-14z" fill="var(--accent-2)" />
      </g>
      <path d="M96 84l3.5 9 9 3.5-9 3.5-3.5 9-3.5-9-9-3.5 9-3.5z" fill="var(--accent)" opacity="0.7" />
      <path d="M332 92l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="var(--accent-2)" opacity="0.8" />
    </svg>
  );
}

/* ---------- Block 2: parent dashboard + child rows with toggles ---------- */
export function FamilyArt({ className }: SvgProps) {
  return (
    <svg viewBox="0 0 420 300" aria-hidden="true" focusable="false" className={className}>
      <ellipse cx="210" cy="152" rx="190" ry="126" fill="var(--chip-bg)" />
      {/* window */}
      <rect x="56" y="44" width="300" height="212" rx="16" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
      <circle cx="80" cy="66" r="5" fill="var(--accent)" />
      <circle cx="98" cy="66" r="5" fill="var(--accent-2)" />
      <circle cx="116" cy="66" r="5" fill="var(--border)" />
      <line x1="56" y1="84" x2="356" y2="84" stroke="var(--border)" strokeWidth="2" />
      {/* add-child button */}
      <circle cx="332" cy="66" r="11" fill="var(--accent-2)" />
      <path d="M332 60v12M326 66h12" stroke="var(--surface)" strokeWidth="2.5" strokeLinecap="round" />
      {/* parent row */}
      <circle cx="96" cy="116" r="16" fill="var(--accent)" />
      <rect x="124" y="104" width="110" height="10" rx="5" fill="var(--border)" />
      <rect x="124" y="120" width="70" height="8" rx="4" fill="var(--border)" opacity="0.6" />
      {/* child card 1 (active toggle) */}
      <rect x="80" y="148" width="252" height="40" rx="12" fill="var(--chip-bg)" />
      <circle cx="104" cy="168" r="11" fill="var(--accent-2)" />
      <rect x="124" y="163" width="92" height="9" rx="4.5" fill="var(--border)" />
      <rect x="284" y="160" width="34" height="17" rx="8.5" fill="var(--accent)" />
      <circle cx="310" cy="168.5" r="6" fill="var(--surface)" />
      {/* child card 2 (inactive toggle) */}
      <rect x="80" y="196" width="252" height="40" rx="12" fill="var(--chip-bg)" />
      <circle cx="104" cy="216" r="11" fill="var(--accent)" />
      <rect x="124" y="211" width="72" height="9" rx="4.5" fill="var(--border)" />
      <rect x="284" y="208" width="34" height="17" rx="8.5" fill="var(--border)" />
      <circle cx="292" cy="216.5" r="6" fill="var(--surface)" />
      {/* heart */}
      <path d="M380 142c-6-8-18-2-14 8 2.6 6 14 12 14 12s11.4-6 14-12c4-10-8-16-14-8z" fill="var(--accent-2)" opacity="0.85" />
      <path d="M46 210l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="var(--accent)" opacity="0.7" />
    </svg>
  );
}

/* ---------- Block 3: olympiad attempt (25-question card + medal + timer) ---------- */
export function OlympiadArt({ className }: SvgProps) {
  return (
    <svg viewBox="0 0 420 300" aria-hidden="true" focusable="false" className={className}>
      <ellipse cx="210" cy="155" rx="185" ry="122" fill="var(--chip-bg)" />
      {/* question card stack */}
      <rect x="92" y="80" width="170" height="118" rx="14" transform="rotate(-8 177 139)" fill="var(--pill-bg)" stroke="var(--border)" strokeWidth="2" />
      <rect x="112" y="96" width="170" height="118" rx="14" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
      <text x="138" y="158" fontFamily="ui-monospace, monospace" fontWeight="700" fontSize="44" fill="var(--accent)">25</text>
      <rect x="208" y="122" width="58" height="10" rx="5" fill="var(--border)" />
      <rect x="208" y="140" width="42" height="10" rx="5" fill="var(--border)" opacity="0.6" />
      <circle cx="140" cy="186" r="7" fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <circle cx="166" cy="186" r="7" fill="var(--accent-2)" />
      <circle cx="192" cy="186" r="7" fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      {/* medal */}
      <path d="M312 64l14 26 8-4-12-26z" fill="var(--accent)" />
      <path d="M348 60l-14 26-8-4 12-26z" fill="var(--accent)" opacity="0.6" />
      <circle cx="330" cy="112" r="32" fill="var(--accent-2)" />
      <circle cx="330" cy="112" r="19" fill="var(--surface)" />
      <path d="M330 101l3.6 7.4 8 1.2-5.8 5.6 1.4 8-7.2-3.8-7.2 3.8 1.4-8-5.8-5.6 8-1.2z" fill="var(--accent-2)" />
      {/* timer */}
      <rect x="318" y="188" width="10" height="8" rx="3" fill="var(--accent)" />
      <circle cx="323" cy="218" r="20" fill="var(--surface)" stroke="var(--accent)" strokeWidth="3" />
      <path d="M323 218v-11M323 218l8 5" stroke="var(--accent-2)" strokeWidth="3" strokeLinecap="round" />
      <path d="M76 232l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="var(--accent-2)" opacity="0.8" />
    </svg>
  );
}

/* ---------- Block 4: analytics (bars + trend + donut) ---------- */
export function AnalyticsArt({ className }: SvgProps) {
  return (
    <svg viewBox="0 0 420 300" aria-hidden="true" focusable="false" className={className}>
      <ellipse cx="210" cy="155" rx="190" ry="122" fill="var(--chip-bg)" />
      {/* panel */}
      <rect x="56" y="64" width="280" height="180" rx="16" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
      <line x1="76" y1="128" x2="316" y2="128" stroke="var(--border)" strokeWidth="1.5" />
      <line x1="76" y1="168" x2="316" y2="168" stroke="var(--border)" strokeWidth="1.5" />
      <line x1="76" y1="208" x2="316" y2="208" stroke="var(--border)" strokeWidth="1.5" />
      <rect x="90" y="178" width="30" height="46" rx="6" fill="var(--accent)" opacity="0.35" />
      <rect x="136" y="150" width="30" height="74" rx="6" fill="var(--accent)" opacity="0.55" />
      <rect x="182" y="124" width="30" height="100" rx="6" fill="var(--accent)" opacity="0.75" />
      <rect x="228" y="96" width="30" height="128" rx="6" fill="var(--accent)" />
      <polyline points="88,150 140,130 192,116 244,92 300,84" fill="none" stroke="var(--accent-2)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="300" cy="84" r="7" fill="var(--accent-2)" />
      {/* floating donut card */}
      <rect x="308" y="40" width="84" height="84" rx="16" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
      <circle cx="350" cy="82" r="24" fill="none" stroke="var(--chip-bg)" strokeWidth="10" />
      <circle cx="350" cy="82" r="24" fill="none" stroke="var(--accent-2)" strokeWidth="10" strokeLinecap="round" strokeDasharray="113 151" transform="rotate(-90 350 82)" />
      <path d="M52 246l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="var(--accent)" opacity="0.7" />
    </svg>
  );
}

/* ---------- Block 5: safety (shield + check, lock, child) ---------- */
export function SafetyArt({ className }: SvgProps) {
  return (
    <svg viewBox="0 0 420 300" aria-hidden="true" focusable="false" className={className}>
      <ellipse cx="210" cy="155" rx="190" ry="124" fill="var(--chip-bg)" />
      {/* shield */}
      <path d="M210 44l86 30v82c0 56-36 88-86 102-50-14-86-46-86-102V74z" fill="var(--accent)" />
      <path d="M210 66l64 22v70c0 44-27 70-64 82-37-12-64-38-64-82v-70z" fill="var(--surface)" />
      <path d="M178 156l26 26 48-52" fill="none" stroke="var(--accent-2)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      {/* lock */}
      <path d="M316 196v-14a16 16 0 0132 0v14" fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" />
      <rect x="308" y="196" width="48" height="38" rx="10" fill="var(--accent-2)" />
      <circle cx="332" cy="211" r="5" fill="var(--surface)" />
      <rect x="329" y="213" width="6" height="11" rx="3" fill="var(--surface)" />
      {/* child figure */}
      <circle cx="96" cy="206" r="15" fill="var(--accent-2)" />
      <rect x="76" y="225" width="40" height="32" rx="15" fill="var(--accent)" />
      <path d="M352 62l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="var(--accent)" opacity="0.7" />
      <path d="M66 92l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="var(--accent-2)" opacity="0.8" />
    </svg>
  );
}

/* ---------- Small value-card icons (24px, stroke = currentColor) ---------- */

const ico = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: "false" as const,
};

export function MissionIcon() {
  return (
    <svg {...ico}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function OfferIcon() {
  return (
    <svg {...ico}>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 12.5l9 5 9-5" />
      <path d="M3 17l9 5 9-5" />
    </svg>
  );
}

export function AudienceIcon() {
  return (
    <svg {...ico}>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 19.5c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <circle cx="17" cy="9.5" r="2.8" />
      <path d="M17.9 13.6c2.2.7 3.6 2.6 3.6 5.2" />
    </svg>
  );
}

export function TrustIcon() {
  return (
    <svg {...ico}>
      <path d="M12 3l7 2.8V11c0 4.4-2.9 7.6-7 9-4.1-1.4-7-4.6-7-9V5.8z" />
      <path d="M8.8 11.6l2.3 2.3 4.2-4.4" />
    </svg>
  );
}
