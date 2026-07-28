/**
 * Provider-agnostic streaming text generation.
 *
 * Wayfare has now been through Claude, Groq and Gemini, and each migration
 * happened because one provider's quota ran out. The cause was never the
 * provider — it was having exactly one. This tries each configured provider
 * in order and only fails when they all do.
 *
 * A provider is skipped silently when its key is absent, so adding resilience
 * is a matter of setting an env var rather than changing code.
 *
 * Order is deliberate: cheapest-with-headroom first, so a working free tier
 * absorbs normal traffic and paid credit is spent only as a fallback.
 */

export interface GenerateOptions {
  system: string;
  user: string;
  signal?: AbortSignal;
}

/**
 * Completion cap per model. Asking for more than a model permits is rejected
 * with HTTP 413 before any generation happens, so these are correctness
 * settings rather than tuning — and they differ per model, which is why they
 * cannot live in one shared constant.
 */
interface ModelSpec {
  id: string;
  maxTokens: number;
}

interface Provider {
  name: string;
  /** Present only when the environment supplies a key. */
  enabled: () => boolean;
  /** Models tried in order within this provider. */
  models: ModelSpec[];
  request: (model: ModelSpec, opts: GenerateOptions) => Promise<Response>;
  /** Pulls the incremental text out of one SSE `data:` payload. */
  extract: (parsed: unknown) => string | undefined;
}

/* ── Gemini ─────────────────────────────────────────────────────────── */

const gemini: Provider = {
  name: "gemini",
  enabled: () => Boolean(process.env.GEMINI_API_KEY),
  models: [
    { id: "gemini-3.5-flash", maxTokens: 8192 },
    { id: "gemini-3.1-flash-lite", maxTokens: 8192 },
    { id: "gemini-flash-latest", maxTokens: 8192 },
  ],
  request: (model, { system, user, signal }) =>
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:streamGenerateContent?key=${process.env.GEMINI_API_KEY}&alt=sse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
        }),
        signal,
      }
    ),
  extract: (d) =>
    (d as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
      ?.candidates?.[0]?.content?.parts?.[0]?.text,
};

/* ── Groq (OpenAI-compatible) ───────────────────────────────────────── */

const groq: Provider = {
  name: "groq",
  enabled: () => Boolean(process.env.GROQ_API_KEY),
  // Production models only — preview models can be withdrawn at short notice,
  // which is the fragility this file exists to avoid.
  //
  // Probed against the live free-tier account: openai/gpt-oss-120b and
  // llama-3.1-8b-instant both return 413 for a request this size, so they are
  // not listed. maxTokens is the completion cap the model accepts, not a
  // preference — exceeding it is rejected before any generation happens.
  // 8192 is accepted by this model — the earlier 413s came from prompt size,
  // not the completion cap, and search results are now clipped upstream. The
  // itinerary is ~15 sections, so a low cap shows up directly as thin days.
  models: [{ id: "llama-3.3-70b-versatile", maxTokens: 8192 }],
  request: (model, { system, user, signal }) =>
    fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: model.id,
        stream: true,
        temperature: 0.7,
        max_tokens: model.maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal,
    }),
  extract: (d) =>
    (d as { choices?: { delta?: { content?: string } }[] })?.choices?.[0]?.delta
      ?.content,
};

/* ── OpenRouter (OpenAI-compatible, optional) ───────────────────────── */

const openrouter: Provider = {
  name: "openrouter",
  enabled: () => Boolean(process.env.OPENROUTER_API_KEY),
  models: [
    { id: "meta-llama/llama-3.3-70b-instruct:free", maxTokens: 4096 },
    { id: "mistralai/mistral-small-3.2-24b-instruct:free", maxTokens: 4096 },
  ],
  request: (model, { system, user, signal }) =>
    fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://wayfare-xi.vercel.app",
        "X-Title": "Wayfare",
      },
      body: JSON.stringify({
        model: model.id,
        stream: true,
        temperature: 0.7,
        max_tokens: model.maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal,
    }),
  extract: (d) =>
    (d as { choices?: { delta?: { content?: string } }[] })?.choices?.[0]?.delta
      ?.content,
};

/** Free tiers first, so paid credit is only spent when they are exhausted. */
const PROVIDERS: Provider[] = [groq, gemini, openrouter];

/** Status codes worth trying the next model or provider for. */
const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export class AllProvidersFailed extends Error {
  constructor(public readonly tried: string[]) {
    super(
      tried.length
        ? "Every planning provider is unavailable right now. Please try again shortly."
        : "No planning provider is configured."
    );
    this.name = "AllProvidersFailed";
  }
}

/**
 * Streams generated text as a ReadableStream of UTF-8 chunks.
 *
 * Failover only happens before the first token. Once a provider has started
 * emitting we stay with it — switching mid-document would splice two
 * different itineraries together, which is worse than a truncated one.
 */
