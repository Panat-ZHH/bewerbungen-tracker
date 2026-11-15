// Error codes, HTTP status and friendly messages (Swiss German, no "ß") for the ai-review function.
// Pure module: runs in Deno and in Node (--experimental-strip-types).
import type { AiReviewError, AiReviewErrorCode } from "./types.ts";

export const ERROR_STATUS: Record<AiReviewErrorCode, number> = {
  unauthorized: 401,
  consent_required: 400,
  bad_request: 400,
  unsupported_file: 415,
  file_too_large: 413,
  no_text: 422,
  too_long: 413,
  rate_limited: 429,
  ai_failed: 502,
};

export const ERROR_MESSAGES: Record<AiReviewErrorCode, string> = {
  unauthorized: "Du bist nicht mehr angemeldet. Bitte melde dich neu an und versuche es dann nochmals.",
  consent_required: "Bitte bestätige zuerst, dass deine Bewerbung von einer KI geprüft werden darf.",
  bad_request: "Da hat etwas nicht geklappt. Bitte lade die Seite neu und versuche es nochmals.",
  unsupported_file: "Diese Datei können wir nicht lesen. Bitte lade deine Bewerbung als PDF oder als Word-Datei (.docx) hoch.",
  file_too_large: "Die Datei ist zu gross (höchstens 5 MB). Speichere sie kleiner ab, zum Beispiel ohne grosse Bilder.",
  no_text:
    "In deiner Datei haben wir fast keinen Text gefunden. Ist es vielleicht ein eingescanntes Blatt oder ein Foto? " +
    "Dann speichere deine Bewerbung direkt aus Word oder Pages als PDF und lade sie nochmals hoch.",
  too_long:
    "Deine Datei ist sehr lang (mehr als 20'000 Zeichen). Lade nur dein Bewerbungsschreiben hoch, ohne Lebenslauf, Zeugnisse und Anhänge.",
  rate_limited: "Für heute hast du alle Checks gebraucht. Morgen kannst du deine Bewerbung wieder prüfen lassen.",
  ai_failed: "Die KI antwortet gerade nicht. Bitte versuche es in ein paar Minuten nochmals.",
};

export class ReviewFailure extends Error {
  readonly code: AiReviewErrorCode;
  readonly status: number;
  readonly userMessage: string;
  constructor(code: AiReviewErrorCode, userMessage?: string, detail?: string) {
    super(detail ?? code);
    this.name = "ReviewFailure";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.userMessage = userMessage ?? ERROR_MESSAGES[code];
  }
  toBody(): AiReviewError {
    return { error: this.code, message: this.userMessage };
  }
}

export function isReviewFailure(e: unknown): e is ReviewFailure {
  return e instanceof ReviewFailure;
}
