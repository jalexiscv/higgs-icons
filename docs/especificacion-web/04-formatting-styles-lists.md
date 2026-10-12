# Spec 04 — Character/Paragraph Formatting, Styles, Lists, Themes, Fonts

Target: native C++20/JUCE port of Skriba. This document is self-sufficient: C++ engineers should
not need to read the JS/PHP sources. Every item carries a `file:line` reference (paths relative to
`C:/xampp/htdocs/Skriba/`) so details can be checked.

Abbreviations used for source paths:

| Abbrev | Path |
|---|---|
| `charfmt` | `public/js/formatting/charfmt.js` |
| `parafmt` | `public/js/formatting/parafmt.js` |
| `styles` | `public/js/formatting/styles.js` |
| `lists` | `public/js/formatting/lists.js` |
| `theme` | `public/js/core/theme.js` |
| `fonts` | `public/js/core/fonts.js` |
| `docjs` | `public/js/core/document.js` |
| `rt` | `public/js/core/richtext.js` |
| `units` | `public/js/core/units.js` |
| `reg` | `public/js/commands/registry.js` |
| `main` | `public/js/main.js` |
| `ribbon` | `public/js/ui/ribbon.js` |
| `input` | `public/js/editor/input.js` |
| `editor` | `public/js/editor/editor.js` |
| `fontdlg` | `public/js/ui/dialogs/font.js` |
| `paradlg` | `public/js/ui/dialogs/paragraph.js` |
| `design` | `public/js/ui/dialogs/design.js` |
| `breaker` / `paginator` / `pages` / `measure` | `public/js/layout/*.js` |
| `Reader` / `Writer` / `Conv` | `src/lib/OOXML/{Reader,Writer,Converters}.php` |
| `plan` / `CONTRACTS` | `plan.md` / `CONTRACTS.md` |

Status tags used below: **[IMPL]** implemented and must be reproduced; **[PARTIAL]** partially
implemented (behaviour described exactly as is); **[MODEL-ONLY]** stored/round-tripped but not
rendered or not editable in UI; **[NOT IMPL]** planned in plan.md but absent in code (a
recommended Word-compatible behaviour is given, clearly marked as *recommendation*).

---

## 0. Units and value conventions

| Quantity | Model unit | Notes / conversions |
|---|---|---|
| Lengths (indents, spacing before/after, tab positions, list `ind`/`hanging`) | twips (1/20 pt) | `ptToTwips(pt)=round(pt*20)`; `twipsToPt(tw)=tw/20` (no rounding) — `units:13-21` |
| cm ↔ twips | | `cmToTwips(cm)=round(cm*10*1440/25.4)`; `twipsToCm(tw)=tw*25.4/1440/10` — `units:33-51`. `cmToTwips(2.54)=1440`, `cmToTwips(1.25)=709` |
| twips → px @zoom1 | | `tw/20*96/72` (1440 tw = 96 px) — `units:24-26` |
| Font size `char.size` | points (float, normally multiples of 0.5) | range [1, 1638] — `charfmt:35-36` |
| Line spacing `para.line` with `lineRule` absent/`'auto'` | 1/240 of a line | 240=single, 276=1.15 (Word labels it 1,08 in plan; the UI shows "1,15"), 360=1.5, 480=double — `parafmt:50`, `plan:412` |
| `para.line` with `lineRule` `'exact'`/`'atLeast'` | twips (absolute) | `breaker:369-374`, `Reader:524-531` |
| Colors | `'auto'` or `'#RRGGBB'` (uppercase hex) in runs; styles and theme may store **without** `#` (`'2F5496'`) | Every consumer must accept both forms (`'RRGGBB'` and `'#RRGGBB'`). See §4.3 |
| Paragraph border `sz` | eighths of a point | OOXML `w:sz` — `CONTRACTS:891` |
| Paragraph border `space` | points | OOXML `w:space` |

Spanish number display in dialogs: decimal comma, at most 2 decimals for cm, 1 decimal for pt, no
trailing zeros (`toLocaleString('es-ES', {minimumFractionDigits:0, maximumFractionDigits:dec})`) —
`paradlg:69-71`. Input parsing accepts `,` or `.` as decimal separator (`paradlg:63-66`,
`fontdlg:226`).

---

## 1. Data model (JSON field names are normative)

### 1.1 Character format `char` (sparse POJO on a text run)

A run is `{t:'text', text, char?}` (`plan:396-414`). `char` is **sparse**: a key present = direct
override; absent key = inherited from the paragraph style. The **12 canonical keys** (the only ones
`resolveStyle` guarantees to be present after resolution) — `styles:49-62`, `CONTRACTS:47-50`:

| Key | Type / domain | Hard default | Meaning |
|---|---|---|---|
| `font` | string (family name, free text; not validated against catalogue) | `'Aptos'` | Font family |
| `size` | number, pt, [1,1638] | `11` | Font size |
| `bold` | bool | `false` | |
| `italic` | bool | `false` | |
| `underline` | `'none'│'single'│'double'│'words'│'dotted'│'dash'` | `'none'` | `charfmt:39-41`. `'dash'` exists in model/render but is not offered by any UI and is lost on .docx export (see §4.1) |
| `strike` | bool | `false` | Single strikethrough |
| `sub` | bool | `false` | Subscript (mutually exclusive with `sup`) |
| `sup` | bool | `false` | Superscript |
| `color` | `'auto'│'#RRGGBB'` (also `'RRGGBB'` in styles) | `'auto'` | Font colour |
| `highlight` | `null│'#RRGGBB'` | `null` | Highlight (background) colour |
| `allCaps` | bool | `false` | Display as uppercase (text unchanged) |
| `smallCaps` | bool | `false` | Small caps |

**Extended keys** present in documents (produced by .docx import or other subsystems). They are not
part of the resolved 12 but must be preserved round-trip:

| Key | Domain | Status | Source |
|---|---|---|---|
| `spacing` | int twips (character spacing, expanded >0 / condensed <0; 0 is never stored) | **[MODEL-ONLY]** imported from `w:spacing` and re-exported; NOT rendered/measured | `Reader:1034-1039`, `Writer:594-595`, `plan:353` |
| `link` / `linkTip` | URL string / tooltip | hyperlinks (other spec) | `pages:1165-1171` |
| `ins` / `del` | `{a: author, …}` | track changes (other spec) | `pages:1195-1203` |
| `effect` | WordArt effects object | other spec | `pages:1229-1231` |

Keys from plan §7.1 that **do not exist** in the model: `doubleStrike`/`dstrike` (import degrades
`w:dstrike` → `strike:true` with a warning, `Reader:1013-1018`), `shading` (character `w:shd` is
imported as `highlight` if no highlight is set, `Reader:1052-1059`), `position`, `scale` (`w:w`),
`hidden` (`w:vanish`/`w:webHidden` text is **discarded** on import with warning
"Texto oculto descartado", `Reader:952-957, 1071-1074`), `kern`, ligatures. All **[NOT IMPL]**.
If the C++ port adds them, use new keys and keep the 12 canonical keys untouched.

### 1.2 Paragraph format `para` (sparse POJO on a paragraph block)

Block: `{t:'p', id, sec, style, para?, runs:[]}` (`CONTRACTS:56-58`). The 11 canonical keys
guaranteed after resolution — `styles:65-77`:

| Key | Domain | Hard default | Meaning |
|---|---|---|---|
| `align` | `'left'│'center'│'right'│'justify'` | `'left'` | `parafmt:47` |
| `line` | int > 0 (see `lineRule`) | `276` | Line spacing |
| `before` | int twips ≥ 0 | `0` | Space before |
| `after` | int twips ≥ 0 | `160` (8 pt) | Space after |
| `left` | int twips (≥0 by UI; import may give negative) | `0` | Left indent |
| `right` | int twips | `0` | Right indent |
| `first` | int twips; >0 first-line indent, <0 hanging indent | `0` | |
| `tabs` | array of `{pos:int twips, type:string}` (a bare number is tolerated by layout) | `[]` | Custom tab stops |
| `keepNext` | bool | `false` | Keep with next |
| `widowControl` | bool | `true` | |
| `numbering` | `null│{listId:string, level:int 0..8}` | `null` | List membership |

Extended keys (all optional, written by .docx import, consumed by layout/writer) — `CONTRACTS:889-892`:

| Key | Domain | Status |
|---|---|---|
| `lineRule` | `'auto'│'exact'│'atLeast'` (absent = auto) | **[IMPL]** in layout (`breaker:369-374, 639-641`) |
| `keepLines` | bool | **[MODEL-ONLY]** round-trip (`Writer:451-452`) |
| `pageBreakBefore` | bool | **[IMPL]** paginator opens a new page if the current page is non-empty (`paginator:370-371`) |
| `contextualSpacing` | bool | **[IMPL]** (`paginator:361-368`, see §6.3) |
| `outlineLvl` | int 0..9 | **[MODEL-ONLY]** (writer clamps 0..9, `Writer:550-551`) |
| `borders` | `{top?,left?,bottom?,right?: {style, sz, space, color}}` | **[IMPL]** render (`breaker:302-351`) |
| `shading` | `'#RRGGBB'` | **[IMPL]** render |
| `dropCap` | drop-cap object | other spec |

`keepNext` and `widowControl` are **not applied** by the paginator (`paginator:19`). Autospacing
(`w:beforeAutospacing`/`afterAutospacing`) is **not modelled**: import ignores the attributes and
only reads numeric `before`/`after` (`Reader:515-523`).

Tab `type` domain (from import, `Conv:77, 264-268`): `'left'│'center'│'right'│'decimal'│'bar'│'clear'│'num'`
(unknown → `'left'`). Tab **leader** is **not modelled** (dropped on import). Layout treats **every**
tab stop as a left tab (see §6.3).

### 1.3 Style object (`doc.styles[]`)

```
{ id: string (ASCII, stable), name: string (es-ES display name), type: 'paragraph'|'character',
  basedOn: string|null, next: string|null, char: {sparse char}, para: {sparse para} }
```
`docjs:453-562`. `next` is stored but **never used** (see §8.6).

### 1.4 Numbering definition (`doc.numbering[]`)

```
{ id: string, type: 'bullet'|'decimal'|'lowerLetter'|'upperLetter'|'lowerRoman'|'upperRoman'|'ordinal',
  name?: string, sample?: string,           // only on gallery entries
  levels: Level[9] }
Level = { fmt?: 'bullet'|'decimal'|'lowerLetter'|'upperLetter'|'lowerRoman'|'upperRoman'|'ordinal',
          char?: string (bullet glyph), font?: string (bullet/number font),
          sep?: string (text after the number; default '.'),
          lvlText?: string (OOXML-style template, '%1.%2.'),
          ind: int twips (left indent of text), hanging?: int twips (≥0, default 360) }
```
`lists:41-58, 217-273`, `Reader:2238-2268`. `start`, `lvlJc`, `suff`, `isLgl`, `lvlRestart` are
**not modelled** (ignored on import, `Reader:2234`).

### 1.5 Theme (`doc.theme`)

```
{ majorFont: string, minorFont: string, colors: {accent1..accent6: 'RRGGBB' or '#RRGGBB', …}, name?: string }
```
Default (`theme:10-31`): `majorFont:'Aptos'`, `minorFont:'Aptos'`, colors (no `#`):
accent1 `2F5496`, accent2 `C55A11`, accent3 `548235`, accent4 `7030A0`, accent5 `C00000`,
accent6 `1F4E79`. Imported documents may also carry `dk1, dk2, lt1, lt2, hlink, folHlink` keys
(`Reader:2793-2815`).

