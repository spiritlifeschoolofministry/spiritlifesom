/**
 * One shape for every model the school can call, so the fallback chain doesn't
 * care which vendor answers.
 *
 * An adapter takes an assembled prompt and returns plain text. Everything
 * vendor-shaped — endpoint, auth header, where the text sits in the response,
 * what a spent allowance looks like — stops here.
 *
 * Documents arrive as text, not as files. A PDF is read with pdf.js in the
 * browser and the words are sent; a 40MB course material through an edge
 * function is not viable, and the extracted opening is a few kilobytes.
 */

/** Bounds every upstream call, so one hanging provider can't hold the chain. */
const REQUEST_TIMEOUT_MS = 45_000;

export interface AdapterArgs {
  apiKey: string;
  model: string;
  prompt: string;
  /** Overrides a named provider's usual address; required for a custom one. */
  baseUrl?: string | null;
  /**
   * Ceiling on the answer. A one-line description needs a fraction of what a
   * batch of twenty drafted questions does, and these are free tiers.
   */
  maxTokens?: number;
}

export type Adapter = (args: AdapterArgs) => Promise<string>;

/**
 * Providers that speak OpenAI's /chat/completions, keyed by the name stored on
 * the row.
 *
 * Groq, Cerebras, OpenRouter and OpenCode Zen differ by an address and a key,
 * not by a protocol — so they share one implementation and appear here only to
 * carry a default endpoint and somewhere to send an admin looking for a model
 * name. `openai_compatible` is the escape hatch: it has no default address, so
 * the row must supply one.
 *
 * Model ids are deliberately absent. Every one of these rotates its free list,
 * so the console reads the live list from the provider rather than shipping a
 * guess that goes stale.
 */
export const OPENAI_COMPATIBLE: Record<
  string,
  { label: string; baseUrl: string; modelsUrl: string }
> = {
  groq: {
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    modelsUrl: "https://console.groq.com/docs/models",
  },
  cerebras: {
    label: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    modelsUrl: "https://inference-docs.cerebras.ai/models/overview",
  },
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    modelsUrl: "https://openrouter.ai/models?q=free",
  },
  opencode: {
    label: "OpenCode Zen",
    baseUrl: "https://opencode.ai/zen/v1",
    modelsUrl: "https://opencode.ai/docs/zen/",
  },
  openai_compatible: { label: "Other (OpenAI-compatible)", baseUrl: "", modelsUrl: "" },
};

/** The address to call for a row, preferring what the admin typed. */
export const resolveBaseUrl = (provider: string, baseUrl?: string | null): string =>
  (baseUrl || "").trim().replace(/\/+$/, "") || OPENAI_COMPATIBLE[provider]?.baseUrl || "";

/**
 * Why a provider didn't answer, in terms a screen can phrase.
 *
 * `gemini (gemini-3-flash): 429: {"error":{"code":429,…}}` is a true account of
 * a failure and a useless thing to read. An admin whose batch produced nothing
 * needs to know which of four quite different things happened — the allowance
 * is spent, the key is wrong, the model name is wrong, the vendor is down —
 * because the response to each differs, and in the first case *when it comes
 * back* is most of the answer.
 */
export type FailureKind =
  | "quota" // the allowance is spent; retryAfter/resetsAt say when it returns
  | "auth" // the key is missing, wrong, or not permitted
  | "model" // the model name is not one this key can call
  | "blocked" // refused by a safety filter
  | "overloaded" // the vendor is up but shedding load
  | "timeout"
  | "network"
  | "unknown";

export interface ProviderFailure {
  provider: string;
  model: string;
  kind: FailureKind;
  /** The vendor's own words, trimmed — the detail line under the summary. */
  detail: string;
  retryAfterSeconds?: number;
  /** ISO instant the allowance returns, where that can be worked out. */
  resetsAt?: string;
  /** Whether the spent allowance is a per-minute burst or a daily total. */
  quotaWindow?: "minute" | "day";
}

