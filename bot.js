/**
 * bot.js — Main WhatsApp Bot
 * Commands: /clear /help /mode
 * Control panel: http://localhost:3750
 */

require("dotenv").config();
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { generateReply, clearHistory } = require("./ai");
const { incrementReply, loadStats, isSpam } = require("./utils");
const config = require("./config");

const LOG_PATH = path.join(__dirname, "logs", "bot-out.log");
try { fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true }); } catch (_) { }
const logStream = fs.createWriteStream(LOG_PATH, { flags: "a" });
function toLog(...args) {
  const line = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
  logStream.write(new Date().toISOString() + " " + line.replace(/\n/g, " ") + "\n");
}
const _log = console.log, _warn = console.warn, _error = console.error;
console.log = (...a) => { toLog(...a); _log.apply(console, a); };
console.warn = (...a) => { toLog("WARN", ...a); _warn.apply(console, a); };
console.error = (...a) => { toLog("ERROR", ...a); _error.apply(console, a); };

const CONTROLS_PATH = path.join(__dirname, "controls.json");
const GUI_PORT = process.env.GUI_PORT || 3750;

function loadControls() {
  const defaults = {
    botEnabled: true, replyToGroups: true, replyToPrivate: true,
    replyToPrivateAll: true, // If true, reply to any private chat sender
    groupSpeechFreedom: "free", allowedNumbers: ["201023256565"],
    ownerNumber: "", notifyOnUnknown: false, typingDelayEnabled: true,
    spamFilterEnabled: false, minMessageLength: 1, blockLinks: false,
    quickReplies: {}
  };
  try {
    const data = fs.readFileSync(CONTROLS_PATH, "utf8");
    const parsed = JSON.parse(data);
    const raw = Array.isArray(parsed.allowedNumbers) ? parsed.allowedNumbers : defaults.allowedNumbers;
    const allowedNumbers = raw.map((n) => String(n).replace(/\D/g, "")).filter((n) => n.length > 0);
    return {
      ...defaults,
      ...parsed,
      allowedNumbers: allowedNumbers.length ? allowedNumbers : defaults.allowedNumbers,
      quickReplies: { ...defaults.quickReplies, ...(parsed.quickReplies || {}) }
    };
  } catch {
    return defaults;
  }
}
function saveControls(c) {
  fs.writeFileSync(CONTROLS_PATH, JSON.stringify(c, null, 2));
}
let controls = loadControls();

const client = new Client({
  // Session lives next to the code so it is found with npm start, PM2, Docker and Fly.io
  authStrategy: new LocalAuth({ dataPath: path.join(__dirname, "session") }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--no-first-run"]
  }
});