---

## 2. Property resolution (effective format)

### 2.1 Order

Effective char at a position = **hard defaults → paragraph-style chain (root…leaf) → run `char`**.
Effective para = **hard defaults → paragraph-style chain → block `para`**.

There is **no character-style layer** and **no separate document-defaults object** in the model:
- "Document defaults" = the hard-coded `HARD_CHAR`/`HARD_PARA` (`styles:49-77`), equal to the
  built-in Normal style.
- Character styles are **flattened** into run `char` on .docx import (direct formatting wins over
  the character style: `$char + $base`, `Reader:1076-1081, 1116`, chain resolution `Reader:2707-2725`).
- .docx `docDefaults` are merged into the imported `Normal` style (`Reader:2683-2703`), see §8.7.

### 2.2 `resolveStyle(doc, styleId)` — `styles:176-198`

```
chain = buildChain(doc.styles, styleId)
  byId = map id -> style (first wins? no: later duplicates overwrite in Map.set; gallery uses first)
  st = byId[styleId] ?? byId['Normal'] ?? null        // unknown id -> document Normal
  while st != null and st.id not in seen:             // cycle guard
      seen.add(st.id); chain.push(st)
      st = st.basedOn != null ? byId[st.basedOn] ?? null : null
  reverse(chain)                                       // root first
char = copy(HARD_CHAR); para = copy(HARD_PARA) with fresh tabs []
for st in chain: mergeDefined(char, st.char); mergeDefined(para, st.para)
return {char, para}            // cached; treat as read-only
```
`mergeDefined` copies keys whose value `!== undefined` (a `null` in a style **does** overwrite, e.g.
`highlight:null`, `numbering:null`) — `styles:106-112`.

Rules / edge cases:
- A style whose chain does not reach Normal (`basedOn:null`) inherits the **hard defaults**, not the
  document's Normal (Word rule: root styles inherit document defaults) — `styles:13-18`.
- Unknown `styleId` resolves as the document's `Normal` (`styles:121`). If there is no Normal, hard
  defaults only.
- Circular `basedOn` stops at the first repeated id (no hang) — `styles:116-130`.
- `buildChain` uses `Map.set` in order, so with duplicate ids the **last** one wins for resolution
  (`styles:120`), while the gallery keeps the **first** (`styles:245`). Avoid duplicates.

**Cache**: keyed by identity of the `doc.styles` array → map `styleId → resolved` (`styles:89-95,
176-197`). Invalidated when (a) `doc.styles` is replaced by a new array (all style-mutating
commands do this: `reg:2012-2018, 2034-2043`), (b) `clearStyleCache()`, or (c) a
`doc:changed {structural:true}` event (`styles:99-101`). C++: use a version counter on the style
table instead.

### 2.3 `resolveCharFormat(doc, block, runChar)` / `resolveParaFormat(doc, block)`

`styles:205-219`: `mergeDefined(copy(resolveStyle(doc, block.style ?? 'Normal').char), runChar)` and
likewise for para with `block.para`. Shallow copy: `tabs`/`numbering` may share references —
replace, never mutate.

### 2.4 `formatAtPos(doc, pos)` and the "char before caret" rule

`styles:267-274`, `rt:380-396`:
```
block = doc.getBlock(pos.blockId); styleId = block?.style ?? 'Normal'
raw = rawCharAt(doc, pos)
    // offset = clamp(pos.offset); target = offset > 0 ? offset-1 : 0
    // walk runs (non-text runs have length 1); the run containing `target`:
    //   text run -> copy of its char without undefined keys; non-text run -> {}
    // offset past the end -> char of the LAST text run (or {})
char = mergeDefined(copy(resolveStyle(styleId).char), raw)
para = resolveParaFormat(doc, block ?? {})
return {char, para, styleId}
```
Word rule: the format "carried" at the caret is the one of the character **before** the caret; at
offset 0 the first character's format.

`editor.currentFormat()` (`editor:620-628`): position = `selection.focus` if collapsed, else
`selection.range.start`. **Pitfall**: with a non-collapsed selection starting at offset k>0, the
format reported (and used for toggles, ribbon state) is that of the character **before** the
selection (offset k-1), not the first selected character. The format painter compensates with
`offset+1` (`main:1856-1859`). Recommendation for the port: for non-collapsed selections evaluate
the first selected character (offset k → look at char k).

### 2.5 Ribbon state reflection — `ribbon:2290-2330`

Toggles lit from the effective char/para of `currentFormat()`: `bold`, `italic`,
`underline` (any value ≠ `'none'`), `strike`, `sub`, `sup`, `align:*` (exact match, default
`left`), list buttons by prefix of `para.numbering.listId` (`lb-`→Viñetas, `ln-`→Numeración,
`lm-`→Multinivel), font name box (`char.font || 'Aptos'`), size box (`String(size)` with `.`→`,`),
Layout-tab indent boxes (cm) and spacing boxes (pt), active style in gallery
(`styleId || 'Normal'`), format-painter toggle. There is **no "mixed/indeterminate" state**: the
value at the single evaluated position is shown.

---

## 3. Delta semantics (all formatting mutations)

### 3.1 Value semantics — `rt:131-141`

For each key of a delta: `undefined` → ignored; `null` → **deletes the override** (key removed so it
inherits again); any other value → sets the override. If the resulting char/para has no defined
keys, the `char`/`para` property is removed from the run/block (`rt:668-670, 704-706`).

Note: `charfmt.js` comments (`charfmt:46-60`) claim there is no way to delete an override; that is
outdated — `null` deletes. Consequence: `highlight:null` in a delta does NOT set "no highlight", it
removes the override and the style's highlight (if any) shows through.

The command layer strips keys starting with `__` and keys with `undefined` value before applying
(`reg:107-115`).

### 3.2 `applyCharFormat(doc, range, delta)` — `rt:645-679`, `reg:902-914`

```
if range collapsed or delta empty -> no-op command (nothing recorded)
for each block i from start block to end block:
    from = (i == start) ? range.start.offset : 0
    to   = (i == end)   ? range.end.offset   : blockLength(block)
    if to <= from: continue
    split runs at `from` and `to`
    for each run fully inside [from,to): if run.t == 'text': run.char = applyDelta(run.char, delta)
                                          (non-text runs — tab, break, image, field — untouched)
    mergeAdjacentRuns(block)
```
`mergeAdjacentRuns` (`rt:716-740`): drop empty text runs; merge consecutive text runs whose `char`
are deep-equal (undefined ≡ absent); if the paragraph becomes empty keep one empty text run that has
a non-empty `char` as "paragraph-mark format carrier".
Undo: one region snapshot command named `'Formato de fuente'`.

### 3.3 `applyParaFormat(doc, range, delta)` — `rt:689-710`, `reg:925-957`

Applies to every block from start to end block, **except** that if the range spans several blocks
and ends at offset 0 of the last block, that last block is not included (Word rule). Command name
`'Formato de párrafo'`; marked structural if the delta contains `numbering`.

Relative indent: if the delta contains `__indentDelta` (see §5.2), per paragraph
`left = max(0, currentLeft(b) + __indentDelta)` where `currentLeft` = `b.para.left` if finite, else
the style-resolved `left`, else 0 (`reg:563-572, 938-954`). In this relative path the delta is
applied to the **whole** of each block in the range (block-range loop over `regionOfRange`).

Para deltas are always stored as overrides on the block; styles are never modified by direct
formatting (plan F5 task 1).

---

## 4. Character properties — semantics, rendering, .docx mapping

### 4.1 Per-property table

| Key | Rendering (layout) | .docx import | .docx export |
|---|---|---|---|
| `font` | family stack from catalogue (`fontStack`, §10.4); measured with canvas | `w:rFonts` ascii→hAnsi→cs; if empty use theme font from `asciiTheme`/`hAnsiTheme` (`major*`→majorFont else minorFont) (`Reader:983-991, 2820-2828`) | `w:rFonts` |
| `size` | px = pt×96/72, ×0.65 when sub or sup; rounded to 2 decimals (`measure:47-53`) | `w:sz` half-points/2 (int if whole) | `w:sz`+`w:szCs` = round(pt×2) |
| `bold` | weight 700 | `w:b` (`parseOnOff`: missing/'' → true; '0','false','off','none' → false, `Conv:185-191`) | `w:b` |
| `italic` | italic | `w:i` | `w:i` |
| `underline` | CSS underline; `double`→double, `dotted`→dotted, `dash`→dashed, `words`→ single line with skip-ink (approximation), `single`→solid (`pages:1206-1216`) | `w:u`: ''/none→none; single; words; double/doubleAccounting→double; anything starting with `dot`→dotted; **everything else → single** (`Conv:242-261`) | `w:u` through same normaliser → **`dash` exported as `single`** |
| `strike` | line-through | `w:strike`; `w:dstrike` on → `strike:true` + warning "Tachado doble degradado a tachado simple" | `w:strike` |
| `sub`/`sup` | size ×0.65; baseline shifted: sup up by 0.33×(un-reduced size px), sub down by 0.16× (`pages:55-56, 1174-1178`) | `w:vertAlign` superscript/subscript (sets both keys explicitly) | `w:vertAlign` |
| `color` | `'auto'` → `#201F1E` (`pages:49`); hyperlink without explicit colour → `#0563C1`; revisions override with author colour | `w:color@val` normalised to `#RRGGBB`/`auto`; if null/auto and `w:themeColor` present → theme colour hex (aliases text1→dk1, text2→dk2, background1→lt1, background2→lt2, hyperlink→hlink, followedHyperlink→folHlink) (`Reader:1020-1032, 2831-2842`). Theme references are thus **resolved at import time**; the model never stores `accentN` names | `w:color` RRGGBB without `#` (`Conv:216-223`) |
| `highlight` | background colour of the run box | `w:highlight` name → hex (table §4.4); `'none'` → null; char `w:shd@fill` → highlight if none set | name of **nearest** of the 16 OOXML highlight colours by Euclidean RGB distance; null → `none` (`Conv:154-180`, `Writer:601-604`) |
| `allCaps` | text uppercased before measuring and painting (`measure:87-91`) | `w:caps` | `w:caps` |
| `smallCaps` | CSS small-caps (canvas font string includes `small-caps`) | `w:smallCaps` | `w:smallCaps` |

### 4.2 Colour normalisation in character commands — `charfmt:79-93`

```
normalizeColor(v):
  null/non-string/'' (after trim) -> null
  'auto' (case-insens.) -> 'auto';  'none' -> null
  6 hex digits with or without '#' -> '#' + UPPER
  3 hex digits -> expanded '#RRGGBB' upper
  anything else (named colours, rgb()) -> returned unchanged   // C++: reject or map; not hex-safe
```
Font dialog uses a stricter version: anything that is not 6-hex → `'auto'` (`fontdlg:78-83`).

### 4.3 Colour palettes (UI)

Font colour split button (`ribbon:734-772`): special row «Automático» (swatch `#000000`) → fires
`font-color {color:'auto'}`; title «Colores del tema»; 10×6 grid; title «Colores estándar»; 10
swatches. Main button re-applies the last picked colour (initial `#C00000`, `ribbon:369`).

Theme colour row (fixed Office palette, NOT the document theme) — `ribbon:68-73`:

