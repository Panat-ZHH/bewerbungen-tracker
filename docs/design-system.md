# WendApply Design System – «Sticker-Heft»

Feeling: setting off, looking forward. A good sticker album or a concert ticket, not a bank dashboard and not a SaaS tool.
Audience: 13–16 year olds (parents and teachers look too): cheerful, a bit playful, still tidy and trustworthy.

All tokens are CSS variables in `app/globals.css`. **Never hard-code a colour, radius or shadow in a component** – use a token.

## Calm hierarchy (2026-11, binding for the logged-in app)
The app must feel calm and logical: **one loud thing per screen, the rest quiet.** The sticker identity stays, but as an accent, not on every box.

**Elevation – three levels only**
| Level | Look | Use | How |
|---|---|---|---|
| 0 flat | no edge, maybe `--surface-2` tint | groups inside a surface, lists on paper | `.inset`, `.rows`, `<Card variant="inset">` |
| 1 calm surface (default) | 1px soft edge `--edge`, no shadow | every normal card, sheet, filter panel, chip track | `<Card>`, `.panel`, `.panel-flat`, `.panel-calm` |
| 2 primary sticker | 2px ink edge `--edge-strong` + hard offset shadow `--elev-2` | **at most ONE card and ONE button per screen**: the thing the screen is for | `<Card variant="primary">`, `.panel-primary`, `.ticket`, `<Button variant="primary"\|"sun">` |

- **When to use the strong outline:** the screen's single main action (primary/sun button) and, optionally, its single hero object (dashboard ticket, the invite code, onboarding card). Never on lists, filters, settings groups, badges, avatars or secondary buttons.
- Only one of `primary` / `sun` per screen (modals are their own layer and may have their own). Everything else is `secondary` (thin contour, no shadow), `ghost` or `danger`.
- Accents: per screen at most one bright fill area besides the primary button (e.g. the progress ticket). Avatars, active nav and highlights use the soft tints (`--sun-soft`, `--brand-soft` …) with ink text.
- Tilt (`tilt-l|r|l3`) only on a playful level-2 element, max. one per screen.

**How it works (token scope).** Logged-in roots carry `data-ui="app"` (`WorkspaceShell`, `AuthFrame`). While such a root is on the page,
`:root:has([data-ui="app"])` re-maps the legacy tokens to level 1: `--border-w → 1px`, `--outline → --edge`, `--shadow-xs…lg → none`,
`--shadow-hover / --lift → none`, `--control-edge → --field-border`, `--field-focus-shadow → 1px brand ring`. So old markup
(`border-[var(--outline)]`, `shadow-[var(--shadow-md)]`, `.panel`) is calm automatically; **level 2 uses its own tokens**
(`--border-strong`, `--edge-strong`, `--elev-2`, `--elev-2-sm`, `--elev-2-hover`) that are never re-mapped. Public pages (no `data-ui="app"`) keep the old values.
`.ui-raised` restores the sticker tokens for a subtree that floats over busy content (map chrome over the 3D scene).
New code: use the explicit tokens (`--edge`, `--edge-strong`, `--border-thin`, `--border-strong`, `--elev-*`), not `--outline`/`--shadow-*`.

**Spacing** – only the 4px steps 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 (`--space-1…16`, Tailwind `1 2 3 4 6 8 12 16`). Inside a card 16 (mobile) / 24; between sections 32–48; label→control 6–8.

**Type scale** – exactly one `h1` per page (`PageHeader` / `.text-title`, dashboard greeting `.text-display`), section titles `h2.text-heading`,
body `.text-body`, secondary `.text-small`, meta/caption `.text-caption`. No other ad-hoc font sizes for headings.

