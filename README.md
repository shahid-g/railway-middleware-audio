# Docebo ↔ ElevenLabs Audio Middleware

Railway-hosted Node.js middleware for ElevenLabs **audio/voice** agents.

---

## Directory structure

```
docebo-elevenlabs-audio/        ← this folder must be the git repo root
├── Procfile
├── railway.toml
├── package.json
├── .env.example
├── README.md
└── src/
    ├── index.js
    ├── middleware/
    │   └── auth.js
    ├── routes/
    │   ├── xapi.js             ← Docebo launch + voice UI page
    │   └── elevenlabs.js       ← ElevenLabs completion webhook
    └── services/
        ├── elevenlabs.js       ← signed session creation
        └── docebo.js           ← OAuth2 token + mark enrollment complete
```

---

## Flow

```
1. Learner opens course in Docebo
        │  GET/POST /launch?user_id=...&course_id=...&actor=...
        ▼
2. Railway creates signed ElevenLabs session URL
        │  GET /v1/convai/conversation/get_signed_url
        ▼
3. Railway returns HTML voice UI page
        │  Browser connects via native WebSocket (wss://)
        │  Microphone captured → PCM Int16 @ 16kHz → base64 → sent to ElevenLabs
        │  Agent audio received → decoded PCM → played via AudioContext
        ▼
4. Learner speaks with AI voice agent
        │
        ▼
5. ElevenLabs fires completion webhook
        │  POST /webhooks/elevenlabs/done
        ▼
6. Railway marks Docebo enrollment complete
           Step A: POST /oauth2/token         → get Bearer token
           Step B: PUT  /learn/v1/enrollments/{course_id}/{user_id}
                   Body: { "enrollment_fields": { "<FIELD_ID>": "completed" } }
```

---

## Railway environment variables

| Variable | Required | Description |
|---|---|---|
| `ELEVENLABS_API_KEY` | ✅ | ElevenLabs API key |
| `ELEVENLABS_AGENT_ID` | ✅ | Audio agent ID |
| `DOCEBO_BASE_URL` | ✅ | e.g. `https://company.docebosaas.com` |
| `DOCEBO_CLIENT_ID` | ✅ | OAuth2 client ID |
| `DOCEBO_CLIENT_SECRET` | ✅ | OAuth2 client secret |
| `DOCEBO_GRANT_TYPE` | ✅ | `password` |
| `DOCEBO_SCOPE` | ✅ | `api` |
| `DOCEBO_USERNAME` | ✅ | Docebo admin username |
| `DOCEBO_PASSWORD` | ✅ | Docebo admin password |
| `DOCEBO_COMPLETION_FIELD` | ✅ | Enrollment field ID to mark complete |
| `DOCEBO_COMPLETION_VALUE` | ⬜ | Value to write (default: `completed`) |
| `DOCEBO_CONV_ID_FIELD` | ⬜ | Field ID for ElevenLabs conversation ID |
| `DOCEBO_DURATION_FIELD` | ⬜ | Field ID for call duration in seconds |

> Do NOT wrap values in quotes — set `DOCEBO_COMPLETION_FIELD=1` not `"1"`

---

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Railway health check |
| `GET` | `/test-elevenlabs` | Verify API key + agent connectivity |
| `GET/POST` | `/launch` | Docebo course launch |
| `GET/POST` | `/course/launch` | Docebo course launch (alternate path) |
| `POST` | `/webhooks/elevenlabs/done` | ElevenLabs completion webhook |

---

## Voice UI features

- 🎤 Mic orb button — click to start/stop speaking
- 🔇 Mute button — pause mic without ending call
- 📵 End call button — confirmation dialog before ending
- Agent speech displayed as text on screen
- Animated waveform while listening or agent is speaking
- Automatic microphone capture at 16kHz PCM for ElevenLabs
- Audio playback via WebAudio API

---

## Deploy to Railway

```bash
git init && git add . && git commit -m "initial"
git remote add origin https://github.com/YOUR/REPO.git
git push -u origin main
# → railway.app → New Project → Deploy from GitHub
# → Add env vars in Variables tab
# → Settings → Networking → Generate Domain
```

Configure in **Docebo**: course launch URL → `https://your-app.up.railway.app/launch`
Configure in **ElevenLabs**: webhook URL → `https://your-app.up.railway.app/webhooks/elevenlabs/done`
