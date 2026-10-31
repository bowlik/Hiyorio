function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Stránka, kde se uživatel přihlásí k Hiyori (nebo vloží API klíč), zvolí
// jazyky, odsouhlasí podmínky a vytvoří si odkaz na addon pro Stremio.
// Přihlášení heslem je jen když ho provozovatel zapne (ENABLE_LOGIN).
export function configurePage(baseUrl, manifest, { loginEnabled = false } = {}) {
  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(manifest.name)}</title>
<style>
  :root { color-scheme: light dark; --bg:#f6f6f8; --fg:#1c1c22; --card:#fff; --muted:#666; --line:#8883; --accent:#7b5cff; --ok:#1f9d55; --err:#d64545; }
  @media (prefers-color-scheme: dark) { :root { --bg:#141418; --fg:#ececf1; --card:#1f1f26; --muted:#9a9aa6; } }
  * { box-sizing:border-box; }
  body { margin:0; font:16px/1.5 system-ui, sans-serif; background:var(--bg); color:var(--fg); }
  main { max-width:560px; margin:40px auto; padding:0 16px; }
  header h1 { font-size:1.5rem; margin:0 0 4px; }
  header p { color:var(--muted); margin:0 0 20px; }
  .step { background:var(--card); border-radius:12px; padding:20px; margin-bottom:14px; box-shadow:0 1px 3px rgba(0,0,0,.12); }
  .step.locked { opacity:.45; pointer-events:none; }
  .step h2 { font-size:1.05rem; margin:0 0 12px; display:flex; gap:10px; align-items:center; }
  .num { display:inline-grid; place-items:center; width:26px; height:26px; border-radius:50%; background:var(--accent); color:#fff; font-size:.85rem; }
  .step.done .num { background:var(--ok); }
  label.field { display:block; font-weight:600; margin:10px 0 4px; }
  input[type=text], input[type=password] { width:100%; padding:10px 12px; border-radius:8px; border:1px solid var(--line); background:transparent; color:inherit; font:inherit; }
  .check { display:flex; gap:10px; align-items:flex-start; margin:8px 0; cursor:pointer; }
  .check input { margin-top:4px; width:18px; height:18px; accent-color:var(--accent); }
  .row { display:flex; gap:8px; margin-top:14px; flex-wrap:wrap; }
  button, a.btn { flex:1; text-align:center; padding:11px 14px; border-radius:8px; border:0; background:var(--accent); color:#fff; font:inherit; font-weight:600; text-decoration:none; cursor:pointer; }
  button.secondary, a.btn.secondary { background:var(--line); color:inherit; }
  button:disabled { opacity:.5; cursor:default; }
  .link { background:none; border:0; padding:0; color:var(--accent); font-weight:500; cursor:pointer; flex:none; }
  .msg { margin:10px 0 0; font-size:.95rem; }
  .msg.err { color:var(--err); }
  .msg.ok { color:var(--ok); }
  small, .muted { color:var(--muted); }
  small { display:block; margin-top:10px; }
  [hidden] { display:none !important; }
</style>
</head>
<body>
<main>
  <header>
    <h1>${escapeHtml(manifest.name)}</h1>
    <p>${escapeHtml(manifest.description)}</p>
  </header>

  <section class="step" id="step-login">
    <h2><span class="num">1</span> ${loginEnabled ? 'Přihlášení k Hiyori' : 'API klíč z Hiyori'}</h2>
    <form id="login-form"${loginEnabled ? '' : ' hidden'}>
      <label class="field" for="username">Uživatelské jméno</label>
      <input id="username" type="text" autocomplete="username" required>
      <label class="field" for="password">Heslo</label>
      <input id="password" type="password" autocomplete="current-password" required>
      <div class="row"><button id="login-btn" type="submit">Přihlásit se</button></div>
    </form>
    <form id="key-form"${loginEnabled ? ' hidden' : ''}>
      <label class="field" for="apikey">Hiyori API klíč</label>
      <input id="apikey" type="password" autocomplete="off" required>
      <div class="row"><button type="submit">Použít klíč</button></div>
    </form>
    <div class="row"${loginEnabled ? '' : ' hidden'}><button type="button" class="link" id="toggle-mode">Mám už API klíč</button></div>
    <p class="msg" id="login-msg" hidden></p>
    <small>${
      loginEnabled
        ? 'Heslo se použije jen k získání API klíče z Hiyori a nikam se neukládá. Přístup k API musí mít tvůj účet povolený od administrátorů Hiyori.'
        : 'API klíč ti vydají administrátoři Hiyori (později si ho vygeneruješ na svém profilu). Heslo k Hiyori sem nikdy nezadávej.'
    }</small>
  </section>

  <section class="step locked" id="step-settings">
    <h2><span class="num">2</span> Nastavení</h2>
    <div class="muted">Jazyky titulků</div>
    <label class="check"><input type="checkbox" name="lang" value="CZ" checked> Čeština</label>
    <label class="check"><input type="checkbox" name="lang" value="SK" checked> Slovenčina</label>
  </section>

  <section class="step locked" id="step-consent">
    <h2><span class="num">3</span> Souhlas</h2>
    <label class="check"><input type="checkbox" id="consent-use"> <span>Souhlasím, že addon bude s mým API klíčem vyhledávat a stahovat titulky z Hiyori.cz, a to jen k anime, které si pustím ve Stremiu.</span></label>
    <label class="check"><input type="checkbox" id="consent-link"> <span>Beru na vědomí, že odkaz na addon obsahuje můj API klíč. Nebudu ho nikomu posílat ani ho nikde zveřejňovat.</span></label>
    <div class="row"><button id="create-btn" type="button" disabled>Vytvořit odkaz</button></div>
  </section>

  <section class="step" id="step-result" hidden>
    <h2><span class="num">4</span> Hotovo</h2>
    <div class="row">
      <a class="btn" id="install" href="#">Nainstalovat do Stremia</a>
      <button class="secondary" id="copy" type="button">Kopírovat odkaz</button>
    </div>
    <p class="msg" id="result-msg" hidden></p>
    <small id="local-hint" hidden>Addon běží lokálně přes http. Ve Stremiu otevři <b>Addons</b>, vlož zkopírovaný odkaz do vyhledávání addonů a dej <b>Install</b>.</small>
    <small id="expiry"></small>
  </section>
</main>
<script>
  const base = ${JSON.stringify(baseUrl)};
  const isHttp = base.startsWith('http:');
  const $ = (id) => document.getElementById(id);
  let apiKey = '';
  let expiresAt = null;

  function show(el, text, kind) {
    el.textContent = text;
    el.className = 'msg ' + (kind || '');
    el.hidden = !text;
  }

  function encodeConfig(config) {
    const bytes = new TextEncoder().encode(JSON.stringify(config));
    return btoa(String.fromCharCode(...bytes)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  }

  function langs() {
    return [...document.querySelectorAll('input[name=lang]:checked')].map((i) => i.value);
  }

  function manifestUrl() {
    return base + '/' + encodeConfig({ apiKey, langs: langs() }) + '/manifest.json';
  }

  function unlock(message) {
    $('step-login').classList.add('done');
    $('step-settings').classList.remove('locked');
    $('step-consent').classList.remove('locked');
    show($('login-msg'), message, 'ok');
    update();
  }

  function update() {
    const ready = apiKey && langs().length > 0 && $('consent-use').checked && $('consent-link').checked;
    $('create-btn').disabled = !ready;
    if (!ready) $('step-result').hidden = true;
  }

  $('toggle-mode').addEventListener('click', () => {
    const keyMode = $('key-form').hidden;
    $('key-form').hidden = !keyMode;
    $('login-form').hidden = keyMode;
    $('toggle-mode').textContent = keyMode ? 'Přihlásit se jménem a heslem' : 'Mám už API klíč';
    show($('login-msg'), '');
  });

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('login-btn');
    btn.disabled = true;
    btn.textContent = 'Přihlašuji…';
    show($('login-msg'), '');
    try {
      const res = await fetch(base + '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: $('username').value, password: $('password').value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Přihlášení se nepovedlo.');
      apiKey = body.apiKey;
      expiresAt = body.expiresAt;
      $('password').value = '';
      unlock('Přihlášeno jako ' + $('username').value + '.');
    } catch (err) {
      show($('login-msg'), err.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Přihlásit se';
    }
  });

  $('key-form').addEventListener('submit', (e) => {
    e.preventDefault();
    apiKey = $('apikey').value.trim();
    expiresAt = null;
    if (apiKey) unlock('API klíč nastaven.');
  });

  document.querySelectorAll('input[name=lang], #consent-use, #consent-link').forEach((i) => i.addEventListener('change', update));

  $('create-btn').addEventListener('click', () => {
    const url = manifestUrl();
    $('install').href = isHttp ? '#' : url.replace(/^https:/, 'stremio:');
    $('install').textContent = isHttp ? 'Zkopírovat odkaz pro Stremio' : 'Nainstalovat do Stremia';
    $('copy').hidden = isHttp;
    $('local-hint').hidden = !isHttp;
    $('expiry').textContent = expiresAt
      ? 'API klíč platí do ' + new Date(expiresAt).toLocaleDateString('cs-CZ') + '. Potom si tady vytvoř nový odkaz.'
      : 'API klíč platí 3 měsíce od vytvoření. Potom si tady vytvoř nový odkaz.';
    $('step-result').hidden = false;
    $('step-result').scrollIntoView({ behavior: 'smooth' });
  });

  async function copyLink(button, label) {
    try {
      await navigator.clipboard.writeText(manifestUrl());
      button.textContent = 'Zkopírováno';
    } catch {
      show($('result-msg'), 'Kopírování se nepovedlo. Zkus to prosím znovu.', 'err');
    }
    setTimeout(() => (button.textContent = label), 1500);
  }
  $('install').addEventListener('click', (e) => {
    if (!isHttp) return;
    e.preventDefault();
    copyLink($('install'), 'Zkopírovat odkaz pro Stremio');
  });
  $('copy').addEventListener('click', () => copyLink($('copy'), 'Kopírovat odkaz'));

  // Otevřeno ze Stremia přes ozubené kolečko (/{config}/configure):
  // předvyplní klíč a jazyky z existujícího odkazu.
  (function prefill() {
    const segment = location.pathname.split('/').filter(Boolean)[0];
    if (!segment || segment === 'configure') return;
    try {
      const json = atob(segment.replace(/-/g, '+').replace(/_/g, '/'));
      const config = JSON.parse(new TextDecoder().decode(Uint8Array.from(json, (c) => c.charCodeAt(0))));
      if (!config.apiKey) return;
      apiKey = config.apiKey;
      if (Array.isArray(config.langs) && config.langs.length) {
        document.querySelectorAll('input[name=lang]').forEach((i) => (i.checked = config.langs.includes(i.value)));
      }
      unlock('Načteno nastavení nainstalovaného addonu.');
    } catch {
      // neplatná konfigurace v URL – začne se od přihlášení
    }
  })();
</script>
</body>
</html>`;
}
