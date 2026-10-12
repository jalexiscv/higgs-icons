# Spec 01: Document model and native JSON format (Skriba → C++/JUCE)

Status: implementation-ready reference. Source of truth is the Skriba web app at
`C:/xampp/htdocs/Skriba`. Every claim has a `file:line` reference so you can check it.
**The C++ engineer does not need to read the JS/PHP.** Where the JS has a bug or an
inconsistency, this spec says so and gives a recommendation, marked **[JS-BUG]**,
**[QUIRK]** or **[REC]**.

Path abbreviations used in references:

| Abbrev | Path |
|---|---|
| `doc.js` | `public/js/core/document.js` |
| `rt.js` | `public/js/core/richtext.js` |
| `theme.js` | `public/js/core/theme.js` |
| `units.js` | `public/js/core/units.js` |
| `bus.js` | `public/js/core/eventbus.js` |
| `tpl.js` | `public/js/core/templates.js` |
| `table.js` | `public/js/tables/table.js` |
| `tstyles.js` | `public/js/tables/tablestyles.js` |
| `lists.js` | `public/js/formatting/lists.js` |
| `styles.js` | `public/js/formatting/styles.js` |
| `charfmt.js` / `parafmt.js` | `public/js/formatting/charfmt.js`, `parafmt.js` |
| `refs.js` | `public/js/editor/references.js` |
| `insert.js` | `public/js/editor/insert.js` |
| `reg.js` | `public/js/commands/registry.js` (the undoable command layer; it shows how the model is actually mutated) |
| `main.js` | `public/js/main.js` |
| `Reader.php` / `Conv.php` | `src/lib/OOXML/Reader.php`, `src/lib/OOXML/Converters.php` |
| `common.php` | `src/api/_common.php` |
| `CONTRACTS` / `plan` / `NOTES` | `CONTRACTS.md`, `plan.md`, `INTEGRATION_NOTES.md` |

---

## 0. Key ideas

1. **The persisted JSON and the in-memory model have the same shape.** Blocks and runs are plain
   objects (POJOs). The model does not wrap them in classes (`doc.js:12-13`). C++ can use typed
   structs, but it **must round-trip unknown keys** on blocks, runs, `char`, `para`, cells, sections
   and styles. The JS keeps any key it does not know about, because it deep-clones whole objects.
   See §14.
2. **`doc.body` is a flat array, even though the plan says otherwise.** Table-cell paragraphs,
   header/footer paragraphs and footnote paragraphs all live in `doc.body` as ordinary `p` blocks.
   Each one carries a marker: `cell`, `hf` or `fn`. The table block only lists the ids of its cell
   paragraphs (`table.js:4-22`, `NOTES:113-137`, `NOTES:226-229`). Plan §5.1 nests paragraphs inside
   tables and sections, but the app does not do that (see §15).
3. **All model measurements are in twips** (1/20 pt). The exceptions are listed in §2.3.
4. **Positions are `{blockId, offset}`.** `offset` is a *linear* index inside one block, counted in
   **UTF-16 code units**. Every non-text run has length 1 (`rt.js:9-21`,
   `CONTRACTS:39-43`). The plan says to count code points (`plan:409`); the app does not, and
   **UTF-16 is the rule that applies.**
5. **Format is sparse.** A key that is present is an override. A key that is absent inherits from
   the paragraph style, then from the hard defaults. In a format *delta*, `null` removes an
   override and `undefined` (absent) leaves the key untouched (`rt.js:27-36`).

---

## 1. Units and paper sizes (`units.js`)

### 1.1 Constants and conversions

| Function | Formula | Rounding | Ref |
|---|---|---|---|
| `TWIPS_PER_PT` | 20 | | `units.js:10` |
| `PT_PER_PX` | 72/96 = 0.75 | | `units.js:11` |
| `ptToTwips(pt)` | `pt*20` | `round` (JS `Math.round`: halves go toward +∞) | `units.js:14-16` |
| `twipsToPt(tw)` | `tw/20` | none (float) | `units.js:19-21` |
| `twipsToPx(tw, zoom=1)` | `tw/20 * 96/72 * zoom` (that is, `tw/15*zoom`) | none | `units.js:24-26` |
| `pxToTwips(px, zoom=1)` | `(px/zoom) * 72/96 * 20` (that is, `px/zoom*15`) | `round` | `units.js:29-31` |
| `mmToTwips(mm)` | `mm*1440/25.4` | `round` | `units.js:34-36` |
| `twipsToMm(tw)` | `tw*25.4/1440` | none | `units.js:39-41` |
| `cmToTwips(cm)` | `mmToTwips(cm*10)` | `round` | `units.js:44-46` |
| `twipsToCm(tw)` | `twipsToMm(tw)/10` | none | `units.js:49-51` |

Test vectors: `ptToTwips(11)=220`, `twipsToPx(1440,1)=96`, `cmToTwips(2.54)=1440`.

**JS `Math.round` vs C++.** `Math.round(-2.5)` returns −2, while `std::round(-2.5)` returns −3.
Use `std::floor(x + 0.5)` to match the JS. PHP `round()` rounds halves away from zero, so it
behaves like C++ `std::round`.

### 1.2 Paper sizes (twips, portrait w × h). `paperSize(name)`, `units.js:54-67`

| Name (exact, case-sensitive) | w | h |
|---|---|---|
| `A4` (also the fallback for unknown names) | 11906 | 16838 |
| `Letter` | 12240 | 15840 |
| `A3` | 16838 | 23811 |
| `A5` | 8391 | 11906 |
| `B5` | 9979 | 14173 |
| `Legal` | 12240 | 20160 |
| `Oficio` | 12240 | 20160 (**[QUIRK]** the same as Legal; the real Colombian oficio is 8.5×13 in. Keep 20160 for parity.) |
| `Executive` | 10440 | 15120 |
| `Tabloid` | 15840 | 24480 |

Each call returns a new object. Landscape is stored as **physical** dimensions with `w > h` and
`orient:'landscape'` (`tpl.js:98-118`, `reg.js:1103-1114`).

### 1.3 Other numeric conventions

- Default A4 text width = 11906 − 2·1440 = **9026** twips. This value is hard-coded in many places:
  `tpl.js:35`, `refs.js:21` (TOC right tab), `reg.js:1397`, `reg.js:1525`, `Reader.php:2059`.
- Default tab stop interval is 720 twips (`layout/breaker.js:46`).
- Line spacing `para.line`: when `lineRule` is absent or `'auto'`, the value is in 1/240 of a line
  (240 = single, 276 = "1,08", which the UI and NOTES call 1.15, 360 = 1.5, 480 = double). When
  `lineRule` is `'exact'` or `'atLeast'`, the value is absolute twips (`breaker.js:31-32,369-374`,
  `NOTES:46-48`, `parafmt.js:50`: `{'1.0':240,'1.15':276,'1.5':360,'2.0':480}`).
- Font size is in points and may be fractional in steps of 0.5, range 1–1638 (`charfmt.js:35-36`,
  `charfmt.js:96-100`). Templates use 8.5 and 9.5 (`tpl.js:380,419`). Grow/shrink scale:
  `[8,9,10,11,12,14,16,18,20,22,24,26,28,36,48,72]` (`charfmt.js:30-32`).

---

## 2. Top-level document object

### 2.1 Field table (exact `toJSON()` key order, `doc.js:236-264`)

| # | Key | Type | Default when missing (`doc.js:111-169`) | Notes |
|---|---|---|---|---|
| 1 | `version` | int | `1` (`DOC_VERSION`, `doc.js:24`) | `fromJSON` requires it to be present and `Number(version)===1`. See §2.2. |
| 2 | `app` | string | `"Skriba-word"` | |
| 3 | `locale` | string | `"es-ES"` | Can be changed with `setDocProps({locale})`. |
| 4 | `name` | string | `"Documento1.docx"` | Includes the extension. |
| 5 | `createdAt` | string ISO-8601 UTC | now (`new Date().toISOString()`, for example `2026-08-02T10:00:00.000Z`) | PHP writes `gmdate('c')` (`+00:00`) or `Y-m-d\TH:i:s\Z`. Accept any ISO-8601 form. |
| 6 | `modifiedAt` | string ISO-8601 | now | `touch()` updates it after every command (`doc.js:410-413`, `reg.js:384-402`). |
| 7 | `theme` | **map** | `defaultTheme()` | Must be an object, not an array. See §3. |
| 8 | `styles` | array of Style | `defaultStyles()` | **[REC]** If the array is empty, the app replaces it with `defaultStyles()` *before* calling `fromJSON` (`main.js:162-165,189-191,216-218`). The server stores `styles: []` for new documents (`common.php:916-931`). Do the same on load. |
| 9 | `numbering` | array of ListDef | `[]` | See §8. |
| 10 | `sections` | array of Section, never empty | `[defaultSection('sec1')]` when missing or empty | See §4. |
| 11 | `body` | array of Block | `[]` | **[REC]** Normalise an empty body to `[{t:'p',id:'b1',sec:<first section id>,style:'Normal',runs:[]}]`, as PHP does (`Conv.php:448-453`). The JS `fromJSON` accepts an empty body as it is. |
| 12 | `footnotes` | array | `[]` | **Legacy, from the plan.** Never written by the app. Real notes are `fn` blocks (§6.6). Preserve it as is. |
| 13 | `comments` | array of Comment | `[]` | §10.1 |
| 14 | `trackChanges` | array | `[]` | **Legacy, from the plan.** Never written. Revisions live in `char.ins`/`char.del` (§5.3). Preserve it as is. |
| 15 | `media` | **map** rid → MediaInfo | `{}` | §9 |
| 16 | `bookmarks` | array of Bookmark | `[]` | §10.2 |
| 17 | `pageColor` | string or null | `null` | CSS color, for example `'#FFF2CC'`. Applies to every page (`main.js:916`). Note: `data.pageColor ?? null` keeps any value it is given. |
| 18 | `watermark` | object or null | `null` (a falsy value becomes null) | §10.4 |
| 19 | `pageBorder` | object or null | `null` | §10.5 (units are **px**, not twips) |
| 20 | `tracking` | **map** | `{enabled:false, author:'Autor', showMarks:true}` | §10.3 |
| 21 | `protection` | **map** | `{mode:'none'}` | `mode` ∈ `'none'`, `'tracked'`, `'comments'`, `'readOnly'` (`doc.js:155-156`, `reg.js:1946`). |
| 22 | `ink` | **map** pageNo(string) → Stroke[] | `{}` | §10.6 |
| 23 | `mailMerge` | object or null | `null` | `{fields: string[], records: object[]}` (`ui/dialogs/mailmerge.js:12,73`; `editor/mailmerge.js:39-78`). |
| 24 | `dictionary` | string[] | `[]` | User dictionary (lowercase words). |
| 25 | `activeView` | **map** | `{view:'print', zoom:1, page:1}` | Stored and round-tripped. The app never reads it back. |

Load-time sanitising (`doc.js:126-164`):

- **Map fields** (`theme`, `media`, `tracking`, `protection`, `ink`, `activeView`) go through
  `asMap()` (`doc.js:53-56`). A value that is not a non-array object is replaced by the default.
  Reason: PHP decodes `{}` as `[]` and re-encodes it as `[]`. Writing `media[rid]` onto an array
  would then be silently dropped by `JSON.stringify` (`doc.js:41-52`, `CONTRACTS:91-94`). On the
  server, `fix_empty_objects()` restores `{}` for these six keys (`common.php:867-878`).
  **[REC]** The C++ JSON reader should accept `[]` for these keys and treat it as an empty map.
- **Array fields** use `Array.isArray(x) ? deepClone(x) : default`.
- `watermark`, `pageBorder` and `mailMerge` use `x ? clone : null`.

### 2.2 Validation (`DocModel.fromJSON`, `doc.js:208-229`)

| Condition | Error (Spanish message, quote verbatim) |
|---|---|
| The string does not parse as JSON | `TypeError('Documento inválido: el JSON no se pudo analizar')` |
| Not an object, or is an array | `TypeError('Documento inválido: se esperaba un objeto JSON')` |
| `version` missing or null | `Error('Documento inválido: falta el campo "version"')` |
| `Number(version) !== 1` | ``Error(`Versión de documento no soportada: ${version} (se esperaba 1)`)`` |

The server-side minimum check (`common.php:833-861`, HTTP 422) is: `version` is an *int*;
`sections` is a non-empty list of objects, each with a non-empty string `id`; `body` is a list of
objects. Messages: `'El documento debe ser un objeto'`, `'Falta "version" (entero)'`,
`'"sections" debe ser un array no vacío'`, `"La sección $i no es un objeto"`,
`"La sección $i no tiene \"id\""`, `'"body" debe ser un array de bloques'`,
`"El bloque $i no es un objeto"`.

### 2.3 Unit exceptions (fields that are not twips)

