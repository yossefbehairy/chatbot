/**
 * utils.js — Stats + Spam filter
 */

const fs = require("fs");
const path = require("path");

const STATS_PATH = path.join(__dirname, "data", "stats.json");

function loadStats() {
  try {
    const data = fs.readFileSync(STATS_PATH, "utf8");
    return JSON.parse(data);
  } catch {
    return { totalReplies: 0, byContact: {}, lastReset: new Date().toISOString() };
  }
}

function saveStats(stats) {
  try {
    fs.mkdirSync(path.dirname(STATS_PATH), { recursive: true });
    fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2));
  } catch (e) {
    console.warn("[Stats] Could not save:", e.message);
  }
}

function incrementReply(contactId) {
  const stats = loadStats();
  stats.totalReplies = (stats.totalReplies || 0) + 1;
  const key = String(contactId).replace(/@.*/, "");
  stats.byContact[key] = (stats.byContact[key] || 0) + 1;
  saveStats(stats);
  return stats;
}

function isSpam(text, opts = {}) {
  const minLen = opts.minMessageLength ?? 1;
  const blockLinks = opts.blockLinks ?? false;
  const textTrim = (text || "").trim();
  if (textTrim.length < minLen) return true;
  if (blockLinks && /https?:\/\//i.test(textTrim)) return true;
  return false;
}

module.exports = { loadStats, saveStats, incrementReply, isSpam };
