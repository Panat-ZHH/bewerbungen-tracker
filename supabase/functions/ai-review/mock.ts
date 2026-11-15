// Mock review: used when ANTHROPIC_API_KEY is missing or AI_REVIEW_MOCK=1.
// Deterministic (same input → same result) and derived from simple text heuristics, so the UI can be tested
// with realistic-looking but clearly rule-based feedback. Pure module, runs in Deno and Node.
import { AI_REVIEW_CATEGORIES, type AiReviewCategory, type AiReviewCategoryKey, type AiReviewResult, type AiReviewTip } from "./types.ts";

export const MOCK_MODEL = "mock";

export interface MockInput {
  text: string;
  company?: string;
  beruf?: string;
  jobAd?: string;
}

export interface TextSignals {
  chars: number;
  words: number;
  paragraphs: number;
  hasAnrede: boolean;
  hasGruss: boolean;
  mentionsCompany: boolean;
  mentionsBeruf: boolean;
  motivationHits: number;
  hasEszett: boolean;
  exclamations: number;
  firstSentence: string;
}

const ANREDE = /\b(sehr geehrte[rn]?|guten tag|grüezi|gruezi|liebe[rs]?\s+(frau|herr|team))\b/i;
const GRUSS = /\b(freundliche[n]?\s+gr(ü|ue)ss|beste[n]?\s+gr(ü|ue)ss|liebe[n]?\s+gr(ü|ue)ss|herzliche[n]?\s+gr(ü|ue)ss)/i;
const MOTIVATION = /\b(weil|interessier\w*|freue|freude|begeister\w*|motivier\w*|schnupper\w*|gefällt|gefallen|spass)\b/gi;

function significantWord(s: string): string | null {
  const w = s
    .toLowerCase()
    .split(/[^a-zäöüéèàç0-9]+/i)
    .filter((x) => x.length >= 3 && !["ag", "gmbh", "sa", "und", "the"].includes(x))
    .sort((a, b) => b.length - a.length)[0];
  return w ?? null;
}

export function textSignals(input: MockInput): TextSignals {
  const text = input.text;
  const lower = text.toLowerCase();
  const companyWord = input.company ? significantWord(input.company) : null;
  const berufWord = input.beruf ? significantWord(input.beruf) : null;
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 20);
  const body = sentences.find((s) => !ANREDE.test(s)) ?? sentences[0] ?? "";
  return {
    chars: text.length,
    words: text.split(/\s+/).filter(Boolean).length,
    paragraphs: text.split(/\n\s*\n|\n/).filter((p) => p.trim().length > 0).length,
    hasAnrede: ANREDE.test(text),
    hasGruss: GRUSS.test(text),
    mentionsCompany: Boolean(companyWord && lower.includes(companyWord)),
    mentionsBeruf: Boolean(berufWord && lower.includes(berufWord)),
    motivationHits: (text.match(MOTIVATION) ?? []).length,
    hasEszett: text.includes("ß"),
    exclamations: (text.match(/!/g) ?? []).length,
    firstSentence: body.length > 140 ? `${body.slice(0, 137).trimEnd()}…` : body,
  };
}

const clamp = (n: number) => Math.max(0, Math.min(20, Math.round(n)));

export function mockScores(s: TextSignals, hasCompanyInfo: boolean): Record<AiReviewCategoryKey, number> {
  const lengthOk = s.words >= 120 && s.words <= 450;
  return {
    aufbau: clamp(8 + (s.hasAnrede ? 4 : 0) + (s.hasGruss ? 4 : 0) + (s.paragraphs >= 4 ? 3 : s.paragraphs >= 2 ? 1 : 0)),
    sprache: clamp(11 + (lengthOk ? 4 : 0) - (s.exclamations > 2 ? 3 : 0)),
    motivation: clamp(7 + Math.min(4, s.motivationHits) * 3),
    passung: clamp((hasCompanyInfo ? 6 : 9) + (s.mentionsCompany ? 6 : 0) + (s.mentionsBeruf ? 4 : 0)),
    rechtschreibung: clamp(16 - (s.hasEszett ? 3 : 0) - (s.exclamations > 2 ? 1 : 0)),
  };
}

const COMMENTS: Record<AiReviewCategoryKey, (score: number, s: TextSignals) => string> = {
  aufbau: (_n, s) =>
    s.hasAnrede && s.hasGruss ? "Anrede, Text und Gruss sind da – das ist ein guter Aufbau." : "Es fehlt noch ein Teil vom klassischen Briefaufbau.",
  sprache: (n) => (n >= 14 ? "Dein Text ist gut lesbar." : "Einige Sätze kannst du noch klarer schreiben."),
  motivation: (n) => (n >= 13 ? "Man merkt, warum dich die Lehre interessiert." : "Schreib noch genauer, warum du genau diese Lehre willst."),
  passung: (_n, s) => (s.mentionsCompany ? "Du sprichst die Firma direkt an." : "Die Firma kommt im Text noch kaum vor."),
  rechtschreibung: (_n, s) => (s.hasEszett ? "In der Schweiz schreibt man immer «ss», nie das deutsche Eszett." : "Wir haben keine groben Fehler gefunden."),
};

