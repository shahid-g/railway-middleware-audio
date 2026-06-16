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
        error: 'Missing required parameters: user_id and course_id',
        received_keys: Object.keys(params),
      });
    }

    const session = await elevenLabsService.createSignedSession({
      userId, courseId, userName, userEmail,
      courseName: courseCode || `Course ${courseId}`,
    });

    console.log(`[LAUNCH] ✓ user=${userId} course=${courseId} conv=${session.conversationId}`);

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
      width: 100%; max-width: 400px; padding: 2rem 1.5rem;
      display: flex; flex-direction: column; align-items: center;
      gap: 1.25rem; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      position: relative;
    }
    .header { text-align: center; }
    .header h2 { font-size: 1.1rem; font-weight: 600; margin-bottom: 0.2rem; }
    .header p  { font-size: 0.76rem; color: #8b8fa8; }

    .badge {
      font-size: 0.71rem; font-weight: 600; padding: 3px 13px;
      border-radius: 99px; transition: all 0.3s;
      background: rgba(245,158,11,0.15); color: #f59e0b;
      border: 1px solid rgba(245,158,11,0.3);
    }
    .badge.connected { background:rgba(34,197,94,0.15);  color:#22c55e; border-color:rgba(34,197,94,0.3); }
    .badge.listening { background:rgba(59,130,246,0.15); color:#60a5fa; border-color:rgba(59,130,246,0.3); }
    .badge.speaking  { background:rgba(168,85,247,0.15); color:#c084fc; border-color:rgba(168,85,247,0.3); }
    .badge.ended     { background:rgba(244,63,94,0.15);  color:#f43f5e; border-color:rgba(244,63,94,0.3); }

    .speech-box {
      width: 100%; min-height: 56px; background: #212436;
      border: 1px solid #2e3250; border-radius: 10px;
      padding: 0.75rem 1rem; font-size: 0.86rem;
      line-height: 1.55; color: #8b8fa8; text-align: center;
      transition: border-color 0.3s, color 0.3s;
    }
    .speech-box.active { color: #e8e9f0; border-color: #4f46e5; }

    .waveform {
      display: flex; align-items: center; justify-content: center;
      gap: 3px; height: 28px;
    }
    .waveform span {
      display: block; width: 4px; border-radius: 2px; background: #2e3250;
    }
    .waveform.listening span { background:#3b82f6; animation:wave 0.7s ease-in-out infinite; }
    .waveform.speaking  span { background:#a855f7; animation:wave 0.5s ease-in-out infinite; }
    .waveform span:nth-child(1){ height:5px;  animation-delay:0s; }
    .waveform span:nth-child(2){ height:12px; animation-delay:0.1s; }
    .waveform span:nth-child(3){ height:20px; animation-delay:0.2s; }
    .waveform span:nth-child(4){ height:12px; animation-delay:0.3s; }
    .waveform span:nth-child(5){ height:5px;  animation-delay:0.4s; }
    .waveform span:nth-child(6){ height:16px; animation-delay:0.15s; }
    .waveform span:nth-child(7){ height:9px;  animation-delay:0.25s; }
    @keyframes wave { 0%,100%{transform:scaleY(1)} 50%{transform:scaleY(2.3)} }

    .orb-wrap { position:relative; display:flex; align-items:center; justify-content:center; }
    .orb-ring {
      position:absolute; width:106px; height:106px; border-radius:50%;
      border:2px solid transparent; pointer-events:none;
    }
    .orb-ring.listening { border-color:rgba(59,130,246,0.5); animation:ripple 1.4s ease-out infinite; }
    .orb-ring.speaking  { border-color:rgba(168,85,247,0.5); animation:ripple 1s ease-out infinite; }
    @keyframes ripple { 0%{transform:scale(1);opacity:.7} 100%{transform:scale(1.55);opacity:0} }

    .orb {
      width:80px; height:80px; border-radius:50%;
      background:#212436; border:2px solid #2e3250;
      display:flex; align-items:center; justify-content:center;
      font-size:1.9rem; cursor:pointer; position:relative; z-index:1;
      transition:background .2s, border-color .2s, box-shadow .2s, transform .1s;
      user-select:none; -webkit-user-select:none;
    }
    .orb:active { transform:scale(0.93); }
    .orb.listening { background:#1e2d4a; border-color:#3b82f6; box-shadow:0 0 16px rgba(59,130,246,0.35); }
    .orb.speaking  { background:#1e1535; border-color:#a855f7; box-shadow:0 0 16px rgba(168,85,247,0.35); }
    .orb.disabled  { opacity:0.35; cursor:not-allowed; pointer-events:none; }

    .controls { display:flex; gap:1rem; align-items:center; }
    .ctrl {
      background:#212436; border:1px solid #2e3250; border-radius:50%;
      width:44px; height:44px; font-size:1.05rem; cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      transition:background .15s, border-color .15s;
    }
    .ctrl:hover:not(:disabled) { background:#2e3250; }
    .ctrl.muted  { border-color:#f59e0b; background:rgba(245,158,11,0.1); }
    .ctrl.danger { border-color:rgba(244,63,94,0.4); color:#f43f5e; }
    .ctrl.danger:hover:not(:disabled) { background:rgba(244,63,94,0.15); }
    .ctrl:disabled { opacity:0.3; cursor:not-allowed; }

    .hint { font-size:0.73rem; color:#555a72; text-align:center; min-height:1.1em; }

    .overlay {
      display:none; position:absolute; inset:0;
      background:rgba(15,17,23,0.9); border-radius:16px;
      align-items:center; justify-content:center; z-index:20;
    }
    .overlay.show { display:flex; }
    .confirm {
      background:#1a1d27; border:1px solid #f43f5e;
      border-radius:12px; padding:1.5rem 1.25rem;
      text-align:center; max-width:250px; width:90%;
    }
    .confirm h3 { font-size:0.92rem; margin-bottom:.4rem; }
    .confirm p  { font-size:0.8rem; color:#8b8fa8; margin-bottom:1rem; line-height:1.5; }
    .confirm-btns { display:flex; gap:.6rem; justify-content:center; }
    .confirm-btns button {
      border:none; border-radius:8px; padding:.4rem 1rem;
      font-size:.82rem; font-weight:600; cursor:pointer;
    }
    .btn-cancel { background:#2e3250; color:#e8e9f0; }
    .btn-end    { background:#f43f5e; color:#fff; }
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <h2>AI Voice Assistant</h2>
    <p>${displayName} &middot; ${displayCourse}</p>
  </div>

  <span class="badge" id="badge">Connecting&hellip;</span>
  <div class="speech-box" id="speech">Waiting for AI assistant&hellip;</div>

  <div class="waveform" id="waveform">
    <span></span><span></span><span></span><span></span>
    <span></span><span></span><span></span>
  </div>

  <div class="orb-wrap">
    <div class="orb-ring" id="orb-ring"></div>
    <div class="orb disabled" id="orb" title="Click to speak">&nbsp;&#x1F399;</div>
  </div>

  <div class="controls">
    <button class="ctrl" id="mute-btn" disabled title="Mute">&#x1F507;</button>
    <button class="ctrl danger" id="end-btn" disabled title="End call">&#x1F4F5;</button>
  </div>

  <p class="hint" id="hint">Establishing connection&hellip;</p>

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
  // ── Config ────────────────────────────────────────────────────────────────
  var SIGNED_URL  = ${JSON.stringify(signedUrl)};
  var USER_ID     = ${JSON.stringify(userId)};
  var COURSE_ID   = ${JSON.stringify(courseId)};
  var COURSE_CODE = ${JSON.stringify(courseCode)};
  var USER_NAME   = ${JSON.stringify(displayName)};
  var EL_RATE     = 16000; // ElevenLabs PCM sample rate

  // ── DOM ───────────────────────────────────────────────────────────────────
  var badge      = document.getElementById('badge');
  var speechEl   = document.getElementById('speech');
  var waveformEl = document.getElementById('waveform');
  var orbEl      = document.getElementById('orb');
  var orbRing    = document.getElementById('orb-ring');
  var muteBtn    = document.getElementById('mute-btn');
  var endBtn     = document.getElementById('end-btn');
  var hintEl     = document.getElementById('hint');
  var overlay    = document.getElementById('overlay');
  var cancelBtn  = document.getElementById('cancel-btn');
  var confirmBtn = document.getElementById('confirm-btn');

  // ── State ─────────────────────────────────────────────────────────────────
  var ws          = null;
  var audioCtx    = null;
  var workletNode = null;
  var micStream   = null;
  var micSource   = null;
  var isMuted     = false;
  var isConnected = false;
  var isMicOn     = false;
  var pingTimer   = null;
  var nextPlayAt  = 0;

  // ── AudioWorklet code (inline as Blob URL — no external file needed) ──────
  // Runs on dedicated audio thread. Captures Float32 frames from mic,
  // downsamples to 16 kHz, converts to Int16 PCM, sends to main thread.
  var WORKLET_CODE = [
    'class PCMCapture extends AudioWorkletProcessor {',
    '  constructor(options) {',
    '    super();',
    '    this._nativeRate = options.processorOptions.nativeRate;',
    '    this._targetRate = options.processorOptions.targetRate;',
    '    this._ratio      = this._nativeRate / this._targetRate;',
    '    this._buf        = [];',
    '    this._CHUNK      = 4096;',
    '  }',
    '  process(inputs) {',
    '    var ch = inputs[0] && inputs[0][0];',
    '    if (!ch) return true;',
    '    var ratio = this._ratio;',
    '    var outLen = Math.floor(ch.length / ratio);',
    '    for (var i = 0; i < outLen; i++) {',
    '      var f = ch[Math.floor(i * ratio)];',
    '      f = f < -1 ? -1 : f > 1 ? 1 : f;',
    '      this._buf.push(f < 0 ? f * 32768 : f * 32767);',
    '    }',
    '    while (this._buf.length >= this._CHUNK) {',
    '      var chunk = new Int16Array(this._buf.splice(0, this._CHUNK));',
    '      this.port.postMessage(chunk.buffer, [chunk.buffer]);',
    '    }',
    '    return true;',
    '  }',
    '}',
    'registerProcessor("pcm-capture", PCMCapture);'
  ].join('\\n');

  // ── UI helpers ────────────────────────────────────────────────────────────
  function setBadge(text, cls) {
    badge.textContent = text;
    badge.className   = 'badge ' + (cls || '');
  }
  function setSpeech(text) {
    speechEl.textContent = text;
    speechEl.className   = text ? 'speech-box active' : 'speech-box';
  }
  function setHint(text) { hintEl.textContent = text; }

  function setListening(on) {
    isMicOn = on;
    orbEl.classList.toggle('listening', on && !isMuted);
    orbRing.className  = (on && !isMuted) ? 'orb-ring listening' : 'orb-ring';
    waveformEl.className = (on && !isMuted) ? 'waveform listening' : 'waveform';
    setBadge(on && !isMuted ? 'Listening\u2026' : 'Connected',
             on && !isMuted ? 'listening' : 'connected');
    setHint(on && !isMuted ? 'Speak now \u2014 click mic to stop'
          : isMuted        ? 'Muted \u2014 click mute to resume'
          : 'Click the mic to speak');
  }

  function setAgentSpeaking(on) {
    orbEl.classList.toggle('speaking', on);
    orbRing.className    = on ? 'orb-ring speaking' : 'orb-ring';
    waveformEl.className = on ? 'waveform speaking' : 'waveform';
    if (on) { setBadge('Speaking\u2026', 'speaking'); setHint('AI is speaking\u2026'); }
    else     { setBadge('Connected', 'connected');    setHint('Click the mic to speak'); }
  }

  function enableControls(on) {
    orbEl.classList.toggle('disabled', !on);
    muteBtn.disabled = !on;
    endBtn.disabled  = !on;
  }

  // ── AudioContext (created on first user gesture) ──────────────────────────
  function getCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // ── Audio playback: decode base64 PCM Int16 @16kHz → play ────────────────
  function playChunk(b64) {
    var ctx = getCtx();

    // Decode base64 → bytes → Int16 → Float32
    var raw = atob(b64);
    var u8  = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);

    var i16  = new Int16Array(u8.buffer);
    var f32  = new Float32Array(i16.length);
    for (var j = 0; j < i16.length; j++) f32[j] = i16[j] / 32768.0;

    var buf = ctx.createBuffer(1, f32.length, EL_RATE);
    buf.copyToChannel(f32, 0);

    var src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);

    var now = ctx.currentTime;
    if (nextPlayAt < now) nextPlayAt = now + 0.05;
    src.start(nextPlayAt);
    nextPlayAt += buf.duration;

    src.onended = function () {
      if (nextPlayAt <= ctx.currentTime + 0.08) setAgentSpeaking(false);
    };
  }

  // ── Mic: start using AudioWorklet (modern, runs on audio thread) ──────────
  async function startMic() {
    if (isMicOn) return;
    try {
      var ctx = getCtx();

      // Load worklet from Blob URL if not already loaded
      if (!ctx._workletReady) {
        var blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
        var blobUrl = URL.createObjectURL(blob);
        await ctx.audioWorklet.addModule(blobUrl);
        URL.revokeObjectURL(blobUrl);
        ctx._workletReady = true;
      }

      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });

      micSource = ctx.createMediaStreamSource(micStream);

      workletNode = new AudioWorkletNode(ctx, 'pcm-capture', {
        processorOptions: {
          nativeRate: ctx.sampleRate, // e.g. 44100 or 48000
          targetRate: EL_RATE        // 16000
        }
      });

      // AudioWorklet does NOT need to connect to destination — no echo risk
      micSource.connect(workletNode);

      workletNode.port.onmessage = function (e) {
        if (!ws || ws.readyState !== WebSocket.OPEN || isMuted) return;
        // e.data is an ArrayBuffer of Int16 PCM at 16kHz
        var u8     = new Uint8Array(e.data);
        var binary = '';
        for (var i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
        ws.send(JSON.stringify({ type: 'user_audio_chunk', user_audio_chunk: btoa(binary) }));
      };

      setListening(true);

    } catch (err) {
      setSpeech('\u26a0\ufe0f Microphone access denied. Please allow microphone and try again.');
      setHint('Check browser microphone permissions');
    }
  }

  function stopMic() {
    if (workletNode) { workletNode.port.onmessage = null; workletNode.disconnect(); workletNode = null; }
    if (micSource)   { micSource.disconnect(); micSource = null; }
    if (micStream)   { micStream.getTracks().forEach(function(t){ t.stop(); }); micStream = null; }
    setListening(false);
  }

  // ── Mute ──────────────────────────────────────────────────────────────────
  function toggleMute() {
    isMuted = !isMuted;
    muteBtn.textContent = isMuted ? '\uD83D\uDD0A' : '\uD83D\uDD07';
    muteBtn.classList.toggle('muted', isMuted);
    orbEl.classList.toggle('listening', isMicOn && !isMuted);
    orbRing.className    = (isMicOn && !isMuted) ? 'orb-ring listening' : 'orb-ring';
    waveformEl.className = (isMicOn && !isMuted) ? 'waveform listening' : 'waveform';
    setHint(isMuted ? 'Muted \u2014 click mute to resume' : 'Microphone active \u2014 speak now');
  }

  // ── End call ──────────────────────────────────────────────────────────────
  function showConfirm() { overlay.classList.add('show'); }
  function hideConfirm() { overlay.classList.remove('show'); }

  function endCall() {
    hideConfirm();
    clearInterval(pingTimer);
    stopMic();
    enableControls(false);
    orbEl.textContent = '\uD83D\uDC4B';
    waveformEl.className = 'waveform';
    orbRing.className    = 'orb-ring';
    setBadge('Ended', 'ended');
    setSpeech('Call ended. Your session has been recorded.');
    setHint('You may close this window.');
    if (ws && ws.readyState === WebSocket.OPEN) ws.close(1000, 'User ended call');
  }

  // ── WebSocket ─────────────────────────────────────────────────────────────
  function connect() {
    ws = new WebSocket(SIGNED_URL);

    ws.onopen = function () {
      isConnected = true;
      setBadge('Connected', 'connected');
      setSpeech('Connected! Click the microphone to start speaking.');
      setHint('Click the \uD83C\uDFA4 button to begin');
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

      pingTimer = setInterval(function () {
        if (ws && ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: 'ping', event_id: Date.now() }));
      }, 20000);
    };

    ws.onmessage = function (event) {
      var msg;
      try { msg = JSON.parse(event.data); } catch(e) { return; }
      var type = msg.type || '';

      if (type === 'ping') {
        var eid = (msg.ping_event && msg.ping_event.event_id != null)
                ? msg.ping_event.event_id : msg.event_id;
        ws.send(JSON.stringify({ type: 'pong', event_id: eid }));
        return;
      }

      if (type === 'audio') {
        var b64 = (msg.audio_event && (msg.audio_event.audio_base_64 || msg.audio_event.audio))
                || msg.audio;
        if (b64) { setAgentSpeaking(true); playChunk(b64); }
        return;
      }

      if (type === 'agent_response') {
        var text = (msg.agent_response_event && msg.agent_response_event.agent_response)
                || msg.agent_response || '';
        if (text) setSpeech(text);
        return;
      }

      if (type === 'interruption') {
        nextPlayAt = 0;
        setAgentSpeaking(false);
        return;
      }

      if (type === 'user_transcript' || type === 'conversation_initiation_metadata') return;

      if (type === 'error' || type === 'conversation_end') {
        isConnected = false;
        stopMic();
        enableControls(false);
        clearInterval(pingTimer);
        waveformEl.className = 'waveform';
        orbRing.className    = 'orb-ring';
        setBadge('Ended', 'ended');
        setSpeech(msg.message || msg.reason || 'Session ended.');
        setHint('You may close this window.');
      }
    };

    ws.onclose = function () {
      isConnected = false;
      clearInterval(pingTimer);
      stopMic();
      if (endBtn.disabled) return;
      enableControls(false);
      waveformEl.className = 'waveform';
      orbRing.className    = 'orb-ring';
      setBadge('Disconnected', 'ended');
      setHint('Session ended. You may close this window.');
    };

    ws.onerror = function () {
      setBadge('Error', 'ended');
      setSpeech('\u26a0\ufe0f Connection error. Please close and try again.');
      enableControls(false);
    };
  }

  // ── Orb click ─────────────────────────────────────────────────────────────
  orbEl.addEventListener('click', function () {
    if (!isConnected) return;
    getCtx(); // ensure AudioContext created on user gesture
    if (isMicOn) stopMic();
    else startMic();
  });

  muteBtn.addEventListener('click', toggleMute);
  endBtn.addEventListener('click', showConfirm);
  cancelBtn.addEventListener('click', hideConfirm);
  confirmBtn.addEventListener('click', endCall);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) hideConfirm();
  });

  connect();
})();
</script>
</body>
</html>`);

  } catch (err) {
    console.error('[LAUNCH] Error:', err.message);
    return res.status(500).send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Error</title>
<style>body{font-family:sans-serif;background:#0f1117;color:#e8e9f0;display:flex;
align-items:center;justify-content:center;min-height:100vh;}
.box{background:#1a1d27;border:1px solid #f43f5e;border-radius:12px;padding:2rem;
max-width:420px;text-align:center;}h2{color:#f43f5e;margin-bottom:.5rem;}
p{color:#8b8fa8;font-size:.9rem;line-height:1.5;}
code{display:block;margin-top:1rem;font-size:.75rem;color:#555a72;
background:#0f1117;padding:.5rem;border-radius:6px;}</style></head>
<body><div class="box"><h2>&#9888;&#65039; Session Error</h2>
<p>Could not start the AI assistant. Please close and try again.</p>
<code>${err.message}</code></div></body></html>`);
  }
}

router.get('/launch',  launchHandler);
router.post('/launch', launchHandler);

module.exports = router;
