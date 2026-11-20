# Gjurmët e Tempullit

Lojë vrapimi pa fund në 3D (three.js), e paketuar si aplikacion Android me Capacitor.

Ara vrapon nëpër katër zona: Xhungla e Artë, Varret e Harruara, Ura mbi Greminë dhe Tempulli i Maleve.

## Kontrollet
- Rrëshqit majtas/djathtas: ndërro korsi ose merr kthesën
- Rrëshqit lart: kërce · Rrëshqit poshtë: rrëshqit
- Prek ekranin: gjuaj me amuletin

## APK
Çdo push në `main` ndërton automatikisht APK-në (GitHub Actions) dhe e publikon te **Releases**.
Shkarko `GjurmetETempullit.apk` në telefon dhe hape (lejo instalimin nga burime të panjohura).

## Zhvillimi
```bash
npm install
npm run serve        # luaj në shfletues: http://localhost:8080
npm run apk          # ndërto APK lokalisht (kërkon Android SDK + Java 21)
```

Struktura: `www/` përmban lojën (index.html, game.js, vendor/three.js, assets/), `android/` projektin Android.

Shiko [CREDITS.md](CREDITS.md) për burimet dhe licencat e aseteve.