/** Builds a plausible AiReviewResult from heuristics. Always satisfies the contract (5 categories, list sizes). */
export function mockReview(input: MockInput): AiReviewResult {
  const s = textSignals(input);
  const hasCompanyInfo = Boolean(input.company || input.jobAd);
  const scores = mockScores(s, hasCompanyInfo);
  const breakdown: AiReviewCategory[] = AI_REVIEW_CATEGORIES.map(({ key, label }) => ({
    key,
    label,
    score: scores[key],
    comment: COMMENTS[key](scores[key], s),
  }));
  const score = breakdown.reduce((sum, c) => sum + c.score, 0);
  const company = input.company?.trim();
  const beruf = input.beruf?.trim() || "diese Lehre";
  const quote = s.firstSentence || "fehlt";

  const good: string[] = [];
  if (s.hasAnrede) good.push("Du beginnst mit einer höflichen Anrede.");
  if (s.hasGruss) good.push("Dein Brief endet mit einem passenden Gruss.");
  if (s.motivationHits > 0) good.push("Du schreibst, was dich an der Lehre interessiert.");
  if (s.mentionsCompany) good.push("Du nennst die Firma beim Namen.");
  if (s.words >= 120) good.push("Dein Text hat eine gute Länge.");
  const fallbacks = ["Du hast den Mut gehabt, deine Bewerbung prüfen zu lassen – super!", "Dein Text ist sauber gegliedert."];
  for (const f of fallbacks) if (good.length < 2) good.push(f);

  const improve: AiReviewTip[] = [];
  if (!s.hasAnrede) {
    improve.push({
      tipp: "Beginne mit einer persönlichen Anrede.",
      beispiel: { vorher: "fehlt", nachher: "Sehr geehrte Frau Muster", warum: "Mit dem Namen fühlt sich die Person direkt angesprochen." },
    });
  }
  if (s.motivationHits < 2) {
    improve.push({
      tipp: "Schreib ein konkretes Erlebnis, das zeigt, warum du diesen Beruf willst.",
      beispiel: {
        vorher: quote,
        nachher: `Beim Schnuppern habe ich gemerkt, dass mir ${beruf === "diese Lehre" ? "diese Arbeit" : `die Arbeit als ${beruf}`} richtig Freude macht.`,
        warum: "Ein echtes Beispiel ist glaubwürdiger als eine allgemeine Aussage.",
      },
    });
  }
  if (!s.hasGruss) {
    improve.push({
      tipp: "Schliesse mit einem Gruss und deinem Namen ab.",
      beispiel: { vorher: "fehlt", nachher: "Freundliche Grüsse\nVorname Nachname", warum: "So wirkt dein Brief vollständig und höflich." },
    });
  }
  if (s.hasEszett) {
    improve.push({
      // No literal Eszett here: normalizeReview turns every one into "ss", which would garble the tip.
      tipp: "Schreib überall «ss» statt dem deutschen Eszett, zum Beispiel bei «Grüsse» oder «gross».",
    });
  }
  improve.push({
    tipp: "Biete zum Schluss ein Gespräch oder eine Schnupperlehre an.",
    beispiel: {
      vorher: "fehlt",
      nachher: "Gerne zeige ich Ihnen in einem Gespräch oder bei einer Schnupperlehre, was ich kann.",
      warum: "So weiss die Firma, wie es weitergehen kann.",
    },
  });
  if (improve.length < 2) improve.unshift({ tipp: "Lies deinen Text einmal laut vor und kürze lange Sätze." });

  const companyTips: AiReviewTip[] = [];
  if (hasCompanyInfo) {
    const name = company || "die Firma";
    if (!s.mentionsCompany) {
      companyTips.push({
        tipp: `Nenne ${company ? company : "die Firma"} im Text und sag, was dir dort gefällt.`,
        beispiel: {
          vorher: "fehlt",
          nachher: `Mir gefällt, dass ${name} Lernende gut begleitet und ich bei Ihnen viel Praxis sammeln kann.`,
          warum: "So merkt die Firma, dass du dich wirklich für sie interessierst.",
        },
      });
    }
    companyTips.push({ tipp: "Nimm ein Stichwort aus dem Inserat auf und zeig mit einem Beispiel, dass du es mitbringst." });
  }

  const weakest = [...breakdown].sort((a, b) => a.score - b.score)[0];
  return {
    score,
    summary:
      score >= 70
        ? "Das ist schon eine starke Bewerbung! Mit ein paar kleinen Änderungen wird sie noch besser."
        : "Du hast einen guten Anfang gemacht. Mit den Tipps unten wird deine Bewerbung deutlich stärker.",
    breakdown,
    good: good.slice(0, 4),
    improve: improve.slice(0, 5),
    company: companyTips.slice(0, 3),
    nextStep: `Starte mit dem Bereich «${weakest.label}» – dort holst du am meisten Punkte.`,
  };
}
