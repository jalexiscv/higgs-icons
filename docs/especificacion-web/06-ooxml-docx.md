# 06 — .DOCX import and export (OOXML WordprocessingML)

Source of truth (all paths relative to `C:/xampp/htdocs/Skriba`):

| File | Role |
|---|---|
| `src/lib/OOXML/Writer.php` (1481 lines) | model → .docx (`Writer::write($doc, $outPath, $mediaDir='')`) |
| `src/lib/OOXML/Reader.php` (3148 lines) | .docx → model + `_warnings` (`Reader::read($docxPath, $mediaDir='')`) |
| `src/lib/OOXML/Converters.php` (465 lines) | unit conversions, enums, defaults, `normalizeDocument()` |
| `src/tests/cases/ooxml.php`, `ooxml2.php`, `ooxml3.php` | PHP tests (all expectations are listed in §12) |
| `docs/componentes/importacion-docx.md`, `CONTRACTS.md` §"PHP OOXML — A9" (l.707-728) and l.894-905, `INTEGRATION_NOTES.md`, `plan.md` FASE 16 (l.805-849) | design notes |
| `src/lib/Assets.php` | **Not related to OOXML** (cache-busting of web JS/CSS with `?v=crc32(size:mtime)` + import map). Nothing to port for the .docx subsystem. |

Reference notation: `W:123` = Writer.php line 123, `R:123` = Reader.php, `C:123` = Converters.php, `T1:n` / `T2:n` / `T3:n` = ooxml.php / ooxml2.php / ooxml3.php.

The C++ port must reproduce **exactly** the behaviour below (including the quirks marked **QUIRK**), unless a line is marked **BUG (fix recommended)** — those are defects in Skriba that the C++ team may fix, but must then document the deviation and keep tests that assert Skriba's observable behaviour where it matters for round-trips.

---

## 0. Overview and design rules

1. Export is a hand-written ZIP of string-concatenated XML parts. No XML library is needed for writing; every text/attribute goes through `esc()` (§1.6). All XML is generated **before** the ZIP is opened, so a failure never leaves a half-written file (W:116-119).
2. Import is a DOM walk with namespace-aware matching (namespace URI + localName, never prefixes), tolerant attribute lookup (`wattr`, §1.8), and a **warning list** `_warnings` (deduplicated strings, one per distinct message, insertion order) for anything dropped or degraded.
3. The model is the Skriba JSON document (§5.1 of plan). Relevant particularities that drive the mapping:
   - `body` is a **flat array** of blocks. Table cell paragraphs, header/footer paragraphs and footnote paragraphs are ordinary paragraph blocks living in `body`, distinguished by a mark: `cell:{tableId,row,col}`, `hf:{kind,variant}`, `fn:{id,kind,number}`.
   - Run char formatting is **sparse**: a key present means an explicit override, even when its value is `false`/`null` (W:556-560).
   - Lengths: paragraph/section/table measurements are **twips** (1/20 pt); font size `char.size` is **points** (int or .5); image `w/h` are **twips**; line spacing `para.line` is **1/240 of a line** when `lineRule` is absent/`auto`, and **twips** when `lineRule` is `exact`/`atLeast`.
   - Colors in the model: `'auto'` or `'#RRGGBB'` (uppercase on import). The Writer also accepts `'RRGGBB'` without `#` (theme colors and some style colors are stored without `#`).
   - Linear offsets (comments, bookmarks) are in **UTF-16 code units**; every non-text run counts 1 (R:3069-3081).

### 0.1 Units and conversions (C:84-110, W:709, R:54, R:1479, R:1531, R:2483)

| Quantity | OOXML unit | Model unit | Conversion |
|---|---|---|---|
| Font size `w:sz`/`w:szCs` | half-points | pt | write `round(pt*2)` clamped to [2, 3276]; read `hp/2` (int if whole, else float, e.g. 23 → 11.5) |
| Paragraph spacing, indents, tabs, page size, margins, column widths, table grid, cell widths, cell margins, row height | twips (dxa) | twips | identity |
| `w:spacing w:line` with `lineRule="auto"` | 240ths of a line | 240ths of a line | identity (240 = single, 276 = 1.15, 480 = double) |
| `w:spacing w:line` with `exact`/`atLeast` | twips | twips | identity |
| Character spacing `w:spacing w:val` in rPr | twips | twips | identity |
| DrawingML extents `wp:extent cx/cy` | EMU | twips | **1 twip = 635 EMU**; write `twips*635`; read `round(EMU/635)` |
| VML `style="width:Xpt;height:Ypt"` | pt | twips | `round(pt*20*635)` EMU then `/635` → `pt*20` twips |
| Image natural size fallback | px (96 dpi) | twips | `px*15` |
| Border width `w:sz` (pBdr/tblBorders/pgBorders) | eighths of a point | eighths of a point (para borders) | identity; for `pageBorder` the model uses CSS px: `max(1, round(sz/8 * 96/72))` |
| Border spacing `w:space` | points | points (para borders) | identity; `pageBorder.space` px = `max(0, round(space*96/72))` |
| pt ↔ twips helpers | — | — | `ptToTwips = round(pt*20)`; `twipsToPt = tw/20` (int if whole) |
| Anchor distances `distL/distR` | EMU | — | constant 114300 (= 0.125 in) when written |

---

## 1. Converters (shared helpers) — `Converters.php`

### 1.1 Alignment (C:115-136)

| model `align` → `w:jc` | `w:jc` → model `align` |
|---|---|
| `center`→`center`, `right`→`right`, `justify`→`both`, anything else→`left` | `left`,`start`→`left`; `center`→`center`; `right`,`end`→`right`; `both`,`justify`,`distribute`→`justify`; anything else→**null** (no `align` key) |

### 1.2 Highlight palette ST_HighlightColor (C:22-39, 141-177)

16 entries, **in this iteration order** (order matters for tie-breaking):

| name | hex | name | hex |
|---|---|---|---|
| black | 000000 | green | 00FF00 |
| blue | 0000FF | lightGray | C0C0C0 |
| cyan | 00FFFF | magenta | FF00FF |
| darkBlue | 000080 | red | FF0000 |
| darkCyan | 008080 | white | FFFFFF |
| darkGray | 808080 | yellow | FFFF00 |
| darkGreen | 008000 | | |
| darkMagenta | 800080 | | |
| darkRed | 800000 | | |
| darkYellow | 808000 | | |

- `highlightToHex(name)`: `'none'` → null; known name → `'#'+hex`; unknown → null.
- `hexToHighlight(hex)`: null → `'none'`; unparsable → `'none'`; otherwise the palette entry with **minimum squared RGB Euclidean distance**, scanning in table order with strict `<` (first minimum wins). Initial best = `yellow`. E.g. `#FFEE05` → `yellow`.

### 1.3 On/off booleans (C:185-191)
`parseOnOff(val)`: attribute absent or empty → **true**; lowercase in {`0`,`false`,`off`,`none`} → false; anything else → true.
Writer `onOff(tag, v)` (W:1451-1454): true → `<w:tag/>`; false → `<w:tag w:val="0"/>`.

### 1.4 Colors (C:197-223)
- `normColor(v)` (read): null/'' → null; strip spaces and leading `#`; `auto` (case-insensitive) → `'auto'`; 6 hex digits → `'#'+UPPER`; else null.
- `colorAttr(v)` (write): strip spaces and `#`; 6 hex → UPPER hex without `#`; **anything else → `'auto'`**.

### 1.5 Underline, tabs, numFmt (C:242-283)
- `normUnderline(u)`: trimmed lowercase; ''/`none`/null → `none`; `single`; `words`; `double`/`doubleaccounting` → `double`; starts with `dot` (dotted, dottedHeavy, dotDash, dotDotDash…) → `dotted`; **everything else (wave, thick, dash…) → `single`**. Model domain: `none|single|double|words|dotted`.
- `tabType(t)`: lowercase trimmed, must be one of `left center right decimal bar clear num`, else `left`. (QUIRK: OOXML `start`/`end` therefore import as `left`.)
- `numFmt(f)`: one of `decimal upperRoman lowerRoman upperLetter lowerLetter bullet none decimalZero ordinal cardinalText` passes through unchanged (QUIRK: the comment says `ordinal` degrades to decimal, the code does not), else `decimal`.

### 1.6 Text sanitising and escaping (C:317-334)
- `sanitizeText(s)`: remove `[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]`; then replace `\r\n`, `\r`, `\n`, `\t` each by a single space (tabs and newlines are separate runs in the model, never text).
- `esc(s)`: `sanitizeText` then XML-escape `& < > " '` (`&amp; &lt; &gt; &quot; &apos;`), invalid UTF-8 replaced by U+FFFD. Used for all text nodes and attribute values. Test: `esc('a & b < c > "d"')` = `a &amp; b &lt; c &gt; &quot;d&quot;`.

