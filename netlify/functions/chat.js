import { desc, eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { chatMessages } from "../../db/schema.ts";

const MODEL = "claude-sonnet-4-5-20250929";
const CLIENT_ID_PATTERN = /^[a-zA-Z0-9_-]{12,80}$/;
const json = (body, status = 200, headers = {}) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", ...headers },
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readMemory(clientId) {
  try {
    const db = getDb();
    const rows = await db.select({
      role: chatMessages.role, content: chatMessages.content,
    }).from(chatMessages).where(eq(chatMessages.clientId, clientId))
      .orderBy(desc(chatMessages.id)).limit(16);
    return rows.reverse();
  } catch (error) {
    console.warn("Memory read unavailable", error instanceof Error ? error.name : "unknown");
    return [];
  }
}

async function remember(clientId, messages) {
  try {
    const db = getDb();
    await db.insert(chatMessages).values(messages.map((item) => ({ clientId, ...item })));
  } catch (error) {
    console.warn("Memory save unavailable", error instanceof Error ? error.name : "unknown");
  }
}

async function askAI(messages) {
  const anthropicBase = process.env.ANTHROPIC_BASE_URL?.replace(/\/$/, "");
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const gatewayBase = process.env.NETLIFY_AI_GATEWAY_BASE_URL?.replace(/\/$/, "");
  const gatewayKey = process.env.NETLIFY_AI_GATEWAY_KEY;
  const useAnthropicCredentials = Boolean(anthropicBase && anthropicKey);
  const base = useAnthropicCredentials ? anthropicBase : gatewayBase;
  const key = useAnthropicCredentials ? anthropicKey : gatewayKey;
  if (!base || !key) throw new Error("gateway_unavailable");
  const endpoint = useAnthropicCredentials ? `${base}/v1/messages` : `${base}/anthropic/v1/messages`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(useAnthropicCredentials ? { "x-api-key": key } : { Authorization: `Bearer ${key}` }),
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          system: "You are AKOS, Akash's personal AI assistant. Be helpful, calm, practical and conversational. Use prior conversation naturally to remember preferences and improve continuity. Never claim to remember information that is not present in the conversation.",
          messages,
        }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) return data;
      if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === 2) {
        throw new Error("provider_unavailable");
      }
    } catch (error) {
      if (attempt === 2 || (error instanceof Error && error.message === "gateway_unavailable")) throw error;
    } finally {
      clearTimeout(timeout);
    }
    await sleep(300 * (attempt + 1));
  }
  throw new Error("provider_unavailable");
}

export default async (request) => {
  if (request.method === "DELETE") {
    const clientId = new URL(request.url).searchParams.get("clientId") || "";
    if (!CLIENT_ID_PATTERN.test(clientId)) return json({ error: "Invalid client ID" }, 400);
    try {
      const db = getDb();
      await db.delete(chatMessages).where(eq(chatMessages.clientId, clientId));
      return json({ cleared: true });
    } catch {
      return json({ error: "Memory is temporarily unavailable" }, 503, { "Retry-After": "5" });
    }
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, { Allow: "POST, DELETE" });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request must contain valid JSON" }, 400);
  }
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const clientId = typeof body?.clientId === "string" ? body.clientId : "";
  if (!message) return json({ error: "Message is required" }, 400);
  if (message.length > 8000) return json({ error: "Message is too long" }, 413);
  if (!CLIENT_ID_PATTERN.test(clientId)) return json({ error: "Invalid client ID" }, 400);

  try {
    const memory = await readMemory(clientId);
    const data = await askAI([...memory, { role: "user", content: message }]);
    const responseText = data?.content
      ?.filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text).join("\n").trim();
    if (!responseText) throw new Error("empty_provider_response");
    await remember(clientId, [
      { role: "user", content: message },
      { role: "assistant", content: responseText },
    ]);
    return json({ response: responseText, memoryEnabled: true });
  } catch (error) {
    console.error("AKOS request failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "AKOS is temporarily busy. Please try again in a moment.", retryable: true },
      503, { "Retry-After": "3" });
  }
};
