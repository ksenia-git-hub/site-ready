# Site Ready

Nome dell'app mostrato agli utenti: «Site Ready» in italiano e inglese, «Сайт Готов» in russo (chiave `app.name`). La cartella e i pacchetti restano `website-qa-assistant`.

Strumento che controlla un sito prima della consegna al cliente: link, immagini, SEO, mobile, tecnico, contenuti dimenticati, legale (UE/Italia e Russia) e accessibilità. Produce un report con punteggio, screenshot e PDF, in italiano, inglese e russo.

## Comandi

```bash
npm run dev          # API (porta 3000) + Vite (porta 5173) insieme; aprire http://localhost:5173
npm test             # tutti i test (vitest), compreso uno che avvia Chromium davvero
npm run typecheck    # tsc su tutti i workspace
npm run build        # compila il client in client/dist
npm start            # solo server; se client/dist esiste serve anche l'interfaccia su :3000
npm run demo-site    # siti di prova con errori voluti: http://localhost:4000 (italiano) e :4001 (negozio russo)
```

Primo setup su una macchina nuova: `npm install`, poi `npx playwright install chromium`.

Su questa macchina Windows `node` potrebbe non essere nel PATH della sessione: in quel caso usare `C:\Program Files\nodejs\node.exe` oppure anteporre `C:\Program Files\nodejs` al PATH.

## Struttura

Monorepo con npm workspaces, Node ≥ 24, TypeScript.

- `shared/src/index.ts`: contratto dei dati tra server e client (`Issue`, `ScanReport`, `ScanJobView`, `CreateScanRequest`...). Se cambia un tipo qui, aggiornare entrambi i lati.
- `server/` (Fastify):
  - `src/app.ts`: `buildApp()` con le rotte `GET /api/health`, `POST /api/scans` (risponde 202 con `{ id }`), `GET /api/scans/:id`, `POST /api/scans/:id/cancel` (ferma una scansione in coda o in corso; 409 se è già finita), `GET /api/scans/:id/screenshots/:page/:device` (JPEG), più il servizio di `client/dist` (file letti dal disco a ogni richiesta; un file mancante dà 404, non index.html).
  - `src/scan-queue.ts`: coda in memoria, una scansione alla volta (la scansione in corso riceve un `AbortSignal`: lo scanner chiude il browser e lancia `ScanCancelledError`), tiene gli ultimi 50 job, ma gli screenshot solo degli ultimi 10 perché occupano molta memoria. Si perde tutto al riavvio.
  - `src/scan/scanner.ts`: `runScan`. Visita in ampiezza fino a `maxPages` pagine dello stesso dominio con Playwright, in contesto desktop (1366px) e mobile (375px), poi controlla via HTTP tutti i link e le immagini trovati.
  - Regole **pure**, senza rete né browser, che trasformano i dati raccolti in `Issue`:
    - `src/scan/checks.ts`: link, immagini, SEO della pagina, mobile;
    - `src/scan/handover-checks.ts`: tecnico (errori JS, file falliti, mixed content), contenuti dimenticati (lorem ipsum, link a localhost/staging, testi demo dei CMS, contatti finti, TODO), legale (privacy, cookie policy, banner cookie se ci sono tracker, P.IVA per i siti italiani; per i siti russi — lang ru o dominio .ru/.su/.рф — consenso 152-ФЗ nei moduli, servizi esteri di analisi, ИНН/ОГРН dei negozi).
    - `src/scan/cookie-checks.ts`: cookie di tracciamento salvati prima del consenso (il browser non clicca mai «Accetta»).
  - `src/scan/accessibility.ts`: inietta axe-core nella pagina (dopo lo screenshot) e mappa le regole note sui codici `accessibility.*`; le regole senza testi tradotti diventano `accessibility.other` con il testo inglese di axe. Alcune regole sono disattivate perché già coperte o troppo rumorose (`DISABLED_RULES`).
  - `src/scan/performance-checks.ts`: velocità (soglie condivise in `SPEED_THRESHOLDS` di `shared`). I dati vengono da `readSpeed` (Performance API, letta prima di scorrere la pagina) e da `watchResources` in `scanner.ts` (protocollo DevTools, cache disattivata). Lo screenshot del telefono è a pagina intera (max 15 000 px), dopo `scrollThrough` per caricare le immagini lazy.
  - `src/scan/site-checks.ts`: controlli sull'intero sito che usano la rete (robots.txt, sitemap, favicon, risposta 404, HTTPS, scadenza del certificato). HTTPS e certificato vengono saltati per localhost e host di staging.
  - Il browser raccoglie per ogni pagina i dati del DOM (`extract.ts`) e quelli di rete e console (`watchNetwork` in `scanner.ts`), e scatta uno screenshot desktop e uno mobile.
  - `src/scan/extract.ts`: funzioni eseguite nel browser con `page.evaluate`. Non possono usare import o variabili esterne.
  - `src/scan/http-check.ts`: HEAD con fallback a GET, timeout, limite di concorrenza.
