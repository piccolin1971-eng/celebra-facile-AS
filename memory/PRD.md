# Messale Digitale - PRD

## Scopo
Applicazione Expo/React Native per tablet Android destinata a sacerdoti anziani ipovedenti per celebrare la Santa Messa secondo il Messale Romano in lingua italiana.

## Destinatari
Preti con ipovisione che hanno difficoltà con il messale cartaceo. Interfaccia tablet-first con testo molto grande e controlli di accessibilità spinti.

## Funzionalità implementate
### Backend (FastAPI + MongoDB)
- Scraper `chiesacattolica.it/liturgia-del-giorno` per letture del giorno (async httpx + BeautifulSoup)
- Cache MongoDB delle letture per uso offline (`daily_readings`)
- Calendario liturgico (calcolo tempo liturgico semplificato)
- Calendario santi (70+ celebrazioni fisse) + 14 messe votive
- Ordinario della Messa completo: Riti Iniziali, Atto Penitenziale (A/B/C), Gloria, Credo (Niceno/Apostolico), Offertorio, Padre Nostro, Comunione, Riti di Conclusione (benedizioni e congedi)
- 8 Prefazi (Comune, Avvento, Natale, Quaresima, Pasqua, Ordinario)
- 10 Preghiere Eucaristiche complete: PE I-IV (Canone Romano, comune, domenicale, storia salvezza), PE della Riconciliazione I-II, PE per varie necessità I-IV

Endpoints: `/api/liturgy/today`, `/api/liturgy/{date}`, `/api/liturgy/refresh/{date}`, `/api/mass/order`, `/api/mass/fixed-parts`, `/api/prefaces`, `/api/eucharistic-prayers`, `/api/calendar/saints`, `/api/calendar/saints/{date}`, `/api/votive-masses`, `/api/cache/readings`.

### Frontend (Expo Router)
- `/` Home con data liturgica in italiano, indicatore colore stagione, 3 card grandi
- `/messa` Celebrazione: scroll unico con tutto l'Ordinario + letture del giorno + selettori inline per formule Atto penitenziale, Credo, Benedizione, Congedo + modali per Prefazio e Preghiera Eucaristica
- `/calendario` Santi per mese + Messe votive con colore liturgico
- `/impostazioni` Slider dimensione testo 24–60pt, tema chiaro/scuro, alto contrasto; persistenza in AsyncStorage

### Accessibilità
- Font size globale 24–60pt con scaling proporzionale UI
- Tema chiaro (crema + nero) e scuro (nero + bianco)
- Modalità alto contrasto (nero/bianco puri, bordi spessi)
- Touch target minimi 64px
- Rubriche liturgiche in rosso e corsivo, sempre più piccole del testo principale

## Note liturgiche
- I testi dell'Ordinario seguono la versione italiana attualmente in uso. Si raccomanda verifica/sostituzione con l'edizione CEI ufficiale del Messale Romano (3a ed.) per uso liturgico.
- Le letture sono scaricate da chiesacattolica.it. Se lo scraper non riesce a estrarre un campo, il resto dell'app rimane usabile.

## Stack
- Backend: FastAPI, Motor/MongoDB, httpx, BeautifulSoup4, lxml
- Frontend: Expo 54, Expo Router 6, React Native 0.81, @react-native-async-storage/async-storage 2.2, @react-native-community/slider 5.0
