import { search, getEntries } from './api.js';
import { blank, loadDrafts, saveDrafts, shareUrl, parseShare, normalizeName, listTitle } from './state.js';
import { createPng, savePng } from './export.js';

const PUBLIC_PAGE = 'https://amedeekirk.github.io/top-10/';

const $ = (id) => document.getElementById(id);
const grid = $('grid');
const picker = $('picker');
const query = $('query');
const results = $('results');
const loaded = loadDrafts();
const drafts = loaded.drafts;
let current = drafts.anime;
let shared = false;
let sharedExpected = 10;
let copy = false;
let editingSlot = -1;
let drag;
let touchPending;
let suppressRowClick = false;
let searchPage = 1;
let retryPage = 1;
let searchTimer;
let searchController;
let searchSerial = 0;
let shareController;
let focusReturn;
let sharePngCache;
let sharePrepTimer;
let imagePng;
let imagePreviewUrl;
let imageGeneration = 0;
let imageFocusReturn;

if (loaded.warning) notice(loaded.warning);

function notice(message) {
  $('notice').textContent = message;
  $('notice').classList.toggle('hidden', !message);
}

function error(message) {
  $('error-text').textContent = message;
  $('error-reset').classList.toggle('hidden', !location.hash || !message);
  $('error').classList.toggle('hidden', !message);
}

function persist() {
  if (copy || shared) return;
  drafts[current.mode] = current;
  if (!saveDrafts(drafts)) notice('This browser could not save your draft. You can still download or share it.');
}

function filled() { return current.slots.filter(Boolean).length; }

function prepareSharePng(draft = current) {
  const key = JSON.stringify(draft);
  if (sharePngCache?.key !== key) {
    const promise = createPng(structuredClone(draft));
    sharePngCache = { key, promise };
    promise.catch(() => { if (sharePngCache?.promise === promise) sharePngCache = null; });
  }
  return sharePngCache.promise;
}

function shareDetails(draft = current) {
  const title = listTitle(draft);
  const url = shareUrl(draft, PUBLIC_PAGE);
  const text = `${title}, made on Amedee's site. Make yours too!`;
  return { title, text, url, message: `${text}\n${url}` };
}

function renderTitle() {
  const title = listTitle(current);
  $('page-title').textContent = title;
  document.title = title;
}

