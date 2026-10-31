import express from 'express';
import { exchangeCredentials, getToken, HiyoriError } from './hiyori.js';
import { initMapping, mappingStatus } from './mapping.js';
import { findSubtitles, getSrt, stremioLang, subtitleLabel } from './subtitles.js';
import { configurePage } from './configure.js';

const PORT = Number(process.env.PORT) || 7000;

// ADDON_ID a ADDON_NAME dovolí nasadit addon pod jiným názvem (např.
// oficiální verzi Hiyori) bez úprav kódu.
const manifest = {
  id: process.env.ADDON_ID || 'community.hiyorio',
  version: '0.1.0',
  name: process.env.ADDON_NAME || 'Hiyorio',
  description:
    'Neoficiální addon: české a slovenské titulky k anime z Hiyori.cz. Vyžaduje vlastní API klíč s přístupem schváleným administrátory Hiyori.',
  resources: ['subtitles'],
  types: ['series', 'movie', 'anime'],
  idPrefixes: ['tt', 'kitsu', 'mal', 'anilist'],
  catalogs: [],
  behaviorHints: { configurable: true, configurationRequired: true },
};

// Konfigurace je v URL addonu jako base64url JSON, tak jak to Stremio
// u konfigurovatelných addonů očekává: { apiKey, langs? }. langs omezuje
// jazyky titulků (např. ["CZ"]); bez něj se nabízí všechny.
function decodeConfig(segment) {
  try {
    const config = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    if (typeof config?.apiKey !== 'string' || !config.apiKey.trim()) return null;
    const langs = Array.isArray(config.langs)
      ? config.langs.map((l) => String(l).toUpperCase()).filter(Boolean)
      : [];
    return { apiKey: config.apiKey.trim(), langs };
  } catch {
    return null;
  }
}

// Přihlášení jménem a heslem k Hiyori nabízí jen server, kterému uživatelé
// mohou heslo svěřit (ideálně provozovaný přímo Hiyori). Jinak jen API klíč.
const LOGIN_ENABLED = process.env.ENABLE_LOGIN === '1';

// Jednoduchý limit pokusů o přihlášení na IP, aby přes addon nešlo hádat
// hesla k Hiyori.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map();

function loginLimited(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > LOGIN_MAX_ATTEMPTS;
}

function publicBaseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const proto = req.get('x-forwarded-proto')?.split(',')[0] || req.protocol;
  return `${proto}://${req.get('host')}`;
}

// "filename=abc.mkv&videoHash=..." -> { filename, videoHash, ... }
function parseExtra(extra) {
  return extra ? Object.fromEntries(new URLSearchParams(decodeURIComponent(extra))) : {};
}

function logError(context, err) {
  if (err instanceof HiyoriError) {
    console.warn(`${context}: Hiyori ${err.status ?? ''} ${err.code ?? ''} ${err.message}`);
  } else {
    console.error(`${context}:`, err);
  }
}

const app = express();
app.disable('x-powered-by');
// Za reverzní proxy (nginx, Caddy…) nastav TRUST_PROXY=1, aby limit
// přihlášení počítal se skutečnou IP uživatele.
if (process.env.TRUST_PROXY) app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', '*');
  next();
});

app.get('/', (req, res) => res.redirect('/configure'));
// Pro hosting a Docker HEALTHCHECK. Neobsahuje nic citlivého.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: manifest.version, mapping: mappingStatus() });
});
app.get(['/configure', '/:config/configure'], (req, res) => {
  res.type('html').send(configurePage(publicBaseUrl(req), manifest, { loginEnabled: LOGIN_ENABLED }));
});

