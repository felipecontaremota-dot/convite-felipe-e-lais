'use strict';

const $ = id => document.getElementById(id);
const FELIPE_POSES = { idle: 0, map: 1, point: 2, unsure: 3 };
const LAIS_POSES = { idle: 0, amused: 2, map: 3, confident: 5 };
const weddingDetails = {
  date: 'A DEFINIR',
  time: 'A DEFINIR',
  location: 'A DEFINIR'
};
const EMPTY_STATE = {
  action: 'still', dialogue: null, narration: '', notification: '',
  phase: null, counter: '', indicator: '', musicCue: '', processing: false,
  sign: false, mapHolder: '', videomaker: false, violinist: false,
  assistant: false, bouquet: false, ring: false, futurePoses: [],
  felipePose: FELIPE_POSES.idle, laisPose: LAIS_POSES.idle,
  felipeWalking: false, laisWalking: false, invitationMap: false,
  weddingCard: false, laisVisible: true
};

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
  },
  {
    id: 'phases', duration: 17000,
    state: { action: 'phase-02-card', phase: ['FASE 02', ''] },
    events: [
      { at: 700, state: { action: 'help-lais', phase: null, felipePose: FELIPE_POSES.point, laisPose: LAIS_POSES.amused } },
      { at: 2800, state: { action: 'phase-03-card', phase: ['FASE 03', ''], felipePose: FELIPE_POSES.idle, laisPose: LAIS_POSES.idle } },
      { at: 3500, state: { action: 'help-felipe', phase: null, felipePose: FELIPE_POSES.unsure, laisPose: LAIS_POSES.confident } },
      { at: 5500, state: { action: 'phase-04-card', phase: ['FASE 04', ''], felipePose: FELIPE_POSES.idle, laisPose: LAIS_POSES.idle } },
      { at: 6200, state: { action: 'lost-left', phase: null, sign: true, mapHolder: 'felipe', felipePose: FELIPE_POSES.map, laisPose: LAIS_POSES.confident } },
      { at: 7000, state: { action: 'lost-right', felipePose: FELIPE_POSES.unsure, laisPose: LAIS_POSES.map } },
      { at: 8000, state: { action: 'rest', sign: false, mapHolder: '', felipePose: FELIPE_POSES.idle, laisPose: LAIS_POSES.idle } },
      { at: 10100, state: { notification: { icon: '❤', title: 'CONQUISTA DESBLOQUEADA', subtitle: 'PARCERIA' } } },
      { at: 11300, state: { notification: '', dialogue: ['Felipe', 'Até que a gente funciona bem em equipe.'] } },
      { at: 13100, state: { dialogue: ['Laís', 'Quando você não está com o mapa.'], laisPose: LAIS_POSES.amused } },
      { at: 14200, state: { dialogue: ['Felipe', 'Aquilo aconteceu uma vez.'], felipePose: FELIPE_POSES.unsure } },
      { at: 15100, state: { action: 'counter-look', dialogue: null, counter: 'CONTADOR DE VEZES: 17', laisPose: LAIS_POSES.confident } },
      { at: 16100, state: { action: 'rest', counter: '', dialogue: ['Felipe', '…mais ou menos.'], laisPose: LAIS_POSES.amused } }
    ]
  },
  {
    id: 'proposal', duration: 30000,
    state: {
      action: 'proposal-trip',
      notification: { icon: '✦', title: 'DESTINO DESBLOQUEADO', subtitle: 'CAMPOS DO JORDÃO' },
      futurePoses: []
    },
    events: [
      { at: 1300, state: { notification: '', phase: ['SEXTA-FEIRA', '04/09'] } },
      { at: 2400, state: { action: 'proposal-sunset', phase: ['04/09', 'PÔR DO SOL'] } },
      { at: 4200, state: { action: 'proposal-next-day', phase: ['DIA SEGUINTE', '05/09'] } },
      { at: 5200, state: { phase: null, notification: { icon: '✦', title: 'NOVA MISSÃO DESBLOQUEADA', subtitle: 'PARQUE DA CERVEJA' } } },
      { at: 6500, state: { action: 'proposal-park', notification: '', felipeWalking: true, laisWalking: true } },
      { at: 7600, state: { action: 'proposal-secret-plan', indicator: 'PLANO SECRETO: EM ANDAMENTO', felipePose: FELIPE_POSES.unsure, felipeWalking: false, laisWalking: false, futurePoses: ['needs-felipe-nervous-sprite'] } },
      { at: 8500, state: { indicator: 'SUSPEITA DA LAÍS: 0%', felipePose: FELIPE_POSES.point } },
      { at: 9400, state: { action: 'proposal-photos', indicator: 'NÍVEL DE NERVOSISMO: 97%', videomaker: true, felipeWalking: false, laisWalking: false, felipePose: FELIPE_POSES.idle, laisPose: LAIS_POSES.confident } },
      { at: 10300, state: { dialogue: ['Laís', 'Tá tudo bem?'], laisPose: LAIS_POSES.amused } },
      { at: 11300, state: { dialogue: ['Felipe', 'Tudo.'], felipePose: FELIPE_POSES.unsure } },
      { at: 12200, state: { dialogue: null, indicator: 'NÍVEL DE NERVOSISMO: 99%' } },
      { at: 13200, state: { action: 'proposal-lookout', indicator: '', videomaker: false, violinist: true, musicCue: '🎻 Fly Me to the Moon', laisPose: LAIS_POSES.idle, futurePoses: ['needs-lais-back-sprite'] } },
      { at: 14200, state: { musicCue: '🎻 La Vie en Rose' } },
      { at: 15200, state: { musicCue: '🎻 What a Wonderful World' } },
      { at: 16200, state: { action: 'proposal-bouquet', musicCue: '', assistant: true, bouquet: true, futurePoses: ['needs-lais-back-sprite', 'needs-lais-bouquet-sprite'] } },
      { at: 17300, state: { action: 'proposal-approach', assistant: false, felipePose: FELIPE_POSES.point } },
      { at: 18400, state: { action: 'proposal-kneel', dialogue: ['Felipe', 'Laís Lorrane Cariolano Romão…'], felipePose: FELIPE_POSES.unsure, futurePoses: ['needs-lais-bouquet-sprite', 'needs-felipe-kneel-ring-sprite'] } },
      { at: 19800, state: { dialogue: ['Felipe', 'Você quer casar comigo?'] } },
      { at: 21000, state: { dialogue: null, processing: true } },
      { at: 22100, state: { action: 'proposal-yes', processing: false, dialogue: ['Laís', 'LÓGICO, SIM!!!!'], laisPose: LAIS_POSES.amused, futurePoses: ['needs-lais-surprised-sprite', 'needs-felipe-kneel-sprite'] } },
      { at: 23100, state: { dialogue: null, notification: { icon: '💍', title: 'MISSÃO CONCLUÍDA', subtitle: 'CASAMENTO DESBLOQUEADO' } } },
      { at: 24200, state: { action: 'proposal-ring', notification: '', ring: true, futurePoses: ['needs-lais-hand-sprite', 'needs-felipe-kneel-ring-sprite'] } },
      { at: 25300, state: { action: 'proposal-kiss', ring: false, bouquet: false, futurePoses: ['needs-couple-kiss-sprite'] } },
      { at: 26400, state: { action: 'proposal-drone', narration: 'E foi assim que uma viagem virou o começo da nossa próxima fase.', futurePoses: ['needs-couple-dance-sprite'] } },
      { at: 28200, state: { narration: '', phase: ['PRÓXIMA FASE', '❤️ O CASAMENTO'] } }
    ]
  },
  {
    id: 'invitation', duration: 20000,
    state: {
      action: 'invitation-map', invitationMap: true,
      felipePose: FELIPE_POSES.idle, laisPose: LAIS_POSES.idle
    },
    events: [
      { at: 1800, state: { notification: { icon: '❤', title: 'NOVA FASE DESBLOQUEADA', subtitle: 'O CASAMENTO' } } },
      { at: 3300, state: { action: 'invitation-together', invitationMap: false, notification: '', dialogue: ['Felipe', 'Mas essa fase tem uma diferença.'] } },
      { at: 5200, state: { dialogue: ['Laís', 'Dessa vez…'] } },
      { at: 6500, state: { dialogue: { speakers: ['Felipe', 'Laís'], line: '…a gente quer você com a gente!' } } },
      { at: 8200, state: { dialogue: null, weddingCard: true } },
      { at: 12000, state: { weddingCard: false, dialogue: ['Laís', 'Vou terminar umas coisas.'] } },
      { at: 13600, state: { dialogue: ['Laís', 'Se comporta.'], laisPose: LAIS_POSES.amused } },
      { at: 15000, state: { dialogue: ['Felipe', 'Pode deixar.'], felipePose: FELIPE_POSES.unsure } },
      { at: 16300, state: { action: 'invitation-lais-exit', dialogue: null, laisWalking: true } },
      { at: 18000, state: { action: 'invitation-felipe-alone', laisWalking: false, laisVisible: false } },
      { at: 19500, state: { notification: { icon: '✦', title: 'CONTINUA…', subtitle: '' } } }
    ]
  }
];

