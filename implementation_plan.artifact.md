# Piano di Miglioramento Grafico e Strutturale

Questo piano descrive le modifiche per migliorare l'esperienza utente (UX) su tablet e la manutenibilità del codice, mantenendo l'allineamento ai testi del 2020.

## User Review Required

- **Tema Pergamena**: Lo sfondo sarà un seppia leggero (#FDF5E6 o simile) con testo **nero assoluto (#000000)** come richiesto. Confermi che vada bene anche per le rubriche (che resteranno rosse ma su sfondo crema)?
- **Modularità**: Il refactoring di `messa.tsx` non cambierà il funzionamento dell'app, ma sposterà il codice in pezzi più piccoli. Questo richiederà un test accurato per assicurarsi che tutte le selezioni (Gloria, Credo, etc.) vengano mantenute correttamente durante la navigazione.

## Proposed Changes

### 1. Esperienza di Lettura (Tema e Spaziatura)
- **SettingsContext.tsx**: Aggiunta del tema `parchment`.
- **localLiturgy.ts / messa.tsx**: Implementazione di un `lineHeight` dinamico proporzionale alla dimensione del font (es. 1.5x o 1.6x) per massimizzare la leggibilità all'altare.

### 2. Navigazione Rapida (Ricerca Prefazi)
- **messa.tsx**: Aggiunta di una barra di ricerca (`TextInput`) nel modale dei prefazi. Il filtro agirà in tempo reale su titoli e ID, mantenendo però la suddivisione in categorie.

### 3. Modularità del Codice (Refactoring)
- **frontend/src/components/**: Creazione di nuovi file per alleggerire `messa.tsx`:
    - `MassHeader.tsx`: La barra superiore con titolo e impostazioni.
    - `PrefaceSelectorModal.tsx`: Il modale per la scelta del prefazio (inclusa la nuova ricerca).
    - `MassReadingView.tsx`: Il componente che renderizza le pagine di testo con la nuova spaziatura.

## Verification Plan

### Automated Tests
- Esecuzione dei test esistenti in `backend/tests/` (anche se non tocchiamo il backend, serve come test di regressione).
- Verifica della validità dei JSON dopo le modifiche.

### Manual Verification
- Test sul tablet per verificare la resa cromatica del tema Pergamena.
- Verifica che la ricerca prefazi trovi correttamente termini come "Matrimonio" o nomi di santi.
- Controllo che i toggle (Gloria, Credo) funzionino ancora correttamente dopo il refactoring.