| # | Hex | Spanish name |
|---|---|---|
| 1 | `#FFFFFF` | «Blanco, Fondo 1» |
| 2 | `#000000` | «Negro, Texto 1» |
| 3 | `#E7E6E6` | «Blanco, Fondo 2» |
| 4 | `#44546A` | «Azul oscuro, Texto 2» |
| 5 | `#4472C4` | «Azul, Énfasis 1» |
| 6 | `#ED7D31` | «Naranja, Énfasis 2» |
| 7 | `#A5A5A5` | «Gris, Énfasis 3» |
| 8 | `#FFC000` | «Oro, Énfasis 4» |
| 9 | `#5B9BD5` | «Azul claro, Énfasis 5» |
| 10 | `#70AD47` | «Verde, Énfasis 6» |

Rows 2–6 = five variants per column (`ribbon:274-298`):
```
mix(a,b,t) = per channel round(a + (b-a)*t), result '#RRGGBB' uppercase
luma(hex) = (0.299R + 0.587G + 0.114B)/255
variants(base):
  if luma > 0.85: [0.05,0.15,0.25,0.35,0.5] each -> mix(base,'#000000',t)     // light colours darken
  if luma < 0.15: [0.5,0.35,0.25,0.15,0.05] each -> mix(base,'#FFFFFF',t)     // dark colours lighten
  else: [mix(base,W,0.8), mix(base,W,0.6), mix(base,W,0.4), mix(base,K,0.25), mix(base,K,0.5)]
Grid is row-major: row1 = the 10 bases; then for vi in 0..4: for each column ci: variants[ci][vi]
Tooltip: "<name> <hex>"
```

Standard colours (`ribbon:76-81`): `#C00000` «Rojo oscuro», `#FF0000` «Rojo», `#FFC000` «Naranja»,
`#FFFF00` «Amarillo», `#92D050` «Verde claro», `#00B050` «Verde», `#00B0F0` «Azul claro»,
`#0070C0` «Azul», `#002060` «Azul oscuro», `#7030A0` «Púrpura».

### 4.4 Highlight palette

Ribbon (15 Word colours, grid then a «Sin color» row → `null`) — `ribbon:84-90, 776-795`. Main
button applies last picked (initial `#FFFF00`). Picking a colour updates "last"; «Sin color» does not.

| Hex | Spanish name | OOXML name |
|---|---|---|
| `#FFFF00` | «Amarillo» | yellow |
| `#00FF00` | «Verde brillante» | green |
| `#00FFFF` | «Turquesa» | cyan |
| `#FF00FF` | «Rosa» | magenta |
| `#0000FF` | «Azul» | blue |
| `#FF0000` | «Rojo» | red |
| `#000080` | «Azul oscuro» | darkBlue |
| `#008080` | «Verde azulado» | darkCyan |
| `#008000` | «Verde» | darkGreen |
| `#800080` | «Violeta» | darkMagenta |
| `#800000` | «Rojo oscuro» | darkRed |
| `#808000` | «Amarillo oscuro» | darkYellow |
| `#808080` | «Gris 50 %» | darkGray |
| `#C0C0C0` | «Gris 25 %» | lightGray |
| `#000000` | «Negro» | black |
| (`#FFFFFF`) | — not in ribbon | white (accepted on import) |

OOXML table: `Conv:22-39`. Export ties/nearest search starts with `yellow` and iterates the table in
the order black, blue, cyan, darkBlue, darkCyan, darkGray, darkGreen, darkMagenta, darkRed,
darkYellow, green, lightGray, magenta, red, white, yellow, keeping strictly smaller distances.

---

## 5. Character commands (UI intent layer)

### 5.1 `charDeltaForCommand(id, params, currentFmt)` — `charfmt:146-209`

`currentFmt` = **effective** char (resolved), so turning bold off in a bold-styled paragraph writes
`bold:false` explicitly (Word behaviour). Returned deltas always contain concrete values.

| Command id | Params | Delta |
|---|---|---|
| `bold` | — | `{bold: !cur.bold}` |
| `italic` | — | `{italic: !cur.italic}` |
| `strike` | — | `{strike: !cur.strike}` |
| `sub` | — | `cur.sub ? {sub:false} : {sub:true, sup:false}` |
| `sup` | — | `cur.sup ? {sup:false} : {sup:true, sub:false}` |
| `underline` | none | `{underline: (cur.underline && cur.underline!='none') ? 'none' : 'single'}` |
| `underline` | `{style}` | if style ∉ UNDERLINE_STYLES → null (no-op); else `{underline: cur.underline==style ? 'none' : style}` |
| `font-name` | `{name}` | trimmed; empty → null; else `{font:name}` |
| `font-size` | `{pt}` or `{size}` | `normalizeSize`: parseFloat, non-finite → null; round to 0.5; clamp [1,1638] → `{size}` |
| `font-color` | `{color}` | `{color: normalizeColor(color) ?? 'auto'}` |
| `highlight` | `{color}` | `c = normalizeColor(color)`; `{highlight: c=='auto' ? null : c}` (null → removes override, §3.1) |
| `font-grow` | — | `{size: growFontSize(currentSize(cur))}` |
| `font-shrink` | — | `{size: shrinkFontSize(currentSize(cur))}` |
| `clear-format` | — | full `CLEAR_CHAR_DELTA` (§5.4) |
| other | | `null` (not a char command) |

`currentSize(cur) = normalizeSize(cur.size) ?? 11`.

**Toggle semantics on mixed selections**: the toggle direction is decided **only** by the effective
format at the single position from `editor.currentFormat()` (§2.4), then the resulting concrete
value is written over the whole range. E.g. selection "**ab**cd" starting at offset 0 → char 0 is
bold → Ctrl+B makes everything non-bold. There is no "all selected bold?" scan.
*Recommendation (Word parity)*: Word sets bold ON unless every character of the selection is
already bold. If you implement that, keep it isolated in this intent layer.

### 5.2 Grow / shrink algorithm — `charfmt:30-32, 113-133`

```
FONT_SIZE_SCALE = [8,9,10,11,12,14,16,18,20,22,24,26,28,36,48,72]
grow(size):  s = normalizeSize(size) ?? 11
   if s < 8:       return min(8, floor(s)+1)
   if s >= 72:     return min(1638, floor(s/10)*10 + 10)
   return first v in scale with v > s
shrink(size): s = normalizeSize(size) ?? 11
   if s <= 8:      return max(1, ceil(s)-1)
   if s > 72:      v = ceil(s/10)*10 - 10; return v <= 72 ? 72 : v
   return last v in scale with v < s
```
Test vectors: grow 11→12, 12→14, 28→36, 72→80, 80→90, 1635→1638, 7.5→8, 10.5→11; shrink 11→10,
14→12, 8→7, 7.5→7, 1→1, 75→72, 80→72, 90→80, 10.5→10.

Ctrl+[ / Ctrl+] (±1 pt) from plan §6 F4 are **[NOT IMPL]**.

### 5.3 Range for character commands — `charfmt:230-241`, `main:713-729`

```
range = expandRangeToWord(doc, selection.range)
   if not collapsed -> unchanged
   else word = wordRangeAt(doc, caret) (editor/caret.js; caret inside or touching a word)
        -> word range, or the collapsed range if caret is on space/punctuation/empty paragraph
if range still collapsed -> nothing is applied (no "pending format" for next typed text)
```
**Pitfall**: Word stores a pending format at an insertion point (Ctrl+B then typing types bold).
Skriba v0.1 does not; typed text inherits the char of the previous run (`rt` insertTextAt) only.
*Recommendation*: implement pending format in the port as an enhancement, but keep file format
unchanged.

### 5.4 Clear formatting — `charfmt:61-74`, `main:719-724`

`CLEAR_CHAR_DELTA = {font:'Aptos', size:11, bold:false, italic:false, underline:'none',
strike:false, sub:false, sup:false, color:'auto', highlight:null, allCaps:false, smallCaps:false}`.

Ribbon «Borrar todo el formato» (`clear-format`): one undo batch `'Borrar formato'` =
`applyCharFormat(range, CLEAR_CHAR_DELTA)` **then** `setStyle(range, 'Normal')`. Effects:
- the 11 non-null keys become **explicit overrides** equal to the hard defaults (not deleted);
  `highlight:null` deletes the highlight override;
- extended keys (`spacing`, `link`, …) untouched;
- paragraph style → Normal, but `block.para` overrides (alignment, indents, numbering…) are **kept**.
- if the document's Normal differs from hard defaults (e.g. an imported Normal with Calibri 10),
  the cleared text shows Aptos 11, not Normal's font. *Recommendation*: use `null` for every key
  (delete overrides) — same visual result with built-in Normal, correct with imported Normal.
Shortcuts Ctrl+Espacio / Ctrl+Barra (plan §8) are **[NOT IMPL]**.

### 5.5 Change case («Cambiar mayúsculas y minúsculas») — **[NOT IMPL]**

No command, button or shortcut exists. *Recommendation (Word)*: modes «Tipo oración.»,
«minúsculas», «MAYÚSCULAS», «Poner en mayúsculas cada palabra», «tIPO iNVERSO»; Shift+F3 cycles
lower → UPPER → Title. It must edit the text (not `allCaps`) and preserve run formatting.
`allCaps`/`smallCaps` have no UI either (Ctrl+Mayús+K planned, not wired).

### 5.6 Keyboard shortcuts actually wired — `input:360-406`

| Keys (Ctrl/Cmd +) | Command |
|---|---|
| B or N | `bold` |
| I or K | `italic` |
| U or S | `underline` |
| E | `align:center` (Ctrl+Shift+E = track changes) |
| L / R / J | `align:left` / `align:right` / `align:justify` |
| M / Shift+M | `indent:inc` / `indent:dec` |
| `>` or `.` | `font-grow` (note: Ctrl+`.` without Shift also grows) |
| `<` or `,` | `font-shrink` |
| Tab / Shift+Tab | list level (§11.7) or tab insertion |

Ribbon tooltips mention Ctrl+= / Ctrl+Mayús+= for sub/sup (`ribbon:1096-1097`) but they are **not
wired**. Not wired either: Ctrl+1/2/5, Ctrl+T, Ctrl+Mayús+L, Ctrl+Mayús+W/D/K, Ctrl+D, Ctrl+Mayús+S.

---

## 6. Paragraph properties and commands

### 6.1 `paraDeltaForCommand(id, params)` — `parafmt:69-105`

| Id | Params | Delta |
|---|---|---|
| `align:left│center│right│justify` | — | `{align}`; other suffix → null |
| `align` | `{align}` | same (alternate form) |
| `line-spacing` | `{line}` (1/240) or `{mult}` | `line = twips(p.line, min 1)`; if null and `mult` finite → `round(mult*240)`; → `{line}` (lineRule is NOT reset — see pitfall) |
| `space-before` | `{tw}` or `{before}` | `{before: max(0, round(v))}` |
| `space-after` | `{tw}` or `{after}` | `{after: max(0, round(v))}` |
| `indent:inc` | `{step?}` | `{__indentDelta: +step}` default 720 |
| `indent:dec` | `{step?}` | `{__indentDelta: -step}` default 720 |
`twips(v,min)`: parseFloat, non-finite → null, `round`, then `max(min, ·)` (`parafmt:53-58`).
`resolveParaDelta(delta, currentPara)`: identity copy for absolute deltas; relative →
`{...rest, left: max(0, (currentPara.left finite ? it : 0) + rel)}` (`parafmt:126-132`).
Constants: `INDENT_STEP=720`, `LINE_SPACINGS={'1.0':240,'1.15':276,'1.5':360,'2.0':480}`.

**Pitfall**: applying a `line-spacing` multiple to a paragraph imported with `lineRule:'exact'` keeps
`lineRule:'exact'`, so 240 would be read as 240 twips (12 pt exact). *Recommendation*: when the
UI sets a multiple, also send `lineRule:null`.