### 1.7 Style ids and names (C:49-74, 291-308)
- `STYLE_SKIP = [DefaultParagraphFont, TableNormal, NoList]` — never imported, never exported from the model (Writer emits its own DefaultParagraphFont).
- `styleId(id)`: delete every char not in `[A-Za-z0-9_-]`; if empty or not starting with a letter, prefix `S`; truncate to 253 chars. Idempotent. `Heading1`→`Heading1`; `Mi Estilo Ñ`→`MiEstilo`; `Título`→`Ttulo` (QUIRK: accents are dropped, not transliterated).
- `BUILTIN_STYLE_NAMES` (model id → Word built-in `w:name`): Normal→`Normal`, NoSpacing→`No Spacing`, Title→`Title`, Subtitle→`Subtitle`, Quote→`Quote`, Emphasis→`Emphasis`, Strong→`Strong`, Heading1..Heading9→`heading 1`..`heading 9`. (ListParagraph is NOT in the export table.)
- `styleName(id, name)`: built-in name if id is in the table, else trimmed `name` if non-empty, else `id`. So `Heading1` with name «Título 1» exports as `heading 1` (Spanish display name is lost on round-trip — INTEGRATION_NOTES #9, intentional: Word only recognises built-ins by their English name). Custom Skriba ids such as `Titulo`, `Cita`, `Enfasis` export as custom styles with their es-ES display name.

### 1.8 Dates (C:337-347)
`isoDate(v)`: parse any date string (PHP `strtotime`); success → `gmdate('Y-m-d\TH:i:s\Z')` (UTC, W3CDTF, no fractional seconds); empty/unparsable → **current UTC time**.

### 1.9 Defaults (C:352-403)
- `defaultTheme()`: `{majorFont:'Aptos', minorFont:'Aptos', colors:{accent1:'2F5496', accent2:'C55A11', accent3:'548235', accent4:'7030A0', accent5:'C00000', accent6:'1F4E79'}}` (colors without `#`).
- `defaultSection(id='sec1')`: `{id, page:{w:11906, h:16838, orient:'portrait', margins:{top:1440,right:1440,bottom:1440,left:1440}, headerDist:720, footerDist:720, columns:{count:1, spacing:708}}, headers:{default:null,first:null,even:null}, footers:{same}, differentFirst:false, differentEven:false, linkToPrevious:true}`.
- `defaultNormalStyle()`: `{id:'Normal', name:'Normal', type:'paragraph', basedOn:null, next:'Normal', char:{font:'Aptos', size:11, color:'auto', bold:false, italic:false, underline:'none', strike:false, sub:false, sup:false, highlight:null, allCaps:false, smallCaps:false, spacing:0}, para:{align:'left', line:276, before:0, after:160, left:0, right:0, first:0, tabs:[], keepNext:false, widowControl:true, numbering:null, outlineLvl:null}}`.

### 1.10 `normalizeDocument(doc)` (C:411-464)
Fill missing keys (only if absent): `version:1, app:'Skriba-word', locale:'es-ES', name:'Documento1.docx', createdAt:now, modifiedAt:now, theme:defaultTheme(), styles:[], numbering:[], sections:[], media:{}, comments:[], body:[]`. Then: non-array `styles` → []; if no style with id `Normal`, **prepend** `defaultNormalStyle()`; empty/non-array `sections` → `[defaultSection()]`; empty `body` → `[{t:'p', id:'b1', sec:<sections[0].id or 'sec1'>, style:'Normal', runs:[]}]`; non-array numbering/media/comments → empty. Used at the start of the Writer (W:84) and at the end of the Reader (R:248).

---

## 2. EXPORT — package layout

### 2.1 Parts always written (W:128-148), in this ZIP order

| # | ZIP path | Content |
|---|---|---|
| 1 | `[Content_Types].xml` | §2.3 |
| 2 | `_rels/.rels` | §2.4 |
| 3 | `docProps/core.xml` | §2.6 |
| 4 | `docProps/app.xml` | §2.7 |
| 5 | `word/_rels/document.xml.rels` | §2.5 |
| 6 | `word/document.xml` | §3 |
| 7 | `word/styles.xml` | §4 |
| 8 | `word/settings.xml` | §2.8 |
| 9+ | extra XML parts in creation order: `word/numbering.xml` (if used lists), `word/headerN.xml`/`word/footerN.xml` (per band group), `word/footnotes.xml` (if any `fn` block) | §5, §6, §7 |
| last | binaries `word/media/<16hex>.<ext>` (only if the source file exists on disk) | §3.8 |

**Not written** (even though plan FASE 16 lists some): `word/theme/theme1.xml`, `word/comments.xml`, `word/endnotes.xml`, `header*.xml.rels`, `fontTable.xml`, `webSettings.xml`. See §11 (gaps).

Every XML part starts with `DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + "\r\n"` (W:50). Everything after it is on one line, no indentation.

Errors (W:111-151): output directory missing → `'El directorio de destino no existe: ' + dir`; ZIP create fails → `"No se pudo crear el .docx (código $res): $outPath"`; close fails → `'No se pudo cerrar el .docx: ' + path`. Existing file is overwritten.

### 2.2 Namespaces used by the Writer

| prefix | URI |
|---|---|
| w | `http://schemas.openxmlformats.org/wordprocessingml/2006/main` |
| r | `http://schemas.openxmlformats.org/officeDocument/2006/relationships` |
| m | `http://schemas.openxmlformats.org/officeDocument/2006/math` |
| wp | `http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing` |
| a | `http://schemas.openxmlformats.org/drawingml/2006/main` |
| pic | `http://schemas.openxmlformats.org/drawingml/2006/picture` |
| package rels | `http://schemas.openxmlformats.org/package/2006/relationships` |
| content types | `http://schemas.openxmlformats.org/package/2006/content-types` |
| relationship type base | `http://schemas.openxmlformats.org/officeDocument/2006/relationships/` + short type |

### 2.3 `[Content_Types].xml` (W:156-197)

```
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="xml" ContentType="application/xml"/>
 {for each embedded image extension, in first-use order: <Default Extension="png" ContentType="image/png"/>}
 <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
 <Override PartName="/word/styles.xml"   ContentType="…wordprocessingml.styles+xml"/>
 <Override PartName="/word/settings.xml" ContentType="…wordprocessingml.settings+xml"/>
 {extra parts, in creation order: basename starts with "header" → …header+xml; "footer" → …footer+xml;
  numbering.xml → …numbering+xml; footnotes.xml → …footnotes+xml; endnotes.xml → …endnotes+xml; others skipped}
 <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
 <Override PartName="/docProps/app.xml"  ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
```
`…wordprocessingml` = `application/vnd.openxmlformats-officedocument.wordprocessingml`. Image ext → mime: png→image/png, jpg/jpeg→image/jpeg, gif→image/gif, webp→image/webp, bmp→image/bmp (W:789-793). Note: both `jpg` and `jpeg` may appear as separate Defaults.

### 2.4 `_rels/.rels` (W:199-208) — fixed
```
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
 <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
 <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
```

### 2.5 `word/_rels/document.xml.rels` (W:89-94, 210-225)
`rId1` styles → `styles.xml`; `rId2` settings → `settings.xml`; then every relationship registered by `addRel(type,target,mode)` with ids `rId3, rId4, …` **in registration order**:
1. `numbering` → `numbering.xml` (if generated; W:1173) — registered first because `prepararNumeracion()` runs first (W:119).
2. one `header`/`footer` per band group → `headerN.xml`/`footerN.xml` (W:1248).
3. `footnotes` → `footnotes.xml` (W:1298).
4. then, while writing document.xml, in document order: `hyperlink` (Target = URL, `TargetMode="External"`; **one new relationship per hyperlink occurrence**, no dedupe; W:434) and `image` → `media/<file>` (deduped per model `rid`; W:764-797).
Type attribute = base URI + short type; Target escaped with `esc`.

### 2.6 `docProps/core.xml` (W:228-250)
Element order is **mandatory** (xsd:sequence; Word repairs otherwise):
```
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
 <dcterms:created xsi:type="dcterms:W3CDTF">{isoDate(doc.createdAt)}</dcterms:created>
 <dc:creator>Skriba</dc:creator>
 <dc:language>{esc(doc.locale ?? 'es-ES')}</dc:language>
 <cp:lastModifiedBy>Skriba</cp:lastModifiedBy>
 <dcterms:modified xsi:type="dcterms:W3CDTF">{isoDate(doc.modifiedAt)}</dcterms:modified>
 <cp:revision>1</cp:revision>
 <dc:title>{esc(doc.name ?? 'Documento1.docx')}</dc:title>
</cp:coreProperties>
```
(The title includes the `.docx` extension, e.g. `Prueba.docx`.)

### 2.7 `docProps/app.xml` (W:253-274, 1457-1480)
```
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
 <Template>Normal.dotm</Template><Pages>1</Pages><Words>{W}</Words><Characters>{C}</Characters>
 <Paragraphs>{P}</Paragraphs><ScaleCrop>false</ScaleCrop><LinksUpToDate>false</LinksUpToDate>
 <CharactersWithSpaces>{C + max(0, W-1)}</CharactersWithSpaces><SharedDoc>false</SharedDoc>
 <HyperlinksChanged>false</HyperlinksChanged><Application>Skriba</Application>
 <AppVersion>16.0000</AppVersion><DocSecurity>0</DocSecurity>
</Properties>
```
Statistics over **every** body block with `t=='p'` (including cell, header/footer and footnote paragraphs): P = count; for each `text` run: `sanitizeText(text)`; W += count of `\S+` matches; C += count of Unicode code points after removing all whitespace. Pages is always 1.

### 2.8 `word/settings.xml` (W:277-293) — fixed except the language
```
<w:settings xmlns:w="…/wordprocessingml/2006/main">
 <w:zoom w:percent="100"/>
 <w:defaultTabStop w:val="720"/>
 <w:characterSpacingControl w:val="doNotCompress"/>
 <w:compat>
  <w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>
  <w:compatSetting w:name="overrideTableStyleFontSizeAndJustification" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>
  <w:compatSetting w:name="enableOpenTypeFeatures" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>
  <w:compatSetting w:name="doNotFlipMirrorIndents" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>
 </w:compat>
 <w:themeFontLang w:val="{esc(doc.locale ?? 'es-ES')}"/>
</w:settings>
```
Child order follows CT_Settings (zoom … defaultTabStop … characterSpacingControl … compat … themeFontLang). **BUG (fix recommended):** `w:evenAndOddHeaders` is never written even when a section has `differentEven:true`, so Word ignores `type="even"` headers on export (the Reader does read it). If added, it goes after `w:defaultTabStop` and before `w:characterSpacingControl` (CT_Settings order: …defaultTabStop, autoHyphenation…, evenAndOddHeaders, …, characterSpacingControl…). `w:updateFields` (plan FASE 16) is not written either.

---

## 3. EXPORT — `word/document.xml`

### 3.1 Root (W:349-356)
```
<w:document xmlns:w=… xmlns:r=… xmlns:m=… xmlns:wp=… xmlns:a=… xmlns:pic=…><w:body>{body}</w:body></w:document>
```
`enDocumento=true` while writing document.xml (W:299, 347). Header/footer/footnote parts are generated **before** (W:119-121) with `enDocumento=false`, which changes hyperlink behaviour (§3.6).

### 3.2 Body walk and sections (W:297-347)

```
secActual = null
for i in 0..body.length-1:
    b = body[i]; skip if not object
    skip if b has 'hf' or 'cell' or 'fn'            // written in their own parts / inside the table
    sec = b.sec ?? ''
    if secActual != null and sec != '' and sec != secActual:
        out += '<w:p><w:pPr>' + sectPrXml(section(secActual)) + '</w:pPr></w:p>'   // closes previous section
    if sec != '': secActual = sec
    switch b.t ?? 'p':
       'table'    : out += tableXml(b, body) + paragraphAfterTable(body, i)
       'smartart' : out += smartartFallbackXml(b)
       'p'        : out += paragraphXml(b)
       other      : skip
last = secActual != null ? section(secActual) : (sections[0] ?? {})
out += sectPrXml(last)       // final, loose sectPr = last section
```
`section(id)` = the section with that id, else `sections[0]`, else `{}` (W:360-368).
Consequences: sections with no top-level blocks are never written; sections listed after the last used one are dropped. The section-break carrier paragraph is an **empty paragraph whose pPr contains only the sectPr**; the Reader recognises and drops it (§8.3), so round-trips do not grow.

### 3.3 Paragraph `w:p` (W:376-404)
`'<w:p>' + pPrXml(style ?? 'Normal', para) + runs + '</w:p>'`.
Runs are grouped for hyperlinks: consecutive runs whose `trim(char.link)` is equal and non-empty are written inside **one** `w:hyperlink` (any run type, not only text). `pPr` is omitted entirely when empty — but since pStyle is always written for body paragraphs (style defaults to `Normal`), body paragraphs always have a pPr.

### 3.4 `w:pPr` — model `para` → XML, in **CT_PPrBase order** (W:442-554)

Only keys present in `para` are written (sparse). `styleId===''` (styles.xml / docDefaults) suppresses `w:pStyle`.

| # | Element | Condition / value |
|---|---|---|
| 1 | `<w:pStyle w:val="{styleId(style)}"/>` | always for paragraphs (style default `Normal`) |
| 2 | `w:keepNext` | key present → onOff |
| 3 | `w:keepLines` | key present → onOff |
| 4 | `w:pageBreakBefore` | key present → onOff |
| 5 | `w:widowControl` | key present → onOff |
| 6 | `<w:numPr><w:ilvl w:val="L"/><w:numId w:val="N"/></w:numPr>` | `para.numbering` non-empty object AND its `listId` was assigned a numId (§5). L = clamp(level,0,8). **QUIRK:** `numbering:null` (explicit "no list" override) is NOT written as `numId 0`, so a list inherited from a style cannot be cancelled on export. |
| 7 | `<w:pBdr>` with children in order top, left, bottom, right | `para.borders` non-empty; per side present: `<w:{side} w:val="{style}" w:sz="{max(0,sz??4)}" w:space="{max(0,space??0)}" w:color="{colorAttr or 'auto'}"/>`; style must match `^[A-Za-z]+$` else `single`; omitted entirely if no side. |
| 8 | `<w:shd w:val="clear" w:color="auto" w:fill="{colorAttr(shading)}"/>` | `para.shading` non-empty string |
| 9 | `<w:tabs>` of `<w:tab w:val="{tabType(type)}" w:pos="{int pos}"/>` | `para.tabs` non-empty; tabs without `pos` skipped |
| 10 | `<w:spacing …/>` attribute order: `w:before`, `w:after`, `w:line`+`w:lineRule` | before/after present → `max(0,int)`; `line` present and non-null → `w:line="{max(1,int)}" w:lineRule="{auto|exact|atLeast}"` where lineRule = `para.lineRule` if exact/atLeast else `auto`. Element omitted if no attribute. |
| 11 | `<w:ind …/>` attribute order `w:left`, `w:right`, then `w:hanging` or `w:firstLine` | left/right present → int (may be negative); `first` present: `<0` → `w:hanging="{abs}"`, else `w:firstLine="{first}"` (0 writes `w:firstLine="0"`) |
| 12 | `w:contextualSpacing` | key present → onOff |
| 13 | `<w:jc w:val="{alignToJc(align)}"/>` | `align` set (non-null) |
| 14 | `<w:outlineLvl w:val="{clamp(0..9)}"/>` | `outlineLvl` set (non-null) |

Test T1:278 exact string: `<w:pPr><w:pStyle w:val="Normal"/><w:spacing w:after="200"/><w:ind w:firstLine="709"/><w:jc w:val="both"/></w:pPr>` for `para:{align:'justify', first:709, after:200}`.
Section break paragraph: `<w:p><w:pPr><w:sectPr>…</w:sectPr></w:pPr></w:p>` (no pStyle).

### 3.5 `w:rPr` — model `char` → XML, in **EG_RPrBase order** (W:561-613)

| # | Element | Condition / value |
|---|---|---|
| 1 | `<w:rStyle w:val="Hyperlink"/>` | only while writing document.xml, `trim(char.link)` non-empty AND (`color` absent OR `color=='auto'`); also sets flag `usaHyperlink` |
| 2 | `<w:rFonts w:ascii="F" w:hAnsi="F"/>` | `font` set and non-blank (no eastAsia/cs) |
| 3 | `w:b` | key `bold` present → onOff |
| 4 | `w:i` | key `italic` present → onOff |
| 5 | `w:caps` | key `allCaps` present |
| 6 | `w:smallCaps` | key `smallCaps` present |
| 7 | `w:strike` | key `strike` present |
| 8 | `<w:color w:val="{colorAttr(color)}"/>` | `color` set non-null (unparsable → `auto`) |
| 9 | `<w:spacing w:val="{int}"/>` | `spacing` truthy (0 / null omitted) |
| 10-11 | `<w:sz w:val="H"/><w:szCs w:val="H"/>` | `size` numeric; H = clamp(round(size*2), 2, 3276) |
| 12 | `<w:highlight w:val="{hexToHighlight}"/>` | key `highlight` present; null → `none` |
| 13 | `<w:u w:val="{normUnderline}"/>` | `underline` set non-null |
| 14 | `<w:vertAlign w:val="…"/>` | key `sup` or `sub` present: `superscript` if sup truthy, else `subscript` if sub truthy, else `baseline` |

`char.link`, `char.ins`, `char.del`, `char.effect` (WordArt), `char.comment…` are **not** written. **BUG (fix recommended):** a link run with explicit `color:'auto'` gets both `rStyle Hyperlink` and `<w:color w:val="auto"/>`; the direct auto color overrides the style's blue. **BUG (fix recommended):** runs with `char.del` (tracked deletion) are exported as ordinary visible text and `char.ins` as ordinary text — the file header comment (W:26) claims `w:ins`/`w:del` support but the code has none. Recommended fix: wrap in `<w:ins w:id w:author w:date>` / `<w:del …>` with `w:delText`.

Test T1:283: `<w:rPr><w:i/><w:color w:val="C00000"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>` for `{italic:true, color:'#C00000', size:14}`; bold → `<w:rPr><w:b/></w:rPr>`.

### 3.6 Runs (W:616-662)

| model run | XML |
|---|---|
| `{t:'text', text}` | `<w:r>{rPr}<w:t{pres}>{esc(sanitize(text))}</w:t></w:r>`; `pres=' xml:space="preserve"'` only if text is empty or differs from its trimmed form (leading/trailing whitespace). `Col1` → `<w:t>Col1</w:t>` |
| `{t:'tab'}` | `<w:r>{rPr}<w:tab/></w:r>` |
| `{t:'break', type}` | `page` → `<w:br w:type="page"/>`; `column` → `<w:br w:type="column"/>`; else `<w:br/>`; wrapped in `<w:r>{rPr}…</w:r>` |
| `{t:'field'}` | §3.7 |
| `{t:'image'}` | §3.8 |
| `{t:'math'}` | §3.9 |
| anything else | nothing |

Hyperlink wrapper (W:419-436): if inner XML empty → ''. If not writing document.xml (bands, notes) → the inner runs only (link lost, no rStyle). If url starts with `#`: anchor = rest; empty anchor → plain runs; else `<w:hyperlink w:anchor="{esc(anchor)}">…</w:hyperlink>`. Otherwise new external rel → `<w:hyperlink r:id="rIdN">…</w:hyperlink>`. After the whole document, if any link was written and the model has no style with id `Hyperlink`, styles.xml gets the Hyperlink character style (§4).

### 3.7 Fields → `w:fldSimple` (W:669-694)

```
code = trim(run.code); result = sanitize(run.result)
textRun = '<w:r>'+rPr+'<w:t xml:space="preserve">'+esc(result)+'</w:t></w:r>'     // always preserve
if code == '': return textRun
if code matches /^NOTEREF\s+(\S+)/i:
     n = noteNumbers[$1]       // map fn.id → footnote xml id (§7)
     if found: return '<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="'+n+'"/></w:r>'   // run char ignored
     else: return textRun
if code matches /^(PAGE|NUMPAGES|DATE|TIME|PAGEREF|REF|MERGEFIELD|TOC)\b/i:
     return '<w:fldSimple w:instr="'+esc(code)+'">'+textRun+'</w:fldSimple>'
return textRun            // unknown codes degrade to their cached result text
```
Note `SECTIONPAGES`, `SEQ`, `HYPERLINK` etc. are exported as plain text. `TOC` is exported as fldSimple (the Reader does not keep TOC as a field — asymmetry). No `fldChar` complex fields are ever written. Tests: `<w:fldSimple w:instr="PAGE">`, `<w:fldSimple w:instr="NUMPAGES">` in footer1.xml (T2:240-241).

### 3.8 Images → `w:drawing` (W:701-798)

Media resolution `mediaRelId(rid)`:
1. rid '' → none. Cached per rid.
2. `info = doc.media[rid]`; `file = info.file` → `basename` (accepts `media/<name>` or `<name>`); if no info or empty file → use **rid itself** as the file name (legacy documents whose `media` map was lost; T2:396-417).
3. Abort (image omitted silently, no `w:drawing` at all) if mediaDir empty, file name not matching `^[a-f0-9]{16}\.(png|jpe?g|gif|webp|bmp)$` (case-insensitive), or file missing on disk.
4. Register Default content type for the extension; add binary `word/media/<file>`; add rel `image` → `media/<file>`.

In the C++ app "mediaDir" is the document's media store; the 16-hex naming rule is a security constraint (no path traversal) and must be kept for files coming from the store.

Geometry: `cx = max(1, w??1440)*635`, `cy = max(1, h??1440)*635` (1440 twips → 914400 EMU, T2:340). `id = abs(crc32(rid)) % 100000 + 1` (**QUIRK**: the same image used twice yields duplicate `docPr` ids; Word tolerates it but a unique counter is safer). `name = esc(alt ?? 'Imagen')`.

Shared graphic:
```
<a:graphic xmlns:a="…/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
 <pic:pic xmlns:pic="…/drawingml/2006/picture">
  <pic:nvPicPr><pic:cNvPr id="{id}" name="{name}"/><pic:cNvPicPr/></pic:nvPicPr>
  <pic:blipFill><a:blip r:embed="{relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
  <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
 </pic:pic></a:graphicData></a:graphic>
docPr = <wp:docPr id="{id}" name="{name}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="…" noChangeAspect="1"/></wp:cNvGraphicFramePr>
```
Inline (`wrap` absent/'inline'/''):
```
<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx cy/><wp:effectExtent l="0" t="0" r="0" b="0"/>{docPr}{graphic}</wp:inline>
```
Floating (any other wrap) — child order is schema-mandated (simplePos, positionH, positionV, extent, effectExtent, wrap*, docPr, cNvGraphicFramePr, graphic):
```
<wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="2" behindDoc="{1 if wrap=='behind' else 0}"
           locked="0" layoutInCell="1" allowOverlap="1">
 <wp:simplePos x="0" y="0"/>
 <wp:positionH relativeFrom="column"><wp:align>{right|center|left}</wp:align></wp:positionH>
 <wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>
 <wp:extent …/><wp:effectExtent l="0" t="0" r="0" b="0"/>
 {wrap: topAndBottom → <wp:wrapTopAndBottom/>; behind|front → <wp:wrapNone/>; else (square, tight…) → <wp:wrapSquare wrapText="bothSides"/>}
 {docPr}{graphic}
</wp:anchor>
```
`align` from `run.align` (`right`, `center`, else `left`). Wrapper: `<w:r>{rPr}<w:drawing>…</w:drawing></w:r>`. Description (`descr`) is not written; only `name`.

**BUG (fix recommended):** images inside header/footer/footnote paragraphs register their relationship in `document.xml.rels`, but the part referencing them (`headerN.xml`, `footnotes.xml`) has no `.rels` of its own → dangling `r:embed`. A correct writer must emit `word/_rels/headerN.xml.rels` (and footnotes rels) for images and hyperlinks used there.

### 3.9 Equations (W:641-657, 814-937)
If `run.ast` is a non-empty object, produce OMML; `<m:oMath>…</m:oMath>` is emitted **as a direct child of `w:p`** (not inside `w:r`), and the run's char formatting is dropped. If the AST produces nothing, or there is no AST: degrade to `<w:r>{rPr}<w:t xml:space="preserve">{esc(alt ?? src)}</w:t></w:r>` (empty → nothing). T2:442 expects `π r²` text for `{src:'pi r^2', alt:'π r²'}` without AST and no `<m:oMath>`.

AST → OMML (`ommlNode`):

| AST node | OMML |
|---|---|
| `seq{items}` | concatenation of items |
| `num`, `sym`, `op` `{text}` | `<m:r><m:t xml:space="preserve">{esc(text)}</m:t></m:r>` (empty text → '') |
| `func{text}` | `<m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t xml:space="preserve">…</m:t></m:r>` (upright) |
| `group{items}` | `<m:d><m:e>{seq(items)}</m:e></m:d>` (default parentheses) |
| `frac{num,den}` | `<m:f><m:num>{num}</m:num><m:den>{den}</m:den></m:f>` |
| `sqrt{arg}` | `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>{arg}</m:e></m:rad>` |
| `sup{base,exp}` | try n-ary (below); else `<m:sSup><m:e>{base}</m:e><m:sup>{exp}</m:sup></m:sSup>` |
| `sub{base,sub}` | try n-ary; else `<m:sSub><m:e>{base}</m:e><m:sub>{sub}</m:sub></m:sSub>` |
| other | '' |

N-ary detection (`ommlNary`, W:892-937): unwrap up to two levels of sup/sub (each at most once) collecting `upper` (sup.exp) and `lower` (sub.sub); the innermost base `cur`:
- `cur.t=='func' && cur.text=='lim' && lower && !upper` → `<m:limLow><m:e>{func run 'lim'}</m:e><m:lim>{lower}</m:lim></m:limLow>`.
- `cur.t=='sym'` and text in {`∑`:undOvr, `∏`:undOvr, `⋂`:undOvr, `⋃`:undOvr, `∫`:subSup} and at least one limit → `<m:nary><m:naryPr><m:chr m:val="{chr}"/><m:limLoc m:val="{undOvr|subSup}"/>{<m:subHide m:val="1"/> if no lower}{<m:supHide m:val="1"/> if no upper}</m:naryPr><m:sub>{lower or ''}</m:sub><m:sup>{upper or ''}</m:sup><m:e/></m:nary>` (CT_NaryPr order chr → limLoc → subHide → supHide; **QUIRK:** the operand `m:e` is always empty — the summand follows as sibling content).
- else not n-ary.

### 3.10 SmartArt fallback (W:943-966)
Depth-first over `items` (each `{text, children}`): for each item with non-empty trimmed text emit
`<w:p><w:pPr><w:ind w:left="{720 + level*360}" w:hanging="360"/></w:pPr><w:r><w:t xml:space="preserve">{esc('• ' + sanitize(text))}</w:t></w:r></w:p>`, then recurse into children with level+1 (children of an empty-text item are still visited). Test T2:462-472: root `w:left="720"`, child `w:left="1080"`, text `• Dirección` / `• Ventas`. WordArt runs export as ordinary text with font/size/color (effects lost).

### 3.11 Tables `w:tbl` (W:980-1116)

Cell paragraphs are collected from the **whole body** by `cell.tableId == table.id`, keyed `row|col`, in body order.

```
total = Σ max(1, cols[k])
borderColor = colorAttr(props.borderColor) if set else 'auto'; if 'auto' → 'A6A6A6'
mode = props.borders ?? 'grid'
tblBorders = for side in [top,left,bottom,right,insideH,insideV]:
     hidden = mode=='none' or (mode=='horizontal' and side in [left,right,insideV])
     <w:{side} w:val="{none|single}" w:sz="4" w:space="0" w:color="{borderColor}"/>
jc = align center/right → <w:jc w:val="center|right"/> else nothing
layout = props.fixedLayout → <w:tblLayout w:type="fixed"/>
cellMar = props.cellMargins → <w:tblCellMar>{for side in top,left,bottom,right if numeric: <w:{side} w:w="{max(0,v)}" w:type="dxa"/>}</w:tblCellMar>
<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="{total or 0}" w:type="{dxa if total>0 else auto}"/>{jc}{tblBorders}{layout}{cellMar}</w:tblPr>
<w:tblGrid>{<w:gridCol w:w="{max(1,w)}"/> per col}</w:tblGrid>
for r, row in rows:
   trPr = (repeatHeader && r==0 ? '<w:tblHeader/>' : '') + (row.height>0 ? '<w:trHeight w:val="{height}"/>' : '')
   <w:tr>{trPr non-empty ? <w:trPr>trPr</w:trPr>}
   for c, cell in row.cells:
       span = max(1, cell.gridSpan ?? 1); vMerge = cell.vMerge ?? ''
       if cell.merged and vMerge != 'continue': continue        // horizontally absorbed placeholder
       width = Σ max(1, cols[k]) for k in c .. c+span-1 (k < cols.length)
       tcPr = <w:tcW w:w="{width or 0}" w:type="{dxa|auto}"/>
              + (span>1 ? <w:gridSpan w:val="{span}"/>)
              + (vMerge=='restart' ? <w:vMerge w:val="restart"/> : vMerge=='continue' ? <w:vMerge/>)
              + (cell.shading ? <w:shd w:val="clear" w:color="auto" w:fill="{colorAttr}"/>)
              + (cell.vAlign && vAlign!='top' ? <w:vAlign w:val="{esc(vAlign)}"/>)
       content = paragraphXml(p) for each p at key r|c; empty → '<w:p/>'   // a cell may not be empty
       <w:tc><w:tcPr>{tcPr}</w:tcPr>{content}</w:tc>
   </w:tr>
</w:tbl>
```
Order constraints honoured: CT_TblPr (tblStyle → tblW → jc → tblBorders → tblLayout → tblCellMar); CT_TcPr (tcW → gridSpan → vMerge → shd → vAlign).

**QUIRK:** `TableGrid` is referenced but never defined in styles.xml (Word accepts it). **QUIRK:** the default border color `A6A6A6` comes back on import as `borderColor:'#A6A6A6'` (round-trip adds the key).

Paragraph after table (W:1106-1116): scan forward from the table for the next block that is not `hf`/`cell`/`fn`; if it is `t=='p'` nothing is added; otherwise (another table, smartart, or end of body) append `<w:p/>`. (OOXML requires a paragraph between consecutive tables and before the final sectPr; Skriba avoids adding one when a paragraph already follows so the round-trip does not grow.)

---

## 4. EXPORT — `word/styles.xml` (W:1371-1435)

```
<w:styles xmlns:w="…main">
 <w:docDefaults>
  <w:rPrDefault>{rPrXml(Normal.char)}</w:rPrDefault>          // may be '<w:rPrDefault></w:rPrDefault>' if empty
  <w:pPrDefault>{pPrXml('', Normal.para)}</w:pPrDefault>
 </w:docDefaults>
 <w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/>
   <w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>
 {styleXml(s) for every model style, in model order}
 {if a hyperlink was written and no model style has id 'Hyperlink':
  <w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/>
   <w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>}
</w:styles>
```
Note the docDefaults are generated from the model's Normal style (so Normal's full formatting is both default and the Normal style itself). With `defaultNormalStyle()` the rPrDefault is: `<w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:b w:val="0"/><w:i w:val="0"/><w:caps w:val="0"/><w:smallCaps w:val="0"/><w:strike w:val="0"/><w:color w:val="auto"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:highlight w:val="none"/><w:u w:val="none"/><w:vertAlign w:val="baseline"/>` and the pPrDefault: keepNext=0, widowControl, spacing before 0 after 160 line 276 auto, ind left 0 right 0 firstLine 0, jc left (numbering/outlineLvl null and empty tabs are skipped).