// Konfigurační stránka sem pošle jméno a heslo k Hiyori a dostane zpět
// API klíč. Heslo se neukládá ani neloguje.
app.post('/api/login', express.json({ limit: '2kb' }), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!LOGIN_ENABLED) return res.status(404).json({ error: 'Přihlášení heslem je na tomto serveru vypnuté.' });
  if (loginLimited(req.ip)) {
    return res.status(429).json({ error: 'Příliš mnoho pokusů. Zkus to znovu za 15 minut.' });
  }
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!username || !password) return res.status(400).json({ error: 'Vyplň jméno i heslo.' });

  try {
    const { apiKey, expiresAt } = await exchangeCredentials(username, password);
    // Klíč rovnou ověří, ať uživatel hned ví, jestli má přístup k API.
    await getToken(apiKey);
    res.json({ apiKey, expiresAt });
  } catch (err) {
    logError('login', err);
    if (err.status === 401 || err.status === 403) {
      return res.status(403).json({
        error: 'Přihlášení se nepovedlo. Zkontroluj jméno a heslo, případně jestli máš od Hiyori povolený přístup k API.',
      });
    }
    if (err.status === 429) return res.status(429).json({ error: 'Hiyori teď odmítá další pokusy. Zkus to později.' });
    res.status(502).json({ error: 'Hiyori teď neodpovídá. Zkus to prosím později.' });
  }
});

app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/:config/manifest.json', (req, res) => {
  res.json({ ...manifest, behaviorHints: { ...manifest.behaviorHints, configurationRequired: false } });
});

// /:config/subtitles/:type/:id/:extra?.json
app.get(/^\/([^/]+)\/subtitles\/([^/]+)\/([^/]+?)(?:\/([^/]+))?\.json$/, async (req, res) => {
  const config = decodeConfig(req.params[0]);
  if (!config) return res.status(400).json({ subtitles: [], error: 'Chybí API klíč' });

  const id = decodeURIComponent(req.params[2]);
  const extra = parseExtra(req.params[3]);
  try {
    // Ověří klíč dřív, než se sáhne do sdílené cache.
    await getToken(config.apiKey);
    const subs = (await findSubtitles(config.apiKey, id, extra)).filter(
      (s) => config.langs.length === 0 || config.langs.includes(String(s.language).toUpperCase()),
    );
    console.log(`subtitles ${id} -> ${subs.length}`);
    const base = `${publicBaseUrl(req)}/${req.params[0]}`;
    res.set('Cache-Control', 'public, max-age=1800');
    res.json({
      subtitles: subs.map((s) => ({
        id: `hiyori-${s.id}`,
        url: `${base}/sub/${s.id}/${subtitleLabel(s)}.srt`,
        lang: stremioLang(s.language),
      })),
      cacheMaxAge: 1800,
    });
  } catch (err) {
    logError(`subtitles ${id}`, err);
    res.json({ subtitles: [] });
  }
});

// /:config/sub/:id.srt nebo /:config/sub/:id/:popisek.srt – popisek je jen
// pro oko (Stremio ukazuje název souboru), server ho ignoruje.
app.get(/^\/([^/]+)\/sub\/(\d+)(?:\/[^/]*)?\.srt$/, async (req, res) => {
  const config = decodeConfig(req.params[0]);
  if (!config) return res.status(400).send('Chybí API klíč');
  try {
    await getToken(config.apiKey);
    const srt = await getSrt(config.apiKey, req.params[1]);
    if (!srt) return res.status(404).send('Titulky nenalezeny');
    res.set('Cache-Control', 'public, max-age=21600');
    res.type('application/x-subrip; charset=utf-8').send(srt);
  } catch (err) {
    logError(`sub ${req.params[1]}`, err);
    // 400 = titulky jsou na Hiyori jen jako odkaz na externí web
    const status =
      err.status === 400 || err.status === 404 ? 404 : err.status === 401 || err.status === 403 ? 403 : 502;
    res.status(status).send('Titulky se nepodařilo stáhnout');
  }
});

initMapping().catch((err) => console.error('Mapovací databázi se nepodařilo načíst:', err.message));
app.listen(PORT, () => {
  console.log(`Hiyorio běží na http://127.0.0.1:${PORT}/configure`);
});
