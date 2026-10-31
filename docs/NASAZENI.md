# Nasazení a beta test

Návod pro toho, kdo chce Hiyorio provozovat: lokálně na vyzkoušení, nebo na serveru pro ostatní.

## Jak to celé funguje

```
Uživatel ──(Stremio)──▶ server Hiyorio ──(API klíč uživatele)──▶ api.hiyori.cz
```

- Server **nemá vlastní klíč**. Uživatel na konfigurační stránce (`/configure`) vloží svůj API klíč. Pokud provozovatel zapne `ENABLE_LOGIN=1` (a vždy, když addon běží na vlastním počítači), může se místo toho přihlásit jménem a heslem k Hiyori a server přes `POST /v2/login/get-api-key` získá jeho API klíč sám a ten se uloží do URL addonu (`/{config}/manifest.json`, kde `config` je base64url JSON `{"apiKey":"…","langs":["CZ","SK"]}`). Heslo se neukládá ani neloguje.
- Server s tímto klíčem volá Hiyori API, převádí ID ze Stremia na MAL ID a stahuje titulky. Stremio totiž neumí poslat hlavičku `Authorization`.
- Server si nic neukládá do databáze. Drží jen cache v paměti a mapovací databázi anime ([Fribb/anime-lists](https://github.com/Fribb/anime-lists), ~7,5 MB) v `DATA_DIR`. Tu si sám stáhne při startu a jednou denně ji obnoví.

## Možnost 1: lokálně na vyzkoušení (5 minut)

Potřebuješ Node.js 22.15+ a Stremio na stejném počítači.

```bash
git clone https://github.com/bowlik/Hiyorio.git
cd Hiyorio
npm install
npm start
```

1. Otevři <http://127.0.0.1:7000/configure> a přihlas se jménem a heslem k Hiyori, nebo vlož API klíč. Na vlastním počítači je přihlášení zapnuté vždy.
2. Zvol jazyky, odsouhlas podmínky a klikni na **Vytvořit odkaz** a pak na **Zkopírovat odkaz pro Stremio**.
3. Ve Stremiu: **Addons** → vlož odkaz do vyhledávání addonů → **Install**.

Lokálně to běží přes `http`, takže to funguje jen ve Stremiu na tomtéž počítači. Stremio na mobilu nebo TV potřebuje `https`.

## Možnost 2: vlastní server (Docker)

```bash
docker build -t hiyorio .
docker run -d --name hiyorio --restart unless-stopped \
  -p 127.0.0.1:7000:7000 \
  -e PUBLIC_URL=https://stremio.example.cz \
  -e TRUST_PROXY=1 \
  -v hiyorio-data:/app/data \
  hiyorio
```

Před kontejner dej reverzní proxy s HTTPS (nginx, Caddy, Traefik…), která přeposílá na `127.0.0.1:7000`. Příklad pro Caddy:

```
stremio.example.cz {
    reverse_proxy 127.0.0.1:7000
    log {
        output discard
    }
}
```

**HTTPS je povinné.** V odkazech je API klíč uživatele a se `ENABLE_LOGIN=1` jde na server i heslo k Hiyori, takže veřejný server nesmí běžet přes `http`.

**Pozor na logy přístupů.** V cestě každého požadavku je zakódovaný API klíč uživatele (`/eyJhcGlLZXki…/subtitles/…`). Access logy proxy proto vypni, nebo z nich cestu odstraň. Samotný server cesty neloguje, vypisuje jen Stremio ID a počet nalezených titulků.

Bez Dockeru stačí `npm ci --omit=dev` a `node src/server.js`, například jako služba systemd.

## Možnost 3: hosting (Koyeb, Render, Fly.io…)

1. Propoj hosting s GitHub repozitářem. Hosting najde `Dockerfile` sám.
2. Nastav proměnnou `PUBLIC_URL` na adresu, kterou ti hosting přidělí (např. `https://hiyorio-xyz.koyeb.app`).
3. Port `7000`, health check `GET /health`.
4. Po každém pushi do `main` se addon nasadí znovu.

Na Renderu ve free tarifu server po 15 minutách nečinnosti usne a první načtení titulků pak trvá ~30 s. Koyeb free tarif neusíná.

## Proměnné prostředí

| Proměnná | Výchozí | Popis |
|---|---|---|
| `PORT` | `7000` | Port serveru |
| `PUBLIC_URL` | podle požadavku | Veřejná adresa, ze které se skládají odkazy na titulky. **Na serveru za proxy ji nastav.** |
| `ADDON_ID` | `community.hiyorio` | ID addonu ve Stremiu. Při změně ho uživatelé musí nainstalovat znovu. |
| `ADDON_NAME` | `Hiyorio` | Název addonu ve Stremiu (např. pro oficiální verzi) |
| `ENABLE_LOGIN` | vypnuto | `1` zapne přihlášení jménem a heslem k Hiyori na konfigurační stránce. **Zapínej jen na serveru, kterému uživatelé mohou heslo svěřit** (ideálně provozovaném přímo Hiyori). Bez toho stránka nabízí jen vložení API klíče. Požadavky přímo z `127.0.0.1`/`localhost` (bez `X-Forwarded-For`) mají přihlášení vždy. |
| `TRUST_PROXY` | – | Za reverzní proxy nastav `1`, aby limit pokusů o přihlášení (10 za 15 min na IP) počítal se skutečnou IP uživatele |
| `HIYORI_API_URL` | `https://api.hiyori.cz` | Adresa Hiyori API |
| `DATA_DIR` | `./data` | Kam se ukládá mapovací databáze |

## Kontrola, že server běží

- `GET /health` vrátí `{"status":"ok","version":"0.1.0","mapping":{"loaded":true,"anime":30909}}`.
- `GET /manifest.json` vrátí manifest addonu.
- `GET /configure` je stránka pro uživatele.

## Co z toho plyne pro Hiyori API

- **Rate limit:** všechny požadavky jdou z IP adresy serveru, ale každý s klíčem svého uživatele. Pokud limit platí na IP, sdílí ho všichni uživatelé jedné instance. Server cachuje anime 6 h, seznamy titulků 15 min a stažené titulky 6 h.
- **Potřebné scopes pro uživatele:** `anime.read`, `subtitles.read` a `subtitles.download`.
- **Platnost klíče:** 3 měsíce. Potom musí uživatel addon nainstalovat znovu s novým klíčem.