export function generateStream(opts: GenerateOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const tried: string[] = [];

      for (const provider of PROVIDERS) {
        if (!provider.enabled()) continue;

        for (const model of provider.models) {
          const label = `${provider.name}/${model.id}`;
          let res: Response;

          try {
            res = await provider.request(model, opts);
          } catch (err) {
            if ((err as Error)?.name === "AbortError") {
              controller.close();
              return;
            }
            console.error(`[llm] ${label} network error:`, err);
            tried.push(label);
            continue;
          }

          if (!res.ok || !res.body) {
            // Read the body so the connection is released, and log it
            // server-side — it must never reach the client, since upstream
            // errors carry billing and quota details.
            const detail = await res.text().catch(() => "");
            console.error(`[llm] ${label} HTTP ${res.status}: ${detail.slice(0, 300)}`);
            tried.push(label);
            if (RETRYABLE.has(res.status)) continue;
            // A non-retryable error is specific to this provider (bad key,
            // unknown model), so move on to the next provider rather than
            // burning the remaining models here.
            break;
          }

          // Committed to this provider from here on.
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let emitted = false;

          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";

              for (const line of lines) {
                if (!line.startsWith("data:")) continue;
                const payload = line.slice(5).trim();
                if (!payload || payload === "[DONE]") continue;

                try {
                  const text = provider.extract(JSON.parse(payload));
                  if (text) {
                    emitted = true;
                    controller.enqueue(encoder.encode(text));
                  }
                } catch {
                  /* partial SSE frame — the next chunk completes it */
                }
              }
            }
          } catch (err) {
            if ((err as Error)?.name === "AbortError") {
              controller.close();
              return;
            }
            console.error(`[llm] ${label} stream aborted:`, err);
          } finally {
            reader.releaseLock();
          }

          if (emitted) {
            controller.close();
            return;
          }

          // Connected but produced nothing — treat as a failure and continue.
          console.error(`[llm] ${label} returned an empty stream`);
        }
      }

      // Nothing worked. Surface a clean message; details are in the logs.
      const failure = new AllProvidersFailed(tried);
      console.error(`[llm] all providers failed. Tried: ${tried.join(", ") || "none"}`);
      controller.enqueue(encoder.encode(`\n\n[Error: ${failure.message}]`));
      controller.close();
    },
  });
}

/** True when at least one provider has credentials — used for health checks. */
export function hasProvider(): boolean {
  return PROVIDERS.some((p) => p.enabled());
}

/**
 * Which providers the running server can actually see, as booleans.
 *
 * Deliberately reports only presence and key length — never a key, or any
 * part of one. Environment variables are baked in at build time on Vercel,
 * so "I added the variable" and "the running deployment has it" are
 * different claims, and this is the only way to tell them apart from
 * outside.
 */
/**
 * Sends a one-token request to every configured model and reports what came
 * back. Returns status codes and a short reason only — never a response body,
 * which can carry account details.
 *
 * Exists because a failing provider is otherwise only visible in server logs,
 * and "the key is set" does not imply "the key works with this model".
 */
export async function probeProviders() {
  const results: {
    provider: string;
    model: string;
    status: number | string;
    ok: boolean;
    reason: string;
  }[] = [];

  for (const provider of PROVIDERS) {
    if (!provider.enabled()) continue;

    for (const model of provider.models) {
      try {
        const res = await provider.request(model, {
          system: "Reply with the single word OK.",
          user: "ping",
        });
        // Release the stream so the connection does not stay open.
        await res.body?.cancel().catch(() => {});

        results.push({
          provider: provider.name,
          model: model.id,
          status: res.status,
          ok: res.ok,
          reason: res.ok
            ? "reachable"
            : res.status === 401 || res.status === 403
            ? "key rejected"
            : res.status === 404
            ? "model not found — the id may have been retired"
            : res.status === 429
            ? "rate limited or out of quota"
            : `http ${res.status}`,
        });
      } catch (err) {
        results.push({
          provider: provider.name,
          model: model.id,
          status: "network",
          ok: false,
          reason: (err as Error)?.message?.slice(0, 80) ?? "request failed",
        });
      }
    }
  }

  return results;
}

export function providerStatus() {
  return PROVIDERS.map((p) => {
    const envVar = `${p.name.toUpperCase()}_API_KEY`;
    const raw = process.env[envVar];
    return {
      provider: p.name,
      envVar,
      configured: p.enabled(),
      // A length of 0 with configured:false means the variable is missing.
      // A short length usually means a truncated paste.
      keyLength: raw ? raw.length : 0,
      models: p.models.map((m) => m.id),
    };
  });
}
