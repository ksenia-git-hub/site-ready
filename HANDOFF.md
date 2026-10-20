# Handoff: stato del progetto

_Aggiornato al 20 ottobre 2026._

## Dove siamo

Prima versione funzionante, **in locale**: frontend e backend sono completi e verificati. Non è ancora stato fatto nessun commit né il deploy.

### In breve: cosa abbiamo aggiunto e a cosa serve

| Cosa | A cosa serve |
|---|---|
| **Motore di scansione** (Playwright + Chromium) | Apre il sito come un vero browser, su desktop e telefono, e segue i link interni. |
| **Controlli link e immagini** | Trovano pagine 404, immagini rotte o troppo pesanti prima che le veda il cliente. |
| **Controlli SEO** | Evitano che il sito parta invisibile su Google (noindex, robots.txt, title, sitemap…). |
| **Controlli mobile** | Segnalano le pagine che sul telefono si vedono male o scorrono di lato. |
| **Controlli tecnici** | Trovano errori JavaScript, file che non si caricano e problemi di HTTPS/certificato. |
| **Controlli contenuti** | Scovano ciò che resta dallo sviluppo: lorem ipsum, link a staging, contatti finti, TODO. |
| **Controlli legali** | Ricordano privacy, cookie policy, banner cookie e P.IVA, obbligatori in Italia/UE. |
| **Parte legale per la Russia** | Per i siti russi: consenso 152-ФЗ nei moduli, servizi esteri che raccolgono dati, ИНН/ОГРН dei negozi online, testi solo in lingua straniera (168-ФЗ). |
| **Nome Site Ready / «Сайт Готов»** | Nome dell'app tradotto: «Сайт Готов» nella versione russa, «Site Ready» in italiano e inglese. |
| **Cookie prima del consenso** | Scopre se Google Analytics, Meta Pixel & co. salvano cookie prima che il visitatore accetti: la violazione GDPR più sanzionata. |
| **Controlli accessibilità** (axe-core) | Verificano che il sito sia usabile da persone con disabilità (European Accessibility Act). |
| **Screenshot desktop e mobile** | Mostrano al cliente come appare ogni pagina, direttamente nel report. Screenshot a **pagina intera**, mostrati dentro mockup in stile Figma (canvas a puntini, etichette dei frame, portatile e telefono piatti); si scorrono dentro gli schermi, anche insieme. |
| **Velocità** | Tempo di risposta del server, comparsa del contenuto principale (LCP), stabilità (CLS), peso e richieste di ogni pagina, più compressione, cache e formati delle immagini. |
| **Punteggio per categoria** | Ogni riquadro di categoria ha il suo punteggio 0–100 e la barra è il punteggio stesso. Colori freddi nello stile dell’interfaccia: indaco/viola ottimo, blu buono, azzurro da migliorare, lampone da sistemare; anello e numeri a tinta unita, sfumatura solo nella barra. |
| **Cosa sistemare per primo** | In cima al report, i 3–5 problemi che pesano di più sul punteggio, con «perché è importante» in parole semplici e un pulsante che apre il problema nell’elenco. I problemi di tutto il sito (robots.txt, HTTPS, privacy…) sono indicati come «tutto il sito». |
| **Punteggio di qualità 0–100** | Dà un giudizio immediato e comprensibile anche a chi non è tecnico. Calcolato come Semrush / Ahrefs / SE Ranking: critici (peso 12), avvisi (peso 1,5) e suggerimenti (peso 0,25: 1–2 punti per tipo in una categoria), una volta per tipo di problema, in base alla quota di pagine coinvolte; 100 solo se non si trova nulla; curva 100·50/(50+penalità), mai 0. Scala: 90+ ottimo, 75–89 buono, 50–74 si può migliorare, sotto 50 da sistemare. |
| **Report con filtri, ricerca e PDF** | Permette di lavorare sui problemi e di consegnare un documento pulito al cliente. |
| **Italiano, inglese, russo** | Il report si può mandare nella lingua del cliente, anche dopo la scansione. |
| **Interfaccia moderna** (Tailwind + shadcn/ui) | Aspetto professionale, tema chiaro/scuro, funziona anche sul telefono. |
| **Filtri rapidi dal punteggio** | Cliccando «Critici», «Avvisi» o «Suggerimenti» nel riquadro del punteggio si salta all’elenco già filtrato. |
| **Interrompi scansione** | Ferma una scansione in corso (indirizzo sbagliato, ripensamento) e riporta alla home con l'indirizzo nel campo da correggere. |
| **Scansioni recenti** | Riapre al volo gli ultimi report dalla home. |
| **Sito demo con errori voluti** | Permette di provare e testare l'app senza un sito vero (`npm run demo-site`). |
| **88 test automatici** | Garantiscono che le modifiche future non rompano quello che già funziona. |

