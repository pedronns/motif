import * as Tone from 'tone';

// global state
let CONFIG = {
  soundEnabled: true,
  countdownTicks: 4,
  semitones: 0,
  intervalMode: 'seconds', 
  bpmValue: 120,
  countdownOnCheckpoint: true
};

let checkpoints = {
  KeyA: null,
  KeyS: null,
  KeyD: null
};

function loadSettings() {
  chrome.storage.local.get({
    soundEnabled: true,
    countdownTicks: 4,
    semitones: 0,
    intervalMode: 'seconds',
    bpmValue: 120,
    countdownOnCheckpoint: true
  }, (items) => {
    CONFIG.soundEnabled = items.soundEnabled;
    CONFIG.countdownTicks = items.countdownTicks;
    CONFIG.semitones = items.semitones;
    CONFIG.intervalMode = items.intervalMode;
    CONFIG.bpmValue = items.bpmValue;
    CONFIG.countdownOnCheckpoint = items.countdownOnCheckpoint;

    updateAudioPitch();
  });
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.soundEnabled) CONFIG.soundEnabled = changes.soundEnabled.newValue;
    if (changes.countdownTicks) CONFIG.countdownTicks = changes.countdownTicks.newValue;
    if (changes.intervalMode) CONFIG.intervalMode = changes.intervalMode.newValue;
    if (changes.bpmValue) CONFIG.bpmValue = changes.bpmValue.newValue;
    if (changes.countdownOnCheckpoint) CONFIG.countdownOnCheckpoint = changes.countdownOnCheckpoint.newValue;
    if (changes.semitones) {
      CONFIG.semitones = changes.semitones.newValue;
      updateAudioPitch();
    }
  }
});

let toneSource = null;
let pitchShift = null;
let countdownActive = false;
let countdownCleanup = null;
let isPitchInitialized = false;
let feedbackTimeout = null;

// pitch and audio (tone.js)
async function initPitch(video) {
  await Tone.start();
  clearPitchNodes();

  const stream = video.captureStream();
  const audioTracks = stream.getAudioTracks();

  if (audioTracks.length === 0) return;

  const rawContext = Tone.getContext().rawContext;
  const audioStream = new MediaStream(audioTracks);

  pitchShift = new Tone.PitchShift({ pitch: 0 });
  pitchShift.toDestination();

  toneSource = rawContext.createMediaStreamSource(audioStream);
  Tone.connect(toneSource, pitchShift);

  video.muted = true;
  video.volume = 0;
}

function disablePitch(video) {
  clearPitchNodes();
  video.muted = false;
  video.volume = 1;
}

function clearPitchNodes() {
  if (toneSource) { toneSource.disconnect(); toneSource = null; }
  if (pitchShift) { pitchShift.dispose(); pitchShift = null; }
}

async function updateAudioPitch() {
  const video = document.querySelector('video');
  if (!video) return;

  if (CONFIG.semitones === 0) {
    disablePitch(video);
    isPitchInitialized = false;
    return;
  }

  if (!isPitchInitialized) {
    await initPitch(video);
    isPitchInitialized = true;
  }

  if (pitchShift) pitchShift.pitch = CONFIG.semitones;
}

function changePitchViaKeyboard(delta) {
  const newPitch = Math.max(-12, Math.min(12, CONFIG.semitones + delta));
  if (newPitch !== CONFIG.semitones) {
    CONFIG.semitones = newPitch;
    updateAudioPitch();
    showTopFeedback(`${newPitch > 0 ? '+' : ''}${newPitch} semitons`);
    chrome.storage.local.set({ semitones: newPitch });
  }
}

// visual feedback
function showTopFeedback(text) {
  const player = document.querySelector('#movie_player');
  if (!player) return;

  if (window.getComputedStyle(player).position === 'static') {
    player.style.position = 'relative';
  }

  let feedback = document.getElementById('mm-pitch-feedback');
  if (!feedback) {
    feedback = document.createElement('div');
    feedback.id = 'mm-pitch-feedback';
    feedback.style.cssText = `
      position: absolute; top: 24px; left: 50%; transform: translateX(-50%);
      color: #ffffff; background: rgba(0, 0, 0, 0.6); padding: 6px 14px;
      border-radius: 20px; font-size: 14px; font-weight: 600; font-family: sans-serif;
      z-index: 10000; pointer-events: none; text-shadow: 0 1px 4px rgba(0,0,0,0.6);
      transition: opacity 0.2s ease; opacity: 0;
    `;
    player.appendChild(feedback);
  }

  feedback.textContent = text;
  feedback.style.opacity = '1';
  clearTimeout(feedbackTimeout);
  feedbackTimeout = setTimeout(() => { feedback.style.opacity = '0'; }, 1500);
}

