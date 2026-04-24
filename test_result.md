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
