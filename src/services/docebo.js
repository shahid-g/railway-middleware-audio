const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// ── OAuth2 token cache ────────────────────────────────────────────────────────
let _tokenCache = { token: null, expiresAt: 0 };

/**
 * Step 1 — Get Docebo access token.
 * POST DOCEBO_BASE_URL/oauth2/token with credentials as form data.
 */
async function getAccessToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt) {
    return _tokenCache.token;
  }

  const base   = process.env.DOCEBO_BASE_URL;
  const id     = process.env.DOCEBO_CLIENT_ID;
  const secret = process.env.DOCEBO_CLIENT_SECRET;
  const grant  = process.env.DOCEBO_GRANT_TYPE  || 'password';
  const scope  = process.env.DOCEBO_SCOPE        || 'api';
  const uname  = process.env.DOCEBO_USERNAME;
  const pwd    = process.env.DOCEBO_PASSWORD;

  if (!base || !id || !secret || !uname || !pwd) {
    throw new Error(
      'Missing Docebo credentials. Required: DOCEBO_BASE_URL, DOCEBO_CLIENT_ID, ' +
      'DOCEBO_CLIENT_SECRET, DOCEBO_USERNAME, DOCEBO_PASSWORD'
    );
  }

  const formData = new URLSearchParams({
    client_id:     id,
    client_secret: secret,
    grant_type:    grant,
    scope,
    username:      uname,
    password:      pwd,
  });

  console.log('[Docebo] Requesting access token');

  let response;
  try {
    response = await axios.post(
      `${base}/oauth2/token`,
      formData.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      }
    );
  } catch (err) {
    const status = err.response?.status;
    const detail = JSON.stringify(err.response?.data || err.message);
    console.error(`[Docebo] ✗ Token request failed (${status}): ${detail}`);
    throw new Error(`Docebo token request failed (${status}): ${detail}`);
  }

  const { access_token, expires_in } = response.data;
  if (!access_token) {
    throw new Error(`Docebo token response missing access_token: ${JSON.stringify(response.data)}`);
  }

  _tokenCache = {
    token:     access_token,
    expiresAt: Date.now() + ((expires_in || 3600) - 60) * 1000,
  };

  console.log('[Docebo] ✓ Access token obtained');
  return access_token;
}

/**
 * Mark enrollment complete — audio agent version.
 * PUT DOCEBO_BASE_URL/learn/v1/enrollments/{course_id}/{user_id}
 *
 * Writes a completion marker to DOCEBO_COMPLETION_FIELD (e.g. "1").
 * Value written is DOCEBO_COMPLETION_VALUE (default: "completed").
 *
 * Required env vars:
 *   DOCEBO_COMPLETION_FIELD  — enrollment field ID to mark as complete
 *
 * Optional env vars:
 *   DOCEBO_COMPLETION_VALUE  — value to write (default: "completed")
 *   DOCEBO_CONV_ID_FIELD     — field ID to store ElevenLabs conversation ID
 *   DOCEBO_DURATION_FIELD    — field ID to store call duration in seconds
 */
async function markComplete({
  userId,
  courseId,
  conversationId,
  durationSecs,
}) {
  const base = process.env.DOCEBO_BASE_URL;

  const stripQuotes = (v) => v ? v.replace(/^["']|["']$/g, '').trim() : null;

  const completionField = stripQuotes(process.env.DOCEBO_COMPLETION_FIELD);
  const completionValue = stripQuotes(process.env.DOCEBO_COMPLETION_VALUE) || 'completed';
  const convIdField     = stripQuotes(process.env.DOCEBO_CONV_ID_FIELD);
  const durationField   = stripQuotes(process.env.DOCEBO_DURATION_FIELD);

  if (!completionField) {
    throw new Error(
      'DOCEBO_COMPLETION_FIELD env var is not set ' +
      '(current value: ' + JSON.stringify(process.env.DOCEBO_COMPLETION_FIELD) + ')'
    );
  }

  const token = await getAccessToken();

  // Build enrollment_fields payload
  const enrollmentFields = {};
  enrollmentFields[completionField] = completionValue;
  if (convIdField   && conversationId) enrollmentFields[convIdField]   = conversationId;
  if (durationField && durationSecs)   enrollmentFields[durationField] = String(durationSecs);

  const body = { enrollment_fields: enrollmentFields };

  console.log(`[Docebo] PUT ${base}/learn/v1/enrollments/${courseId}/${userId}`);
  console.log(`[Docebo] courseId=${JSON.stringify(courseId)} userId=${JSON.stringify(userId)}`);
  console.log('[Docebo] Payload:', JSON.stringify(body));

  let response;
  try {
    response = await axios.put(
      `${base}/learn/v1/enrollments/${courseId}/${userId}`,
      body,
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );
  } catch (err) {
    const status = err.response?.status;
    const detail = JSON.stringify(err.response?.data || err.message);
    console.error('[Docebo] ✗ Mark complete failed');
    console.error(`[Docebo] Status : ${status}`);
    console.error(`[Docebo] Detail : ${detail}`);
    throw new Error(`Docebo mark complete failed (${status}): ${detail}`);
  }

  console.log('[Docebo] ✓ Enrollment marked complete');
  return response.data;
}

module.exports = { markComplete };