### 6.2 Ribbon paragraph controls (Home → «Párrafo») — `ribbon:111-114, 1105-1166`

- Alignment buttons: «Alinear a la izquierda (Ctrl+L)», «Centrar (Ctrl+E)», «Alinear a la derecha
  (Ctrl+R)», «Justificar (Ctrl+J)».
- «Disminuir sangría (Ctrl+Mayús+M)» / «Aumentar sangría (Ctrl+M)».
- Line-spacing menu «Espaciado entre líneas y párrafos»: `1,0`→240, `1,15`→276, `1,5`→360,
  `2,0`→480; separator; «Agregar espacio antes del párrafo» → `space-before {tw:240}`;
  «Quitar espacio antes del párrafo» → `{tw:0}`; «Agregar espacio después del párrafo» →
  `space-after {tw:240}`; «Quitar espacio después del párrafo» → `{tw:0}`; separator;
  «Opciones de interlineado…» → Paragraph dialog. (`PARA_SPACE = 240` = 12 pt.)
- Layout tab («Disposición» → «Párrafo», `ribbon:2006-2031`, `main:1788-1795`):
  «Izquierda:» / «Derecha:» numeric boxes in cm (step 0.25, min 0, max 55) →
  `left/right = max(0, round(cmToTwips(v)))`; «Antes:» / «Después:» in pt (step 6, min 0, max 1584)
  → `space-before/after {tw: round(v*20)}`. Numbox: Enter commits (value clamped to [min,max], then
  reformatted as `fmtNum(n)+unit`), Esc blurs, ArrowUp/Down step.

### 6.3 Paragraph layout semantics (what the renderer must honour)

- Line height: `natural = max(lineHeight of every segment font, ascent+descent)`; `auto`:
  `height = natural × line/240`; `exact`: `height = twipsToPx(line)`; `atLeast`:
  `max(natural, twipsToPx(line))`; baseline = `ascent + (height − natural)/2` (`breaker:610-642`).
- Spacing between paragraphs **adds**: `y += prevAfter + before` (no collapsing); suppressed at the
  top of a page (`paginator:355-375`).
- `contextualSpacing`: if previous and current paragraph have the same `style` id, current's
  `before` is zeroed when current has the flag, previous `after` is zeroed when previous has it.
- `pageBreakBefore`: opens a new page if the current page already has items.
- Indents: first line starts at `left + first`; other lines at `left`; text width ends at
  `contentWidth − right`. Lists: see §11.8.
- Tabs: stops = `para.tabs[].pos` (or bare numbers) converted to px, >0, sorted; next stop
  strictly greater than current x; after the last custom stop, default stops every **720 twips**
  measured from the margin (`breaker:24, 48, 286-298`). **All stops behave as left tabs**; `center`,
  `right`, `decimal`, `bar`, leaders: **[NOT IMPL]** (plan F5 task 4).
- Borders: active if `style` ∉ {`none`,`nil`}; width px = `max(0.75, sz/8 × 96/72)` (default 0.75);
  space px = `space × 96/72`; top border adds `w+space` above first line, bottom below last line;
  horizontal box from `left − (leftW+leftSpace)` to `contentWidth − right + (rightW+rightSpace)`;
  `shading` fills the box (`breaker:302-351`). Import default `sz` = 4, `space` = 0,
  `color` = `'auto'`, missing style → `'single'` (`Reader:699-716`).
- `keepNext`, `keepLines`, `widowControl`: **[NOT IMPL]** in pagination.
- Justify distributes the gap among spaces (U+0020 and U+00A0) of every line except the last.

---

## 7. Paragraph dialog («Párrafo») — `paradlg`

Title «Párrafo», width 520, buttons «Aceptar» (primary) / «Cancelar». Only the «Sangría y
espaciado» content exists; the «Líneas y saltos» tab, outline level and tabs dialog are
**[NOT IMPL]** (`paradlg:18-20`).

Initial values = effective para of `currentFormat()`, defaults if missing:
`{align:'left', line:276, before:0, after:160, left:0, right:0, first:0}` (`paradlg:50, 128-144`).

| Group (legend) | Field label | Control / mapping |
|---|---|---|
| «General» | «Alineación:» | select: `left` «Izquierda», `center` «Centrada», `right` «Derecha», `justify` «Justificada» |
| «Sangría» | «Izquierda:» | text, unit «cm», 2 decimals; `left = cmToTwips(v)` |
| | «Derecha:» | same → `right` |
| | «Especial:» | select `ninguno` «(ninguno)», `primera` «Primera línea», `francesa` «Francesa». Initial: first>0 → primera, first<0 → francesa, else ninguno |
| | «En:» | text cm, initial `|twipsToCm(first)|` or **1,25** if 0; disabled when «(ninguno)». `first = primera ? cmToTwips(|cm|) : francesa ? −cmToTwips(|cm|) : 0` |
| «Espaciado» | «Antes:» | text, unit «pt», 1 decimal; `before = ptToTwips(v)` |
| | «Después:» | → `after` |
| | «Interlineado:» | select `240` «Sencillo», `276` «1,15», `360` «1,5», `480` «Doble»; if current `line` is none of them, an extra option `Múltiple (<line/240 with 2 decimals>)` with the current value is appended |
| «Vista previa» | — | two grey fake lines, sample paragraph «Texto de ejemplo …» (10 times), two fake lines; decorative scale 16 px/cm, indents clamped (0..90 px, first ±60 px), margins `min(24, pt×0.35)` px, line-height `line/240` |

Apply rule (`paradlg:293-312`): delta contains **only keys whose control was touched AND whose value
differs from the initial value** (prevents cm↔twips rounding noise). Non-empty delta →
`applyParaFormat(selectionRangeCapturedAtOpen, delta)` as one undo step. Note: the dialog does not
expose `lineRule` (exact/at least) and does not reset it.

---

## 8. Styles

### 8.1 Built-in catalogue (new documents) — `docjs:453-562`

| id | name (es-ES) | type | basedOn | next | char | para |
|---|---|---|---|---|---|---|
| `Normal` | «Normal» | paragraph | null | Normal | font Aptos, size 11, bold false, italic false, underline none, strike false, sub false, sup false, color auto, highlight null, allCaps false, smallCaps false | align left, line 276, before 0, after 160, left 0, right 0, first 0, tabs [], keepNext false, widowControl true, numbering null |
| `SinEspacio` | «Sin espacio» | paragraph | Normal | SinEspacio | — | line 240, before 0, after 0 |
| `Titulo` | «Título» | paragraph | Normal | Normal | font Aptos Display, size 28 | line 240, before 0, after 80 |
| `Subtitulo` | «Subtítulo» | paragraph | Normal | Normal | size 14, color `595959` | after 160 |
| `Heading1` | «Título 1» | paragraph | Normal | Normal | font Aptos Light, size 16, color `2F5496` | before 240, after 80, keepNext true |
| `Heading2` | «Título 2» | paragraph | Normal | Normal | font Aptos Light, size 14, color `2F5496` | before 160, after 80, keepNext true |
| `Heading3` | «Título 3» | paragraph | Normal | Normal | font Aptos Light, size 12, color `1F3763` | before 160, after 80, keepNext true |
| `Cita` | «Cita» | paragraph | Normal | Normal | italic true, color `404040` | align center, before 160, after 160 |
| `Enfasis` | «Énfasis» | **character** | null | null | italic true | {} |

Colours in styles are stored **without `#`**. Headings are **not bold**. `styles.js` contains an
identical local fallback catalogue (`styles:282-312`) except its Normal only lists
`font/size/color` and `align/line/before/after` — the resolved result is the same.

Plan §7.4 lists 18 v1 styles («Cita intensa», «Énfasis intenso», «Referencia», «Lista de párrafo»,
«TOC 1–3», «Encabezado», «Pie de página», «Título 4–9», …) — **[NOT IMPL]**. plan §5.1 shows Normal
with `align:'justify'`; the code uses `'left'` — **code wins**.

### 8.2 Style gallery — `styles:230-256`, `ribbon:880-960`

Order: for each id in
`['Normal','SinEspacio','NoSpacing','Heading1','Heading2','Heading3','Titulo','Title','Subtitulo','Subtitle','Enfasis','Emphasis','Cita','Quote']`
append the document style with that id if present (first occurrence of an id wins); then append
all remaining document styles in document order (character styles included). Heading3 is always
shown (Word only shows it when used — documented deviation). English aliases cover imported .docx
styles.

Thumbnail: 58×46 px button, sample text «AaBbCc» painted with the **resolved** char of the style:
family (fallback stack `Calibri, 'Segoe UI', sans-serif`), px = `clamp(round(size×0.72), 9, 13)`,
colour, bold, italic, underline (any non-none); caption = `name || id` (9 px, ellipsis); tooltip
= name. Active style (from `currentFormat().styleId`) gets border `#185ABD`, background `#EDEBE9`.
Scroll buttons «Estilos anteriores» / «Estilos siguientes» scroll by 124 px. Live preview on hover
(plan F7) is **[NOT IMPL]**.

### 8.3 Applying a style — `setStyle(range, styleId)` (`reg:1045-1056`, `main:741-744`)

Sets `block.style = styleId` on every block of the range (whole paragraphs; a range ending at
offset 0 of a later block still includes it here — unlike applyParaFormat). No type check, no
removal of `para` overrides or run overrides. Undo name «Aplicar estilo».

**Pitfall (character style)**: clicking «Énfasis» (type character) sets it as the **paragraph**
style; because `Enfasis.basedOn = null`, the paragraph then resolves to hard defaults + italic.
*Recommendation*: for `type:'character'` apply `style.char` (resolved) as a char delta to the
selected range (expanded to word) instead of changing `block.style`; store nothing new in JSON
(character styles do not exist on runs in this format).

### 8.4 Modify style — `setStyleProps(styleId, {char?, para?})` (`reg:2030-2045`)

Snapshot command «Modificar estilo» (undo restores whole `styles` array). Clones `doc.styles`,
finds style by id (missing → no change), shallow-merges `delta.char` into `style.char` and
`delta.para` into `style.para` (plain assignment: `null` values are **stored**, not deleted),
assigns the new array (invalidates cache), structural change → full re-layout. Every paragraph
without a direct override of the changed keys updates (inheritance).

Only caller: Design «Espaciado entre párrafos» (§9.4). «Nuevo estilo», «Modificar estilo» dialog,
«Actualizar para que coincida con la selección», styles pane (Ctrl+Alt+Mayús+S): **[NOT IMPL]**.

### 8.5 Enter / new paragraph

`splitBlockAt` (`rt:576-610`): new block copies `style`, deep-copies `para` and inherits the
char at the split point (an empty carrier run with that char). `style.next` is **ignored**: Enter at
the end of a «Título 1» paragraph produces another «Título 1» (Word would give Normal).
*Recommendation* (only if Word parity is wanted; it changes behaviour): when splitting at the very
end of a paragraph whose style has a `next` different from its own id, give the new paragraph
`style = next` and do not copy `para` overrides except `numbering`.

### 8.6 Style-related ids from .docx import — `Reader:68-75, 2568-2756`

Built-in Word styles are recognised by **name** and mapped to ids: «normal»→`Normal`,
«no spacing»→`NoSpacing`, «title»→`Title`, «subtitle»→`Subtitle`, «quote»→`Quote`,
«emphasis»→`Emphasis`, «strong»→`Strong`, «list paragraph»→`ListParagraph`,
«heading 1..9»→`Heading1..Heading9` (only if the canonical id is not already used). So imported
documents use English ids (`Title`, not `Titulo`). Table and numbering styles are not imported as
styles; latent/skip styles dropped.

