# Messale Digitale - PRD

## Scopo
App Expo/React Native per tablet Android destinata a sacerdoti anziani ipovedenti che celebrano la Santa Messa secondo il Messale Romano in lingua italiana.

## Funzionalità implementate

### Backend (FastAPI + MongoDB)
- Scraper `chiesacattolica.it` per letture del giorno (9 sezioni: antifona ingresso, colletta, prima/seconda lettura, salmo, sequenza, acclamazione, vangelo, sulle offerte, antifona comunione, dopo la comunione)
- Cache MongoDB delle letture per uso offline
- **Ordinario della Messa** con scelte multiple:
  - Atto Penitenziale A/B/C con **tropari per 5 tempi liturgici** (Ordinario, Avvento, Natale, Quaresima, Pasqua)
  - Gloria (con toggle)
  - Credo Niceno/Apostolico (con toggle)
  - Offertorio con **4 formule Orate Fratres** (standard, per la comunità, per la vita quotidiana, per il cammino ecclesiale)
  - **4 introduzioni Padre Nostro** (Obbedienti / Guidati Spirito / Fedeli parola / Prima del banchetto)
  - Congedo con 4 forme + congedo pasquale con Alleluia
- **56 prefazi** completi (Avvento I-II, Natale I-III + Epifania + Battesimo Signore, Quaresima I-V + Passione I-II, Pasqua I-V + Ascensione I-II + Pentecoste, Ordinario I-VIII, Comune I-IV, Solennità del Signore, BVM, Apostoli, Martiri, Pastori, Dottori, Vergini/Religiosi, Santi, Angeli, Defunti I-V)
- **13 Preghiere Eucaristiche**: PE I-IV, Riconciliazione I-II, Varie Necessità I-IV, **per i Fanciulli I-II-III**
- **3 acclamazioni "Mistero della fede"** (selezionabili)
- **6 Benedizioni solenni stagionali** (Avvento, Natale, Quaresima, Pasqua, Ascensione, Pentecoste)
- Calendario santi (70+ celebrazioni) + 14 messe votive
- Calcolo automatico del tempo liturgico

### Frontend (Expo Router)
- **Home**: data liturgica, indicatore colore stagione, 3 card grandi
- **Messa**: scroll unico con tutto l'Ordinario, ogni elemento nel suo posto liturgico corretto. Preselezioni automatiche in base alla stagione (es. oggi Pasqua: prefazio pasquale, tropari di Pasqua, congedo con Alleluia, benedizione solenne pasquale)
- **Calendario**: Santi per mese + Messe votive
- **Impostazioni**: Slider testo 24-60pt, tema chiaro/scuro, alto contrasto (persistenza AsyncStorage)

### Accessibilità
- Font scalabile proporzionalmente su tutta la UI
- Temi alto contrasto
- Touch target 64px+
- Rubriche in rosso corsivo

## Note liturgiche
I testi seguono la versione italiana attualmente in uso; si raccomanda verifica con l'edizione CEI del Messale Romano (III edizione, 2020).

## Stack
FastAPI, Motor/MongoDB, httpx, BeautifulSoup4; Expo 54, Expo Router 6, React Native 0.81, AsyncStorage, Slider.
