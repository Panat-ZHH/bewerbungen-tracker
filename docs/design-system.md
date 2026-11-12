# WendApply Design System – «Sticker-Heft»

Feeling: setting off, looking forward. A good sticker album or a concert ticket, not a bank dashboard and not a SaaS tool.
Audience: 13–16 year olds (parents and teachers look too): cheerful, a bit playful, still tidy and trustworthy.

All tokens are CSS variables in `app/globals.css`. **Never hard-code a colour, radius or shadow in a component** – use a token.

## Never (the "generic AI look")
- No gradients of any kind (`linear-gradient`, `bg-gradient-*`, `text-gradient`), no coloured glow shadows, no blur shadows.
- No violet / purple / lilac / indigo anywhere.
- No glassmorphism: no `backdrop-blur`, no translucent white surfaces (`bg-white/60`).
- No cards inside cards (e.g. bordered pill rows inside a card). Inside a surface use `.rows` (dashed dividers) or `.inset` (tinted block without border).
- No row of equal KPI cards (label / big number / sub text). Use `<Figures>` or something visual (ticket, path, segments).
- No `rounded-2xl` / `rounded-3xl`, no soft `shadow-sm|md|lg|xl` Tailwind shadows.
- No icons in tinted square/round tiles. Icons stand alone (line icons, stroke 2–2.4) in ink or one accent colour.
- No eyebrow line above a title and no slogan of the pattern "X. Ganz einfach Y.".
- No system font / Inter.
- No hex / rgb colours in `.tsx` (exception: the three.js scene and Google's sign-in button colours).

## Colours
| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#fff9ef` | `#15140f` | page background (warm, never bluish / navy) |
| `--surface` | `#ffffff` | `#211f19` | sticker / card face, sheets |
| `--surface-2` | `#f9f2e4` | `#2c2a22` | `.inset`, hovered rows, empty tracks |
| `--ink` | `#16140f` | `#f6f0e3` | text |
| `--muted` | `#5e584c` | `#b5ad9c` | secondary text (AA on paper and surface) |
| `--line` | `#e6dcc8` | `#3b382e` | dashed dividers |
| `--outline` | ink | ink | contour of surfaces |
| `--outline-fill` | `#16140f` | `#15140f` | contour of bright fills (always dark) |
| `--brand` / `--on-brand` | `#385cfc` / white | `#8ea2ff` / dark | **the blue of the logo dot** (sampled from `public/logo.png`). Primary button, links, focus |
| `--brand-strong`, `--brand-soft` | | | hover text / quiet blue tint |
| `--sun` / `--on-sun` | `#ffd23f` | same | joy: highlights, marker, active nav, success moments |
| `--coral` / `--on-coral` | `#ff7a6b` | `#ff8a7c` | sparingly: celebration (Gespräch, Zusage) |
| `--mint` / `--on-mint` | `#6fdca0` | same | Zusage / done |
| `--sand` / `--on-sand` | | | calm neutral (Absage) |
| tones `--{success,warning,danger,info,coral,neutral}-{bg,fg,line}` | | | badges, status messages. `fg` is readable on its `bg` AND on paper/surface |

Status colours (flat, `components/ui/status-badge.tsx`): Gemerkt = paper, In Vorbereitung = yellow, Abgeschickt/Schnuppern/Test = blue,
Gespräch = coral, Zusage/Vertrag = green, **Absage/Zurückgezogen = sand (calm, never red)**. `danger` is only for real errors and destructive actions.

Tailwind aliases: `bg-paper bg-surface bg-surface-2 text-ink text-muted border-line border-outline bg-brand text-on-brand bg-sun bg-coral bg-mint bg-sand`, or the long form `bg-[var(--sun)]`.

## Type
- Titles + big numbers: **Bricolage Grotesque** (`--font-title`, class `font-display`), weight 800, tight. `h1–h3` use it automatically.
- Text/UI: **Instrument Sans** (`--font-body`). Loaded with `next/font/google` in `app/layout.tsx`.
- Classes: `text-hero` (landing), `text-display` (greeting), `text-title` (page title), `text-heading` (section), `text-body`, `text-small`, `text-label`,
  `num-display` (giant numeral), `num-big`, `tabular`, `marker` / `marker-coral` (felt-marker highlight behind a word).
- Big contrast in size: one loud title, the rest calm. No uppercase letter-spaced mini labels.

## Shape
- Contour: `border-[length:var(--border-w)] border-[var(--outline)]` (1.5px ink). Hard offset shadow: `shadow-[var(--shadow-sm)]`, `shadow-[var(--shadow-md)]`, `shadow-[var(--shadow-lg)]` = 2/3/5px, no blur.
- Radius: `--radius-sm 6 / md 8 / lg 10 / xl 12`; Tailwind `rounded-lg` (8) / `rounded-xl` (12). Pills (`rounded-full`) only for buttons, chips, badges.
- Not everything is a shadowed card. Per screen: one or two stickers (`.panel`), the rest plain lists (`.rows`) on paper.
- Asymmetry welcome: uneven grid columns, a sticker rotated with `tilt-l` (-2°), `tilt-r` (2°), `tilt-l3`.

## CSS helpers (`app/globals.css`)
`panel` (sticker surface), `panel-flat` (contour, no shadow), `inset`, `rows` + `row-link` (list with dashed dividers), `sticker` (+ `sticker-coral|mint|blue|paper`),
`pressable` (lift on hover, sinks on press), `card-interactive`, `ticket` + `ticket-stub`, `app-bar app-bar-top|bottom`, `marker`, `skeleton`,
`status status-{success|warning|danger|info}`, `toast`, `select-caret`, `animate-{rise|fade|sheet|pop|sticker|wiggle}`, `spinner`.

## Components (`components/ui/*`)
| Component | Notes |
|---|---|
| `Button`, `ButtonLink`, `buttonClasses()` | `variant: primary (blue) \| sun (yellow, dark text) \| secondary (white sticker) \| ghost (underlined text) \| danger`, `size: sm\|md\|lg`, `full`, `loading`, `icon`. Sticker buttons sink on press. One primary per view; `sun` for the joyful main step. |
| `Card` (+ `CardHeader/Content/Title`) | `.panel`; `flat` = no shadow; `interactive` |
| `Badge` | `tone: neutral \| paper \| brand \| info \| success \| warning \| danger \| coral` |
| `StatusBadge`, `statusTone` | application status sticker |
| `Input`, `Textarea`, `Select`, `Field`, `fieldClasses` | ink contour, focus = blue contour + hard blue shadow |
| `Avatar` | initials on a flat token colour, ink contour |
| `EmptyState` | dashed contour + doodle, icon without tile |
| `PageHeader` | `title, description?, actions?` (no eyebrow) |
| `Figures` | key numbers without boxes: first huge with marker label, rest inline |
| `Segmented` / `Tabs` | pill track, selected = ink |
| `Modal` / `Sheet` | bottom sheet on phones, sticker dialog from `sm` |
| `Skeleton`, `StatusMessage` | flat pulse; tone messages |
| `BrandMark` | logo straight on paper (dark glyph variant in dark mode); `fixedTile`/`white` = white sticker tile |
| `doodles.tsx` | `DoodleArrow, DoodleLoopArrow, DoodleStar, DoodleSparkle, DoodleSquiggle, DoodleUnderline, DoodleBurst, DoodleSmile, DoodlePlane, DoodleTrail` – hand-drawn SVGs, `currentColor`, size by className. A few per screen at most. |

## Location search (`components/job-search/`)
Styled in `app/globals.css` (unlayered block "Location search", so it beats the `Input`/`Select`/`Badge` utilities). Class names, `data-*` and ARIA come from the search logic: do not rename them (`scripts/jobsearch-e2e.mjs` selects by them).
- `LocationAutocomplete`: `.location-autocomplete` (grid, `position: relative`), list `.location-autocomplete__list` floats below the field as a sticker (ink contour, hard shadow, no inner scroll: max. 8 rows). Rows are 40px, 44px on touch. Active row (`[data-active]` / `aria-selected="true"`): flat sun yellow with ink contour. `[data-loading]`: small brand spinner at the right edge of the field. Never set `display` on the list, it is closed with `hidden`.
- `RadiusSelect`: the `<select>` itself has `.radius-select`. Disabled (no place yet): dashed neutral contour on `--surface-2`, muted but fully readable text, no opacity.
- `DistanceBadge`: `.distance-badge`, sun-yellow pill with ink contour and a small `Navigation` icon ("12 km").
- Sort entry «Nächste zuerst» is only listed while a place is set. A failed «Mehr laden» is a `warning` message, not `danger`.

## Joy moments (`lib/joy.ts`, `lib/rewards.ts`)
- `reward("applied")` → toast + rubber stamp «ABGESCHICKT!» (`stamp()`), counts for the weekly goal.
- `celebrateStatus(status, previous, { position, location })` after a saved status change: Gespräch / Zusage / Vertrag → `confetti()` + motivating toast (+ stamp «ZUSAGE!»);
  Absage → calm toast «Gehört dazu. Weiter geht’s 💪» with the action «Ähnliche Stellen» (`/search?q=<position>`).
- Motion: ≤ 600ms, springy (`--spring`), everything off with `prefers-reduced-motion`.

## Dashboard
Greeting «Hoi <Vorname>!» + exactly one next step (`lib/next-step.ts: nextStep()`). New users (0 applications): no numbers, the three steps as a numbered list with giant numerals.
With data: `components/dashboard/progress-path.tsx` (ticket Gemerkt → Abgeschickt → Gespräch → Zusage), weekly goal as segments.

## Shell
`<WorkspaceShell active="Freunde">`. Desktop: paper top bar with ink edge, active entry = yellow sticker. Phones: bottom tab bar (stays), «Mehr» sheet as a plain list.

## Dark mode
`data-theme="dark"` on `<html>` (set before paint in `app/layout.tsx`, switch: `components/ui/theme-toggle.tsx`). Warm near-black, same accents, no glow.
`themeColor` in `app/layout.tsx` must equal `--paper`. Contrast: WCAG AA in both modes (`scripts/dark-contrast-audit.mjs`).

## Copy
German, Swiss spelling («ss», never «ß»), informal «du», warm, slightly humorous: «Ein guter nächster Schritt reicht für heute.»

## Auth
Sign-up stores `role` (`student`|`teacher`, default `student`) in Supabase user metadata (`user.user_metadata.role`).
