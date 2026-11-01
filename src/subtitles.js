import { TtlCache } from './cache.js';
import { toSrtText } from './convert.js';
import { downloadSubtitle, getAnimeByMalId, getSubtitlesForAnime } from './hiyori.js';
import { resolveToMal } from './mapping.js';

// Stremio používá ISO 639-2/B kódy.
const LANGS = { CZ: 'cze', CS: 'cze', SK: 'slo', EN: 'eng' };

// subtitleId -> SRT
const srtCache = new TtlCache({ ttlMs: 6 * 60 * 60 * 1000, maxEntries: 300 });
// Titulky, které se stáhly prázdné. Dočasně je přestaneme nabízet.
const brokenIds = new TtlCache({ ttlMs: 6 * 60 * 60 * 1000, maxEntries: 2000 });

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Titulky s vyplněným url jsou jen odkaz na externí web. Hiyori je přes API
// nestáhne, a to ani když mají vyplněný format.
const isExternal = (s) => Boolean(s.url);

// Vybere Hiyori anime a epizodu. Když jedné IMDb sezóně odpovídá víc MAL
// záznamů (rozdělené cours), seřadí je podle data vysílání a epizodu
// přepočítá podle počtu epizod jednotlivých částí.
async function pickAnime(apiKey, resolved) {
  const animes = (await Promise.all(resolved.malIds.map((id) => getAnimeByMalId(apiKey, id)))).filter(
    Boolean,
  );
  if (animes.length === 0) return null;
  if (animes.length === 1) return { anime: animes[0], episode: resolved.episode };

  animes.sort((a, b) => (Date.parse(a.airing_from) || 0) - (Date.parse(b.airing_from) || 0));
  if (resolved.episode === undefined) return { anime: animes[0], episode: undefined };

  let episode = resolved.episode;
  for (const anime of animes) {
    if (!anime.episodes || episode <= anime.episodes) return { anime, episode };
    episode -= anime.episodes;
  }
  return null;
}

// Vrátí seznam titulků z Hiyori pro dané Stremio ID, seřazený tak, že
// titulky k releasu odpovídajícímu názvu souboru jsou první.
export async function findSubtitles(apiKey, stremioId, { filename } = {}) {
  const resolved = await resolveToMal(stremioId);
  if (!resolved) return [];

  const picked = await pickAnime(apiKey, resolved);
  if (!picked) return [];

  const all = (await getSubtitlesForAnime(apiKey, picked.anime.id, { episode: picked.episode })).filter(
    (s) => !isExternal(s) && !brokenIds.get(String(s.id)),
  );
  const subs =
    picked.episode === undefined ? all : all.filter((s) => Number(s.episode) === picked.episode);

  const file = normalize(filename);
  const matchesFile = (s) => file && s.release && file.includes(normalize(s.release));

  return subs
    .map((s) => ({ ...s, matchesFile: Boolean(matchesFile(s)) }))
    .sort(
      (a, b) =>
        Number(b.matchesFile) - Number(a.matchesFile) ||
        (Date.parse(b.added_at) || 0) - (Date.parse(a.added_at) || 0),
    );
}

// Odkud titulky jsou: "Hiyori", nebo doména externího webu.
export function subtitleSource(s) {
  if (!isExternal(s)) return 'Hiyori';
  try {
    return new URL(s.url).hostname.replace(/^www\./, '');
  } catch {
    return 'web';
  }
}

// Čitelný název souboru, který Stremio ukazuje u varianty titulků, např.
// "SubsPlease_example.cz_v1.1". Jen znaky, které se v URL nemusí kódovat.
export function subtitleLabel(s) {
  const clean = (v) =>
    String(v || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[\[\]()]/g, '')
      .replace(/[^A-Za-z0-9.~-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const parts = [clean(s.release), clean(subtitleSource(s))];
  if (s.version) parts.push(`v${clean(s.version)}`);
  return parts.filter(Boolean).join('_').slice(0, 80) || String(s.id);
}

export function stremioLang(language) {
  const code = String(language || '').toUpperCase();
  return LANGS[code] || code.toLowerCase() || 'cze';
}

const notFound = (message) => Object.assign(new Error(message), { status: 404 });

async function loadSrt(apiKey, subtitleId) {
  let buf;
  try {
    buf = await downloadSubtitle(apiKey, subtitleId);
  } catch (err) {
    // 400 = titulky jsou na Hiyori jen jako odkaz na externí web
    if (err.status === 400) throw notFound('Titulky jsou jen na externím webu');
    throw err;
  }
  if (!buf) return null;
  const srt = buf.length ? toSrtText(buf) : '';
  if (!srt.includes('-->')) {
    brokenIds.set(String(subtitleId), true);
    throw notFound('Stažený soubor s titulky je prázdný');
  }
  return srt;
}

export function getSrt(apiKey, subtitleId) {
  return srtCache.getOrLoad(String(subtitleId), () => loadSrt(apiKey, subtitleId));
}
