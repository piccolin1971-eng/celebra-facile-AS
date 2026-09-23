# Aggiornamento APK in-app

## Cosa fa l’app
- All’avvio (Android): controlla `GitHub Releases/latest` (repo pubblico).
- Se `versionCode` remoto > locale: dialogo Aggiorna ora / Più tardi.
- «Aggiorna ora» **scarica l’APK in app** e apre l’installer Android (niente browser GitHub).
- In Impostazioni → «Controlla aggiornamenti».
- Serve il permesso `REQUEST_INSTALL_PACKAGES` (e, su alcuni telefoni, «Consenti installazione da questa app»).

## Prerequisito firma (obbligatorio per update senza disinstallare)
1. Genera keystore: `bash scripts/generate-release-keystore.sh celebra-release.keystore celebra 'PASSWORD'`
2. Secrets GitHub del repo:
   - `ANDROID_KEYSTORE_BASE64`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`
3. I push su `main` pubblicano una Release `v1.0.N` con APK + `version.json`.

Senza secrets il workflow firma ancora in debug (build ok) ma gli aggiornamenti in-place non sono affidabili tra build diverse.

## Nota
Il repo deve essere **pubblico** (o gli asset altrimenti raggiungibili senza login), altrimenti il controllo versioni fallisce.