**Status colours – one meaning everywhere** (`lib/status.ts`: `statusFamily`, `statusFamilyStyle`, `statusFill`; presentation only):
saved (Gemerkt) = paper · todo (In Vorbereitung) = yellow · sent (Abgeschickt, Schnupperlehre, Eignungstest) = blue · talk (Gespräch) = coral ·
placed (Zusage, Vertrag) = green · closed (Absage, Zurückgezogen) = sand (never red). `StatusBadge`, the analytics bars, the class bars and the
dashboard ticket all read from this map (the ticket's first stage «Gemerkt» counts Gemerkt + In Vorbereitung, i.e. «not sent yet», and uses the todo yellow) – do not define a new status colour map anywhere.

**Focus** – one ring everywhere: `outline: var(--focus-ring-width) solid var(--focus-ring)` + `--focus-ring-offset` (global `:focus-visible`).
Fields show focus with a brand contour + `--field-focus-shadow`. Never remove focus styles.

**Motion** – `--dur-fast 120ms / --dur 200ms / --dur-slow 340ms`, `--ease`, `--spring`; all animations and transitions are switched off by
`prefers-reduced-motion` (global rule), joy effects are not rendered at all.

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
| `--edge` | `#d9ccb1` | `#4a4639` | soft 1px contour of level-1 surfaces (decorative) |
| `--edge-strong` | ink | ink | 2px contour of the level-2 sticker |
| `--control-edge` | ink (app: `--field-border`) | | contour of secondary buttons |
| `--brand` / `--on-brand` | `#385cfc` / white | `#8ea2ff` / dark | **the blue of the logo dot** (sampled from `public/logo.png`). Primary button, links, focus |
| `--brand-strong`, `--brand-soft` | | | hover text / quiet blue tint |
| `--sun` / `--on-sun` | `#ffd23f` | same | joy: highlights, marker, active nav, success moments |
| `--coral` / `--on-coral` | `#ff7a6b` | `#ff8a7c` | sparingly: celebration (Gespräch, Zusage) |
| `--mint` / `--on-mint` | `#6fdca0` | same | Zusage / done |
| `--sand` / `--on-sand` | | | calm neutral (Absage) |
| tones `--{success,warning,danger,info,coral,neutral}-{bg,fg,line}` | | | badges, status messages. `fg` is readable on its `bg` AND on paper/surface |

Status colours: see "Calm hierarchy" above (one family map in `lib/status.ts`). `danger` is only for real errors and destructive actions.

Tailwind aliases: `bg-paper bg-surface bg-surface-2 text-ink text-muted border-line border-outline bg-brand text-on-brand bg-sun bg-coral bg-mint bg-sand`, or the long form `bg-[var(--sun)]`.

## Type
- Titles + big numbers: **Bricolage Grotesque** (`--font-title`, class `font-display`), weight 800, tight. `h1–h3` use it automatically.
- Text/UI: **Instrument Sans** (`--font-body`). Loaded with `next/font/google` in `app/layout.tsx`.
- Classes: `text-hero` (landing), `text-display` (greeting), `text-title` (page title), `text-heading` (section), `text-body`, `text-small`, `text-label`,
  `num-display` (giant numeral), `num-big`, `tabular`, `marker` / `marker-coral` (felt-marker highlight behind a word).
- Big contrast in size: one loud title, the rest calm. No uppercase letter-spaced mini labels.

## Shape
- Level 1 contour: `border-[length:var(--border-thin)] border-[var(--edge)]`. Level 2: `border-[length:var(--border-strong)] border-[var(--edge-strong)] shadow-[var(--elev-2)]`.
- Legacy (public pages; re-mapped to level 1 inside the app): `border-[length:var(--border-w)] border-[var(--outline)]` (1.5px ink), `--shadow-sm`, `--shadow-md`, `--shadow-lg` = 2/3/5px, no blur.
- Radius: `--radius-sm 6 / md 8 / lg 10 / xl 12`; Tailwind `rounded-lg` (8) / `rounded-xl` (12). Pills (`rounded-full`) only for buttons, chips, badges.
- Not everything is a card. Per screen: at most one level-2 sticker, calm surfaces where grouping helps, the rest plain lists (`.rows`) on paper.
- Asymmetry welcome: uneven grid columns, a sticker rotated with `tilt-l` (-2°), `tilt-r` (2°), `tilt-l3`.

## CSS helpers (`app/globals.css`)
`panel` (surface: level 1 in the app, sticker on public pages), `panel-flat` (contour, no shadow), `panel-primary` (level 2), `panel-calm` (level 1 everywhere), `divider`, `ui-raised`, `inset`, `rows` + `row-link` (list with dashed dividers), `sticker` (+ `sticker-coral|mint|blue|paper`),
`pressable` (lift/sink via `--lift`, `--shadow-hover`, `--press`; none inside the app except `.btn-strong`), `card-interactive`, `ticket` + `ticket-stub`, `app-bar app-bar-top|bottom`, `marker`, `skeleton`,
`status status-{success|warning|danger|info}`, `toast`, `select-caret`, `animate-{rise|fade|sheet|pop|sticker|wiggle}`, `spinner`.

## Components (`components/ui/*`)
| Component | Notes |
|---|---|
| `Button`, `ButtonLink`, `buttonClasses()` | `variant: primary (blue) \| sun (yellow, dark text) \| secondary (calm: thin contour, no shadow) \| ghost (underlined text) \| danger (red tint)`, `size: sm\|md\|lg` (md/lg ≥ 44px; sm 36px on mouse, 44px on touch), `full`, `loading` (spinner + aria-busy), `icon`. primary/sun = level 2, **one per screen**; `sun` for the joyful main step. Disabled = 50% opacity, focus = global ring. |
| `Card` (+ `CardHeader/Content/Title`) | `variant: surface (default, level 1) \| primary (level 2, one per screen) \| inset (level 0)`; `flat` kept for old call sites; `interactive` (hover: edge darkens) |
| `Badge` | calm chip: tint + 1px tone line. `tone: neutral \| paper \| brand \| info \| success \| warning \| danger \| coral` |
| `StatusBadge`, `statusTone` | status chip; tone comes from `lib/status.ts statusFamily` |
| `Input`, `Textarea`, `Select`, `Field`, `fieldClasses` | 44px, `--field-border` contour (≥ 3:1), focus = brand contour + `--field-focus-shadow`, `aria-invalid` = red. `Field` (with `htmlFor`) gives hint/error an id and wires `aria-describedby` / `aria-invalid` onto its single child |
| `Avatar` | initials on a soft accent tint with ink text, soft contour |
| `EmptyState` | icon, title, ONE sentence, ONE action; soft dashed contour + doodle, icon without tile |
| `PageHeader` | `title, description?, actions?` (no eyebrow): one h1, one optional line, at most one primary action (wraps below the title on phones) |
| `Figures` | key numbers without boxes: first huge with marker label, rest inline |
| `Segmented` / `Tabs` | calm pill track (soft edge), selected = ink fill, ≥ 40px (44px on touch), arrow keys |
| `Modal` / `Sheet` | bottom sheet on phones, dialog from `sm`; calm edge in the app, soft footer divider, focus trap, ESC |
| `Skeleton`, `StatusMessage`, `Toaster` | flat pulse; tone messages; toasts (success/danger/info) keep a small hard shadow (`--elev-2-sm`) because they float |
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
`<WorkspaceShell active="Freunde">` (root carries `data-ui="app"`). Desktop: paper top bar with a soft edge; entries in muted text, active entry = soft yellow pill (`--sun-soft`) + bold ink text + `aria-current`. Phones: bottom tab bar (stays), icons 20px stroke 2, active = soft yellow pill; «Mehr» sheet as a plain list, active row tinted.

## Dark mode
`data-theme="dark"` on `<html>` (set before paint in `app/layout.tsx`, switch: `components/ui/theme-toggle.tsx`). Warm near-black, same accents, no glow.
`themeColor` in `app/layout.tsx` must equal `--paper`. Contrast: WCAG AA in both modes (`scripts/dark-contrast-audit.mjs`).

## Copy
German, Swiss spelling («ss», never «ß»), informal «du», warm, slightly humorous: «Ein guter nächster Schritt reicht für heute.»

## Auth
Sign-up stores `role` (`student`|`teacher`, default `student`) in Supabase user metadata (`user.user_metadata.role`).
