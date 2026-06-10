// Webhook endpoint has no authentication for now.
// The ElevenLabs webhook URL is the only protection.
function verifyWebhookToken(req, res, next) {
  next();
}

module.exports = { verifyWebhookToken };