### 8.7 Imported Normal and docDefaults — `Reader:2683-2703`

`Normal.char = Normal.char + docDefaults.rPr + {size:10, font: theme minorFont if docDefaults has no
font}`; `Normal.para = Normal.para + docDefaults.pPr + {line:240, before:0, after:0}`
(left operand wins). `Normal.basedOn` forced to null. If there is no Normal, one is synthesised
from docDefaults + those bases. **Pitfall**: imported styles whose chain does not reach Normal do
not see docDefaults (they get Skriba hard defaults: Aptos 11, line 276, after 160).

---

## 9. Themes and the Design tab

### 9.1 API — `theme:24-45`

`defaultTheme()` → new object (§1.5). `themeColor(theme, key)` → `'#RRGGBB'`:
key must be non-empty string; value = `theme.colors[key]`, falling back to the default accent;
non-string/empty → null; prefix `#` if missing. **Nothing in the renderer currently calls
`themeColor`**: style colours are literal hex, so changing theme colours has **no visible effect**
on text.

### 9.2 Theme catalogue («Temas») — `ribbon:130-137`, `main:1645-1652`

| id | name | majorFont | minorFont | accent1 | accent2 | accent3 | accent4 | accent5 | accent6 |
|---|---|---|---|---|---|---|---|---|---|
| `office` | Office | Aptos Display | Aptos | #4472C4 | #ED7D31 | #A5A5A5 | #FFC000 | #5B9BD5 | #70AD47 |
| `clasico` | Clásico | Cambria | Calibri | #1F497D | #C0504D | #9BBB59 | #8064A2 | #4BACC6 | #F79646 |
| `editorial` | Editorial | Georgia | Georgia | #7A5C3E | #B07D48 | #8E9B6C | #4E6E81 | #A34E4E | #6B5B95 |
| `moderno` | Moderno | Segoe UI | Segoe UI | #0F6CBD | #00838F | #7B61FF | #D83B01 | #107C10 | #5C2E91 |
| `tecnico` | Técnico | Arial | Arial | #003A70 | #0078D4 | #505050 | #8C8C8C | #C43E1C | #498205 |
| `academico` | Académico | Times New Roman | Times New Roman | #2F5496 | #833C0C | #375623 | #7B2E2E | #525252 | #3B3838 |

(Plan F7 named "Office, Gris, Violeta, Azul"; the code catalogue above is normative.) Catalogue
colours carry `#` — the default theme does not.

Commands (`main:910-913, 1670-1701`):
- «Temas» menu item → `setTheme({name:id, majorFont, minorFont, colors})`.
- «Colores» menu (same 6 names) → `setTheme({colors})`.
- «Fuentes» panel (FONT_SETS, §10.6) → `setTheme({majorFont, minorFont})`.
- «Espaciado entre párrafos» → `setStyleProps('Normal', {para:{before, after, line}})`.

### 9.3 `setTheme(partial)` algorithm — `reg:1995-2022`

```
if partial is empty -> no-op
snapshot (theme, styles) for undo; command name 'Tema'; structural
next = {...doc.theme, ...partial}            // shallow: `colors` is REPLACED wholesale
doc.theme = next
major = partial.majorFont || next.majorFont
minor = partial.minorFont || next.minorFont
if major or minor:
   doc.styles = clone(styles).map(st ->
       if st has no char or st.char.font === undefined: unchanged
       isHeading = /^Heading\d?$/.test(st.id) or st.id in {'Titulo','Subtitulo'}
       st.char.font = isHeading ? major : minor)
```
Pitfalls (reproduce or fix consciously):
1. A colours-only change still rewrites style fonts with the **current** theme fonts. With the
   default theme (major = minor = 'Aptos') choosing «Colores» turns «Título 1» from Aptos Light to
   Aptos.
2. Imported ids `Title`/`Subtitle` are not treated as headings (get the minor font); `Subtitulo`
   built-in has no `font` so it is never changed.
3. Theme colours do not recolour headings (no theme-colour references in styles).
4. Only styles with an explicit `char.font` change; direct run fonts never change.

### 9.4 «Espaciado entre párrafos» sets — `ribbon:145-153`, `main:1659-1667`

| id | Spanish name | before | after | line |
|---|---|---|---|---|
| `default` | «Predeterminado» | 0 | 160 | 276 |
| `none` | «Sin espacio de párrafo» | 0 | 0 | 240 |
| `compact` | «Compacto» | 0 | 80 | 240 |
| `tight` | «Ajustado» | 0 | 120 | 276 |
| `open` | «Abierto» | 0 | 200 | 360 |
| `relaxed` | «Suelto» | 0 | 120 | 360 |
| `double` | «Doble» | 0 | 160 | 480 |

The Design-tab style-set gallery shows the first 5 sets as 56×46 thumbnails (three grey lines with
`margin-bottom = round(line/240×2)` px, name 8 px), tooltip `«<name> — interlineado <line/240>»`;
click → same as menu. «Colección de estilos rápidos» (true style sets): **[NOT IMPL]**.

### 9.5 Design dialogs — `design`

**Watermark** («Marca de agua», width 440) (`design:128-207`): fields «Texto:» (default
«CONFIDENCIAL», placeholder «Texto de la marca de agua»), «Fuente:» (whole font catalogue; an
off-catalogue current font is inserted first), «Tamaño (px):» (number step 4, 0..400, 0 = auto-fit,
hint «Con el tamaño en 0 la marca se ajusta sola al ancho de la página.»), «Color:» (default
`#C8C6C4`), «Opacidad (%):» (step 5, 5..100, default 40), checkbox «En diagonal» (default true,
preview rotate −35°). Buttons: «Aceptar» → if trimmed text empty `setDocProps({watermark:null})`
else `{watermark:{text, font, size, color, diagonal, opacity: pct/100}}`; «Quitar» → null;
«Cancelar». Ribbon presets: URGENTE, CONFIDENCIAL, BORRADOR, MUESTRA, NO COPIAR, EJEMPLO
(`ribbon:156-163`).

**Page borders** («Bordes de página», width 420) (`design:209-285`): «Estilo:» `none` «Ninguno»,
`solid` «Continuo», `double` «Doble», `dashed` «Discontinuo», `dotted` «Punteado», `groove` «Con
relieve»; «Color:» (default `#000000`); «Ancho (px):» (step 0.5, 0.5..12, default 1); «Margen (px):»
(step 2, 0..96, default 24); hint «El borde se dibuja dentro de la página y no altera el área de
texto.». Aceptar: style none → `pageBorder:null`, else `{style, color, width, space}`.

---

## 10. Font catalogue — `fonts`

### 10.1 Entries

Entry = `{name, cat, src:'system'|'google', twin?, axes?}`. Built from SYSTEM then WEB; a name
already registered (case-insensitive) is skipped; finally sorted with Spanish collation, base
sensitivity (`localeCompare(b,'es',{sensitivity:'base'})`) — `fonts:250-271`. Lookup is
case-insensitive on trimmed name.

Categories (`fonts:45-52`): `sans` «Sans serif», `serif` «Serif», `mono` «Monoespaciada»,
`display` «Decorativa», `script` «Manuscrita», `symbol` «Símbolos». Unknown name → `sans`.

SYSTEM (`fonts:60-93`):
- sans: Aptos, Aptos Display, Aptos Light, Aptos Narrow, Arial, Arial Narrow, Avenir, Avenir Next,
  Bahnschrift, Calibri, Calibri Light, Candara, Century Gothic, Corbel, Franklin Gothic Book,
  Franklin Gothic Medium, Futura, Gill Sans MT, Helvetica, Helvetica Neue, Lucida Sans Unicode,
  Microsoft Sans Serif, Optima, Segoe UI, Segoe UI Light, Segoe UI Semibold, Tahoma, Trebuchet MS,
  Tw Cen MT, Verdana
- serif: Aptos Serif, Baskerville, Baskerville Old Face, Bell MT, Bodoni MT, Book Antiqua, Bookman
  Old Style, Californian FB, Cambria, Centaur, Century, Century Schoolbook, Constantia, Didot,
  Garamond, Georgia, Goudy Old Style, High Tower Text, Hoefler Text, Palatino Linotype, Perpetua,
  Rockwell, Sitka Text, Times New Roman
- mono: Aptos Mono, Cascadia Code, Cascadia Mono, Consolas, Courier New, Lucida Console, Lucida Sans
  Typewriter, Menlo, Monaco, OCR A Extended
- display: Algerian, Arial Black, Bauhaus 93, Berlin Sans FB, Broadway, Castellar, Comic Sans MS,
  Cooper Black, Copperplate Gothic Bold, Elephant, Engravers MT, Impact, Jokerman, Old English Text
  MT, Papyrus, Showcard Gothic, Stencil, Wide Latin
- script: Bradley Hand ITC, Brush Script MT, Edwardian Script ITC, Freestyle Script, French Script
  MT, Gabriola, Ink Free, Kunstler Script, Lucida Calligraphy, Lucida Handwriting, Mistral, Monotype
  Corsiva, Palace Script MT, Pristina, Segoe Print, Segoe Script, Viner Hand ITC, Vivaldi, Vladimir
  Script
- symbol: Segoe UI Symbol, Symbol, Webdings, Wingdings, Wingdings 2, Wingdings 3

WEB / Google Fonts (`fonts:104-192`) — format `Name` (axes `bi`) or `Name[code]`. Axes codes:
`bi` = 400, 700, italic 400, italic 700; `b` = 400, 700; `i` = 400, italic 400; `r` = 400 only.
- sans: Open Sans, Roboto, Lato, Montserrat, Source Sans 3, Noto Sans, Inter, Poppins, Raleway,
  Nunito, Nunito Sans, Work Sans, Ubuntu, PT Sans, PT Sans Narrow[b], Fira Sans, Rubik, Mulish,
  Barlow, Cabin, Josefin Sans, Oswald[b], Quicksand[b], Manrope[b], DM Sans, Karla, Archivo,
  Titillium Web, Exo 2, Hind[b], Questrial[r], Libre Franklin, IBM Plex Sans, Lexend[b], Outfit[b],
  Public Sans, Space Grotesk[b], Plus Jakarta Sans, Signika[b], Dosis[b], Overpass, Assistant[b],
  Heebo[b], Oxygen[b], Varela Round[r], Asap, Jost, Kanit, Maven Pro[b], Sora[b], Urbanist, Figtree,
  Atkinson Hyperlegible, Didact Gothic[r], Roboto Condensed, Encode Sans[b], Red Hat Display,
  Red Hat Text, Catamaran[b], Prompt, Arimo, Carlito
- serif: Merriweather, Playfair Display, Lora, PT Serif, Noto Serif, Source Serif 4, EB Garamond,
  Libre Baskerville, Crimson Text, Crimson Pro, Cormorant Garamond, Cormorant, Cardo, Spectral,
  Literata, Alegreya, Vollkorn, Bitter, Arvo, Roboto Slab[b], Zilla Slab, Domine[b], IBM Plex Serif,
  Libre Caslon Text, Old Standard TT, Neuton, Frank Ruhl Libre[b], Bodoni Moda, Prata[r], Newsreader,
  Fraunces, Gentium Book Plus, Noticia Text, Martel[b], Sorts Mill Goudy[i], Lustria[r], Eczar[b],
  Faustina, Marcellus[r], DM Serif Text[i], Unna, Gilda Display[r], Slabo 27px[r], Aleo, Enriqueta[b],
  Kreon[b], Josefin Slab, Sanchez[i], Tinos, Gelasio, Caladea, Linden Hill[i], Rosarivo[i],
  Brygada 1918, Petrona, Inknut Antiqua[b]