| Field | Unit |
|---|---|
| `char.size` | pt (float, steps of 0.5) |
| `char.spacing` (docx import only) | twips (`Reader.php:1034-1039`). Not rendered. |
| `char.effect.spacing`, `char.effect.stroke.width` | CSS px |
| `para.line` with `lineRule:'auto'`/absent | 1/240 of a line |
| `para.borders.*.sz` | eighths of a point (OOXML) |
| `para.borders.*.space` | points (OOXML) |
| `pageBorder.width`, `pageBorder.space` | CSS px at zoom 1 (`main.js:1735-1740`, `Reader.php:2483-2484`, `layout/pages.js:762-766`) |
| `watermark.size` | CSS px; `0` means proportional (`page.wPx/8`) (`main.js:1715`, `pages.js:803`) |
| `ink[*][*].points`, `width` | page px at zoom 1 (`editor/ink.js:8-10`) |
| `media[rid].w/h` | **inconsistent**: twips when inserted from the UI (`main.js:2451` after `fitImageToColumn`, `main.js:2493-2505`), image **pixels** when imported from docx (`Reader.php:1608-1613`). **[REC]** Treat it as informational only. Always size images from the **run's** `w`/`h` (twips). |
| `activeView.zoom` | factor (1 = 100%) |
| SmartArt shapes | px (computed, not stored) |

---

## 3. Theme (`theme.js`)

```jsonc
"theme": {
  "majorFont": "Aptos",          // headings
  "minorFont": "Aptos",          // body
  "colors": { "accent1":"2F5496", "accent2":"C55A11", "accent3":"548235",
              "accent4":"7030A0", "accent5":"C00000", "accent6":"1F4E79" },
  "name": "…"                    // optional, may be written by setTheme(theme) (reg.js:1992-2006)
}
```

- The defaults are `theme.js:10-17` and `theme.js:24-30`. Colors are stored **without `#`**
  (OOXML style).
- A docx import also adds `dk1`, `lt1`, `dk2`, `lt2`, `hlink`, `folHlink` and the accents, as
  uppercase `RRGGBB` (`Reader.php:2793-2815`).
- `themeColor(theme, key)` (`theme.js:38-45`):
  1. If `key` is not a non-empty string, return null.
  2. Look up `theme.colors[key]`. If it is null or missing, use `DEFAULT_COLORS[key]`.
  3. If the value is not a non-empty string, return null.
  4. Return the value with a leading `#` (unless it already has one).
- `setTheme(theme)` (`reg.js:1995-2022`): shallow-merges into `doc.theme`. If a major or minor font
  results, it rewrites `char.font` of **every style that already defines `char.font`**. The target is
  `majorFont` when the style id matches `/^Heading\d?$/` or is `Titulo` or `Subtitulo`, and
  `minorFont` otherwise. Styles without `char.font` are not touched. The `styles` array is replaced
  by a new array, which also invalidates the cache.

---

## 4. Sections

### 4.1 Shape (`doc.js:62-80`, `Conv.php:365-381`, `common.php:896-912`)

```jsonc
{
  "id": "sec1",                         // 'sec' + N. New ones: first free 'sec{n}', n starting at sections.length+1 (reg.js:1227-1229)
  "page": {
    "w": 11906, "h": 16838,             // twips, physical (landscape ⇒ w>h)
    "orient": "portrait",               // 'portrait' | 'landscape'
    "margins": { "top":1440, "right":1440, "bottom":1440, "left":1440 },
    "headerDist": 720, "footerDist": 720,
    "columns": {
      "count": 1,                       // 1..12 (reg.js:1138)
      "spacing": 708,                   // twips gap between columns
      "widths": null,                   // OPTIONAL: twips[] of length `count` (unequal columns), or null
      "sep": false                      // OPTIONAL: draw a separator line between columns
    }
  },
  "headers": { "default": null, "first": null, "even": null },   // ALWAYS null in practice (see 4.3)
  "footers": { "default": null, "first": null, "even": null },
  "differentFirst": false,
  "differentEven": false,
  "linkToPrevious": true,
  "start": "nextPage",                  // OPTIONAL: 'nextPage' (default when absent) | 'continuous' | 'evenPage' | 'oddPage'
  "hyphenation": false                  // OPTIONAL: automatic Spanish hyphenation for this section
}
```

- `start` is set by `insertSectionBreak` (`reg.js:1241`) and by docx import, which only writes
  `continuous`, `evenPage` and `oddPage` (`Reader.php:2429-2434`). The paginator only treats
  `'continuous'` specially: the new section stays on the same page when that page already has items
  (`layout/paginator.js:344`). `evenPage` and `oddPage` are stored but behave like `nextPage`.
- `hyphenation` is set through `setSectionProps` (`main.js:1820`, `ui/dialogs/layout.js:529-531`)
  and consumed at `paginator.js:259`.
- `setSectionProps` can write **any** key onto a section (`reg.js:1158-1177`). Preserve unknown keys.
- `setPageSize` (`reg.js:1090-1119`):
  - If only `orient` is given, `w` and `h` are swapped so that landscape means `w = max` and portrait
    means `w = min`.
  - If `orient` is not given, `orient = w > h ? 'landscape' : 'portrait'`.
- `setMargins` merges only the finite keys among `top`, `right`, `bottom`, `left` (`reg.js:1067-1084`).
- `setColumns` (`reg.js:1128-1149`): `count` is clamped to 1..12 and rounded; `spacing` is `max(0, round)`;
  `widths` is an array of `max(1, round)`, or null when the given array is empty; `sep` is `!!sep`.

### 4.2 Which section a block belongs to

Every block has `sec`, the id of its section. `getSection(id)` returns the matching section or
**`sections[0]`** if none matches (`doc.js:350-355`). There is **no section-break block**: a
section starts at the first block whose `sec` differs from the previous block's `sec`
(`paginator.js:339-353`). The plan's `{t:'p', break:'section'}` is **not used** (§15).

`insertSectionBreak(range, start)` (`reg.js:1216-1282`):

1. Clone the origin section with a new id and `start` set to the requested value, and
   `linkToPrevious: true`. Insert it right after the origin in `sections`.
2. If the caret is strictly inside a paragraph (0 < offset < len), split that paragraph with
   `splitBlockAt` and start from the second half. If the caret is at the end of a non-empty
   paragraph, start from the next block.
3. Reassign `sec = newId` to each consecutive block, starting there, while `block.sec === originId`.

**[JS-BUG]** Because hf and fn blocks sit at the end of `body` with the origin's `sec`, inserting a
break into the last section of a document also moves that section's header/footer (and note)
paragraphs into the new section. **[REC]** Stop at, or skip, blocks that carry `hf` or `fn`.

### 4.3 Headers and footers ("bands")

`section.headers` and `section.footers` are vestigial and always null. A band is the set of
paragraphs `p` with `hf: {kind:'header'|'footer', variant:'default'|'first'|'even'}`. A band
belongs to section `block.sec`, or to the first section when `sec` is missing
(`paginator.js:966-980`).

- **Location:** at the end of `doc.body`, after all flow content. `setBand` appends them there
  (`reg.js:1755-1786`). The undo region is "from the first `hf` block to the end of the body"
  (`reg.js:287-297`). docx import places bands after the body, then footnotes after the bands
  (`Reader.php:259`).
- **Band selection per page** (`paginator.js:991-1003`):
  1. If this is the first page of the section and `differentFirst` is set, use only `'first'`. If no
     `first` band exists, the page gets **no band** (it does not fall back to default).
  2. Else, if the page number is even and `differentEven` is set, try `'even'`, then `'default'`.
  3. Else use `'default'`.
- `linkToPrevious` is stored but **not honoured**: a section without its own band paragraphs shows
  no header.
- Band paragraphs never count for word count, list numbering or the outline (`doc.js:400-401`,
  `lists.js:428-429`, `editor/outline.js` skips `hf` and `cell`).
- Default band paragraph format (`main.js:2284-2294`): `{after:0, line:240, tabs:[{pos:round(col/2),
  type:'center'},{pos:col, type:'right'}]}`, where `col = max(1440, page.w − left − right)`.
  Template header and footer runs use `char:{size:9, color:'#808080'}` (`tpl.js:231-246`).

---

## 5. Character format (`char`)

### 5.1 Catalogue (sparse; absent means inherited)

Hard defaults are `HARD_CHAR` (`styles.js:49-62`). They are identical to the `Normal` style in
`defaultStyles()` (`doc.js:461-474`). `CHAR_KEYS` is exactly these 12 keys, in this order
(`styles.js:84`).

| Key | Type / domain | Hard default | Notes / refs |
|---|---|---|---|
| `font` | string (family name) | `'Aptos'` | Any name. The UI catalogue lives in `core/fonts.js`. |
| `size` | number pt, 1..1638, 0.5 steps | `11` | `charfmt.js:96-100` |
| `bold` | bool | `false` | |
| `italic` | bool | `false` | |
| `underline` | `'none'`, `'single'`, `'double'`, `'words'`, `'dotted'`, `'dash'` | `'none'` | `charfmt.js:39-41`. The PHP model only knows 5 values; `'dash'` is lost on docx export (`Conv.php:42,242-261`). |
| `strike` | bool | `false` | The plan's double strike is not modelled. docx `dstrike` maps to `true` (`Reader.php:1013-1018`). |
| `sub` | bool | `false` | Mutually exclusive with `sup` (UI toggle logic in `charfmt.js`). |
| `sup` | bool | `false` | |
| `color` | `'auto'`, `'#RRGGBB'` or `'RRGGBB'` | `'auto'` | Styles store **no `#`** (`doc.js:513,522`). Runs, templates and the UI store **`#`** (`tpl.js:38-44`, `charfmt.js:79-93`). The UI normaliser also lets CSS named colors and `rgb()` pass through unchanged (`charfmt.js:91-92`). **[REC]** Parse all of these forms and write back the original string. |
| `highlight` | `null` or a color string (`'#RRGGBB'`) | `null` | 15/16 OOXML highlight colors map to hex (`Conv.php:22-39`). A docx `w:shd` on a run also becomes `highlight` (`Reader.php:1052-1058`). |
| `allCaps` | bool | `false` | |
| `smallCaps` | bool | `false` | |

Extra keys that live in `char` and have no hard default (absent means off):

| Key | Shape | Meaning | Refs |
|---|---|---|---|
| `link` | string URL, or `'#<blockId>'` for an internal link | Hyperlink. The text is drawn underlined, in the link color if `color` is auto. Ctrl+click opens it. TOC entries use `'#'+blockId` (`refs.js:78`). Cross references use `'#'+targetBlockId` (`ui/dialogs/references.js:473`). docx `w:hyperlink`/`HYPERLINK` becomes `link` (`Reader.php:1260-1272`, `1233-1246`). | `pages.js:1166-1171` |
| `linkTip` | string | Tooltip ("Info. en pantalla") | `ui/dialogs/insert.js:378-379` |
| `ins` | `{a: string author, d: string or null date}` | Tracked insertion | `reg.js:515-518`, `editor/compare.js:122` |
| `del` | `{a, d}` | Tracked deletion. The text stays until accepted. | idem |
| `effect` | `{gradient?: string[] (≥2 CSS colors), stroke?: {color, width px}, shadow?: CSS text-shadow string, spacing?: px}` | WordArt (§7.3) | `editor/wordart.js:19-24`, `pages.js:1229-1246` |
| `spacing` | int twips | Character spacing (docx import only; ignored by layout) | `Reader.php:1034-1039`; the plan lists it as P1 (`plan:950`) |

- `CLEAR_CHAR_DELTA` ("Borrar formato") is a full delta containing the hard defaults
  (`charfmt.js:61-74`). Because its `highlight` is `null`, applying it removes the highlight override.
- Revision mark author comes from `doc.tracking.author || 'Autor'`. The date is `tracking.date || null`
  and in practice is always null (`reg.js:515-518`).

### 5.2 Resolution (effective char), `styles.js`

```
resolveStyle(doc, styleId):
    chain = buildChain(doc.styles, styleId)          // see below
    char = copy(HARD_CHAR); para = copy(HARD_PARA) with tabs = []
    for st in chain (root → leaf): mergeDefined(char, st.char); mergeDefined(para, st.para)
    return {char, para}                               // cached; treat as read-only
mergeDefined(target, src): for each key k of src with src[k] !== undefined: target[k] = src[k]
                                                       // NOTE: a null value IS copied (null overrides)
buildChain(styles, id):
    byId = map id → style (later duplicates overwrite earlier ones)
    st = byId[id] ?? byId['Normal'] ?? null          // unknown id ⇒ Normal (Word fallback)
    walk st.basedOn while not seen (cycle guard), collect, then reverse to root-first
resolveCharFormat(doc, block, runChar) = mergeDefined(copy(resolveStyle(doc, block.style ?? 'Normal').char), runChar)
resolveParaFormat(doc, block)          = mergeDefined(copy(resolveStyle(...).para), block.para)   // shallow: tabs/numbering are shared refs
formatAtPos(doc, pos) = { char: resolveStyle(styleId).char ⊕ rawCharAt(doc,pos), para: resolveParaFormat, styleId }
```

Refs: `styles.js:105-130,176-219,267-274`.

- A style whose `basedOn` chain does not reach `Normal` (for example `Enfasis`, `basedOn:null`)
  inherits the **hard defaults**, not the document's Normal (`styles.js:13-18`).
- Cache: keyed by the identity of the `doc.styles` array plus the style id. It is invalidated on
  `doc:changed {structural:true}` and by `clearStyleCache()`. Commands that edit styles replace the
  array instead of mutating it (`reg.js:2011-2018,2036-2043`). In C++, invalidate on any style edit.
