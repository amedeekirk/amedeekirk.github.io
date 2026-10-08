const KEY = 'amedeekirk-top-10-v3';
const modes = ['anime', 'characters'];

export function blank(mode) {
  return { mode, ownerName: '', slots: Array(10).fill(null) };
}

export function normalizeName(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
}

export function listTitle(draft) {
  const name = normalizeName(draft.ownerName);
  return `${name ? `${name}’s` : 'My'} Top 10 ${draft.mode === 'anime' ? 'Anime' : 'Characters'}`;
}

function validEntry(item) {
  return item && Number.isSafeInteger(item.id) && item.id > 0 &&
    typeof item.name === 'string' && item.name.length <= 300 &&
    typeof item.image === 'string' && item.image.length <= 1000 &&
    typeof item.url === 'string' && item.url.length <= 1000 &&
    (!item.image || item.image.startsWith('https://')) &&
    item.url.startsWith('https://anilist.co/');
}

function validSlots(slots) {
  return Array.isArray(slots) && slots.length === 10 &&
    slots.every((entry) => entry === null || validEntry(entry)) &&
    new Set(slots.filter(Boolean).map((entry) => entry.id)).size === slots.filter(Boolean).length;
}

export function loadDrafts() {
  const drafts = { anime: blank('anime'), characters: blank('characters') };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved?.version === 3) {
      for (const mode of modes) {
        if (saved[mode]?.mode === mode && validSlots(saved[mode].slots)) {
          drafts[mode] = { ...saved[mode], ownerName: normalizeName(saved[mode].ownerName) };
        }
      }
    }
    return { drafts, warning: '' };
  } catch {
    return { drafts, warning: 'Saved lists are unavailable in this browser. You can still build and export a ranking.' };
  }
}

export function saveDrafts(drafts) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 3, ...drafts }));
    return true;
  } catch {
    return false;
  }
}

export function shareUrl(draft, base = location.origin + location.pathname) {
  const fragment = new URLSearchParams({ v: '3', m: draft.mode, ids: draft.slots.map((entry) => entry?.id || '').join(',') });
  const name = normalizeName(draft.ownerName);
  if (name) fragment.set('n', name);
  return base + '#' + fragment;
}

export function parseShare(hash) {
  if (!hash || hash === '#') return null;
  const parts = new URLSearchParams(hash.slice(1));
  const mode = parts.get('m');
  const name = parts.get('n') || '';
  const tokens = parts.get('ids')?.split(',') || [];
  const selected = tokens.filter(Boolean);
  if (parts.get('v') !== '3' || !modes.includes(mode) || name.length > 40 || tokens.length !== 10 || !selected.length ||
    selected.some((id) => !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) ||
    new Set(selected).size !== selected.length) {
    throw new Error('This share link is invalid or uses an unsupported version.');
  }
  return { mode, ownerName: normalizeName(name), ids: tokens.map((id) => id ? Number(id) : null) };
}
