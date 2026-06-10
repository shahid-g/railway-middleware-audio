const express        = require('express');
const router         = express.Router();
const { verifyWebhookToken } = require('../middleware/auth');
const { markComplete }       = require('../services/docebo');
const { getSession }         = require('../services/elevenlabs');

/**
 * POST /webhooks/elevenlabs/done
 *
 * Fired by ElevenLabs when a voice session ends.
 * Marks the Docebo enrollment as complete — no transcript saved.
 *
 * ElevenLabs payload structure:
 * {
 *   "type": "post_call_transcription",
 *   "data": {
 *     "conversation_id": "...",
 *     "metadata": { "call_duration_secs": 42 },
 *     "conversation_initiation_client_data": {
 *       "dynamic_variables": { "userId": "...", "courseId": "..." }
 *     }
 *   }
 * }
 */
router.post('/done', verifyWebhookToken, async (req, res) => {
  // ACK immediately — ElevenLabs requires a fast 200
  res.status(200).json({ received: true });

  try {
    const payload = req.body;
    console.log(`[ElevenLabs Webhook] type=${payload.type}`);

    if (payload.type && payload.type !== 'post_call_transcription') {
      console.log(`[ElevenLabs Webhook] Skipping type: ${payload.type}`);
      return;
    }

    const data           = payload.data           || payload;
    const conversationId = data.conversation_id;
    const metadata       = data.metadata          || {};
    const dynamicVars    = data.conversation_initiation_client_data?.dynamic_variables || {};
    const durationSecs   = metadata.call_duration_secs || 0;

    console.log(`[ElevenLabs Webhook] conv=${conversationId} duration=${durationSecs}s`);
    console.log('[ElevenLabs Webhook] dynamic_variables:', JSON.stringify(dynamicVars));

    // ── Flatten arrays — courseId may arrive as ["5062","5062"] ──────────
    const toScalar = (v) => !v ? null : Array.isArray(v) ? String(v[0]) : String(v);

    let userId   = toScalar(dynamicVars.userId   || dynamicVars.user_id);
    let courseId = toScalar(dynamicVars.courseId || dynamicVars.course_id);

    // Fallback: in-memory session store
    if ((!userId || !courseId) && conversationId) {
      const stored = getSession(conversationId);
      if (stored) {
        userId   = stored.userId;
        courseId = stored.courseId;
        console.log(`[ElevenLabs Webhook] Context from session store — user=${userId} course=${courseId}`);
      }
    }

    if (!userId || !courseId) {
      console.error('[ElevenLabs Webhook] Cannot update Docebo — userId/courseId missing. conv=' + conversationId);
      return;
    }

    // ── Mark enrollment complete in Docebo ────────────────────────────────
    try {
      await markComplete({ userId, courseId, conversationId, durationSecs });
      console.log(`[ElevenLabs Webhook] ✓ Docebo enrollment marked complete — user=${userId} course=${courseId}`);
    } catch (err) {
      console.error('[ElevenLabs Webhook] Mark complete failed:', err.message);
    }

  } catch (err) {
    console.error('[ElevenLabs Webhook] Handler error:', err.message);
  }
});

module.exports = router;