// metronome and overlay
function playMetronomeClick(isFirstTick = false) {
  if (!CONFIG.soundEnabled) return;

  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.frequency.value = isFirstTick ? 1000 : 600;
  osc.type = 'sine';

  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.8, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  osc.start(now);
  osc.stop(now + 0.08);
  osc.onended = () => ctx.close();
}

function createOverlayDOM() {
  const overlay = document.createElement('div');
  overlay.id = 'mm-countdown-overlay';
  overlay.style.cssText = `
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-size: 20vw; font-weight: 900; color: white; opacity: 0.85; z-index: 9999;
    pointer-events: none; text-shadow: 0 0 24px rgba(0, 0, 0, 0.8); font-family: sans-serif;
    transition: color 0.2s, font-size 0.2s, opacity 0.5s;
  `;
  return overlay;
}

// calculates time gap dynamically synced with youtube native playback speed engine
function getTickIntervalMs(video) {
  if (CONFIG.intervalMode === 'bpm') {
    let currentSpeed = 1;
    
    // fetch speed factor right from youtube core dashboard api to get clean values even while video is frozen
    const ytPlayer = document.querySelector('#movie_player');
    if (ytPlayer && typeof ytPlayer.getPlaybackRate === 'function') {
      currentSpeed = ytPlayer.getPlaybackRate();
    } else if (video) {
      currentSpeed = video.playbackRate;
    }
    
    const baseBpm = parseInt(CONFIG.bpmValue, 10) || 120;
    const adjustedBpm = baseBpm * currentSpeed;
    
    return (60 / adjustedBpm) * 1000;
  }
  return 1000; 
}

function runCountdown(video, onFinish) {
  const existingOverlay = document.getElementById('mm-countdown-overlay');
  if (existingOverlay) existingOverlay.remove();

  const player = document.querySelector('#movie_player');
  if (!player) return onFinish();

  if (window.getComputedStyle(player).position === 'static') {
    player.style.position = 'relative';
  }

  const overlay = createOverlayDOM();
  player.appendChild(overlay);

  let currentTick = CONFIG.countdownTicks;
  overlay.textContent = currentTick;
  playMetronomeClick(true);

  const intervalMs = getTickIntervalMs(video);

  const timer = setInterval(() => {
    currentTick -= 1;
    if (currentTick <= 0) {
      clearInterval(timer);
      overlay.remove();
      onFinish();
    } else {
      overlay.textContent = currentTick;
      playMetronomeClick(false);
    }
  }, intervalMs);

  return (isCancelled = false) => {
    clearInterval(timer);
    if (isCancelled) {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 500);
    } else {
      overlay.remove();
    }
  };
}

// checkpoint visual aid
function formatTimeDisplay(seconds) {
  if (isNaN(seconds)) return '0:00';

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const formattedSecs = secs < 10 ? `0${secs}` : secs;

  if (hrs > 0) {
    const formattedMins = mins < 10 ? `0${mins}` : mins;
    return `${hrs}:${formattedMins}:${formattedSecs}`;
  }
  return `${mins}:${formattedSecs}`;
}

function injectCheckpointStyles() {
  if (document.getElementById('mm-checkpoint-styles')) return;
  const style = document.createElement('style');
  style.id = 'mm-checkpoint-styles';
  style.textContent = `
    .mm-checkpoint-indicator {
      position: absolute;
      top: 0;
      width: 4px;
      height: 100%;
      z-index: 50; 
      pointer-events: none;
      box-shadow: 0 0 4px rgba(0, 0, 0, 0.6);
      transform: translateX(-50%);
    }
    .mm-checkpoint-indicator.KeyA { background-color: #4f46e5; }
    .mm-checkpoint-indicator.KeyS { background-color: #06b6d4; }
    .mm-checkpoint-indicator.KeyD { background-color: #10b981; }
  `;
  document.head.appendChild(style);
}

function updateVideoSliderCheckpoints(video) {
  const progressList = document.querySelector('.ytp-progress-list');
  if (!progressList || !video.duration) return;

  document.querySelectorAll('.mm-checkpoint-indicator').forEach(el => el.remove());

  Object.keys(checkpoints).forEach(key => {
    const time = checkpoints[key];
    if (time === null) return;

    const percentage = (time / video.duration) * 100;

    const indicator = document.createElement('div');
    indicator.className = `mm-checkpoint-indicator ${key}`;
    indicator.style.left = `${percentage}%`;
    
    progressList.appendChild(indicator);
  });
}