### Cosa fa

1. Inserisci l'indirizzo di un sito e il numero massimo di pagine (1–50, predefinito 10).
2. Il server apre il sito con Chromium (Playwright), segue i link interni e analizza ogni pagina sia su desktop sia su un telefono largo 375px.
3. Controlla via HTTP tutti i link e le immagini trovati, poi il sito nel suo insieme (robots.txt, sitemap, HTTPS, pagine legali). Di ogni pagina scatta uno screenshot desktop e uno mobile.
4. L'interfaccia (Tailwind + shadcn/ui, tema chiaro/scuro/automatico) mostra l'avanzamento per fasi con una barra di progresso, poi il report:
   - punteggio di qualità da 0 a 100 con giudizio;
   - card per categoria, tab, filtro per gravità e ricerca;
   - problemi raggruppati per tipo, con "Come risolvere" copiabile;
   - "Stampa / salva PDF", che apre tutti i dettagli prima di stampare.
   - galleria "Come appare il sito" con gli screenshot di ogni pagina (si aprono ingranditi);
   - la home mostra le ultime scansioni salvate nel browser.
5. Tutto (interfaccia e report) è disponibile in **italiano, inglese e russo**, con selettore a bandiere nell'intestazione. La lingua si può cambiare anche dopo la scansione, per esempio per stampare il report nella lingua del cliente.

### Controlli implementati

| Categoria | Controlli |
|---|---|
| Link | 404/410 (critico), errori 5xx, dominio inesistente / timeout (30 s), link che funzionano ma rispondono dopo più di 10 s (avviso «pagina molto lenta»), link esterni che bloccano i bot (solo info) |
| Immagini | file mancante, file > 500 KB, alt mancante (alt="" accettato), immagine molto più grande di come è mostrata |
| SEO | title mancante / troppo corto o lungo / duplicato, meta description, H1 assente o multiplo, `lang` mancante, **noindex rimasto attivo**, favicon, anteprima social (Open Graph), **robots.txt che blocca tutto**, sitemap mancante, pagine inesistenti che rispondono 200 |
| Mobile | meta viewport mancante, scorrimento orizzontale a 375px con gli elementi responsabili |
| Tecnico | pagina 404 non personalizzata (pagina di errore del server senza link per tornare al sito), errori JavaScript, file della pagina che non si caricano (script, CSS, font), mixed content, sito senza HTTPS, HTTP che non porta su HTTPS, certificato SSL in scadenza (≤ 30 giorni) |
| Contenuti | lorem ipsum, link o file da localhost / staging / IP locali, testi demo dei CMS ("Hello world!"), email e telefoni finti, TODO/FIXME |
| Legale (Russia) | solo per siti in russo o con dominio .ru/.su/.рф: moduli che chiedono dati personali senza consenso 152-ФЗ, con consenso già spuntato, o con consenso solo come frase (dal 1/9/2025 va separato); servizi di analisi esteri (GA, GTM, Meta Pixel, Hotjar… — divieto di raccolta su DB esteri dal 1/7/2025, interpretazione discussa: segnalato come avviso); casella del consenso che il browser prova a spuntare come un visitatore (disattivata/nascosta/coperta = avviso); negozi senza ИНН/ОГРН; menu, pulsanti e titoli solo in lingua straniera nelle pagine in russo (168-ФЗ, dal 1/3/2026; marchi registrati possono fare eccezione). La P.IVA italiana non viene chiesta |
| Velocità | per ogni pagina, misurata dal browser della scansione **senza rallentare la rete** (su rete mobile sarà più lento): risposta del server > 0,8 s, LCP > 2,5 s, CLS > 0,1, peso > 3 MB (soglie Google; il doppio = critico), più di 100 richieste, file di testo senza gzip/Brotli, file del sito senza cache del browser, JPG/PNG > 100 KB. Soglie in `SPEED_THRESHOLDS` (shared) |
| Accessibilità | axe-core (contrasto, pulsanti/link/campi senza nome, ordine dei titoli, zoom bloccato, ARIA, iframe, video…: ~25 regole tradotte, le altre col testo inglese di axe) + link generici («clicca qui»). Il report avverte che non sostituisce una verifica manuale |
| Legale | privacy policy, cookie policy, banner cookie se ci sono tracker (GA, Meta Pixel, Yandex Metrica...), P.IVA per i siti italiani, **cookie di tracciamento salvati prima del consenso** (il browser non clicca mai «Accetta»; vengono riconosciuti per nome i cookie di ~13 servizi noti, quelli tecnici sono ignorati) |