`styleXml(s)` (W:1406-1435): skip if id empty, in STYLE_SKIP, or type not `paragraph`/`character` (table/numbering styles are not exported). CT_Style order: 
```
<w:style w:type="{type}"{ w:default="1" if styleId=='Normal'} w:styleId="{styleId(id)}">
 <w:name w:val="{styleName(id, name)}"/>
 {not Normal and basedOn → <w:basedOn w:val="{styleId(basedOn)}"/>}
 {next → <w:next w:val="{styleId(next)}"/>}
 <w:qFormat/>
 {type=='paragraph' → pPrXml('', para)}
 rPrXml(char)
</w:style>
```
(`uiPriority` is not written for model styles despite the comment.) Test T1:316: `<w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>`.

---

## 5. EXPORT — `word/numbering.xml` (W:1125-1208)

1. Skip entirely if `doc.numbering` empty, or no body block has `para.numbering.listId` (T2:123-129: no numbering.xml if unused).
2. For each model definition **in model order** whose `id` is used: `numId = ++i` (1-based); `numIds[listId]=numId`; emit
   `<w:abstractNum w:abstractNumId="{numId}"><w:multiLevelType w:val="hybridMultilevel"/>{9 × levelXml}</w:abstractNum>` and `<w:num w:numId="{numId}"><w:abstractNumId w:val="{numId}"/></w:num>`.