/** Carries the status and parsed body up to the classifier. */
class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly rawText: string,
    readonly headers: Headers,
  ) {
    super(`${status}: ${rawText.slice(0, 300)}`);
  }
}

/** "27s" / "1.5s" / "27" → seconds. Google sends a duration string, not a number. */
const parseDuration = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const match = value.match(/^([\d.]+)s?$/);
  const seconds = match ? Number(match[1]) : NaN;
  return Number.isFinite(seconds) ? seconds : undefined;
};

/**
 * Midnight in Los Angeles, as an instant.
 *
 * Google's free-tier daily allowances roll over at midnight Pacific rather than
 * on the hour the school ran out, so "you have used today's requests" is only
 * useful next to the local time it comes back. Worked out by asking Intl what
 * the Pacific date is now and stepping to the next one, so it stays right
 * across both US daylight-saving changes without a table of dates.
 */
const nextPacificMidnight = (from = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(from);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  // How far into the Pacific day we are, subtracted from 24h, gives the gap to
  // the next Pacific midnight — no need to know the offset itself.
  const elapsed = (get("hour") % 24) * 3600 + get("minute") * 60 + get("second");
  return new Date(from.getTime() + (86_400 - elapsed) * 1000).toISOString();
};

const trimDetail = (body: unknown, rawText: string): string => {
  const message = (body as { error?: { message?: string } })?.error?.message;
  return String(message || rawText || "").replace(/\s+/g, " ").trim().slice(0, 240);
};

const geminiFailure = (err: ProviderHttpError): Partial<ProviderFailure> => {
  const details = (err.body as { error?: { details?: unknown[] } })?.error?.details ?? [];
  const find = (suffix: string) =>
    details.find((d) => String((d as { "@type"?: string })?.["@type"] || "").endsWith(suffix)) as
      | Record<string, unknown>
      | undefined;

  if (err.status === 429) {
    // A zero delay is Google's way of saying it has nothing to tell you — it
    // comes back on a spent *daily* quota, where the honest answer is a
    // wall-clock time rather than a countdown. Passing the 0 on would let it
    // stand in for that answer downstream, so it is dropped here.
    const delay = parseDuration(find("RetryInfo")?.retryDelay);
    const retryAfterSeconds = delay !== undefined && delay > 0 ? delay : undefined;
    const violations = (find("QuotaFailure")?.violations ?? []) as { quotaId?: string }[];
    const perDay = violations.some((v) => /PerDay/i.test(String(v.quotaId || "")));
    return {
      kind: "quota",
      quotaWindow: perDay ? "day" : "minute",
      retryAfterSeconds,
      resetsAt: perDay
        ? nextPacificMidnight()
        : retryAfterSeconds !== undefined
          ? new Date(Date.now() + retryAfterSeconds * 1000).toISOString()
          : undefined,
    };
  }
  if (err.status === 404) return { kind: "model" };
  if (err.status === 401 || err.status === 403) return { kind: "auth" };
  if (err.status === 400) {
    const detail = trimDetail(err.body, err.rawText);
    if (/API key|API_KEY_INVALID|credential/i.test(detail)) return { kind: "auth" };
    return { kind: "unknown" };
  }
  if (err.status >= 500 || err.status === 529) return { kind: "overloaded" };
  return { kind: "unknown" };
};

const anthropicFailure = (err: ProviderHttpError): Partial<ProviderFailure> => {
  if (err.status === 429) {
    // Anthropic answers with the standard header rather than a body field.
    const retryAfterSeconds = parseDuration(err.headers.get("retry-after") ?? undefined);
    return {
      kind: "quota",
      quotaWindow: "minute",
      retryAfterSeconds,
      resetsAt: retryAfterSeconds !== undefined
        ? new Date(Date.now() + retryAfterSeconds * 1000).toISOString()
        : undefined,
    };
  }
  if (err.status === 401 || err.status === 403) return { kind: "auth" };
  if (err.status === 404) return { kind: "model" };
  if (err.status === 400 && /model/i.test(trimDetail(err.body, err.rawText))) {
    return { kind: "model" };
  }
  if (err.status === 529 || err.status >= 500) return { kind: "overloaded" };
  return { kind: "unknown" };
};

