# Site Ready

App name shown to users: "Site Ready" in Italian and English, «Сайт Готов» in Russian (key `app.name`). The folder and the packages keep the name `website-qa-assistant`.

A tool that checks a website before it is handed over to the client. It covers links, images, SEO, mobile, speed, technical problems, leftover content, legal requirements (EU/Italy and Russia) and accessibility. It produces a report with a score, screenshots and a PDF view, in Italian, English and Russian.

## Commands

```bash
npm run dev          # API (port 3000) + Vite (port 5173) together; open http://localhost:5173
npm test             # all tests (vitest), including some that start a real Chromium
npm run typecheck    # tsc on every workspace
npm run build        # builds the client into client/dist
npm start            # server only; when client/dist exists it also serves the interface on :3000
npm run demo-site    # demo sites with deliberate mistakes: http://localhost:4000 (Italian) and :4001 (Russian shop)
```

First setup on a new machine: `npm install`, then `npx playwright install chromium`.

On the author's Windows machine `node` may not be on the session PATH. In that case use `C:\Program Files\nodejs\node.exe` or prepend `C:\Program Files\nodejs` to PATH; in PowerShell call `npm.cmd`, because the execution policy blocks `npm.ps1`.

## Structure

Monorepo with npm workspaces, Node ≥ 24, TypeScript. CI is in `.github/workflows/ci.yml`: typecheck, tests, build and a Docker build.

- `shared/src/index.ts`: the data contract between server and client (`Issue`, `ScanReport`, `ScanJobView`, `CreateScanRequest`...). When a type changes here, update both sides.
- `server/` (Fastify):
  - `src/app.ts`: `buildApp()` with these routes:
    - `GET /api/health`;
    - `POST /api/scans` (answers 202 with `{ id }`);
    - `GET /api/scans/:id`;
    - `POST /api/scans/:id/cancel` (stops a queued or running scan; 409 if it already finished);
    - `GET /api/scans/:id/screenshots/:page/:device` (JPEG);
    - `client/dist` as static files, read from disk on every request. A missing file gives 404, not index.html.
  - `src/auth.ts`: a single password (`APP_PASSWORD`), a signed session cookie and a limit on login attempts. When the password is set, every `/api/*` route except `health`, `session`, `login` and `logout` answers 401 `unauthorized` without the cookie.
  - `src/scan/network-guard.ts`: with `BLOCK_PRIVATE_TARGETS=true` it blocks internal-network addresses in three places: the starting URL in the API, the browser via `context.route`, and the link and image checks. It must stay on for any public server.
  - `src/scan-queue.ts`: in-memory queue, one scan at a time.
    - The running scan gets an `AbortSignal`: the scanner closes the browser and throws `ScanCancelledError`.
    - It keeps the last 50 jobs, but screenshots only for the last 10, because they take a lot of memory.
    - Everything is lost on restart.
  - `src/scan/scanner.ts`: `runScan`. It visits up to `maxPages` pages of the same domain breadth-first with Playwright, in a desktop (1366 px) and a mobile (375 px) context. Then it checks every link and image found over HTTP.
  - **Pure** rules, with no network and no browser, turn the collected data into `Issue`s:
    - `src/scan/checks.ts`: links, images, page SEO, mobile.
    - `src/scan/handover-checks.ts`:
      - technical: JS errors, failed files, mixed content;
      - leftover content: lorem ipsum, links to localhost/staging, CMS demo text, fake contacts, TODO;
      - legal: privacy, cookie policy, a cookie banner when trackers are present, the VAT number for Italian sites;
      - Russian sites (lang ru or a .ru/.su/.рф domain): 152-FZ consent in forms, foreign analytics services, INN/OGRN for shops.
    - `src/scan/cookie-checks.ts`: tracking cookies stored before consent. The browser never clicks "Accept".
  - `src/scan/accessibility.ts`: injects axe-core into the page (after the screenshot) and maps known rules to `accessibility.*` codes. Rules without translated texts become `accessibility.other` with axe's English text. Some rules are disabled because they are already covered or too noisy (`DISABLED_RULES`).
  - `src/scan/performance-checks.ts`: speed. Thresholds are shared in `SPEED_THRESHOLDS` in `shared`.
    - The data comes from `readSpeed` (the Performance API, read before scrolling the page) and from `watchResources` in `scanner.ts` (the DevTools protocol, cache disabled).
    - Screenshots are full-page (max 15 000 px), taken after `scrollThrough` so lazy images load.
  - `src/scan/site-checks.ts`: site-wide checks that use the network: robots.txt, sitemap, favicon, 404 response, HTTPS, certificate expiry. HTTPS and the certificate are skipped for localhost and staging hosts.
  - For each page the browser collects DOM data (`extract.ts`) and network and console data (`watchNetwork` in `scanner.ts`), and takes one desktop and one mobile screenshot.
  - `src/scan/extract.ts`: functions run in the browser with `page.evaluate`. They cannot use imports or outer variables.
  - `src/scan/http-check.ts`: HEAD with a GET fallback, timeout and a concurrency limit.
