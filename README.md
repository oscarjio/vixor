# Vixor

Android-app för att **rikta in en antenn mot en mast** och en inbyggd **NanoVNA-guide** (LOGMAG, SWR, Smith).

## Installera

Ladda ner senaste APK från [Releases](https://github.com/oscarjio/vixor/releases/latest) (byggs automatiskt av GitHub Actions) eller från `apk/Vixor.apk` på telefonen och öppna filen. Android frågar om tillåtelse att installera från okända källor första gången.
Alla byggen signeras med samma fasta debugnyckel (`android/debug.keystore`, inte hemlig eftersom repot är publikt), så en ny APK går att installera över en gammal.

## Funktioner

**Rikta**
- Välj mast, tryck *Starta*. Appen läser GPS och kompass och visar en pil mot masten.
- Grön ruta när du pekar rätt (±5°), gul inom ±15°, röd annars.
- Visar bäring till masten (sann nord), vad du pekar mot, avstånd och din position.
- Telefon liggande: överkanten pekar. Telefon stående: baksidan pekar.
- **Missvisning** ställs in under *Inställningar* (grader öst/väst). Standard är +4,5° (ungefär Göteborgstrakten). Kompassen visar magnetisk nord och appen räknar om till sann nord. Kontrollera gärna aktuellt värde för din plats.
- Manuell egen position om GPS saknas.

**Master**
- Förinlagda: Aleklätten mast (57,904558, 12,018408) och Emmylund mast (57,962096, 12,142048).
- Lägg till fler med koordinater (`57.9045, 12.0184`), grader/minuter/sekunder eller en Google Maps-länk. Korta länkar (`maps.app.goo.gl`) löses upp när telefonen har internet.

**Guide**
- Samma innehåll som `docs/NanoVNA_antennguide.pdf`: bra värden, kortslutning och öppen krets, hur reflektioner syns, felsökning och mätprocedur, med bilder.

## Bygga själv

Kräver Node 22 och JDK 21 (och Android SDK för APK).

```bash
npm install
npm test                    # enhetstester för bäring, avstånd, länkparsning, kompass
npx cap sync android
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

GitHub Actions (`.github/workflows/android.yml`) bygger APK:n vid varje push och lägger den som artefakt.

## Teknik

Capacitor 8 med vanlig HTML/JS (ingen ramverksbyggprocess). All logik som kan testas ligger i `www/lib.mjs`.
Appikonen är Vixor-symbolen från vixor.com.