3. Part: `<w:numbering xmlns:w=…>{all abstractNums}{all nums}</w:numbering>` (all abstractNum before any num — schema requirement). Rel `numbering`.

`levelXml(n, lvl, listType)`:
```
isBullet = lvl.fmt=='bullet' or (lvl.fmt absent and (listType=='bullet' or lvl.char set))
ind = lvl.ind ?? 720*(n+1); hanging = lvl.hanging ?? 360
bullet:   <w:lvl w:ilvl="n"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="{esc(char ?? '•')}"/><w:lvlJc w:val="left"/>
          <w:pPr><w:ind w:left="{ind}" w:hanging="{hanging}"/></w:pPr>
          <w:rPr><w:rFonts w:ascii="{font ?? 'Symbol'}" w:hAnsi="{same}" w:hint="default"/></w:rPr></w:lvl>
numbered: fmt = numFmt(lvl.fmt ?? listType); text = lvl.lvlText ?? ('%' + (n+1) + (lvl.sep ?? '.'))
          <w:lvl w:ilvl="n"><w:start w:val="1"/><w:numFmt w:val="{fmt}"/><w:lvlText w:val="{esc(text)}"/><w:lvlJc w:val="left"/>
          <w:pPr><w:ind w:left="{ind}" w:hanging="{hanging}"/></w:pPr></w:lvl>
```
Missing level objects → `{}` (defaults). **QUIRK:** default bullet font is `Symbol` while the char is Unicode `•` (U+2022); Word renders it, but a cleaner export would use the PUA char U+F0B7 with Symbol or a text font. Start values / restart / per-paragraph `startOverride` are not supported (always 1).

---

## 6. EXPORT — headers and footers (W:1219-1251, 1336-1347)

1. Group all body blocks having `hf` by key `sec|kind|variant` (kind = `footer` if `hf.kind=='footer'` else `header`; variant ∈ {default, first, even} else `default`; `sec` = block.sec or ''), groups ordered by first appearance.
2. A single counter `i` over **all** groups names files `{kind}{i}.xml` → e.g. header1.xml, footer2.xml (T2:213-214).
3. Part: `<w:hdr xmlns:w xmlns:r xmlns:m>{paragraphXml(p)…}</w:hdr>` (`w:ftr` for footers). Hyperlinks inside become plain runs (no rels). Rel type `header`/`footer`.
4. In `sectPrXml(sec)`, reference every band group whose `sec == sec.id` **or whose sec is ''**: `<w:headerReference w:type="{first|even|default}" r:id="rIdN"/>` / `<w:footerReference …/>`, in group order. Sections without own bands get no reference (Word then inherits the previous section's — matches `linkToPrevious:true`).
5. An empty band group cannot occur (groups exist only with ≥1 paragraph). **Validation note:** `w:hdr` with zero paragraphs is invalid in Word; never emit one.

---

## 7. EXPORT — footnotes (W:1256-1299, 669-688)

1. Collect body blocks with `fn` in body order. None → no part.
2. Prefix with the mandatory separators:
   `<w:footnote w:type="separator" w:id="0"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="1"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>`
3. Each note gets xml id `n = 2, 3, …`; `notes[fn.id] = n`.
4. Drop the first run if it is `{t:'text', char.sup truthy}` (the visible "N " number the model stores for on-screen painting).
5. `paragraphXml(note)` then insert, right after `<w:p>` and its optional `<w:pPr>…</w:pPr>`, the run `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteRef/></w:r>` (done in PHP via regex; in C++ do it structurally).
6. `<w:footnote w:id="{n}">{p}</w:footnote>`; part `<w:footnotes xmlns:w xmlns:r xmlns:m>…</w:footnotes>`; rel `footnotes`.
7. Body references: field runs with code `NOTEREF <fn.id>` (§3.7) → `<w:footnoteReference w:id="n"/>`.

**QUIRK/BUG:** `fn.kind=='endnote'` blocks are also written into footnotes.xml (endnotes become footnotes on export). `fn.number` is ignored (Word numbers automatically). The Reader turns them back into ids `fn2, fn3…` (§9.8), so `fn.id` values change on round-trip. Each note is exported as a single paragraph block (the Reader merges multi-paragraph notes into one block with line breaks).

---

## 8. EXPORT — `w:sectPr` (W:1302-1367)

```
w = max(1, page.w ?? 11906); h = max(1, page.h ?? 16838); orient = page.orient=='landscape' ? ' w:orient="landscape"' : ''
top/right/bottom/left = int(margins.* ?? 1440)     // not clamped
hdr = max(0, headerDist ?? 720); ftr = max(0, footerDist ?? 720)
n = max(1, columns.count ?? 1); sp = max(0, columns.spacing ?? 708); widths = columns.widths ?? []
unequal = (widths.length == n and n > 1)
colAttr = (n>1 ? ' w:num="n"' : '') + ' w:space="sp"' + (n>1 ? ' w:equalWidth="{0 if unequal else 1}"' : '') + (columns.sep ? ' w:sep="1"' : '')
cols = unequal ? '<w:cols'+colAttr+'>' + for k: '<w:col w:w="{max(1,w)}"' + (k<n-1 ? ' w:space="sp"' : '') + '/>' + '</w:cols>'
               : '<w:cols'+colAttr+'/>'
type = start=='continuous' → <w:type w:val="continuous"/>; 'evenPage'/'oddPage' → <w:type w:val="…"/>; else none (nextPage default)
<w:sectPr>{header/footer refs}{type}<w:pgSz w:w w:h{orient}/>
 <w:pgMar w:top w:right w:bottom w:left w:header w:footer w:gutter="0"/>{cols}{differentFirst ? <w:titlePg/>}<w:docGrid w:linePitch="360"/></w:sectPr>
```
CT_SectPr order: headerReference/footerReference → type → pgSz → pgMar → cols → titlePg → docGrid. Not written: `pgBorders` (doc.pageBorder), `w:background` (doc.pageColor), watermark, `lnNumType`, `pgNumType`, hyphenation. Tests: `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` (T1:303), `w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"` (T1:304), two sections → two `<w:sectPr>` (T2:288), unequal cols `w:equalWidth="0"`, `<w:col w:w="3000"`, `w:sep="1"` (T2:298-300), `w:val="continuous"` (T2:311), `<w:titlePg/>` + `w:type="first"` (T2:252-253).

---

## 9. IMPORT — `Reader::read(path, mediaDir='')` → model + `_warnings`

### 9.1 Package validation and part loading order (R:179-278)

```
if file missing:            throw 'Archivo no encontrado: ' + basename(path)
if not a ZIP:               throw 'El archivo no es un ZIP válido (.docx)'
theme = defaultTheme()
ct = '[Content_Types].xml'; if absent or not containing substring 'wordprocessingml':
     throw 'El archivo no es un documento de Word (.docx): falta [Content_Types].xml de WordprocessingML'
raw = 'word/document.xml'; absent → throw 'El archivo no es un documento de Word (.docx): falta word/document.xml'
dom = safeLoad(raw); null → throw 'word/document.xml no es XML válido o fue rechazado por seguridad'
warnDiscardedParts(zip)            // §9.17
rels = relsOf('word/document.xml'); currentPart = 'word/document.xml'
readTheme()                        // §9.13
styles = word/styles.xml loaded? readStyles(dom) : (warn 'word/styles.xml ilegible: se usan los estilos por defecto' if the entry exists; readStyles(null))
numbering.xml loaded? readNumbering(dom)
readSettings()                     // evenAndOddHeaders
indexNotes()                       // footnotes.xml, endnotes.xml
readComments()                     // comments.xml
core = docProps/core.xml → {name: dc:title, createdAt: dcterms:created, modifiedAt: dcterms:modified} (trimmed non-empty text)
body = readBody(dom)               // §9.2; must contain w:body else throw 'word/document.xml no contiene <w:body>'
name = core.name if non-blank else basename(path)
doc = normalizeDocument({version:1, app:'Skriba-word', locale:'es-ES', name, createdAt:isoDate(core.created), modifiedAt:isoDate(core.modified),
                          theme, styles, numbering: values(registeredLists), sections, body: bodyBlocks ++ bands ++ notes,
                          media, comments: buildComments()})
if bookmarks non-empty: doc.bookmarks = bookmarks
if pageColor: doc.pageColor; if pageBorder: doc.pageBorder
doc._warnings = warnings
```
Body array order: **main flow blocks (tables followed by their cell paragraphs, text-box paragraphs after their anchor) → all header/footer blocks → all footnote/endnote blocks.**

### 9.2 Safe XML loading (R:3017-3032) and tolerant attributes (R:3135-3147)
- Reject (return null + warning `"La parte {part} declara DOCTYPE/ENTITY (posible XXE): rechazada"`) any part whose raw bytes contain `<!DOCTYPE` or `<!ENTITY` (case-insensitive substring). No network, no external entity resolution, no entity substitution, no recovery mode. A rejected/invalid part behaves as missing. Tests T1:499-561: a document.xml with billion-laughs DOCTYPE must throw a RuntimeException without memory blow-up (<8 MB growth); a malicious styles.xml is ignored, body still read (4 blocks), only 1 style (Normal) remains, and a warning containing `DOCTYPE` is present.
- `wattr(el, name)`: namespaced `w:` attribute; else literal attribute `w:name`; else unprefixed `name`; else null.
- `hijos(n)`: element children only. All element matching is by namespace URI + localName.
- Hard limits: `MAX_PARRAFOS = 100000` block count per container walk, `MAX_MEDIOS = 500` images, `MAX_MEDIA_BYTES = 10 MiB` per image.

### 9.3 Relationships (R:2963-3008)
`relsOf(part)` reads `{dir}/_rels/{basename}.rels`; returns `rId → {type: last path segment of Type (e.g. 'image','hyperlink','header','theme'), target, mode: TargetMode or null}`. `resolvePart(from, target)`: backslashes → `/`; absolute (`/…`) → strip leading `/`; else resolve relative to `dirname(from)` handling `..` and `.`.

### 9.4 Block walk (R:283-416)

`readBody`: find `w:body` among root children; a `w:background` sibling with `w:color` (normColor, not `auto`) sets `doc.pageColor`. Walk body children with `walkBlocks(container, out, &sectPr, cellMark=null)`:

| child | action |
|---|---|
| `mc:AlternateContent` | recurse into preferred branch (first `mc:Choice`, else `mc:Fallback`) |
| other non-w element | warn `Elemento <{nodeName}> no soportado: ignorado` |
| `w:p` | if out.length ≥ 100000 → warn `Documento truncado: supera 100000 párrafos` and stop; else addParagraph |
| `w:tbl` | readTable (§9.10) |
| `w:sectPr` | remember as the final sectPr |
| `w:sdt` | recurse into `w:sdtContent` |
| bookmarkStart/End, proofErr, permStart/End, commentRangeStart/End, customXml, moveFrom/ToRangeStart/End, tcPr, tblPrEx | silently ignored (body-level bookmarks are lost) |
| `w:altChunk` | warn `Contenido externo incrustado (altChunk) descartado` |
| other w:* | warn `Bloque <w:{local}> no soportado: ignorado` |

After the walk, the final section is pushed: `sections.push(readSectPr(finalSectPr, currentSecId))`.

`addParagraph(p, out, cell)` (R:390-416):
```
b = readParagraph(p); closes = b._sectPr; delete b._sectPr
if cell: b.cell = cell
onlyMark = closes != null and b.runs == [] and b has no 'para'
if not onlyMark: out.push(b)                 // empty section-break carrier paragraphs are dropped
for extra in deferred (text-box paragraphs): extra.cell = cell if cell; out.push(extra)
deferred = []
if closes: sections.push(readSectPr(closes, secId)); nSec++; secId = 'sec' + (nSec+1)
```
Section ids are `sec1, sec2, …`; every block gets `sec` = the section open when it was read. Test T3:590-606.

### 9.5 Paragraph (R:418-487)
```
id = 'b' + (++blockCounter)        // shared counter for paragraphs AND tables; see §9.18
block = {t:'p', id, sec: secId, style:'Normal', runs:[]}
field = null
for child c of w:p:
   non-w → readRunContainer(c)
   pPr → [style, para, sectPr] = readPPr(c); style non-empty → block.style; sectPr → block._sectPr
   bookmarkStart → name = w:name; if name != '' and name[0] != '_' (hidden: _GoBack, _Toc…):
                    bookmarks.push({name, blockId:id, offset: linearLength(runs so far)})
   commentRangeStart → ranges[id_c] = {blockId:id, start: linearLength(runs), end:null}
   commentRangeEnd → if range exists: end = (range.blockId == id) ? linearLength(runs) : -1   // cross-paragraph → clipped later
   other → readRunContainer(c)
closeOpenField(runs)               // §9.7
if para non-empty: block.para = para
lengths[id] = linearLength(runs)
```
Paragraphs without pPr overrides have **no `para` key** (T1:421, T3:357). `style` is the mapped style id (§9.12).

### 9.6 `w:pPr` → `para` (R:493-663) — also used for docDefaults pPr and style pPr

| OOXML | model | notes |
|---|---|---|
| `pStyle@val` | style | via style id map (§9.12) |
| `jc@val` | `align` | jcToAlign; unmappable → no key |
| `spacing@before`, `@after` | `before`, `after` | numeric only, `max(0,int)` |
| `spacing@line` (+`lineRule`, default `auto`) | `line` (+`lineRule`) | `line = max(1, abs(int))`; `lineRule` key set only for `exact`/`atLeast`. `beforeLines`, `beforeAutospacing` etc. ignored |
| `ind@left` or `@start`, `@right` or `@end` | `left`, `right` | int, not clamped |
| `ind@hanging` / `@firstLine` | `first` | hanging wins: `first = -abs(hanging)`; else `first = firstLine` |
| `keepNext`, `keepLines`, `pageBreakBefore`, `widowControl`, `contextualSpacing` | same names | parseOnOff (present without val → true) |
| `outlineLvl@val` | `outlineLvl` | int |
| `tabs/tab@pos,@val` | `tabs:[{pos, type}]` | pos numeric required; type via tabType (clear tabs kept as `clear`); key only if ≥1 |
| `numPr` | `numbering` | §9.11; `{listId, level}`, or **null** for numId 0, or no key if unreadable |
| `pBdr` (top,left,bottom,right only) | `borders:{side:{style, sz, space, color}}` | style = `w:val` (missing/'' → `single`; `none`/`nil` kept as-is), sz default 4, space default 0, color normColor or `'auto'`; key only if ≥1 side |
| `shd@fill` | `shading` `'#RRGGBB'` | `auto`/invalid → none |
| `sectPr` | (section break) | returned separately |
| rPr, pStyleId, framePr, suppressLineNumbers, suppressAutoHyphens, kinsoku, wordWrap, overflowPunct, topLinePunct, autoSpaceDE, autoSpaceDN, bidi, adjustRightInd, snapToGrid, mirrorIndents, suppressOverlap, textDirection, textAlignment, textboxTightWrap, divId, cnfStyle, pPrChange | — | silently ignored |
| anything else | — | warn `Propiedad de párrafo <w:{local}> no soportada: ignorada` |

**List indent inheritance** (R:655-661): if the pPr has no `w:ind` and `para.numbering` is an object, then `left = level.ind ?? 720` and `first = -abs(level.hanging ?? 360)` of that list level. Test T3:349-355: no ind → left 720/first -360 (level 0), left 1440 (level 1); explicit `<w:ind w:left="1000" w:hanging="200"/>` wins → 1000/-200.

### 9.7 Runs and run containers (R:723-1135)

`readRunContainer(el, runs)`:

| element | action |
|---|---|
| `m:oMath`, `m:oMathPara` | math run (§9.15); other `m:*` except `m:oMathParaPr` → warn `Elemento matemático <{nodeName}> fuera de una ecuación: ignorado` |
| `mc:AlternateContent` | recurse preferred branch children |
| other non-w | warn `Elemento <{nodeName}> no soportado: ignorado` |
| `w:r` | readRun |
| `w:hyperlink` | url = r:id → rels[rId].target (any rel type, external or not) else `#`+`w:anchor` else ''; read children into temp; emit `withLink(temp, url)` |
| `w:ins`, `w:moveTo`, `w:smartTag`, `w:customXml`, `w:bdo`, `w:dir` | transparent: recurse (tracked insertions are **accepted**) |
| `w:sdt` | recurse into `w:sdtContent` children |
| `w:del`, `w:moveFrom` | dropped; warn `Texto eliminado con control de cambios descartado (se importa el documento como aceptado)` |
| `w:fldSimple` | instr = trim(@instr); children into temp; `emitField(instr, temp)` |
| bookmarkStart/End, proofErr, permStart/End, commentRangeStart/End, move*Range*, subDoc, pPr | silent (note: bookmarks nested in hyperlinks etc. are lost) |
| other w:* | warn `Elemento <w:{local}> no soportado: ignorado` |

`withLink(runs, url)`: url '' → unchanged; for every `text` run, `char = char ∪ {link:url}` with the run's existing keys winning (an inner link is kept). Non-text runs (images, fields) do not get the link.

`readRun(w:r)` (R:821-967): iterate children, collecting `new` runs and the run's `char`:

| child | produces |
|---|---|
| `mc:AlternateContent` | only `w:drawing` children of the preferred branch are read |
| non-w | warn `Elemento <{nodeName}> dentro de un run: ignorado` |
| `rPr` | `[char, hidden] = readRPr(c, flattenRStyle=true)` |
| `t` | skipped if a complex field is in its `instr` phase; else `{t:'text', text: sanitize(textContent)}` |
| `tab`, `ptab` | `{t:'tab'}` |
| `br` | `{t:'break', type: page|column|line}` (`textWrapping` and others → line) |
| `cr` | `{t:'break', type:'line'}` |
| `noBreakHyphen` | text `U+2011` |
| `sym@font,@char` | text from symbol mapping (§9.11.3); empty → nothing |
| softHyphen, lastRenderedPageBreak, rtl, annotationRef, footnoteRef, endnoteRef, separator, continuationSeparator, dayShort, monthShort, yearShort, dayLong, monthLong, yearLong, pgNum | nothing |
| `drawing` | §9.14 |
| `pict`, `object` | VML §9.14 |
| `fldChar@fldCharType` | field state machine (below), using the current `char` |
| `instrText` | appended to field instr if phase `instr` and depth 0 |
| delText, delInstrText | nothing |
| footnoteReference / endnoteReference | §9.8 |
| commentReference | if no range exists for that id: register `{blockId:null, …}` → the comment is later **dropped** with warning (QUIRK: the doc says "anchored at the mark", code drops it) |
| ruby | warn `Texto con guía fonética (ruby) importado sin la guía`; read `w:rubyBase` content |
| other | warn `Contenido de run <w:{local}> no soportado: ignorado` |

After the loop: if `hidden` (vanish/webHidden) → if any run was produced warn `Texto oculto descartado`; drop all. Else for each new run of type `text|field|image|math`, `run.char = run.char ∪ char` (run's own keys win; tab/break never get char), then `emitRuns(new)`.
**QUIRK (ordering):** fldChar is processed immediately while `t`/`tab` children of the same `w:r` are emitted at the end of the run, so `<w:r><w:t>a</w:t><w:fldChar begin/></w:r>` would swallow `a` into the field. Word never produces this; keep or fix.

`emitRuns(new, runs)`: if a complex field is open → in `result` phase append to field.runs, in `instr` phase discard; else append to the paragraph.

`readRPr(rPr, flatten)` → `[char ∪ styleBase, hidden]` (R:973-1118):

| OOXML | model `char` |
|---|---|
| `rFonts` | `font` = @ascii ?? @hAnsi ?? @cs; if blank → theme font of @asciiTheme ?? @hAnsiTheme (`major*` → theme.majorFont, else minorFont) |
| `b`, `i`, `caps`→`allCaps`, `smallCaps`, `strike` | parseOnOff |
| `dstrike` (on) | `strike:true` + warn `Tachado doble degradado a tachado simple` |
| `color` | normColor(@val); if null or `auto` and @themeColor resolves → theme color `#RRGGBB`; set if non-null (so `auto` is kept as `'auto'`). themeTint/themeShade ignored |
| `spacing@val` | `spacing` int, only if ≠ 0 |
| `sz@val` | `size` = hp/2, only if > 0 |
| `highlight@val` | `highlight` = highlightToHex (none → **null**, key present) |
| `shd@fill` | `highlight` = fill, only if not auto and `highlight` not already set (in element order) |
| `u@val` | `underline` = normUnderline(val ?? 'single') |
| `vertAlign@val` | `sup = (val=='superscript')`, `sub = (val=='subscript')` — **both keys always set** |
| `vanish`, `webHidden` | hidden = parseOnOff |
| `rStyle` | only when flattening (body runs): `styleBase = charStyles[mapped id] ?? {}` |
| szCs, bCs, iCs, lang, noProof, kern, w, position, effect, em, outline, shadow, emboss, imprint, snapToGrid, specVanish, oMath, eastAsianLayout, fitText, cs, rtl, bdr, rPrChange, ins, del, moveFrom, moveTo | ignored |
| other | warn `Propiedad de carácter <w:{local}> no soportada: ignorada` |

Direct formatting wins over the character style: result = `char ∪ styleBase` with char's keys winning. Paragraph-style char formatting is NOT flattened into runs (the layout engine resolves style inheritance).

### 9.8 Fields (R:1140-1246)

Complex-field state machine on `fldChar`:
```
begin:    if field open: field.depth++ (nested field absorbed); else field = {phase:'instr', instr:'', runs:[], char: currentRunChar, depth:0}
separate: if field open and depth==0: phase = 'result'
end:      if no field: ignore (field began in another paragraph)
          if depth>0: depth--
          else: f = field; field = null; emitField(f.instr, f.runs, runs, f.char)
```
At paragraph end `closeOpenField`: if a field is still open → append its result runs (if any) as plain runs and warn `Campos que abarcan varios párrafos (índices, tablas de contenido…) importados como texto`. (So multi-paragraph TOCs keep their visible text; the later `end` is ignored.)

`emitField(instr, result, runs, char={})`:
```
code = trim(collapse whitespace(instr))
if code == '': emit result runs; return
if code starts with 'HYPERLINK' (case-insensitive): url = urlFromInstr(code); emit withLink(result, url); return
word = uppercase(first [A-Za-z]+ token, optional leading backslash)
if word in [PAGE, NUMPAGES, SECTIONPAGES, DATE, TIME, PAGEREF, REF, MERGEFIELD]:
     text = concat(text runs' text, tab runs → ' ') of result
     f = {t:'field', code, result:text}; c = result[0].char if object else char; if c non-empty: f.char = c
     emit [f]; return
emit result runs (if any); warn 'Campos ' + word + ' importados como texto (se conserva su último valor)'
```
Note: `code` keeps switches (e.g. `DATE \@ "dd/MM/yyyy"`, `PAGE \* MERGEFORMAT`) — only whitespace is collapsed and trimmed. Test T3:405-437: `" PAGE "` → code `PAGE`, result `7`, char bold (from the result run); fldSimple `" NUMPAGES "` → `NUMPAGES`/`12`; HYPERLINK → `char.link = 'https://ejemplo.org/x'`; `SEQ Figura` → text `3` and warning containing `SEQ`.

`urlFromInstr(code)`: `HYPERLINK\s+"([^"]*)"` → url; else `HYPERLINK\s+(\S+)` not starting with `\` → url; then if `\l\s+"([^"]*)"` non-empty → `url + '#' + anchor` (url may be '' → `#anchor`).

