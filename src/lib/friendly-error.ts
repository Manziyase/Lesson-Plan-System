export type FbError = { code: string; message: string };

/** Turn a raw API error response (or thrown error) into a friendly, plain-language message for normal users. */
export function toUserError(err: unknown): FbError {
  // The api() wrapper throws an Error whose .message is the raw server text;
  // the parsed response body is carried on .raw. Normalise both shapes here so
  // this helper never has to know where the error came from.
  const source = err as { message?: string; status?: number; raw?: unknown; code?: string; error?: unknown };
  const body = source.raw ?? source;
  const fallback =
    "We could not save this. Please check what you entered and try again, or ask your administrator for help.";

  // Network-level failures (no server at all).
  if (source.message && typeof source.message === "string" && (source.message.includes("fetch") || source.message.includes("Failed to fetch"))) {
    return { code: "offline", message: "We could not reach the server. Check your connection and try again." };
  }

  // JSON body errors from the API.
  if (typeof body === "object" && body !== null) {
    const r = body as { error?: unknown; errors?: unknown; message?: unknown };
    const msg = typeof r.error === "string" ? r.error : typeof r.message === "string" ? r.message : null;
    const first = Array.isArray(r.errors)
      ? (r.errors as unknown[]).find((x) => typeof x === "string" && x.length > 0)
      : null;

    // Technical validation messages from the server (Joi/Prisma style) are
    // replaced with a plain, friendly explanation for normal users.
    const technical = [
      "A valid date string",
      "is not a valid",
      "got an unexpected type",
      "Expected type",
      "Validation failed",
      "value must be",
      "must be a",
      "failed because",
      "Object is not valid",
      "cannot be converted",
      "SyntaxError",
      "Prisma",
      "property [], path",
      ": Path",
      "is not allowed",
      "not found",
      "Duplicate",
      "already exists",
    ];
    if (typeof msg === "string" && msg.length < 200 && technical.some((t) => msg.toLowerCase().includes(t))) {
      return { code: "validation", message: "Please check the highlighted information and try again." };
    }
    const friendly = msg ?? first ?? (typeof r.message === "string" ? r.message : null);
    if (typeof friendly === "string" && friendly.length > 0 && friendly.length < 200) {
      return { code: String(source.status ?? "server"), message: friendlyMessage(friendly) };
    }
  }

  // Common HTTP scenarios — server-friendly, customer-friendly wording.
  switch (source.status) {
    case 400:
      return { code: "bad_req", message: "Please fix the highlighted information and try again." };
    case 401:
      return { code: "unauthorized", message: "Your sign-in has expired. Sign in again to continue." };
    case 403:
      return { code: "forbidden", message: "You do not have permission to do that. Ask your administrator." };
    case 404:
      return { code: "not_found", message: "We could not find that record. It may have been removed." };
    case 409:
      return { code: "conflict", message: "That item already exists. Please choose a different one." };
    case 422:
      return { code: "invalid", message: "There is a problem with the information you entered. Please review and try again." };
    case 429:
      return { code: "too_many", message: "You have tried too many times. Please wait a moment and try again." };
    case 500:
      return { code: "server", message: "The server encountered a problem. Please try again in a moment." };
    case 503:
      return { code: "service", message: "The service is temporarily unavailable. Please try again shortly." };
    default:
      break;
  }

  // Fall back to the raw server text when it is user-safe.
  if (typeof source.message === "string" && source.message.length > 0 && !source.message.includes("fetch")) {
    return { code: "server", message: friendlyMessage(source.message) };
  }

  return { code: "unknown", message: fallback };
}

/**
 * Map a technical server message into something a normal user can act on.
 * Keeps the developer-readable detail out of the UI while staying honest
 * enough that the user is not left guessing.
 */
function friendlyMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("date") && lower.includes("invalid")) return "Please enter a valid date (YYYY-MM-DD) in the field.";
  if (lower.includes("required") || lower.includes("must be provided")) return "This field is required. Please fill it in.";
  if (lower.includes("email") && lower.includes("invalid")) return "Please enter a valid email address.";
  if (lower.includes("password") && lower.includes("length")) return "Your password must be at least 6 characters long.";
  if (lower.includes("already exists") || lower.includes("duplicate")) return "That item already exists. Please choose a different one.";
  if (lower.includes("not found")) return "We could not find that record. It may have been removed.";
  if (lower.includes("constraint") || lower.includes("unique")) return "This item already exists in the school. Please choose a different one.";
  if (lower.includes("prisma") || lower.includes("syntaxerror") || lower.includes("unexpected")) return "The server could not understand your request. Please check what you entered and try again.";
  return raw;
}