- **Character styles are not applied to runs.** There is no `char.style` key. Applying `Enfasis`
  through the style gallery sets `block.style = 'Enfasis'` as if it were a paragraph style
  (`reg.js:1045-1057`). So "Énfasis" makes the whole paragraph italic, on top of hard defaults.
  This is a known divergence from Word; keep it for parity. docx import flattens `w:rStyle` into
  the run's `char` (`Reader.php:1076-1081,1117`).

### 5.3 Revision semantics (tracked changes)

- While `tracking.enabled` is true (`reg.js:509-518,528-541,639-672`):
  - **Typing** writes text with `char.ins = {a, d}`. Any `del` key coming from the inherited format
    is removed first.
  - **Deleting** a range inside one block works like this: if every run in the range already has
    `char.ins.a === author`, the text is really deleted. Otherwise the range gets
    `applyCharFormat({del: mark})` and nothing is removed. The caret moves to the end of the range
    (Delete key) or to its start (Backspace).
  - **Typing over a selection** marks the selection as deleted, then inserts the new text **after**
    it.
  - Deleting a range that spans several blocks is real deletion, even while tracking
    (`reg.js:819`).
- `resolveRevisions(range|null, accept)` (`reg.js:1906-1942`): for every block in the region (or the
  whole body when `range` is null):
  - Accept: drop runs whose `char.del` is truthy, and remove `ins` from the other runs.
  - Reject: drop runs whose `char.ins` is truthy, and remove `del`.
  - A `char` left empty is deleted. Then `mergeAdjacentRuns` runs.
- docx import accepts `w:ins` and drops `w:del` (`Reader.php:764-788`).

---

## 6. Blocks

All blocks share these fields:

| Field | Type | Notes |
|---|---|---|
| `t` | `'p'`, `'table'` or `'smartart'` | Defaults to `'p'` when missing (`doc.js:311`, `rt.js:289`). |
| `id` | string, unique in `body` | `'b'+N` (§11). Tables also use `bN`; the plan's `t1` is never generated. |
| `sec` | section id | |

### 6.1 Paragraph `p`

```jsonc
{ "t":"p", "id":"b3", "sec":"sec1", "style":"Normal",
  "para": { … sparse paragraph overrides … },            // OPTIONAL; deleted when it would be empty
  "runs": [ … ],
  // OPTIONAL markers (at most one of cell/hf/fn in practice):
  "cell": { "tableId":"b7", "row":0, "col":1 },        // §6.4
  "hf":   { "kind":"header", "variant":"default" },    // §4.3
  "fn":   { "id":"fn1", "kind":"footnote", "number":1 },// §6.6
  "toc": "title"|"entry"|"empty",                      // §6.7 generated-content markers
  "figures": "title"|"entry"|"empty",
  "index": "title"|"entry"|"empty",
  "biblio": "title"|"entry"|"empty",
  "caption": { "label":"figura"|"tabla"|"ecuacion", "number": 3 }
}
```

`style` defaults to `'Normal'` when missing (`styles.js:206,217`). An unknown style id resolves as
Normal (§5.2).

### 6.2 Paragraph format (`para`)

Hard defaults are `HARD_PARA` (`styles.js:65-77`). `PARA_KEYS` lists these 11 keys in this order
(`styles.js:85`).

| Key | Type / domain | Hard default | Notes |
|---|---|---|---|
| `align` | `'left'`, `'center'`, `'right'`, `'justify'` | `'left'` | The plan example says `justify`; the code uses `left`. |
| `line` | int | `276` | Unit depends on `lineRule` (§1.3). |
| `before` | int twips ≥ 0 | `0` | |
| `after` | int twips ≥ 0 | `160` | |
| `left` | int twips | `0` | Indent. Lists set it from the level (§8.4). |
| `right` | int twips | `0` | |
| `first` | int twips; negative means hanging | `0` | |
| `tabs` | `[{pos: twips, type, leader?}]` | `[]` | `type` ∈ `left`, `center`, `right`, `decimal`, `bar` (plus `clear`/`num` from OOXML) (`Conv.php:77`). `leader` is `'dot'` in generated TOC entries (`refs.js:90`). The breaker also accepts a bare number as `pos` (`breaker.js:284-291`). Center, right and decimal tabs may still be laid out as left tabs (`NOTES:52`). |
| `keepNext` | bool | `false` | Stored; not applied by the paginator. |
| `widowControl` | bool | `true` | Stored; not applied. |
| `numbering` | `null` or `{listId: string, level: 0..8}` | `null` | §8 |

Extra keys (no hard default, absent means off):

| Key | Domain | Ref |
|---|---|---|
| `lineRule` | `'auto'`, `'exact'`, `'atLeast'` | `Reader.php:524-534`, `breaker.js:31-32` |
| `borders` | `{top?,left?,bottom?,right?: {style: OOXML border name ('single','double',…,'none','nil'), sz: int (1/8 pt), space: int pt, color: 'auto' or '#RRGGBB'}}` | `Reader.php:699-718`; templates `tpl.js:226,381,420` |
| `shading` | `'#RRGGBB'` background | `Reader.php:614-619` |
| `contextualSpacing` | bool: no before/after between paragraphs of the same style | `paginator.js:20,361` |
| `keepLines` | bool (stored) | |
| `pageBreakBefore` | bool: the paragraph starts a new page | `paginator.js:19` |
| `outlineLvl` | int 0..9, or null (stored; the outline uses style ids instead) | `Reader.php:576-581`, `plan:324` |
| `dropCap` | `null` or `{type: 'in-text' or 'in-margin', lines: 2..10 (default 3)}`. The value `'none'` or `type:'none'` is also treated as off. | `main.js:1987-1995`, `breaker.js:234-255` |

Paragraph-delta meta keys that start with `__` (for example `__indentDelta`) are stripped by the
command layer and must **never** reach the model (`reg.js:107-115`, `parafmt.js:41-44`).

### 6.3 Table block `table` (`table.js:4-22`, `reg.js:1397-1443`, `tpl.js:268-329`, `Reader.php:1814-2084`)

```jsonc
{ "t":"table", "id":"b7", "sec":"sec1",
  "props": {
    "align": "left",            // 'left' | 'center' | 'right'  (horizontal placement)
    "borders": "grid",          // 'grid' | 'none' | 'horizontal'
    "fixedLayout": true,        // stored
    "repeatHeader": false,      // repeat row 0 on each page (only when rows > 1)
    "borderColor": "#BFBFBF",   // OPTIONAL
    "cellMargins": { "top":60, "left":108, "bottom":60, "right":108 },   // OPTIONAL twips
    "style": "banded"           // OPTIONAL: tablestyles id last applied, or null
  },
  "cols": [4513, 4513],         // twips per grid column
  "rows": [
    { "height": null,           // null or twips (docx trHeight)
      "cells": [
        { "blocks": ["b8"], "vAlign": "top", "shading": null,
          "gridSpan": 2,          // OPTIONAL >1: horizontal merge (this cell spans n grid columns)
          "vMerge": "restart",    // OPTIONAL 'restart' | 'continue'
          "merged": true          // OPTIONAL: absorbed cell (not painted)
        }
      ] }
  ]
}
```

| Field | Domain / default |
|---|---|
| `vAlign` | `'top'` (default), `'center'`, `'bottom'` |
| `shading` | null or a CSS color with `#` (`'#D9E2F3'`) |
| `cellMargins` | When absent, padding is `CELL_PADDING_TWIPS = 108` (`table.js:28`). docx import always writes `{top:0,left:108,bottom:0,right:108}` when the file has none (`Reader.php:2066-2071`). Templates write `{60,108,60,108}` (`tpl.js:276`). |

Constants: `CELL_PADDING_TWIPS=108`, `MIN_COL_TWIPS=284` (minimum column width when resizing),
`BORDER_PX=1` (`table.js:28-34`).

**Invariants (critical):**

1. The cell paragraphs of a table come **immediately after the table block**, are **contiguous**,
   and are in **reading order** (row-major). Each one has `cell = {tableId, row, col}`
   (`reg.js:157-174,218-263`, `NOTES:135-137`).
2. **The source of truth for cell content is the paragraphs' `cell` markers**, not `cell.blocks`.
   The paginator groups paragraphs by `tableId|row|col` (`paginator.js:683-684`). `mergeCells`
   repoints the absorbed paragraphs' `cell` markers to the kept cell but **does not update
   `cells[].blocks`** (`reg.js:1630-1639`). Treat `cells[].blocks` as advisory and rebuild it with
   `renumberCells` when needed.
3. Every grid slot exists in every row. Merged-away slots stay in place (`merged:true`, usually
   `blocks:[]`) so column indices stay stable (`table.js:218-228`). docx import pads short rows with
   `{blocks:[],vAlign:'top',shading:null,merged:true}` (`Reader.php:2048-2053`).
4. Every non-merged cell has at least one paragraph. An empty one is
   `{t:'p', id, sec: table.sec, style:'Normal', para:{after:0, line:240}, cell:{…}, runs:[]}`
   (`reg.js:248-252,1423-1431`).
5. `columnCount(table)` is the maximum `cells.length` over rows, or `cols.length` when there are no
   rows (`table.js:100-106`). `cols` can be temporarily out of sync with that count.

**Algorithms:**

- `evenColumns(total, n)` (`table.js:44-50`): `n = max(1, round(n))`; `base = floor(total/n)`;
  every column is `base` except the last, which is `total − base·(n−1)`, so the sum is exact.
- `describeTable({rows, cols, widthTwips, sec})` (`table.js:64-84`): `rows` and `cols` are each
  `max(1, round)`. `props = {align:'left', borders:'grid', fixedLayout:true, repeatHeader:false}`.
  Each cell is `{blocks:[], vAlign:'top', shading:null}`; each row is `{height:null}`.
  `insertTable` defaults: rows=2, cols=2, widthTwips=9026 (`reg.js:1397`). The new table is placed
  *between* blocks: a paragraph is split if the caret is in the middle of it (`reg.js:1407-1416`).
- `nextCell(t, r, c, dir)` (`table.js:159-173`): reading-order step that wraps to the next or
  previous row. Returns null past either end.
- `isMerged(cell)` = `cell.merged || cell.vMerge === 'continue'`. `spanOf(cell)` =
  `floor(gridSpan)` if it is finite and > 1, else 1. `rowSpanOf(t, r, c)`: if the cell is
  `vMerge==='restart'`, it is 1 plus the number of consecutive rows below whose cell in the same
  column has `vMerge==='continue'` (`table.js:231-252`).
- `canMerge(t, rect)` (`table.js:262-274`): `rect = {row1,col1,row2,col2}`, normalised with min/max.
  It returns false when:
  - the rectangle is a single cell,
  - it goes out of range,
  - any cell in it already has `gridSpan > 1`, `vMerge`, or `merged`.
- `applyMerge` (`table.js:293-311`): the top-left cell gets `gridSpan = c2−c1+1` (also when that is
  1) and gets `vMerge='restart'` if `r2 > r1`. Every other cell in the rectangle gets `merged=true`.
  Cells in column `c1` of the rows below also get `vMerge='continue'`. The paragraphs of the absorbed
  cells move to the kept cell, keeping their order in the body (`reg.js:1631-1639`).
- `applySplit` (`table.js:320-340`): delete `gridSpan` and `vMerge` on the kept cell, and `merged` and
  `vMerge` on every cell in its span rectangle. `splitCell` then gives each freed cell a new empty
  paragraph and runs `renumberCells` (`reg.js:1652-1679`).
- `renumberCells(doc, table, tableId)` (`reg.js:223-263`):
  1. Remove all the table's cell paragraphs from `body`, keeping their order.
  2. Group them by their current `row|col`.
  3. For each `(row, col)` slot of the table in reading order, take that group, or create one empty
     paragraph if the group is missing. Rewrite each paragraph's `cell` and the cell's
     `blocks = ids`.
  4. Splice the result right after the table block.
  5. Groups with no matching slot (deleted cells) are dropped.
  
  Note: this gives **merged slots** an empty paragraph too. Templates and docx import give merged
  slots no paragraph.
- Inserting or deleting a row or column (`reg.js:1451-1572`):
  1. Splice the `rows`/`cells` arrays.
  2. `shiftCells(doc, tableId, axis, from, ±1)` shifts the `cell` markers of later rows or columns
     (`reg.js:202-207`).
  3. Append the new paragraphs at the end of the table region.
  4. Run `renumberCells`.
  
  Column insert and delete re-spread **all** column widths evenly over the old total (or 9026).
  The last row and the last column cannot be deleted.
- `setTableProps` (`reg.js:1594-1610`) writes `align`, `borders` and `repeatHeader`. It writes
  `cols` only if the length equals `columnCount`, each value `max(284, round)`.
- Geometry, used by layout:
  - `columnEdgesPx` (`table.js:186-197`): if the sum of column widths in px exceeds the content
    width, every column is scaled down proportionally.
  - `tableOffsetPx` (`table.js:206-212`): center adds `(content − width)/2`; right adds
    `content − width`.

**Table style gallery** (`tstyles.js:13-89`). Applying a style writes `props.style = id`,
`props.borders`, and **per-cell `shading`** (`reg.js:1687-1710`). The layout never reads the
catalogue. Shading rule per row (`tstyles.js:114-119`, `reg.js:1700-1705`):

- `header && row==0` → `headerShading`
- else `banded && row>0 && row%2==1` → `bandShading`
- else `null`

`headerText` is defined in the catalogue but never applied.

