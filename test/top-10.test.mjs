import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { blank, parseShare, shareUrl, loadDrafts, saveDrafts } from '../top-10/state.js';

const entry = (id, name = 'Entry ' + id) => ({
  id, name, image: 'https://s4.anilist.co/' + id + '.jpg', url: 'https://anilist.co/anime/' + id, detail: ''
});
const anime = (id) => ({
  id, title: { english: id === 1 ? 'Cowboy Bebop' : 'Anime ' + id },
  coverImage: { extraLarge: 'https://s4.anilist.co/' + id + '.jpg' },
  siteUrl: 'https://anilist.co/anime/' + id, seasonYear: 1998, format: 'TV'
});
const character = (id) => ({
  id, name: { full: 'Spike Spiegel' }, image: { large: 'https://s4.anilist.co/c' + id + '.jpg' },
  siteUrl: 'https://anilist.co/character/' + id,
  media: { edges: [{ characterRole: 'MAIN', node: { title: { english: 'Cowboy Bebop' } }, voiceActors: [{ name: { full: 'Kouichi Yamadera' } }] }] }
});

test('new links preserve order and empty ranks; old links are unsupported', () => {
  globalThis.location = new URL('https://example.test/top-10/');
  const draft = blank('characters');
  draft.slots[0] = { ...entry(1), url: 'https://anilist.co/character/1' };
  draft.slots[5] = { ...entry(6), url: 'https://anilist.co/character/6' };
  assert.deepEqual(parseShare(new URL(shareUrl(draft)).hash), { mode: 'characters', ownerName: '', ids: [1, null, null, null, null, 6, null, null, null, null] });
  draft.ownerName = 'Zoë & 李 #1';
  assert.equal(parseShare(new URL(shareUrl(draft)).hash).ownerName, draft.ownerName);
  assert.throws(() => parseShare('#v=3&m=anime&ids=,,,,,,,,,'));
  assert.throws(() => parseShare('#v=3&m=anime&ids=1,1,,,,,,,,'));
  assert.throws(() => parseShare('#v=3&m=anime&ids=9007199254740993,,,,,,,,,'));
  assert.throws(() => parseShare('#v=2&m=anime&ids=1,2,3,4,5,6,7,8,9,10'));
  assert.throws(() => parseShare('#v=3&m=anime&ids=1,,,,,,,,,&n=' + 'x'.repeat(41)));
});

test('AniList drafts stay separate and old MAL storage is ignored', () => {
  const dom = new JSDOM('', { url: 'https://example.test/' });
  globalThis.localStorage = dom.window.localStorage;
  localStorage.setItem('amedeekirk-top-10-v2', JSON.stringify({ version: 2, anime: { mode: 'anime', slots: Array(10).fill(null) } }));
  assert.equal(loadDrafts().drafts.anime.slots[0], null);
  const drafts = { anime: blank('anime'), characters: blank('characters') };
  drafts.anime.slots[0] = entry(1);
  drafts.anime.ownerName = 'Amedee';
  drafts.characters.slots[0] = { ...entry(2), url: 'https://anilist.co/character/2' };
  assert.equal(saveDrafts(drafts), true);
  assert.equal(loadDrafts().drafts.anime.slots[0].id, 1);
  assert.equal(loadDrafts().drafts.anime.ownerName, 'Amedee');
  assert.equal(loadDrafts().drafts.characters.slots[0].id, 2);
  localStorage.setItem('amedeekirk-top-10-v3', '{bad');
  assert.match(loadDrafts().warning, /unavailable/);
});

