// Ostrý test proti Hiyori API s klíčem z .env (HIYORI_API_KEY).
// Vezme posledních pár přidaných titulků, projde celou cestu addonu
// (Stremio ID -> MAL -> Hiyori -> seznam -> stažení -> SRT) a vypíše souhrn.
// Klíč ani token nevypisuje.
//
//   npm run smoke
import { getAnimeById, getLatestSubtitles, getToken } from '../src/hiyori.js';
import { getMappingEntry } from '../src/mapping.js';
import { findSubtitles, getSrt } from '../src/subtitles.js';

try {
  process.loadEnvFile('.env');
} catch {
  // .env nemusí existovat, klíč může být v prostředí
}
const apiKey = process.env.HIYORI_API_KEY;
if (!apiKey) {
  console.error('Chybí HIYORI_API_KEY. Spusť nejdřív `npm run get-key`.');
  process.exit(1);
}

const ok = (msg) => console.log(`  OK    ${msg}`);
const fail = (msg) => console.log(`  CHYBA ${msg}`);

console.log('1) Přihlášení');
await getToken(apiKey);
ok('JWT token získán');

console.log('2) Poslední titulky');
const latest = await getLatestSubtitles(apiKey);
ok(`${latest.length} položek`);
const langs = new Set(latest.map((s) => s.language));
const formats = new Set(latest.map((s) => s.format));
console.log(`        jazyky: ${[...langs].join(', ')} | formáty: ${[...formats].join(', ')}`);
console.log(`        s vyplněným url: ${latest.filter((s) => s.url).length}/${latest.length}`);

console.log('3) Celá cesta addonu pro prvních 5 různých anime');
const seen = new Set();
for (const sub of latest) {
  if (seen.has(sub.anime_id) || seen.size >= 5) continue;
  seen.add(sub.anime_id);

  const anime = await getAnimeById(apiKey, sub.anime_id);
  const name = anime?.names?.romaji || anime?.names?.english || `#${sub.anime_id}`;
  console.log(`\n  ${name} (Hiyori ${sub.anime_id}, MAL ${anime?.mal_id ?? '?'}), epizoda ${sub.episode}`);
  if (!anime?.mal_id) {
    fail('anime nemá MAL ID, addon ho nenajde');
    continue;
  }

  const entry = await getMappingEntry(anime.mal_id);
  const ids = [`mal:${anime.mal_id}:${sub.episode}`];
  if (entry?.kitsu_id) ids.push(`kitsu:${entry.kitsu_id}:${sub.episode}`);
  const imdb = Array.isArray(entry?.imdb_id) ? entry.imdb_id[0] : entry?.imdb_id;
  if (imdb && entry?.season?.tvdb) {
    // Ve Stremiu (TVDB číslování) může epizoda začínat až za offsetem.
    const tvdbEpisode = sub.episode + (entry.episode_offset?.tvdb ?? 0);
    ids.push(`${imdb}:${entry.season.tvdb}:${tvdbEpisode}`);
  }

  const external = Boolean(sub.url);
  for (const id of ids) {
    const found = await findSubtitles(apiKey, id);
    const hit = found.some((s) => s.id === sub.id);
    if (external) {
      (hit ? fail : ok)(`${id} -> ${found.length} titulků, externí ${hit ? 'se nabízí' : 'správně vynechané'}`);
    } else {
      (hit ? ok : fail)(`${id} -> ${found.length} titulků${hit ? '' : ', hledané mezi nimi chybí'}`);
    }
  }
  if (external) continue;

  try {
    const srt = await getSrt(apiKey, sub.id);
    if (!srt) {
      fail(`stažení ${sub.id}: 404`);
      continue;
    }
    const cues = (srt.match(/-->/g) || []).length;
    const firstText = srt.split('\n\n')[0]?.split('\n').slice(2).join(' / ');
    (cues > 0 ? ok : fail)(`stažení ${sub.id} (${sub.format}, ${sub.language}): ${cues} řádků, první: "${firstText}"`);
  } catch (err) {
    fail(`stažení ${sub.id} (${sub.format}, url: ${sub.url ? 'ano' : 'ne'}): ${err.status ?? ''} ${err.message}`);
  }
}

process.exit(0);
