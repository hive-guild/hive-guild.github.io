# Öffentliche Raid-Rollen

Die öffentliche Übersicht leitet Tank, Healer, Melee DPS, Ranged DPS oder Flexible aus Klasse und Spec ab. Dieselbe abgeleitete Rolle steuert Zähler, Filter, Gruppierung, Sortierung und Badges. Gespeicherte Daten bleiben unverändert. Unbekannte oder offene Kombinationen bleiben Flexible.

Die zentrale Tabelle liegt in `dist/raid-roles.js`; `public.hive_role_for_spec` in `db/supabase.sql` spiegelt exakt dieselbe Zuordnung. Änderungen immer an beiden Stellen vornehmen.

## Entscheidungsreihenfolge

1. **Bewusst gesetzte Rolle:** Ist `role_manual` (oder das ältere `role_locked`) `true`, gilt der gespeicherte Wert `role`.
2. **Gültige Spezialisierung:** Die Rolle der gewählten Spec.
3. **Klasse ohne Spec:** Gibt es für die Klasse genau eine mögliche Rolle, wird sie direkt verwendet.
4. **Mehrere mögliche Rollen ohne Spec:** Flexible.
5. **Unvollständige oder unbekannte Angaben:** Flexible, ohne Fehler.

## Zuordnung

| Klasse | Ohne Spec | Tank | Healer | Melee DPS | Ranged DPS |
| --- | --- | --- | --- | --- | --- |
| Warrior | Flexible | Protection | – | Arms, Fury | – |
| Hunter | Flexible | – | – | Survival | Beast Mastery, Marksmanship |
| Rogue | **Melee DPS** | – | – | Assassination, Combat, Subtlety | – |
| Druid | Flexible | Feral (Bear) | Restoration | Feral (Cat) | Balance |
| Shaman | Flexible | – | Restoration | Enhancement | Elemental |
| Mage | **Ranged DPS** | – | – | – | Arcane, Fire, Frost |
| Warlock | **Ranged DPS** | – | – | – | Affliction, Demonology, Destruction |
| Priest | Flexible | – | Discipline, Holy | – | Shadow |
| Paladin | Flexible | Protection | Holy | Retribution | – |

**Fett** markiert Klassen, deren Spezialisierungen alle dieselbe Rolle belegen: Sie gehören auch ohne gewählte Spec bereits eindeutig zu dieser Rolle. Zuvor landeten genau diese Spieler fälschlich unter Flexible. Hunter gehört bewusst nicht dazu, weil Survival in diesem Build im Nahkampf kämpft.

`Not sure yet` („Noch nicht sicher") und ein leerer Wert bedeuten beide „keine Spec gewählt" und werden gleich behandelt.

## Manuelle Rollen

Das Projekt kennt derzeit **keine** manuelle Rollenauswahl: Die Anmeldung erfasst nur Klasse und Spec, und Datenbank wie Oberfläche berechnen die Rolle ausschließlich daraus. Das Feld `role` ist damit reine abgeleitete Information und wird von der automatischen Zuordnung überschrieben. Ein bewusst gesetzter Wert wäre über `role_manual = true` möglich und hätte Vorrang vor jeder Ableitung; diese Priorität ist in `dist/raid-roles.js` und in `public.hive_role_for_spec` vorbereitet, aber nicht Teil der Anmeldung.

Deshalb blockieren alte, automatisch gespeicherte Werte (`Flexible` oder das frühere grobe `Damage`) die verbesserte Zuordnung nicht: Die Oberfläche leitet die Rolle immer neu aus Klasse und Spec ab und speichert nichts nach.

## Bestehende Anmeldungen

Die Korrektur wirkt ohne erneutes Speichern, weil die Rolle bei jeder Anzeige neu berechnet wird. Zusätzlich korrigiert `db/migrations/2026-09-15-class-role-without-spec.sql` die gespeicherten Werte in einem Schritt; die Migration muss weiterhin manuell im Supabase-SQL-Editor ausgeführt werden. Fehlende Präferenzen entstehen dabei nicht.

## Herkunft der Spec-Zuordnung

Die Klassen und Spezialisierungen stammen aus dem Forever-Client dieses Projekts; die Matrix der Horde-Kombinationen steht in [race-class-combinations.md](race-class-combinations.md) und `dist/race-classes.js`. Survival ist eine vorläufige Zuordnung auf Grundlage der dokumentierten Forever-Demo-Talente, insbesondere der Verstärkung von Nahkampffähigkeiten. Quelle, geprüft am 14.09.2026: https://classicwowforever.com/talents/hunter/ . Bei Änderungen am Beta-Spielstil die zentrale Zuordnung in `dist/raid-roles.js` und die SQL-Funktion anpassen.

Die Klassen-Icons werden nicht mehr aus einer zweiten Liste im Frontend, sondern aus der zentralen Tabelle abgeleitet (`class-<klasse>.jpg`, Spec-Icons nach dem Muster `spec-<klasse>-<spec>.jpg`).
