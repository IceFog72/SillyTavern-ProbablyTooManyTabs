import assert from 'node:assert/strict';
import {
  buildColorizerCustomEntry,
  resolveCustomColorizerSettings,
  updateCustomColorizerSettings,
} from '../src/colorizer/colorizer-settings.js';

function createSettingsStore(initial = {}) {
  const data = {
    charCustomColorizerEnabled: [],
    charCustomColorizerSettings: {},
    personaCustomColorizerEnabled: [],
    personaCustomColorizerSettings: {},
    ...initial,
  };
  const updates = [];
  return {
    data,
    updates,
    get(key) {
      return data[key];
    },
    async update(patch) {
      updates.push(patch);
      Object.assign(data, patch);
    },
  };
}

const unsafeEntry = buildColorizerCustomEntry('character', {
  dialogSource: 'lol-no',
  dialogStatic: 'not-a-color',
  bubbleMode: 'laser',
  bubbleStatic1: '#12345678',
  bubbleStatic2: 'bad',
  colorizeTarget: 99,
  bubbleOpacity: 42,
  bubbleGradientStops: [
    { color: 'bad', position: -1 },
    { color: '#abcdef', position: 2 },
    { color: '#010203ff', position: 0.5 },
  ],
  bubbleGradientAngle: 'wat',
});

assert.deepEqual(unsafeEntry, {
  dialogSource: 'avatar_vibrant',
  dialogStatic: '#da6745ff',
  bubbleMode: 'gradient',
  bubbleStatic1: '#12345678',
  bubbleStatic2: '#da6745ff',
  colorizeTarget: 3,
  bubbleOpacity: 1,
  bubbleGradientStops: [
    { color: '#da6745ff', position: 0 },
    { color: '#abcdef', position: 1 },
    { color: '#010203ff', position: 0.5 },
  ],
  bubbleGradientAngle: 225,
});

const store = createSettingsStore();
await updateCustomColorizerSettings(store, 'character', 'alice__avatar.png', {
  enabled: true,
  patch: {
    dialogSource: 'static_color',
    dialogStatic: 'bad',
    bubbleMode: 'static_color',
    bubbleOpacity: -2,
  },
});

assert.deepEqual(store.data.charCustomColorizerEnabled, ['alice__avatar.png']);
assert.equal(store.data.charCustomColorizerSettings['alice__avatar.png'].dialogStatic, '#da6745ff');
assert.equal(store.data.charCustomColorizerSettings['alice__avatar.png'].bubbleOpacity, 0);
assert.equal(store.data.charCustomColorizerSettings['alice__avatar.png'].bubbleMode, 'static_color');

const resolved = resolveCustomColorizerSettings(store, 'character', 'alice__avatar.png');
assert.equal(resolved.enabled, true);
assert.equal(resolved.value.dialogStatic, '#da6745ff');
assert.equal(resolved.value.bubbleOpacity, 0);

await updateCustomColorizerSettings(store, 'character', 'alice__avatar.png', { enabled: false });
assert.deepEqual(store.data.charCustomColorizerEnabled, []);
assert.equal(store.data.charCustomColorizerSettings['alice__avatar.png'].dialogSource, 'static_color');
assert.equal(resolveCustomColorizerSettings(store, 'character', 'alice__avatar.png').enabled, false);
await updateCustomColorizerSettings(store, 'character', 'alice__avatar.png', { enabled: true });
assert.equal(resolveCustomColorizerSettings(store, 'character', 'alice__avatar.png').enabled, true);

console.log('colorizer-settings tests passed');