- `client/` (React 19 + Vite + **Tailwind CSS v4 + shadcn/ui**, icone **lucide-react**, tema con **next-themes**, notifiche con **sonner**):
  - `App.tsx` gestisce gli stati home → progresso (polling ogni 1,5 s) → report. Il report viene caricato a parte (`lazy`).
  - Le schermate sono in `src/components/`: `Home`, `ScanProgress`, `Report` (con `ScoreRing` e `IssueGroup`), più `Header` con `ThemeMenu` e `LanguageMenu`.
  - `src/components/ui/` contiene i componenti shadcn generati: **non modificarli a mano**, aggiungine altri con `npx shadcn@latest add <nome>` dalla cartella `client`.
  - `src/lib/`: `score.ts` (punteggio 0–100 e giudizio: per tipo di problema e quota di pagine coinvolte, suggerimenti esclusi, vedi i commenti nel file), `recent-scans.ts` (ultime scansioni in localStorage), `visuals.ts` (icone e colori per categoria e gravità).
  - `src/format.ts` trasforma i codici del server in testo.
- Colori: i token shadcn sono in `src/styles.css` (primario indaco), più `critical` / `warning` / `info` / `success` utilizzabili come classi Tailwind (`text-critical`, `bg-warning/10`...). Le classi `no-print` e `print-avoid-break` controllano la stampa/PDF.
- `client/src/i18n/`: i18next + react-i18next, lingue **it** (riferimento), **en**, **ru**. I testi sono in `locales/*.json`. La lingua si sceglie dal menu con le bandiere (file SVG di `flag-icons`), viene ricordata in localStorage (`qa-language`), e se il browser è in un'altra lingua si usa l'inglese. Anche il tema viene ricordato (`qa-theme`).

## Convenzioni

- Il server esegue i `.ts` **direttamente** con il type stripping di Node, senza build. Quindi niente `enum`, `namespace` o parameter properties nei costruttori (`erasableSyntaxOnly`). Gli import interni usano l'estensione `.ts`.
- **Il server non manda mai frasi**, solo codici e valori: `Issue.code` + `params`, `ScanProgress.step`, `ScanWarning.code`, `Failure.reason`, `ApiError.code`. Tutte le frasi sono nel client, tradotte. Commenti e nomi nel codice sono in inglese.
- Per un **nuovo controllo**: aggiungi il codice in `ISSUE_CODES` (shared), produci l'issue nel file di regole giusto, poi scrivi `title` / `description` / `fix` in **tutte e tre** le lingue (`issues.<categoria>.<nome>`).
  - I parametri array (`foundOn`, `pages`, `images`, `elements`) vengono mostrati come liste sotto la descrizione; un array con un nome nuovo va aggiunto in `ISSUE_LISTS` in `client/src/format.ts` e in `lists.*`.
  - `count` gestisce i plurali: `_one`/`_other` in it/en, `_one`/`_few`/`_many`/`_other` in ru.
- `client/src/i18n/locales.test.ts` fallisce se manca una chiave, una forma di plurale o un segnaposto in una lingua, o se un codice del server non ha testo.
- Gravità: `critical` = da correggere prima della consegna; `warning` = da correggere; `info` = suggerimento. I siti esterni che bloccano i bot (401/403/429/999) sono `info`, non errori.
- Nei test si usa uno scanner finto passato a `buildApp({ scanner })`. Le regole nuove si testano nel file di test della regola (`checks`, `handover-checks`, `cookie-checks`, `accessibility`); la pagina di esempio senza problemi è in `server/test/fixtures.ts`. Se un controllo si può dimostrare sul sito demo, aggiungere il caso in `server/test/demo-site.ts` e in `scanner.test.ts`.
- Il client parla solo con `/api/...`: in sviluppo ci pensa il proxy di Vite, in produzione lo stesso server. Niente CORS.
- I segreti vanno in `.env` (ignorato da git); `.env.example` documenta le variabili.