test('editor searches with complete character data, ranks picks, and shares independent copies', async () => {
  const html = readFileSync(new URL('../top-10/index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.test/top-10/', pretendToBeVisual: true });
  const { window } = dom;
  globalThis.window = window;
  for (const key of ['document', 'localStorage', 'location', 'history']) globalThis[key] = window[key];
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
  globalThis.Image = class {
    naturalWidth = 400;
    naturalHeight = 600;
    set src(value) { this.url = value; queueMicrotask(() => this.onload()); }
  };
  window.HTMLCanvasElement.prototype.getContext = () => ({
    fillRect() {}, strokeRect() {}, drawImage() {}, fillText() {}, measureText: (value) => ({ width: value.length * 12 })
  });
  window.HTMLCanvasElement.prototype.toBlob = (callback) => callback(new Blob(['png'], { type: 'image/png' }));
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  globalThis.URL.createObjectURL = () => 'blob:preview';
  globalThis.URL.revokeObjectURL = () => {};
  const copiedImages = [];
  globalThis.ClipboardItem = class { constructor(data) { this.data = data; } };
  Object.defineProperty(window.navigator, 'clipboard', { value: { write: async (items) => copiedImages.push(...items), writeText: async () => {} } });
  globalThis.confirm = () => true;
  globalThis.structuredClone ??= (value) => JSON.parse(JSON.stringify(value));
  const requests = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://graphql.anilist.co');
    const body = JSON.parse(options.body);
    requests.push(body);
    const isAnime = body.query.includes('media(search:') || body.query.includes('media(id_in:');
    const ids = body.variables.ids;
    const list = ids ? ids.map(isAnime ? anime : character) : [isAnime ? anime(body.variables.search === 'Naruto' ? 2 : 1) : character(1)];
    return {
      ok: true, status: 200,
      json: async () => ({ data: { Page: { pageInfo: { hasNextPage: false }, [isAnime ? 'media' : 'characters']: list } } })
    };
  };
  await import('../top-10/app.js');
  const click = (selector) => { const element = window.document.querySelector(selector); assert.ok(element, selector); element.click(); return element; };
  const waitFor = async (predicate, attempts = 100) => {
    for (let n = 0; n < attempts; n++) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 30)); }
    assert.fail('Timed out waiting for editor update');
  };
  const input = window.document.querySelector('#query');
  const row = (index) => `#grid > :nth-child(${index})`;
  click(`${row(1)} .row-select`);
  input.value = 'Cowboy';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await waitFor(() => window.document.querySelector('#results button'));
  click('#results button');
  assert.match(window.document.querySelector(`${row(1)} .row-select`).textContent, /Cowboy Bebop/);
  assert.equal(window.document.querySelector('#generate').disabled, false);
  assert.equal(window.document.querySelector('#share').disabled, false);
  const ownerName = window.document.querySelector('#owner-name');
  ownerName.value = '  Amedee  ';
  ownerName.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(window.document.querySelector('#page-title').textContent, 'Amedee’s Top 10 Anime');
  assert.equal(loadDrafts().drafts.anime.ownerName, 'Amedee');
  assert.match(window.document.querySelector(`${row(1)} .remove-pick`).className, /top-1\/2/);
  click(`${row(2)} .row-select`);
  input.value = 'Cowboy';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await waitFor(() => window.document.querySelector('#results button'));
  assert.equal(window.document.querySelector('#results button').disabled, true);
  click('#close-picker');
  click(`${row(1)} .row-select`);
  assert.match(window.document.querySelector('#picker-title').textContent, /Replace rank 1/);
  assert.equal(window.document.querySelector('#query'), window.document.activeElement);
  click('#close-picker');
  window.document.querySelectorAll('#grid > div').forEach((element, index) => {
    element.getBoundingClientRect = () => ({ top: index * 100, bottom: index * 100 + 90, left: 0, right: 700 });
  });
  window.document.querySelector('#grid').getBoundingClientRect = () => ({ left: 0, right: 700 });
  const pointer = (type, y) => {
    const event = new window.MouseEvent(type, { bubbles: true, button: 0, clientX: 200, clientY: y });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    return event;
  };
  const draggedRow = window.document.querySelector(`${row(1)} .row-select`);
  assert.equal(window.document.querySelector('.drag-handle'), null);
  draggedRow.dispatchEvent(pointer('pointerdown', 45));
  draggedRow.dispatchEvent(pointer('pointermove', 145));
  draggedRow.dispatchEvent(pointer('pointerup', 145));
  assert.match(window.document.querySelector(`${row(2)} .row-select`).textContent, /Cowboy Bebop/);
  window.document.querySelector(`${row(2)} .row-select`).dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, altKey: true, key: 'ArrowUp' }));
  assert.match(window.document.querySelector(`${row(1)} .row-select`).textContent, /Cowboy Bebop/);
  await new Promise((resolve) => setTimeout(resolve, 0));
  click(`${row(1)} .row-select`);
  input.value = 'Naruto';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await waitFor(() => window.document.querySelector('#results button')?.textContent.includes('Anime 2'));
  click('#results button');
  assert.match(window.document.querySelector(`${row(1)} .row-select`).textContent, /Anime 2/);
  assert.equal(loadDrafts().drafts.anime.slots[0].id, 2);
  const touch = (type, x, y) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    const point = { identifier: 7, clientX: x, clientY: y };
    Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [point] });
    Object.defineProperty(event, 'changedTouches', { value: [point] });
    return event;
  };
  const touchRow = window.document.querySelector(`${row(1)} .row-select`);
  touchRow.dispatchEvent(touch('touchstart', 200, 45));
  await new Promise((resolve) => setTimeout(resolve, 275));
  touchRow.dispatchEvent(touch('touchmove', 200, 145));
  touchRow.dispatchEvent(touch('touchend', 200, 145));
  assert.match(window.document.querySelector(`${row(2)} .row-select`).textContent, /Anime 2/);
  await new Promise((resolve) => setTimeout(resolve, 0));
  window.document.querySelector(`${row(2)} .row-select`).dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, altKey: true, key: 'ArrowUp' }));
  click(`${row(1)} .remove-pick`);
  assert.match(window.document.querySelector('#count').textContent, /^0 of 10/);
  click(`${row(1)} .row-select`);
  input.value = 'Cowboy';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await waitFor(() => window.document.querySelector('#results button'));
  click('#results button');
  click('[data-mode="characters"]');
  assert.match(window.document.querySelector('#count').textContent, /^0 of 10/);
  assert.equal(ownerName.value, '');
  click(`${row(1)} .row-select`);
  input.value = 'Spike';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await waitFor(() => window.document.querySelector('#results button')?.textContent.includes('CV (JP): Kouichi Yamadera'));
  assert.match(window.document.querySelector('#results button').textContent, /From: Cowboy Bebop/);
  const beforeSelection = requests.length;
  click('#results button');
  assert.equal(requests.length, beforeSelection, 'selection does not request character details');
  assert.match(window.document.querySelector(`${row(1)} .row-select`).textContent, /CV \(JP\): Kouichi Yamadera/);
  assert.equal(loadDrafts().drafts.characters.slots[0].animeTitle, 'Cowboy Bebop');
  click('[data-mode="anime"]');
  assert.equal(ownerName.value, 'Amedee');
  assert.match(window.document.querySelector(`${row(1)} .row-select`).textContent, /Cowboy Bebop/);

  const priorDraft = localStorage.getItem('amedeekirk-top-10-v3');
  const partial = blank('characters');
  partial.ownerName = 'Zoë';
  partial.slots[3] = { ...entry(1, 'Spike Spiegel'), url: 'https://anilist.co/character/1' };
  window.location.hash = new URL(shareUrl(partial)).hash;
  await waitFor(() => window.document.querySelector(`${row(4)} .row-select`)?.textContent.includes('Spike Spiegel') && !window.document.querySelector('#edit-copy').disabled);
  assert.equal(requests.filter(({ variables }) => variables.ids).length, 1, 'shared list resolves in one batch');
  assert.equal(localStorage.getItem('amedeekirk-top-10-v3'), priorDraft);
  assert.equal(window.document.querySelector('#page-title').textContent, 'Zoë’s Top 10 Characters');
  assert.ok(window.document.querySelector('#personalization').classList.contains('hidden'));
  click('#edit-copy');
  assert.equal(ownerName.value, 'Zoë');
  ownerName.value = 'Jordan';
  ownerName.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(window.location.hash, '');
  assert.equal(localStorage.getItem('amedeekirk-top-10-v3'), priorDraft);
  click('#save-copy');
  assert.equal(loadDrafts().drafts.characters.slots[3].id, 1);
  assert.equal(loadDrafts().drafts.characters.ownerName, 'Jordan');
  click('#share');
  await waitFor(() => window.document.querySelector('#image-dialog').open && !window.document.querySelector('#share-options').classList.contains('hidden'));
  assert.match(window.document.querySelector('#share-message').value, /https:\/\/amedeekirk\.github\.io\/top-10\/#v=3/);
  assert.match(window.document.querySelector('#share-message').value, /Jordan’s Top 10 Characters/);
  click('#close-image');
  click('#generate');
  await waitFor(() => !window.document.querySelector('#image-download').disabled);
  assert.equal(window.document.querySelector('#image-dialog').open, true);
  assert.equal(window.document.querySelector('#image-preview').getAttribute('src'), 'blob:preview');
  click('#image-copy');
  await waitFor(() => copiedImages.length === 1);
  assert.ok(copiedImages[0].data['image/png']);
  click('#image-share');
  await waitFor(() => !window.document.querySelector('#share-options').classList.contains('hidden'));
  assert.match(window.document.querySelector('#share-message').value, /https:\/\/amedeekirk\.github\.io\/top-10\/#v=3/);
  assert.doesNotMatch(window.document.querySelector('#share-message').value, /example\.test/);
  const nativeShares = [];
  globalThis.File = window.File;
  window.navigator.canShare = ({ files }) => files.length === 1;
  window.navigator.share = async (payload) => nativeShares.push(payload);
  click('#image-share');
  await waitFor(() => nativeShares.length === 1);
  assert.equal(nativeShares[0].files[0].type, 'image/png');
  assert.equal(nativeShares[0].title, 'Jordan’s Top 10 Characters');
  assert.equal(parseShare(new URL(nativeShares[0].url).hash).ownerName, 'Jordan');
  assert.match(nativeShares[0].text, /Make yours too/);
  assert.match(nativeShares[0].url, /amedeekirk\.github\.io\/top-10\/#v=3/);
  click('#close-image');
  assert.equal(window.document.querySelector('#image-dialog').open, false);
  click('#share');
  await waitFor(() => nativeShares.length === 2);
  assert.equal(window.document.querySelector('#image-dialog').open, false);
});
