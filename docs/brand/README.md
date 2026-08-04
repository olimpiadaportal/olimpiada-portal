# OlympIQ brand assets

Canonical source set, supplied by the investor 2026-08-04. **Nothing in this folder is
read at build time** — it is the master library. Everything the apps actually ship is
*derived* from here and lives in the app trees (§3).

The originals arrived with Azerbaijani filenames (`05_nisan_esas.png` = "mark, primary";
`01_lockup_esas_ag-fon.png` = "lockup, primary, white background"). They were renamed to
say what they are, and the numbering gaps are explained in §2.

---

## 1. The identity

| Role | Colour | Where it appears |
|---|---|---|
| Navy | `#141B4D` | Icon plate, wordmark "Olymp" on light, the tallest bar in the primary mark |
| Purple | `#6E5BFF` | "IQ", the middle bar; the two shorter bars are this same purple at **80%** and **50%** alpha |
| Gold | `#F2B441` | The star, the "IQ" on dark, the tallest bar in the icon variant |

Tagline (from the LinkedIn covers): **"Hər gün bir pillə yuxarı"** — *one step higher
every day*.

The mark is three ascending bars with a star on the tallest — a progress chart that also
reads as a podium. The wordmark is a serif "Olymp" + "IQ" in the accent colour.

> **The wordmark font is not in this repo.** The lockups are flat PNGs, so any new
> wordmark artwork has to come from the investor. Do not re-typeset it in Arial and hope
> it matches — it does not.

---

## 2. Files

| File | Size | What it is |
|---|---|---|
| `app-icon-1024.png` | 1024² | **Master app icon.** Rounded navy plate, purple/purple/gold bars, gold star. Source for every square icon in the product. |
| `mark-primary.png` | 1200×1360 | The bare mark on transparency. Tallest bar **navy**. Use on light surfaces. |
| `mark-gold-peak.png` | 1200×1360 | Same mark, tallest bar **gold**. **Derived here, not supplied** — see below. Use on dark surfaces. |
| `favicon-512.png` | 512² | Rounded-square icon on transparency. Browser tabs. |
| `avatar-circle-1024.png` | 1024² | Circular crop. Social profile pictures. |
| `lockup-horizontal-on-light.png` | 2640×704 | Mark + wordmark, for light backgrounds (navy "Olymp", purple "IQ"). |
| `lockup-horizontal-on-dark.png` | 2640×704 | Same lockup for dark backgrounds (white "Olymp", gold "IQ"). |
| `social-linkedin-cover.png` | 2256×382 | LinkedIn banner with the tagline. |
| `social-linkedin-cover-alt.png` | 2256×382 | Alternate LinkedIn banner. |
| `adaptive-background-plate-unused.png` | 512² | Pale construction-grid plate. **Not used** — the Android adaptive icon uses a flat navy instead, which matches the master icon. Kept because it is investor artwork. |
| `_contact-sheet.png` | — | The investor's own preview of the full set. Reference only. |
| `_mockup-preview.png` | — | Presentation mockup. Reference only. |

### The gap in the numbering

The contact sheet shows **eleven** files (`01`–`11`); **six** were delivered. Missing:

| Missing | What it was |
|---|---|
| `03_lockup_mono-tund` | Single-colour lockup for dark backgrounds |
| `04_lockup_mono-ag` | Single-colour lockup for light backgrounds |
| `06_nisan_qizil-zirve` | Mark with a **gold** tallest bar |
| `07_nisan_mono-tund` | Single-colour mark, dark |
| `08_nisan_mono-ag` | Single-colour mark, light |

`06` was needed immediately — the navy bar of `mark-primary` all but vanishes against the
dark splash background (`#14101f`) and against the navy icon plate. It was reconstructed
here as `mark-gold-peak.png` by an exact colour substitution (`#141B4D` → `#F2B441`);
navy occurs nowhere else in that file, so the result is pixel-exact rather than a
repaint. The five mono variants are not needed yet — **ask the investor for all five** if
single-colour printing, embroidery or a watermark ever comes up.

---

## 3. What is derived from these, and where it lives

Regenerate these whenever a master changes; none of them should be hand-edited.

| Derived file | From | Notes |
|---|---|---|
| `mobile-app/assets/images/icon.png` | `app-icon-1024.png` | Direct copy. iOS home screen + Play icon source. |
| `mobile-app/assets/images/android-icon-foreground.png` | `mark-gold-peak.png` | 512², mark at 60% — inside the launcher's mask safe zone. Pairs with `adaptiveIcon.backgroundColor: "#141B4D"`. |
| `mobile-app/assets/images/android-icon-monochrome.png` | `mark-gold-peak.png` | 432² (exact Android themed-icon spec), flattened to white. Also the notification icon — Android discards the colour and tints the silhouette. |
| `mobile-app/assets/images/splash-icon.png` | `mark-gold-peak.png` | 512² transparent. Renders on cream in light, `#14101f` in dark. |
| `mobile-app/assets/images/favicon.png` | `favicon-512.png` | 48², `react-native-web` build only. |
| `mobile-app/store-assets/play-icon-512.png` | `app-icon-1024.png` | Play listing icon. |
| `mobile-app/store-assets/play-feature-1024x500-*.png` | `mark-gold-peak.png` | Play feature graphic, one per locale. |
| `web-app/src/app/icon.png` | `favicon-512.png` | Next.js App Router convention — picked up automatically, no code. |
| `web-app/src/app/apple-icon.png` | `app-icon-1024.png` | 180², iOS home-screen tile. |
| `admin-panel/src/app/icon.png` | `favicon-512.png` | Same convention. |

---

## 4. Open decisions

- **The product's colour tokens do not match this identity.** The apps run on purple
  `#7c3aed` + orange `#ff8a00` on cream `#fffbf5` (light) and `#14101f` (dark); the brand
  is purple `#6E5BFF` + gold `#F2B441` on navy `#141B4D`. They are close cousins, not the
  same palette. Aligning them is a deliberate design round touching every token in three
  apps — **not** something to fold into an unrelated change. Until then the icons are
  on-brand and the interiors are not.
- **The web and admin headers still render "OlympIQ" as text**, not the lockup. Wiring
  the lockup in needs a light/dark pair and a layout pass; the artwork is ready here.
- **Five mono variants are missing** (§2) — request them before any single-colour use.
