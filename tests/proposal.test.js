'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function element() {
  const classes = new Set();
  return {
    hidden: false, disabled: false, textContent: '', innerHTML: '', dataset: {}, style: {},
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle: (name, force) => force ? classes.add(name) : classes.delete(name),
      [Symbol.iterator]: () => classes[Symbol.iterator]()
    },
    setAttribute() {}, getAnimations: () => [], get offsetWidth() { return 1; }
  };
}

const elements = new Map();
const get = id => elements.get(id) || elements.set(id, element()).get(id);
const document = {
  hidden: false,
  getElementById: get,
  querySelector: () => get('progressbar'),
  addEventListener() {}
};
const context = {
  document,
  window: { addEventListener() {} },
  performance: { now: () => 0 },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame() {}
};
vm.createContext(context);
const source = fs.readFileSync('app.js', 'utf8') +
  '\nthis.__story = { scenes, duration, sceneState, applyState, resetTimeline, start, pause, dom };';
vm.runInContext(source, context);

const { scenes, duration, sceneState, applyState, resetTimeline, start, pause, dom } = context.__story;
assert.deepEqual(Array.from(scenes, scene => scene.id), ['intro', 'meeting', 'duo', 'phases', 'proposal']);
assert.equal(scenes.at(-1).duration, 30000);
assert.equal(duration, 89000);

const proposal = scenes.at(-1);
const at = milliseconds => sceneState(proposal, milliseconds);
assert.equal(at(0).action, 'proposal-trip');
assert.deepEqual(Array.from(at(1300).phase), ['SEXTA-FEIRA', '04/09']);
assert.equal(at(2400).action, 'proposal-sunset');
assert.deepEqual(Array.from(at(4200).phase), ['DIA SEGUINTE', '05/09']);
assert.equal(at(5200).notification.subtitle, 'PARQUE DA CERVEJA');
assert.equal(at(6500).action, 'proposal-park');
assert.equal(at(7600).action, 'proposal-secret-plan');
assert.equal(at(7600).felipeWalking, false);
assert.equal(at(7600).laisWalking, false);
assert.equal(at(8500).indicator, 'SUSPEITA DA LAÍS: 0%');
assert.equal(at(9400).indicator, 'NÍVEL DE NERVOSISMO: 97%');
assert.deepEqual(Array.from(at(10300).dialogue), ['Laís', 'Tá tudo bem?']);
assert.deepEqual(Array.from(at(11300).dialogue), ['Felipe', 'Tudo.']);
assert.equal(at(12200).indicator, 'NÍVEL DE NERVOSISMO: 99%');
assert.equal(at(13200).action, 'proposal-lookout');
assert.deepEqual([at(13200).musicCue, at(14200).musicCue, at(15200).musicCue],
  ['🎻 Fly Me to the Moon', '🎻 La Vie en Rose', '🎻 What a Wonderful World']);
assert.equal(at(16200).bouquet, true);
assert.equal(at(17300).action, 'proposal-approach');
assert.deepEqual(Array.from(at(18400).dialogue), ['Felipe', 'Laís Lorrane Cariolano Romão…']);
assert.deepEqual(Array.from(at(19800).dialogue), ['Felipe', 'Você quer casar comigo?']);
assert.equal(at(21000).processing, true);
assert.deepEqual(Array.from(at(22100).dialogue), ['Laís', 'LÓGICO, SIM!!!!']);
assert.equal(at(23100).notification.subtitle, 'CASAMENTO DESBLOQUEADO');
assert.equal(at(24200).action, 'proposal-ring');
assert.equal(at(25300).action, 'proposal-kiss');
assert.equal(at(26400).action, 'proposal-drone');
assert.match(at(26400).narration, /próxima fase/);
assert.equal(at(29300).notification.title, 'CONTINUA…');

applyState(proposal, at(16200));
assert.equal(dom.bouquet.hidden, false);
assert.equal(dom.assistant.hidden, false);
assert.equal(dom.felipe.classList.contains('needs-felipe-nervous-sprite'), false);
assert.equal(dom.felipe.classList.contains('needs-lais-back-sprite'), false);
assert.equal(dom.lais.classList.contains('needs-lais-back-sprite'), true);
assert.equal(dom.cast.classList.contains('needs-lais-back-sprite'), false);
applyState(proposal, at(7600));
assert.equal(dom.felipe.classList.contains('needs-felipe-nervous-sprite'), true);
assert.equal(dom.lais.classList.contains('needs-felipe-nervous-sprite'), false);
assert.equal(dom.cast.classList.contains('needs-felipe-nervous-sprite'), false);
applyState(proposal, at(25300));
assert.equal(dom.bouquet.hidden, true);
assert.equal(dom.assistant.hidden, true);
assert.equal(dom.lais.classList.contains('needs-couple-kiss-sprite'), false);
assert.equal(dom.cast.classList.contains('needs-couple-kiss-sprite'), true);
applyState(proposal, at(26400));
assert.equal(dom.cast.classList.contains('needs-couple-kiss-sprite'), false);
assert.equal(dom.cast.classList.contains('needs-couple-dance-sprite'), true);
start();
pause();
assert.equal(dom.scene.classList.contains('paused'), true);
pause();
assert.equal(dom.scene.classList.contains('paused'), false);
applyState(proposal, at(21000));
resetTimeline();
for (const actor of [dom.felipe, dom.lais, dom.cast]) {
  assert.deepEqual([...actor.classList].filter(name => name.startsWith('needs-')), []);
}
for (const item of [dom.musicCue, dom.processing, dom.videomaker, dom.violinist, dom.assistant, dom.bouquet, dom.ring]) {
  assert.equal(item.hidden, true);
}
assert.equal(dom.scene.dataset.scene, 'idle');

console.log('Cena 5: timeline, conteúdo, pause/continue e replay validados.');
