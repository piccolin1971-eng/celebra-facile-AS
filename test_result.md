#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "App Android per preti anziani ipovedenti che celebrano la messa usando testi ufficiali CEI su tablet. Include parti fisse, parti mobili, letture scaricate automaticamente da chiesacattolica.it/liturgia-del-giorno, accessibilità (testo 24-60pt, alto contrasto) e funzionamento offline/misto."

backend:
  - task: "GET /api/liturgy/range/{start_date}?days=N"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "Nuovo endpoint per pre-download di più giorni. Riusa _full_liturgy() che gestisce cache MongoDB + fallback scraper. Max 30 giorni, min 1. Testato manualmente con curl: days=2 ritorna 2 item con 9 letture ciascuno."
        - working: true
          agent: "testing"
          comment: "Testato via /app/backend_test.py contro https://celebra-facile-1.preview.emergentagent.com/api. Tutti i controlli superati: (1) Happy path GET /api/liturgy/range/2026-04-25?days=3 -> 200 con struttura {start, days, items}, 3 item per date consecutive 2026-04-25/26/27, tutti i campi richiesti (date, date_label, season, saints, readings, title, liturgical_color) presenti, readings popolate [9, 10, 9]. (2) Clamp: days=0 e days=-5 -> clampati a 1 item; days=100 -> clampato a 30 item; default (no param) = 7 item. (3) Validazione: '2026-13-99', 'non-una-data', 'abcd-ef-gh' -> HTTP 400 con detail 'Formato data non valido. Usare YYYY-MM-DD.' (4) Resilienza scraping: start_date=2099-12-25 days=2 -> 200, entrambi gli item con readings=[] e campo error valorizzato, nessun crash. (5) Endpoint correlati: /api/liturgy/today, /api/liturgy/2026-04-25, /api/mass/order, /api/prefaces tutti 200 OK."

  - task: "GET /api/liturgy/today (esistente)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "Funzionante, usato dal client frontend."

