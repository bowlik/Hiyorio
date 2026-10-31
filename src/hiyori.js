import { TtlCache } from './cache.js';

const BASE_URL = (process.env.HIYORI_API_URL || 'https://api.hiyori.cz').replace(/\/+$/, '');
const USER_AGENT = 'hiyorio/0.1';

export class HiyoriError extends Error {
  constructor(message, { status, code, retryAfter } = {}) {
    super(message);
    this.name = 'HiyoriError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

// apiKey -> { token, expiresAt } | Promise
const tokens = new Map();
// apiKey -> timestamp, do kdy je klíč zablokovaný rate limitem
const blockedUntil = new Map();

// Metadata (anime, seznamy titulků) nejsou vázaná na uživatele, proto se
// cachují společně. Přístup k nim se ale vždy podmiňuje platným tokenem.
const animeByMal = new TtlCache({ ttlMs: 6 * 60 * 60 * 1000, maxEntries: 5000 });
const subtitlesByAnime = new TtlCache({ ttlMs: 15 * 60 * 1000, maxEntries: 2000 });

async function parseError(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    // tělo není JSON
  }
  const retryAfter = Number(res.headers.get('retry-after')) || undefined;
  return new HiyoriError(body?.message || `Hiyori API vrátilo ${res.status}`, {
    status: res.status,
    code: body?.error_code,
    retryAfter,
  });
}

function checkBlocked(apiKey) {
  const until = blockedUntil.get(apiKey);
  if (until && until > Date.now()) {
    throw new HiyoriError('Rate limit Hiyori API je vyčerpaný', {
      status: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((until - Date.now()) / 1000),
    });
  }
}

function noteRateLimit(apiKey, err) {
  if (err.status === 429) {
    blockedUntil.set(apiKey, Date.now() + (err.retryAfter || 60) * 1000);
  }
}

async function login(apiKey) {
  checkBlocked(apiKey);
  const res = await fetch(`${BASE_URL}/v2/login/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({ api_key: apiKey }),
  });
  if (!res.ok) {
    const err = await parseError(res);
    noteRateLimit(apiKey, err);
    throw err;
  }
  const { data } = await res.json();
  if (!data?.token) throw new HiyoriError('Hiyori API nevrátilo token');
  const expiresAt = Date.parse(data.expiration_date) || Date.now() + 29 * 60 * 1000;
  return { token: data.token, expiresAt };
}

// Vymění jméno a heslo k Hiyori za API klíč (POST /v2/login/get-api-key).
// Heslo se nikam neukládá – použije se jen pro tento jeden požadavek.
export async function exchangeCredentials(username, password) {
  const res = await fetch(`${BASE_URL}/v2/login/get-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw await parseError(res);
  const { data } = await res.json();
  if (!data?.api_key) throw new HiyoriError('Hiyori API nevrátilo API klíč');
  return { apiKey: data.api_key, expiresAt: data.expiration_date ?? null };
}

// Vrátí platný JWT pro daný API klíč. Token platí 30 minut, obnovuje se
// minutu před expirací.
export async function getToken(apiKey) {
  const cached = tokens.get(apiKey);
  if (cached instanceof Promise) return (await cached).token;
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;

  const pending = login(apiKey);
  tokens.set(apiKey, pending);
  try {
    const result = await pending;
    tokens.set(apiKey, result);
    return result.token;
  } catch (err) {
    tokens.delete(apiKey);
    throw err;
  }
}

async function request(apiKey, path, { raw = false, retried = false } = {}) {
  checkBlocked(apiKey);
  const token = await getToken(apiKey);
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: raw ? '*/*' : 'application/json',
      'User-Agent': USER_AGENT,
    },
  });

  if (res.status === 401 && !retried) {
    // token mohl expirovat dřív, než jsme čekali
    tokens.delete(apiKey);
    return request(apiKey, path, { raw, retried: true });
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await parseError(res);
    noteRateLimit(apiKey, err);
    throw err;
  }
  if (raw) return Buffer.from(await res.arrayBuffer());
  const body = await res.json();
  return body?.data ?? null;
}

export function getAnimeById(apiKey, hiyoriAnimeId) {
  return request(apiKey, `/v2/anime/${hiyoriAnimeId}`);
}

export async function getLatestSubtitles(apiKey) {
  const list = await request(apiKey, '/v2/subtitles/latest');
  return Array.isArray(list) ? list : [];
}

export function getAnimeByMalId(apiKey, malId) {
  return animeByMal.getOrLoad(String(malId), () => request(apiKey, `/v2/anime/mal/${malId}`));
}

export async function getSubtitlesForAnime(apiKey, hiyoriAnimeId) {
  const list = await subtitlesByAnime.getOrLoad(String(hiyoriAnimeId), () =>
    request(apiKey, `/v2/subtitles/anime/${hiyoriAnimeId}`),
  );
  return Array.isArray(list) ? list : [];
}

export function downloadSubtitle(apiKey, subtitleId) {
  return request(apiKey, `/v2/subtitles/${subtitleId}/download`, { raw: true });
}
