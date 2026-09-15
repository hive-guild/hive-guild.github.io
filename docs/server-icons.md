# Spielmodus-Icons

Die Spielmodus-Auswahl nutzt an allen drei Stellen — Anmeldeformular, öffentliche Raid-Übersicht und Adminpanel — dieselbe Zuordnung aus `dist/app.js` (`serverModeIcons`). Ein Modus wird also überall gleich dargestellt.

| Auswahl | Datei | Motiv | Herkunft |
| --- | --- | --- | --- |
| PVE | [mode-peace.svg](../dist/assets/icons/mode-peace.svg) | Peace-Zeichen (✌️) | [Twemoji](https://github.com/jdecked/twemoji) |
| PVP | [server-pvp-art.png](../dist/assets/icons/server-pvp-art.png) | Gekreuzte Schwerter | Eigenes Imagegen-Motiv, [Prompt unten](#pvp-prompt) |
| Mir egal (ANY) | [mode-shrug.svg](../dist/assets/icons/mode-shrug.svg) | Schulterzucken (🤷) | [Twemoji](https://github.com/jdecked/twemoji) |

## Emoji-Motive (PVE, Mir egal)

Die beiden Motive sind unveränderte Twemoji-SVGs (CC-BY 4.0). Sie liegen lokal im Projekt, damit Besucher kein externes CDN brauchen — genau wie die übrigen Assets. Die Dateien enthalten kein Skript und keinen externen Verweis.

- Peace-Zeichen: `270c.svg` → `mode-peace.svg`
- Schulterzucken: `1f937.svg` → `mode-shrug.svg`

Quelle: <https://github.com/jdecked/twemoji> · Lizenz: [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) · Urheber: Twitter, Inc. und Mitwirkende.

## PVP-Prompt

Erzeugt am 14.09.2026 mit dem eingebauten Imagegen-Tool, Modus: Generate (keine CLI). Das PNG-Original wurde unverändert in das Projekt kopiert und wird per CSS auf die Anzeigegröße skaliert.

```text
Use case: stylized-concept. Asset type: one square inventory/ability icon for the HIVE WoW Forever guild signup website, displayed at 34–40 pixels. Create an original richly hand-painted fantasy MMORPG interface icon in the visual tradition of World of Warcraft ability icons. Square 1024x1024 image. Thick chunky readable central silhouette occupying 80% of the square, dramatic bevels and highlights, dark vignetted navy background, a restrained thin aged bronze square rim flush with the outer edge. High contrast and simple readable structure at small size. Painterly dimensional materials, not flat vector art. No letters, numbers, labels, logos, question marks, watermarks or exterior padding. Subject: two clearly crossed steel swords, forming a strong X, broad silver-blue blades pointing to the upper corners and short aged-gold hilts toward the lower corners. Ember-red glow behind the crossing. Communicates player-versus-player combat. Two complete swords; uncluttered, no helmet or person.
```

## Frühere Motive

Bis zum 15.09.2026 zeigten PVE ein Dungeonportal und „Mir egal" einen Kompass (beide als Imagegen-PNG, rund 2,5 MB je Datei). Diese beiden Dateien wurden durch die Emoji-Motive ersetzt und aus dem Projekt entfernt. Die zugehörigen Prompts bleiben zur Nachvollziehbarkeit hier erhalten:

<details>
<summary>Prompt Dungeonportal (ehemals PVE)</summary>

```text
Use case: stylized-concept. Asset type: one square inventory/ability icon for the HIVE WoW Forever guild signup website, displayed at 34–40 pixels. Create an original richly hand-painted fantasy MMORPG interface icon in the visual tradition of World of Warcraft ability icons. Square 1024x1024 image. Thick chunky readable central silhouette occupying 80% of the square, dramatic bevels and highlights, dark vignetted navy background, a restrained thin aged bronze square rim flush with the outer edge. High contrast and simple readable structure at small size. Painterly dimensional materials, not flat vector art. No letters, numbers, labels, logos, question marks, watermarks or exterior padding. Subject: a monumental stone dungeon doorway seen straight on, chunky weathered arch around a luminous blue-purple magical portal. A few broad carved stone shapes, warm bronze accents. Communicates exploring dungeons and adventures against the environment. Portal silhouette must be immediately recognizable.
```

</details>

<details>
<summary>Prompt Kompass (ehemals Mir egal)</summary>

```text
Use case: stylized-concept. Asset type: one square inventory/ability icon for the HIVE WoW Forever guild signup website, displayed at 34–40 pixels. Create an original richly hand-painted fantasy MMORPG interface icon in the visual tradition of World of Warcraft ability icons. Square 1024x1024 image. Thick chunky readable central silhouette occupying 80% of the square, dramatic bevels and highlights, dark vignetted navy background, a restrained thin aged bronze square rim flush with the outer edge. High contrast and simple readable structure at small size. Painterly dimensional materials, not flat vector art. No letters, numbers, labels, logos, question marks, watermarks or exterior padding. Subject: a sturdy round brass adventure compass with a large four-point wind rose and a luminous turquoise center on a dark leather backing. Simple unmistakable compass silhouette, broad gold directions with no letters. Communicates freedom to choose either path, no fixed preference. No question mark or dice.
```

</details>