- mono: Roboto Mono, Source Code Pro, Fira Code[b], JetBrains Mono, IBM Plex Mono, Inconsolata[b],
  Space Mono, Ubuntu Mono, Courier Prime, DM Mono[i], Anonymous Pro, Overpass Mono[b], PT Mono[r],
  Noto Sans Mono[b], Red Hat Mono, Cutive Mono[r], Share Tech Mono[r], Victor Mono, Fira Mono[b],
  Azeret Mono, Spline Sans Mono, Martian Mono[b], Chivo Mono, B612 Mono[bi], Oxygen Mono[r], Cousine
- display: Anton[r], Bebas Neue[r], Lobster[r], Righteous[r], Alfa Slab One[r], Bangers[r],
  Fredoka[b], Abril Fatface[r], Archivo Black[r], Black Ops One[r], Bungee[r], Chewy[r], Cinzel[b],
  Comfortaa[b], Concert One[r], Fjalla One[r], Fugaz One[r], Lilita One[r], Luckiest Guy[r],
  Monoton[r], Passion One[b], Press Start 2P[r], Russo One[r], Secular One[r], Shrikhand[r],
  Staatliches[r], Teko[b], Titan One[r], Ultra[r], Yeseva One[r], Unica One[r], Poiret One[r],
  Special Elite[r], Creepster[r], Audiowide[r], Orbitron[b], Comic Neue, Amatic SC[b], Limelight[r],
  Stardos Stencil[b], UnifrakturMaguntia[r], Lobster Two, DM Serif Display[i], Rye[r], Sigmar One[r],
  Squada One[r], Bowlby One[r], Rammetto One[r], Boogaloo[r], Carter One[r], Days One[r],
  Baloo 2[b], Bree Serif[r], Patua One[r], Changa One[i], Oleo Script[b], Rozha One[r], Megrim[r],
  Syncopate[b], Michroma[r], Bungee Shade[r], Frijole[r], Modak[r], Bungee Inline[r],
  Paytone One[r], Krona One[r], Saira Stencil One[r], Big Shoulders Display[b], Racing Sans One[r],
  Holtwood One SC[r], Vast Shadow[r], Codystar[r]
- script (all `[r]` unless noted): Dancing Script[b], Pacifico, Great Vibes, Caveat[b], Satisfy,
  Sacramento, Kaushan Script, Allura, Alex Brush, Parisienne, Cookie, Courgette, Yellowtail,
  Tangerine[b], Pinyon Script, Marck Script, Indie Flower, Shadows Into Light, Patrick Hand,
  Architects Daughter, Handlee, Kalam[b], Gloria Hallelujah, Homemade Apple, Reenie Beanie,
  Rock Salt, Nothing You Could Do, Covered By Your Grace, Cedarville Cursive, Bad Script,
  Merienda[b], Playball, Mr Dafoe, Niconne, Italianno, Petit Formal Script, Herr Von Muellerhoff,
  Monsieur La Doulaise, Zeyada, Damion, Norican, Kristi, Mrs Saint Delafield, Rouge Script, Meddon,
  Waiting for the Sunrise, La Belle Aurore, Give You Glory, Over the Rainbow, Just Another Hand,
  Schoolbell, Short Stack, Coming Soon, Annie Use Your Telescope, Loved by the King,
  The Girl Next Door, Walter Turncoat, Sue Ellen Francisco, Dawning of a New Day, Calligraffitti,
  Permanent Marker, Rancho, Sofia, Qwigley, Bilbo Swash Caps, Clicker Script, Engagement,
  Euphoria Script, Felipa, Grand Hotel, Leckerli One, Lily Script One, Lovers Quarrel,
  Miss Fajardose, Mr De Haviland, Mrs Sheppards, Nanum Pen Script, Neucha, Oregano[i], Pattaya,
  Princess Sofia, Ruthie, Sail, Seaweed Script, Sriracha, Stalemate, Style Script, Vibur,
  Yesteryear, Sedgwick Ave, Shadows Into Light Two, Gochi Hand, Delius, Crafty Girls, Caveat Brush,
  Bonheur Royale, Birthstone, Ephesis, Explora, Festive, Grape Nuts, Hurricane, Imperial Script,
  Kolker Brush, Licorice, Luxurious Script, Ms Madi, Oooh Baby, Passions Conflict, Puppies Play,
  Send Flowers, Smooch, Splash, Square Peg, Twinkle Star, Updock, Water Brush, Whisper, WindSong

### 10.2 Metric twins (`fonts:199-215`) — used when the system font is missing

Calibri→Carlito, Calibri Light→Carlito, Cambria→Caladea, Arial→Arimo, Arial Narrow→PT Sans Narrow,
Arial Black→Archivo Black, Helvetica→Arimo, Helvetica Neue→Arimo, Microsoft Sans Serif→Arimo,
Times New Roman→Tinos, Courier New→Cousine, Georgia→Gelasio, Garamond→EB Garamond,
Franklin Gothic Book→Libre Franklin, Franklin Gothic Medium→Libre Franklin, Segoe UI→Open Sans,
Segoe UI Light→Open Sans, Segoe UI Semibold→Open Sans, Consolas→Inconsolata, Comic Sans MS→Comic
Neue, Impact→Anton, Century Gothic→Didact Gothic, Trebuchet MS→Fira Sans, Rockwell→Roboto Slab,
Futura→Jost, Avenir→Nunito Sans, Avenir Next→Nunito Sans, Bahnschrift→Barlow,
Baskerville→Libre Baskerville, Baskerville Old Face→Libre Baskerville, Bodoni MT→Bodoni Moda,
Didot→Bodoni Moda, Menlo→Noto Sans Mono, Monaco→Noto Sans Mono, Goudy Old Style→Sorts Mill Goudy,
Old English Text MT→UnifrakturMaguntia, Stencil→Stardos Stencil, Broadway→Limelight.

Category fallbacks (`fonts:218-225`): sans/display/symbol → Calibri, Segoe UI, sans-serif; serif →
Cambria, Georgia, Times New Roman, serif; mono → Consolas, Courier New, monospace; script → Segoe
Script, Brush Script MT, cursive.

### 10.3 Behaviour for the native port

- `fontStack(name, fallback='Aptos')` = [name (or fallback if empty), twin?, category fallbacks],
  deduplicated (`fonts:344-351`). Native equivalent: ordered list of candidate families for font
  matching. Unknown names use the sans fallbacks.
- Web fonts are downloaded on demand from Google Fonts in the web app. A desktop port should
  **bundle or locally resolve** these families (and twins) instead; when a family arrives, the
  measure cache must be cleared and the document re-paginated (event `fonts:loaded`).
- `searchFonts(q)`: fold = NFD, strip combining marks U+0300–U+036F, lowercase, trim; empty →
  all; result = prefix matches then substring matches, each in catalogue order (`fonts:296-316`).
- Recent fonts: max 6, most recent first, case-insensitive dedupe, canonical catalogue spelling if
  known; persisted under key `skriba.fonts.recent` (`fonts:527-580`). Recorded when a font is
  committed from the ribbon combo or the Font dialog.
- Ribbon font combo list sections (`ribbon:537-592`): «Fuentes del tema» (`<majorFont> (Títulos)`,
  `<minorFont> (Cuerpo)` of the document theme), «Usadas recientemente», «Todas las fuentes»;
  empty search → disabled row «Sin coincidencias (Intro aplica el nombre tal cual)». Typing filters;
  Enter commits any typed name (even off-catalogue). Size combo: list = FONT_SIZE_SCALE; free typed
  values accepted if > 0 (comma or dot) and normalised by `font-size` (0.5 step, [1,1638]).

### 10.4 Font pairs (Design → «Fuentes») — `fonts:594-629`

| id | name | major | minor |
|---|---|---|---|
| aptos | Aptos | Aptos Display | Aptos |
| calibri | Calibri | Calibri Light | Calibri |
| cambria | Cambria | Cambria | Cambria |
| georgia | Georgia | Georgia | Georgia |
| times-arial | Times New Roman / Arial | Times New Roman | Arial |
| garamond | Garamond | Garamond | Garamond |
| verdana | Verdana | Verdana | Verdana |
| office-2010 | Office 2007-2010 | Cambria | Calibri |
| arial | Arial | Arial | Arial |
| times | Times New Roman | Times New Roman | Times New Roman |
| candara | Candara | Candara | Candara |
| century-gothic | Century Gothic | Century Gothic | Century Gothic |
| constantia | Constantia | Constantia | Constantia |
| corbel | Corbel | Corbel | Corbel |
| franklin-gothic | Franklin Gothic | Franklin Gothic Medium | Franklin Gothic Book |
| gill-sans | Gill Sans MT | Gill Sans MT | Gill Sans MT |
| tw-cen | Tw Cen MT | Tw Cen MT | Tw Cen MT |
| consolas-verdana | Consolas / Verdana | Consolas | Verdana |
| segoe | Segoe UI | Segoe UI Semibold | Segoe UI |
| book-antiqua | Book Antiqua | Book Antiqua | Book Antiqua |
| montserrat-open-sans | Montserrat / Open Sans | Montserrat | Open Sans |
| playfair-source-sans | Playfair Display / Source Sans | Playfair Display | Source Sans 3 |
| merriweather-lato | Merriweather / Lato | Merriweather | Lato |
| raleway-roboto | Raleway / Roboto | Raleway | Roboto |
| oswald-noto-sans | Oswald / Noto Sans | Oswald | Noto Sans |
| lora-nunito-sans | Lora / Nunito Sans | Lora | Nunito Sans |
| poppins-inter | Poppins / Inter | Poppins | Inter |
| eb-garamond | EB Garamond | EB Garamond | EB Garamond |
| roboto-slab-roboto | Roboto Slab / Roboto | Roboto Slab | Roboto |
| baskerville-franklin | Libre Baskerville / Libre Franklin | Libre Baskerville | Libre Franklin |
| cormorant-mulish | Cormorant Garamond / Mulish | Cormorant Garamond | Mulish |
| josefin-lato | Josefin Sans / Lato | Josefin Sans | Lato |
| work-sans-source-serif | Work Sans / Source Serif | Work Sans | Source Serif 4 |
| bebas-open-sans | Bebas Neue / Open Sans | Bebas Neue | Open Sans |

Ids of the first seven are stable (used in documents/tests). Panel row: «Aa» in major font, name,
"major · minor" each in its own font; tooltip `«<major> (títulos) · <minor> (cuerpo)»`.

---

## 11. Lists

### 11.1 Membership

A paragraph is in a list iff its **effective** `para.numbering` (block override, else style) is an
object with non-null `listId` (`lists:63-75`). Explicit `block.para.numbering === null` removes a
list inherited from the style. Level is floored and clamped to [0, 8]. `MAX_LIST_LEVELS = 9`.

Definition lookup (`lists:78-90`): `doc.numbering` by id, else `defaultNumbering()` by id, else
none. Level lookup: `levels[min(level, levels.length-1)]` (out-of-range level uses the last level).

### 11.2 `defaultNumbering()` (`lists:41-58`) — legacy ids `n1`, `n2`

For i in 0..8, `ind = 720×(i+1)`:
- `n1` (type bullet): `char = ['•','○','▪'][i%3]`, `font = ['Symbol','Courier New','Wingdings'][i%3]`,
  except level 1 has **no** `font` key. No `fmt`, no `hanging`.
