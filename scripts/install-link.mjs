// Vypíše odkaz pro instalaci addonu do Stremia s klíčem z .env.
// Odkaz obsahuje API klíč, nikomu ho neposílej.
//
//   npm run install-link
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

const base = (process.env.PUBLIC_URL || `http://127.0.0.1:${process.env.PORT || 7000}`).replace(/\/+$/, '');
const config = Buffer.from(JSON.stringify({ apiKey })).toString('base64url');
console.log('\nOdkaz pro Stremio (Addons -> vložit do vyhledávání addonů):\n');
console.log(`${base}/${config}/manifest.json\n`);