let offset = 0;
scenes.forEach(scene => { scene.start = offset; offset += scene.duration; });
const duration = offset;
const dom = {
  scene: $('scene'), speech: $('speech'), speaker: $('speaker'), line: $('line'),
  narration: $('narration'), notification: $('notification'), notificationText: $('notification-text'),
  notificationIcon: $('notification-icon'), notificationSubtitle: $('notification-subtitle'), counter: $('game-counter'),
  musicCue: $('proposal-music-cue'), processing: $('proposal-processing'),
  videomaker: $('proposal-videomaker'), violinist: $('proposal-violinist'),
  assistant: $('proposal-assistant'), bouquet: $('proposal-bouquet'), ring: $('proposal-ring'),
  invitationMap: $('invitation-map'), weddingCard: $('wedding-card'),
  phase: $('phase-card'), phaseTitle: $('phase-title'), phaseSubtitle: $('phase-subtitle'),
  sign: $('direction-sign'), cast: $('cast'), felipe: $('felipe'), lais: $('lais'),
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
function clearFuturePoses() {
  [dom.felipe, dom.lais, dom.cast].forEach(element => {
    [...element.classList].filter(name => name.startsWith('needs-')).forEach(name => element.classList.remove(name));
  });
}
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
  clearFuturePoses();
  state.futurePoses.forEach(name => {
    if (name.startsWith('needs-felipe-')) dom.felipe.classList.add(name);
    if (name.startsWith('needs-lais-')) dom.lais.classList.add(name);
    if (name.startsWith('needs-couple-')) dom.cast.classList.add(name);
  });
  pose(dom.felipe, state.felipePose);
  pose(dom.lais, state.laisPose);
  setVisible(dom.lais, state.laisVisible);

  setVisible(dom.speech, Boolean(state.dialogue));
  if (state.dialogue) {
    const joint = !Array.isArray(state.dialogue);
    const speaker = joint ? state.dialogue.speakers.join(' & ') : state.dialogue[0];
    dom.speaker.textContent = speaker;
    dom.line.textContent = joint ? state.dialogue.line : state.dialogue[1];
    dom.speech.dataset.who = joint ? 'together' : speaker;
  }
  dom.narration.textContent = state.narration;
  setVisible(dom.narration, Boolean(state.narration));
  const notification = typeof state.notification === 'string'
    ? { icon: '✦', title: state.notification, subtitle: '' }
    : state.notification;
  dom.notificationIcon.textContent = notification?.icon || '✦';
  dom.notificationText.textContent = notification?.title || '';
  dom.notificationSubtitle.textContent = notification?.subtitle || '';
  setVisible(dom.notificationSubtitle, Boolean(notification?.subtitle));
  setVisible(dom.notification, Boolean(state.notification));
  setVisible(dom.phase, Boolean(state.phase));
  if (state.phase) [dom.phaseTitle.textContent, dom.phaseSubtitle.textContent] = state.phase;
  dom.counter.textContent = state.indicator || state.counter;
  setVisible(dom.counter, Boolean(state.indicator || state.counter));
  dom.musicCue.textContent = state.musicCue;
  setVisible(dom.musicCue, Boolean(state.musicCue));
  setVisible(dom.processing, state.processing);
  setVisible(dom.videomaker, state.videomaker);
  setVisible(dom.violinist, state.violinist);
  setVisible(dom.assistant, state.assistant);
  setVisible(dom.bouquet, state.bouquet);
  setVisible(dom.ring, state.ring);
  setVisible(dom.invitationMap, state.invitationMap);
  setVisible(dom.weddingCard, state.weddingCard);
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
function syncSceneMotion(paused) {
  dom.scene.getAnimations?.({ subtree: true }).forEach(animation => paused ? animation.pause() : animation.play());
}
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
  syncSceneMotion(true);
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
  clearFuturePoses();
  dom.ending.hidden = true; dom.speech.hidden = true; dom.narration.hidden = true;
  dom.notification.hidden = true; dom.phase.hidden = true; dom.sign.hidden = true;
  dom.counter.hidden = true;
  [dom.musicCue, dom.processing, dom.videomaker, dom.violinist, dom.assistant, dom.bouquet, dom.ring, dom.invitationMap, dom.weddingCard].forEach(element => { element.hidden = true; });
  dom.lais.hidden = false;
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
  syncSceneMotion(!playing);
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
$('wedding-date').textContent = weddingDetails.date;
$('wedding-time').textContent = weddingDetails.time;
$('wedding-location').textContent = weddingDetails.location;
pose(dom.felipe, FELIPE_POSES.idle); pose(dom.lais, LAIS_POSES.idle);