function renderGrid() {
  grid.replaceChildren();
  current.slots.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'group relative rounded-md';
    const tile = document.createElement(shared ? 'a' : 'button');
    tile.className = `row-select flex min-h-24 w-full items-stretch overflow-hidden rounded-md border border-gray-300 bg-white text-left hover:border-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:min-h-28 ${!shared && entry ? 'cursor-grab active:cursor-grabbing' : ''}`;
    if (shared) {
      if (entry) { tile.href = entry.url; tile.target = '_blank'; tile.rel = 'noopener noreferrer'; }
      else tile.classList.remove('hover:border-blue-500');
    } else {
      tile.type = 'button';
      tile.addEventListener('click', (event) => {
        if (suppressRowClick) { event.preventDefault(); suppressRowClick = false; return; }
        openPicker(index, tile);
      });
    }
    const rank = document.createElement('span');
    rank.className = 'flex w-14 shrink-0 items-center justify-center bg-blue-600 text-2xl font-bold text-white sm:w-20 sm:text-4xl';
    rank.textContent = String(index + 1);
    const copy = document.createElement('span');
    copy.className = 'flex min-w-0 flex-1 flex-col justify-center px-3 py-2 sm:px-5';
    const name = document.createElement('strong');
    name.className = `block truncate text-sm sm:text-xl ${entry ? 'font-semibold' : 'font-medium text-gray-500'}`;
    name.textContent = entry?.name || (shared ? 'Empty rank' : 'Add a pick');
    const detail = document.createElement('span');
    detail.className = 'mt-1 block truncate text-xs text-gray-600 sm:text-sm';
    if (entry && current.mode === 'characters') {
      detail.textContent = entry.animeTitle ? `From: ${entry.animeTitle}` : 'Anime not listed';
    } else {
      detail.textContent = entry?.detail || 'Anime';
    }
    copy.append(name);
    if (entry) copy.append(detail);
    if (entry && current.mode === 'characters' && entry.voiceActor) {
      const voice = document.createElement('span');
      voice.className = 'mt-0.5 block truncate text-xs text-gray-600 sm:text-sm';
      voice.textContent = `CV (JP): ${entry.voiceActor}`;
      copy.append(voice);
    }
    const art = document.createElement('span');
    art.className = 'relative flex w-20 shrink-0 items-center justify-center bg-gray-100 text-center text-[10px] text-gray-500 sm:w-28';
    if (entry) {
      const missing = document.createElement('span');
      missing.textContent = 'No artwork';
      art.append(missing);
    }
    if (entry?.image) {
      const image = document.createElement('img');
      image.src = entry.image;
      image.alt = '';
      image.loading = 'lazy';
      image.draggable = false;
      image.className = 'absolute inset-0 h-full w-full object-cover';
      image.addEventListener('error', () => image.remove());
      art.append(image);
    }
    tile.append(rank, copy, art);
    tile.setAttribute('aria-label', entry ? `${shared ? 'Open' : 'Edit'} rank ${index + 1}: ${entry.name}${entry.animeTitle ? `, from ${entry.animeTitle}` : ''}${entry.voiceActor ? `, Japanese CV ${entry.voiceActor}` : ''}` : shared ? `Empty rank ${index + 1}` : `Add a pick at rank ${index + 1}`);
    row.append(tile);
    if (!shared && entry) {
      tile.addEventListener('dragstart', (event) => event.preventDefault());
      tile.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'touch') startDrag(event, index, row, tile);
      });
      tile.addEventListener('touchstart', (event) => startTouch(event, index, row, tile), { passive: true });
      tile.addEventListener('touchmove', moveTouch, { passive: false });
      tile.addEventListener('touchend', endTouch);
      tile.addEventListener('touchcancel', cancelTouch);
      tile.addEventListener('keydown', (event) => {
        if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
        event.preventDefault();
        const destination = index + (event.key === 'ArrowUp' ? -1 : 1);
        if (destination < 0 || destination >= current.slots.length) return;
        moveRank(index, destination);
      });
      tile.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown');
      tile.setAttribute('aria-description', 'Drag to reorder. On a keyboard, press Alt plus Up or Down Arrow.');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-pick absolute top-1/2 right-2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-gray-900 shadow-sm hover:bg-red-50 hover:text-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100';
      remove.innerHTML = '<svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4l12 12M16 4L4 16"/></svg>';
      remove.setAttribute('aria-label', `Remove rank ${index + 1}: ${entry.name}`);
      remove.addEventListener('click', () => {
        current.slots[index] = null;
        persist();
        renderGrid();
        grid.children[index].querySelector('.row-select').focus();
      });
      row.append(remove);
    }
    grid.append(row);
  });
  const count = filled();
  renderTitle();
  $('owner-name').value = current.ownerName;
  $('personalization').classList.toggle('hidden', shared);
  $('count').textContent = `${count} of 10 ranked`;
  $('generate').disabled = count === 0;
  $('share').disabled = count === 0;
  $('clear').classList.toggle('hidden', shared);
  $('save-copy').classList.toggle('hidden', !copy);
  $('shared-intro').classList.toggle('hidden', !shared);
  $('edit-copy').disabled = shared && count !== sharedExpected;
  $('edit-copy').textContent = shared && $('edit-copy').disabled ? 'Loading picks…' : 'Edit a copy';
  $('mode-switch').classList.toggle('hidden', shared || copy);
  for (const button of $('mode-switch').querySelectorAll('button')) {
    const selected = button.dataset.mode === current.mode;
    button.classList.toggle('bg-blue-600', selected);
    button.classList.toggle('text-white', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  $('shared-links').classList.toggle('hidden', !shared);
  clearTimeout(sharePrepTimer);
  if (!shared && count > 0) sharePrepTimer = setTimeout(prepareSharePng, 500);
}

function moveRank(from, to) {
  if (from === to || !current.slots[from]) return;
  const [entry] = current.slots.splice(from, 1);
  current.slots.splice(to, 0, entry);
  persist();
  renderGrid();
  $('sort-status').textContent = `${entry.name} moved to rank ${to + 1}.`;
  grid.children[to].querySelector('.row-select').focus();
}

function beginDrag(index, row, source, startY, pointerId, kind) {
  drag = { index, target: index, pointerId, kind, row, source, startY, moved: false };
}

function startDrag(event, index, row, tile) {
  if (event.button !== 0 || drag) return;
  event.preventDefault();
  beginDrag(index, row, tile, event.clientY, event.pointerId, 'pointer');
  tile.setPointerCapture?.(event.pointerId);
  tile.addEventListener('pointermove', movePointer);
  tile.addEventListener('pointerup', finishPointer);
  tile.addEventListener('pointercancel', cancelPointer);
}

function movePointer(event) {
  if (!drag || drag.kind !== 'pointer' || event.pointerId !== drag.pointerId) return;
  moveDrag(event.clientX, event.clientY);
}

function moveDrag(clientX, clientY) {
  const delta = clientY - drag.startY;
  if (!drag.moved && Math.abs(delta) < 6) return;
  drag.moved = true;
  drag.row.style.transform = `translateY(${delta}px)`;
  drag.row.style.zIndex = '20';
  drag.row.classList.add('shadow-xl', 'opacity-90');
  const bounds = grid.getBoundingClientRect();
  if (clientX >= bounds.left && clientX <= bounds.right) {
    let nearest = drag.index;
    let distance = Infinity;
    Array.from(grid.children).forEach((candidate, candidateIndex) => {
      const rect = candidate.getBoundingClientRect();
      const middle = (rect.top + rect.bottom) / 2 - (candidateIndex === drag.index ? delta : 0);
      const difference = Math.abs(clientY - middle);
      if (difference < distance) { nearest = candidateIndex; distance = difference; }
    });
    if (nearest !== drag.target) {
      grid.children[drag.target].classList.remove('ring-4', 'ring-blue-500');
      drag.target = nearest;
      if (nearest !== drag.index) grid.children[nearest].classList.add('ring-4', 'ring-blue-500');
    }
  }
  if (clientY < 70) window.scrollBy?.(0, -18);
  else if (clientY > window.innerHeight - 70) window.scrollBy?.(0, 18);
}

function endDrag(commit) {
  if (!drag) return;
  const { index, target, row, source, moved, kind, pointerId } = drag;
  if (kind === 'pointer') {
    source.removeEventListener('pointermove', movePointer);
    source.removeEventListener('pointerup', finishPointer);
    source.removeEventListener('pointercancel', cancelPointer);
    if (source.hasPointerCapture?.(pointerId)) source.releasePointerCapture(pointerId);
  }
  row.style.transform = '';
  row.style.zIndex = '';
  row.classList.remove('shadow-xl', 'opacity-90');
  grid.children[target].classList.remove('ring-4', 'ring-blue-500');
  drag = null;
  if (moved && target === index) {
    suppressRowClick = true;
    setTimeout(() => { suppressRowClick = false; }, 0);
  }
  if (commit && moved && target !== index) moveRank(index, target);
}

function finishPointer(event) {
  if (drag?.kind === 'pointer' && event.pointerId === drag.pointerId) endDrag(true);
}
function cancelPointer(event) {
  if (drag?.kind === 'pointer' && event.pointerId === drag.pointerId) endDrag(false);
}

function clearPendingTouch() {
  if (touchPending) clearTimeout(touchPending.timer);
  touchPending = null;
}

function startTouch(event, index, row, tile) {
  if (event.touches.length !== 1 || drag) return;
  const touch = event.touches[0];
  clearPendingTouch();
  touchPending = { identifier: touch.identifier, x: touch.clientX, y: touch.clientY };
  touchPending.timer = setTimeout(() => {
    if (!touchPending) return;
    beginDrag(index, row, tile, touchPending.y, touchPending.identifier, 'touch');
    row.classList.add('ring-2', 'ring-blue-500');
    touchPending = null;
  }, 250);
}

function matchingTouch(event, identifier) {
  return Array.from(event.changedTouches).find((touch) => touch.identifier === identifier);
}

function moveTouch(event) {
  if (drag?.kind === 'touch') {
    const touch = matchingTouch(event, drag.pointerId);
    if (!touch) return;
    event.preventDefault();
    moveDrag(touch.clientX, touch.clientY);
  } else if (touchPending) {
    const touch = matchingTouch(event, touchPending.identifier);
    if (touch && Math.hypot(touch.clientX - touchPending.x, touch.clientY - touchPending.y) > 8) clearPendingTouch();
  }
}

function endTouch(event) {
  if (drag?.kind === 'touch' && matchingTouch(event, drag.pointerId)) {
    event.preventDefault();
    drag.row.classList.remove('ring-2', 'ring-blue-500');
    endDrag(true);
  }
  clearPendingTouch();
}

function cancelTouch(event) {
  if (drag?.kind === 'touch' && matchingTouch(event, drag.pointerId)) {
    drag.row.classList.remove('ring-2', 'ring-blue-500');
    endDrag(false);
  }
  clearPendingTouch();
}

function openPicker(index, tile) {
  error('');
  editingSlot = index;
  focusReturn = tile;
  $('picker-title').textContent = `${current.slots[index] ? 'Replace' : 'Choose'} rank ${index + 1}`;
  $('search-label').textContent = `Search ${current.mode}`;
  query.value = '';
  resetResults();
  picker.showModal();
  query.focus();
}

function closePicker() {
  clearTimeout(searchTimer);
  searchController?.abort();
  searchSerial++;
  picker.close();
  focusReturn?.focus();
}

function resetResults() {
  results.replaceChildren();
  $('more').classList.add('hidden');
  $('retry').classList.add('hidden');
  $('search-status').textContent = 'Type at least two characters to search.';
  searchPage = 1;
  retryPage = 1;
}

function searchAgain() {
  clearTimeout(searchTimer);
  searchController?.abort();
  const serial = ++searchSerial;
  resetResults();
  const term = query.value.trim();
  if (term.length < 2) return;
  $('search-status').textContent = 'Searching…';
  searchTimer = setTimeout(() => runSearch(term, 1, serial), 400);
}

async function runSearch(term, page, serial) {
  retryPage = page;
  searchController?.abort();
  const controller = new AbortController();
  searchController = controller;
  $('more').classList.add('hidden');
  $('retry').classList.add('hidden');
  $('search-status').textContent = page === 1 ? 'Searching…' : 'Loading more…';
  try {
    const response = await search(current.mode, term, page, controller.signal);
    if (serial !== searchSerial || !picker.open || term !== query.value.trim()) return;
    if (page === 1) results.replaceChildren();
    response.items.forEach(addResult);
    searchPage = page;
    $('more').classList.toggle('hidden', !response.more);
    $('search-status').textContent = results.children.length ? `${results.children.length} results shown` : 'No results found. Try another name.';
  } catch (cause) {
    if (cause.name === 'AbortError' || serial !== searchSerial) return;
    $('search-status').textContent = cause.message;
    $('retry').classList.remove('hidden');
  }
}

function addResult(item) {
  const duplicate = current.slots.some((entry, index) => index !== editingSlot && entry?.id === item.id);
  const button = document.createElement('button');
  button.type = 'button';
  button.disabled = duplicate;
  button.className = 'flex w-full items-center gap-3 border-b border-gray-200 p-2 text-left hover:bg-blue-50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-600';
  const imageWrap = document.createElement('span');
  imageWrap.className = 'flex h-16 w-12 shrink-0 items-center justify-center rounded bg-gray-100 text-center text-[9px] text-gray-500';
  const missing = document.createElement('span');
  missing.textContent = 'No artwork';
  imageWrap.append(missing);
  if (item.image) {
    const image = document.createElement('img');
    image.src = item.image;
    image.alt = '';
    image.loading = 'lazy';
    image.className = 'h-full w-full rounded object-cover';
    missing.classList.add('hidden');
    image.addEventListener('error', () => { image.remove(); missing.classList.remove('hidden'); });
    imageWrap.prepend(image);
  }
  const text = document.createElement('span');
  text.className = 'min-w-0';
  const name = document.createElement('strong');
  name.className = 'block text-sm';
  name.textContent = item.name;
  const detail = document.createElement('small');
  detail.className = 'block text-gray-600';
  const from = current.mode === 'characters' ? (item.animeTitle ? `From: ${item.animeTitle}` : 'Anime not listed') : item.detail;
  detail.textContent = duplicate ? `Already selected · ${from}` : from;
  text.append(name, detail);
  if (current.mode === 'characters' && item.voiceActor) {
    const voice = document.createElement('small');
    voice.className = 'block text-gray-600';
    voice.textContent = `CV (JP): ${item.voiceActor}`;
    text.append(voice);
  }
  button.append(imageWrap, text);
  button.addEventListener('click', () => {
    const slot = editingSlot;
    current.slots[slot] = item;
    persist();
    closePicker();
    renderGrid();
    grid.children[slot].querySelector('.row-select').focus();
  });
  results.append(button);
}

async function loadShared() {
  shareController?.abort();
  shareController = new AbortController();
  let link;
  try { link = parseShare(location.hash); }
  catch (cause) {
    renderGrid();
    error(cause.message);
    return;
  }
  if (!link) {
    shared = false;
    sharedExpected = 10;
    copy = false;
    current = drafts[current.mode];
    renderGrid();
    return;
  }
  error('');
  notice('Loading shared list…');
  shared = true;
  sharedExpected = link.ids.filter(Boolean).length;
  copy = false;
  current = blank(link.mode);
  current.ownerName = link.ownerName;
  renderGrid();
  const signal = shareController.signal;
  try {
    const entries = await getEntries(link.mode, link.ids.filter(Boolean), signal);
    if (signal.aborted) return;
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    link.ids.forEach((id, index) => { if (id !== null) current.slots[index] = byId.get(id) || null; });
    renderGrid();
    const missing = link.ids.filter((id) => id !== null && !byId.has(id)).length;
    if (missing) error(`${missing} shared ${missing === 1 ? 'entry is' : 'entries are'} unavailable. Retry by refreshing this page.`);
  } catch (cause) {
    if (!signal.aborted) error(`${cause.message} Retry by refreshing this page.`);
  } finally {
    if (!signal.aborted) notice('');
  }
}

for (const button of $('mode-switch').querySelectorAll('button')) {
  button.addEventListener('click', () => {
    current = drafts[button.dataset.mode];
    notice('');
    error('');
    renderGrid();
  });
}

$('close-picker').addEventListener('click', closePicker);
picker.addEventListener('cancel', (event) => { event.preventDefault(); closePicker(); });
query.addEventListener('input', searchAgain);
$('more').addEventListener('click', () => runSearch(query.value.trim(), searchPage + 1, searchSerial));
$('retry').addEventListener('click', () => runSearch(query.value.trim(), retryPage, searchSerial));

$('owner-name').addEventListener('input', () => {
  current.ownerName = normalizeName($('owner-name').value);
  persist();
  renderTitle();
  clearTimeout(sharePrepTimer);
  if (filled()) sharePrepTimer = setTimeout(prepareSharePng, 500);
});

$('clear').addEventListener('click', () => {
  if (!filled() || !confirm(`Clear all picks in this ${current.mode} list?`)) return;
  current.slots = Array(10).fill(null);
  persist();
  error('');
  notice('');
  renderGrid();
});

async function openImageDialog(preparedBlob = null, showShareOptions = false, draft = structuredClone(current)) {
  if (!filled()) return;
  imageFocusReturn = document.activeElement;
  const generation = ++imageGeneration;
  imagePng = null;
  if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
  imagePreviewUrl = null;
  $('image-preview').removeAttribute('src');
  $('image-preview').classList.add('hidden');
  $('share-options').classList.add('hidden');
  for (const id of ['image-download', 'image-copy', 'image-share']) $(id).disabled = true;
  $('image-status').textContent = 'Generating image…';
  $('image-dialog').showModal();
  $('close-image').focus();
  try {
    const blob = preparedBlob || await prepareSharePng(draft);
    if (generation !== imageGeneration || !$('image-dialog').open) return;
    imagePng = { blob, draft };
    imagePreviewUrl = URL.createObjectURL(blob);
    $('image-preview').src = imagePreviewUrl;
    $('image-preview').classList.remove('hidden');
    for (const id of ['image-download', 'image-copy', 'image-share']) $(id).disabled = false;
    if (showShareOptions) {
      showManualShare();
    } else {
      $('image-status').textContent = 'Image ready. Download, copy, or share it.';
    }
  } catch (cause) {
    if (generation === imageGeneration) $('image-status').textContent = `${cause.message} Close this preview and try again.`;
  }
}
$('generate').addEventListener('click', () => openImageDialog());
function closeImage() {
  imageGeneration++;
  $('image-dialog').close();
  if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
  imagePreviewUrl = null;
  imagePng = null;
  imageFocusReturn?.focus();
}
$('close-image').addEventListener('click', closeImage);
$('image-dialog').addEventListener('cancel', (event) => { event.preventDefault(); closeImage(); });
$('image-download').addEventListener('click', () => {
  if (!imagePng) return;
  savePng(imagePng.blob, imagePng.draft.mode);
  $('image-status').textContent = 'PNG downloaded.';
});
$('image-copy').addEventListener('click', async () => {
  if (!imagePng) return;
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem !== 'function') throw new Error('Image clipboard unavailable.');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': imagePng.blob })]);
    $('image-status').textContent = 'Image copied to clipboard.';
  } catch {
    $('image-status').textContent = 'This browser could not copy the image. Download it instead.';
  }
});
async function tryNativeShare(blob, draft) {
  const details = shareDetails(draft);
  const file = typeof File === 'function' ? new File([blob], `my-top-10-${draft.mode}.png`, { type: 'image/png' }) : null;
  if (file && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title: details.title, text: details.text, url: details.url, files: [file] });
      return 'shared';
    } catch (cause) {
      if (cause.name === 'AbortError') return 'cancelled';
    }
  }
  return 'manual';
}
function showManualShare() {
  $('share-options').classList.remove('hidden');
  $('share-message').value = shareDetails(imagePng.draft).message;
  $('share-message').focus();
  $('image-status').textContent = 'Download the PNG, then share it with this message.';
}
$('image-share').addEventListener('click', async () => {
  if (!imagePng) return;
  const outcome = await tryNativeShare(imagePng.blob, imagePng.draft);
  if (outcome === 'manual') showManualShare();
  else $('image-status').textContent = outcome === 'shared' ? 'Share sheet opened.' : 'Sharing canceled.';
});
$('share').addEventListener('click', async () => {
  if (!filled()) return;
  $('share').disabled = true;
  $('export-status').textContent = 'Preparing image to share…';
  const draft = structuredClone(current);
  try {
    const blob = await prepareSharePng(draft);
    const outcome = await tryNativeShare(blob, draft);
    if (outcome === 'manual') {
      await openImageDialog(blob, true, draft);
      $('export-status').textContent = 'Share options are open.';
    } else {
      $('export-status').textContent = outcome === 'shared' ? 'Share sheet opened.' : 'Sharing canceled.';
    }
  } catch (cause) {
    $('export-status').textContent = cause.message;
  } finally { renderGrid(); }
});
$('copy-share-message').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('share-message').value);
    $('image-status').textContent = 'Message copied.';
  } catch {
    $('share-message').select();
    $('image-status').textContent = 'Select and copy the message above.';
  }
});

$('edit-copy').addEventListener('click', () => {
  if (filled() !== sharedExpected) return;
  copy = true;
  shared = false;
  current = structuredClone(current);
  history.replaceState(null, '', location.pathname + location.search);
  error('');
  renderGrid();
});
$('save-copy').addEventListener('click', () => {
  if (drafts[current.mode].slots.some(Boolean) && !confirm(`Replace your saved ${current.mode} draft with this copy?`)) return;
  drafts[current.mode] = structuredClone(current);
  copy = false;
  persist();
  notice('Saved as your draft.');
  renderGrid();
});

window.addEventListener('hashchange', loadShared);
loadShared();