### Verifiche fatte

- `npm test`: 88 test passati (compreso un test end-to-end sul negozio demo russo).
  - Uno end-to-end scansiona con Chromium il sito demo e ritrova esattamente i 35 problemi messi apposta, con gli screenshot di tutte le pagine.
  - I test delle traduzioni verificano che le tre lingue abbiano le stesse chiavi, i plurali e i segnaposto.
- Lingue verificate da browser: cambio con le bandiere, scelta ricordata dopo il ricaricamento, browser in tedesco → inglese, browser in italiano → italiano. Le traduzioni russe e inglesi le ho scritte io: conviene che le rilegga qualcuno di madrelingua prima di mostrarle ai clienti.
- `npm run typecheck` e `npm run build` senza errori.
- Prova manuale da browser (server + sito demo): scansione in circa 3 secondi, report corretto, nessun errore in console, niente scorrimento orizzontale su mobile, tema chiaro e scuro, vista di stampa.

## Come provarlo

```bash
npm run demo-site   # terminale 1: sito con errori voluti su :4000 e negozio russo su :4001
npm run dev         # terminale 2: apri http://localhost:5173 e scansiona localhost:4000
```

## Limiti noti

- La coda è in memoria: i report si perdono al riavvio, e c'è una sola scansione alla volta.
- Nessuna autenticazione e nessun blocco degli indirizzi interni (localhost, 10.x, 192.168.x...). In locale va bene, **online no**.
- I link verso pagine già visitate dal browser non vengono ricontrollati via HTTP; il conteggio "Link controllati" li esclude.
- Limiti fissi: 500 link e 300 immagini per scansione (oltre compare un avviso nel report).
- La velocità è misurata senza simulare una rete mobile e senza Lighthouse: è indicativa, non un punteggio Google ufficiale.
- Alcuni controlli sono euristici e possono sbagliare: il banner cookie (riconosciuto da id/classi con "cookie"/"consent" o dalle piattaforme note), privacy/cookie policy (cercate nei link e nel testo delle pagine analizzate), P.IVA (cercata come "P.IVA" seguita da 11 cifre).

## Prossimi passi

1. **Primo commit** e creazione del repository su GitHub.
2. **Deploy su Render** (deciso): un solo Web Service da Dockerfile basato sull'immagine `mcr.microsoft.com/playwright`, con `render.yaml`.
   - In produzione `HOST=0.0.0.0`; `PORT` arriva da Render.
   - Il server serve già `client/dist`, quindi basta `npm run build` nell'immagine.
   - Attenzione alla RAM: Chromium con 512 MB è al limite.
3. **Prima di andare online**: protezione con password/token (variabile d'ambiente) e blocco degli IP privati per evitare abusi.
4. Funzioni proposte e non ancora fatte:
   - velocità: misure leggere su tutte le pagine, ed eventualmente Lighthouse sulla home (più memoria su Render);
   - PDF con logo e dati dello studio;
   - storico delle scansioni con confronto prima/dopo (Postgres o disco persistente su Render).
5. Il bundle JS principale pesa circa 530 KB (169 KB compresso), quasi tutto React + Radix + i18next: è normale, Vite mostra solo un avviso.
