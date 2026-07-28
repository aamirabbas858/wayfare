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
  /**
   * Caps the completion below the model's own limit. Short passes should ask
   * for less: free tiers meter tokens per minute, and a request reserves its
   * stated maximum against that budget whether or not it uses it.
   */
  maxTokens?: number;
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

/* ── Mistral (OpenAI-compatible) ────────────────────────────────────── */

// The largest free allowance of any provider here by a wide margin: the
// Experiment tier is metered per month rather than per day, so a burst of
// testing cannot exhaust an afternoon's worth of traffic the way Groq's
// 100,000 tokens per day can. Sign-up needs phone verification, not a card.
const mistral: Provider = {
  name: "mistral",
  enabled: () => Boolean(process.env.MISTRAL_API_KEY),
  models: [
    { id: "mistral-large-latest", maxTokens: 8192 },
    { id: "mistral-small-latest", maxTokens: 8192 },
  ],
  request: (model, { system, user, signal }) =>
    fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
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

/* ── NVIDIA NIM (OpenAI-compatible) ─────────────────────────────────── */

// Metered by requests per minute rather than a daily token allowance, which
// makes it the useful complement to the others: a long itinerary is a handful
// of large requests, which is exactly the shape this tier is generous about.
//
// Model IDs are taken from a live read of the /v1/models endpoint rather than
// documentation. llama-3.3-70b leads because it is the same model the prompt
// was tuned against on Groq, so output shape does not change on failover.
const nvidia: Provider = {
  name: "nvidia",
  enabled: () => Boolean(process.env.NVIDIA_API_KEY),
  models: [
    { id: "meta/llama-3.3-70b-instruct", maxTokens: 8192 },
    { id: "nvidia/llama-3.3-nemotron-super-49b-v1.5", maxTokens: 8192 },
  ],
  request: (model, { system, user, signal }) =>
    fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
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

/**
 * Ordered by how much free headroom each one has, largest first, so the
 * providers that can absorb a bad afternoon are used before the ones that
 * cannot.
 *
 * Measured, not assumed. Groq's free tier is 100,000 tokens per DAY — around
 * eight itineraries shared between every visitor — which is why it can no
 * longer lead. Mistral's Experiment tier is metered monthly and is roughly
 * three orders of magnitude larger; NVIDIA meters requests per minute with no
 * published daily token cap. Groq stays in the chain because it is by far the
 * fastest when it has budget left.
 *
 * Gemini is last because its prepaid balance is empty, and an empty balance
 * does not refill on its own the way a daily allowance does.
 */
const PROVIDERS: Provider[] = [mistral, nvidia, groq, openrouter, gemini];

/** Status codes worth trying the next model or provider for. */
const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/** Longest a request will sit waiting out a rate limit. */
const MAX_WAIT_MS = 20_000;

/**
 * How long the provider says to wait, or `null` when waiting will not help.
 *
 * A 429 means two very different things on a free tier. Per-minute limits
 * clear on their own and are worth pausing for. Daily allowances and depleted
 * balances do not, and the distinction matters: Gemini answers "prepayment
 * credits are depleted" with no retry hint, and retrying its three models
 * twice each cost ten seconds and eight requests to learn nothing.
 */
function retryAfterMs(res: Response, body: string): number | null {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return header * 1000;

  // Groq reports it in prose rather than a header: "try again in 31m14.016s".
  const m = body.match(/try again in (?:(\d+)m)?([\d.]+)s/);
  if (m) return (Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000;

  return null;
}

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
/**
 * Runs several prompts in order and concatenates their output into one
 * stream, with `join` between each.
 *
 * A long itinerary cannot fit in a single completion. Fourteen days at four
 * stops each exceeds any free-tier budget, and the failure is silent: the
 * model stops mid-way and the reader believes the plan is finished. Splitting
 * the work into passes makes the length of the trip stop mattering.
 *
 * Passes run sequentially rather than in parallel because each is a separate
 * rate-limited request, and because the output has to arrive in order.
 */
export function generateSequence(
  parts: GenerateOptions[],
  join = "\n\n"
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) controller.enqueue(encoder.encode(join));

        const reader = generateStream(parts[i]).getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } finally {
          reader.releaseLock();
        }
      }
      controller.close();
    },
  });
}

export function generateStream(opts: GenerateOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const tried: string[] = [];

      for (const provider of PROVIDERS) {
        if (!provider.enabled()) continue;

        models: for (const spec of provider.models) {
        // A provider can reject a request outright when prompt + completion
        // exceeds its limit, and the threshold is neither documented nor
        // stable across tiers. Rather than pick a conservative constant and
        // permanently give up the longer itineraries, ask for the full budget
        // first and halve it on a 413. A shorter plan beats no plan.
        const ceiling = Math.min(spec.maxTokens, opts.maxTokens ?? spec.maxTokens);
        const budgets = [ceiling, Math.floor(ceiling / 2)].filter(
          (n, i, a) => n >= 1024 && a.indexOf(n) === i
        );
        // One extra slot so a rate-limit wait can retry the full budget
        // rather than consuming the halved attempt meant for 413s.
        const attempts = [budgets[0], ...budgets];
        let rateLimited = false;

        for (const maxTokens of attempts) {
          const model = { ...spec, maxTokens };
          const label = `${provider.name}/${model.id}@${maxTokens}`;
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
            continue models;
          }

          if (!res.ok || !res.body) {
            // Read the body so the connection is released, and log it
            // server-side — it must never reach the client, since upstream
            // errors carry billing and quota details.
            const detail = await res.text().catch(() => "");
            console.error(`[llm] ${label} HTTP ${res.status}: ${detail.slice(0, 300)}`);
            tried.push(label);

            // 413 means prompt + completion exceeded the limit. Asking for
            // fewer tokens is the one thing that can fix it, so fall through
            // to the next (halved) attempt on this same model.
            if (res.status === 413) continue;

            // 429 is either a per-minute limit worth waiting out or a daily
            // allowance that is not. Waiting is right for the first: multi-pass
            // generation trips it routinely, and moving on would throw away a
            // working provider over a limit measured in seconds.
            if (res.status === 429) {
              const wait = retryAfterMs(res, detail);

              // Out of quota rather than going too fast. Every model here
              // draws on the same allowance, so trying the rest is guaranteed
              // to fail — skip to the next provider immediately.
              if (wait === null || wait > MAX_WAIT_MS) {
                console.warn(
                  `[llm] ${provider.name} quota exhausted${
                    wait ? ` for ${Math.round(wait / 60000)}m` : ""
                  }, skipping provider`
                );
                break models;
              }

              if (!rateLimited) {
                rateLimited = true;
                console.warn(`[llm] ${label} rate limited, waiting ${wait}ms`);
                await new Promise((r) => setTimeout(r, wait));
                continue; // same model, same budget — the limit is time-based
              }
            }

            // A transient or quota failure will not improve with a smaller
            // request — move to the next model.
            if (RETRYABLE.has(res.status)) continue models;

            // Anything else is specific to this provider (bad key, unknown
            // model), so skip its remaining models entirely.
            break models;
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
