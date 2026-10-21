# Handoff: project status

_Updated on 21 October 2026._

## Where we are

**Status:**

- The first complete version works locally: frontend, backend, tests and the Docker setup are done.
- Published on GitHub (https://github.com/ksenia-git-hub/site-ready) with a README and CI that passes.
- Deployed on Render Free: https://site-ready.onrender.com (password-protected). A 3-page scan of a real site took 1 min 41 s there (about 35 s locally).

### What was built and why

| What | Why |
|---|---|
| **Scan engine** (Playwright + Chromium) | Opens the site like a real browser, on desktop and on a phone, and follows the internal links. |
| **Link and image checks** | Find 404 pages and broken or oversized images before the client sees them. |
| **SEO checks** | Keep the site from launching invisible to search engines (noindex, robots.txt, title, sitemap…). |
| **Mobile checks** | Flag pages that look broken on a phone or scroll sideways. |
| **Technical checks** | Find JavaScript errors, files that fail to load and HTTPS/certificate problems. |
| **Leftover content checks** | Find what is left over from development: lorem ipsum, staging links, fake contacts, TODOs. |
| **Legal checks (EU/Italy)** | Privacy policy, cookie policy, cookie banner and VAT number (P.IVA), which are mandatory in Italy/EU. |
| **Legal checks (Russia)** | For Russian sites: 152-FZ consent in forms, foreign services that collect data, INN/OGRN for online shops, interface text only in a foreign language (168-FZ). |
| **Cookies before consent** | Detects Google Analytics, Meta Pixel & co. storing cookies before the visitor accepts: the most fined GDPR violation. |
| **Accessibility** (axe-core) | Checks that people with disabilities can use the site (European Accessibility Act). |
| **Desktop and phone screenshots** | Full-page screenshots shown in Figma-style device mock-ups inside the report. They scroll inside the screens, optionally together. |
| **Speed** | Server response, Largest Contentful Paint (LCP), Cumulative Layout Shift (CLS), weight and requests of each page, plus compression, caching and image formats. |
| **Quality score 0–100** | An immediate verdict that non-technical people understand too. See the details below. |
| **Score per category** | Each category tile has its own 0–100 score, and the bar shows that score. |
| **What to fix first** | The 3–5 problems that weigh most on the score, with a plain-language "why it matters" and a button that opens the problem in the list. |
| **Report with filters, search and PDF** | Makes it easy to work through the problems and to hand a clean document to the client. |
| **Italian, English, Russian** | The report can be shown in the client's language, even after the scan. |
| **Modern interface** (Tailwind + shadcn/ui) | Professional look, light/dark theme, works on a phone too. |
| **Stop scan, recent scans** | Stop a scan started by mistake; reopen recent reports from the home page. |
| **Demo sites with deliberate mistakes** | Try and test the app without a real site (`npm run demo-site`). |
| **98 automated tests + CI** | Make sure future changes don't break what already works. |

**How the score is computed:**

- It follows the approach of SEO audit tools such as Semrush, Ahrefs and SE Ranking.
- Weights: critical 12, warning 1.5, suggestion 0.25 (1–2 points per kind within a category).
- Each kind of problem counts once, scaled by the share of affected pages.
- Curve: 100·50/(50+penalty), so the score never reaches 0. A site scores 100 only when nothing is found.
- Scale: 90+ excellent, 75–89 good, 50–74 could be better, below 50 needs fixes.

**Score colors:** cool colors in the interface style, solid on the ring and the numbers, a gradient only on the bar.

| Verdict | Color |
|---|---|
| Excellent | indigo/violet |
| Good | blue |
| Could be better | cyan |
| Needs fixes | raspberry |

### Checks

| Category | Checks |
|---|---|
| Links | 404/410 (critical), 5xx errors, non-existent domain / timeout (30 s), links that work but answer after more than 10 s (warning "very slow page"), external links that block bots (info only) |
| Images | missing file, file > 500 KB, missing alt (alt="" accepted), image much larger than displayed |
| SEO | title missing / too short or long / duplicated, meta description, missing or multiple H1, missing `lang`, **forgotten noindex**, favicon, social preview (Open Graph), **robots.txt blocking everything**, missing sitemap, non-existent pages answering 200 |
| Mobile | missing meta viewport, horizontal scrolling at 375 px with the elements responsible |
| Speed | See the details below. |
| Technical | default server 404 page (no links back to the site), JavaScript errors, page files that fail to load (scripts, CSS, fonts), mixed content, no HTTPS, HTTP not redirecting to HTTPS, SSL certificate expiring (≤ 30 days) |
| Content | lorem ipsum, links or files from localhost / staging / local IPs, CMS demo text ("Hello world!"), fake e-mails and phone numbers, TODO/FIXME |
| Legal | privacy policy, cookie policy, cookie banner when trackers are present (GA, Meta Pixel, Yandex Metrica...), VAT number for Italian sites, **tracking cookies stored before consent** |
| Legal (Russia) | See the details below. |
| Accessibility | axe-core (contrast, unnamed buttons/links/fields, heading order, zoom disabled, ARIA, iframes, video…: about 25 translated rules, the others with axe's English text) + generic link text ("click here"). The report warns that it does not replace a manual audit. |

**Speed details:**

- Measured per page by the scan's own browser, **without network throttling**, so it will be slower on a mobile network.
- Thresholds follow Google's; twice the threshold is critical:
  - server response > 0.8 s;
  - LCP > 2.5 s;
  - CLS > 0.1;
  - page weight > 3 MB.
- Also flagged:
  - more than 100 requests;
  - text files without gzip/Brotli;
  - site files without browser caching;
  - JPG/PNG > 100 KB.
- Thresholds are in `SPEED_THRESHOLDS` (shared).

**Russian legal checks** run only for sites in Russian or on a .ru/.su/.рф domain. They flag:

- Forms that ask for personal data:
  - without 152-FZ consent;
  - with the consent pre-ticked;
  - with consent given only as a sentence: since 1 Sep 2025 it must be separate.
- Foreign analytics services (GA, GTM, Meta Pixel, Hotjar…). Since 1 Jul 2025 collecting data into foreign databases is banned. The interpretation is debated, so this is a warning.
- A consent checkbox the browser cannot tick the way a visitor would (disabled, hidden or covered): a warning.
- Shops without INN/OGRN.
- Menus, buttons and headings only in a foreign language on Russian pages (168-FZ, from 1 Mar 2026). Registered trademarks may be an exception.

The Italian VAT number is not required on Russian sites.

**How cookies before consent are detected:** the browser never clicks "Accept". Cookies from about 13 known services are recognized by name, and technical cookies are ignored.

### Verification

- `npm test`: 98 tests pass.
  - The end-to-end tests scan the demo sites with Chromium and find exactly the planted problems (35 on the Italian site), with screenshots of every page. A second end-to-end test covers the Russian shop.
  - The translation tests check that the three languages have the same keys, plural forms and placeholders.
- `npm run typecheck` and `npm run build` pass.
- Languages checked in the browser:
  - switching with the flags works;
  - the choice is remembered after a reload;
  - a German browser falls back to English, an Italian one gets Italian.

  The Russian and English translations were written by the AI and should be proofread by a native speaker.
- Manual browser checks:
  - a scan of the demo site takes about 3 seconds;
  - no console errors;
  - no horizontal scrolling on mobile;
  - light and dark theme and the print view work.

## How to try it

```bash
npm run demo-site   # terminal 1: site with deliberate mistakes on :4000 and Russian shop on :4001
npm run dev         # terminal 2: open http://localhost:5173 and scan localhost:4000
```

## Deployment

- **Password** (`APP_PASSWORD`):
  - when set, the app asks for a password (one shared by all colleagues);
  - the session is a signed HttpOnly cookie valid for 30 days;
  - at most 10 wrong attempts in 15 minutes per IP;
  - there is a "Log out" button.

  Without a password the app is open, which is fine for local use only.
- **Internal-network blocking** (`BLOCK_PRIVATE_TARGETS=true`):
  - refuses localhost, 10.x, 172.16–31.x, 192.168.x, 169.254.x (cloud metadata) and similar;
  - applies to the starting URL and to everything the scan opens: pages, redirects, files, links and images.
- **Limits:** at most 2 concurrent scans per visitor and 20 in the queue.
- **Dockerfile:**
  - contains Node 24 and Playwright's Chromium, builds the client, runs as a non-root user, health check on `/api/health`;
  - already sets `HOST=0.0.0.0`, `BLOCK_PRIVATE_TARGETS=true` and `TRUST_PROXY=true`;
  - on the hosting only `APP_PASSWORD` (and optionally `SESSION_SECRET`) needs to be set.

  Docker is not installed on the development PC: the CI builds the image and checks `/api/health`.
- Recommended memory: **2 GB** (Chromium and full-page screenshots).
- **Render Free** (chosen to keep it free): [render.yaml](render.yaml) creates the service with `LOW_MEMORY=true`.
  - Limits on the 512 MB instance:
    - at most 3 pages per scan;
    - full-page screenshots capped at 5 000 px, phone rendered at 1×, JPEG quality 45;
    - the content of embedded frames (maps, videos, widgets) and video/audio files is not loaded. On a real site three embedded Yandex maps took one page from ~190 MB to 1.3 GB, which crashed the free instance (HTTP 502). The iframe elements stay in the page and are still checked;
    - the JavaScript heap of the scanned page is capped (160 MB): a page that is too heavy fails on its own instead of taking the server down;
    - 60 s page timeout;
    - screenshots kept for the last 3 reports only.
  - The page-count menu shows only what the server allows (`maxPages` in `/api/session`).
  - The instance sleeps after 15 minutes without visitors; waking up takes about a minute.
  - If the server becomes unreachable during a scan (the hosting restarts it), the interface keeps waiting for up to 2 minutes. If the scan is lost, it explains that the site was probably too heavy for the demo server.
  - Measured locally (Chromium memory, 3 pages): about 190 MB for a portfolio site with maps, 380 MB for apple.com/it (very heavy JavaScript).
  - New commits are deployed only after CI passes (`autoDeployTrigger: checksPass`).

## Known limitations

- The queue is in memory: reports are lost on every restart or redeploy, and only one scan runs at a time.
- The internal-network guard checks the IP at DNS resolution time. A targeted DNS-rebinding attack is still theoretically possible.
- Links to pages the browser already visited are not checked again over HTTP. The "Links checked" count excludes them.
- Fixed limits: 500 links and 300 images per scan. Beyond that, the report shows a warning.
- Speed is measured without mobile network throttling and without Lighthouse: it is a guide, not an official Google score.
- Some checks are heuristic and can be wrong:
  - the cookie banner is recognized by ids/classes containing "cookie"/"consent" or by known platforms;
  - the privacy and cookie policy are searched for in the links and text of the analyzed pages;
  - the VAT number is searched for as "P.IVA" followed by 11 digits.

## Next steps

1. **GitHub:** done: https://github.com/ksenia-git-hub/site-ready (public, commits signed with the GitHub noreply address).
2. **Hosting:** done, Render Free via `render.yaml`. For faster scans and more pages, switch the plan to a paid instance and remove `LOW_MEMORY`.
3. Proposed features not done yet:
   - PDF with the studio's logo and details;
   - saved reports (database) and history with a before/after comparison;
   - tooltips for terms (LCP, CLS, noindex…) and a "not a problem — hide" button.
4. The main JS bundle is about 530 KB (169 KB compressed). It is almost all React, Radix and i18next, which is normal; Vite only shows a warning.