// video events management
function setupVideoController(video) {
  let programmaticPlay = false;

  const stopCountdown = (isCancelled = false) => {
    if (countdownCleanup) {
      countdownCleanup(isCancelled);
      countdownCleanup = null;
    }
    countdownActive = false;
  };

  const triggerCountdown = () => {
    if (countdownActive || !video.paused) return;
    countdownActive = true;

    countdownCleanup = runCountdown(video, () => {
      countdownActive = false;
      countdownCleanup = null;
      programmaticPlay = true;
      video.play().finally(() => {
        programmaticPlay = false;
      });
    });
  };

  const handleVideoPlay = () => {
    if (countdownActive && !programmaticPlay) stopCountdown(true);
  };

  const handleVideoPause = () => {
    if (!countdownActive) return;
    stopCountdown(false);
  };

  const handleKeydown = (event) => {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
      return;
    }

    const targetKey = event.code; 

    // checkpoints creation (shift + a/s/d)
    if (event.shiftKey && (targetKey === 'KeyA' || targetKey === 'KeyS' || targetKey === 'KeyD')) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      
      const currentTime = video.currentTime;
      checkpoints[targetKey] = currentTime;
      
      const pointLabel = targetKey.replace('Key', '');
      const formattedTime = formatTimeDisplay(currentTime); 
      
      showTopFeedback(`Ponto [${pointLabel}] marcado em ${formattedTime}`);
      updateVideoSliderCheckpoints(video);
      return;
    }

    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    // checkpoints reproduction (a / s / d)
    if (targetKey === 'KeyA' || targetKey === 'KeyS' || targetKey === 'KeyD') {
      event.preventDefault();
      const savedTime = checkpoints[targetKey];
      const pointLabel = targetKey.replace('Key', '');

      if (savedTime === null) {
        showTopFeedback(`Ponto [${pointLabel}] vazio! Use Shift+${pointLabel} para definir`);
        return;
      }

      stopCountdown(false);

      video.pause();
      video.currentTime = savedTime;

      setTimeout(() => {
        if (CONFIG.countdownOnCheckpoint) {
          triggerCountdown();
        } else {
          programmaticPlay = true;
          video.play().finally(() => {
            programmaticPlay = false;
          });
        }
      }, 50);
      return;
    }

    // queue (q)
    if (targetKey === 'KeyQ') {
      if (countdownActive) {
        event.preventDefault();
        stopCountdown(true);
        return;
      }
      if (video.paused) {
        event.preventDefault();
        triggerCountdown();
      }
      return;
    }

    // pitch shift (e / r)
    if (targetKey === 'KeyE') { event.preventDefault(); changePitchViaKeyboard(-1); return; }
    if (targetKey === 'KeyR') { event.preventDefault(); changePitchViaKeyboard(1); return; }
  };

  video.addEventListener('play', handleVideoPlay);
  video.addEventListener('pause', handleVideoPause);
  window.addEventListener('keydown', handleKeydown);

  setTimeout(() => updateVideoSliderCheckpoints(video), 1000);

  return () => {
    video.removeEventListener('play', handleVideoPlay);
    video.removeEventListener('pause', handleVideoPause);
    window.removeEventListener('keydown', handleKeydown);
    stopCountdown(false);
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'CLEAR_CHECKPOINTS') {
    checkpoints.KeyA = null;
    checkpoints.KeyS = null;
    checkpoints.KeyD = null;
    document.querySelectorAll('.mm-checkpoint-indicator').forEach(el => el.remove());
    showTopFeedback('Checkpoints limpos');
  }
});

// init
function initializeExtension() {
  loadSettings(); 
  injectCheckpointStyles();

  let currentVideo = document.querySelector('video');
  if (!currentVideo) return setTimeout(initializeExtension, 500);

  let destroyVideoController = setupVideoController(currentVideo);

  const appObserver = new MutationObserver(() => {
    const activeVideo = document.querySelector('video');
    if (activeVideo && activeVideo !== currentVideo) {
      if (destroyVideoController) destroyVideoController();
      
      checkpoints.KeyA = null;
      checkpoints.KeyS = null;
      checkpoints.KeyD = null;

      currentVideo = activeVideo;
      destroyVideoController = setupVideoController(currentVideo);
      updateAudioPitch();
    }
  });

  appObserver.observe(document.body, { childList: true, subtree: true });
}

initializeExtension();