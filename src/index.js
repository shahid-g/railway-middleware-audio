require('dotenv').config();

const express           = require('express');
const launchRoutes      = require('./routes/xapi');
const elRoutes          = require('./routes/elevenlabs');
const { verifyConfig }  = require('./services/elevenlabs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── ElevenLabs diagnostic ─────────────────────────────────────────────────────
app.get('/test-elevenlabs', async (_req, res) => {
  try {
    const result = await verifyConfig();
    const ok = result.api_key_set && result.agent_id_set && result.signed_url_reachable;
    res.status(ok ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/',       launchRoutes);
app.use('/course', launchRoutes);
app.use('/webhooks/elevenlabs', elRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  console.warn(`[404] ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

app.listen(PORT, () => {
  console.log(`[SERVER] Running on port ${PORT}`);
  console.log(`[SERVER] Docebo launch     : GET|POST /launch  OR  /course/launch`);
  console.log(`[SERVER] ElevenLabs webhook: POST /webhooks/elevenlabs/done`);

  // ── Startup env var check ─────────────────────────────────────────────────
  const vars = [
    'DOCEBO_BASE_URL',
    'DOCEBO_CLIENT_ID',
    'DOCEBO_CLIENT_SECRET',
    'DOCEBO_GRANT_TYPE',
    'DOCEBO_SCOPE',
    'DOCEBO_USERNAME',
    'DOCEBO_PASSWORD',
    'DOCEBO_COMPLETION_FIELD',
    'DOCEBO_COMPLETION_VALUE',
    'DOCEBO_CONV_ID_FIELD',
    'DOCEBO_DURATION_FIELD',
    'ELEVENLABS_API_KEY',
    'ELEVENLABS_AGENT_ID',
  ];
  console.log('[SERVER] Env var check:');
  for (const v of vars) {
    const val = process.env[v];
    const display = !val
      ? 'NOT SET'
      : (v.includes('SECRET') || v.includes('PASSWORD') || v.includes('KEY'))
        ? '***set***'
        : JSON.stringify(val);
    console.log(`[SERVER]   ${v.padEnd(28)} = ${display}`);
  }
});
