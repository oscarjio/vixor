import test from "node:test";
import assert from "node:assert/strict";
import {
  bearing, distanceKm, cardinal, compassHeading, smoothAngle, turnNeeded, alignState,
  parseCoordinates, isShortLink, unwrapContinueUrl, norm360,
} from "../www/lib.mjs";

const near = (a, b, tol = 0.5) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (±${tol})`);

test("bäring: väder-ilmstreck", () => {
  near(bearing(0, 0, 1, 0), 0);      // rakt norr
  near(bearing(0, 0, 0, 1), 90);     // rakt öster
  near(bearing(1, 0, 0, 0), 180);    // rakt söder
  near(bearing(0, 1, 0, 0), 270);    // rakt väster
});

test("bäring och avstånd: Göteborg -> Stockholm", () => {
  // Göteborg 57.7089,11.9746  Stockholm 59.3293,18.0686 (ca 398 km, bäring ca 60,4 grader, kontrollräknad separat)
  const b = bearing(57.7089, 11.9746, 59.3293, 18.0686);
  near(b, 60.44, 0.1);
  near(distanceKm(57.7089, 11.9746, 59.3293, 18.0686), 398, 5);
});

test("avstånd: 1 grad latitud är ca 111,2 km", () => {
  near(distanceKm(0, 0, 1, 0), 111.19, 0.2);
});

test("kardinal", () => {
  assert.equal(cardinal(0), "N");
  assert.equal(cardinal(90), "O");
  assert.equal(cardinal(180), "S");
  assert.equal(cardinal(270), "V");
  assert.equal(cardinal(359), "N");
  assert.equal(cardinal(225), "SV");
});

test("compassHeading: liggande telefon", () => {
  near(compassHeading(0, 0, 0), 0);
  near(compassHeading(90, 0, 0), 270);   // vriden åt vänster -> väst
  near(compassHeading(270, 0, 0), 90);
  near(compassHeading(180, 0, 0), 180);
});

test("compassHeading: stående telefon (kameran pekar)", () => {
  near(compassHeading(0, 90, 0), 0);
  near(compassHeading(90, 90, 0), 270);
  near(compassHeading(180, 90, 0), 180);
});

test("smoothAngle hanterar 359 -> 1", () => {
  const r = smoothAngle(359, 1, 0.5);
  near(r, 0, 0.01);
  assert.equal(smoothAngle(null, 123), 123);
});

test("turnNeeded och alignState", () => {
  near(turnNeeded(10, 350), 20);
  near(turnNeeded(350, 10), -20);
  near(turnNeeded(180, 0), 180, 0.001);
  assert.equal(alignState(3), "good");
  assert.equal(alignState(-4.9), "good");
  assert.equal(alignState(10), "warn");
  assert.equal(alignState(-40), "bad");
});

test("parseCoordinates: decimaltal", () => {
  assert.deepEqual(parseCoordinates("57.7089, 11.9746"), { lat: 57.7089, lon: 11.9746 });
  assert.deepEqual(parseCoordinates("57,7089; 11,9746"), { lat: 57.7089, lon: 11.9746 });
  assert.deepEqual(parseCoordinates("  -33.8688 151.2093 "), { lat: -33.8688, lon: 151.2093 });
});

test("parseCoordinates: Google Maps-länkar", () => {
  assert.deepEqual(
    parseCoordinates("https://www.google.com/maps/place/Mast/@57.70,11.97,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!7e2!8m2!3d57.7123!4d11.9812"),
    { lat: 57.7123, lon: 11.9812 }, // nålen (!3d!4d) vinner över kartans mittpunkt
  );
  assert.deepEqual(parseCoordinates("https://www.google.com/maps/@57.7089,11.9746,17z"), { lat: 57.7089, lon: 11.9746 });
  assert.deepEqual(parseCoordinates("https://maps.google.com/?q=57.7089,11.9746"), { lat: 57.7089, lon: 11.9746 });
  assert.deepEqual(parseCoordinates("https://www.google.com/maps?ll=57.5,12.1&z=10"), { lat: 57.5, lon: 12.1 });
  assert.deepEqual(parseCoordinates("https://www.google.com/maps/search/?api=1&query=57.7089%2C11.9746"), { lat: 57.7089, lon: 11.9746 });
});

test("parseCoordinates: upplöst Maps-kortlänk (Aleklätten)", () => {
  assert.deepEqual(
    parseCoordinates("https://www.google.com/maps/search/57.904558,+12.018408?entry=tts&g_ep=EgoyMDI2MTAyOC4wIPu8ASoASAFQAw%3D%3D"),
    { lat: 57.904558, lon: 12.018408 },
  );
});

test("parseCoordinates: grader minuter sekunder", () => {
  const r = parseCoordinates("57°42'32.0\"N 11°58'29.0\"E");
  near(r.lat, 57.70889, 0.0001);
  near(r.lon, 11.97472, 0.0001);
  const w = parseCoordinates("57°42'N 11°58'W");
  assert.ok(w.lon < 0);
});

test("parseCoordinates: ogiltigt", () => {
  assert.equal(parseCoordinates(""), null);
  assert.equal(parseCoordinates("hej"), null);
  assert.equal(parseCoordinates("123.4, 11.9"), null); // lat utanför intervallet
});

test("kortlänkar och continue-url", () => {
  assert.ok(isShortLink("https://maps.app.goo.gl/AbCdEf123"));
  assert.ok(isShortLink("https://goo.gl/maps/xyz"));
  assert.ok(!isShortLink("https://www.google.com/maps/@57.7,11.9,15z"));
  assert.equal(
    unwrapContinueUrl("https://consent.google.com/m?continue=https://www.google.com/maps/@57.7,11.9,15z&gl=SE"),
    "https://www.google.com/maps/@57.7,11.9,15z",
  );
});

test("norm360", () => {
  assert.equal(norm360(-10), 350);
  assert.equal(norm360(370), 10);
});
