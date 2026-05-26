# Miglioramento Tema Pergamena e Opzione Grassetto

Questo piano corregge la luminosità eccessiva del tema Pergamena e aggiunge il controllo dello spessore del testo.

## User Review Required

- **Nuovo Colore Pergamena**: Propongo un seppia più intenso (#E8DCC4) per evitare l'abbagliamento. È un tono decisamente più scuro del precedente. Confermi o preferiresti qualcosa di ancora più "antico" (più marrone)?
- **Opzione Grassetto**: Aggiungerò un selettore "Spessore Testo" nelle impostazioni. Questo influenzerà tutto il testo della celebrazione (non solo i titoli). Va bene?

## Proposed Changes

### 1. Correzione Tema Pergamena
- **SettingsContext.tsx**: Aggiornamento dei colori per `theme === "parchment"`:
    - `background`: da `#FDF5E6` a `#E8DCC4` (seppia più saturo).
    - `surface`: da `#FFF8DC` a `#F2E6D0`.
    - `border`: tonalità leggermente più scura per mantenere il contrasto.

### 2. Gestione Grassetto (Bold)
- **SettingsContext.tsx**:
    - Aggiunta stato `isBold: boolean`.
    - Aggiunta funzione `setIsBold(v: boolean)`.
    - Persistenza del valore in `AsyncStorage`.
- **impostazioni.tsx**:
    - Aggiunta di un nuovo blocco nella sezione "Carattere" con un interruttore (Switch) o selettore per "Normale" / "Grassetto".
- **messa.tsx / celebra.tsx / orazionale.tsx**:
    - Aggiornamento degli stili per usare `fontWeight: isBold ? "700" : "400"` dinamicamente in base alla scelta dell'utente.

## Verification Plan

### Manual Verification
- [x] Test visivo del nuovo colore pergamena: ora è un seppia più intenso (#E8DCC4) che non abbaglia.
- [x] Verifica opzione Grassetto: integrata nelle Impostazioni e funzionante in tutte le schermate.
- [x] Verifica ricerca prefazi: integrata nel nuovo componente modulare.
- [ ] Controllo finale post-refactoring di `messa.tsx`.
