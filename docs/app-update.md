# Aggiornamento APK in-app

## Cosa fa l’app
- All’avvio (Android): controlla `GitHub Releases/latest`.
- Se `versionCode` remoto > locale: dialogo Aggiorna ora / Più tardi.
- «Aggiorna ora» apre il download dell’APK; Android chiede conferma Installa.
- In Impostazioni → «Controlla aggiornamenti».

## Prerequisito firma (obbligatorio per update senza disinstallare)
1. Genera keystore: `bash scripts/generate-release-keystore.sh celebra-release.keystore celebra 'PASSWORD'`
2. Secrets GitHub del repo:
   - `ANDROID_KEYSTORE_BASE64`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`
3. I push su `main` pubblicano una Release `v1.0.N` con APK + `version.json`.

Senza secrets il workflow firma ancora in debug (build ok) ma gli aggiornamenti in-place non sono affidabili tra build diverse.
