// A tiny site with known, deliberate problems. Used by the scanner test and for trying
// the app by hand: `npm run demo-site`, then scan http://localhost:4000 (and the Russian shop on :4001)
import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';

const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** ~60 KB of JavaScript that compresses very well: a typical bundle served without gzip. */
const APP_JS = '/* demo bundle */\n' + 'console.debug("loaded");\n'.repeat(2500);

const head = (title: string, extra = '') => `<head><meta charset="utf-8">${extra}<title>${title}</title></head>`;
const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1">';
const noZoomViewport = '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">';
const description = '<meta name="description" content="Una pagina di prova per controllare che lo scanner trovi i problemi giusti.">';

// Analytics without a cookie banner, setting its cookies right away (before any consent).
// Defines the gtag global and writes the cookies itself, without loading anything from Google or Meta.
const analytics = `<script>
  window.dataLayer = []; function gtag() { dataLayer.push(arguments); }
  document.cookie = '_ga=GA1.1.123456789.1700000000; path=/';
  document.cookie = '_fbp=fb.1.1700000000.123456789; path=/';
  document.cookie = 'lingua=it; path=/';
</script>`;

const pages: Record<string, string> = {
  // Short title, no meta description, a broken internal link, a dead external domain,
  // an image without alt, a missing image and a heavy image. Also: a JavaScript error, a missing
  // script, lorem ipsum, a link to staging, a demo e-mail, a TODO, analytics without a cookie banner,
  // and no privacy / cookie policy / VAT number anywhere.
  '/': `<!doctype html><html lang="it">${head('Home', viewport + analytics + '<script src="/js/manca.js"></script><script src="/js/app.js"></script>')}<body>
    <h1>Demo</h1>
    <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
    <p>TODO: aggiungere le foto del team</p>
    <a href="/chi-siamo">Chi siamo</a> <a href="/contatti#form">Contatti</a>
    <a href="/pagina-sparita">Vecchia pagina</a> <a href="https://dominio-inesistente.invalid/">Partner</a>
    <a href="http://staging.studio-demo.invalid/">Anteprima</a>
    <a href="mailto:info@example.com">Scrivici</a>
    <img src="/img/logo.png"> <img src="/img/mancante.jpg" alt="Foto"> <img src="/img/pesante.jpg" alt="Banner">
    <script>document.querySelector('#non-esiste').remove();</script>
  </body></html>`,
  // Leftover noindex, no viewport, duplicate title with /contatti.
  '/chi-siamo': `<!doctype html><html lang="it">${head('Chi siamo | Studio Demo', `<meta name="robots" content="noindex">${description}`)}<body>
    <h1>Chi siamo</h1><a href="/">Home</a>
  </body></html>`,
  // Element wider than a phone screen (only visible with a viewport meta: without it phones render at 980px).
  // Accessibility: zoom disabled, grey-on-white text, an icon button without a name,
  // a heading level skipped (h1 → h4) and a "clicca qui" link (to a page that doesn't exist).
  '/contatti': `<!doctype html><html lang="it">${head('Chi siamo | Studio Demo', noZoomViewport + description)}<body>
    <h1>Contatti</h1>
    <!-- A late banner pushes the page down: a layout shift (CLS). -->
    <script>setTimeout(() => document.body.insertAdjacentHTML('afterbegin', '<div style="height:400px;background:#eee">Promo</div>'), 100);</script>
    <div class="banner-largo" style="width:900px">Testo</div><a href="/">Home</a>
    <h4>Scrivici</h4>
    <p style="color:#c8c8c8">Rispondiamo entro 24 ore.</p>
    <button><svg width="16" height="16"></svg></button>
    <p>Per la mappa <a href="/mappa">clicca qui</a>.</p>
  </body></html>`,
};

export function startDemoSite(port = 0): Promise<{ url: string; server: Server }> {
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    const html = pages[path];
    if (path === '/chi-siamo') {
      // A slow server: more than 1 second before the first byte.
      setTimeout(() => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html), 1200);
    } else if (html) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
    } else if (path === '/js/app.js') {
      // A big script sent without compression and without cache headers.
      res.writeHead(200, { 'content-type': 'application/javascript' }).end(APP_JS);
    } else if (path === '/robots.txt') {
      // Left over from staging: the whole site is closed to search engines. No sitemap, no favicon.
      res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nDisallow: /\n');
    } else if (path === '/img/logo.png') {
      res.writeHead(200, { 'content-type': 'image/png', 'content-length': PIXEL_PNG.length }).end(PIXEL_PNG);
    } else if (path === '/img/pesante.jpg') {
      const body = Buffer.alloc(800 * 1024);
      res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': body.length }).end(req.method === 'HEAD' ? undefined : body);
    } else {
      // A bare error page with no way back into the site.
      res.writeHead(404, { 'content-type': 'text/html' }).end('<h1>Non trovata</h1>');
    }
  });

  return listen(server, port);
}

/**
 * A one-page Russian shop for the Russian law checks: a contact form without consent to the
 * processing of personal data, Google Analytics (foreign), prices without the seller's ИНН/ОГРН and
 * menu items only in English (Russian language law), and a consent checkbox that can't be ticked.
 * Privacy and cookie policies are there, so only the Russian rules fire.
 */
const ruHome = `<!doctype html><html lang="ru">${head('Магазин керамики «Глина» — посуда ручной работы', viewport + analytics)}<body>
  <nav><a href="/">Home</a> <a href="/catalog">Catalog</a> <a href="/sale">Sale</a></nav>
  <h1>Магазин керамики</h1>
  <p>Кружка «Утро» — 1 990 ₽ <button>В корзину</button></p>
  <form action="/send"><input type="email" name="email" placeholder="Ваш e-mail"><input type="tel" name="phone"><button>Отправить</button></form>
  <!-- Newsletter: the consent box is there, but disabled, so nobody can tick it. -->
  <form action="/subscribe"><input type="email" name="newsletter" placeholder="E-mail для рассылки">
    <label><input type="checkbox" disabled> Даю согласие на обработку персональных данных</label><button>Подписаться</button></form>
  <!-- Done right, with a custom design: the real box is hidden and the visitor clicks the label. -->
  <form action="/callback"><input type="tel" name="phone" placeholder="Телефон для обратного звонка">
    <label><input type="checkbox" style="display:none"><span>☐</span> Даю согласие на обработку персональных данных</label><button>Перезвоните мне</button></form>
  <footer><a href="/privacy">Политика конфиденциальности</a> · <a href="/cookie">Политика cookie</a></footer>
</body></html>`;

export function startRussianDemoSite(port = 0): Promise<{ url: string; server: Server }> {
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path === '/') res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(ruHome);
    else res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }).end('<h1>Не найдено</h1>');
  });
  return listen(server, port);
}

function listen(server: Server, port: number): Promise<{ url: string; server: Server }> {
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolve({ url: `http://localhost:${actualPort}/`, server });
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { url } = await startDemoSite(4000);
  const ru = await startRussianDemoSite(4001);
  console.log(`Demo site with deliberate problems: ${url}`);
  console.log(`Russian demo shop (Russian law checks): ${ru.url}`);
}