client.on("qr", (qr) => {
  console.log("\n📱 Scan QR code: WhatsApp → Linked Devices\n");
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => console.log("✅ Authenticated"));
client.on("auth_failure", (msg) => { console.error("❌ Auth failed:", msg); process.exit(1); });
client.on("ready", () => {
  console.log("🤖 Bot ready! Control panel: http://localhost:" + GUI_PORT);
});
client.on("disconnected", (reason) => {
  console.warn("⚠️ Disconnected:", reason);
  client.initialize();
});

async function typingDelay() {
  if (!controls.typingDelayEnabled) return;
  const min = config.MIN_TYPING_DELAY || 800;
  const max = config.MAX_TYPING_DELAY || 2000;
  const delay = min + Math.random() * (max - min);
  await new Promise((r) => setTimeout(r, delay));
}

async function notifyOwner(msg, text) {
  const owner = (controls.ownerNumber || process.env.MY_NUMBER || "").replace(/\D/g, "");
  if (!owner || !controls.notifyOnUnknown) return;
  try {
    const chatId = owner + "@s.whatsapp.net";
    await client.sendMessage(chatId, `🔔 Message from non-allowed number:\n${text || "(image/file)"}`);
  } catch (e) {
    console.warn("[Notify]", e.message);
  }
}

const groupLastReplyTime = new Map();

client.on("message", async (message) => {
  try {
    let userText = (message.body || "").trim();
    const hasMedia = message.hasMedia;
    if (hasMedia && !userText) {
      if (message.type === "image") userText = "[image]";
      else if (message.type === "ptt" || message.type === "audio") userText = "[voice message]";
      else userText = "[file]";
    }

    console.log(`📥 from=${message.from} text="${(userText || "").slice(0, 50)}"`);

    controls = loadControls();
    if (!controls.botEnabled) return;
    if (message.isStatus) return;

    const chat = await message.getChat();
    const actualSender = message.author || message.from;
    const senderNumber = actualSender.split("@")[0].replace(/\D/g, "");
    const contactId = message.from;

    if (!userText) return;

    if (userText.startsWith("/")) {
      const [cmd, arg] = userText.slice(1).split(/\s+/);
      const allowed = (controls.allowedNumbers || []).map((n) => String(n).replace(/\D/g, ""));
      const isAllowed = allowed.includes(senderNumber);
      const bypassPrivateAllowAll = !chat.isGroup && controls.replyToPrivateAll;
      if (!isAllowed && !bypassPrivateAllowAll) return;
      if (cmd === "clear") {
        clearHistory(contactId);
        await message.reply("✅ Memory cleared");
        return;
      }
      if (cmd === "help") {
        const help = `📋 Commands:
/clear — Clear conversation memory
/help — Show this help
/mode free — Free reply in groups
/mode triggers — Reply to trigger words only`;
        await message.reply(help);
        return;
      }
      if (cmd === "mode" && arg && (arg === "free" || arg === "triggers")) {
        controls.groupSpeechFreedom = arg;
        saveControls(controls);
        await message.reply(`✅ Switched to ${arg === "free" ? "free reply" : "triggers only"}`);
        return;
      }
    }

    if (chat.isGroup) {
      // Private-only requirement: if group replies are disabled, never respond in groups.
      if (!controls.replyToGroups) return;
      const isFree = (controls.groupSpeechFreedom || "free") === "free";
      if (!isFree) {
        const keys = Object.keys(controls.quickReplies || {});
        if (!keys.some((k) => userText.toLowerCase().includes(k.toLowerCase()))) return;
      }
      
      const groupId = contactId;
      const now = Date.now();
      const lastReply = groupLastReplyTime.get(groupId) || 0;
      // 1 hour cooldown = 60 * 60 * 1000 milliseconds
      if (now - lastReply < 60 * 60 * 1000) {
        console.log(`⏳ Skip: 1-hour cooldown for group ${groupId}.`);
        return;
      }
      groupLastReplyTime.set(groupId, now);
    } else {
      if (!controls.replyToPrivate) return;
      if (!controls.replyToPrivateAll) {
        const allowed = (controls.allowedNumbers || []).map((n) => String(n).replace(/\D/g, ""));
        if (!allowed.includes(senderNumber)) {
          if (controls.notifyOnUnknown) notifyOwner(message, userText);
          return;
        }
      }
    }

    if (controls.spamFilterEnabled && isSpam(userText, { minMessageLength: controls.minMessageLength || 1, blockLinks: controls.blockLinks })) {
      console.log("⏭️ Skip: spam filter");
      return;
    }

    console.log(`💬 From ${contactId}: ${userText}`);

    const quickReplies = controls.quickReplies || {};
    const matchedQR = Object.entries(quickReplies).find(([kw]) => userText.toLowerCase().includes(kw.toLowerCase()));
    if (matchedQR) {
      await typingDelay();
      await message.reply(matchedQR[1]);
      incrementReply(contactId);
      return;
    }

    const reply = await generateReply(contactId, userText);
    if (reply) {
      await typingDelay();
      await message.reply(reply);
      incrementReply(contactId);
      console.log(`🤖 → "${reply.slice(0, 50)}..."`);
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
});

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  if (url === "/" || url === "/index.html") {
    fs.readFile(path.join(__dirname, "gui", "index.html"), (err, data) => {
      if (err) { res.writeHead(500); res.end("Error"); return; }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
    });
    return;
  }
  if (url === "/api/state" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(loadControls()));
    return;
  }
  if (url === "/api/state" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const next = JSON.parse(body || "{}");
        controls = { ...loadControls(), ...next };
        saveControls(controls);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }
  if (url === "/api/stats" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(loadStats()));
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});
server.listen(GUI_PORT, () => console.log(`📊 Control panel: http://localhost:${GUI_PORT}`));

console.log("🚀 Starting bot...");
client.initialize();
