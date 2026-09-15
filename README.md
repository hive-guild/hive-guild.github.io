# HIVE Forever

Live: [hive-guild.github.io/anmeldung/](https://hive-guild.github.io/anmeldung/) · [GitHub](https://github.com/hive-guild/hive-guild.github.io) · [Admin-Login](https://hive-guild.github.io/#/admin)

Nur die Hauptseite https://hive-guild.github.io/ wird gepflegt. Das alte Repository und die zweite Webseite werden nicht mehr aktualisiert. Das lokale Repository bleibt die Quelle; ausschließlich Remote `hive-pages` veröffentlichen.

## Anmeldung und Zugriff

- Teilnehmer melden sich über Discord an. Pro Konto gibt es genau eine Rückmeldung; nach erneutem Login werden die eigenen Angaben zum Bearbeiten geladen. Es gibt keine persönlichen Bearbeitungslinks mehr.
- Der Discordname stammt serverseitig aus der verifizierten Discord-Identität. Er wird nicht in einem Formular eingegeben und bleibt ausschließlich in der eigenen Rückmeldung und Admin-Ansicht sichtbar.
- Öffentlich gibt `hive_public_roster` genau **Name, Race, Class, Spec, Rolle, bevorzugten Server (PVE/PVP/Mir egal) Raid-Vorstellung sowie Raidtage, maximale Tage und Zeitfenster** zurück. Die vollständige Tabelle bleibt durch RLS nur für freigeschaltete Admins zugänglich.
- Der Admin-Login bleibt separat unter `#/admin`, mit E-Mail/Passwort und Freischaltung über `hive_admins`. Ein normales Discord-Konto erhält keine Admin-Rechte.
- Teilnehmer lesen, speichern und löschen ausschließlich über die drei `hive_*_my_registration`-RPCs. Diese bestimmen den Eigentümer aus `auth.uid()`, prüfen eine Discord-Identität und ignorieren vom Client mitgesendete Eigentümer oder Discordnamen. Die früheren Token-RPCs sind für `anon` und `authenticated` gesperrt.
- Supabase speichert die OAuth-E-Mail im Auth-Dienst; die Raid-Tabelle enthält keine E-Mail. Sitzungen liegen im Session Storage des jeweiligen Tabs. OAuth verwendet PKCE; Client-Secret und Service-Role-Key gehören niemals in `dist/` oder Git.

## Einrichtung

1. Für eine neue Datenbank `db/supabase.sql` ausführen. Für das laufende Projekt ausschließlich gezielte Migrationen unter `db/migrations` verwenden; zuletzt `2026-09-15-class-role-without-spec.sql`. Migrationen werden im Supabase-SQL-Editor ausgeführt und laufen dort in einer Transaktion; ein Push veröffentlicht nur die Webseite.
2. In Supabase Authentication einen Admin mit E-Mail/Passwort anlegen und seine UUID in `public.hive_admins(user_id)` eintragen.
3. `dist/config.js` enthält nur die öffentliche Supabase-URL und den Publishable Key.
4. Discord-App **HIVE FOREVER**, Client-ID `1549126667295785110`: OAuth2-Redirect `https://amsmtoxjkitcwzumwyuz.supabase.co/auth/v1/callback`. Das Client-Secret direkt im Supabase-Discord-Anbieter speichern. [Konfiguration und Prüfungen](docs/discord-login.md).
5. GitHub Settings → Pages → Source **Deploy from a branch**, Branch **gh-pages**, Ordner **/(root)**. Nach Build, Tests und Commit: `git push hive-pages main`, dann `python scripts/publish-pages.py`. Das Skript veröffentlicht nur den geprüften, eingecheckten Inhalt von `dist/` und pusht ohne Force ausschließlich auf die Hauptseite. Der Workflow auf `main` prüft den Code; GitHub veröffentlicht den Pages-Branch. Anschließend den Pages-Lauf und die Live-Version prüfen.

## Entwicklung und Prüfung

Die statischen Dateien liegen in `dist/`. Lokal mit einem HTTP-Server aus diesem Verzeichnis starten. Nach HTML-Änderungen `node scripts/build-pages.mjs` ausführen; das erzeugt die direkte Anmeldeseite `/anmeldung/` und eine gemeinsame, über den Inhalt versionierte Ausgabe von JavaScript, dessen Modulen und CSS unter `dist/releases/`. Beide HTML-Einstiege referenzieren dieselbe Version. Ältere Release-Ordner bleiben erhalten, damit auch zwischengespeicherte HTML-Seiten ihre passenden Dateien laden. Der Workflow erledigt dies ebenfalls vor der Veröffentlichung.

Die offizielle Supabase-Auth-Bibliothek ist lokal gebündelt und fest versioniert. Für Änderungen am Bundle: Abhängigkeiten mit pnpm installieren und `node scripts/build-auth.mjs` ausführen. `dist/vendor/` enthält das fertige Bundle samt Lizenz; Besucher brauchen kein externes JavaScript-CDN.

Prüfungen: `node --check dist/app.js`, `node --check dist/config.js`, `node --test tests/*.test.mjs`. `tests/raid-roles.test.mjs` sichert die Rollenableitung ab, `tests/mode-preferences.test.mjs` die Spielmodus-Statistik. `tests/discord-accounts.sql` prüft Speichern, Aktualisieren, Löschen, Kontentrennung, RLS und Admin-Rechte in einer Transaktion, die alle Testdaten zurückrollt. Den tatsächlichen Discord-Rücksprung zusätzlich im Browser prüfen.

## Race, Class und Raidzeiten

[Gültige Horde-Kombinationen und Quellen](docs/race-class-combinations.md). Unpassende Race-/Class-Kacheln bleiben sichtbar, sind ausgegraut und deaktiviert. „Auswahl zurücksetzen“ löscht nur Race, Class und Spec. Server und Formular verwenden dieselbe Matrix.

## Rollen und Spielmodus-Statistik

Klassen, Spezialisierungen und Rollen liegen zentral in `dist/raid-roles.js`; die SQL-Funktion `public.hive_role_for_spec` spiegelt dieselbe Zuordnung. Die Rolle wird bei jeder Anzeige neu aus Klasse und Spec abgeleitet, deshalb wirkt eine Verbesserung sofort für bereits gespeicherte Anmeldungen. Entscheidungsreihenfolge, Zuordnungstabelle und die Stellung manueller Rollen stehen in [docs/raid-roles.md](docs/raid-roles.md).

Sowohl die öffentliche Raid-Übersicht als auch das Adminpanel zeigen eine Statistik zum bevorzugten Spielmodus: je Modus die Anzahl der Spieler und den prozentualen Anteil an allen Spielern. Beide Oberflächen nutzen dieselbe Berechnung aus `dist/raid-roles.js` und immer den vollständigen Kader, unabhängig von Rollen- und Klassenfiltern; die Karte benennt diesen Bezug. Ein Spieler hat genau einen bevorzugten Spielmodus, deshalb addieren sich die Anteile zu 100 %. Jeder Modus hat eine eigene Akzentfarbe (PVE grün, PVP rot, „Mir egal" gelb), die in Formular, Übersicht und Adminpanel identisch erscheint. Die Balken beginnen in jedem Diagramm an derselben x-Position, damit die Länge den Anteil korrekt wiedergibt.

Maximal vier Raidtage pro Woche, Startzeiten `18:30`, `19:00`, `19:30`, `20:00`, Endzeiten `22:00`, `22:30`, `23:00`. „Kennen wir uns?“ bleibt optional. Neue Werte mit `18:00` werden serverseitig abgewiesen.

## Icons

Klassen, Spezialisierungen und Rollen nutzen unveränderte Spiel-Icons von [Blizzards offiziellen Klassenseiten](https://worldofwarcraft.blizzard.com/en-us/game/classes) und dem `render.worldofwarcraft.com`-CDN. Die vier klassischen Horde-Rassen zeigen unveränderte Charakterbilder von [Blizzards offizieller Rassenseite](https://worldofwarcraft.blizzard.com/en-us/game/races). Die vom Betreiber bereitgestellte Vorlage `wow-forever-background.png` enthält bereits das WoW-Forever-Logo. Aktiv ist die mit dem eingebauten Imagegen-Tool überarbeitete Fassung `wow-forever-background-hd.png` (1672 × 941 Pixel); Konturen und Schrift sind klarer, feine Bilddetails wurden dabei neu ausgearbeitet. [Prompt und Herkunft](docs/hero-image-notes.md) sind dokumentiert. Die bisherige Titelillustration `forever-hero-art.png` wird als abgedunkelter Hintergrund der Anmelde- und Raid-Überschrift verwendet; sie trägt eine Horley-Signatur. Diese Bilder und World of Warcraft sind © Blizzard Entertainment. Die [Blizzard Legal FAQ](https://www.blizzard.com/en-us/legal/10390250-087d-41fd-aa47-1a44cbacb10b/legal-faq) beschreibt eine widerrufliche, beschränkte Nutzung von Blizzard-Inhalten für private, nicht-kommerzielle Fan-Webseiten. Für eine kommerzielle oder anderweitige Veröffentlichung ist eine eigene Rechteprüfung nötig.

„Noch nicht sicher“ zeigt ein unverändertes WoW-Fragezeichen, aufbereitet als sauberes PNG (`role-flexible.png`). Skyborne nutzt einen zugeschnittenen und abgedunkelten Ausschnitt aus dem offiziellen Forever-Spielbild zur neuen Rasse — dieselbe Blizzard-Fan-Nutzung wie bei den übrigen Rassenbildern; Herkunft und Aufbereitung stehen in [docs/race-class-combinations.md](docs/race-class-combinations.md). Ein veröffentlichter Skyborne-Charaktereditor-Icon steht bislang nicht zur Verfügung. Wowhead- oder Warcraft-Wiki-Dateien werden nicht mitgeliefert.

Das statische HELLO-Emoji zeigt den Clown-Pepe beim Dab. Es stammt aus [„Honk Dab“ auf Tenor](https://tenor.com/view/honk-dab-pepe-the-frog-gif-14732365); [Quelle und Aufbereitung](docs/hello-emote.md) sind dokumentiert.

## Bevorzugter Server

Die Anmeldung fragt PVE, PVP oder „Mir egal“ ab und lädt die Auswahl beim Bearbeiten wieder. Sie ist auch öffentlich als kleines Badge sichtbar. „Mir egal“ wird als `ANY` gespeichert; die Auswahl verwendet dasselbe Icon-Set im Formular, in der öffentlichen Übersicht und im Adminpanel: Peace-Zeichen für PVE, gekreuzte Schwerter für PVP und Schulterzucken für „Mir egal“. Die beiden Emoji-Motive sind lokale, unveränderte Twemoji-SVGs (CC-BY 4.0), das Schwerter-Motiv stammt aus dem eingebauten Imagegen-Tool. [Dateien, Herkunft und Prompts](docs/server-icons.md) sind dokumentiert. Ältere Rückmeldungen ohne Auswahl zeigen „Noch offen“; ihnen wird keine Präferenz zugeordnet. Alte Clients ohne dieses Feld behalten beim Speichern eine bereits gesetzte Auswahl. Andere Werte werden serverseitig abgewiesen. `tests/server-mode.sql` prüft die Speicherung, Aktualisierung, Admin-Zugriffe und die elf ausdrücklich öffentlichen Felder mit anschließendem Rollback.

## Gemeinsame Raidzeiten und Discord-Tags

Unter den Rollenkacheln zeigen zwei Schalter die gemeinsamen Zeitfenster aller bisherigen Teilnehmer oder die beste Alternative mit weniger Teilnehmern, die zusätzliche Tage oder längere Zeitfenster ermöglicht. Beide Optionen stehen öffentlich und im Admin-Bereich bereit und berücksichtigen immer den gesamten Kader, unabhängig von Rollen- oder Klassenfiltern. Gleich gute Zeitfenster werden vollständig aufgeführt; jedes alternative Zeitfenster gilt für eine durchgehend verfügbare Gruppe und umfasst auch enthaltene Zeiten, zu denen alle können. Gibt es keinen zusätzlichen Spielraum, wird dies ausdrücklich angezeigt.

Der Discord-Kontakt verwendet den vom Anbieter bestätigten Benutzernamen einschließlich eines vorhandenen alten Diskriminators. Der Marker #0 entfällt bei modernen Discord-Benutzernamen. Die Migration korrigiert vorhandene verknüpfte Anmeldungen. Discord-Tags bleiben nur im eigenen Eintrag und im Admin-Bereich sichtbar. Prüfung: tests/discord-tags.sql.