| id | name (es) | borders | header | banded | headerShading | bandShading | headerText |
|---|---|---|---|---|---|---|---|
| `plain` | «Tabla sencilla» | grid | no | no | – | – | |
| `grid-header` | «Cuadrícula con encabezado» | grid | yes | no | `#D9E2F3` | – | |
| `banded` | «Filas con bandas» | grid | yes | yes | `#D9E2F3` | `#F2F5FB` | |
| `list` | «Lista sin bordes» | none | yes | yes | `#EDEBE9` | `#F8F8F8` | |
| `accent-blue` | «Énfasis azul» | grid | yes | yes | `#2F5496` | `#DEE7F5` | `#FFFFFF` |
| `accent-green` | «Énfasis verde» | grid | yes | yes | `#548235` | `#E4EFDC` | `#FFFFFF` |
| `accent-orange` | «Énfasis naranja» | grid | yes | yes | `#C55A11` | `#FBE5D6` | `#FFFFFF` |
| `minimal` | «Solo líneas horizontales» | horizontal | yes | no | – | – | |

**Table region for undo:** the table block plus every following block whose `cell.tableId` matches.
The region stops at the first block that has no `cell` or that belongs to another table
(`reg.js:163-174`).

### 6.4 SmartArt block `smartart` (`smartart/smartart.js:35-46,91-137`, `NOTES:286-297`)

```jsonc
{ "t":"smartart", "id":"b20", "sec":"sec1", "style":"Normal", "runs":[],
  "kind": "list",                       // 'list' | 'process' | 'cycle' | 'hierarchy' | 'pyramid' (unknown ⇒ 'list')
  "items": [ { "text":"Elemento 1", "children":[ { "text":"…", "children":[] } ] } ],
  "props": { "color": "#4472C4" } }     // base color; palette #4472C4 #ED7D31 #70AD47 #FFC000 #7030A0 #C00000
```

- It has no runs. Its linear length is 0 and the caret never enters it. It is laid out as one
  unbreakable block.
- `insertBlocksAfter` adds `style:'Normal'` and `runs:[]` to it (`reg.js:776-781`).
- The text panel format is: one item per line, and indentation gives the level (2 spaces or 1 tab;
  `level = floor(tabs + spaces·0.5)`). Empty lines are skipped (`smartart.js:91-104`).
  `serializeItems` writes 2 spaces per level (`smartart.js:113-120`).
- `updateSmartArt(blockId, {kind?, items? (non-empty), props? (merged)})` (`reg.js:1723-1737`).
- docx export degrades it to an indented bullet list (`CONTRACTS:949-952`).

### 6.5 Section breaks

There is **no** block type for section breaks (see §4.2). A docx paragraph that only carries
`w:sectPr` is **not** imported (`Reader.php:398-403`).

### 6.6 Footnote and endnote paragraphs (`fn`)

```jsonc
{ "t":"p", "id":"b99", "sec":"sec1", "style":"Normal",
  "para": { "left":0, "first":0, "before":0, "after":0, "line":240 },
  "fn": { "id":"n1k2j3", "kind":"footnote", "number":1 },        // kind: 'footnote' | 'endnote'
  "runs": [ { "t":"text", "text":"1 ", "char":{"sup":true} },
            { "t":"text", "text":"Texto de la nota", "char":{"size":9} } ] }
```

- Factory: `refs.js:371-383`. The UI id is `'n' + Date.now().toString(36)` (`main.js:1290-1312`).
  docx ids are `'fn'+w:id` and `'en'+w:id` (`Reader.php:1316`). In imported notes, multi-paragraph
  text is joined with `{t:'break',type:'line'}` (`Reader.php:1334-1336`).
- The note paragraph is appended **after the last block of the body** with `insertBlocksAfter`
  (`main.js:1307-1309`). The paginator takes it out of the flow and places it at the bottom of the
  page where its reference first appears. Endnotes go after the content of the last page
  (`paginator.js:860-958`).
- **Reference in text:** a field run `{t:'field', code:'NOTEREF <noteId>', result:'<n>',
  char:{sup:true}}` (`refs.js:352-364`). The plan's `footnoteRef` run type is not used.
- `numberFootnotes(doc)` (`refs.js:392-406`): walk the body in order and skip blocks that have `fn`.
  For each field run whose `code` matches `/^NOTEREF\s+(\S+)/`, increment n and map `id → n`. This
  returns the map; it does not mutate anything.
- **[JS-BUG]** `splitBlockAt` copies `fn` into the new paragraph (`rt.js:603`), so pressing Enter in
  a note creates two blocks with the same `fn.id`. The paginator keys notes by `fn.id` in a Map, so
  the last paragraph wins (`paginator.js:868-876`). **[REC]** Support multi-paragraph notes keyed by
  `fn.id` (collect every block with that id, in order).

### 6.7 Generated content (TOC, figure tables, index, bibliography, captions), `refs.js`

All of these are ordinary `p` blocks that carry a marker key, so they can be found and regenerated.
They are inserted with `insertBlocksAfter`, never with `insertFragment`, because the first block of
a fragment loses its markers (`NOTES:234-238`).

| Generator | Title block | Entry block | Empty block (verbatim Spanish text) |
|---|---|---|---|
| `tocFragment(entries, {title?, tabTwips=9026, levels=3, showPages=true, hyperlinks=true})` (`refs.js:54-103`) | style `Heading1`, text = `title` or `'Contenido'` (none when `title===null`), `toc:'title'` | Skip entries whose `level > levels`. `nivel = max(0, level−1)`. runs = `[{t:'text', text, char:{link:'#'+blockId, linkTip:text}}]` (char omitted when `hyperlinks===false`), then if `showPages`, `{t:'tab'}` and `{t:'field', code:'PAGEREF '+blockId, result:String(page or 1)}`. `para:{left:360·nivel, after:0, line:240, tabs:[{pos:tab, type:'right', leader:'dot'}]}`. `toc:'entry'` | `'No hay títulos a los que aplicar la tabla de contenido.'`, `toc:'empty'` |
| `figureTableFragment(entries, {label, tabTwips, title})` (`refs.js:149-182`) | `Heading1`, default title is the label's plural (`'Tabla de ilustraciones'`, `'Índice de tablas'`, `'Índice de ecuaciones'`), `figures:'title'` | runs `[text, tab, field 'PAGEREF '+(blockId or '')]`. `para:{after:0, line:240, tabs:[right dot]}` | `'Todavía no hay títulos de ilustración en el documento.'` |
| `indexFragment(entries, {title})` (`refs.js:196-232`) | `Heading1`, `'Índice'` | Group by trimmed text, collect the set of pages (`Number(page) or 1`), sort keys with `localeCompare(…,'es')` and pages numerically. Text is `` `${key}, ${pages.join(', ')}` ``. `para:{left:0, first:-180, after:0, line:240}`. `index:'entry'` | `'No hay entradas de índice marcadas.'` |
| `bibliographyFragment(sources, {style, title})` (`refs.js:309-340`) | `Heading1`, `'Bibliografía'` | Sort by `author` with `localeCompare 'es'`. Text is `formatReference(f, style)`. `para:{left:720, first:-720, after:120, line:240}`. `biblio:'entry'` | `'No hay fuentes registradas.'` |
| `captionFragment({label, number=1, text, position})` (`refs.js:123-141`) | | One block, style `Cita`. runs = `[{text:'<Figura/Tabla/Ecuación> <n>', char:{bold:true}}, {text: text ? '. '+text : ''}]`. `para:{align:'center', before:80, after:160, line:240}`. `caption:{label, number}`. Unknown labels become `'figura'`. | |

Heading levels for the TOC and outline (`editor/outline.js`):

- `headingLevel(styleId)`: `/^Heading([1-9])$/` gives n; `Titulo` gives 0; `Subtitulo` gives 1;
  anything else gives null.
- `outline(doc)` skips `hf` and `cell` blocks and paragraphs with empty text.
- Plain text for an entry is: text runs, plus field `result`, plus a space per tab, with whitespace
  collapsed and trimmed.

Citation formatting (`refs.js:239-301`). A source is
`{author, year, title, publisher, city, url, page?}` (`ui/dialogs/references.js:126-131`).

- `apellido(author)` = every word after the first (`'Ana Pérez López'` gives `'Pérez López'`).
  When there is only one word, it is that word.
- `formatCitation`. Defaults: author `'Anónimo'`, year `'s. f.'`.
  - APA (and the default): `(Apellido, año[, p. pág])`
  - MLA: `(Apellido[ pág])`
  - Chicago: `(Apellido año[, pág])`
  - ISO690: `(APELLIDO, año)`
- `formatReference`. Defaults: author `'Anónimo'`, title `'Sin título'`, year `'s. f.'`. Formats
  are written as JS template literals (`${…}` is a field):
  - APA: `` `${autor} (${anio}). ${titulo}. ${editorial}${editorial?'.':''}` ``
  - MLA: `` `${autor}. ${titulo}. ${editorial}${editorial&&anio?', ':''}${anio}.` ``
  - Chicago: `` `${autor}. ${anio}. ${titulo}. ${ciudad?ciudad+': ':''}${editorial}.` ``
  - ISO690: `` `${AUTOR}. ${titulo}. ${ciudad?ciudad+': ':''}${editorial}, ${anio}.` ``
  
  After building the string: append `' '+url` if there is a url, then collapse `\s+` to one space,
  replace `..` with `.`, and trim.

---

## 7. Runs

Common rule: a run is `{t, …}`. Its linear length is `text.length` (UTF-16) for `t:'text'` and
**1** for every other `t`, including unknown types (`rt.js:314-317`).

