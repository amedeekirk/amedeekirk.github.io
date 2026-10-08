import test from 'node:test';
import assert from 'node:assert/strict';
import { createPng, savePng } from '../top-10/export.js';

test('PNG export preserves rank order and reports failing artwork', async () => {
  const calls = [];
  const ctx = {
    fillRect: (...args) => calls.push(['fillRect', ...args]),
    strokeRect: (...args) => calls.push(['strokeRect', ...args]),
    drawImage: (...args) => calls.push(['drawImage', ...args]),
    fillText: (...args) => calls.push(['fillText', ...args, ctx.textBaseline, ctx.font]),
    measureText: (value) => ({ width: value.length * 12 })
  };
  const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => ms === 30000 ? 0 : originalTimeout(fn, ms);
  globalThis.Image = class {
    naturalWidth = 400;
    naturalHeight = 600;
    set src(url) { this.url = url; queueMicrotask(() => url.includes('broken') ? this.onerror() : this.onload()); }
  };
  globalThis.document = {
    createElement: (name) => name === 'canvas'
      ? { getContext: () => ctx, toBlob: (callback) => callback(new Blob(['png'], { type: 'image/png' })) }
      : { click() { calls.push(['download', this.download]); } }
  };
  const draft = { mode: 'anime', slots: Array.from({ length: 10 }, (_, index) => ({ id: index + 1, name: `A long favorite title ${index + 1}`, image: `https://cdn.example/${index + 1}.jpg` })) };
  try {
    savePng(await createPng(draft), draft.mode);
    assert.ok(calls.some(([type, text]) => type === 'fillText' && text === 'My Top 10 Anime'));
    assert.equal(calls.filter(([type]) => type === 'drawImage').length, 10);
    assert.deepEqual(calls.filter(([type]) => type === 'drawImage').map(([, image]) => image.url), draft.slots.map((slot) => `${slot.image}?canvas=1`));
    assert.ok(calls.some(([type]) => type === 'fillText'));
    const firstName = calls.find(([type, value]) => type === 'fillText' && value === 'A long favorite title 1');
    const firstDetail = calls.find(([type, value]) => type === 'fillText' && value === 'Anime');
    assert.equal(firstName[4], 'middle');
    assert.equal((firstName[3] - 18 + firstDetail[3] + 11.5) / 2, 32 + 116 + 58);
    assert.ok(calls.some(([type, name]) => type === 'download' && name === 'my-top-10-anime.png'));
    calls.length = 0;
    draft.mode = 'characters';
    draft.ownerName = 'Amedee';
    draft.slots[0].animeTitle = 'Cowboy Bebop';
    draft.slots[0].voiceActor = 'Yamadera, Kouichi';
    draft.slots[0].image = '';
    savePng(await createPng(draft), draft.mode);
    assert.ok(calls.some(([type, text]) => type === 'fillText' && text === 'Amedee’s Top 10 Characters'));
    assert.equal(calls.filter(([type]) => type === 'drawImage').length, 9);
    assert.ok(calls.some(([type, text]) => type === 'fillText' && text === 'No artwork'));
    assert.ok(calls.some(([type, text]) => type === 'fillText' && text === 'From: Cowboy Bebop'));
    assert.ok(calls.some(([type, text]) => type === 'fillText' && text === 'CV (JP): Yamadera, Kouichi'));
    const characterName = calls.find(([type, value]) => type === 'fillText' && value === 'A long favorite title 1');
    const characterCv = calls.find(([type, value]) => type === 'fillText' && value === 'CV (JP): Yamadera, Kouichi');
    assert.equal((characterName[3] - 18 + characterCv[3] + 11.5) / 2, 32 + 116 + 58);
    assert.ok(calls.some(([type, name]) => type === 'download' && name === 'my-top-10-characters.png'));
    calls.length = 0;
    draft.slots[1] = null;
    await createPng(draft);
    assert.equal(calls.filter(([type]) => type === 'drawImage').length, 8);
    assert.ok(calls.some(([type, text]) => type === 'fillText' && text === '2'));
    draft.slots[4].image = 'https://cdn.example/broken.jpg';
    await assert.rejects(createPng(draft), /rank 5/);
  } finally { globalThis.setTimeout = originalTimeout; }
});