/**
 * The OpenAI-shaped gateways.
 *
 * They agree on status codes far more than on bodies, so the status carries
 * most of it. 429 is the one worth reading further: the standard `retry-after`
 * header is how all of them say when the allowance returns, and a daily cap is
 * usually only distinguishable from a per-minute one by how long that is.
 */
const openAiFailure = (err: ProviderHttpError): Partial<ProviderFailure> => {
  if (err.status === 429) {
    const retryAfterSeconds = parseDuration(err.headers.get("retry-after") ?? undefined);
    const detail = trimDetail(err.body, err.rawText);
    const perDay = /per day|daily|rpd/i.test(detail) ||
      (retryAfterSeconds !== undefined && retryAfterSeconds > 3600);
    return {
      kind: "quota",
      quotaWindow: perDay ? "day" : "minute",
      retryAfterSeconds,
      resetsAt: retryAfterSeconds !== undefined
        ? new Date(Date.now() + retryAfterSeconds * 1000).toISOString()
        : undefined,
    };
  }
  if (err.status === 401 || err.status === 403) return { kind: "auth" };
  if (err.status === 404) return { kind: "model" };
  if (err.status === 402) return { kind: "quota", quotaWindow: "day" };
  if (err.status === 400) {
    // A retired free model is the likeliest failure on these gateways, and most
    // report it as a 400 rather than a 404.
    if (/model/i.test(trimDetail(err.body, err.rawText))) return { kind: "model" };
    return { kind: "unknown" };
  }
  if (err.status >= 500) return { kind: "overloaded" };
  return { kind: "unknown" };
};

/** Turns whatever an adapter threw into something a screen can phrase. */
export const classifyFailure = (
  provider: string,
  model: string,
  err: unknown,
): ProviderFailure => {
  const base = { provider, model };

  if (err instanceof ProviderHttpError) {
    const classify = provider === "anthropic"
      ? anthropicFailure
      : provider === "gemini"
        ? geminiFailure
        : openAiFailure;
    return {
      ...base,
      detail: trimDetail(err.body, err.rawText),
      ...classify(err),
    } as ProviderFailure;
  }

  const message = err instanceof Error ? err.message : String(err);
  if (/abort/i.test(message)) {
    return { ...base, kind: "timeout", detail: "The provider did not answer in time." };
  }
  if (/fetch|network|dns|connect/i.test(message)) {
    return { ...base, kind: "network", detail: message.slice(0, 240) };
  }
  // An answer that arrived but held nothing usable — a safety block, or a
  // response tidied down to nothing.
  if (/returned nothing|blocked|safety/i.test(message)) {
    return { ...base, kind: "blocked", detail: message.slice(0, 240) };
  }
  return { ...base, kind: "unknown", detail: message.slice(0, 240) };
};

/** A failure in one sentence an admin can act on. */
export const describeFailure = (f: ProviderFailure): string => {
  const when = f.resetsAt
    ? ` It should work again after ${
      new Date(f.resetsAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    }.`
    : f.retryAfterSeconds
      ? ` Try again in about ${Math.ceil(f.retryAfterSeconds)} seconds.`
      : "";
  switch (f.kind) {
    case "quota":
      return `${f.provider} has used up its ${
        f.quotaWindow === "day" ? "daily" : "per-minute"
      } allowance.${when}`;
    case "auth":
      return `${f.provider}'s API key is missing, wrong or not permitted.`;
    case "model":
      return `${f.provider} does not offer "${f.model}" to this key — pick another model.`;
    case "blocked":
      return `${f.provider} refused the request: ${f.detail}`;
    case "overloaded":
      return `${f.provider} is overloaded.${when}`;
    case "timeout":
      return `${f.provider} did not answer in time.`;
    case "network":
      return `${f.provider} could not be reached.`;
    default:
      return `${f.provider} failed: ${f.detail}`;
  }
};