| `t` | Fields | Linear length | Carries `char`? | Refs |
|---|---|---|---|---|
| `text` | `text: string` (may be `''` only as a format carrier, §12.9), `char?` | `text.length` in UTF-16 | yes | `CONTRACTS:56` |
| `tab` | none (the plan's `pos` is unused) | 1 | no (docx import never writes char on tab) | `Reader.php:855-858,958-964` |
| `break` | `type`: `'line'`, `'page'` or `'column'` | 1 | no | `insert.js:42-44` (the UI makes line and page); docx can produce `column` (`Reader.php:860-871`); `breaker.js:165` |
| `field` | `code: string`, `result: string` (cached display text), `char?`. The plan's `dirty` is unused. | 1 | yes (templates, NOTEREF, docx) | §7.1 |
| `image` | `rid`, `w`, `h` (int twips ≥ 1), `alt?` (string, omitted when empty), `wrap?`, `align?`, `char?` | 1 | optional | `insert.js:60-64`, `reg.js:1342-1381`, `Reader.php:1523-1542` |
| `math` | `src` (linear notation), `alt` (Unicode linearisation), `ast?` (AST POJO; absent in old docs and in docx imports), `char?` | 1 | optional | `math/math.js:618-630`, `Reader.php:1674-1682`, `NOTES:271-285` |

Image `wrap` ∈ `'inline'` (default when absent), `'square'`, `'topAndBottom'`, `'behind'`, `'front'`.
Image `align` ∈ `'left'` (default), `'center'`, `'right'` and is only meaningful when not inline
(`breaker.js:185-188`, `ribbon.js:2040-2044`). docx import writes `wrap` and `align` only when not
inline (`Reader.php:1537-1540`). `resizeImage` sets `w` and `h` to `max(1, round)`
(`reg.js:1342-1359`).

Math AST node types (`math/math.js:127-135`):

- `{t:'seq', items}`
- `{t:'num', text}`
- `{t:'sym', text, italic}`
- `{t:'op', text}`
- `{t:'func', text}`
- `{t:'group', items}`
- `{t:'frac', num, den}`
- `{t:'sup', base, exp}`
- `{t:'sub', base, sub}`
- `{t:'sqrt', arg}`

The equation engine has its own spec; for the model, store `ast` as opaque JSON.

**Plan run types that are NOT used**, and what replaces them (`plan:396-406`):

| Plan type | Actual representation |
|---|---|
| `footnoteRef {fnId}` | `field` with `code:'NOTEREF <id>'` and `char.sup:true` |
| `commentMark {cId}` | none. Comments are anchored by offsets in `doc.comments` (§10.1). |
| "equation" | `math` run |
| "wordart" | `text` run with `char.effect` (§7.3) |
| "smartart" | `smartart` **block** (§6.4) |

### 7.1 Field codes

`code` is free text and is compared **exactly** (whitespace normalised on docx import,
`Reader.php:1198`).

| Code | Producer | `result` | Live resolution |
|---|---|---|---|
| `PAGE` | page-number bands, templates | `'1'` | The paginator replaces it with the page number, on a *copy* of the block; the model keeps the cached result (`paginator.js:111-128`, `NOTES:139-144`). It resolves **only when `code === 'PAGE'` exactly**. **[QUIRK]** An imported `PAGE \* MERGEFORMAT` does not resolve. **[REC]** Match the first word. |
| `NUMPAGES` | idem | `'1'` | Total number of pages. Same exact-match rule. |
| `DATE`, `TIME` | Insert → Fecha y hora with «Actualizar automáticamente» (`ui/dialogs/insert.js:304-310`). Without that option, plain text is inserted. | The formatted label (§7.2) | Frozen (`plan:993`) |
| `PAGEREF <blockId>` | TOC and figure tables | page number at generation time | Regenerating the TOC recomputes it |
| `NOTEREF <noteId>` | footnotes | note number | `numberFootnotes` |
| `MERGEFIELD <name>` | mail merge (`editor/mailmerge.js:86-94,120,155`) | `'«name»'` | Mail-merge preview and merge |
| `REF …`, `SECTIONPAGES …` | docx import only (`Reader.php:61`) | the last result | |

docx import (`Reader.php:1196-1231`):

- `HYPERLINK` fields become `char.link` on the result runs.
- Fields whose first word is outside the known list keep only their result text and add a warning.
- The `result` of a known field is the concatenation of its result text runs, with a space for each
  tab.

### 7.2 Date and time formats (`insert.js:100-121`)

Month and day names are Spanish (`insert.js:86-88`):

- Months: `enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre`
- Days: `domingo lunes martes miércoles jueves viernes sábado`

| key | label | code |
|---|---|---|
| `d/M/yyyy` | `3/10/2026` | DATE |
| `dd/MM/yyyy` | `03/10/2026` | DATE |
| `d MMMM yyyy` | `3 de octubre de 2026` | DATE |
| `dddd, d MMMM yyyy` | `sábado, 3 de octubre de 2026` | DATE |
| `MMMM yyyy` | `octubre de 2026` | DATE |
| `d/M/yyyy H:mm` | `3/10/2026 9:05` | DATE |
| `H:mm` | `9:05` | TIME |
| `H:mm:ss` | `9:05:07` | TIME |
| `h:mm a` | `9:05 a. m.` / `p. m.` (hour 0 is shown as 12) | TIME |

### 7.3 WordArt (`editor/wordart.js`)

A WordArt is a normal paragraph: `{t:'p', style:'Normal', para:{align:'center', line:240,
before:160, after:160}, runs:[{t:'text', text: text or 'Su texto aquí', char: clone(preset.char)}]}`
(`wordart.js:108-122`). When text is selected, the preset is applied in place with
`applyCharFormat(range, preset.char)` (`CONTRACTS:972-974`).

Every preset's `char` starts with `font:'Aptos Display', size:36, bold:true` plus:

| id | name | color | effect |
|---|---|---|---|
| `azul` | «Relleno azul» | `#2F5496` | `{shadow:'1px 2px 2px rgba(0,0,0,.35)'}` |
| `degradado` | «Degradado cálido» | `#C55A11` | `{gradient:['#F6B26B','#C0392B'], shadow:'0 2px 3px rgba(0,0,0,.25)'}` |
| `contorno` | «Contorno» | `#FFFFFF` | `{stroke:{color:'#2F5496', width:1.5}}` |
| `neon` | «Neón» | `#00B0F0` | `{shadow:'0 0 6px rgba(0,176,240,.9), 0 0 14px rgba(0,176,240,.6)'}` |
| `metal` | «Metálico» | `#7F7F7F` | `{gradient:['#E8E8E8','#6D6D6D'], stroke:{color:'#4D4D4D', width:0.75}, shadow:'0 2px 2px rgba(0,0,0,.35)'}` |
| `sombra` | «Sombra larga» | `#1F2430` | `{shadow:'2px 2px 0 #C8C6C4, 4px 4px 0 #E1DFDD', spacing:1}` |
| `arcoiris` | «Arcoíris» | `#E4572E` | `{gradient:['#E4572E','#F3A712','#76B041','#17BEBB','#6A4C93'], shadow:'0 1px 2px rgba(0,0,0,.25)'}` |

An unknown preset id falls back to the first preset (`wordart.js:98-100`). The `shadow` value is a
CSS `text-shadow` string. C++ needs a small parser for it (offset-x, offset-y, blur, color; several
shadows separated by commas).

---

## 8. Numbering (lists), `lists.js`

### 8.1 ListDef shape

```jsonc
{ "id": "lb-disc", "type": "bullet",          // 'bullet' | 'decimal' | 'lowerLetter' | 'upperLetter' | 'lowerRoman' | 'upperRoman' | 'ordinal'
  "name": "Viñeta redonda", "sample": "•",     // present when copied from a gallery entry (ensureListDef clones the whole entry)
  "levels": [ Level × 9 ] }
Level = { "fmt"?: "bullet"|"decimal"|"lowerLetter"|"upperLetter"|"lowerRoman"|"upperRoman"|"ordinal",
          "char"?: "•",        // bullet glyph
          "font"?: "Symbol",   // marker font
          "sep"?: ".",         // text after the number (when there is no lvlText)
          "lvlText"?: "%1.%2.",// OOXML-style multi-level template
          "ind"?: 720,         // twips: left indent where the TEXT starts
          "hanging"?: 360 }    // twips: hanging indent (the marker hangs to the left of ind)
```

`MAX_LIST_LEVELS = 9` (`lists.js:23`).

### 8.2 Built-in definitions

`defaultNumbering()` (`lists.js:41-58`):

- `n1` (type `bullet`): level i is `{char: ['•','○','▪'][i%3], ind: 720·(i+1), font:
  ['Symbol','Courier New','Wingdings'][i%3]}`, **except level 1, which has no `font`**. No `fmt`
  and no `hanging`.
- `n2` (type `decimal`): level i is `{fmt: ['decimal','lowerLetter','lowerRoman'][i%3], sep:'.',
  ind: 720·(i+1)}`.

Gallery (`lists.js:281-318`). The builders are:

- `bulletLevels(chars, fonts)`: `{fmt:'bullet', char: chars[i%len], ind: 720+360·i, hanging:360,
  font?: fonts[i % (fonts.length or 1)] when that font is non-empty}` (`lists.js:217-231`).
- `numberLevels(cycle, sep)`: `{fmt: cycle[i%len], sep, ind: 720+360·i, hanging:360}`
  (`lists.js:240-251`).
- `legalLevels(sep='.')`: `{fmt:'decimal', lvlText: '%1'+sep+…+'%'+(i+1)+sep, ind: 720+360·i,
  hanging: 360·(i+1)}` (`lists.js:260-273`).

| kind | id | name (es) | type | builder |
|---|---|---|---|---|
| bullet | `lb-disc` | «Viñeta redonda» | bullet | `bulletLevels(['•','○','▪'], ['Symbol','','Wingdings'])` |
| bullet | `lb-circle` | «Viñeta hueca» | bullet | `(['○','▪','•'])` |
| bullet | `lb-square` | «Viñeta cuadrada» | bullet | `(['▪','•','○'], ['Wingdings'])` (so every level uses Wingdings) |
| bullet | `lb-arrow` | «Viñeta de flecha» | bullet | `(['➢','▪','•'])` |
| bullet | `lb-check` | «Viñeta de visto» | bullet | `(['✓','○','▪'])` |
| bullet | `lb-diamond` | «Viñeta de rombo» | bullet | `(['◆','◇','▪'])` |
| bullet | `lb-dash` | «Viñeta de guion» | bullet | `(['–','•','○'])` |
| bullet | `lb-star` | «Viñeta de estrella» | bullet | `(['★','☆','▪'])` |
| number | `ln-decimal` | «1. 2. 3.» | decimal | `numberLevels(['decimal','lowerLetter','lowerRoman'], '.')` |
| number | `ln-paren` | «1) 2) 3)» | decimal | `(…same cycle, ')')` |
| number | `ln-upper-letter` | «A. B. C.» | upperLetter | `(['upperLetter','decimal','lowerRoman'], '.')` |
| number | `ln-lower-letter` | «a) b) c)» | lowerLetter | `(['lowerLetter','decimal','lowerRoman'], ')')` |
| number | `ln-upper-roman` | «I. II. III.» | upperRoman | `(['upperRoman','upperLetter','decimal'], '.')` |
| number | `ln-lower-roman` | «i. ii. iii.» | lowerRoman | `(['lowerRoman','lowerLetter','decimal'], '.')` |
| number | `ln-ordinal` | «1.º 2.º 3.º» | ordinal | `(['ordinal','lowerLetter','lowerRoman'], ' ')` |
| multilevel | `lm-legal` | «1. / 1.1. / 1.1.1.» | decimal | `legalLevels('.')` |
| multilevel | `lm-mixed` | «1. / a. / i.» | decimal | `numberLevels(['decimal','lowerLetter','lowerRoman'], '.')` |
| multilevel | `lm-bullet` | «• / ○ / ▪» | bullet | same as `lb-disc` |

Gallery `sample` values: `'•','○','▪','➢','✓','◆','–','★','1.','1)','A.','a)','I.','i.','1.º','1.1.','1. a.','• ○'`.

- **docx-imported lists:** `id = 'num'+numId`, `type` = level 0's `fmt`, exactly 9 levels. A missing
  level becomes `{fmt:'decimal', ind:720·(i+1), hanging:360}` (`Reader.php:2317-2342`). The level
  mapping is `Reader.php:2195-2267`:
  - `bullet` and `none` become `fmt:'bullet'` (`none` gives `char:''`).
  - Unknown formats become `decimal`.
  - A `lvlText` that contains `%` is kept.
  - A non-empty `lvlText` without `%` becomes a bullet whose `char` is that text.
- `ensureListDef(doc, listId)` (`lists.js:348-358`): if `doc.numbering` already has that id, return
  it. Otherwise push a deep clone of the gallery entry, or of the `defaultNumbering()` entry with that
  id. Unknown ids return null. It is idempotent, so reapplying the same gallery entry continues the
  same list.

### 8.3 Which list a paragraph is in (`lists.js:63-75`)

```
numberingOf(doc, block):
    num = block.para has own key 'numbering' (value !== undefined) ? block.para.numbering
                                                                   : resolveParaFormat(doc,block).numbering
    if num is falsy, not an object, or num.listId == null: return null
    level = isFinite(num.level) ? clamp(floor(num.level), 0, 8) : 0
    return {listId, level}
findNumberingDef(doc, id) = doc.numbering[id match] ?? defaultNumbering()[id match] ?? null
levelDef(def, level)      = def.levels[min(level, levels.length-1)] or null
```

### 8.4 Indent and delta

- `levelIndent(doc, listId, level)` (`lists.js:369-378`) returns
  `{left: lvl.ind if finite else 720+360·level, first: −|lvl.hanging if finite else 360|}`.
  Constants: `HANGING_TWIPS=360`, `LEVEL_STEP_TWIPS=360`, `FIRST_LEVEL_TWIPS=720` (`lists.js:203-207`).
- `listParaDelta(doc, listId, level)` (`lists.js:388-396`):
  - With a list: `{numbering:{listId, level: clamp 0..8}, left, first}`.
  - With `listId` null: `{numbering:null, left:0, first:0}`. Here `numbering:null` **removes** the
    override, while `left` and `first` become explicit 0 overrides.
- `setList(range, listId, {level?})` (`reg.js:974-1006`) applies that delta to every `p` in the
  region. The level kept is the forced level, else the paragraph's current level, else 0.
- `setListLevel(range, ±1)` (`reg.js:1014-1042`) changes the level only for paragraphs already in a
  list, clamped to 0..8.
- docx import: a list paragraph without its own `w:ind` gets `left = level.ind ?? 720` and
  `first = −|level.hanging ?? 360|` (`Reader.php:653-661`).
- Templates: `para = {numbering, left, first, after:40, …}` (`tpl.js:201-213`).

### 8.5 Marker text

`formatOrdinal(n, fmt)` (`lists.js:121-133`). `n` is `floor(n)` if it is finite and > 0, else 1.

- `lowerLetter`: `toLetter(n)`. Uses repetition, not base 26: `idx=(n−1)%26`,
  `rep=floor((n−1)/26)+1`, giving `chr(97+idx)` repeated `rep` times (1→a, 26→z, 27→aa, 28→bb)
  (`lists.js:108-113`).
- `upperLetter`: the same, upper-cased.
- `lowerRoman`: greedy with pairs `[1000 m, 900 cm, 500 d, 400 cd, 100 c, 90 xc, 50 l, 40 xl, 10 x,
  9 ix, 5 v, 4 iv, 1 i]`. There is no upper bound; 4000 gives `mmmm` (`lists.js:92-105`).
- `upperRoman`: the same, upper-cased.
- `ordinal`: `` `${n}.º` `` (Spanish masculine abbreviation).
- `decimal` and anything else: `String(n)`.

`computeListLabels(doc)` (`lists.js:420-470`) is used for painting and returns
`Map<blockId, {text, font?, bullet}>`:

```
counters: Map listId → int[9] all 0
for block in body (document order):
    skip if block.t != 'p' or block.id == null or block.hf          // NOTE: cell and fn paragraphs ARE counted
    num = numberingOf(doc, block); if null continue
    arr = counters[num.listId] (create zeros)
    arr[level] += 1; for i in level+1..8: arr[i] = 0                 // deeper levels restart
    def = findNumberingDef; lvl = levelDef(def, level); if null continue   // (counter already bumped)
    isBullet = lvl.fmt == 'bullet' or (!lvl.fmt and (def.type == 'bullet' or lvl.char != null))
    if isBullet: label = {text: lvl.char ?? '•', font: lvl.font or undefined, bullet:true}; continue
    fmt = lvl.fmt ?? def.type ?? 'decimal'
    if lvl.lvlText is a non-empty string:
        text = lvlText with each /%(\d)/ replaced by:
             idx = d-1; if idx<0 or idx>=9: ''  (so %0 becomes '')
             else formatOrdinal(max(1, arr[idx]), (levelDef(def,idx).fmt) or fmt)
        // NO sep appended
    else: text = formatOrdinal(arr[level], fmt) + (typeof lvl.sep == 'string' ? lvl.sep : '.')
    label = {text, font: lvl.font or undefined, bullet:false}
```