- `n2` (type decimal): `fmt = ['decimal','lowerLetter','lowerRoman'][i%3]`, `sep:'.'`, `ind`.

### 11.3 Gallery catalogue (Bullet / Numbering / Multilevel libraries) — `lists:202-318`

Constants: `HANGING_TWIPS = 360`, `LEVEL_STEP_TWIPS = 360`, `FIRST_LEVEL_TWIPS = 720`.

Builders:
```
bulletLevels(chars, fonts=[]): for i in 0..8:
    {fmt:'bullet', char: chars[i % len], ind: 720 + 360*i, hanging: 360,
     font: fonts[i % (fonts.length || 1)] if truthy}          // '' or undefined -> no font key
numberLevels(cycle, sep): for i in 0..8:
    {fmt: cycle[i % len], sep, ind: 720 + 360*i, hanging: 360}
legalLevels(sep='.'): for i in 0..8:
    {fmt:'decimal', lvlText: join('%1'..'%(i+1)', sep) + sep, ind: 720 + 360*i, hanging: 360*(i+1)}
    // level0 '%1.', level1 '%1.%2.', level2 '%1.%2.%3.' …
```

Bullets («Biblioteca de viñetas»):

| id | name | sample | level chars cycle | fonts cycle |
|---|---|---|---|---|
| `lb-disc` | «Viñeta redonda» | • | • ○ ▪ | Symbol, (none), Wingdings |
| `lb-circle` | «Viñeta hueca» | ○ | ○ ▪ • | — |
| `lb-square` | «Viñeta cuadrada» | ▪ | ▪ • ○ | Wingdings (all levels) |
| `lb-arrow` | «Viñeta de flecha» | ➢ | ➢ ▪ • | — |
| `lb-check` | «Viñeta de visto» | ✓ | ✓ ○ ▪ | — |
| `lb-diamond` | «Viñeta de rombo» | ◆ | ◆ ◇ ▪ | — |
| `lb-dash` | «Viñeta de guion» | – (U+2013) | – • ○ | — |
| `lb-star` | «Viñeta de estrella» | ★ | ★ ☆ ▪ | — |

Glyph code points: • U+2022, ○ U+25CB, ▪ U+25AA, ➢ U+27A2, ✓ U+2713, ◆ U+25C6, ◇ U+25C7, ★ U+2605,
☆ U+2606. **Pitfall**: the `font` field names Symbol/Wingdings, but the stored chars are Unicode.
Rendering the Unicode glyph with Wingdings/Symbol on a native system would show the wrong glyph;
render bullets with a Unicode-capable font (or map back to the PUA code when exporting, see
.docx spec). The web app gets away with it because the browser falls back.

Numbering («Biblioteca de numeración»):

| id | name | type | sample | level formats cycle | sep |
|---|---|---|---|---|---|
| `ln-decimal` | «1. 2. 3.» | decimal | 1. | decimal, lowerLetter, lowerRoman | `.` |
| `ln-paren` | «1) 2) 3)» | decimal | 1) | decimal, lowerLetter, lowerRoman | `)` |
| `ln-upper-letter` | «A. B. C.» | upperLetter | A. | upperLetter, decimal, lowerRoman | `.` |
| `ln-lower-letter` | «a) b) c)» | lowerLetter | a) | lowerLetter, decimal, lowerRoman | `)` |
| `ln-upper-roman` | «I. II. III.» | upperRoman | I. | upperRoman, upperLetter, decimal | `.` |
| `ln-lower-roman` | «i. ii. iii.» | lowerRoman | i. | lowerRoman, lowerLetter, decimal | `.` |
| `ln-ordinal` | «1.º 2.º 3.º» | ordinal | 1.º | ordinal, lowerLetter, lowerRoman | `' '` (space) |

Multilevel («Biblioteca de listas»):

| id | name | type | sample | levels |
|---|---|---|---|---|
| `lm-legal` | «1. / 1.1. / 1.1.1.» | decimal | 1.1. | `legalLevels('.')` |
| `lm-mixed` | «1. / a. / i.» | decimal | 1. a. | `numberLevels([decimal, lowerLetter, lowerRoman], '.')` |
| `lm-bullet` | «• / ○ / ▪» | bullet | • ○ | `bulletLevels(['•','○','▪'], ['Symbol','','Wingdings'])` |

`listGallery(kind)` returns deep copies; kind ∈ `bullet│number│multilevel` (unknown → []).

Gallery dropdown UI (`ribbon:803-880`): title (above), 4-column grid of 52×44 px buttons; each shows
3 sample rows = marker + grey line; marker of row i: bullet → `char || '•'`; `lvlText` → replace
`%n` with `i+1` for n=1 and `1` otherwise; numbered → `ORDINAL_SAMPLES[fmt][i%3]` + (`sep==' '` →
'' else `sep || '.'`). ORDINAL_SAMPLES: decimal 1,2,3; lowerLetter a,b,c; upperLetter A,B,C;
lowerRoman i,ii,iii; upperRoman I,II,III; ordinal 1.º,2.º,3.º. Current list highlighted
(border `#185ABD`, bg `#EDEBE9`). Then «Ninguno» (→ remove list) and a disabled row «Cambiar nivel
de lista ▸ Tab / Mayús+Tab».

### 11.4 Ordinal formatting — `lists:92-133`

```
formatOrdinal(n, fmt): v = (finite n and n>0) ? floor(n) : 1
  lowerLetter: toLetter(v)            // 1->a … 26->z, 27->aa, 28->bb, 53->aaa (repetition, NOT base-26)
  upperLetter: toLetter(v).upper()
  lowerRoman:  toRoman(v)             // standard subtractive: m cm d cd c xc l xl x ix v iv i
  upperRoman:  toRoman(v).upper()
  ordinal:     `${v}.º`               // es-ES masculine (º = U+00BA)
  decimal / default: String(v)
toLetter(v): idx=(v-1)%26; rep=floor((v-1)/26)+1; letter(idx) repeated rep times
```
Note: `ordinal` label = `"1.º" + sep`; with `ln-ordinal` sep = `' '` → «1.º ».

### 11.5 Label computation — `computeListLabels(doc)` (`lists:420-470`) — used by layout

```
counters: map listId -> int[9] (zeros)
for block in doc.body (top-level blocks only, document order):
    skip if block.t != 'p' or no id; skip header/footer band paragraphs (block.hf truthy)
    num = numberingOf(block); skip if null
    arr = counters[num.listId]
    arr[num.level] += 1; for i > level: arr[i] = 0          // deeper levels restart under a parent
    def = findDef(listId); lvl = levelDef(def, level); skip if none
    isBullet = lvl.fmt=='bullet' or (no lvl.fmt and (def.type=='bullet' or lvl.char != null))
    if isBullet: label = {text: lvl.char ?? '•', font: lvl.font or undefined, bullet:true}
    else:
       fmt = lvl.fmt ?? def.type ?? 'decimal'
       if lvl.lvlText non-empty:
           text = lvlText with each '%d' (single digit) replaced by:
               idx = d-1; if idx<0 or idx>=9 -> ''
               f = levelDef(def, idx).fmt || fmt
               formatOrdinal(max(1, arr[idx]), f)          // missing ancestor counts render as 1
       else:
           text = formatOrdinal(arr[level], fmt) + (lvl.sep is string ? lvl.sep : '.')
       label = {text, font: lvl.font or undefined, bullet:false}
```
Rules and consequences:
- One counter set **per listId**, not per "list instance". Non-list paragraphs between items do
  **not** interrupt numbering. Gallery ids are stable and reused (`ensureListDef` is idempotent),
  so two separate numbered blocks both made with «1. 2. 3.» number continuously (1,2,3 … 4,5).
- Skipping levels: a level-2 item directly after a level-0 item shows `%2` ancestor as 1.
- `start` value, «Reiniciar en 1», «Continuar numeración», «Establecer valor de numeración»:
  **[NOT IMPL]** (plan F6 task 4). *Recommendation*: add an optional `start` per level and a
  per-paragraph `numbering.restart:true` flag; ignore unknown keys when reading old files.
- Paragraphs inside table cells are not in `doc.body` top level → they get **no marker**.
- The older `computeOrdinals` / `listMarkerText` (`lists:145-196`) implement the same counting
  without `lvlText` and without skipping `hf` blocks; layout uses `computeListLabels`. Port only
  `computeListLabels` semantics (plus `listMarkerText` for API parity if needed).

### 11.6 Indentation per level — `levelIndent` / `listParaDelta` (`lists:369-396`)

```
level = clamp(floor(level) || 0, 0, 8)
left  = lvl.ind if finite else 720 + 360*level
first = -abs(lvl.hanging if finite else 360)
listParaDelta(doc, listId, level):
    listId null/'' -> {numbering:null, left:0, first:0}
    else           -> {numbering:{listId, level}, left, first}
```
So gallery bullet/number lists: level n text at `720+360n` twips, marker at `left − 360 = 360+360n`.
Legal (`lm-legal`): hanging = 360×(n+1), so the marker of **every** level starts at
720+360n−360(n+1) = **360 twips**, and the text of level n starts at `max(720+360n, 360+markerWidth+space)`
(longer labels such as «1.1.1.» push the text right). This is the code's behaviour.

Note `numbering:null` *removes the override* (§3.1): if the paragraph style itself defines
numbering, removing the list via the UI does not remove it. Also `left:0, first:0` are written as
explicit overrides, so the paragraph loses any previous indentation (plan F6 says Word keeps the
indentation when leaving a list — deviation).

### 11.7 List commands and editing behaviour

