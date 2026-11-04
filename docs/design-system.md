# WendApply Design System

All tokens are CSS variables in `app/globals.css`. Legacy names (`--paper --ink --muted --line --blue ...`) and classes (`panel`, `glass-surface`, `glass-bar`, `page-wrap`, `workspace-bg`, `text-muted`) still work.

## Tokens
- Brand: `--brand`, `--brand-strong`, `--brand-soft`, `--brand-gradient`, `--shadow-brand`
- Tones (bg/fg/line): `--success-*`, `--warning-*`, `--danger-*`, `--info-*`, `--neutral-*`
- Radius: `--radius-sm 8 / md 12 / lg 16 / xl 22 / full`
- Shadows: `--shadow-xs|sm|md|lg` (layered, soft)
- Motion: `--ease`, `--dur-fast|dur|dur-slow`; `prefers-reduced-motion` disables animation globally
- Layout: `--nav-h`, `--tabbar-h`, `--safe-bottom`; use class `pb-safe` for content above the mobile tab bar
- Dark mode: `data-theme="dark"` on `<html>`, chosen in Settings via `<ThemeToggle />` (`components/ui/theme-toggle.tsx`: Hell / Dunkel / Automatisch, persisted in `localStorage["wendapply-theme"]`, default follows the OS). `app/layout.tsx` applies it before first paint (no flash). `globals.css` ends with a "dark-mode bridge" that remaps legacy hardcoded utilities (`bg-white`, `bg-white/60`, `text-[#a32828]`, ...) to tokens, so older pages work in dark; new code should use variables (`bg-[var(--field-bg)]`) or Tailwind aliases `text-brand bg-brand-soft text-muted border-line`.
- Surface tokens: `--raised` / `--raised-hover` (translucent control fill), `--solid` (opaque card/segment), `--placeholder`, `--highlight` (top inner edge of panels). Use these instead of `bg-white/..`.
- Charts: use CSS variables for fills/tooltips (`var(--success-fg)`, `var(--muted)`, tooltip `background: var(--sheet-bg)`), see `app/analytics/page.tsx`.
- Pages: start with `<PageHeader>`, status via `<StatusMessage>`, loading via `<Skeleton>` inside `<Card>`, empty via `<EmptyState>`, dialogs via `<Modal>`.

## Type classes
`text-display`, `text-title`, `text-heading`, `text-body`, `text-small`, `text-eyebrow`, `text-gradient`, `tabular`.

## Utility classes
`panel`/`glass-surface`, `card-interactive` (hover lift), `skeleton`, `status status-{success|warning|danger|info}`, `toast`, `animate-{rise|fade|sheet|pop}`, `spinner`.

## Components (`components/ui/*`)
| Component | Props |
|---|---|
| `Button` | button props + `variant: primary\|secondary\|ghost\|danger`, `size: sm\|md\|lg`, `full`, `loading`, `icon`. No default `type` (as before). |
| `ButtonLink` | anchor props + `href`, same variant/size/full/icon. `buttonClasses()` also exported. |
| `Card`, `CardHeader`, `CardContent`, `CardTitle` | div props; `Card` has `interactive` |
| `Badge` | span props + `tone: neutral\|brand\|info\|success\|warning\|danger` |
| `Input`, `Textarea`, `Select` | native props; `fieldClasses` exported |
| `Field` | `label, htmlFor, hint?, error?, children` |
| `Avatar` | `name, src?, size: xs\|sm\|md\|lg\|xl`; `initialsOf()` |
| `EmptyState` | `icon?, title, description?, action?` |
| `PageHeader` | `title, description?, eyebrow?, actions?` |
| `Segmented` (alias `Tabs`) | `options: {value,label,icon?,count?}[], value, onChange, label?, full?` |
| `Modal` (alias `Sheet`) | `open, onClose, title, description?, children, footer?`; bottom sheet on phones, ESC, focus trap/restore, scroll lock; put `data-autofocus` on an element to focus it |
| `StatTile` | `label, value, icon?, trend?, tone?` |
| `Skeleton` | div props; size via className |
| `StatusMessage` | `tone: success\|warning\|danger\|info\|neutral, icon?, toast?` |

## WorkspaceShell
`<WorkspaceShell active="Freunde">`. Desktop (md+): glass top bar with icon nav (labels at xl). Mobile: bottom tab bar (Start, Suchen, Bewerbungen, Freunde, Mehr) with a "Mehr" sheet (Map, Lebensläufe, Auswertung, Klassen, Profil, Einstellungen, Abmelden). Active keys: see `navigation` in the file (new: `Friends|Freunde`, `Classes|Klassen`).

## Auth
Sign-up stores `role` (`student`|`teacher`, default `student`) in Supabase user metadata (`user.user_metadata.role`).