- `client/` (React 19 + Vite + **Tailwind CSS v4 + shadcn/ui**, icons from **lucide-react**, theme with **next-themes**, toasts with **sonner**):
  - `App.tsx` handles the states: login (when required) → home → progress (polling every 1.5 s) → report. The report is loaded separately (`lazy`).
  - Screens live in `src/components/`:
    - `Login`, `Home`, `ScanProgress`;
    - `Report`, with `ScoreRing`, `PriorityFixes`, `IssueGroup` and `PageGallery`;
    - `Header`, with `ThemeMenu` and `LanguageMenu`.
  - `src/components/ui/` holds the generated shadcn components: **do not edit them by hand**. Add new ones with `npx shadcn@latest add <name>` from the `client` folder.
  - `src/lib/`:
    - `score.ts`: the 0–100 score and verdict. It works per problem kind and share of affected pages; see the comments in the file;
    - `recent-scans.ts`: recent scans in localStorage;
    - `visuals.ts`: icons and colors for categories and severities.
  - `src/format.ts` turns server codes into text.
- Colors: the shadcn tokens are in `src/styles.css` (indigo primary). `critical` / `warning` / `info` / `success` are also available as Tailwind classes (`text-critical`, `bg-warning/10`...). The `no-print` and `print-avoid-break` classes control printing and the PDF.
- `client/src/i18n/`: i18next + react-i18next, languages **it** (reference), **en** and **ru**. Texts are in `locales/*.json`.
  - The language is chosen from the flag menu (SVG files from `flag-icons`) and remembered in localStorage (`qa-language`). If the browser is in another language, English is used.
  - The theme is remembered too (`qa-theme`).

## Conventions

- The server runs `.ts` files **directly** with Node's type stripping, without a build. So no `enum`, `namespace` or constructor parameter properties (`erasableSyntaxOnly`). Internal imports use the `.ts` extension.
- **The server never sends sentences**, only codes and values: `Issue.code` + `params`, `ScanProgress.step`, `ScanWarning.code`, `Failure.reason`, `ApiError.code`. Every sentence lives in the client, translated. Comments and names in the code are in English.
- For a **new check**:
  1. add the code to `ISSUE_CODES` (shared);
  2. produce the issue in the right rules file;
  3. write `title` / `description` / `fix` in **all three** languages (`issues.<category>.<name>`).

  Notes:
  - Array parameters (`foundOn`, `pages`, `images`, `elements`...) are shown as lists under the description. An array with a new name must be added to `ISSUE_LISTS` in `client/src/format.ts` and to `lists.*`.
  - `count` drives plurals: `_one`/`_other` in it/en, `_one`/`_few`/`_many`/`_other` in ru.
- `client/src/i18n/locales.test.ts` fails if a language is missing a key, a plural form or a placeholder, or if a server code has no text.
- Severity:
  - `critical`: fix before handover;
  - `warning`: should be fixed;
  - `info`: a suggestion.

  External sites that block bots (401/403/429/999) are `info`, not errors.
- Tests:
  - API tests use a fake scanner passed to `buildApp({ scanner })`.
  - New rules are tested in the rule's own test file (`checks`, `handover-checks`, `cookie-checks`, `accessibility`, `performance-checks`).
  - The sample page with no problems is in `server/test/fixtures.ts`.
  - If a check can be shown on the demo site, add the case to `server/test/demo-site.ts` and to `scanner.test.ts`.
- The client only talks to `/api/...`: the Vite proxy handles it in development, the same server in production. No CORS.
- Secrets go in `.env` (git-ignored); `.env.example` documents the variables.
- Production uses the `Dockerfile`, which sets HOST, BLOCK_PRIVATE_TARGETS and TRUST_PROXY. On the hosting only `APP_PASSWORD` needs to be set. `render.yaml` deploys to Render Free with `LOW_MEMORY=true` (3 pages per scan, lighter screenshots, see `CaptureSettings` in `scanner.ts`).