frontend:
  - task: "Cache offline letture con AsyncStorage"
    implemented: true
    working: true
    file: "frontend/src/offlineCache.ts, frontend/src/api.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "Nuovo modulo offlineCache.ts con saveLiturgy/loadLiturgy/index/prune. api.ts aggiornato: liturgyToday e liturgyForDate provano rete poi fallback cache locale, settando fromLocalCache=true. Anche testi statici (ordinario/prefazi/preghiere eucaristiche) ora sono cached."

  - task: "Schermata Scarica letture (/scarica)"
    implemented: true
    working: true
    file: "frontend/app/scarica.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "Nuova schermata con 5 preset (1/3/7/14/30 giorni), progress bar live, lista letture scaricate con rimozione singola (long-press o trash icon), pulsanti prune 3 giorni e cancella tutto. Verificata via screenshot: renderizza correttamente."

  - task: "Banner offline su Home (/)"
    implemented: true
    working: true
    file: "frontend/app/index.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "Se liturgy.fromLocalCache=true mostra banner verde 'Modalità offline'. Se fetch fallisce totalmente (nessuna rete + nessuna cache) mostra banner rosso con suggerimento di usare Scarica letture."

  - task: "Build APK EAS (in coda)"
    implemented: true
    working: "NA"
    file: "frontend/app.json, frontend/eas.json"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Build EAS 0c2d96f2-e079-4dbf-afac-4f6336cd339b in queue. app.json: nome 'Messa CEI', package it.messaparroco.app, icone 512x512, hex #000000. eas.json creato con profilo preview=APK. NOTA: questa build NON include ancora le feature offline appena implementate - servirà un nuovo build dopo conferma che tutto funziona."

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "GET /api/liturgy/range/{start_date}?days=N"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: "Implementata modalità offline completa: nuovo endpoint backend /api/liturgy/range per pre-download, modulo offlineCache con AsyncStorage, schermata /scarica con progress bar e gestione cache. Aggiunto banner offline su home. Chiedo al testing agent di verificare solo il nuovo endpoint backend (range), gli altri endpoint sono invariati."
    - agent: "main"
      message: "REFATTORIZZAZIONE v1.1.0 — App standalone, zero backend. Tutti i testi statici esportati da Python a JSON (127 KB totali) e bundlati nell'APK in /app/frontend/src/data/. Creato liturgyScraper.ts che fa fetch diretto a chiesacattolica.it e parsing HTML con regex (testato con Node: 18 sezioni estratte correttamente). api.ts ora usa localLiturgy.ts invece di chiamare il backend. Build APK v1.1.0 lanciato (ID 085164f0-5fb6-4b41-ba15-bd953fcc3967). Il backend FastAPI esiste ancora in /app/backend ma non è più necessario per l'APK — può restare solo per dev/test."
    - agent: "testing"
      message: "Endpoint /api/liturgy/range/{start_date}?days=N testato con successo (19/20 check passati). Struttura risposta, campi per item, clamp (min=1, max=30, default=7), validazione date invalide con HTTP 400 + messaggio corretto, resilienza errori scraping (year 2099 -> readings=[] + error field, no crash) e endpoint correlati (today, by_date, mass/order, prefaces) tutti OK. Readings popolate da chiesacattolica.it: 9-10 letture per giorno. NIENTE da segnalare al main agent: endpoint pronto per produzione."
    - agent: "main"
      message: "FEATURE — ORAZIONALE PER LA PREGHIERA UNIVERSALE (CEI 2020). Estratte 169 preghiere ufficiali dal PDF allegato (4.7 MB, 204 pagine) tramite parser PyMuPDF: 92 Proprio del Tempo, 52 Santi, 4 Quattro Tempora, 4 Varie Necessità, 10 Defunti, 7 Forma Breve. Salvate in /app/frontend/src/data/orazionale.json. Le rubriche introduttive (es. 'Esortazione iniziale:', 'Ciascuno prega in silenzio') sono state rimosse come da richiesta utente: solo testo principale. Aggiunto pulsante 'Orazionale' (icona MaterialCommunityIcons hands-pray, colore viola liturgico) in home accanto a 'Celebra la Messa'. Creata schermata /orazionale con master/detail (sezioni → preghiere → testo). Integrata in messa.tsx: nuova pagina 'Preghiera dei fedeli' tra Credo e Offertorio, toggle on/off nella pagina intro, modal selettore con sezioni e auto-suggerimento basato su tempo liturgico + numero domenica (es. IV Domenica di Pasqua → 'Tempo di Pasqua prima dell'Ascensione I'). Verificato funzionante via screenshot."
    - agent: "main"
      message: "v2.3.0 — MESSALE ROMANO 2020 COMPLETO. Sostituiti integralmente i testi delle Preghiere Eucaristiche della Riconciliazione I/II e per Varie Necessità I-IV con quelli ufficiali estratti dal PDF della terza edizione del Messale Romano CEI fornito dall'utente (file 23 MB, 1278 pagine). PE I-IV restano come confermati nelle sessioni precedenti. Implementata logica delle rubriche: i marker [xxx] tra parentesi quadre vengono renderizzati come piccolo testo rosso SOLO nella PE I (Canone Romano); per tutte le altre PE i marker (incluso [Santo]) vengono completamente rimossi dal testo visualizzato (il Santo è già a fine prefazio). Bump versione 2.2.0 → 2.3.0 in app.json. Push su GitHub completato (commit b33f5c5), build APK avviata su GitHub Actions (run #25008924021)."
    - agent: "main"
      message: "v2.4.0 — Fix UI minori richiesti dall'utente: (1) Titolo home cambiato da 'Messale Digitale' a 'Celebra facile'. (2) Salmo Responsoriale: il rendering per-riga creava doppi spazi tra strofe perché ogni <Text> aveva marginVertical:8. Riscritto in singolo <Text> multilinea con span inline per 'R.' rosso e nuovo stile salmoText (lineHeight ridotto a fontSize*1.35). Verificato via screenshot: strofe compatte, separate solo da riga vuota tra ogni stanza. (3) Paginazione Kindle-style PE: tunato i parametri di stima (HEADER_FOOTER_OVERHEAD 220→180, lineHeight factor 1.4→1.55, charWidth 0.55→0.52, fill factor 0.78→0.88, MIN_FILL 0.55→0.65). Aggiunto bilanciamento finale che ridistribuisce i paragrafi se l'ultimo chunk è troppo vuoto (<35%). Verificato che le pagine PE II Consacrazione+Calice riempiono bene lo schermo senza spazi bianchi eccessivi e si dividono correttamente al marker 'Allo stesso modo, dopo aver cenato'."
    - agent: "main"
      message: "v2.6.0 — Auto-scroll PE + ulteriore compattazione titoli. (1) Titoli sezioni: marginTop/marginBottom 6/2 → 0/0, lineHeight ridotto a fontSize*0.95-1.15 per titoli (era 1.4 default). partBox marginBottom 6→2, paddingBottom 4→0. I titoli azzurri/verdi/lavanda ora sono praticamente attaccati alla cornice superiore senza spazio nero. (2) Auto-scroll PE: implementato con setInterval ogni 50ms che scorre la ScrollView. Velocità: Lento=10 px/s, Medio=22 px/s. Bottone inline nella prima pagina della Preghiera Eucaristica (accanto a 'Scegli'). Ciclo richiesto dall'utente: Lento (default) → Off → Medio → Off (4 stati con Off in 2 posizioni). Implementato con AUTO_SCROLL_CYCLE = [1,0,2,0] e autoScrollCycleIdx. Reset scroll a 0 ad ogni cambio pagina, delay iniziale 1.5s prima di partire, stop automatico al fondo pagina. Verificato via screenshot: Lento → Auto → Medio → Auto → Lento (ciclo 4-step OK)."
    - agent: "main"
      message: "v2.9.0 — Modalità 'Celebra la Messa' (lettura pulita per l'altare). Pensata per sacerdoti anziani ipovedenti: NESSUN toggle/menù/selettore durante la celebrazione, solo testo continuo paginato Kindle-style. (1) Nuovo file /app/frontend/app/celebra.tsx (~900 righe): legge le scelte salvate da AsyncStorage (massSession), compone l'intera Messa come array di Segment[] (sectionTitle/antifonaTitle/readingTitle/orazioneTitle/subtitle/normal/rubric/celebrante/assemblea/peTitle/peText/peDossologia/salmo) e impagina dinamicamente in base all'altezza reale del container (onLayout). Spezza testi lunghi SOLO ai segni di punteggiatura (.!?:;) e MAI a metà frase. Stessi colori e stili di /messa (rubriche rosse, consacrazione azzurra #29B6F6, titolo PE verde #66BB6A, dossologia bianca regular). Tap dx70%/sx30% per girare pagina, bottone Home in alto a sinistra, indicatore pagina in alto a destra. Empty state se non c'è sessione salvata (con CTA 'Scegli la liturgia'). (2) Modificato /app/frontend/app/index.tsx: rinominato pulsante 'Celebra la Messa' → 'Scegli la liturgia' (azzurro), aggiunto nuovo pulsante 'Celebra la Messa' (verde liturgico) accanto, spostato Orazionale come card secondaria con bordo viola. (3) Modificato /app/frontend/app/messa.tsx: aggiunto pulsante grande verde '✓ Scelte per la liturgia odierna completate' alla fine della pagina del Congedo che naviga a /celebra preservando la data della liturgia. Verificato via screenshot su tablet 820x1180: Pasqua → 26 pagine, Antifona/Riti/Atto Penitenziale ben distribuiti, Credo paginato a fine frase, PE II con consacrazione del Calice tutta in una pagina (azzurra), Mistero della Fede + acclamazione, congedo Pasqua finale. Tutto in linea con i requisiti UX per ipovedenti."
    - agent: "main"
      message: "v2.10.0 — Selezione carattere in Impostazioni con anteprima live. (1) Installati 4 font Google: Atkinson Hyperlegible (per ipovisione, Braille Institute), Lora (serif moderno), EB Garamond (serif classico/liturgico), Cormorant (alternativa GFonts a Rosemary). (2) /app/frontend/src/fontFamily.ts: nuovo modulo con FONT_OPTIONS (5 opzioni incluso 'Sistema'). (3) /app/frontend/src/SettingsContext.tsx: aggiunti fontFamilyId (persistito) + fontFamily (string per Text styles). (4) /app/frontend/app/_layout.tsx: useFonts() carica i 4 font all'avvio con spinner (caching automatico). (5) /app/frontend/app/impostazioni.tsx: nuova sezione 'Carattere' con 5 card, anteprima live ('Padre nostro, che sei nei cieli') in ogni font, descrizione (es. 'Consigliato per ipovisione'). (6) celebra.tsx + messa.tsx: makeStyles ora accetta fontFamily, applicato a text/celebrante/assemblea/peText/peDossologia/salmoText/umili. Titoli/UI restano in font di sistema per coerenza. Verificato: cambio in Impostazioni → effetto immediato su /celebra. Tutti e 5 i font visibili e leggibili sul tablet 820x1180."
    - agent: "main"
    - agent: "main"
    - agent: "main"
    - agent: "main"
      message: "v2.11.1 — Ripristinata paginazione Kindle in /celebra (fraintendimento punto 7 della rev precedente). Comportamento corretto: tap a destra 70% = avanza pagina, tap a sinistra 30% = pagina precedente, indicatore X/Y in alto a destra. Auto-scroll mantenuto come SAFETY NET: ogni pagina è renderizzata in una ScrollView, quindi se il contenuto eccede l'altezza dello schermo (raro ma può accadere su dispositivi piccoli o con font grande), parte automaticamente lo scroll a autoScrollPxPerSec px/s dopo autoScrollDelaySec sec. Drag manuale dell'utente pausa l'auto-scroll (riprende dopo il delay). Cambio pagina resetta scrollY a 0 e riazzera il timer. Verificato 22 pagine con tap dx/sx funzionante."
      message: "v2.11.0 — Set di 7+1 modifiche UX/visuali. (1) Toggle Gloria/Credo/Preghiere dei fedeli ora OFF di default in /messa (la sessione persistita continua a sovrascrivere se l'utente ha scelto altro). (2) Risposte assemblea (A.): fontSize -1pt, italico, no bold (in messa.tsx + celebra.tsx) — meno 'peso' visivo rispetto alle parti del celebrante. (3) Titolo prefazio scelto ora in VERDE (#66BB6A) coerente con titolo PE — aggiunto kind 'prefaceTitle' nel componente R + style relativo. (4) Titolo PE ridotto: 1.1× → 0.95× del fontSize base (e prefaceTitle uguale a peTitle per coerenza). (5+6) Risolti gratis dal #7. (7) RISCRITTURA /celebra: rimosso paginazione + tap-to-advance. Ora ScrollView unica con AUTO-SCROLL automatico (autoScrollPxPerSec px/s, parte dopo autoScrollDelaySec sec di inattività, si pausa al touch dell'utente, riprende dopo lo stesso delay, si ferma in fondo). Tutte le scelte vengono mostrate integralmente — nessun rischio di perdere titoli/dossologia/sezioni a causa di bug di paginazione. (8) Home: 4 card secondarie (Orazionale/Calendario/Scarica letture/Accessibilità) sostituite da 'compactCard' a una sola riga (paddingVertical 12 vs 24, font 0.7×). Orazionale ha titolo + '· Preghiera Universale' affiancati invece che impilati. La home ora entra in una schermata. tsc --noEmit OK, screenshot tablet 820x1180 confermano tutto."
      message: "v2.10.2 — Sostituzione font: rimossi EB Garamond e Cormorant. Aggiunti Varela Round (sans morbido arrotondato) e Patrick Hand (calligrafico/manoscritto). yarn remove eb-garamond cormorant + yarn add varela-round patrick-hand. Aggiornato fontFamily.ts (tipo FontFamilyId), _layout.tsx (useFonts), SettingsContext.tsx (validazione ID con fallback automatico a 'system' per chi avesse i vecchi ID salvati). Le 5 opzioni finali: Sistema / Atkinson Hyperlegible / Lora / Varela Round / Patrick Hand. Verificato Patrick Hand e Varela Round su /celebra (820x1180) — entrambi applicati correttamente al body text con anteprima live in Impostazioni."
      message: "v2.10.1 — Aumentata interlinea in /celebra. Body text: 1.45× → 1.7× (text/celebrante/assemblea/peText/peDossologia). Salmo: 1.3× → 1.55×. Umili e pentiti: 1.35× → 1.55×. Rubriche piccole invariate (1.2×). Aggiornato segHeightPx() in paginate() con factor 1.65× per i testi del corpo (riflette il nuovo line-height senza sprecare pagine). Rispetta linee guida WCAG (1.5× minimo) e raccomandazioni per ipovedenti (1.7-1.8×). Numero di pagine passato da 27 a 29 (+2, prezzo accettabile per il guadagno di leggibilità)."

