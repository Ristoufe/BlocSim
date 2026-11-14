// Appel à un modèle local via Ollama (ou toute URL compatible), sans dépendance.
// Réglages : LLM_URL (défaut http://localhost:11434), LLM_MODEL (défaut qwen2.5:14b).
"use strict";

const LLM_URL = (process.env.LLM_URL || "http://localhost:11434").replace(/\/$/, "");
const LLM_MODEL = process.env.LLM_MODEL || "qwen2.5:14b";

// body : {model, messages, schema, temperature, seed}
async function ollamaChat(body) {
  const model = body.model || LLM_MODEL;
  const req = {
    model,
    messages: body.messages,
    stream: false,
    keep_alive: "30m", // le modèle reste chargé entre deux appels (évite plusieurs secondes de chargement)
    think: false, // modèles « à réflexion » (qwen3...) : réponse directe, plus rapide
    options: { temperature: body.temperature ?? 0, seed: body.seed ?? 42, num_ctx: 8192 }, // prompts de 2 500 à 4 000 jetons
  };
  if (body.schema) req.format = body.schema; // sortie JSON contrainte par le schéma
  const r = await fetch(`${LLM_URL}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Ollama : HTTP ${r.status}`);
  return {
    model,
    content: j.message ? j.message.content : "",
    tokens: { prompt: j.prompt_eval_count || 0, output: j.eval_count || 0 },
  };
}

async function ollamaStatus() {
  try {
    const r = await fetch(`${LLM_URL}/api/tags`);
    const j = await r.json();
    return { ok: true, url: LLM_URL, defaultModel: LLM_MODEL, models: (j.models || []).map((m) => m.name) };
  } catch (e) {
    return { ok: false, url: LLM_URL, defaultModel: LLM_MODEL, models: [], error: "Ollama ne répond pas. Lancer : ollama serve" };
  }
}

module.exports = { ollamaChat, ollamaStatus, LLM_MODEL, LLM_URL };
