import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateStream } from "./llm";

/**
 * These cover the failover loop, not the providers themselves.
 *
 * The live bug they were written for: on 20 Sep 2026 every configured
 * provider's first model had gone stale at once — Mistral 403 (large is not
 * in the free tier), NVIDIA 410 (llama-3.3-70b hit end of life on 26 Aug),
 * Groq 404 (llama-3.3-70b-versatile decommissioned). Six models were
 * configured across the three; only three were ever tried, because a
 * model-specific rejection was being read as a verdict on the whole provider.
 */

const SYSTEM = "system";
const USER = "user";

/** One SSE body in the OpenAI-compatible shape Mistral and Groq both stream. */
function sseBody(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const frame = JSON.stringify({ choices: [{ delta: { content: text } }] });
      controller.enqueue(encoder.encode(`data: ${frame}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

function jsonError(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

/** Model ids seen by the mocked fetch, in the order they were requested. */
function requestedModels(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map(
    (call) => JSON.parse((call[1] as RequestInit).body as string).model
  );
}

const PROVIDER_KEYS = [
  "MISTRAL_API_KEY",
  "NVIDIA_API_KEY",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
  "GEMINI_API_KEY",
];

describe("generateStream failover", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of PROVIDER_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of PROVIDER_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.unstubAllGlobals();
  });

  // Each of these is a status the live deployment actually returned.
  const staleModel: [number, unknown, string][] = [
    [404, { error: { code: "model_not_found" } }, "decommissioned"],
    [410, { detail: "reached its end of life on 2026-08-26T09:00:00Z" }, "end of life"],
    [403, { code: "1910", message: "not available in your subscription tier" }, "tier-locked"],
  ];

  it.each(staleModel)(
    "tries the next model in the same provider when the first is %i (%s)",
    async (status, body) => {
      process.env.MISTRAL_API_KEY = "test-key";

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonError(status, body))
        .mockResolvedValueOnce(new Response(sseBody("itinerary text"), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const out = await collect(generateStream({ system: SYSTEM, user: USER }));

      expect(requestedModels(fetchMock)).toEqual([
        "mistral-large-latest",
        "mistral-small-latest",
      ]);
      expect(out).toBe("itinerary text");
      expect(out).not.toContain("[Error:");
    }
  );

  it("still abandons a provider when the key itself is rejected", async () => {
    process.env.MISTRAL_API_KEY = "bad-key";

    // 401 is about the credential, so the provider's other models cannot help.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonError(401, { error: { message: "Invalid API Key" } }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await collect(generateStream({ system: SYSTEM, user: USER }));

    expect(requestedModels(fetchMock)).toEqual(["mistral-large-latest"]);
    expect(out).toContain("[Error:");
  });

  it("moves to the next provider once a provider's models are exhausted", async () => {
    process.env.MISTRAL_API_KEY = "test-key";
    process.env.GROQ_API_KEY = "test-key";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonError(404, { error: { code: "model_not_found" } }))
      .mockResolvedValueOnce(jsonError(404, { error: { code: "model_not_found" } }))
      .mockResolvedValueOnce(new Response(sseBody("from groq"), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await collect(generateStream({ system: SYSTEM, user: USER }));

    expect(requestedModels(fetchMock)).toEqual([
      "mistral-large-latest",
      "mistral-small-latest",
      "llama-3.3-70b-versatile",
    ]);
    expect(out).toBe("from groq");
  });
});
