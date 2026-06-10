const express           = require('express');
const router            = express.Router();
const elevenLabsService = require('../services/elevenlabs');

async function launchHandler(req, res) {
  try {
    const params = Object.assign({}, req.query, req.body);

    const toScalar = (v) => {
      if (!v) return '';
      if (Array.isArray(v)) return String(v[0]);
      return String(v);
    };

    const userId     = toScalar(params.user_id   || params.userId);
    const courseId   = toScalar(params.course_id || params.courseId);
    const username   = toScalar(params.username);
    const courseCode = toScalar(params.course_code || params.courseCode);

    let userEmail = '';
    let userName  = username;

    if (params.actor) {
      try {
        const actor = typeof params.actor === 'string'
          ? JSON.parse(params.actor) : params.actor;
        const mboxRaw = Array.isArray(actor.mbox) ? actor.mbox[0] : (actor.mbox || '');
        userEmail = mboxRaw.replace('mailto:', '').trim();
        userName  = Array.isArray(actor.name) ? actor.name[0] : (actor.name || username);
      } catch (e) {
        console.warn('[LAUNCH] Could not parse actor:', e.message);
      }
    }

    if (!userId || !courseId) {
      return res.status(400).json({
        error:         'Missing required parameters: user_id and course_id',
        received_keys: Object.keys(params),
      });
    }

    const session = await elevenLabsService.createSignedSession({
      userId, courseId, userName, userEmail,
      courseName: courseCode || `Course ${courseId}`,
    });

    console.log(`[LAUNCH] ✓ Session ready — user=${userId} course=${courseId} conv=${session.conversationId}`);

    const signedUrl     = session.signedUrl;
    const displayName   = userName   || 'Learner';
    const displayCourse = courseCode || `Course ${courseId}`;

    return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>AI Voice Assistant</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f1117; color: #e8e9f0;
      height: 100vh; display: flex; align-items: center;
      justify-content: center; padding: 1rem;
    }
    .container {
      background: #1a1d27; border: 1px solid #2e3250; border-radius: 16px;
      width: 100%; max-width: 480px; padding: 2.5rem 2rem;
      display: flex; flex-direction: column; align-items: center;
      gap: 1.5rem; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      position: relative;
    }
    .header { text-align: center; }
    .header h2 { font-size: 1.2rem; font-weight: 600; margin-bottom: 0.3rem; }
    .header p  { font-size: 0.8rem; color: #8b8fa8; }

    /* Status badge */
    .status-badge {
      font-size: 0.75rem; font-weight: 600; padding: 4px 14px;
      border-radius: 99px; letter-spacing: 0.4px;
      background: rgba(245,158,11,0.15); color: #f59e0b;
      border: 1px solid rgba(245,158,11,0.3); transition: all 0.3s;
    }
    .status-badge.connected  { background: rgba(34,197,94,0.15);   color: #22c55e; border-color: rgba(34,197,94,0.3); }
    .status-badge.listening  { background: rgba(59,130,246,0.15);  color: #60a5fa; border-color: rgba(59,130,246,0.3); }
    .status-badge.speaking   { background: rgba(168,85,247,0.15);  color: #c084fc; border-color: rgba(168,85,247,0.3); }
    .status-badge.ended      { background: rgba(244,63,94,0.15);   color: #f43f5e; border-color: rgba(244,63,94,0.3); }

    /* Mic orb */
    .orb-wrap { position: relative; display: flex; align-items: center; justify-content: center; }
    .orb-ring {
      position: absolute; width: 120px; height: 120px; border-radius: 50%;
      border: 2px solid rgba(59,130,246,0.3);
      animation: none; pointer-events: none;
    }
    .orb-ring.pulse {
      animation: ripple 1.5s ease-out infinite;
    }
    @keyframes ripple {
      0%   { transform: scale(1);   opacity: 0.6; }
      100% { transform: scale(1.6); opacity: 0; }
    }
    .orb {
      width: 90px; height: 90px; border-radius: 50%;
      background: linear-gradient(135deg, #1e3a5f, #2a1f4f);
      border: 2px solid #2e3250;
      display: flex; align-items: center; justify-content: center;
      font-size: 2.2rem; cursor: pointer; transition: transform 0.15s, border-color 0.3s;
      position: relative; z-index: 1;
    }
    .orb:hover { transform: scale(1.05); }
    .orb.active {
      background: linear-gradient(135deg, #1e3a5f, #3b1f6f);
      border-color: #3b82f6;
      box-shadow: 0 0 20px rgba(59,130,246,0.3);
    }
    .orb.speaking-active {
      background: linear-gradient(135deg, #2a1040, #3b1f6f);
      border-color: #a855f7;
      box-shadow: 0 0 20px rgba(168,85,247,0.3);
    }
    .orb.disabled { opacity: 0.4; cursor: not-allowed; }

    /* Agent speech bubble */
    .speech-box {
      width: 100%; min-height: 64px; background: #212436;
      border: 1px solid #2e3250; border-radius: 12px; padding: 0.85rem 1rem;
      font-size: 0.88rem; line-height: 1.55; color: #c4c6d4;
      text-align: center; transition: all 0.3s;
    }
    .speech-box.has-text { color: #e8e9f0; border-color: #3b82f6; }

    /* Waveform bars */
    .waveform {
      display: flex; align-items: center; justify-content: center;
      gap: 3px; height: 32px; opacity: 0; transition: opacity 0.3s;
    }
    .waveform.show { opacity: 1; }
    .waveform span {
      display: block; width: 4px; border-radius: 2px;
      background: #3b82f6; animation: none;
    }
    .waveform.listening span { animation: wave 0.8s ease-in-out infinite; }
    .waveform.speaking-wave span { background: #a855f7; animation: wave 0.6s ease-in-out infinite; }
    .waveform span:nth-child(1) { animation-delay: 0s;    height: 8px; }
    .waveform span:nth-child(2) { animation-delay: 0.1s;  height: 16px; }
    .waveform span:nth-child(3) { animation-delay: 0.2s;  height: 24px; }
    .waveform span:nth-child(4) { animation-delay: 0.3s;  height: 16px; }
    .waveform span:nth-child(5) { animation-delay: 0.4s;  height: 8px; }
    .waveform span:nth-child(6) { animation-delay: 0.1s;  height: 20px; }
    .waveform span:nth-child(7) { animation-delay: 0.25s; height: 12px; }
    @keyframes wave {
      0%,100% { transform: scaleY(1); }
      50%      { transform: scaleY(2); }
    }

    /* Controls */
    .controls { display: flex; gap: 1rem; align-items: center; }
    .ctrl-btn {
      background: #212436; border: 1px solid #2e3250; border-radius: 50%;
      width: 44px; height: 44px; display: flex; align-items: center;
      justify-content: center; cursor: pointer; font-size: 1.1rem;
      transition: background 0.15s, border-color 0.15s;
    }
    .ctrl-btn:hover:not(:disabled)       { background: #2e3250; }
    .ctrl-btn.muted                       { border-color: #f59e0b; background: rgba(245,158,11,0.1); }
    .ctrl-btn.end-call                    { border-color: rgba(244,63,94,0.4); color: #f43f5e; }
    .ctrl-btn.end-call:hover:not(:disabled) { background: rgba(244,63,94,0.15); }
    .ctrl-btn:disabled                    { opacity: 0.35; cursor: not-allowed; }

    .hint { font-size: 0.75rem; color: #555a72; text-align: center; }

    /* Confirm overlay */
    #confirm-overlay {
      display: none; position: absolute; inset: 0;
      background: rgba(15,17,23,0.88); border-radius: 16px;
      align-items: center; justify-content: center; z-index: 10;
    }
    #confirm-overlay.show { display: flex; }
    .confirm-box {
      background: #1a1d27; border: 1px solid #f43f5e;
      border-radius: 12px; padding: 1.8rem 1.5rem;
      text-align: center; max-width: 280px; width: 90%;
    }
    .confirm-box h3 { font-size: 1rem; margin-bottom: 0.5rem; }
    .confirm-box p  { font-size: 0.85rem; color: #8b8fa8; margin-bottom: 1.2rem; line-height: 1.5; }
    .confirm-btns   { display: flex; gap: 0.75rem; justify-content: center; }
    .confirm-btns button {
      border: none; border-radius: 8px; padding: 0.5rem 1.2rem;
      font-size: 0.88rem; font-weight: 600; cursor: pointer;
    }
    .btn-cancel { background: #2e3250; color: #e8e9f0; }
    .btn-end    { background: #f43f5e; color: #fff; }
  </style>
</head>
<body>
<div class="container">

  <div class="header">
    <h2>AI Voice Assistant</h2>
    <p>${displayName} · ${displayCourse}</p>
  </div>

  <span class="status-badge" id="status-badge">Connecting…</span>

  <div class="speech-box" id="speech-box">Waiting for AI assistant…</div>

  <div class="waveform" id="waveform">
    <span></span><span></span><span></span><span></span>
    <span></span><span></span><span></span>
  </div>

  <div class="orb-wrap">
    <div class="orb-ring" id="orb-ring"></div>
    <div class="orb disabled" id="orb" title="Click to speak">🎤</div>
  </div>

  <div class="controls">
    <button class="ctrl-btn" id="mute-btn" disabled title="Mute / Unmute">🔇</button>
    <button class="ctrl-btn end-call" id="end-btn" disabled title="End call">📵</button>
  </div>

  <p class="hint" id="hint">Connecting to your AI assistant…</p>

  <!-- Confirmation overlay -->
  <div id="confirm-overlay">
    <div class="confirm-box">
      <h3>End Call?</h3>
      <p>Are you sure you want to end this voice session?</p>
      <div class="confirm-btns">
        <button class="btn-cancel" id="confirm-cancel">Cancel</button>
        <button class="btn-end"    id="confirm-end">End Call</button>
      </div>
    </div>
  </div>

</div>

<script>
(function () {
  const SIGNED_URL  = ${JSON.stringify(signedUrl)};
  const USER_ID     = ${JSON.stringify(userId)};
  const COURSE_ID   = ${JSON.stringify(courseId)};
  const COURSE_CODE = ${JSON.stringify(courseCode)};
  const USER_NAME   = ${JSON.stringify(displayName)};

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const badge          = document.getElementById('status-badge');
  const speechBox      = document.getElementById('speech-box');
  const waveform       = document.getElementById('waveform');
  const orb            = document.getElementById('orb');
  const orbRing        = document.getElementById('orb-ring');
  const muteBtn        = document.getElementById('mute-btn');
  const endBtn         = document.getElementById('end-btn');
  const hint           = document.getElementById('hint');
  const confirmOverlay = document.getElementById('confirm-overlay');
  const confirmCancel  = document.getElementById('confirm-cancel');
  const confirmEnd     = document.getElementById('confirm-end');

  // ── State ──────────────────────────────────────────────────────────────────
  let ws            = null;
  let audioCtx      = null;
  let micStream     = null;
  let scriptNode    = null;
  let isMuted       = false;
  let isConnected   = false;
  let isUserSpeaking = false;
  let pingInterval  = null;

  // Audio playback queue
  let audioQueue    = [];
  let isPlaying     = false;
  let nextPlayTime  = 0;

  // ElevenLabs expects 16kHz PCM Int16 mono
  const TARGET_SAMPLE_RATE = 16000;

  // ── UI helpers ────────────────────────────────────────────────────────────
  function setStatus(text, cls) {
    badge.textContent = text;
    badge.className   = 'status-badge ' + (cls || '');
  }

  function setSpeech(text) {
    speechBox.textContent = text;
    speechBox.className   = text ? 'speech-box has-text' : 'speech-box';
  }

  function setHint(text) { hint.textContent = text; }

  function setListening(on) {
    if (on) {
      orb.classList.add('active');
      orbRing.classList.add('pulse');
      waveform.classList.add('show', 'listening');
      waveform.classList.remove('speaking-wave');
      setStatus('Listening…', 'listening');
      setHint('Speak now — click orb or Mute to pause');
    } else {
      orb.classList.remove('active');
      orbRing.classList.remove('pulse');
      waveform.classList.remove('show', 'listening');
    }
  }

  function setAgentSpeaking(on) {
    if (on) {
      orb.classList.add('speaking-active');
      waveform.classList.add('show', 'speaking-wave');
      waveform.classList.remove('listening');
      setStatus('Speaking…', 'speaking');
      setHint('Agent is speaking…');
    } else {
      orb.classList.remove('speaking-active');
      waveform.classList.remove('show', 'speaking-wave');
    }
  }

  function enableControls(on) {
    orb.classList.toggle('disabled', !on);
    muteBtn.disabled = !on;
    endBtn.disabled  = !on;
  }

  // ── Audio playback (PCM Int16 from ElevenLabs) ────────────────────────────
  function ensureAudioContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function decodeInt16PCM(base64, sampleRate) {
    const binary = atob(base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const int16  = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
    const buffer = audioCtx.createBuffer(1, float32.length, sampleRate || 16000);
    buffer.getChannelData(0).set(float32);
    return buffer;
  }

  function scheduleAudioBuffer(audioBuffer) {
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    if (nextPlayTime < now) nextPlayTime = now + 0.05;

    source.start(nextPlayTime);
    nextPlayTime += audioBuffer.duration;

    source.onended = () => {
      audioQueue.shift();
      if (audioQueue.length === 0) {
        isPlaying = false;
        setAgentSpeaking(false);
        if (isConnected) {
          setStatus('Connected', 'connected');
          setHint('Click the microphone to speak');
        }
      }
    };
  }

  function playAudioChunk(base64) {
    ensureAudioContext();
    setAgentSpeaking(true);
    const buffer = decodeInt16PCM(base64, 16000);
    audioQueue.push(buffer);
    if (!isPlaying) {
      isPlaying = true;
      scheduleAudioBuffer(audioQueue[0]);
    } else {
      scheduleAudioBuffer(buffer);
    }
  }

  // ── Microphone capture ────────────────────────────────────────────────────
  async function startMicrophone() {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      ensureAudioContext();

      const micSource  = audioCtx.createMediaStreamSource(micStream);
      const bufferSize = 4096;
      scriptNode = audioCtx.createScriptProcessor(bufferSize, 1, 1);

      // Downsample from AudioContext sample rate to 16kHz and convert to Int16
      scriptNode.onaudioprocess = (e) => {
        if (!ws || ws.readyState !== WebSocket.OPEN || isMuted) return;

        const float32     = e.inputBuffer.getChannelData(0);
        const fromRate    = audioCtx.sampleRate;
        const ratio       = fromRate / TARGET_SAMPLE_RATE;
        const outLength   = Math.floor(float32.length / ratio);
        const downsampled = new Int16Array(outLength);

        for (let i = 0; i < outLength; i++) {
          const srcIdx = Math.floor(i * ratio);
          downsampled[i] = Math.max(-32768, Math.min(32767, float32[srcIdx] * 32767));
        }

        // Encode to base64 and send
        const bytes  = new Uint8Array(downsampled.buffer);
        let binary   = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const b64    = btoa(binary);

        ws.send(JSON.stringify({ type: 'user_audio_chunk', user_audio_chunk: b64 }));
      };

      micSource.connect(scriptNode);
      scriptNode.connect(audioCtx.destination);
      isUserSpeaking = true;
      setListening(true);
      setHint('Microphone active — speak now');

    } catch (err) {
      setSpeech('Microphone access denied. Please allow microphone permissions and try again.');
      setHint('Microphone permission required');
    }
  }

  function stopMicrophone() {
    if (scriptNode)  { scriptNode.disconnect();  scriptNode = null; }
    if (micStream)   { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    isUserSpeaking = false;
    setListening(false);
    if (isConnected) {
      setStatus('Connected', 'connected');
      setHint('Click the microphone to speak');
    }
  }

  function toggleMute() {
    isMuted = !isMuted;
    muteBtn.textContent = isMuted ? '🔇' : '🔊';
    muteBtn.classList.toggle('muted', isMuted);
    setHint(isMuted ? 'Muted — click mic or mute button to resume' : 'Microphone active — speak now');
  }

  // ── End call ──────────────────────────────────────────────────────────────
  function showEndConfirm() { confirmOverlay.classList.add('show'); }
  function hideEndConfirm() { confirmOverlay.classList.remove('show'); }

  function endCall() {
    hideEndConfirm();
    clearInterval(pingInterval);
    stopMicrophone();
    enableControls(false);
    setStatus('Ended', 'ended');
    setSpeech('Call ended. Your session has been recorded.');
    setHint('You may close this window.');
    waveform.classList.remove('show', 'listening', 'speaking-wave');
    if (ws && ws.readyState === WebSocket.OPEN) ws.close(1000, 'User ended call');
  }

  // ── WebSocket ─────────────────────────────────────────────────────────────
  function connect() {
    ws = new WebSocket(SIGNED_URL);

    ws.onopen = () => {
      isConnected = true;
      setStatus('Connected', 'connected');
      setSpeech('Connected! Click the microphone to start speaking.');
      setHint('Click the microphone button to begin');
      enableControls(true);

      // Initiation — audio mode, pass dynamic_variables for Docebo correlation
      ws.send(JSON.stringify({
        type: 'conversation_initiation_client_data',
        dynamic_variables: {
          userId:     USER_ID,
          courseId:   COURSE_ID,
          courseCode: COURSE_CODE,
          userName:   USER_NAME,
        },
      }));

      // Keep-alive ping
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: 'ping', event_id: Date.now() }));
      }, 20000);
    };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      const type = msg.type || '';

      if (type === 'ping') {
        const eventId = (msg.ping_event && msg.ping_event.event_id !== undefined)
          ? msg.ping_event.event_id : msg.event_id;
        ws.send(JSON.stringify({ type: 'pong', event_id: eventId }));
        return;
      }

      if (type === 'audio') {
        const b64 = msg.audio_event?.audio_base_64 || msg.audio;
        if (b64) playAudioChunk(b64);
        return;
      }

      if (type === 'agent_response') {
        const text = msg.agent_response_event?.agent_response || msg.agent_response || '';
        if (text) setSpeech(text);
        return;
      }

      if (type === 'user_transcript') {
        // Optionally show what user said
        return;
      }

      if (type === 'interruption') {
        // User interrupted agent — stop queued audio
        audioQueue = [];
        isPlaying  = false;
        nextPlayTime = 0;
        setAgentSpeaking(false);
        return;
      }

      if (type === 'conversation_initiation_metadata') return;

      if (type === 'error' || type === 'conversation_end') {
        isConnected = false;
        stopMicrophone();
        enableControls(false);
        setStatus('Ended', 'ended');
        setSpeech(msg.message || msg.reason || 'Session ended.');
        setHint('You may close this window.');
        clearInterval(pingInterval);
      }
    };

    ws.onclose = () => {
      isConnected = false;
      clearInterval(pingInterval);
      stopMicrophone();
      enableControls(false);
      setStatus('Disconnected', 'ended');
      setHint('Session ended. You may close this window.');
    };

    ws.onerror = () => {
      setStatus('Error', 'ended');
      setSpeech('Connection error. Please close and try again.');
      enableControls(false);
    };
  }

  // ── Orb click — toggle mic ────────────────────────────────────────────────
  orb.addEventListener('click', () => {
    if (!isConnected || orb.classList.contains('disabled')) return;
    // Unlock AudioContext on first user gesture (browser requirement)
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (isUserSpeaking) stopMicrophone();
    else startMicrophone();
  });

  muteBtn.addEventListener('click', () => { if (isUserSpeaking) toggleMute(); });
  endBtn.addEventListener('click', showEndConfirm);
  confirmCancel.addEventListener('click', hideEndConfirm);
  confirmEnd.addEventListener('click', endCall);
  confirmOverlay.addEventListener('click', (e) => {
    if (e.target === confirmOverlay) hideEndConfirm();
  });

  connect();
})();
</script>
</body>
</html>`);

  } catch (err) {
    console.error('[LAUNCH] Error:', err.message);
    return res.status(500).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/><title>Error</title>
  <style>
    body { font-family:sans-serif; background:#0f1117; color:#e8e9f0;
           display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .box { background:#1a1d27; border:1px solid #f43f5e; border-radius:12px;
           padding:2rem; max-width:420px; text-align:center; }
    h2 { color:#f43f5e; margin-bottom:.5rem; }
    p  { color:#8b8fa8; font-size:.9rem; line-height:1.5; }
    code { display:block; margin-top:1rem; font-size:.75rem; color:#555a72;
           background:#0f1117; padding:.5rem; border-radius:6px; }
  </style>
</head>
<body>
  <div class="box">
    <h2>⚠️ Session Error</h2>
    <p>Could not start the AI assistant. Please close and try again.</p>
    <code>${err.message}</code>
  </div>
</body>
</html>`);
  }
}

router.get('/launch',  launchHandler);
router.post('/launch', launchHandler);

module.exports = router;
