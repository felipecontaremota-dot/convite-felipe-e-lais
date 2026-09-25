'use strict';

const $ = id => document.getElementById(id);
const FELIPE_POSES = { idle: 0, map: 1, point: 2, unsure: 3 };
const LAIS_POSES = { idle: 0, amused: 2, map: 3, confident: 5 };
const EMPTY_STATE = {
  action: 'still', dialogue: null, narration: '', notification: '',
  phase: null, sign: false, mapHolder: '',
  felipePose: FELIPE_POSES.idle, laisPose: LAIS_POSES.idle,
  felipeWalking: false, laisWalking: false
};

// Add scene-04 here later: give it a duration, an initial state and timed state patches.
const scenes = [
  {
    id: 'intro', duration: 3000,
    state: { action: 'reveal' },
    events: []
  },
  {
    id: 'meeting', duration: 21000,
    state: { action: 'approach', narration: 'Algumas histórias começam com um plano…', felipeWalking: true, laisWalking: true },
    events: [
      { at: 3500, state: { narration: '…a nossa começou quando duas rotas resolveram se cruzar.' } },
      { at: 7000, state: { narration: '' } },
      { at: 8000, state: { action: 'meeting', felipeWalking: false, laisWalking: false, dialogue: ['Felipe', 'Oi.'] } },
      { at: 9500, state: { dialogue: ['Laís', 'Oi.'] } },
      { at: 10800, state: { dialogue: null } },
      { at: 12000, state: { dialogue: ['Felipe', 'Então…'] } },
      { at: 13500, state: { dialogue: ['Laís', 'Então…'] } },
      { at: 14800, state: { dialogue: null, notification: 'NOVO JOGADOR ENCONTROU SUA DUPLA' } },
      { at: 17000, state: { notification: '', dialogue: ['Laís', 'Isso foi meio rápido, não?'], laisPose: LAIS_POSES.amused } },
      { at: 19000, state: { dialogue: ['Felipe', 'O jogo sabe das coisas.'], felipePose: FELIPE_POSES.map } }
    ]
  },
  {
    id: 'duo', duration: 18000,
    state: {
      action: 'duo-walk', phase: ['FASE 01', 'APRENDER A JOGAR EM DUPLA'],
      mapHolder: 'felipe', felipeWalking: true, laisWalking: true
    },
    events: [
      { at: 2400, state: { phase: null, dialogue: ['Felipe', 'Eu tenho quase certeza de que é por aqui.'] } },
      { at: 5200, state: { dialogue: ['Laís', '“Quase certeza” não é uma frase muito tranquilizadora.'] } },
      { at: 8200, state: { dialogue: null, sign: true } },
      { at: 9000, state: { action: 'inspect', felipeWalking: false, laisWalking: false, felipePose: FELIPE_POSES.point } },
      { at: 10100, state: { felipePose: FELIPE_POSES.map } },
      { at: 11100, state: { felipePose: FELIPE_POSES.unsure } },
      { at: 11600, state: { dialogue: ['Laís', 'Quer perguntar o caminho?'] } },
      { at: 13700, state: { dialogue: ['Felipe', 'Ainda não chegamos nesse nível de desespero.'] } },
      { at: 15800, state: { dialogue: ['Laís', 'Pronto. Agora chegamos.'], mapHolder: 'lais', laisPose: LAIS_POSES.map } },
      { at: 17000, state: { action: 'exit', dialogue: null, felipeWalking: true, laisWalking: true, laisPose: LAIS_POSES.confident } }
    ]
  }
];

let offset = 0;
scenes.forEach(scene => { scene.start = offset; offset += scene.duration; });
const duration = offset;
const dom = {
  scene: $('scene'), speech: $('speech'), speaker: $('speaker'), line: $('line'),
  narration: $('narration'), notification: $('notification'), notificationText: $('notification-text'),
  phase: $('phase-card'), phaseTitle: $('phase-title'), phaseSubtitle: $('phase-subtitle'),
  sign: $('direction-sign'), felipe: $('felipe'), lais: $('lais'),
  progress: $('progress'), progressbar: document.querySelector('.progress'), clock: $('clock'),
  cover: $('cover'), ending: $('ending'), pause: $('pause')
};
let elapsed = 0, playing = false, last = 0, frame = 0, renderedKey = '';
let audio = null, music = true, noteAt = 0, noteIndex = 0, voices = [], resumeOnVisible = false;
const melody = [523.25,659.25,783.99,659.25,587.33,698.46,880,698.46,659.25,783.99,1046.5,783.99,587.33,659.25,523.25,0];

