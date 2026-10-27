# Marcel & Bubi Kasse

Gemeinsame Kosten erfassen und aufteilen (wie Splitwise), für Marcel und Bubi.
Mehrere Kassen (z. B. Alltag, Urlaub), Salden getrennt in CHF und EUR.

- Läuft als Web-App auf iPhone und Android (zum Home-Bildschirm hinzufügen).
- Daten liegen in Firebase Firestore (Projekt `wg-kasse-fab95`).
- Zugang über den Link mit dem Haushalt-Code (`?h=...`). Den Link nur an Mitbewohner weitergeben.
- Datenbank-Regeln: siehe `firestore.rules` (in der Firebase-Konsole unter Firestore > Regeln einfügen).
