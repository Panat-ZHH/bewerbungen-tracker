/**
 * Stripe Appearance API theme built from the app's own design tokens (app/globals.css), so the Payment Element looks
 * like WendApply: Instrument Sans, ink contour (1.5px), 10px radius, hard offset shadows, brand focus with a hard brand
 * shadow, sun-yellow selected tabs. Stripe renders inside an iframe and cannot read our CSS variables, so the values
 * are resolved at runtime (light and dark theme) and passed in. Pure: give it a token reader (tests pass a map).
 */
import type { Appearance, CustomFontSource } from "@stripe/stripe-js";

export type TokenReader = (name: string) => string;

/** Reads resolved CSS custom properties from <html> (client only). */
export function cssTokenReader(el: Element = document.documentElement): TokenReader {
  const style = getComputedStyle(el);
  return (name) => style.getPropertyValue(name).trim();
}

const FALLBACK: Record<string, string> = {
  "--paper": "#fff9ef", "--surface": "#ffffff", "--surface-2": "#f6efe1", "--ink": "#16140f", "--muted": "#5e584c", "--line": "#e6dcc8",
  "--outline": "#16140f", "--shadow-ink": "#16140f", "--outline-fill": "#16140f", "--brand": "#385cfc", "--brand-soft": "#e3e9ff",
  "--sun": "#ffd23f", "--on-sun": "#16140f", "--field-bg": "#ffffff", "--field-border": "#16140f", "--placeholder": "#777062",
  "--danger-fg": "#9f2518", "--danger-bg": "#ffe6e1", "--success-fg": "#0e5a36", "--warning-fg": "#664600",
  "--border-w": "1.5px", "--radius-lg": "10px", "--radius-md": "8px", "--focus-ring": "#385cfc",
};

/** Font file served by us (public/fonts, CORS header in next.config.ts) so the iframe uses the same Instrument Sans. */
export function stripeFonts(origin: string): CustomFontSource[] {
  return [{ family: "Instrument Sans", src: `url(${origin}/fonts/instrument-sans-latin.woff2) format("woff2")`, weight: "400 700", display: "swap" }];
}

export function stripeAppearance(read: TokenReader): Appearance {
  const t = (name: string) => read(name) || FALLBACK[name] || "";
  const border = `${t("--border-w")} solid ${t("--field-border")}`;
  const outline = `${t("--border-w")} solid ${t("--outline")}`;
  const hard = (px: number, color = t("--shadow-ink")) => `${px}px ${px}px 0 ${color}`;
  return {
    theme: "stripe",
    labels: "above",
    variables: {
      fontFamily: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
      fontSizeBase: "15px",
      fontWeightNormal: "400",
      fontWeightMedium: "600",
      fontWeightBold: "700",
      fontLineHeight: "1.45",
      colorPrimary: t("--brand"),
      colorBackground: t("--field-bg"),
      colorText: t("--ink"),
      colorTextSecondary: t("--muted"),
      colorTextPlaceholder: t("--placeholder"),
      colorDanger: t("--danger-fg"),
      colorSuccess: t("--success-fg"),
      colorWarning: t("--warning-fg"),
      colorIcon: t("--ink"),
      colorIconTab: t("--ink"),
      colorIconTabSelected: t("--on-sun"),
      borderRadius: t("--radius-lg"),
      spacingUnit: "4px",
      gridRowSpacing: "16px",
      gridColumnSpacing: "12px",
      tabSpacing: "10px",
      focusBoxShadow: hard(3, t("--brand")),
      focusOutline: "none",
    },
    rules: {
      ".Label": { fontWeight: "600", fontSize: "14px", color: t("--ink"), marginBottom: "6px" },
      ".Input": { border, boxShadow: "none", padding: "11px 14px", backgroundColor: t("--field-bg"), transition: "box-shadow .15s, border-color .15s" },
      ".Input:hover": { borderColor: t("--outline") },
      ".Input:focus": { borderColor: t("--brand"), boxShadow: hard(3, t("--brand")), outline: "none" },
      ".Input--invalid": { borderColor: t("--danger-fg"), boxShadow: "none", color: t("--ink") },
      ".Input--invalid:focus": { boxShadow: hard(3, t("--danger-fg")) },
      ".Input::placeholder": { color: t("--placeholder") },
      ".Error": { color: t("--danger-fg"), fontWeight: "500", fontSize: "13px" },
      ".Tab": { border: outline, backgroundColor: t("--surface"), boxShadow: hard(2), padding: "10px 12px", transition: "box-shadow .12s" },
      ".Tab:hover": { color: t("--ink"), boxShadow: hard(3) },
      ".Tab:focus": { boxShadow: hard(3, t("--brand")), borderColor: t("--brand") },
      ".Tab--selected": { backgroundColor: t("--sun"), color: t("--on-sun"), border: `${t("--border-w")} solid ${t("--outline-fill")}`, boxShadow: hard(2) },
      ".Tab--selected:focus": { boxShadow: hard(3, t("--brand")) },
      ".Tab--selected:hover": { color: t("--on-sun") },
      ".TabLabel": { fontWeight: "600" },
      ".TabIcon--selected": { fill: t("--on-sun") },
      ".Block": { border: outline, boxShadow: hard(2), backgroundColor: t("--surface") },
      ".AccordionItem": { border: outline, boxShadow: hard(2), backgroundColor: t("--surface") },
      ".AccordionItem--selected": { borderColor: t("--outline"), boxShadow: hard(3) },
      ".PickerItem": { border: outline, boxShadow: hard(2) },
      ".PickerItem--selected": { backgroundColor: t("--brand-soft"), borderColor: t("--brand"), boxShadow: hard(2, t("--brand")) },
      ".CheckboxInput": { border, boxShadow: "none" },
      ".CheckboxInput--checked": { backgroundColor: t("--brand"), borderColor: t("--brand") },
      ".TermsText": { color: t("--muted"), fontSize: "12.5px" },
      ".Link": { color: t("--brand"), textDecoration: "underline", fontWeight: "600" },
    },
  };
}
