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
      width: 100%; max-width: 420px; padding: 2.5rem 1.5rem;
      display: flex; flex-direction: column; align-items: center;
      gap: 1.4rem; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      position: relative;
    }

    .header { text-align: center; }
    .header h2 { font-size: 1.15rem; font-weight: 600; margin-bottom: 0.25rem; }
    .header p  { font-size: 0.78rem; color: #8b8fa8; }

    /* Status badge */
    .badge {
      font-size: 0.72rem; font-weight: 600; padding: 3px 14px;
      border-radius: 99px; letter-spacing: 0.4px; transition: all 0.3s;
      background: rgba(245,158,11,0.15); color: #f59e0b;
      border: 1px solid rgba(245,158,11,0.3);
    }
    .badge.connected  { background:rgba(34,197,94,0.15);  color:#22c55e; border-color:rgba(34,197,94,0.3); }
    .badge.listening  { background:rgba(59,130,246,0.15); color:#60a5fa; border-color:rgba(59,130,246,0.3); }
    .badge.speaking   { background:rgba(168,85,247,0.15); color:#c084fc; border-color:rgba(168,85,247,0.3); }
    .badge.ended      { background:rgba(244,63,94,0.15);  color:#f43f5e; border-color:rgba(244,63,94,0.3); }

    /* Agent speech */
    .speech-box {
      width: 100%; min-height: 60px; background: #212436;
      border: 1px solid #2e3250; border-radius: 10px;
      padding: 0.8rem 1rem; font-size: 0.87rem;
      line-height: 1.55; color: #8b8fa8; text-align: center;
      transition: border-color 0.3s, color 0.3s;
    }
    .speech-box.active { color: #e8e9f0; border-color: #4f46e5; }

    /* Waveform */
    .waveform {
      display: flex; align-items: center; justify-content: center;
      gap: 3px; height: 30px;
    }
    .waveform span {
      display: block; width: 4px; border-radius: 2px;
      background: #2e3250; transition: background 0.3s;
    }
    .waveform.listening span  { background: #3b82f6; animation: wave 0.7s ease-in-out infinite; }
    .waveform.speaking  span  { background: #a855f7; animation: wave 0.5s ease-in-out infinite; }
    .waveform span:nth-child(1){ height:6px;  animation-delay:0s; }
    .waveform span:nth-child(2){ height:14px; animation-delay:0.1s; }
    .waveform span:nth-child(3){ height:22px; animation-delay:0.2s; }
    .waveform span:nth-child(4){ height:14px; animation-delay:0.3s; }
    .waveform span:nth-child(5){ height:6px;  animation-delay:0.4s; }
    .waveform span:nth-child(6){ height:18px; animation-delay:0.15s; }
    .waveform span:nth-child(7){ height:10px; animation-delay:0.25s; }
    @keyframes wave {
      0%,100% { transform:scaleY(1); } 50% { transform:scaleY(2.2); }
    }

    /* Orb */
    .orb-wrap { position: relative; display: flex; align-items: center; justify-content: center; }
    .orb-ring {
      position: absolute; width: 110px; height: 110px;
      border-radius: 50%; border: 2px solid transparent;
      pointer-events: none; transition: border-color 0.3s;
    }
    .orb-ring.listening { border-color: rgba(59,130,246,0.5); animation: ripple 1.4s ease-out infinite; }
    .orb-ring.speaking  { border-color: rgba(168,85,247,0.5); animation: ripple 1s ease-out infinite; }
    @keyframes ripple {
      0%   { transform:scale(1);   opacity:0.7; }
      100% { transform:scale(1.55); opacity:0; }
    }
    .orb {
      width: 84px; height: 84px; border-radius: 50%;
      background: #212436; border: 2px solid #2e3250;
      display: flex; align-items: center; justify-content: center;
      font-size: 2rem; cursor: pointer; position: relative; z-index: 1;
      transition: background 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.1s;
      user-select: none;
    }
    .orb:active { transform: scale(0.95); }
    .orb.listening {
      background: #1e2d4a; border-color: #3b82f6;
      box-shadow: 0 0 18px rgba(59,130,246,0.35);
    }
    .orb.speaking {
      background: #1e1535; border-color: #a855f7;
      box-shadow: 0 0 18px rgba(168,85,247,0.35);
    }
    .orb.disabled { opacity: 0.35; cursor: not-allowed; pointer-events: none; }

    /* Controls */
    .controls { display: flex; gap: 1rem; align-items: center; }
    .ctrl {
      background: #212436; border: 1px solid #2e3250; border-radius: 50%;
      width: 44px; height: 44px; font-size: 1.1rem; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, border-color 0.15s;
    }
    .ctrl:hover:not(:disabled) { background: #2e3250; }
    .ctrl.muted  { border-color: #f59e0b; background: rgba(245,158,11,0.1); }
    .ctrl.danger { border-color: rgba(244,63,94,0.4); color: #f43f5e; }
    .ctrl.danger:hover:not(:disabled) { background: rgba(244,63,94,0.15); }
    .ctrl:disabled { opacity: 0.3; cursor: not-allowed; }

    .hint { font-size: 0.74rem; color: #555a72; text-align: center; min-height: 1.1em; }

    /* Confirm overlay */
    .overlay {
      display: none; position: absolute; inset: 0;
      background: rgba(15,17,23,0.88); border-radius: 16px;
      align-items: center; justify-content: center; z-index: 20;
    }
    .overlay.show { display: flex; }
    .confirm {
      background: #1a1d27; border: 1px solid #f43f5e;
      border-radius: 12px; padding: 1.6rem 1.4rem;
      text-align: center; max-width: 260px; width: 90%;
    }
    .confirm h3 { font-size: 0.95rem; margin-bottom: 0.4rem; }
    .confirm p  { font-size: 0.82rem; color: #8b8fa8; margin-bottom: 1.1rem; line-height: 1.5; }
    .confirm-btns { display: flex; gap: 0.6rem; justify-content: center; }
    .confirm-btns button {
      border: none; border-radius: 8px; padding: 0.45rem 1.1rem;
      font-size: 0.85rem; font-weight: 600; cursor: pointer;
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

  <span class="badge" id="badge">Connecting…</span>

  <div class="speech-box" id="speech">Waiting for AI assistant…</div>

  <div class="waveform" id="waveform">
    <span></span><span></span><span></span><span></span>
    <span></span><span></span><span></span>
  </div>

  <div class="orb-wrap">
    <div class="orb-ring" id="orb-ring"></div>
    <div class="orb disabled" id="orb" title="Click to speak">🎤</div>
  </div>

  <div class="controls">
    <button class="ctrl" id="mute-btn" disabled title="Mute">🔇</button>
    <button class="ctrl danger" id="end-btn" disabled title="End call">📵</button>
  </div>

  <p class="hint" id="hint">Establishing connection…</p>

  <div class="overlay" id="overlay">
    <div class="confirm">
      <h3>End Call?</h3>
      <p>Are you sure you want to end this voice session?</p>
      <div class="confirm-btns">
        <button class="btn-cancel" id="cancel-btn">Cancel</button>
        <button class="btn-end"    id="confirm-btn">End Call</button>
      </div>
    </div>
  </div>
</div>

<script>
(function () {
  // ── Config (server-injected) ──────────────────────────────────────────────
  const SIGNED_URL  = ${JSON.stringify(signedUrl)};
  const USER_ID     = ${JSON.stringify(userId)};
  const COURSE_ID   = ${JSON.stringify(courseId)};
  const COURSE_CODE = ${JSON.stringify(courseCode)};
  const USER_NAME   = ${JSON.stringify(displayName)};

  // ElevenLabs sends/expects PCM 16-bit mono at 16 000 Hz
  const EL_SAMPLE_RATE = 16000;

  // ── DOM ───────────────────────────────────────────────────────────────────
  const badge    = document.getElementById('badge');
  const speech   = document.getElementById('speech');
  const waveform = document.getElementById('waveform');
  const orbEl    = document.getElementById('orb');
  const orbRing  = document.getElementById('orb-ring');
  const muteBtn  = document.getElementById('mute-btn');
  const endBtn   = document.getElementById('end-btn');
  const hintEl   = document.getElementById('hint');
  const overlay  = document.getElementById('overlay');
  const cancelBtn  = document.getElementById('cancel-btn');
  const confirmBtn = document.getElementById('confirm-btn');

  // ── State ─────────────────────────────────────────────────────────────────
  let ws           = null;
  let audioCtx     = null;
  let micSource    = null;
  let processor    = null;
  let silentGain   = null;
  let micStream    = null;
  let isMuted      = false;
  let isConnected  = false;
  let isMicActive  = false;
  let pingInterval = null;

  // Playback scheduling
  let nextPlayAt   = 0; // audioCtx.currentTime when next chunk should start

  // ── UI helpers ────────────────────────────────────────────────────────────
  function setBadge(text, cls) {
    badge.textContent = text;
    badge.className   = 'badge ' + (cls || '');
  }
  function setSpeech(text) {
    speech.textContent = text || '';
    speech.className   = text ? 'speech-box active' : 'speech-box';
  }
  function setHint(text) { hintEl.textContent = text; }

  function setMicVisual(on) {
    isMicActive = on;
    orbEl.classList.toggle('listening', on && !isMuted);
    orbRing.className = (on && !isMuted) ? 'orb-ring listening' : 'orb-ring';
    waveform.className = (on && !isMuted) ? 'waveform listening' : 'waveform';
    setBadge(on && !isMuted ? 'Listening…' : 'Connected', on && !isMuted ? 'listening' : 'connected');
    setHint(on && !isMuted ? 'Speak now — click mic to stop' : isMuted ? 'Muted' : 'Click the mic to speak');
  }

  function setAgentSpeaking(on) {
    orbEl.classList.toggle('speaking', on);
    orbRing.className = on ? 'orb-ring speaking' : 'orb-ring';
    waveform.className = on ? 'waveform speaking' : 'waveform';
    if (on) { setBadge('Speaking…', 'speaking'); setHint('AI is speaking…'); }
    else     { setBadge('Connected', 'connected'); setHint('Click the mic to speak'); }
  }

  function enableControls(on) {
    orbEl.classList.toggle('disabled', !on);
    muteBtn.disabled = !on;
    endBtn.disabled  = !on;
  }

  // ── AudioContext — created ONLY on first user gesture ─────────────────────
  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume if suspended (Chrome autoplay policy)
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // ── Audio playback ────────────────────────────────────────────────────────
  // Receives base64-encoded PCM Int16 @ 16 kHz from ElevenLabs
  // and plays it via AudioContext with precise scheduling.
  function playChunk(base64) {
    const ctx = getAudioContext();

    // Decode base64 → Uint8Array → Int16Array → Float32Array
    const raw    = atob(base64);
    const bytes  = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

    const int16   = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    // Create AudioBuffer at ElevenLabs native rate (16 kHz)
    const buf = ctx.createBuffer(1, float32.length, EL_SAMPLE_RATE);
    buf.copyToChannel(float32, 0);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);

    // Schedule sequentially — gaps cause clicks, overlap causes distortion
    const now = ctx.currentTime;
    if (nextPlayAt < now + 0.02) nextPlayAt = now + 0.02; // small initial buffer
    src.start(nextPlayAt);
    nextPlayAt += buf.duration;

    src.onended = () => {
      // If queue is drained and no more chunks arriving, stop speaking indicator
      if (nextPlayAt <= ctx.currentTime + 0.05) {
        setAgentSpeaking(false);
      }
    };
  }

  // ── Microphone capture ────────────────────────────────────────────────────
  async function startMic() {
    if (isMicActive) return;
    try {
      const ctx = getAudioContext();

      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: EL_SAMPLE_RATE },
        video: false,
      });

      micSource = ctx.createMediaStreamSource(micStream);

      // ScriptProcessorNode to capture PCM — buffer size 4096 @ native rate
      processor = ctx.createScriptProcessor(4096, 1, 1);

      // ── KEY FIX: route through a SILENT gain node (gain=0) ──────────────
      // ScriptProcessorNode must be connected to destination to run in Chrome,
      // but connecting directly would cause mic echo. Silent gain = no echo.
      silentGain = ctx.createGain();
      silentGain.gain.value = 0;

      micSource.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(ctx.destination);

      const nativeRate = ctx.sampleRate; // typically 44100 or 48000

      processor.onaudioprocess = (e) => {
        if (!ws || ws.readyState !== WebSocket.OPEN || isMuted) return;

        const input      = e.inputBuffer.getChannelData(0); // Float32 at native rate
        const ratio      = nativeRate / EL_SAMPLE_RATE;
        const outLen     = Math.floor(input.length / ratio);
        const pcm16      = new Int16Array(outLen);

        // Simple linear downsampling to 16 kHz
        for (let i = 0; i < outLen; i++) {
          const idx   = Math.floor(i * ratio);
          const float = Math.max(-1, Math.min(1, input[idx]));
          pcm16[i]    = float < 0 ? float * 32768 : float * 32767;
        }

        // Encode to base64 and send
        const u8     = new Uint8Array(pcm16.buffer);
        let binary   = '';
        for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
        ws.send(JSON.stringify({ type: 'user_audio_chunk', user_audio_chunk: btoa(binary) }));
      };

      setMicVisual(true);

    } catch (err) {
      setSpeech('⚠️ Microphone access denied. Please allow microphone permissions and try again.');
      setHint('Check browser microphone permissions');
    }
  }

  function stopMic() {
    if (processor)   { processor.disconnect();  processor = null; }
    if (silentGain)  { silentGain.disconnect(); silentGain = null; }
    if (micSource)   { micSource.disconnect();  micSource = null; }
    if (micStream)   { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    setMicVisual(false);
  }

  // ── Mute ──────────────────────────────────────────────────────────────────
  function toggleMute() {
    isMuted = !isMuted;
    muteBtn.textContent = isMuted ? '🔊' : '🔇';
    muteBtn.classList.toggle('muted', isMuted);
    orbEl.classList.toggle('listening', isMicActive && !isMuted);
    orbRing.className   = (isMicActive && !isMuted) ? 'orb-ring listening' : 'orb-ring';
    waveform.className  = (isMicActive && !isMuted) ? 'waveform listening' : 'waveform';
    setHint(isMuted ? 'Muted — click mute button to resume' : 'Microphone active — speak now');
  }

  // ── End call ──────────────────────────────────────────────────────────────
  function showConfirm() { overlay.classList.add('show'); }
  function hideConfirm() { overlay.classList.remove('show'); }

  function endCall() {
    hideConfirm();
    clearInterval(pingInterval);
    stopMic();
    enableControls(false);
    orbEl.textContent = '👋';
    setBadge('Ended', 'ended');
    setSpeech('Call ended. Your session has been recorded.');
    setHint('You may close this window.');
    waveform.className = 'waveform';
    orbRing.className  = 'orb-ring';
    if (ws && ws.readyState === WebSocket.OPEN) ws.close(1000, 'User ended call');
  }

  // ── WebSocket ─────────────────────────────────────────────────────────────
  function connect() {
    ws = new WebSocket(SIGNED_URL);

    ws.onopen = () => {
      isConnected = true;
      setBadge('Connected', 'connected');
      setSpeech('Connected! Click the microphone to start speaking.');
      setHint('Click the 🎤 button to begin');
      enableControls(true);

      ws.send(JSON.stringify({
        type: 'conversation_initiation_client_data',
        dynamic_variables: {
          userId:     USER_ID,
          courseId:   COURSE_ID,
          courseCode: COURSE_CODE,
          userName:   USER_NAME,
        },
      }));

      // Keep-alive ping every 20 s
      pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: 'ping', event_id: Date.now() }));
      }, 20000);
    };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      const type = msg.type || '';

      // ── Pong ──────────────────────────────────────────────────────────
      if (type === 'ping') {
        const eid = msg.ping_event?.event_id ?? msg.event_id;
        ws.send(JSON.stringify({ type: 'pong', event_id: eid }));
        return;
      }

      // ── Agent audio ───────────────────────────────────────────────────
      if (type === 'audio') {
        const b64 = msg.audio_event?.audio_base_64
                 || msg.audio_event?.audio
                 || msg.audio;
        if (b64) {
          setAgentSpeaking(true);
          playChunk(b64);
        }
        return;
      }

      // ── Agent text transcript (show what agent said) ───────────────────
      if (type === 'agent_response') {
        const text = msg.agent_response_event?.agent_response
                  || msg.agent_response || '';
        if (text) setSpeech(text);
        return;
      }

      // ── User interrupted agent — clear audio scheduling ────────────────
      if (type === 'interruption') {
        nextPlayAt = 0;
        setAgentSpeaking(false);
        return;
      }

      // ── Ignore these silently ──────────────────────────────────────────
      if (type === 'user_transcript' ||
          type === 'conversation_initiation_metadata') return;

      // ── Session ended ──────────────────────────────────────────────────
      if (type === 'error' || type === 'conversation_end') {
        isConnected = false;
        stopMic();
        enableControls(false);
        clearInterval(pingInterval);
        setBadge('Ended', 'ended');
        setSpeech(msg.message || msg.reason || 'Session ended.');
        setHint('You may close this window.');
        orbRing.className = 'orb-ring';
        waveform.className = 'waveform';
      }
    };

    ws.onclose = () => {
      isConnected = false;
      clearInterval(pingInterval);
      stopMic();
      if (endBtn.disabled) return; // already ended by user
      enableControls(false);
      setBadge('Disconnected', 'ended');
      setHint('Session ended. You may close this window.');
      orbRing.className  = 'orb-ring';
      waveform.className = 'waveform';
    };

    ws.onerror = () => {
      setBadge('Error', 'ended');
      setSpeech('⚠️ Connection error. Please close and try again.');
      enableControls(false);
    };
  }

  // ── Event listeners ───────────────────────────────────────────────────────
  orbEl.addEventListener('click', () => {
    if (!isConnected) return;
    // getAudioContext() here ensures it's created on a user gesture
    getAudioContext();
    if (isMicActive) stopMic();
    else startMic();
  });

  muteBtn.addEventListener('click', toggleMute);
  endBtn.addEventListener('click', showConfirm);
  cancelBtn.addEventListener('click', hideConfirm);
  confirmBtn.addEventListener('click', endCall);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) hideConfirm(); });

  // ── Start ─────────────────────────────────────────────────────────────────
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
    body{font-family:sans-serif;background:#0f1117;color:#e8e9f0;
         display:flex;align-items:center;justify-content:center;min-height:100vh;}
    .box{background:#1a1d27;border:1px solid #f43f5e;border-radius:12px;
         padding:2rem;max-width:420px;text-align:center;}
    h2{color:#f43f5e;margin-bottom:.5rem;}
    p{color:#8b8fa8;font-size:.9rem;line-height:1.5;}
    code{display:block;margin-top:1rem;font-size:.75rem;color:#555a72;
         background:#0f1117;padding:.5rem;border-radius:6px;}
  </style>
</head>
<body>
  <div class="box">
    <h2>&#9888;&#65039; Session Error</h2>
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
