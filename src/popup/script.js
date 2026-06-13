import { evaluate } from 'mathjs';

// dom elements

// general config
const soundCheck = document.getElementById('soundEnabled')
const modeSecondsBtn = document.getElementById('modeSeconds')
const modeBpmBtn = document.getElementById('modeBpm')

// containers
const pitchFieldContainer = document.getElementById('pitchFieldContainer')
const bpmFieldContainer = document.getElementById('bpmFieldContainer')
const bpmInput = document.getElementById('bpmInput')

// value selectors (ticks and semitones)
const ticksMinusBtn = document.getElementById('ticksMinus')
const ticksPlusBtn = document.getElementById('ticksPlus')
const ticksValueDisplay = document.getElementById('ticksValue')

const pitchMinusBtn = document.getElementById('pitchMinus')
const pitchPlusBtn = document.getElementById('pitchPlus')
const pitchValueDisplay = document.getElementById('pitchValue')

// checkpoint actions
const clearCheckpointsBtn = document.getElementById('clearCheckpointsBtn')
const clearFeedback = document.getElementById('clearFeedback') 
const checkpointCountdownCheck = document.getElementById('checkpointCountdownEnabled')

// local state and time management
let currentTicks = 4
let currentSemitones = 0
let currentMode = 'seconds'
let clearTimeoutId = null // manages clean feedback alert timeouts

// utility functions
function formatPitchText(value) {
  if (value === 0) return '0'
  return value > 0 ? `+${value}` : `${value}`
}

// saves current configuration to chrome local storage
function saveSettings() {
  if (!soundCheck) return

  let bpmValue = parseInt(bpmInput.value, 10) || 120

  // clamping fallback limits for safe storage operations
  if (bpmValue < 30) bpmValue = 30
  if (bpmValue > 300) bpmValue = 300

  chrome.storage.local.set({
    soundEnabled: soundCheck.checked,
    countdownTicks: currentTicks,
    semitones: currentSemitones,
    intervalMode: currentMode,
    bpmValue: bpmValue,
    countdownOnCheckpoint: checkpointCountdownCheck ? checkpointCountdownCheck.checked : true
  })
}

// evaluates the mathematical string input and updates configurations
function handleBpmEvaluation() {
  try {
    const expression = bpmInput.value.trim()

    if (expression === '') {
      bpmInput.value = 120
      saveSettings()
      return
    }

    // safely process calculation via mathjs
    let result = evaluate(expression)
    result = Math.round(Number(result))

    if (isNaN(result) || !isFinite(result) || result <= 0) {
      throw new Error('invalid calculation output')
    }

		if (result < 30) result = 30
    if (result > 300) result = 300

    // sanitize string input UI rendering with pure numerical string
    bpmInput.value = result

  } catch (error) {
    // fallback structural check fetching last robust stored asset value
    chrome.storage.local.get({ bpmValue: 120 }, (items) => {
      bpmInput.value = items.bpmValue
    })
  }

  saveSettings()
}

// visually alternates between secs and bpm layouts
function setMode(mode) {
  currentMode = mode
  if (mode === 'seconds') {
    modeSecondsBtn.classList.add('active')
    modeBpmBtn.classList.remove('active')
    pitchFieldContainer.classList.remove('hidden')
    bpmFieldContainer.classList.add('hidden')
  } else {
    modeSecondsBtn.classList.remove('active')
    modeBpmBtn.classList.add('active')
    pitchFieldContainer.classList.add('hidden') 
    bpmFieldContainer.classList.remove('hidden')
  }
  saveSettings()
}

function changeTicks(delta) {
  currentTicks = Math.max(1, Math.min(16, currentTicks + delta))
  if (ticksValueDisplay) ticksValueDisplay.textContent = currentTicks
  saveSettings()
}

function changePitch(delta) {
  currentSemitones = Math.max(-12, Math.min(12, currentSemitones + delta))
  if (pitchValueDisplay) pitchValueDisplay.textContent = formatPitchText(currentSemitones)
  saveSettings()
}

// init
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get({
    soundEnabled: true,
    countdownTicks: 4,
    semitones: 0,
    intervalMode: 'seconds',
    bpmValue: 120,
    countdownOnCheckpoint: true
  }, (items) => {
    if (soundCheck) soundCheck.checked = items.soundEnabled
    if (checkpointCountdownCheck) checkpointCountdownCheck.checked = items.countdownOnCheckpoint
    if (bpmInput) bpmInput.value = items.bpmValue
    
    currentTicks = items.countdownTicks
    if (ticksValueDisplay) ticksValueDisplay.textContent = currentTicks

    currentSemitones = items.semitones
    if (pitchValueDisplay) pitchValueDisplay.textContent = formatPitchText(currentSemitones)

    setMode(items.intervalMode)
  })
})

// event listeners

// mode alternation
modeSecondsBtn.addEventListener('click', () => setMode('seconds'))
modeBpmBtn.addEventListener('click', () => setMode('bpm'))

// bpm math evaluation bindings
bpmInput.addEventListener('blur', handleBpmEvaluation)
bpmInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    bpmInput.blur() // force-trigger the blur evaluation script above
  }
})

// +/- buttons
ticksMinusBtn.addEventListener('click', () => changeTicks(-1))
ticksPlusBtn.addEventListener('click', () => changeTicks(1))
pitchMinusBtn.addEventListener('click', () => changePitch(-1))
pitchPlusBtn.addEventListener('click', () => changePitch(1))

// checkboxes / switches
soundCheck.addEventListener('change', saveSettings)
if (checkpointCountdownCheck) {
  checkpointCountdownCheck.addEventListener('change', saveSettings)
}

// clear checkpoints
clearCheckpointsBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'CLEAR_CHECKPOINTS' })
      
      clearTimeout(clearTimeoutId) 
      clearFeedback.classList.add('show')
      
      clearTimeoutId = setTimeout(() => {
        clearFeedback.classList.remove('show') 
      }, 1500)
    }
  })
})