Rules:

- Non-numbered paragraphs in between do **not** interrupt a list.
- Each `listId` has its own counters, separate from every other list.
- There is no `start` or restart value (`lists.js:163-171`).

`computeOrdinals(doc)` (`lists.js:175-196`) is the older version: the same counting but **without**
skipping `hf` blocks, and it returns only the ordinal. `listMarkerText(doc, block, ordinal)`
(`lists.js:145-158`) builds the same label as above but **ignores `lvlText`**.

---

## 9. Media map (`doc.media`)

```jsonc
"media": { "a1b2c3d4e5f60718.png": { "file": "media/a1b2c3d4e5f60718.png", "w": 9026, "h": 6000, "mime": "image/png" } }
```

- **rid** is generated by the server: 16 lowercase hex characters, a dot, and an extension from
  `png`, `jpg`, `gif`, `webp`, `bmp` (`Reader.php:1587-1613`, `NOTES:159-162`). `file` is
  `'media/'+rid`. `mime` is one of `image/png`, `image/jpeg`, `image/gif`, `image/webp`,
  `image/bmp`. Size limit: 10 MB.
- Units of `w`/`h`: see §2.3 (inconsistent; informational only).
- `registerMedia(rid, info)` is not undoable. An orphan media entry is harmless (`reg.js:1322-1334`).
- A watermark can also reference media through `{rid}` (§10.4).
- **[REC] for the desktop app:** keep this map unchanged. Store image bytes beside the document,
  or embed them in a package format. `file` is a server-relative path; resolve it against a local
  media directory.

---

## 10. Other document-level collections

### 10.1 Comments (`reg.js:1804-1874`, `Reader.php:2878-2904`)

```jsonc
{ "id": "c1-1", "author": "Ana Pérez", "initials": "AP", "date": null,
  "text": "Comentario…", "blockId": "b3", "start": 4, "end": 12,
  "resolved": false, "replies": [ { "author": "Luis", "text": "Respuesta" } ] }
```

- The anchor is **one block** with linear offsets `[start, end)`. If the selection spans several
  blocks, `end` is cut to the length of the start block. The anchor is **not updated** when the text
  is edited; the comments panel clamps it to the block length when painting.
- The id from the UI is `` `c${list.length+1}-${max(second dash-part of existing ids)+1}` ``. docx
  import uses `'c'+w:id`.
- `initials` is the first letter of the first word plus the first letter of the last word, upper
  case, or `'?'` when there is no name (`reg.js:96-100`). docx import uses up to 3 letters, one per
  word, with `'A'` as the fallback (`Reader.php:2906-2916`).
- `date` is the date given in the info, or null.
- `updateComment(id, {resolved?, text?, reply?})` pushes `{...reply}` onto `replies`. The UI reply
  is `{author, text}` (`ui/comments.js:247`).
- A comment whose text is empty after trimming is a no-op.

### 10.2 Bookmarks (`reg.js:1290-1320`, `Reader.php:448-454`)

`[{name: string, blockId, offset}]`.

- Names are trimmed and unique: setting an existing name moves that bookmark (remove, then push).
- docx import skips names that start with `_` (Word's hidden bookmarks such as `_GoBack` and `_Toc`).
- Used by «Ir a» and by cross references (`ui/dialogs/references.js:424-425`).

### 10.3 Tracking

`{enabled: bool, author: string, showMarks: bool, date?: string}` (`doc.js:154`, `reg.js:1884-1894`).
`setTracking` shallow-merges into it.

### 10.4 Watermark (`main.js:1705-1724`, `pages.js:773-810`)

```jsonc
{ "text": "BORRADOR", "font": "Aptos", "size": 0, "color": "#C8C6C4", "diagonal": true, "opacity": 0.4 }
// or image form: { "rid": "<media rid>", "opacity": 0.4, "diagonal": true }
```

Rendering:

- The watermark is centred on every page.
- Text is bold. Font size is `size` px, or `round(page.wPx/8)` when `size` is 0.
- Rotation is −35° unless `diagonal === false`. Opacity defaults to 0.4.
- An image watermark is limited to 70% of the page in each dimension.
- Nothing is drawn when the value is null or has neither `text` nor `rid`.

### 10.5 Page border (`main.js:1727-1742`, `pages.js:759-770`, `tpl.js:906`)

`{style: CSS border style ('solid','double','dotted','dashed',…), color: '#RRGGBB', width: px, space: px}`.

- Defaults: color `#000000`, width 1, space 24. Width is clamped to at least 0.5 px when drawn.
- `style:'none'` or null means no border.
- docx `pgBorders` is converted with `width = max(1, round(sz/8 · 96/72))`, `space = round(space ·
  96/72)`, and style double/triple → `double`, dotted → `dotted`, dash variants → `dashed`, anything
  else → `solid` (`Reader.php:2464-2488`).
- It applies to every page; it is document-wide, not per section.

### 10.6 Ink (`editor/ink.js:8-25`)

`ink = { "<pageNo>": [ {tool, color, width, points: [[x,y], …]} ] }`.

- `tool` ∈ `pen`, `highlighter`, `eraser`, `lasso`. Only drawing tools are stored.
- Tool presets: pen (width 2, opacity 1, round cap), highlighter (width 14, opacity 0.4, square
  cap), eraser (12), lasso (1).
- `points` are page coordinates in px at zoom 1. A new point is recorded only after the pointer moves
  at least 1.5 px.
- Keys are 1-based page numbers stored as strings.

### 10.7 Mail merge

`mailMerge = {fields: string[], records: [{field: value}]}`.

`parseDelimited(text, sep?)` (`editor/mailmerge.js:39-78`):

1. Normalise CRLF and CR to LF, then trim. Empty input gives `{fields:[], records:[]}`.
2. Pick the delimiter from the first line: tab if it contains a tab, else `;` if it contains `;`
   and no `,`, else `,`.
3. Parse RFC-4180-style quotes: `""` is an escaped quote.
4. The header cells (trimmed) become `fields`.
5. Rows where every value is blank are dropped. Values are trimmed.

### 10.8 Fields written by the app but lost on save **[JS-BUG]**

The command `setDocProps` writes arbitrary keys on the DocModel instance (`reg.js:1969-1985`).
`toJSON()` only emits the 25 keys of §2.1, and the constructor only reads those keys. So these keys
**are lost on save and reload** in the web app:

| Key | Shape | Set at |
|---|---|---|
| `sources` | `[{author, title, year, publisher, city, url}]` (the bibliography) | `ui/dialogs/references.js:217-218` |
| `citationStyle` | `'APA'`, `'MLA'`, `'Chicago'`, `'ISO690'` (default `'APA'`) | idem; `refs.js:24` |
| `indexEntries` | `[{text, blockId, offset}]` | `main.js:1270-1278` |
| `mailMergeKind` | string, for example `'letters'` | `main.js:1076` |
| `notesConvertedAt` | epoch ms | `ui/dialogs/references.js:539` |
| `_warnings` | `string[]` (docx import warnings) | `Reader.php:272` |

**[REC]** C++ should load and save `sources`, `citationStyle` and `indexEntries`; the web app reads
them back if present, so this is a harmless superset. More generally, keep any unknown top-level
key in an "extras" map and write it back after the 25 standard keys. Do not persist `_warnings`.

---

## 11. Identifiers

| Kind | Format | Generator |
|---|---|---|
| Block (`p`, `table`, `smartart`, cell, `hf`, `fn`) | `'b'+N` | `DocModel.newBlockId()` (`doc.js:336-342`): `do { id = 'b' + (++seq) } while (getBlock(id))`. `seq` starts at the largest N among ids matching `/^b(\d+)$/` in the body when the model is constructed (`doc.js:418-430`). It is raised by `insertBlock` and `restoreRegion`. **[QUIRK]** Ids added directly to `body` (`reg.js` splices) do not raise `seq`, but the uniqueness loop still prevents collisions. Ids that do not match `bN` are allowed (for example from other producers) and are never generated. |
| Section | `'sec'+N` | §4.1 |
| List def | gallery ids, `n1`/`n2`, `'num'+numId` (docx) | §8 |
| Comment | `c{k}-{m}` (UI), `c{wid}` (docx) | §10.1 |
| Note | `'n'+base36(Date.now())` (UI), `fn{wid}`/`en{wid}` (docx) | §6.6 |
| Media rid | `16hex.ext` | §9 |
| Templates | sequential `b1..bN` in document order (`tpl.js:137-141`) | |
| docx import | sequential `b1..bN`, one counter for paragraphs, tables and notes (`Reader.php:420,1832,1353`) | |

`insertBlock(i, block)` (`doc.js:307-317`):

- If `id` is missing **or already used**, generate a new one.
- A missing `sec` becomes `sections[0].id ?? 'sec1'`. A missing `t` becomes `'p'`.
- The index is clamped to `[0, len]`; a non-finite index means append.
- Emits `doc:changed {structural:true, blockIds:[id]}`.

`removeBlock(id)` (`doc.js:323-329`) emits `{structural:true, blockIds:[id]}`.

---

## 12. Rich-text engine (`rt.js`)

Every run mutation goes through this module. The functions mutate in place, do **not** emit events,
and do not resolve styles (`rt.js:1-44`). The C++ port should be a pure library with the same API
(see the Higgs architecture: headless engine plus a command layer).

### 12.1 Linear space

```
runLength(run) = run.t == 'text' ? (run.text ?? '').length /*UTF-16 units*/ : 1
blockLength(block) = Σ runLength(runs)                          // table/smartart blocks ⇒ 0
```

- Offsets range over `0..blockLength`. Emoji and other non-BMP characters take 2 units.
- **[REC]** In C++, store run text as UTF-16 (`std::u16string`). Alternatively, convert offsets
  consistently. `juce::String::length()` counts **code points**, not UTF-16 units, so do not use it
  for offsets.
- **[QUIRK]** `runsOf(block)` *creates* `block.runs = []` on any block that has no `runs`, including
  table blocks, whenever the block is touched by these functions (`rt.js:78-82`). Saved JSON may
  therefore contain `"runs": []` on `table` or `smartart` blocks. Accept that and preserve it.

### 12.2 Offset helpers

- `clampOffset(block, x)`: `n = trunc(Number(x))`. A non-finite or negative value becomes 0; a value
  above `blockLength` becomes `blockLength` (`rt.js:155-160`).
- `snapOffset(block, off, dir)` (`rt.js:168-182`):
  1. Find the text run where `acc < off < acc+len` (the offset is strictly inside it).
  2. If `text[off−acc−1]` is a high surrogate and `text[off−acc]` is a low surrogate, return `off−1`
     when `dir < 0`, else `off+1`.
  3. In every other case, return `off` unchanged.
- `normalizeRangeIn(doc, range)` (`rt.js:189-214`):
  1. `start = range.start ?? range.end`, `end = range.end ?? range.start`. If either is missing,
     return null.
  2. If either block id is unknown, return null.
  3. Swap start and end if they are out of document order (compare block index, then numeric
     offset).
  4. Clamp both offsets.
  5. If the range is collapsed, snap both to `snapOffset(off, −1)`. Otherwise snap start with −1
     and end with +1.
  6. Always return new objects.
- `runAtOffset(block, off)` (`rt.js:339-351`):
  - Clamp `off`, then return the first run where `off < acc+len`, as `{runIdx, runOffset: off−acc}`.
    At a boundary between runs this is the run on the **right**.
  - At the end of the block it returns `{runIdx: last, runOffset: runLength(last)}`.
  - A block with no runs gives `{0, 0}`.
  - Zero-length runs are never returned unless they are the last run.
- `offsetOfRun(block, i)` (`rt.js:360-366`): the sum of the lengths of runs `0..i−1`, where `i` is
  `max(0, trunc(i))`. An index past the end gives `blockLength`.
- `splitRunsAt(block, off)` (`rt.js:236-254`):
  1. Walk the runs. When `off === acc`, return `i`; this also fires for zero-length runs, returning
     the index of a carrier.
  2. If `off < acc+len` and the run is text, replace it with two deep clones holding
     `text[0..cut)` and `text[cut..)`, and return `i+1`. A non-text run (length 1) cannot be split
     internally.
  3. If the walk reaches the end, return `runs.length`.
  
  It never creates an empty run.
- `boundaryIndex(block, off)` (`rt.js:221-229`): the index of the run that starts exactly at `off`,
  or `runs.length`.
- `sliceRuns(block, from, to)` (`rt.js:260-280`): deep clones of the pieces that overlap
  `[from, to)`. Text runs are sliced; other runs are included whole; zero-length runs are skipped.
  An empty range gives `[]`.
- `fragmentBlock(block, from, to)` (`rt.js:283-292`): deep-clones **every key except `runs`**
  (including `id`, `style`, `para`, `cell`, `hf`, `fn` and the generated-content markers), sets
  `t = 'p'` when missing, and sets `runs = sliceRuns`.
- `removeSpan(block, from, to)` (`rt.js:295-302`): split at `from` and at `to`, then splice out the
  runs between the two boundaries. It does not merge.

### 12.3 Format equality and delta

- `definedKeys(o)` = the keys whose value is not `undefined`. **A `null` value counts as defined**
  (`rt.js:102-107`).
- `charEquals(a, b)` (`rt.js:113-119`): both must have the same number of defined keys, and
  `a[k] === b[k]` for every key. That is strict, **shallow** equality: values that are objects
  (`ins`, `del`, `effect`) are equal only when they are the *same reference*. Consequences:
  - `{highlight:null}` is not equal to `{}`.
  - Two runs whose `ins` objects are equal but are different objects (for example after a JSON
    round trip) do **not** merge in JS.
  - **[REC]** In C++, use **deep** equality (as `CONTRACTS:143` says: "deep equal"). The results are
    semantically identical; only the number of runs can differ. Golden tests should compare runs
    after normalising adjacent equal runs.
- `cleanFormat(f)` returns a copy without `undefined` keys.
- `applyDelta(base, delta)` (`rt.js:132-142`): copy `base`, then for each key of `delta`: skip when
  the value is `undefined`; **delete** the key when it is `null`; otherwise set it.

### 12.4 `rawCharAt(doc, pos)` (`rt.js:380-396`)

This returns the raw override format that newly typed text would get. Word's rule is that the
character **before** the caret decides.

```
if block missing or no runs: return {}
off = clampOffset; target = off > 0 ? off-1 : 0; acc = 0; lastText = null
for run in runs:
    len = runLength(run); if run.t == 'text': lastText = run
    if target < acc+len: return run.t == 'text' ? cleanFormat(run.char) : {}   // after an image/field/tab ⇒ {}
    acc += len
return lastText ? cleanFormat(lastText.char) : {}   // end of block, or a block made only of 0-length carriers
```

### 12.5 `insertTextAt(doc, pos, text, charFmt=null)` (`rt.js:413-436`)

```
block = getBlock(pos.blockId); if missing: return {blockId: pos.blockId, offset: 0}
off = snapOffset(block, clampOffset(block, pos.offset), -1)
if text is not a string or is empty: return {block.id, off}
char = charFmt ? cleanFormat(charFmt) : rawCharAt(doc, {block.id, off})   // NOTE: charFmt = {} is truthy ⇒ "no overrides"
idx = splitRunsAt(block, off); prev = runs[idx-1]; next = runs[idx]
if prev is text and charEquals(prev.char, char): prev.text += text
elif next is text and charEquals(next.char, char): next.text = text + next.text
else: insert {t:'text', text, char?: copy(char) only if it has defined keys} at idx
mergeAdjacentRuns(block)
return {blockId: block.id, offset: off + text.length}
```

The text is inserted literally. `'\n'` and `'\t'` are **not** interpreted; callers split paragraphs
themselves (`reg.js:35-38`). docx import turns tab and newline characters inside text into spaces
(`Conv.php:317-324`).

Command-layer rule for typing over a selection: the format comes from
`rawCharAt(start.offset + 1)`, read **before** the deletion, so the new text takes the format of the
first replaced character (`reg.js:647-655`, `NOTES:23-26`).

### 12.6 `deleteRange(doc, range)` → fragment (`rt.js:446-467`)

```
r = normalizeRangeIn; if null: return {blocks: []}
fragment = extractRange(doc, r)
if same block: removeSpan(start, s.off, e.off)
else:
    tail = sliceRuns(endBlock, e.off, len(endBlock))
    removeSpan(startBlock, s.off, len(startBlock)); startBlock.runs.push(...tail)
    body.splice(si+1, ei-si)                 // removes the intermediate blocks AND the end block
mergeAdjacentRuns(startBlock)
return fragment
```

The start block keeps its `id`, `style`, `para` and all its markers (Word rule).

**Edge case:** intermediate blocks of any type are removed, including tables, their cells and
smartart. If a range starts outside a table and ends inside a cell paragraph, the code removes that
cell paragraph but leaves the `table` block pointing at a missing id, because nothing in the code
prevents it. **[REC]** The editor should not allow a range to cross a table boundary, or should
widen the range to the whole table region.

### 12.7 `extractRange(doc, range)` → `{blocks}` (`rt.js:478-495`)

This does not mutate.

- Same block: one `fragmentBlock(block, s, e)`.
- Otherwise:
  - first block: `fragmentBlock(startBlock, s, len)`,
  - intermediate blocks: whole fragments,
  - last block: `fragmentBlock(endBlock, 0, e)`.

A collapsed range gives one block with `runs:[]`. A round trip with `insertFragment` is exact,
including ids when they are free.

### 12.8 `insertFragment(doc, pos, fragment)` → `Pos` (`rt.js:511-565`)

```
block missing ⇒ {pos.blockId, 0}; off = snap(clamp(pos.offset), -1); blocks = fragment.blocks or []
if blocks empty: return {block.id, off}
if blocks.length == 1:                                  // runs only; block-level props of the fragment are IGNORED
    runs = deepClone(blocks[0].runs ?? []); added = Σ runLength
    idx = splitRunsAt(block, off); block.runs.splice(idx, 0, ...runs); mergeAdjacentRuns(block)
    return {block.id, off + added}                      // NOTE: no format inheritance (unlike insertTextAt)
multi:
    bi = index(block); idx = splitRunsAt(block, off); tail = block.runs.splice(idx)
    block.runs.push(...deepClone(blocks[0].runs)); mergeAdjacentRuns(block)   // left part keeps ITS own para/style/markers
    used = {}; created = []
    for src in blocks[1..]:
        nb = deep clone of every key of src except runs and id
        nb.t ??= 'p'; nb.sec ??= block.sec; nb.style ??= block.style ?? 'Normal'
        nb.id = (src.id is a string, not in the body, not in used) ? src.id : newBlockId (skipping used)
        used.add(nb.id); nb.runs = deepClone(src.runs ?? []); created.push(nb)
    last = created.last; endOffset = Σ runLength(last.runs); last.runs.push(...tail)
    mergeAdjacentRuns on each created block; body.splice(bi+1, 0, ...created)
    return {last.id, endOffset}
```

Consequences:

- The tail of the original paragraph takes the **last fragment block's** paragraph properties.
- New blocks do **not** inherit `cell`, `hf` or `fn` from the target block. They keep whatever the
  fragment carried, for example `cell` markers copied from somewhere else. **[REC]** When pasting a
  multi-block fragment *into* a cell, band or note, strip the fragment's markers and copy the
  target's marker. When pasting *outside*, strip `cell`, `hf` and `fn`.

### 12.9 `mergeAdjacentRuns(block)` (`rt.js:716-740`)

```
kept = runs without null/undefined entries and without text runs whose (text ?? '') == ''
if kept is empty:
    carrier = first text run whose char has at least one defined key
    block.runs = carrier ? [carrier] : []       // keeps a zero-length "paragraph mark" format carrier
    return
merged = []
for run in kept:
    if the last merged run and run are both text and charEquals(last.char, run.char): last.text += run.text   // mutates last; keeps last's other keys
    else merged.push(run)
block.runs = merged
```

Non-text runs never merge. Only `char` is compared, so any extra keys on a text run come from the
left run.

The **format carrier** is a text run of length zero, `{t:'text', text:'', char:{…}}`. It survives
only while the paragraph has no real content (`rt.js:38-44`). It has linear length 0, and
`rawCharAt` reads it as `lastText`.

### 12.10 `splitBlockAt(doc, pos)` → `{newBlockId}` (the Enter key, `rt.js:576-611`)

```
off = snap(clamp, -1); inherited = rawCharAt(doc, {block.id, off})     // computed BEFORE mutating
idx = splitRunsAt(block, off); tail = block.runs.splice(idx)
nb = {t:'p', id: newBlockId, sec: block.sec, style: block.style ?? 'Normal', runs: tail}
if block.para has defined keys: nb.para = deepClone(block.para)
if block.hf:   nb.hf   = deepClone(block.hf)      // stays in the same header/footer band
if block.cell: nb.cell = deepClone(block.cell)    // stays in the same cell (bug fix, NOTES:252-253)
if block.fn:   nb.fn   = deepClone(block.fn)      // stays in the same note (see JS-BUG §6.6)
if tail is empty and inherited has keys: nb.runs.push({t:'text', text:'', char: copy(inherited)})
mergeAdjacentRuns(block); mergeAdjacentRuns(nb); body.splice(bi+1, 0, nb)
```

- The new paragraph keeps the **same style**. The style's `next` field (`Normal.next='Normal'`,
  `Heading1.next='Normal'`) is **never used** anywhere in the JS. **[QUIRK]** In Word, Enter after a
  heading gives Normal; in Skriba it gives another heading. Keep this for parity, or implement
  `next` as a deliberate improvement.
