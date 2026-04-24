# Messale Digitale — Backend FastAPI

Backend per app Android destinata a preti anziani ipovedenti per celebrazione della Santa Messa
con testi CEI e letture del giorno scaricate da `chiesacattolica.it`.

## Deploy su Render.com

### Requisiti
- Account [Render.com](https://render.com) (gratis)
- Account [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) con cluster M0 (gratis)
- Connection string MongoDB (Database Access + Network Access `0.0.0.0/0` configurati)

### Passi

1. **Pushare questo folder (contenente Dockerfile, render.yaml ecc.) su GitHub** come repo.

2. Nel dashboard Render:
   - Clicca "New +" → "Blueprint"
   - Collega il tuo account GitHub
   - Seleziona il repo appena creato
   - Render rileverà `render.yaml` e creerà automaticamente il servizio web

3. **Imposta le variabili d'ambiente** nel dashboard (Service → Environment):
   - `MONGO_URL` = la tua connection string Atlas (includi la password)
   - `DB_NAME` = `messale` (già preimpostato dal blueprint)

4. Il primo deploy richiede ~5 minuti. Al termine avrai un URL tipo:
   `https://messale-backend-XXXX.onrender.com`

5. Verifica con:
   ```
   curl https://messale-backend-XXXX.onrender.com/api/
   ```
   Deve restituire `{"message": "Messale Digitale API", "status": "ok"}`

### Note importanti sul piano FREE Render

- Il servizio si addormenta dopo 15 minuti di inattività
- Il primo request dopo il sonno impiega ~30-60 secondi per svegliare il servizio
- L'app Android gestisce questo via cache offline (AsyncStorage): le letture scaricate
  funzionano anche quando il server è addormentato
- Per evitare il sonno: configurare un "cron ping" esterno (es. [cron-job.org](https://cron-job.org))
  che chiami `/api/` ogni 10 minuti

### Aggiornamenti

Ogni `git push` al repo collegato triggera automaticamente un nuovo deploy Render.

## Sviluppo locale

```bash
pip install -r requirements-deploy.txt
cp .env.example .env  # e compila i valori
uvicorn server:app --reload --port 8001
```

## Endpoint principali

- `GET /api/liturgy/today` — liturgia completa di oggi
- `GET /api/liturgy/{YYYY-MM-DD}` — liturgia di una data specifica
- `GET /api/liturgy/range/{YYYY-MM-DD}?days=N` — N giorni consecutivi (pre-download)
- `GET /api/mass/order` — struttura ordinario della messa
- `GET /api/mass/fixed-parts` — parti fisse
- `GET /api/prefaces` — elenco prefazi (56)
- `GET /api/eucharistic-prayers` — preghiere eucaristiche (13)
- `GET /api/solemn-blessings` — benedizioni solenni stagionali
- `GET /api/calendar/saints` — calendario completo dei santi
