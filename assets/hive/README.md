# HIVE artwork package

Every graphic that belongs to this project and to nothing else lives here. Nothing outside this
folder is custom work — if a file is not in here, it is a third-party asset and is listed at the
bottom.

```
dist/assets/hive/
├── brand/     logo, favicons, banner, backgrounds, emoji used in the copy
├── classes/   the nine class crests
├── races/     the five Horde race portraits
├── roles/     the five role artwork files
├── specs/     the thirty-one specialisation icons
└── modes/     the three play-mode glyphs
```

## How the code finds a file

`iconUrl()` in `dist/app.js` resolves every icon through this folder. It reads the group from the
file name prefix, so callers keep passing plain names:

| prefix | folder |
|---|---|
| `class-` | `classes/` |
| `race-` | `races/` |
| `role-` | `roles/` |
| `spec-` | `specs/` |
| `mode-` | `modes/` |

`iconUrl("class-druid.jpg")` becomes `./assets/hive/classes/class-druid.jpg`. A name without a
known prefix stays at the top level of the package, and an extension-less name gets `.svg`.

## brand/

| file | where it is used |
|---|---|
| `hive-logo.jpg` | header, intro, footer; also the source the favicons were cut from |
| `favicon.svg` | browser tab — the 64 px PNG below, embedded as base64 |
| `favicon-32.png`, `favicon-16.png` | browser tab fallbacks |
| `favicon-64.png` | the source inside `favicon.svg`; keep it, the SVG embeds it |
| `apple-touch-icon.png` | home screen on iOS |
| `hive-guild-logo.png` | guild logo, currently unused by the pages |
| `banner-raid-uebersicht.png` | landscape banner on the overview and the sign-up page |
| `hintergrund-wow-forever.png`, `hintergrund-wow-forever-hd.png` | page backgrounds |
| `discord.svg` | sign-in buttons |
| `hello-clown-pepe.png` | the emoji in the copy |

## The favicons were cut from the logo

The fox mark is the region of `hive-logo.jpg` above the wordmark, squared with a tenth of air and
laid on the page tone `#171c25` with rounded corners. A dark plate rather than transparency,
because the mark is white and would disappear in a light browser theme.

## Sizes

| group | files | size |
|---|---|---|
| brand | 13 | ~3.6 MB (the banner and backgrounds are large) |
| classes | 9 | 40 KB |
| races | 5 | 318 KB |
| roles | 5 | 33 KB |
| specs | 31 | 80 KB |
| modes | 3 | 5 KB |

## Third-party artwork, not part of this package

These come from outside and stay where they are, beside the package:

- **Class, race, spec and role artwork** — from the game files, © Blizzard Entertainment. The
  package holds the project's own selection and treatment of them.
- **The question mark of the "tbd" role** — the Twemoji glyph (U+2753), CC BY 4.0.
- **`hive-logo.jpg`** — the guild's own mark, drawn for HIVE.

Credits for all of it are shown in the page footer under "Picture-Credits".

## Adding a file

1. Drop it in the matching folder, named after the table above.
2. Reference it by plain name — `iconUrl` adds the folder.
3. Run `node work/check-artwork.mjs`. It loads the overview and the form in a browser and reports
   any image that failed, so a wrong path shows up before it reaches the live page.
