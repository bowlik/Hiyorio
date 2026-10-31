import fs from 'node:fs/promises';
import path from 'node:path';
import { TtlCache } from './cache.js';

// Komunitní databáze propojující ID mezi MAL, Kitsu, AniList, IMDb, TVDB...
// https://github.com/Fribb/anime-lists
const LIST_URL =
  process.env.ANIME_LIST_URL ||
  'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json';
const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const LIST_FILE = path.join(DATA_DIR, 'anime-list-full.json');
const REFRESH_MS = 24 * 60 * 60 * 1000;

let maps = null;
let ready = null;

const kitsuApiCache = new TtlCache({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 5000 });

function buildMaps(list) {
  const kitsu = new Map();
  const anilist = new Map();
  const imdb = new Map();
  const mal = new Map();

  for (const entry of list) {
    if (!entry.mal_id) continue;
    mal.set(entry.mal_id, entry);
    if (entry.kitsu_id) kitsu.set(entry.kitsu_id, entry.mal_id);
    if (entry.anilist_id) anilist.set(entry.anilist_id, entry.mal_id);
    const imdbIds = Array.isArray(entry.imdb_id) ? entry.imdb_id : entry.imdb_id ? [entry.imdb_id] : [];
    for (const id of imdbIds) {
      if (!imdb.has(id)) imdb.set(id, []);
      imdb.get(id).push(entry);
    }
  }
  return { kitsu, anilist, imdb, mal };
}

async function readCachedList() {
  try {
    const stat = await fs.stat(LIST_FILE);
    const list = JSON.parse(await fs.readFile(LIST_FILE, 'utf8'));
    return { list, fresh: Date.now() - stat.mtimeMs < REFRESH_MS };
  } catch {
    return null;
  }
}

async function downloadList() {
  const res = await fetch(LIST_URL);
  if (!res.ok) throw new Error(`Stažení mapovací databáze selhalo: ${res.status}`);
  const text = await res.text();
  const list = JSON.parse(text);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(LIST_FILE, text);
  return list;
}

async function load() {
  const cached = await readCachedList();
  if (cached?.fresh) {
    maps = buildMaps(cached.list);
    return;
  }
  try {
    maps = buildMaps(await downloadList());
  } catch (err) {
    if (!cached) throw err;
    console.warn(`${err.message}, používám starší uloženou verzi`);
    maps = buildMaps(cached.list);
  }
}

export function initMapping() {
  ready ??= load().then(() => {
    console.log(`Mapovací databáze načtena (${maps.mal.size} anime)`);
    setInterval(() => {
      downloadList()
        .then((list) => {
          maps = buildMaps(list);
        })
        .catch((err) => console.warn(err.message));
    }, REFRESH_MS).unref();
  });
  return ready;
}

async function kitsuToMalViaApi(kitsuId) {
  return kitsuApiCache.getOrLoad(String(kitsuId), async () => {
    const url = `https://kitsu.io/api/edge/anime/${kitsuId}/mappings?filter[externalSite]=myanimelist/anime`;
    const res = await fetch(url, { headers: { Accept: 'application/vnd.api+json' } });
    if (!res.ok) return null;
    const body = await res.json();
    const id = Number(body?.data?.[0]?.attributes?.externalId);
    return Number.isFinite(id) && id > 0 ? id : null;
  });
}

// Rozloží Stremio ID na zdroj, ID a případně sezónu/epizodu.
//   tt1234567            film z Cinemety
//   tt1234567:2:5        seriál, 2. sezóna, 5. epizoda
//   kitsu:12345[:5]      Anime Kitsu addon
//   mal:12345[:5]
//   anilist:12345[:5]
export function parseStremioId(id) {
  const parts = String(id).split(':');
  if (/^tt\d+$/.test(parts[0])) {
    return {
      source: 'imdb',
      id: parts[0],
      season: parts[1] !== undefined ? Number(parts[1]) : undefined,
      episode: parts[2] !== undefined ? Number(parts[2]) : undefined,
    };
  }
  if (['kitsu', 'mal', 'anilist'].includes(parts[0]) && /^\d+$/.test(parts[1] || '')) {
    return {
      source: parts[0],
      id: Number(parts[1]),
      episode: parts[2] !== undefined ? Number(parts[2]) : undefined,
    };
  }
  return null;
}

// Přeloží IMDb ID na MAL. Jedna IMDb/TVDB sezóna může na MAL odpovídat více
// záznamům (rozdělené cours, např. Bleach TYBW je celé TVDB sezóna 17).
// Pokud anime-lists zná episode_offset, vybere se přesný záznam a epizoda se
// přepočítá. Jinak se vrátí všichni kandidáti a epizodu dopočítá subtitles.js
// podle počtu epizod z Hiyori.
function resolveImdb(parsed) {
  const entries = maps.imdb.get(parsed.id) || [];
  if (entries.length === 0) return null;

  if (parsed.season === undefined) {
    const movies = entries.filter((e) => e.type === 'MOVIE');
    const picked = movies.length ? movies : entries.length === 1 ? entries : [];
    return picked.length ? { malIds: picked.map((e) => e.mal_id) } : null;
  }

  const series = entries.filter((e) => e.type !== 'MOVIE');
  for (const db of ['tvdb', 'tmdb']) {
    const bySeason = series.filter((e) => e.season?.[db] === parsed.season);
    if (bySeason.length === 0) continue;

    if (bySeason.length > 1 && parsed.episode !== undefined && bySeason.some((e) => e.episode_offset?.[db])) {
      const offset = (e) => e.episode_offset?.[db] ?? 0;
      const match = bySeason
        .filter((e) => offset(e) < parsed.episode)
        .sort((a, b) => offset(b) - offset(a))[0];
      if (match) {
        return { malIds: [match.mal_id], episode: parsed.episode - offset(match), season: parsed.season };
      }
    }
    return { malIds: bySeason.map((e) => e.mal_id), episode: parsed.episode, season: parsed.season };
  }

  // Bez informace o sezóně: jediný seriálový záznam bereme jako jistý.
  return series.length === 1
    ? { malIds: [series[0].mal_id], episode: parsed.episode, season: parsed.season }
    : null;
}

export function mappingStatus() {
  return maps ? { loaded: true, anime: maps.mal.size } : { loaded: false };
}

// Záznam z anime-lists pro dané MAL ID (kitsu_id, imdb_id, season...).
export async function getMappingEntry(malId) {
  await initMapping();
  return maps.mal.get(malId) ?? null;
}

// Přeloží Stremio ID na seznam MAL ID kandidátů a číslo epizody.
// Vrací { malIds: number[], episode?: number, season?: number } nebo null.
export async function resolveToMal(stremioId) {
  await initMapping();
  const parsed = parseStremioId(stremioId);
  if (!parsed) return null;

  switch (parsed.source) {
    case 'mal':
      return { malIds: [parsed.id], episode: parsed.episode };
    case 'anilist': {
      const malId = maps.anilist.get(parsed.id);
      return malId ? { malIds: [malId], episode: parsed.episode } : null;
    }
    case 'kitsu': {
      const malId = maps.kitsu.get(parsed.id) ?? (await kitsuToMalViaApi(parsed.id));
      return malId ? { malIds: [malId], episode: parsed.episode } : null;
    }
    case 'imdb':
      return resolveImdb(parsed);
    default:
      return null;
  }
}
