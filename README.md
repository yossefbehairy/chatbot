# 🤖 WhatsApp AI Bot

A WhatsApp chatbot that replies naturally in your own style. Powered by **Groq** (primary) with **Google Gemini** as an automatic fallback, featuring per-contact memory and a local web control panel.

> :egypt: الشرح بالعربي: [README.ar.md](README.ar.md)

---

## ✨ Features

- **Human-like replies** — the personality, tone and language live in the `SYSTEM_PROMPT` inside `config.js`
- **Two AI providers** — Groq first, Gemini as fallback (works with either key alone)
- **Per-contact memory** — conversation history is stored in `data/memory.json` and survives restarts
- **Web control panel** — `http://localhost:3750` with toggles, allowed numbers, quick replies, spam filter and live stats
- **WhatsApp commands** — `/clear`, `/help`, `/mode free`, `/mode triggers`
- **Group handling** — free replies or trigger-keywords only, with a 1-hour cooldown per group to avoid spam
- **Anti-spam options** — minimum message length and optional link blocking
- **Typing simulation** — a realistic delay before every reply

---

## 📁 Project structure

```
whatsapp-bot/
├── bot.js                # WhatsApp client, message routing, control-panel server
├── ai.js                 # Groq + Gemini reply generation, conversation memory
├── config.js             # Personality prompt & model settings  ← customize here
├── utils.js              # Stats counter + spam filter helpers
├── gui/
│   └── index.html        # Web control panel UI
├── controls.json         # Panel settings (auto-created at runtime, gitignored)
├── data/                 # Conversation memory & stats (auto-created, gitignored)
├── session/              # WhatsApp login session (auto-created, gitignored)
├── .env                  # Your API keys (create from .env.example, gitignored)
├── .env.example          # Environment template
├── Dockerfile            # Docker image (Chromium included)
├── docker-compose.yml    # Docker Compose with persistent session volume
├── ecosystem.config.js   # PM2 process file
├── fly.toml              # Fly.io app config
├── render.yaml           # Render.com worker config
└── run.sh                # Tiny Linux run helper
```

---

## 🚀 Quick start

1. **Install dependencies** (Node.js 20+ required)

   ```bash
   npm install
   ```

2. **Create `.env`** from the template and fill in your keys:

   ```bash
   cp .env.example .env     # Windows: copy .env.example .env
   ```

3. **Customize the personality** (optional) — edit `SYSTEM_PROMPT` in `config.js`.

4. **Start the bot**

   ```bash
   npm start
   ```

5. **Scan the QR code** (first run only): WhatsApp → **Linked devices** → **Link a device**.
   The session is stored in `session/`, so you never scan again unless you log out.

---

## 🎛 Control panel

Open **http://localhost:3750** while the bot is running. Every change is saved to `controls.json` and applied live — no restart needed.

| Section | What it does |
|---|---|
| Main controls | Bot on/off, reply to groups, reply to private, free speech in groups, typing delay |
| Owner notifications | Ping your own number when an unknown number messages you |
| Spam filter | Minimum message length, optional link blocking |
| Allowed numbers | Numbers the bot answers in private chats |
| Quick replies | Keyword → canned response (also defines the trigger words used in "triggers" mode) |
| Stats | Total replies since the last reset |

---

## 💬 WhatsApp commands

| Command | Description |
|---|---|
| `/clear` | Clear the conversation memory with you |
| `/help` | Show available commands |
| `/mode free` | Groups: reply to any message |
| `/mode triggers` | Groups: reply only to messages containing a quick-reply keyword |

---

## ⚙️ Configuration

### Environment variables (`.env`)

| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Groq API key — primary provider |
| `GEMINI_API_KEY` | Google Gemini API key — fallback provider |
| `MY_NUMBER` | Optional: owner number for notifications |
| `GUI_PORT` | Optional: control-panel port (default `3750`) |

### Bot settings (`config.js`)

| Setting | Description |
|---|---|
| `SYSTEM_PROMPT` | The bot's personality — make it sound like you |
| `MODEL` / `MODEL_GEMINI` | Groq model / Gemini fallback model |
| `MAX_TOKENS`, `TEMPERATURE` | Generation limits and creativity |
| `MAX_HISTORY` | Messages remembered per contact |
| `MIN_TYPING_DELAY`, `MAX_TYPING_DELAY` | Typing simulation range (ms) |

---

## 🐳 Deployment

### Docker (recommended)

```bash
docker compose up -d
docker compose logs -f whatsapp-bot   # watch for the QR code on first run
```

The session is persisted in `./session` on the host, so redeploys don't require a re-scan.

### Fly.io

`fly deploy` — `fly.toml` already mounts a persistent volume at `/app/session`.

### Render

`render.yaml` defines a background worker. Set `GROQ_API_KEY` / `GEMINI_API_KEY` in the dashboard.

### PM2 (VPS)

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
```

---

## 🔐 Security notes

- `.env` holds your API keys — it is gitignored, keep it that way
- `session/` contains your WhatsApp login — gitignored too, never share it
- The bot replies from your **real account**; use the **Bot On/Off** toggle in the panel to pause it instantly
