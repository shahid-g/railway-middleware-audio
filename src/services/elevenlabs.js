const axios = require('axios');

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

// ── In-memory session store ───────────────────────────────────────────────────
// Maps conversationId → { userId, courseId, ... }
// Fallback when dynamic_variables are not echoed back in the webhook.
const sessionStore  = new Map();
const SESSION_TTL   = 24 * 60 * 60 * 1000; // 24 hours

function storeSession(id, context) {
  sessionStore.set(id, { ...context, storedAt: Date.now() });
  pruneExpiredSessions();
}

function getSession(id) {
  return sessionStore.get(id) || null;
}

function pruneExpiredSessions() {
  const cutoff = Date.now() - SESSION_TTL;
  for (const [id, s] of sessionStore.entries()) {
    if (s.storedAt < cutoff) sessionStore.delete(id);
  }
}

// ── ElevenLabs HTTP client ────────────────────────────────────────────────────
function elevenLabsClient() {
  return axios.create({
    baseURL: ELEVENLABS_BASE,
    headers: {
      'xi-api-key':   process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });
}

/**
 * Creates a signed ElevenLabs Conversational AI session URL.
 * Returns the URL unmodified — do NOT append query params as it is a WebSocket URL.
 */
async function createSignedSession(context) {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const apiKey  = process.env.ELEVENLABS_API_KEY;

  if (!apiKey)  throw new Error('ELEVENLABS_API_KEY is not set');
  if (!agentId) throw new Error('ELEVENLABS_AGENT_ID is not set');

  console.log(`[ElevenLabs] Requesting signed URL — agent_id=${agentId}`);

  let response;
  try {
    response = await elevenLabsClient().get('/v1/convai/conversation/get_signed_url', {
      params: { agent_id: agentId },
    });
  } catch (err) {
    const status = err.response?.status;
    const detail = JSON.stringify(err.response?.data || err.message);
    throw new Error(`ElevenLabs API returned ${status}: ${detail}`);
  }

  const signedUrl = response.data?.signed_url;
  if (!signedUrl) throw new Error(`ElevenLabs response missing signed_url: ${JSON.stringify(response.data)}`);

  const conversationId = response.data?.conversation_id || null;
  if (conversationId) storeSession(conversationId, context);

  console.log(`[ElevenLabs] ✓ Signed URL ready — conv=${conversationId}`);
  return { signedUrl, conversationId };
}

/**
 * Verifies API key and agent connectivity — used by GET /test-elevenlabs.
 */
async function verifyConfig() {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const apiKey  = process.env.ELEVENLABS_API_KEY;

  const results = {
    api_key_set:          !!apiKey,
    agent_id_set:         !!agentId,
    agent_id:             agentId  || '(not set)',
    api_key_prefix:       apiKey ? apiKey.slice(0, 8) + '...' : '(not set)',
    agent_reachable:      false,
    signed_url_reachable: false,
    agent_error:          null,
    signed_url_error:     null,
  };

  if (!apiKey || !agentId) return results;

  const client = elevenLabsClient();

  try {
    await client.get(`/v1/convai/agents/${agentId}`);
    results.agent_reachable = true;
  } catch (err) {
    results.agent_error = `${err.response?.status}: ${JSON.stringify(err.response?.data || err.message)}`;
  }

  try {
    const r = await client.get('/v1/convai/conversation/get_signed_url', {
      params: { agent_id: agentId },
    });
    results.signed_url_reachable = true;
    results.signed_url_keys      = Object.keys(r.data || {});
  } catch (err) {
    results.signed_url_error = `${err.response?.status}: ${JSON.stringify(err.response?.data || err.message)}`;
  }

  return results;
}

module.exports = { createSignedSession, verifyConfig, getSession };
