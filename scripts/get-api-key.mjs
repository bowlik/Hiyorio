// Získá API klíč z Hiyori (POST /v2/login/get-api-key) a uloží ho do .env
// jako HIYORI_API_KEY. Heslo se nikam neukládá ani nevypisuje.
//
//   npm run get-key
import { ask, saveToEnv } from './env-utils.mjs';

const BASE_URL = (process.env.HIYORI_API_URL || 'https://api.hiyori.cz').replace(/\/+$/, '');

const username = await ask('Hiyori uživatelské jméno: ');
const password = await ask('Hiyori heslo (nezobrazuje se): ', { hidden: true });

let res;
try {
  res = await fetch(`${BASE_URL}/v2/login/get-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
} catch (err) {
  console.error(`Nepodařilo se spojit s Hiyori: ${err.cause?.message || err.message}`);
  if (/certificate/i.test(err.cause?.message || '')) {
    console.error('Antivirus nejspíš kontroluje HTTPS. Spusť skript přes `npm run get-key` (používá certifikáty z Windows).');
  }
  process.exit(1);
}
const body = await res.json().catch(() => null);

if (!res.ok || !body?.data?.api_key) {
  console.error(`Nepodařilo se získat klíč (${res.status}): ${body?.message || 'neznámá chyba'}`);
  process.exit(1);
}

saveToEnv({ HIYORI_API_KEY: body.data.api_key });
console.log(`Klíč uložen do .env (platí do ${body.data.expiration_date || 'neznámo'}).`);