function pose(element, index) {
  element.style.backgroundPosition = `${(index % 3) * 50}% ${Math.floor(index / 3) * 100}%`;
}
function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function locateScene(time) {
  const scene = scenes.find(item => time < item.start + item.duration) || scenes.at(-1);
  return { scene, local: Math.max(0, Math.min(scene.duration, time - scene.start)) };
}
function sceneState(scene, local) {
  const state = { ...EMPTY_STATE, ...scene.state };
  scene.events.forEach(event => { if (local >= event.at) Object.assign(state, event.state); });
  return state;
}
function setVisible(element, visible) { element.hidden = !visible; }
function applyState(scene, state) {
  const key = JSON.stringify([scene.id, state]);
  if (key === renderedKey) return;
  renderedKey = key;
  const paused = dom.scene.classList.contains('paused');
  dom.scene.className = `scene scene-${scene.id} action-${state.action}${paused ? ' paused' : ''}`;
  dom.scene.dataset.scene = scene.id;

  dom.felipe.classList.toggle('is-walking', state.felipeWalking);
  dom.lais.classList.toggle('is-walking', state.laisWalking);
  dom.felipe.classList.toggle('has-map', state.mapHolder === 'felipe');
  dom.lais.classList.toggle('has-map', state.mapHolder === 'lais');
  pose(dom.felipe, state.felipePose);
  pose(dom.lais, state.laisPose);

  setVisible(dom.speech, Boolean(state.dialogue));
  if (state.dialogue) {
    dom.speaker.textContent = state.dialogue[0];
    dom.line.textContent = state.dialogue[1];
    dom.speech.dataset.who = state.dialogue[0];
  }
  dom.narration.textContent = state.narration;
  setVisible(dom.narration, Boolean(state.narration));
  dom.notificationText.textContent = state.notification;
  setVisible(dom.notification, Boolean(state.notification));
  setVisible(dom.phase, Boolean(state.phase));
  if (state.phase) [dom.phaseTitle.textContent, dom.phaseSubtitle.textContent] = state.phase;
  dom.sign.hidden = !state.sign;
}
function render() {
  const shownTime = Math.min(elapsed, duration);
  dom.clock.textContent = `${formatTime(shownTime)} / ${formatTime(duration)}`;
  dom.progress.style.width = `${shownTime / duration * 100}%`;
  dom.progressbar.setAttribute('aria-valuenow', String(Math.floor(shownTime / 1000)));
  const { scene, local } = locateScene(shownTime);
  applyState(scene, sceneState(scene, local));
}
function stopNotes() { voices.forEach(voice => { try { voice.stop(); } catch {} }); voices = []; }
function note() {
  if (!music || !playing || !audio || audio.state !== 'running') return;
  const now = audio.currentTime;
  if (now < noteAt) return;
  noteAt = now + .30;
  const frequency = melody[noteIndex++ % melody.length];
  if (!frequency) return;
  const oscillator = audio.createOscillator(), gain = audio.createGain();
  oscillator.type = 'sine'; oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(.045, now + .015); gain.gain.exponentialRampToValueAtTime(.001, now + .27);
  oscillator.connect(gain).connect(audio.destination); oscillator.start(now); oscillator.stop(now + .29);
  voices.push(oscillator);
  oscillator.onended = () => { voices = voices.filter(voice => voice !== oscillator); oscillator.disconnect(); gain.disconnect(); };
}
async function enableAudio() {
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return false;
    audio ||= new Context(); await audio.resume(); return audio.state === 'running';
  } catch { return false; }
}
function finish() {
  playing = false; cancelAnimationFrame(frame); stopNotes();
  dom.scene.classList.add('paused');
  dom.speech.hidden = true; dom.ending.hidden = false; dom.pause.disabled = true;
}
function tick(now) {
  if (!playing) return;
  elapsed = Math.min(duration, elapsed + Math.max(0, now - last)); last = now;
  render(); note();
  if (elapsed >= duration) { finish(); return; }
  frame = requestAnimationFrame(tick);
}
function resetTimeline() {
  cancelAnimationFrame(frame); stopNotes();
  elapsed = 0; renderedKey = ''; noteIndex = 0; noteAt = 0;
  dom.ending.hidden = true; dom.speech.hidden = true; dom.narration.hidden = true;
  dom.notification.hidden = true; dom.phase.hidden = true; dom.sign.hidden = true;
  dom.scene.className = 'scene scene-idle'; dom.scene.dataset.scene = 'idle';
  dom.progress.style.width = '0'; dom.progressbar.setAttribute('aria-valuenow', '0');
}
function start() {
  resumeOnVisible = false; resetTimeline();
  if (music) void enableAudio();
  playing = true; dom.cover.hidden = true; dom.pause.disabled = false;
  dom.pause.innerHTML = 'Ⅱ <span>Pausar</span>'; dom.pause.setAttribute('aria-label', 'Pausar animação');
  void dom.scene.offsetWidth;
  render(); last = performance.now(); frame = requestAnimationFrame(tick);
}
function pause() {
  if (elapsed >= duration || !dom.cover.hidden) return;
  playing = !playing; dom.scene.classList.toggle('paused', !playing);
  dom.pause.innerHTML = playing ? 'Ⅱ <span>Pausar</span>' : '▶ <span>Continuar</span>';
  dom.pause.setAttribute('aria-label', playing ? 'Pausar animação' : 'Continuar animação');
  if (playing) { last = performance.now(); frame = requestAnimationFrame(tick); if (music) void enableAudio(); }
  else { cancelAnimationFrame(frame); stopNotes(); }
}

$('start').onclick = start;
$('replay').onclick = start;
$('replay-end').onclick = start;
dom.pause.onclick = () => { resumeOnVisible = false; pause(); };
$('sound').onclick = async () => {
  if (!music) music = await enableAudio(); else { music = false; stopNotes(); }
  $('sound').setAttribute('aria-pressed', String(music));
  $('sound').innerHTML = `♫ <span>${music ? 'Som ligado' : 'Som desligado'}</span>`;
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { resumeOnVisible = playing; if (playing) { pause(); resumeOnVisible = true; } }
  else if (resumeOnVisible) { resumeOnVisible = false; if (!playing && elapsed < duration) pause(); }
});
window.addEventListener('pageshow', () => { last = performance.now(); if (playing) { cancelAnimationFrame(frame); frame = requestAnimationFrame(tick); } });

dom.progressbar.setAttribute('aria-valuemax', String(duration / 1000));
dom.clock.textContent = `0:00 / ${formatTime(duration)}`;
pose(dom.felipe, FELIPE_POSES.idle); pose(dom.lais, LAIS_POSES.idle);