### 9.9 Footnotes / endnotes (R:1277-1362)
Index `word/footnotes.xml` (`w:footnote`) and `word/endnotes.xml` (`w:endnote`) by `w:id`, skipping `w:type` separator/continuationSeparator and empty ids.

On `footnoteReference`/`endnoteReference@id`:
```
note = index[id]; missing → warn 'Nota al pie con texto ausente: referencia descartada'; return
number = ++noteCounter (global, footnotes and endnotes share it, in reference order)
noteId = (endnote ? 'en' : 'fn') + id
new.push({t:'field', code:'NOTEREF ' + noteId, result: string(number), char:{sup:true}})
save field/rels/currentPart; field=null; currentPart = 'word/footnotes.xml' or 'word/endnotes.xml'; rels = relsOf(currentPart)
runs = []; for each w:p child of note (i>0 → push {t:'break', type:'line'} first):
     b = readParagraph(p); runs ++= b.runs; delete lengths[b.id]; blockCounter--   // note paragraphs do not consume ids
restore
noteBlock = {t:'p', id:'b'+(++blockCounter), sec: secId, style:'Normal',
             para:{left:0, first:0, before:0, after:0, line:240},
             fn:{id:noteId, kind: endnote?'endnote':'footnote', number},
             runs: [{t:'text', text: number + ' ', char:{sup:true}}] ++ runs}
lengths[noteBlock.id] = linearLength; notes.push(noteBlock)    // appended to the END of body
```
The reference run then also receives the reference `w:r`'s rPr char merged (typically `{sup:true, sub:false}`). The note paragraph's own style (e.g. FootnoteText) and pPr are discarded. Test T3:548-566: code `NOTEREF fn1`, result `1`, `char.sup` true, `fn = {id:'fn1', kind:'footnote', number:1}`, first run text `'1 '`, text `'1  Texto de la nota'` (two spaces: the number's space + the note's leading space).

### 9.10 Tables (R:1814-2135)

Nested table (when `cellMark` != null): warn `Tablas anidadas aplanadas: sus párrafos se importan en la celda que las contiene`; walk every `w:tc` of every `w:tr` with the **parent's** cell mark (its paragraphs join the containing cell). Test T3:297-308.

Top-level table:
```
id = 'b' + (++blockCounter)
props = {align:'left', borders:'grid', fixedLayout:false, repeatHeader:false}
tblPr:
  tblStyle@val  → styleRef (original id, not mapped)
  jc            → align: center/right else left
  tblBorders    → bordersDefined; [mode, color] = summarize(readBorders(sides top,left,bottom,right,insideH,insideV)); props.borders=mode; color → props.borderColor
  tblLayout@type=='fixed' → fixedLayout true
  tblCellMar    → margins = readCellMargins
  shd@fill      → tableShading (default shading for every cell)
  tblpPr        → warn 'Tablas flotantes colocadas en el flujo del texto'
  others (tblW, tblInd, tblLook…) ignored
tblGrid/gridCol@w → cols[] (numeric → max(1,int), else 0)
if not bordersDefined:
  st = tableStyles[styleRef]; if st: props.borders = st.borders; st.color → borderColor
  else: props.borders = (styleRef set, non-empty, != 'TableNormal') ? 'grid' : 'none'
```
`summarize(borders)` (R:2114-2135): visible(side) = present and style ∉ {none, nil}. color = color of the first visible side (iteration order of the sides **as they appear in XML**) whose color ≠ auto. No visible side → `none`. If insideV, left and right all invisible and any of insideH/top/bottom visible → `horizontal`. Else `grid`. Table style (`w:style w:type="table"`): its `tblPr/tblBorders` summarized the same way; none → `{borders:'none', color:null}`.

