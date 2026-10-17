/**
 * ai.js — AI integration (Groq primary, Gemini fallback)
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const config = require("./config");

const MEMORY_PATH = path.join(__dirname, "data", "memory.json");
let conversationHistory = new Map();

function loadMemory() {
  try {
    const data = fs.readFileSync(MEMORY_PATH, "utf8");
    const obj = JSON.parse(data);
    conversationHistory = new Map(Object.entries(obj));
  } catch {}
}

function saveMemory() {
  try {
    fs.mkdirSync(path.dirname(MEMORY_PATH), { recursive: true });
    const obj = Object.fromEntries(conversationHistory);
    fs.writeFileSync(MEMORY_PATH, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.warn("[Memory] Could not save:", e.message);
  }
}

loadMemory();

function getHistory(contactId) {
  if (!conversationHistory.has(contactId)) {
    conversationHistory.set(contactId, []);
  }
  return conversationHistory.get(contactId);
}

function addToHistory(contactId, role, content) {
  const history = getHistory(contactId);
  history.push({ role, content });
  if (history.length > config.MAX_HISTORY) {
    history.splice(0, history.length - config.MAX_HISTORY);
  }
  saveMemory();
}

async function generateReplyGroq(contactId, userMessage) {
  const Groq = require("groq-sdk");
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const history = getHistory(contactId);
  const prompt = config.getSystemPrompt ? config.getSystemPrompt() : config.SYSTEM_PROMPT;

  const response = await groq.chat.completions.create({
    model: config.MODEL,
    max_tokens: config.MAX_TOKENS,
    temperature: config.TEMPERATURE,
    messages: [{ role: "system", content: prompt }, ...history],
  });
  return response.choices[0]?.message?.content?.trim() || null;
}

async function generateReplyGemini(contactId, userMessage) {
  const { GoogleGenAI } = require("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY });
  const history = getHistory(contactId);
  const prompt = config.getSystemPrompt ? config.getSystemPrompt() : config.SYSTEM_PROMPT;

  const contents = history.map(({ role, content }) => ({
    role: role === "assistant" ? "model" : "user",
    parts: [{ text: content }],
  }));

  const response = await ai.models.generateContent({
    model: config.MODEL_GEMINI || "gemini-2.0-flash",
    contents,
    config: { systemInstruction: prompt, temperature: config.TEMPERATURE, maxOutputTokens: config.MAX_TOKENS },
  });
  return response?.text?.trim() || null;
}

async function generateReply(contactId, userMessage) {
  try {
    addToHistory(contactId, "user", userMessage);
    let reply = null;

    if (process.env.GROQ_API_KEY) {
      try {
        reply = await generateReplyGroq(contactId, userMessage);
      } catch (e) {
        if (e?.status !== 429) console.warn("[Groq]", e?.message || e);
      }
    }

    if (!reply && (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) {
      try {
        reply = await generateReplyGemini(contactId, userMessage);
      } catch (e) {
        if (e?.error?.code === 429) console.warn("[Gemini] Quota exceeded.");
        console.error("[AI Error]", e?.error?.message || e?.message || e);
      }
    }

    if (!reply) return null;
    addToHistory(contactId, "assistant", reply);
    return reply;
  } catch (error) {
    console.error("[AI Error]", error?.message || error);
    return null;
  }
}

function clearHistory(contactId) {
  conversationHistory.delete(contactId);
  saveMemory();
}

module.exports = { generateReply, clearHistory, getHistory };
