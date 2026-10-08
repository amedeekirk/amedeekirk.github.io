const API = 'https://graphql.anilist.co';
const cache = new Map();
let limitedUntil = 0;

const characterFields = 'id name { full } image { large } siteUrl media(type: ANIME, sort: POPULARITY_DESC, perPage: 4) { edges { characterRole node { title { english romaji } } voiceActors(language: JAPANESE) { name { full } } } }';
const animeFields = 'id title { english romaji } coverImage { extraLarge large } siteUrl seasonYear format';
const searchQuery = (mode) => 'query ($search: String!, $page: Int!) { Page(page: $page, perPage: 15) { pageInfo { hasNextPage } ' +
  (mode === 'anime' ? 'media(search: $search, type: ANIME) { ' + animeFields + ' }' : 'characters(search: $search) { ' + characterFields + ' }') + ' } }';
const batchQuery = (mode) => 'query ($ids: [Int]) { Page(perPage: 10) { ' +
  (mode === 'anime' ? 'media(id_in: $ids, type: ANIME) { ' + animeFields + ' }' : 'characters(id_in: $ids) { ' + characterFields + ' }') + ' } }';

async function request(query, variables, signal) {
  const key = JSON.stringify([query, variables]);
  if (cache.has(key)) return cache.get(key);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (Date.now() < limitedUntil) throw new Error('AniList is rate limiting requests. Wait a moment and retry.');
  let response;
  try {
    response = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000)
    });
  } catch {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw new Error('Network error. Check your connection and retry.');
  }
  if (response.status === 429) {
    const retry = Number(response.headers?.get('Retry-After')) || 30;
    limitedUntil = Date.now() + Math.min(retry, 60) * 1000;
    throw new Error('AniList is rate limiting requests. Wait a moment and retry.');
  }
  if (!response.ok) throw new Error('The catalog could not load results. Retry.');
  let json;
  try { json = await response.json(); }
  catch { throw new Error('The catalog returned an invalid response. Retry.'); }
  if (json.errors?.length || !json.data) throw new Error(json.errors?.[0]?.message || 'The catalog could not load results. Retry.');
  cache.set(key, json.data);
  return json.data;
}

function normalize(mode, item) {
  if (mode === 'anime') {
    return {
      id: item.id,
      name: item.title?.english || item.title?.romaji || 'Untitled anime',
      image: item.coverImage?.extraLarge || item.coverImage?.large || '',
      url: item.siteUrl || 'https://anilist.co/anime/' + item.id,
      detail: [item.seasonYear, item.format?.replaceAll('_', ' ')].filter(Boolean).join(' · ')
    };
  }
  const edges = item.media?.edges || [];
  const credit = edges.find((edge) => edge.characterRole === 'MAIN') || edges[0];
  return {
    id: item.id,
    name: item.name?.full || 'Unnamed character',
    image: item.image?.large || '',
    url: item.siteUrl || 'https://anilist.co/character/' + item.id,
    animeTitle: credit?.node?.title?.english || credit?.node?.title?.romaji || '',
    voiceActor: credit?.voiceActors?.[0]?.name?.full || ''
  };
}

export async function search(mode, term, page, signal) {
  const data = await request(searchQuery(mode), { search: term, page }, signal);
  const list = mode === 'anime' ? data.Page?.media : data.Page?.characters;
  return { items: (list || []).map((item) => normalize(mode, item)), more: Boolean(data.Page?.pageInfo?.hasNextPage) };
}

export async function getEntries(mode, ids, signal) {
  if (!ids.length) return [];
  const data = await request(batchQuery(mode), { ids }, signal);
  const list = mode === 'anime' ? data.Page?.media : data.Page?.characters;
  return (list || []).map((item) => normalize(mode, item));
}