Rows (`w:tr`; a `w:sdt` at row level → warn `Filas dentro de controles de contenido: se importan sus párrafos sin la tabla` and is skipped):
```
row = {height:null, cells:[]}; col = 0
trPr: tblHeader (on) on row 0 → repeatHeader true (on later rows ignored); trHeight@val > 0 → height (hRule ignored)
for each w:tc:
  cell = {blocks:[], vAlign:'top', shading: tableShading}; span=1; width=0
  tcPr: tcW (type default dxa; only dxa) → width = max(1,w)
        gridSpan → span = max(1,val)
        vMerge → cell.vMerge = (val=='restart') ? 'restart' : 'continue'
        shd@fill (not auto) → cell.shading
        vAlign: center|both → center; bottom → bottom; else top
        tcMar → margins only if no table-level margins yet (first one wins)
        (tcBorders, noWrap, textDirection, hideMark, cnfStyle ignored)
  span>1 → cell.gridSpan = span;  vMerge=='continue' → cell.merged = true
  mark = {tableId:id, row:rowIndex, col}
  paras = walkBlocks(tc, cellMark=mark) filtered to t=='p'
  if none: paras = [{t:'p', id:'b'+(++blockCounter), sec, style:'Normal', cell:mark, runs:[]}]
  cell.blocks = ids; cellParagraphs ++= paras
  row.cells.push(cell); widthsOfRow[col] = width
  repeat span-1 times: row.cells.push({blocks:[], vAlign:'top', shading:null, merged:true})   // absorbed grid columns
  col += span
maxCols = max(maxCols, col)
if cols empty and widthsOfRow non-empty and no zero width: cols = widthsOfRow   // first row with all tcW
```
After rows: no rows → warn `Tabla sin filas descartada`, return (note: the id was consumed). Pad short rows with `{blocks:[], vAlign:'top', shading:null, merged:true}` up to maxCols. Grid: cols mapped `max(1,int)`; if `cols.length < maxCols` or any 0 → **equal split of 9026 twips** (A4 usable width): `intdiv(9026, max(1,maxCols))` each; if more cols than maxCols → truncate. `props.cellMargins` = margins or Word default `{top:0, left:108, bottom:0, right:108}`.
`readCellMargins`: start `{top:0,left:108,bottom:0,right:108}`; children top/bottom/left|start/right|end with `@w` numeric and `@type` (default dxa) == dxa → `max(0,int)`.
Output: push `{t:'table', id, sec, props, cols, rows}` then **all cell paragraphs** in reading order (row-major). The model's `cell.col` is the grid column (span-aware), so the Writer's lookup `row|c` with c = index in `cells` (which includes placeholders) matches.

### 9.11 Numbering (R:669-696, 2140-2352)

`readNumbering`: `abstractNum@abstractNumId` → levels (index 0..8 from `w:lvl@ilvl`); `num@numId` → `{abstract: abstractNumId@val, overrides: levels from lvlOverride/lvl}` (`startOverride` ignored).

`readLevel(lvl)`:
```
ilvl = @ilvl numeric else -1 (ignored if outside 0..8)
fmt='decimal'; text=null; ind=720*(ilvl+1); hanging=360; font=null
numFmt@val → fmt; lvlText@val → text
pPr/ind: left|start numeric → ind=max(0,int); hanging numeric → hanging=max(0,int); else if firstLine attribute present → hanging=0
rPr/rFonts → font = @ascii ?? @hAnsi
def = {ind, hanging}
if fmt in (bullet, none): def.fmt='bullet'; ch = (fmt=='none') ? '' : (text ?? '•'); [def.char, f] = bulletUnicode(ch, font); f → def.font
else: def.fmt = fmt in {decimal, lowerLetter, upperLetter, lowerRoman, upperRoman, ordinal} ? fmt : 'decimal'
      if text contains '%': def.lvlText = text
      elif text non-empty: def.fmt='bullet'; def.char = text        // fixed text without %n behaves as a bullet (whole string)
```
`numPr` in a pPr: numId missing → **false** (no key); numId `0` → **null** (`para.numbering = null`, removes inherited list); else `listId = registerList(numId)`; unknown → warn `Lista con definición ausente en numbering.xml: se importa sin viñeta` and false; level = clamp(ilvl, 0, 8) (default 0).
`registerList(numId)`: listId = `'num' + numId`; once per listId; levels = abstract levels with overrides applied; fill 0..8 with `{fmt:'decimal', ind:720*(i+1), hanging:360}` where missing; `type` = levels[0].fmt; stored `{id:listId, type, levels}`. Only lists actually referenced (by paragraphs **or style pPrs**) appear in `doc.numbering`, in first-reference order.

#### 9.11.3 Symbol-font bullets and `w:sym` (R:82-92, 2275-2314)
`bulletUnicode(char, font)`:
```
if char == '': return ['', null]
cp = first code point; f = lowercase(trim(font)); low = cp & 0xFF; inPUA = 0xF000 ≤ cp ≤ 0xF0FF
symbolFont = f starts with 'symbol' | 'wingdings' | 'webdings'
if symbolFont or inPUA:
    table = f starts with 'symbol' ? SYMBOL : WINGDINGS
    if table[low]: return [table[low], null]
    if inPUA: other = (f starts with 'symbol') ? WINGDINGS : SYMBOL; return [other[low] ?? '•', null]
    return ['•', null]
return [first char, font if non-blank else null]
```
SYMBOL: B7 `•`, A8 `◆`, AE `→`, DE `⇒`, A7 `♣`, A9 `♥`, AA `♠`, B0 `°`, D7 `·`, 2D `−`.
WINGDINGS: 6C `●`, 6D `❍`, 6E `■`, 6F `□`, 70 `◻`, 71 `❑`, 72 `❒`, 73 `◆`, 74 `❖`, 75 `◆`, 76 `❖`, 77 `◇`, 9F `•`, A7 `▪`, A8 `▫`, B2 `☐`, D8 `➢`, E0 `⇨`, E8 `➔`, F0 `⇨`, FC `✓`, FD `✗`, FE `☑`, FF `☒`, 4A `☺`, 4C `☹`, 3F `✍`, 2B `✈`.
`w:sym@font,@char`: char must be hex digits; cp = hex; `bulletUnicode(chr(cp), font)[0]`. Tests: Symbol `F0B7` → `•` and no font (T3:337-338); `o` with Courier New keeps font Courier New (T3:339-340); Wingdings `F0FC` → `✓` (T3:396).

### 9.12 Styles (R:2568-2763)

Pass 1 — built-in recognition by name: collect all styleIds; for each `w:style`, canonical = `NOMBRES_INTEGRADOS[lowercase(trim(w:name))]`; if id non-empty, canonical exists, canonical ≠ id and **no other style already uses the canonical id**, then `styleIdMap[id] = canonical`. Table (lowercased names): `normal`→Normal, `no spacing`→NoSpacing, `title`→Title, `subtitle`→Subtitle, `quote`→Quote, `emphasis`→Emphasis, `strong`→Strong, `list paragraph`→ListParagraph, `heading 1..9`→Heading1..Heading9. (Word localises styleIds — Spanish Word writes `Ttulo1`, `Prrafodelista`, `Hipervnculo` — but never the `w:name`.) All later references (pStyle, basedOn, next, rStyle) go through the map. Note `Hyperlink` is not in the table: the char style keeps its localized id (`Hipervnculo`) but is flattened into runs anyway.

Pass 2:
- `docDefaults/rPrDefault/rPr` → defChar (readRPr without rStyle flattening); `pPrDefault/pPr` → defPara.
- each `w:style`: type default `paragraph`; skip if styleId empty or in STYLE_SKIP; `table` → `tableStyles[originalId]`; `numbering` and other types skipped; paragraph/character → `{id: mapped, name: w:name (non-blank) else id, type, basedOn: mapped or null, next: mapped or null, char: readRPr(rPr), para: readPPr(pPr)[1]}`; basedOn in STYLE_SKIP → null. (uiPriority, qFormat, semiHidden, link, rsid ignored; style pPr may register lists.)
- **Normal synthesis** (R:2688-2713): `baseChar = {size:10}` plus `font: theme.minorFont` if defChar has no font and minorFont non-empty; `basePara = {line:240, before:0, after:0}`. If a style with id `Normal` exists (it keeps its position in the list): `char = own ∪ defChar ∪ baseChar`, `para = own ∪ defPara ∪ basePara` (left-most wins), `basedOn = null`. Else **prepend** `{id:'Normal', name:'Normal', type:'paragraph', basedOn:null, next:'Normal', char: defChar ∪ baseChar, para: defPara ∪ basePara}`. Rationale (importacion-docx.md §3.1, INTEGRATION_NOTES): use Word's *template-less* defaults (10 pt, single spacing, no space after), NOT Skriba's modern defaults (Aptos 11, 276, 160) — otherwise documents generated outside Word get wrong spacing.
- No styles.xml at all → only the synthesized Normal (font = theme minorFont `Aptos` by default, size 10, line 240, before 0, after 0).
- **charStyles** (for rStyle flattening): for each character style, walk the basedOn chain (cycle-safe), `char = char ∪ ancestor.char` (child wins).

### 9.13 Theme, settings, core (R:2768-2842, 2548-2559, 2921-2942)
- Theme part: intended to be found via a document rel whose type ends with `/theme`, else `word/theme/theme1.xml`. **BUG:** rel types are already reduced to their last segment (`theme`), so the `/theme` suffix test never matches and the fallback path is always used. C++: match `type == 'theme'`, fall back to `word/theme/theme1.xml`.
- First `a:fontScheme`: `a:majorFont/a:latin@typeface` → theme.majorFont, `a:minorFont/a:latin@typeface` → minorFont (non-empty only). First `a:clrScheme`: each child (dk1, lt1, dk2, lt2, accent1..6, hlink, folHlink) → `a:srgbClr@val` or `a:sysClr@lastClr`; if 6-hex → `theme.colors[name] = UPPER` (no `#`; merged over the default accents).
- Theme color lookup aliases: text1→dk1, text2→dk2, background1→lt1, background2→lt2, hyperlink→hlink, followedHyperlink→folHlink; result `'#'+UPPER`.
- settings.xml: `w:evenAndOddHeaders` (parseOnOff) → every section's `differentEven`.
- core.xml: direct children `dc:title` → name, `dcterms:created`, `dcterms:modified` (trimmed, non-empty).

### 9.14 Images, text boxes, VML (R:1367-1669)

`w:drawing`: for each child `wp:inline` / `wp:anchor` (count them):
```
cx,cy from wp:extent; wrap='inline'; align='left'; alt=''
wp:docPr → alt = trim(@descr || @title || @name)  (first non-empty — note PHP treats "0" as empty)
wp:wrapNone → wrap = (container@behindDoc == '1') ? 'behind' : 'front'
wp:wrapSquare | wrapTight | wrapThrough → 'square';  wp:wrapTopAndBottom → 'topAndBottom'
wp:positionH/wp:align text: right|outside → right; center → center; else left   (posOffset ignored → left)
anchor with no wrap element → 'square'
for every pic:pic at any depth (groups included): rid = a:blip@r:embed (r:link only → warn 'Imágenes vinculadas a archivos externos descartadas');
     run = imageRun(rid, cx, cy, alt, wrap, align)        // all pics in a group get the container's size (QUIRK)
for every wps:txbx at any depth: deferTextBox
if nothing produced: uri of first a:graphicData contains '/chart' → warn 'Gráficos de Word descartados';
     '/diagram' → 'SmartArt de Word descartado'; else if no txbx and no pic → 'Formas y objetos gráficos sin imagen descartados'
```
If no inline/anchor child at all → warn `Imágenes u objetos de dibujo vacíos descartados` (T1:637 expects "dibujo vacíos").

`w:pict`/`w:object` (VML): each `v:imagedata@r:id` → size from parent shape `style` (`width:Xpt`, `height:Ypt`) → EMU = round(pt*20*635); image run inline/left, no alt. Each `v:textbox` → deferTextBox. Nothing produced → warn `Objetos VML (formas, OLE) descartados`.

`imageRun(relId, cx, cy, alt, wrap, align)`: rid = importMedia(relId) or null; `w = cx>0 ? round(cx/635) : round(pxW*15)`, same for h; run `{t:'image', rid, w:max(1,w), h:max(1,h)}`, `alt` if non-empty, `wrap`+`align` only if wrap ≠ inline.