const withTimeout = async <T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
};

const getJson = (url: string, headers: Record<string, string>) =>
  withTimeout(async (signal) => {
    const res = await fetch(url, { headers, signal });
    const text = await res.text();
    if (!res.ok) {
      let body: unknown = null;
      try {
        body = JSON.parse(text);
      } catch { /* some gateways answer in HTML */ }
      throw new ProviderHttpError(res.status, body, text, res.headers);
    }
    return JSON.parse(text);
  });

const postJson = (url: string, headers: Record<string, string>, payload: unknown) =>
  withTimeout(async (signal) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
      signal,
    });
    const text = await res.text();
    if (!res.ok) {
      // Status, body and headers all travel up: between them they say whether
      // this is a spent allowance, a bad key or a wrong model name, and when
      // the first of those comes back. `classifyFailure` reads them.
      let body: unknown = null;
      try {
        body = JSON.parse(text);
      } catch { /* some gateways answer in HTML */ }
      throw new ProviderHttpError(res.status, body, text, res.headers);
    }
    return JSON.parse(text);
  });

const gemini: Adapter = async ({ apiKey, model, prompt, maxTokens = 800 }) => {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  /**
   * `maxOutputTokens` is a budget for thinking as well as for the answer, and
   * recent Gemini models think by default — so the ceiling is set well above
   * the answer's own size or the text comes back cut off mid-phrase with
   * finishReason MAX_TOKENS.
   *
   * `thinkingLevel: minimal` is what keeps that headroom from being spent.
   * Almost nothing here needs deliberation — writing one sentence from four
   * metadata fields, or picking tags from a list — and leaving thinking at its
   * default costs roughly ten times the tokens for an answer that measures no
   * better.
   */
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: Math.max(maxTokens, 1200),
      temperature: 0.7,
      thinkingConfig: { thinkingLevel: "minimal" },
    },
  };

  /**
   * Thinking control, degrading one step at a time.
   *
   * `minimal` is what keeps the headroom above from being spent, but Google is
   * withdrawing it: `gemini-3-flash-preview` accepts it and spends 0 thinking
   * tokens, while 3.7-flash, 3.8-flash and `gemini-flash-latest` reject the
   * whole request with a 400.
   *
   * So a rejection steps down to `low` before giving up on the knob entirely,
   * because those are very different bills. Measured on one 140-character
   * sentence: `low` on 3.8-flash spent 0 thinking tokens, whereas the same
   * model left at its default on 3.7-flash spent 679 — fourteen times the
   * total for an answer no better. Dropping straight to the default, as this
   * used to, quietly bought that.
   */
  const attempts = [
    body,
    { ...body, generationConfig: { ...body.generationConfig, thinkingConfig: { thinkingLevel: "low" } } },
    (() => {
      const { thinkingConfig: _dropped, ...generationConfig } = body.generationConfig;
      return { ...body, generationConfig };
    })(),
  ];

  let data;
  for (const [index, attempt] of attempts.entries()) {
    try {
      data = await postJson(url, { "x-goog-api-key": apiKey }, attempt);
      break;
    } catch (err) {
      // Only an argument the model refuses is worth retrying differently. A
      // spent quota or a bad key fails the same way whatever is asked of it.
      const last = index === attempts.length - 1;
      if (last || !(err instanceof ProviderHttpError) || err.status !== 400) throw err;
    }
  }

  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.map((p: { text?: string }) => p?.text || "").join("") ||
    "";
  if (!text.trim()) {
    // A blocked prompt comes back 200 with no text and a reason, so an empty
    // answer has to raise or the chain would count it as a success.
    const reason = candidate?.finishReason || data?.promptFeedback?.blockReason ||
      "no text returned";
    throw new Error(`Gemini returned nothing (${reason})`);
  }
  return text;
};