- The generated-content markers (`toc`, `caption`, …) and other unknown keys are **not** copied.
- Splitting at offset 0 leaves the first paragraph with `runs:[]` and no carrier, and the new block
  takes all the content.

### 12.11 `mergeWithPrevious(doc, blockId)` (Backspace at offset 0, `rt.js:622-634`)

If the block index is ≤ 0, return null. Otherwise:

1. `pos = {prev.id, blockLength(prev)}`.
2. Push deep clones of the block's runs onto `prev`, then `mergeAdjacentRuns(prev)`.
3. Remove the block and return `pos`.

`prev` keeps its own style, `para` and markers. Delete at the end of a paragraph is
`mergeWithPrevious(next.id)` (`reg.js:872-878`). Note: there is **no** guard against merging across
cell, band, note or table boundaries in the engine.

### 12.12 `applyCharFormat(doc, range, delta)` → touched ids (`rt.js:645-678`)

```
r = normalize; if !r or delta has no defined keys: return []
for i in si..ei:
    from = (i==si) ? s.off : 0; to = (i==ei) ? e.off : blockLength(block); if !(to > from) continue
    splitRunsAt(from); splitRunsAt(to); i1 = boundaryIndex(from); i2 = boundaryIndex(to)
    for k in i1..i2-1: if runs[k] is text: nx = applyDelta(run.char, delta); nx has keys ? run.char = nx : delete run.char; changed = true
    if changed: mergeAdjacentRuns(block); touched.push(id)
```

- Non-text runs are not changed. The JS does not apply format to field, image or math runs, even
  though they can carry `char`.
- A collapsed range does nothing. Callers expand it to the word under the caret first
  (`charfmt.js` `expandRangeToWord`).
- An end at offset 0 of a later block touches nothing in that block.

### 12.13 `applyParaFormat(doc, range, delta)` (`rt.js:689-706`)

For each block `i` from `si` to `ei`:

1. If `i === ei`, `ei !== si`, and `end.offset === 0`, stop. A selection that ends exactly at the
   start of a paragraph does not include that paragraph.
2. Set `block.para = applyDelta(block.para, delta)`. If the result has no keys, delete `block.para`.

A collapsed range affects the caret's paragraph. Note: the loop also writes `para` onto table blocks
if they fall inside the range.

### 12.14 Command-layer conventions that affect the model (`reg.js`)

- **Undo by region snapshot** (`reg.js:13-25,417-450`):
  1. Before the change, `before = captureRegion(doc, startIdx, count)`.
  2. Mutate.
  3. `after = captureRegion(doc, startIdx, count + Δblocks)`.
  4. Undo is `restoreRegion(doc, before, after.count)`. Redo is `restoreRegion(doc, after,
     before.count)`.
  
  Non-block state (sections, bookmarks, comments, styles, theme, document properties) uses
  value-snapshot commands (`reg.js:461-486`). The stack holds 100 entries. `beginBatch` and
  `endBatch` group several commands into one undo entry.
- `captureRegion(doc, s, c)` (`doc.js:581-586`): clamp `s` to `[0, len]` and `c` to `[0, len−s]`,
  and deep-clone the slice. `restoreRegion(doc, region, replaceCount = region.count)`
  (`doc.js:598-610`): splice `n = clamp(replaceCount)` blocks at `startIdx` with **clones** of the
  region's blocks (so a region can be restored many times), raise the id counter, and emit
  `doc:changed {structural:true}`.
- After every execute, undo or redo: `doc.touch()`, then `doc:changed`. That is
  `{structural:true}` when the block count changed or the command is structural (lists, sections,
  tables, styles, …), else `{blockIds}`.
- A no-op command (empty delta, Backspace at the very start of the document, …) is not stacked but
  still returns `result.caretPos`.
- Backspace and Delete inside a block remove one "character" without splitting a surrogate pair. The
  linear text used for that has U+FFFC for every non-text run (`reg.js:122-150`). Removing a
  grapheme cluster (ZWJ emoji sequences, combining marks) is **not** handled; only surrogate pairs
  are.
- Line break, page break and tab are inserted as one-run fragments through `insertFragment`
  (`reg.js:696-727`). For example `{blocks:[{t:'p', runs:[{t:'break', type:'page'}]}]}`.
- `removeBlockById` never removes the last block. A document always has at least one block
  (`reg.js:796-806`).
- `replaceBody(blocks)` replaces the body with the new blocks, each with a **new** id, followed by
  clones of the existing `hf` blocks (`reg.js:2058-2078`).

---

## 13. Word count and text extraction

### 13.1 `DocModel.wordCount()` (`doc.js:87-101,397-407`)

```
n = 0
for block in body:
    if block.hf: continue                               // headers/footers do not count
    text = ''
    for run in block.runs ?? []:
        text-run ⇒ += run.text ?? ''; tab or break ⇒ += ' '; any other run (field, image, math) ⇒ nothing
    if text == '': continue
    n += count of non-empty pieces of text.split(SEP)
SEP = one or more of: U+0020 \t \n \r \f \v U+1680 U+2000–U+200A U+2028 U+2029 U+205F U+3000
```