`setList(range, listId|null, {level?})` — `reg:974-1009`:
```
if listId: ensureListDef(doc, listId)       // copies gallery/default def into doc.numbering once
else if no paragraph in range has a list: no-op ('Quitar lista')
one region command 'Aplicar lista' / 'Quitar lista' (structural):
  for each block in range with t == 'p':
      cur = listOf(block); level = forcedLevel ?? (cur ? cur.level : 0)
      applyParaFormat(whole block, listParaDelta(doc, listId, level))
```
(changing bullet style keeps each paragraph's level).

`setListLevel(range, delta)` — `reg:1014-1043`: step = −1 if delta<0 else +1; no-op if no list
paragraph in range; for each list paragraph: `new = clamp(level+step, 0, 8)`; if changed apply
`listParaDelta(doc, cur.listId, new)` (indents follow the level).

UI routing (`main:779-784, 1925-1956`):
- «Viñetas» / «Numeración» / «Lista multinivel» main button: `toggleList(kind, listId?)`: target =
  given id or first gallery entry of that kind (`lb-disc`, `ln-decimal`, `lm-legal`); if the
  caret paragraph's current listId equals target → remove list (`setList(null)`), else apply target.
  (The toggle checks only the caret paragraph.)
- Gallery entry → same toggle with that id. «Ninguno» → `setList(range, null)`.
- `list:level-inc` / `list:level-dec` → `setListLevel(±1)`.
- **Enter** (`editor:184-200`): if the selection is collapsed and the paragraph is empty
  (blockLength 0) and `setList(range, null)` is not a no-op → leave the list (no new paragraph).
  Otherwise split; the new paragraph copies `para` (including `numbering`), continuing the list at
  the same level.
- **Tab / Shift+Tab** (`editor:225-247`): outside tables, if (selection spans blocks, or is
  non-collapsed, or caret offset == 0) and `setListLevel(±1)` is not a no-op → level changed.
  Otherwise Tab inserts a tab run; Shift+Tab does nothing.
- Backspace on the marker removing the list, «Definir nueva viñeta/nuevo formato de número»,
  «Cambiar nivel de lista» submenu (9 levels), Ctrl+Mayús+L, multilevel linked to headings:
  **[NOT IMPL]**.

### 11.8 Marker layout — `main:248-258`, `breaker:465-479, 846-852`

- Marker text = label text; marker char = **paragraph style's resolved char** (`resolveCharFormat(
  doc, block, null)`, not the first run's char), with `font` replaced by `label.font` if present.
- `markerX = left + first` (px); `markerGap` = width of one space in marker font;
  first-line text start = `max(left, markerX + markerWidth + markerGap)`; first-line indent is not
  added to the text for list paragraphs; following lines start at `left`.
- Marker occupies no document offsets; caret never enters it; attached as `lines[0].marker`.

### 11.9 .docx import of numbering — `Reader:600-605, 655-696, 2140-2345`

- `w:numPr`: `numId 0` → `numbering:null` (removes inherited list); `ilvl` clamped 0..8; listId =
  `'num' + numId`; definition registered once (abstractNum levels + lvlOverride levels replace).
  Missing levels filled with `{fmt:'decimal', ind:720×(i+1), hanging:360}`; def.type = level 0 fmt.
- Level: `ind` from `w:ind@left|start` (≥0, default 720×(ilvl+1)); `hanging` from `@hanging`
  (≥0), `firstLine` present → hanging 0, default 360; `font` from `rPr/rFonts@ascii|hAnsi`.
- `numFmt` bullet/none → `fmt:'bullet'`, `char` = lvlText (none → ''), Symbol/Wingdings/Webdings
  PUA glyphs mapped to Unicode via fixed tables (then font dropped); other fonts keep `font` and the
  first character.
- Numeric formats kept: decimal, lowerLetter, upperLetter, lowerRoman, upperRoman, ordinal; all
  others → decimal. `lvlText` containing `%` stored as `lvlText`; non-empty lvlText without `%`
  → treated as a bullet with that text.
- A list paragraph without its own `w:ind` takes `left = level.ind`, `first = −hanging`.

---

## 12. Format painter («Copiar formato») — `main:1835-1919`, `ribbon:985-992`

Load (`format-painter`, single click = one-shot; double-click = sticky `{sticky:true}`):
```
pos = selection.range.start; block = getBlock(pos.blockId)
char = rawCharAt(doc, {blockId, offset: min(pos.offset+1, blockLength)})   // first selected char
painter = {styleId: block.style || 'Normal', char: copy(raw char), para: copy(block.para || {}), sticky}
```
It copies **raw overrides**, not resolved formats. Canvas gets a "painting" cursor state; ribbon
toggle `format-painter` lit.

Apply (on canvas mouse-up, after the editor updates the selection — next frame):
```
range = expandRangeToWord(selection.range); if collapsed: keep painter loaded, do nothing
batch 'Copiar formato':
   setStyle(range, painter.styleId)
   applyParaFormat(range, {k: painter.para[k] ?? null  for k in PARA_KEYS})   // 11 canonical keys
   applyCharFormat(range, {k: painter.char[k] ?? null for k in CHAR_KEYS})    // 12 canonical keys
if not sticky: unload
```
`null` deletes target overrides that the source did not have, so the target inherits like the
source. Extended keys (`borders`, `shading`, `lineRule`, `keepLines`, `spacing`, …) are neither
copied nor cleared. Paragraph style and para format are applied even when only part of a paragraph
is painted (Word only copies paragraph format when the source selection includes the paragraph
mark — deviation). `Escape` unloads first (before other Esc actions); `format-painter:off` unloads.

---

## 13. Font dialog («Fuente») — `fontdlg`

Title «Fuente», width 540, buttons «Aceptar» (primary) / «Cancelar». Single tab (the «Avanzado»
tab with spacing/position/scale is **[NOT IMPL]**). Initial state from effective char at
`currentFormat()`; defaults `{font:'Aptos', size:11, bold:false, italic:false, underline:'none',
strike:false, sub:false, sup:false, color:'auto'}` (`fontdlg:62-65, 141-157`). Range captured at
open (modal).

| Field | Control | Details |
|---|---|---|
| «Fuente:» | text box + 7-row list of the full catalogue (sorted) | each entry painted in its own family when available (not for symbol fonts); an off-catalogue current font is inserted at top. Typing: first catalogue name starting with the typed text (case-insensitive) is selected; state.font = that name if it equals the typed text ignoring case, else the typed text verbatim (if non-empty) |
| «Estilo de fuente:» | 7-row list | `normal` «Normal» (b0,i0), `cursiva` «Cursiva» (i), `negrita` «Negrita» (b), `negrita-cursiva` «Negrita Cursiva» (b,i) |
| «Tamaño:» | number box (min 1, max 1638, step 1) + 7-row list of FONT_SIZE_SCALE | typed value accepted if finite, >0, ≤1638 (comma allowed); list selection cleared if not in scale. **Not** rounded to 0.5 (unlike ribbon) |
| «Estilo de subrayado:» | dropdown | `none` «(ninguno)», `single` «Sencillo», `double` «Doble», `dotted` «Punteado», `words` «Solo palabras» |
| «Color de fuente:» | button «Automático» + 20 swatches (10 per row) + hex box (placeholder «#RRGGBB», max 7 chars, aria «Color personalizado en hexadecimal») + current-colour chip | swatches order: `#FFFFFF #000000 #E7E6E6 #44546A`, default-theme accents `#2F5496 #C55A11 #548235 #7030A0 #C00000 #1F4E79`, standard `#C00000 #FF0000 #FFC000 #FFFF00 #92D050 #00B050 #00B0F0 #0070C0 #002060 #7030A0`. Hex box applies when it holds valid 6-hex. Chip tooltip «Automático (negro)» for auto |
| «Efectos» (group) | checkboxes «Tachado», «Subíndice», «Superíndice» | checking one of sub/sup unchecks the other |
| «Vista previa» | sample «AaBbCcYyZz» (64 px tall box) | font stack, size × 0.65 if sub/sup, weight, style, colour (auto → black), vertical-align, underline/strike decorations (double/dotted styles) |
| note | text | «Esta es una fuente TrueType. Se usará la misma fuente en la pantalla y en la impresora.» |

Apply (`fontdlg:331-356`):
```
delta = {k: state[k] for k in [font,size,bold,italic,underline,strike,sub,sup,color] if state[k] != initial[k]}
if delta.sub === true and state.sup != initial.sup: delta.sup = false
if delta.sup === true and state.sub != initial.sub: delta.sub = false
if delta empty or no range: just refocus
range = collapsed ? expandRangeToWord(range) : range
if delta.font: noteFontUsed(delta.font)
commands.applyCharFormat(range, delta)        // one undo step; collapsed range -> no-op
```
Colour values in the delta are `'auto'` or `'#RRGGBB'`.

---

## 14. Pitfalls and non-obvious behaviour (checklist)

1. `null` in a delta deletes the override (inherit), it never stores `null` (§3.1) — except
   `setStyleProps`, which stores nulls literally inside styles (§8.4).
2. Colours: runs use `#RRGGBB`, built-in styles and default theme use `RRGGBB`, theme catalogue
   uses `#RRGGBB`. Accept both everywhere; write runs with `#`.
3. Toggle state is read at one position, which for selections is the char **before** the selection
   start (§2.4). No mixed state in the ribbon.
4. No pending (insertion-point) formatting: char commands with a collapsed caret outside a word do
   nothing.
5. Clear formatting writes explicit Aptos 11 overrides and sets Normal, keeps para overrides (§5.4).
6. Character style «Énfasis» applied from the gallery becomes a paragraph style (§8.3).
7. `style.next` ignored on Enter (§8.5).
8. Theme colour change rewrites style fonts; theme colours are never rendered (§9.3).
9. `line-spacing` does not reset `lineRule` (§6.1). Paragraph dialog cannot set exact/at-least.
10. Tab stop types/leaders ignored by layout; all tabs are left tabs; default stops every 720 tw.
11. `keepNext`, `keepLines`, `widowControl` not honoured by pagination.
12. Spacing before/after add up; suppressed at page top; `contextualSpacing` compares style ids.
13. Lists number continuously per listId across the whole document; no restart; gallery ids are
    reused; legacy `n1`/`n2` ids still resolve via `defaultNumbering()`.
14. Leaving a list sets `left:0, first:0` explicitly.
15. List markers use the paragraph style's char (not the run's), bullet `font` may name
    Symbol/Wingdings while the glyph is Unicode.
16. Lists inside table cells and header/footer paragraphs get no markers.
17. `underline:'dash'` and highlight colours not in the 16-colour OOXML set are lossy on .docx export;
    `dstrike` is degraded to `strike` on import; hidden text is dropped on import.
18. Imported style ids are English (`Title`, `Heading1`, `NoSpacing`, `Quote`, `Emphasis`); built-in
    new-document ids are Spanish-ASCII (`Titulo`, `SinEspacio`, `Cita`, `Enfasis`). Galleries and any
    style logic must handle both alias sets.
19. Style cache must be invalidated whenever the style table changes.
20. Font size from the Font dialog is not rounded to 0.5 pt; ribbon sizes are.

## 15. Test vectors (for Catch2)

| Input | Expected |
|---|---|
| `resolveStyle(defaultDoc,'Heading1').char` | font Aptos Light, size 16, color `2F5496`, bold false, … (12 keys) |
| `resolveStyle(defaultDoc,'Heading1').para` | align left, line 276, before 240, after 80, keepNext true, widowControl true, left/right/first 0, tabs [], numbering null |
| `resolveStyle(defaultDoc,'Unknown')` | equals resolved Normal |
| `resolveStyle(defaultDoc,'Enfasis').char` | hard defaults + italic true |
| styles A.basedOn=B, B.basedOn=A | terminates; chain [B?…] no hang |
| `charDeltaForCommand('sub',{}, {sub:false})` | `{sub:true, sup:false}` |
| `charDeltaForCommand('underline',{style:'double'},{underline:'double'})` | `{underline:'none'}` |
| `charDeltaForCommand('underline',{style:'wavy'},{})` | null |
| `charDeltaForCommand('font-size',{pt:'10,7'})` | parseFloat('10,7') = 10 → `{size:10}` (comma truncates!) |
| `charDeltaForCommand('font-size',{pt:10.3})` | `{size:10.5}` |
| `charDeltaForCommand('font-color',{color:'abc'})` | `{color:'#AABBCC'}` |
| `charDeltaForCommand('highlight',{color:'auto'})` | `{highlight:null}` |
| `paraDeltaForCommand('line-spacing',{mult:1.5})` | `{line:360}` |
| `resolveParaDelta({__indentDelta:-720},{left:360})` | `{left:0}` |
| `formatOrdinal(27,'lowerLetter')` | `'aa'` |
| `formatOrdinal(1994,'upperRoman')` | `'MCMXCIV'` |
| `formatOrdinal(3,'ordinal')` | `'3.º'` |
| list `lm-legal`: levels 0,1,1,0,1 | labels `1.`, `1.1.`, `1.2.`, `2.`, `2.1.` |
| list `ln-decimal`: items, non-list para, items | numbering continues |
| `levelIndent(doc,'lb-disc',2)` | `{left:1440, first:-360}` |
| `levelIndent(doc,'lm-legal',2)` | `{left:1440, first:-1080}` |
| `listParaDelta(doc,null)` | `{numbering:null, left:0, first:0}` |
| applyParaFormat over blocks b1..b3 with end offset 0 in b3 | only b1, b2 modified |