const anthropic: Adapter = async ({ apiKey, model, prompt, maxTokens = 800 }) => {
  const data = await postJson(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    { model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] },
  );

  const text = (data?.content || [])
    .filter((b: { type?: string }) => b?.type === "text")
    .map((b: { text?: string }) => b?.text || "")
    .join("");
  if (!text.trim()) throw new Error(`Claude returned nothing (${data?.stop_reason || "unknown"})`);
  return text;
};

/**
 * The one implementation behind every OpenAI-compatible provider.
 *
 * `max_completion_tokens` rather than the older `max_tokens`: several of these
 * gateways front reasoning models that reject the legacy field, and the ones
 * that don't accept both. Reasoning tokens count against the ceiling the same
 * way Gemini's thinking does, hence the headroom.
 */
const openAiCompatible: Adapter = async ({ apiKey, model, prompt, baseUrl, maxTokens = 800 }) => {
  const root = resolveBaseUrl("", baseUrl);
  if (!root) throw new Error("No API address is set for this provider.");

  const data = await postJson(
    `${root}/chat/completions`,
    { Authorization: `Bearer ${apiKey}` },
    {
      model,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: Math.max(maxTokens, 1200),
      temperature: 0.7,
    },
  );

  const choice = data?.choices?.[0];
  const text = choice?.message?.content ?? "";
  if (!String(text).trim()) {
    // A refusal or a filtered answer arrives as a 200 with nothing in it, so an
    // empty string has to raise or the chain would count it as a success.
    throw new Error(`No text returned (${choice?.finish_reason || "unknown reason"})`);
  }
  return String(text);
};

/**
 * Every provider the chain can call. The gateways share one function and differ
 * only in the address `resolveBaseUrl` hands it.
 */
export const ADAPTERS: Record<string, Adapter> = {
  gemini,
  anthropic,
  ...Object.fromEntries(
    Object.keys(OPENAI_COMPATIBLE).map((name) => [
      name,
      ((args: AdapterArgs) =>
        openAiCompatible({ ...args, baseUrl: resolveBaseUrl(name, args.baseUrl) })) as Adapter,
    ]),
  ),
};

export const SUPPORTED_PROVIDERS = Object.keys(ADAPTERS);

/**
 * The models a key can actually call, read from the provider itself.
 *
 * Free model lists on these gateways rotate, so a name that worked last month
 * is the likeliest reason generation stops. Rather than ask an admin to go and
 * look one up — and paste it exactly — the console asks the provider. Gemini's
 * listing is a different shape and path, so it is read separately rather than
 * pretended into this one.
 */
export const listModels = async (
  provider: string,
  apiKey: string,
  baseUrl?: string | null,
): Promise<string[]> => {
  if (provider === "anthropic") {
    const data = await getJson("https://api.anthropic.com/v1/models", {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    });
    return (data?.data ?? []).map((m: { id?: string }) => String(m?.id || "")).filter(Boolean);
  }

  if (provider === "gemini") {
    const data = await getJson("https://generativelanguage.googleapis.com/v1beta/models", {
      "x-goog-api-key": apiKey,
    });
    return (data?.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) =>
        (m.supportedGenerationMethods ?? []).includes("generateContent")
      )
      .map((m: { name?: string }) => String(m?.name || "").replace(/^models\//, ""))
      .filter(Boolean);
  }

  const root = resolveBaseUrl(provider, baseUrl);
  if (!root) throw new Error("No API address is set for this provider.");
  const data = await getJson(`${root}/models`, { Authorization: `Bearer ${apiKey}` });
  return (data?.data ?? []).map((m: { id?: string }) => String(m?.id || "")).filter(Boolean);
};