`importMedia(relId)` (R:1548-1616), resolving against `currentPart` (so images in headers/notes use that part's rels):

| check | warning |
|---|---|
| rel missing | `Imagen con relación ausente en el paquete: descartada` |
| TargetMode External | `Imágenes vinculadas a archivos externos descartadas` |
| same ZIP path already imported | reuse its rid (dedupe) |
| no mediaDir | `Imágenes omitidas: la importación no dispone de un directorio de medios` |
| ≥ 500 imported | `Se importaron solo las primeras 500 imágenes` |
| entry missing/empty | `Imagen ausente en el paquete: descartada` |
| > 10 MiB | `Imágenes de más de 10 MB descartadas` |
| content not a recognised image | `Imágenes en formato {EXT upper or 'desconocido'} no soportado (se admiten PNG, JPEG, GIF, WebP y BMP): descartadas` (EMF/WMF/SVG land here) |
| mime not in png/jpeg/gif/webp/bmp/x-ms-bmp | `Imágenes de tipo {mime} no soportado: descartadas` |
| cannot create dir | `No se pudo crear el directorio de medios: imágenes omitidas` |
| write fails | `No se pudo guardar una imagen en el servidor: descartada` |

Success: name = 16 random hex chars + `.` + ext (png, jpg, gif, webp, bmp); write file; `media[name] = {file:'media/'+name, w: pxWidth (≥1), h: pxHeight (≥1), mime}` (x-ms-bmp → image/bmp); rid = name. Type is detected **by content** (magic bytes), never by extension; the package never decides a disk path. Test T3:496-515: rid matches `^[a-f0-9]{16}\.png$`, w = round(720000/635) = 1134, h = 567, alt `Logo`, no wrap key, media file/mime set, file exists, 0 warnings.

`deferTextBox(box)`: for each `w:txbxContent` below it, with the field state saved/cleared, read paragraphs (`w:p`; `w:tbl` → every descendant `w:p` flattened; `w:sdt` → recurse) dropping `_sectPr`; push to `deferred`; if any → warn `Cuadros de texto importados como párrafos a continuación de su ancla`. Deferred blocks are inserted right after the anchor paragraph (with its cell mark). Test T3:535-544: body texts `['ancla', 'dentro del cuadro', 'siguiente']`. Note `mc:AlternateContent` prefers `mc:Choice` so the text box is read once.

### 9.15 OMML → linear math (R:1674-1806)
`m:oMath`/`m:oMathPara` → `src = trim(mathSrc(el))`; empty → nothing; else run `{t:'math', src, alt:src}` + warn `Ecuaciones importadas a la notación lineal del editor (revisar las complejas)`. A whole oMathPara becomes ONE run.

`mathSrc(n)` (`sub(x)` = trim of concatenated children; `seq` = concatenation):

| node | output |
|---|---|
| non-m: `w:r` → sanitized textContent; others '' | |
| `m:t` | sanitized text |
| `m:r` | concat of its `m:t` children |
| `m:f` | `'(' + num + ')/(' + den + ')'` |
| `m:sSup` | `base(e) + '^(' + sup + ')'` |
| `m:sSub` | `base(e) + '_(' + sub + ')'` |
| `m:sSubSup` | `base(e) + '_(' + sub + ')^(' + sup + ')'` |
| `m:sPre` | `e` only (pre-scripts dropped) |
| `m:rad` | `'sqrt(' + e + ')'` (degree dropped) |
| `m:d` | `'(' + join(', ', trimmed e children) + ')'` (begChr/endChr ignored) |
| `m:nary` | chr = `naryPr/chr@m:val` or `∫`; `chr + ('_(' + sub + ')' if sub) + ('^(' + sup + ')' if sup) + ' ' + e` |
| `m:limLow` / `m:limUpp` | `e + '_(' + lim + ')'` / `e + '^(' + lim + ')'` |
| `m:func` | `fName + ' ' + e` |
| `m:eqArr`, `m:m`, `m:mr` | `join(', ', non-empty trimmed e/mr children)` |
| oMathPara, oMath, e, num, den, sup, sub, lim, fName, deg, bar, acc, box, borderBox, groupChr, phant | `seq` |
| anything else (`*Pr`, unknown) | '' |

`base(b)`: trimmed; '' → ''; if matches `^[\p{L}\p{N}.,]+$` or starts with `(` and ends with `)` → as is; else `'(' + b + ')'`. Test T3:610-621: `x=(a+b)/(2)y^(2)sqrt(z)`.

### 9.16 Sections and bands (R:2356-2545)

`readSectPr(sectPr, secId)`: start from `defaultSection(secId)`, `differentEven = evenAndOdd`; sectPr null → warn `El documento no declara w:sectPr: se usa A4 con márgenes de 1440 twips` and return defaults.

| child | model |
|---|---|
| `pgSz@w,@h,@orient` | page.w, page.h (numeric), orient = landscape if `@orient=='landscape'` else portrait (no auto-swap of w/h) |
| `pgMar@top,right,bottom,left` | margins = **abs(int)** (negative "exact" margins lose their sign) |
| `pgMar@header`, `@footer` | headerDist, footerDist (gutter ignored) |
| `cols@num` | columns.count = max(1,int); `@space` → spacing; `@sep` on → sep:true; `w:col@w` list → widths **only if** its length == count |
| `titlePg` | differentFirst = parseOnOff |
| `type@val` ∈ continuous/evenPage/oddPage | start (nextPage/nextColumn → no key) |
| header/footerReference `@w:type` (default/first/even, other → default), `@r:id` | readBand |
| `pgBorders` | doc.pageBorder (first section with a visible border only) |
| `lnNumType` | warn `Números de línea descartados` |
| docGrid, pgNumType, formProt, vAlign, bidi… | ignored |

`pageBorder`: first visible side (not none/nil): style double|triple→`double`, dotted→`dotted`, dashed|dashSmallGap|dotDash|dotDotDash→`dashed`, else `solid`; color `auto` → `#000000`; width px = `max(1, round(sz/8*96/72))`; space px = `max(0, round(space*96/72))`.

`readBand(rId, kind, variant, secId)`: rel missing → warn `Encabezado o pie con relación ausente: descartado`; part = resolve against `word/document.xml`; unreadable → warn `Encabezado o pie ilegible: descartado`. Switch rels/currentPart to the band part, clear field state, set secId; for each root child: `w:tbl` → warn `Tablas en encabezados o pies aplanadas en párrafos` and take all descendant paragraphs; others → walkBlocks keeping only `p`. Each resulting block gets `hf:{kind, variant}`, `sec: secId`, `cell` removed; appended to `bands`. Restore state. The same part referenced by several sections is read once per reference (duplicated blocks with different `sec`). Test T3:452-481.

### 9.17 Comments, bookmarks, discarded parts (R:2847-2916, 3045-3063)
- comments.xml: each `w:comment@w:id` → `{author: trim(@author) or 'Autor', initials: trim(@initials), date: @date (raw string or null), text: trim(join('\n', sanitize(textContent of each w:p)))}`.
- buildComments: for each comment with a range whose blockId is set: `len = lengths[blockId]`; `start = clamp(start, 0, len)`; `end = (end null or < 0) ? len : clamp(end, start, len)`; output `{id:'c'+id, author, initials: initials or derived, date, text, blockId, start, end, resolved:false, replies:[]}`. No range / no block → warn `Comentarios sin posición en el texto descartados`. Derived initials: first letter (uppercased) of each whitespace-separated word, max 3, fallback `A`.
- Test T3:568-586: comment start 7, end 12 (`'Total: '` is 7 UTF-16 units, `'1.000'` 5); bookmark `cifra` offset 7; `_GoBack` dropped.
- Discarded-part warnings by ZIP entry prefix (one each): `word/glossary/` → `Bloques de creación (glossary) descartados`; `word/embeddings/` → `Objetos incrustados (OLE) descartados: se conserva su imagen de vista previa si la hay`; `word/charts/` → `Gráficos de Word descartados`; `word/vbaProject` → `Macros descartadas`.

### 9.18 Block id assignment order (for reproducing ids in tests)
A single counter produces `b1, b2, …` in parse order: body paragraphs and tables as encountered; empty-cell placeholder paragraphs when created; text-box paragraphs when their drawing is read (before the anchor paragraph is pushed but after it got its id); header/footer paragraphs at the moment the closing sectPr is processed (mid-body for section breaks, after the whole body for the last section); a footnote block takes the next id at the moment of its reference (inner note paragraphs temporarily consume and give back ids). Section-break carrier paragraphs consume an id even though they are dropped. A table without rows consumes its id.

### 9.19 Linear length (R:3069-3081)
`text` run → number of UTF-16 code units (emoji = 2); any other run → 1.

---

## 10. Full import warning catalogue (exact Spanish strings)

Dynamic parts in `{}`. Each distinct final string is emitted once.

- `Elemento <{nodeName}> no soportado: ignorado` / `Elemento <w:{local}> no soportado: ignorado`
- `Documento truncado: supera 100000 párrafos`
- `Contenido externo incrustado (altChunk) descartado`
- `Bloque <w:{local}> no soportado: ignorado`
- `Propiedad de párrafo <w:{local}> no soportada: ignorada`
- `Propiedad de carácter <w:{local}> no soportada: ignorada`
- `Lista con definición ausente en numbering.xml: se importa sin viñeta`
- `Elemento matemático <{nodeName}> fuera de una ecuación: ignorado`
- `Texto eliminado con control de cambios descartado (se importa el documento como aceptado)`
- `Elemento <{nodeName}> dentro de un run: ignorado`
- `Texto con guía fonética (ruby) importado sin la guía`
- `Contenido de run <w:{local}> no soportado: ignorado`
- `Texto oculto descartado`
- `Tachado doble degradado a tachado simple`
- `Campos que abarcan varios párrafos (índices, tablas de contenido…) importados como texto`
- `Campos {WORD} importados como texto (se conserva su último valor)`
- `Nota al pie con texto ausente: referencia descartada`
- `Gráficos de Word descartados` · `SmartArt de Word descartado` · `Formas y objetos gráficos sin imagen descartados` · `Imágenes u objetos de dibujo vacíos descartados` · `Objetos VML (formas, OLE) descartados`
- image warnings of §9.14
- `Cuadros de texto importados como párrafos a continuación de su ancla`
- `Ecuaciones importadas a la notación lineal del editor (revisar las complejas)`
- `Tablas anidadas aplanadas: sus párrafos se importan en la celda que las contiene` · `Tablas flotantes colocadas en el flujo del texto` · `Filas dentro de controles de contenido: se importan sus párrafos sin la tabla` · `Tabla sin filas descartada`
- `El documento no declara w:sectPr: se usa A4 con márgenes de 1440 twips` · `Números de línea descartados`
- `Encabezado o pie con relación ausente: descartado` · `Encabezado o pie ilegible: descartado` · `Tablas en encabezados o pies aplanadas en párrafos`
- `Comentarios sin posición en el texto descartados`
- `La parte {part} declara DOCTYPE/ENTITY (posible XXE): rechazada` · `word/styles.xml ilegible: se usan los estilos por defecto`
- discarded parts (§9.17)

Exceptions (abort import): `Archivo no encontrado: {basename}`, `El archivo no es un ZIP válido (.docx)`, `El archivo no es un documento de Word (.docx): falta [Content_Types].xml de WordprocessingML`, `El archivo no es un documento de Word (.docx): falta word/document.xml`, `word/document.xml no es XML válido o fue rechazado por seguridad`, `word/document.xml no contiene <w:body>`.
UI (from docs): warnings are shown once in a dialog titled «Documento importado» after the import completes.

---

## 11. Rules for "Word opens it without repair" + known gaps

Validation rules the Writer relies on (validated against Word 2024 via COM per INTEGRATION_NOTES l.17-19, 196, 268):
1. Mandatory parts: Content_Types, `_rels/.rels`, document.xml, styles.xml, settings.xml, document.xml.rels, core.xml, app.xml; every part has an Override (or a Default by extension for media); every extra part has a relationship.
2. Child order of pPr, rPr, sectPr, tblPr, tcPr, style, numbering (abstractNum before num), anchor, naryPr, core.xml exactly as in §3-§8.
3. Only XML-1.0-legal characters (sanitizeText) and full escaping; `xml:space="preserve"` on text with edge spaces.
4. Booleans false written as `w:val="0"`; highlight only from the 16 named values; colors only 6-hex or `auto`; `w:sz` within 2..3276.
5. Style ids restricted to `[A-Za-z0-9_-]`, starting with a letter; exactly one default paragraph style (Normal) and the DefaultParagraphFont character style present; Hyperlink style defined whenever `rStyle Hyperlink` is used.
6. A section break = empty paragraph whose pPr holds the sectPr; the last sectPr is a direct child of `w:body` after all content.
7. Every `w:tc` contains at least one `w:p`; a `w:p` follows a table when the next block is not a paragraph (and at body end); horizontally absorbed cells are omitted, vertical continuation cells are written with `<w:vMerge/>`.
8. footnotes.xml always contains separator (id 0) and continuationSeparator (id 1) and real notes start at 2; body uses `w:footnoteReference`, the note starts with `w:footnoteRef`.
9. Unknown field codes are not written as fields (cached text only); hyperlinks to external URLs use a relationship with `TargetMode="External"`; internal links use `w:anchor`.
10. `tblW`/`tcW` use `type="auto"` with `w="0"` when no width is known; `docPr`/`cNvPr` ids are positive.
11. Images: only files with server-generated names and a Default content type for their extension.

Gaps / defects to be aware of (export side; Reader supports more than Writer):
- Not exported: theme1.xml, comments, endnotes (written as footnotes), bookmarks, tracked changes (`char.ins/del` written as plain text — **deleted text reappears**), `pageColor` (`w:background`), `pageBorder` (`w:pgBorders`), watermark, `w:evenAndOddHeaders`, `w:updateFields`, cell borders (`tcBorders`), per-paragraph `numbering:null` overrides, table styles (`TableGrid` undefined), list start values.
- Hyperlinks and images inside headers/footers/footnotes: links degrade to text; images produce a dangling relationship (BUG).
- Style ids with accents are mangled (`Título`→`Ttulo`); Spanish names of built-ins are replaced by Word's English names.
- Round-trip asymmetries: `TOC` exported as fldSimple but imported as text; `SECTIONPAGES` imported as field but exported as text; `fn` ids renumbered (`n1` → `fn2`); default border color `A6A6A6` reappears as explicit `borderColor`; endnotes come back as footnotes.
- INTEGRATION_NOTES l.344 says the Reader ignores `m:oMath` — outdated: the Reader imports OMML as linear math (§9.15).

---

## 12. Test expectations (port all to Catch2)

### 12.1 `ooxml.php` (T1)
Converters:
- `ptToHalfPoints(11)=22`, `(11.5)=23`; `halfPointsToPt(22)=11`, `(23)=11.5`; `ptToTwips(8)=160`; `twipsToPt(1440)=72`, `(10)=0.5`.
- `alignToJc('justify')='both'`, `('center')='center'`, `('desconocido')='left'`; `jcToAlign('both')='justify'`, `('start')='left'`, `('end')='right'`, `('cosaRara')=null`.
- `hexToHighlight('#FFFF00')='yellow'`, `('#FFEE05')='yellow'`, `('#00FF00')='green'`, `(null)='none'`; `highlightToHex('yellow')='#FFFF00'`, `('none')=null`; palette size 16.
- `normColor('auto')='auto'`, `('c00000')='#C00000'`, `('')=null`; `colorAttr('#C00000')='C00000'`, `('auto')='auto'`; `parseOnOff(null)=true`, `('0')=false`, `('false')=false`, `('1')=true`; `normUnderline('dottedHeavy')='dotted'`, `('wave')='single'`, `(null)='none'`.
- `normalizeDocument([])`: version 1, locale es-ES, 1 section, page.w 11906, margins.top 1440, 1 body block of t 'p', Normal size 11.
- `esc('a & b < c > "d"')='a &amp; b &lt; c &gt; &quot;d&quot;'`; `sanitizeText("a\x00b\x0Bc")='abc'`; `sanitizeText("a\tb\nc")='a b c'`; `styleId('Heading1')='Heading1'`; `styleId('Mi Estilo Ñ')='MiEstilo'`; `styleName('Heading1','Título 1')='heading 1'`; `styleName('Cita','Cita')='Cita'`.

Writer (sample doc: Normal = defaultNormalStyle, Heading1 {name 'Título 1', basedOn/next Normal, char {font 'Aptos Light', size 16, color '2F5496', bold false}, para {before 240, after 80, keepNext true, outlineLvl 0}}, 4 paragraphs: heading «Informe de pruebas»; justified first 709 after 200 with runs «Texto normal con », bold «negrita», « y », italic red 14pt «cursiva roja»; «Col1» tab «Col2» line-break «  segunda línea  »; left 720 line 480 with underline/strike/highlight #FFFF00/sup «x»/sub «2»/page-break/«Tras el salto <de página> & "comillas"»):
- ZIP contains the 8 mandatory parts; every entry is well-formed XML.
- Content types contain `<Default Extension="rels"`, `<Default Extension="xml"`, `PartName="/word/document.xml"`, `wordprocessingml.document.main+xml`, styles/settings/core/app overrides.
- core.xml: `<dc:title>Prueba.docx</dc:title>`, `<dc:creator>Skriba</dc:creator>`, `2026-08-02T10:00:00Z`, `2026-08-02T11:30:00Z`.
- document.xml: the exact pPr string of §3.4; rPr string of §3.5; `<w:rPr><w:b/></w:rPr>`; `<w:highlight w:val="yellow"/>`; `superscript`; `subscript`; `<w:u w:val="single"/>`; `<w:strike/>`; `<w:spacing w:line="480" w:lineRule="auto"/>`; escaped `Tras el salto &lt;de página&gt; &amp; &quot;comillas&quot;`; `<w:t xml:space="preserve">Texto normal con </w:t>`; `<w:t>Col1</w:t>`; `<w:tab/>`; `<w:r><w:br/></w:r>`; `<w:br w:type="page"/>`; `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>`; pgMar string; exactly 4 occurrences of `<w:p>`.
- styles.xml: `<w:docDefaults>`, `<w:rPrDefault>`, `<w:pPrDefault>`, `w:default="1" w:styleId="Normal"`, `w:styleId="DefaultParagraphFont"`, `<w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>`, `<w:rFonts w:ascii="Aptos Light" w:hAnsi="Aptos Light"/>`, `<w:sz w:val="32"/>`, `<w:outlineLvl w:val="0"/>`.
- settings: `<w:defaultTabStop w:val="720"/>`, `<w:themeFontLang w:val="es-ES"/>`; root rels target `word/document.xml` and `docProps/core.xml`; document rels target `styles.xml`, `settings.xml`.
- Writer to a non-existent directory throws with message containing `no existe`.

Reader round-trip of the sample:
- version 1; name `Prueba.docx`; 4 body blocks; ids `b1`…`b4`; sec `sec1`; t `p`.
- b1 style Heading1, one run «Informe de pruebas»; b2 style Normal, 4 runs concatenating to «Texto normal con negrita y cursiva roja».
- b2 run0 has **no** `char`; run1 bold true; run3 italic true, color `#C00000`, size 14. b4 runs: underline `single`; strike true; highlight `#FFFF00`; run3 sup true & sub false; run4 sub true & sup false.
- b3: 5 runs (text, tab, «Col2», break line, «  segunda línea  » with spaces preserved); b4 run5 break page, run6 unescaped text.
- b2 para align justify, first 709, after 200; b4 left 720, line 480; b3 has no `para`.
- styles count 2; Normal type paragraph, basedOn null, font Aptos, size 11, color auto, bold false, underline none, highlight null, align left, line 276, after 160, widowControl true; Heading1 basedOn Normal, next Normal, font Aptos Light, size 16, color `#2F5496`, before 240, keepNext true, outlineLvl 0.
- 1 section sec1, 11906×16838 portrait, margins 1440, headerDist 720, columns.spacing 708; `_warnings` is an empty array.
- Landscape round-trip: w 16838, h 11906, landscape, margins top 720 / right 1134.
- `Writer::write([])` then read: 1 body block, runs [], style Normal, page.w 11906.

Security/robustness: §9.2 tests; non-ZIP → message contains `ZIP`; ZIP without WordprocessingML → contains `documento de Word`; missing file → contains `no encontrado`.
Synthetic doc (numPr numId 1 with empty numbering.xml, bookmark `x`, 1×1 table, hyperlink r:id rId9 without rels, run with empty `<w:drawing/>` + text, sectPr 12240×15840): 5 body blocks; block0 text «Con viñeta» with no `para.numbering`; block1 table; block2 `cell.tableId` = table id, text «celda»; block3 text «enlace» without `char.link`; block4 text «con imagen»; page.w 12240; warnings contain `Lista con definición ausente` and `dibujo vacíos`.

### 12.2 `ooxml2.php` (T2) — Writer extensions
- Decimal list (listId `ln-decimal`, 2 paragraphs levels 0/1): numbering.xml exists, contains `<w:abstractNum`, `w:numFmt w:val="decimal"`; document has `<w:numPr>` and `<w:ilvl w:val="1"/>`; content types contain `numbering+xml`.
- Bullet list (char •, font Symbol): `w:numFmt w:val="bullet"`, `w:ascii="Symbol"`.
- Unused list definitions → no numbering.xml.
- 2×2 table (cols 4000/5000): `<w:tbl>`, `<w:gridCol w:w="4000"/>`, 2 `<w:tr>`, 4 `<w:tc>`, text «celda 11»; with cell(0,0) gridSpan 2 and (0,1) merged: `<w:gridSpan w:val="2"/>` and only one `<w:tc>` in the first row; borders none + shading `#D9E2F3` → `w:fill="D9E2F3"` and `w:val="none"`; «celda 00» appears exactly once.
- Bands: header1.xml and footer2.xml exist; header1 contains «Mi encabezado»; document has `<w:headerReference` and `<w:footerReference`, not the band text; rels mention `header1.xml`.
- Footer with «Página » PAGE « de » NUMPAGES → footer1.xml contains `<w:fldSimple w:instr="PAGE">` and `<w:fldSimple w:instr="NUMPAGES">`.
- differentFirst + first header → `<w:titlePg/>` and `w:type="first"`.
- Footnote (NOTEREF n1 + fn block «Aclaración»): footnotes.xml exists, contains `w:type="separator"` and «Aclaración»; body does not contain it.
- Two sections (sec2 landscape) → 2 `<w:sectPr>` and `w:orient="landscape"`; unequal columns → `w:equalWidth="0"`, `<w:col w:w="3000"`, `w:sep="1"`; sec2 start continuous → `w:val="continuous"`.
- Image (media dir with `abababababababab.png`, run w 1440 h 720 alt Foto): `word/media/<name>` in ZIP; `<w:drawing>`, `<wp:inline`, `cx="914400"`; content types `Extension="png"`. `file:'media/<name>'` also embeds. Wrap square + align right → `<wp:anchor`, `<wp:wrapSquare`, `<wp:align>right</wp:align>`. Empty `media` map with rid = file name → still embedded. Unknown rid → text kept, no `<w:drawing>`.
- Math without AST → `π r²` and surrounding text; SmartArt hierarchy → `• Dirección` (w:left 720), `• Ventas` (w:left 1080), following paragraph kept.
- OMML: frac/group/sqrt AST → math namespace declared, `<m:oMath>`, `<m:f><m:num>`, `<m:rad>`, `<m:degHide m:val="1"/>`, `<m:d><m:e>`, and no plain `(a+b)/2 + √(x)`; sum with limits → `<m:nary>`, `<m:chr m:val="∑"/>`, `<m:limLoc m:val="undOvr"/>`; `x^2` → `<m:sSup>`; lim with sub → `<m:limLow>` and `<m:sty m:val="p"/>`; no AST → no `<m:oMath>`.

### 12.3 `ooxml3.php` (T3) — Reader extensions
1. No Normal, docDefaults font Calibri, empty pPrDefault, Heading1 basedOn Normal → synthesized Normal font Calibri, size 10, line 240, after 0, and styles[0] is Normal.
2. docDefaults asciiTheme minorHAnsi + sz 22, pPrDefault after 160 line 259 auto, Normal declared; theme major Cambria / minor Calibri / accent1 4472C4; run rFonts asciiTheme majorHAnsi + color auto themeColor accent1 → Normal font Calibri, size 11, after 160, line 259; theme.minorFont Calibri, majorFont Cambria, colors.accent1 `4472C4`; run font Cambria, color `#4472C4`.
3. Styles Ttulo1 (`heading 1`, bold), Prrafodelista (`List Paragraph`), char style Hipervnculo (`Hyperlink`, color 0563C1, u single) → style ids include Heading1 and ListParagraph; paragraph styles remapped; run with rStyle Hipervnculo gets color `#0563C1`, underline `single`.
4. Full table (§9.10): cols [3000,6000]; align center; borders grid; borderColor `#AAAAAA`; repeatHeader; fixedLayout; cellMargins {80,110,80,110}; 4 rows; row0 height 500; c00 shading `#D9D9D9`, vAlign center, 1 block; row1 has 2 cells, cell0 gridSpan 2 with 2 blocks, cell1 merged; row2 cell0 vMerge restart; row3 cell0 vMerge continue + merged; 8 cell paragraphs; first has cell {tableId, row 0, col 0}, text Clave, id = c00.blocks[0]; 3rd («Ancha») col 0; empty cell gets 1 block; last body block is «después» without cell.
5. Border modes: none (top none / left nil), horizontal, grid via TableGrid style with color `#FF0000`, none for empty tblPr; default cellMargins {0,108,0,108}.
6. Nested table: one table block; cell texts ['fuera','dentro']; cell has 2 blocks; warning contains `anidadas`.
7. Lists: num1 (bullet), num2 (decimal); num1 L0 char `•` without font; L1 char `o` font Courier New; ind 720 / hanging 360; 9 levels; num2 L0 lvlText `%1.`; L1 fmt lowerLetter; paragraph numbering/indent expectations of §9.6; numId 0 → `numbering` key present with null; plain paragraph has no `para`.
8. Paragraph borders/shading/etc. (§9.6): bottom `{single, 8, 4, '#404040'}`, top double with color auto, shading `#F2F2F2`, contextualSpacing, keepLines, pageBreakBefore true, before 120, line 360 exact; second paragraph atLeast 300; **zero warnings**.
9. Hidden run dropped (3 runs remain), char shd → highlight `#FFFF00`, Wingdings F0FC → `✓`, caps → allCaps; Letter 12240, margin left 1800; warning contains `oculto`.
10. Fields (§9.8).
11. `w:hyperlink` r:id external → both runs get the URL, bold kept; `w:anchor="marca"` → `#marca`.
12. Bands (§9.16): 3 band blocks; header default «Mi encabezado» sec1; footer align center with run1 field PAGE; header variant first; differentFirst true; differentEven true; body[0] is «cuerpo» without hf.
13. Image with media dir (§9.14); without media dir → only the text run and a warning containing `directorio de medios`; anchor with align right + wrapSquare → wrap `square`, align `right`.
14. Text box (§9.14).
15. Footnote (§9.9).
16. Comments/bookmarks (§9.17).
17. Sections (§9.4): 2 sections; sec1 start continuous, columns.count 2; sec2 landscape, margin left 720; 2 body blocks with sec1/sec2.
18. OMML (§9.15): src `x=(a+b)/(2)y^(2)sqrt(z)`.
19. Full round-trip (Writer → check XML → Reader): written document contains `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="404040"/></w:pBdr>`, `<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>`, `<w:contextualSpacing/>`, `w:line="360" w:lineRule="exact"`, `<w:hyperlink r:id="`, `<w:hyperlink w:anchor="marca">`, `<w:rStyle w:val="Hyperlink"/>`; rels contain `TargetMode="External"` and the URL; styles define `w:styleId="Hyperlink"`; `<w:insideV w:val="none"`, `w:color="AAAAAA"`, `<w:tblLayout w:type="fixed"/>`, `<w:tblCellMar><w:top w:w="80" w:type="dxa"/>`, `<w:numPr>`. Read back: borders/shading/contextualSpacing/line/lineRule identical; list level 0, left 720, level char `•`; link runs 1 and 3 keep URL / `#marca`, run 0 no link; table cols [3000,6000], borders horizontal, borderColor `#AAAAAA`, align center, repeatHeader, fixedLayout, cellMargins {80,110,80,110}, cell(0,0) shading `#D9E2F3` vAlign center; cell texts `celda 00, 01, 10, 11`; one footer band with fields PAGE and NUMPAGES at runs 1 and 3; **zero warnings**.

(Related JS tests `tests/import-layout.test.js` — 9 cases on layout of lineRule, paragraph decoration, cell shading/vAlign/margins/border color, contextualSpacing, pageBreakBefore — belong to the layout spec, not this one.)
