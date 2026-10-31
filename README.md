# Hiyorio

Neoficiální Stremio addon, který k anime nabízí české a slovenské titulky z [Hiyori.cz](https://hiyori.cz/) přes jejich [API v2](https://api.hiyori.cz/).

> Nejde o oficiální addon Hiyori. Každý uživatel potřebuje **vlastní API klíč** s přístupem schváleným administrátory Hiyori.

## Co umí

- Funguje s ID z **Cinemety / IMDb** (`tt…:sezóna:epizoda`), z **Anime Kitsu** addonu (`kitsu:…`) a s ID `mal:` / `anilist:`.
- Převádí ID na MyAnimeList ID pomocí komunitní databáze [Fribb/anime-lists](https://github.com/Fribb/anime-lists). Ukládá si ji do `data/` a jednou denně ji obnovuje. U Kitsu se jako záloha použije Kitsu API.
- Rozdělené sezóny řeší takto: když jedné IMDb sezóně odpovídá víc MAL záznamů, použije `episode_offset` z anime-lists (Bleach TYBW S17E50 → Kashin-tan E10). Pokud offset chybí, seřadí části podle data vysílání a epizodu přepočítá podle počtu epizod z Hiyori (AoT S3E13 → druhá část, E1).
- Titulky stahuje přes Hiyori API a převádí je na **SRT v UTF-8**. Umí ASS/SSA, VTT, windows-1250 i ZIP archivy.
- Titulky k releasu, který odpovídá názvu přehrávaného souboru, řadí na začátek seznamu.
- Hlídá JWT token (obnovuje ho před uplynutím 30 minut), dodržuje rate limit (`Retry-After`) a cachuje odpovědi, aby šetřil limit.

## Spuštění

Potřebuješ Node.js 22.15 nebo novější.

```bash
npm install
npm start
```

Pak otevři <http://127.0.0.1:7000/configure> a projdi čtyři kroky:

1. **API klíč z Hiyori**: vložíš svůj klíč. Pokud server běží s `ENABLE_LOGIN=1`, můžeš se místo toho přihlásit jménem a heslem a server si klíč vyžádá sám.
2. **Nastavení**: jazyky titulků (čeština, slovenština).
3. **Souhlas**: použití klíče a upozornění, že odkaz addonu klíč obsahuje.
4. **Vytvořit odkaz**: **Nainstalovat do Stremia** (na HTTPS serveru), nebo zkopírovat odkaz.

Když ve Stremiu u nainstalovaného addonu klikneš na ozubené kolečko, stránka se otevře s předvyplněným nastavením.

### Běh na pozadí (Windows)

Aby addon fungoval pokaždé, když pustíš Stremio, a nemusel jsi nic spouštět ručně:

```bash
npm run autostart
npm run bg:start
```

`autostart` přidá zástupce do složky *Po spuštění*, takže se server spustí skrytě po každém přihlášení do Windows. Když spadne, za 10 s se spustí znovu. `bg:start` ho pustí hned teď.

| Příkaz | Co dělá |
|---|---|
| `npm run bg:start` | spustí server skrytě na pozadí |
| `npm run bg:stop` | zastaví ho |
| `npm run bg:status` | vypíše, jestli běží a jestli je zapnutý autostart |
| `npm run autostart:remove` | vypne spouštění po přihlášení |

Log serveru je v `logs/server.log`. Po aktualizaci kódu spusť `npm run bg:stop` a pak `npm run bg:start`.

### API klíč

Když už máš od Hiyori povolený přístup, spusť `npm run get-key`. Skript se zeptá na jméno a heslo k Hiyori a klíč uloží do `.env`. Heslo se nikam neukládá a `.env` je v `.gitignore`.

### Testy

- `npm test` spustí unit testy (převod titulků, rozklad ID).
- `npm run smoke` spustí ostrý test proti Hiyori s klíčem z `.env`. Projde posledních pár přidaných titulků celou cestou addonu.

Všechny skripty spouštějí Node s `--use-system-ca`, takže fungují i s antivirem, který kontroluje HTTPS (např. Avast Web Shield).

### Proměnné prostředí

| Proměnná | Výchozí | Popis |
|---|---|---|
| `PORT` | `7000` | Port serveru |
| `PUBLIC_URL` | podle požadavku | Veřejná adresa addonu, např. `https://hiyori-addon.example.com`. Nastav ji, když běžíš za proxy. |
| `ENABLE_LOGIN` | vypnuto | `1` zapne přihlášení jménem a heslem k Hiyori (jen na důvěryhodném serveru) |
| `ADDON_ID`, `ADDON_NAME` | `community.hiyorio`, `Hiyorio` | ID a název addonu ve Stremiu |
| `HIYORI_API_URL` | `https://api.hiyori.cz` | Adresa Hiyori API |
| `DATA_DIR` | `./data` | Kam se ukládá mapovací databáze |

## Nasazení

Návod pro lokální beta test, vlastní server (Docker) i hosting je v [docs/NASAZENI.md](docs/NASAZENI.md).

## Jak to funguje

```
Stremio ──GET /{config}/subtitles/series/kitsu:7442:5.json──▶ addon
addon: kitsu:7442 ─(anime-lists)─▶ MAL 16498 ─(GET /v2/anime/mal/16498)─▶ Hiyori anime
addon: GET /v2/subtitles/anime/{id} → filtr na epizodu 5 → seznam URL
Stremio ──GET /{config}/sub/{id}.srt──▶ addon ─(GET /v2/subtitles/{id}/download + Bearer)─▶ SRT
```

`{config}` je base64url JSON `{"apiKey":"…"}`. Stremio sám neumí poslat autorizační hlavičku, a proto addon soubory s titulky stahuje sám a předává je dál.

Potřebné scopes na Hiyori: `anime.read`, `subtitles.read` a `subtitles.download`.

## Známá omezení

- **API klíč je v URL addonu.** Kdo má odkaz na nainstalovaný addon, má i klíč. Odkaz proto nikomu neposílej. Klíč platí 3 měsíce, potom addon nainstaluj znovu.
- Při převodu z ASS se ztratí styly, pozicování a typesety.
- Titulky, které jsou na Hiyori jen jako odkaz na externí web (vyplněné `url`), stáhnout nejdou, a addon je proto vůbec nenabízí.
- Mapování IMDb sezón nemusí sedět u seriálů, kde se TVDB/TMDB a MAL dělí na sezóny výrazně jinak.
- Neplatný klíč se ve Stremiu neprojeví chybou, seznam titulků je prostě prázdný. Chyba se objeví jen v logu serveru.