- NBSP (U+00A0) does **not** separate words. Neither do U+200B, U+FEFF or U+0085.
- Cell paragraphs and **footnote paragraphs are counted**. The footnote's leading number text
  (`'1 '`) is counted as a word.
- Field results are not counted.
- Test vector (`tests/document.test.js:261`): "tabs y saltos separan; el espacio duro no; campos no
  cuentan" (tabs and breaks separate words; the hard space does not; fields are not counted).

### 13.2 Other text helpers (used by different features; do not mix them)

| Function | Rule | Ref |
|---|---|---|
| `DocModel.blockText(id)` | Text runs only, concatenated | `doc.js:384-390` |
| Linear text (commands, spelling) | text, plus U+FFFC for every non-text run; length equals `blockLength` | `reg.js:122-128`, `CONTRACTS:1004` |
| Outline text | text + field `result` + a space per tab; `\s+` collapsed to one space; trimmed | `editor/outline.js` |
| `documentStats` (dialog «Contar palabras») | Only `p` blocks; skips `hf` unless `includeBands`. text + a space per tab or break + field `result`. Words split on `[\s\u00A0]+`, so here **NBSP does separate words**, unlike `wordCount`. `chars` = length with all `\s` removed; `charsWithSpaces` = full length; `paragraphs` = number of `p` blocks. | `editor/proofing.js:201-231` |

---

## 14. Default style catalogue and other defaults

### 14.1 `defaultStyles()` (`doc.js:453-562`). Each call returns new objects.

| id | name (es, verbatim) | type | basedOn | next | char | para |
|---|---|---|---|---|---|---|
| `Normal` | «Normal» | paragraph | null | Normal | **full**: `{font:'Aptos', size:11, bold:false, italic:false, underline:'none', strike:false, sub:false, sup:false, color:'auto', highlight:null, allCaps:false, smallCaps:false}` | **full**: `{align:'left', line:276, before:0, after:160, left:0, right:0, first:0, tabs:[], keepNext:false, widowControl:true, numbering:null}` |
| `SinEspacio` | «Sin espacio» | paragraph | Normal | SinEspacio | `{}` | `{line:240, before:0, after:0}` |
| `Titulo` | «Título» | paragraph | Normal | Normal | `{font:'Aptos Display', size:28}` | `{line:240, before:0, after:80}` |
| `Subtitulo` | «Subtítulo» | paragraph | Normal | Normal | `{size:14, color:'595959'}` | `{after:160}` |
| `Heading1` | «Título 1» | paragraph | Normal | Normal | `{font:'Aptos Light', size:16, color:'2F5496'}` | `{before:240, after:80, keepNext:true}` |
| `Heading2` | «Título 2» | paragraph | Normal | Normal | `{font:'Aptos Light', size:14, color:'2F5496'}` | `{before:160, after:80, keepNext:true}` |
| `Heading3` | «Título 3» | paragraph | Normal | Normal | `{font:'Aptos Light', size:12, color:'1F3763'}` | `{before:160, after:80, keepNext:true}` |
| `Cita` | «Cita» | paragraph | Normal | Normal | `{italic:true, color:'404040'}` | `{align:'center', before:160, after:160}` |
| `Enfasis` | «Énfasis» | **character** | null | null | `{italic:true}` | `{}` |

Style object shape: `{id, name, type:'paragraph'|'character', basedOn: id|null, next: id|null,
char:{}, para:{}}`.

- docx import can add any style id, and styles with `type` paragraph or character. The import
  synthesises a Normal from `docDefaults`, using Word's values for a document without a template
  (10 pt, line 240, after 0) for anything not specified (`Reader.php:2688-2713`). Built-in English
  style names map back to these ids by name (`Reader.php:2595-2598`).
- PHP's fallback Normal (`Conv.php:384-403`) also has `char.spacing:0` and `para.outlineLvl:null`.
- **[QUIRK]** The cover page factory uses `style:'Title'` (`insert.js:157,163,168`), but the catalogue
  id is `Titulo`. `'Title'` is unknown, so it resolves as **Normal** (§5.2). Keep this for parity, or
  add `Title` as an alias for `Titulo`. The plan's example also uses `"Title"` (`plan:347`).
- Gallery order (`styles.js:230-256`):
  `Normal, SinEspacio, NoSpacing, Heading1, Heading2, Heading3, Titulo, Title, Subtitulo, Subtitle,
  Enfasis, Emphasis, Cita, Quote`. Only ids that exist are shown, in that order, followed by the
  remaining styles in document order. Duplicate ids keep the first occurrence.

### 14.2 Blank document (`DocModel.createDefault(name='Documento1.docx')`, `doc.js:179-199`)

One section `sec1` with the A4 defaults from §4.1, `defaultStyles()`, `defaultTheme()`, and
`body = [{t:'p', id:'b1', sec:'sec1', style:'Normal', runs:[]}]`.

The resulting JSON is (keys in `toJSON` order):

```json
{"version":1,"app":"Skriba-word","locale":"es-ES","name":"Documento1.docx",
 "createdAt":"…","modifiedAt":"…",
 "theme":{"majorFont":"Aptos","minorFont":"Aptos","colors":{"accent1":"2F5496","accent2":"C55A11","accent3":"548235","accent4":"7030A0","accent5":"C00000","accent6":"1F4E79"}},
 "styles":[…9 styles…],"numbering":[],
 "sections":[{"id":"sec1","page":{"w":11906,"h":16838,"orient":"portrait","margins":{"top":1440,"right":1440,"bottom":1440,"left":1440},"headerDist":720,"footerDist":720,"columns":{"count":1,"spacing":708}},"headers":{"default":null,"first":null,"even":null},"footers":{"default":null,"first":null,"even":null},"differentFirst":false,"differentEven":false,"linkToPrevious":true}],
 "body":[{"t":"p","id":"b1","sec":"sec1","style":"Normal","runs":[]}],
 "footnotes":[],"comments":[],"trackChanges":[],"media":{},"bookmarks":[],
 "pageColor":null,"watermark":null,"pageBorder":null,
 "tracking":{"enabled":false,"author":"Autor","showMarks":true},
 "protection":{"mode":"none"},"ink":{},"mailMerge":null,"dictionary":[],
 "activeView":{"view":"print","zoom":1,"page":1}}
```

---

## 15. Plan §5 / §7 versus the actual implementation

| Plan says | Reality (follow this) |
|---|---|
| Table cells nest paragraphs: `rows[].cells[].para[]`, with `cells[].width` | Cell paragraphs live in `body` with a `cell` marker; the cell holds `blocks:[ids]`; widths are in `table.cols` (§6.3) |
| `table.style:'TablaNormal'`, `props.width` | Not used. `props.style` is the table-style gallery id. |
| `{t:'p', break:'section'}` | Not used. Sections change through `block.sec` (§4.2). |
| `sections[].headers.default` refs | Always null. Bands are `hf` paragraphs (§4.3). |
| Offsets in code points | **UTF-16 code units** (`CONTRACTS:39-43`) |
| `footnotes[]` with an `anchor` | `fn` blocks plus `NOTEREF` fields (§6.6) |
| `comments[].anchor:'b3/r1'` | `{blockId, start, end}` linear offsets (§10.1) |
| `trackChanges[]` | `char.ins` / `char.del` (§5.3) |
| Runs `footnoteRef`, `commentMark`; `tab.pos`; `field.dirty` | Not used |
| `Normal.para.align:'justify'`, `char.spacing`, `para.outlineLvl` in Normal | `align:'left'`; `spacing` and `outlineLvl` are absent |
| Styles "Título 1–9, Cita intensa, TOC 1–3, …" (`plan:986`) | Only the 9 styles in §14.1 |
| Strike: single or double | A boolean |
| Highlight: 15 named colors | `#RRGGBB` (nearest named color on docx export, `Conv.php:154-177`) |

---

## 16. Event bus (`bus.js`)

Singleton publish/subscribe (`bus.js:36-92`):

- `on(evt, fn)` returns an idempotent unsubscribe function. It throws if `evt` is not a non-empty
  string (`'Nombre de evento inválido: se esperaba una cadena no vacía'`) or `fn` is not a function.
- `off(evt, fn)` removes the handler and deletes the event entry when its set becomes empty.
- `emit(evt, …args)` iterates over a **copy** of the handler set, in registration order. A handler
  that throws is logged and the other handlers still run. The same handler registered twice is
  called once (the set deduplicates).

Model events:

| Event | Payload | Meaning |
|---|---|---|
| `doc:changed` | `{blockIds?: string[], structural?: boolean}` | `structural` means the number or order of blocks or sections changed, or the change affects neighbouring blocks |
| `doc:loaded` | – | |
| `doc:saved` | `{at}` | |
| `selection:changed`, `undo:changed`, `zoom:changed`, `layout:done {pageCount}`, `mode:changed` | | UI |

`doc:changed` can be emitted twice for one structural operation (once by `restoreRegion`, once by
the command). That is harmless (`NOTES:43-45`). **[REC]** In C++, use a JUCE-free observer in the
engine library and coalesce notifications.

---

## 17. Templates as a model reference (`tpl.js`)

Templates show real documents built by the app. The builder rules (`tpl.js:127-347`):

- `p(content, {style='Normal', para, char, cell, hf})`: `content` may be a string, a run, or an
  array of strings and runs. `char` applies to runs that have no char of their own; when a run has
  one, the two are merged (`{...char, ...run.char}`). `para` is attached only when it has keys.
- `blank()` is `p('', {para:{after:0}})`. `pageBreak()` is a paragraph containing one
  `{t:'break', type:'page'}` with `para:{after:0}`.
- `rule({color='#BFBFBF', sz=6, after=120})` is an empty paragraph with
  `para:{after, borders:{bottom:{style:'single', sz, space:1, color}}}`.
- `header(...)` and `footer(...)` set `hf:{kind, variant}`, use `char:{size:9, color:'#808080'}`,
  default alignment left for headers and center for footers, and set `after:0`. `footerPages`
  writes «Página N de M» using PAGE and NUMPAGES fields that carry `char`.
- `table({cols, rows, props, headerRow, headShading='#D9E2F3', compact=true, cellChar})`
  (`tpl.js:268-329`):
  - props: `{align:'left', borders:'grid', fixedLayout:true, repeatHeader: headerRow,
    borderColor:'#BFBFBF', cellMargins:{60,108,60,108}, ...props}`.
  - A cell spec is a string, a run, an array of runs, or
    `{text|runs|paras, char, para, shading, vAlign, span, style}`.
  - `span` sets `gridSpan` and adds `span−1` slots of `{blocks:[], vAlign:'top', shading:null,
    merged:true}`.
  - In a header row, cells get `bold:true` and the header shading.
  - With `compact`, cell paragraphs get `para:{after:0, line:240}`.
  - Missing cells are filled with empty paragraphs.
  - The cell paragraphs are added right after the table, and then **an empty paragraph with
    `{after:0}` is always added after the table**.
- `page({margins, orient})` replaces the section. Landscape means `w=16838, h=11906`.
  `border(b)` sets `pageBorder` (px units).
- `buildTemplateDocument(id, base)` (`tpl.js:972-985`) starts from the server document (keeping
  name, dates, theme and media) or from a minimal base. It sets `version=1`; fills styles with
  `defaultStyles()` when they are empty; replaces numbering, sections and body; and sets
  `pageBorder` if the template has one. It throws `` `Plantilla desconocida: ${id}` `` for an
  unknown id. Template ids, categories and Spanish names are listed in `tpl.js:47-53,385-928`.
  They are useful as **golden test fixtures** for C++ (generate them once with Node and compare
  structurally).

---

## 18. Pitfalls checklist for the C++ port

1. Use UTF-16 offsets everywhere (§12.1). Every non-text run has length 1. Never split a surrogate
   pair (snapping rules in §12.2).
2. Round-trip unknown keys at every level: blocks, runs, `char`, `para`, cells, sections, styles,
   list defs, theme, and top-level extras (§10.8).
3. The map fields may arrive as `[]` (PHP). Read them as empty maps and always write `{}` (§2.1).
4. Colors appear in mixed forms (`'RRGGBB'`, `'#RRGGBB'`, `'auto'`, CSS names). Accept all of them
   and preserve the original string (§5.1).
5. `null` in a delta means remove the override. A `null` value stored in `char` is a real override
   (`highlight:null`), and it affects run merging (§12.3).
6. Cell paragraphs come immediately after their table; `cell` markers are the truth; `cells[].blocks`
   can be stale (§6.3).
7. Bands, notes and generated content are identified by markers, not by position (§4.3, §6.6, §6.7).
8. `PAGE` and `NUMPAGES` resolve only on an exact code match. `NOTEREF` numbering follows document
   order (§7.1).
9. Lists: counters per `listId`, deeper levels restart, `hf` is skipped, `lvlText` adds no `sep`
   (§8.5).
10. Known JS bugs to decide on: lost `sources`/`citationStyle`/`indexEntries`; a section break moves
    `hf` blocks; Enter in a note duplicates `fn.id`; `Title` vs `Titulo`; `style.next` is ignored;
    `media.w/h` units are inconsistent; `charEquals` compares objects by reference; a deletion can
    cross a table boundary.
11. Rounding: use JS `Math.round` semantics (halves toward +∞) in conversions to match the JS
    golden files (§1.1).
