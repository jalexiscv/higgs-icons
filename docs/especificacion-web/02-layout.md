# 02 — Layout, line breaking and pagination (Skriba → C++/JUCE port)

**Source of truth:** `C:/xampp/htdocs/Skriba` (paths below are relative to it).
**Files read in full:** `public/js/layout/measure.js` (227 lines), `layout/breaker.js` (953), `layout/hyphenate.js` (147), `layout/paginator.js` (1349), `layout/pages.js` (1298), `core/fonts.js` (634). Also read: `CONTRACTS.md` (layout sections + "Ampliaciones"), `plan.md` §5, FASE 1/3/11/12/13/19, §7.2/7.3, §9.6, `INTEGRATION_NOTES.md` (bands/cells/footnotes), and the helpers the layout calls: `core/units.js`, `tables/table.js`, `formatting/lists.js`, `formatting/styles.js`, `main.js` (resolver wiring), `css/canvas.css` (paint-only rules).

**Notation.** `file:line` references point at the JS source. "MUST" = needed to match Skriba's output. **[BUG]** marks behaviour that is in Skriba today but is clearly unintended; each one says whether to copy it (for pixel parity) or fix it. **[NOT IMPLEMENTED]** marks features that the plan or the data model mentions but the layout ignores. If you implement them, Skriba and the C++ app will paginate differently.

---

## 0. Architecture summary

```
Document model (JSON, twips)          — spec 01
   │  resolver.charOf / paraOf / markerOf   (style resolution + list labels)
   ▼
breakParagraph(block, columnWidthPx)  — pure; paragraph → Line[] (y relative to paragraph)
   ▼
LayoutEngine.reflow()                  — pure-ish; Line[] → Page[] (absolute y, column x shift),
                                         tables, SmartArt, footnotes, endnotes, header/footer bands,
                                         PAGE/NUMPAGES fields
   ▼
PageView (pages.js)                    — paints visible pages only (virtualized), zoom = pure transform
caret/hit-testing API on LayoutEngine  — posToXY, xyToPos, posLineMove, rangeRects, lineAt, imageRectAt
```

Recommended C++ split (it matches the Higgs layering): `skriba_layout` headless library (`Measurer` interface, `breakParagraph`, `LayoutEngine`, `hyphenate`, `fonts` catalogue). It must not depend on JUCE GUI classes. Only the real `Measurer` implementation and `PageView` use JUCE. Port the deterministic `FakeMeasurer` (§4.5) so the Catch2 tests can reproduce Skriba's Node tests exactly.

---

## 1. Units and coordinate systems

| Quantity | Unit | Conversion | Source |
|---|---|---|---|
| All model measures (indents, spacing, page size, margins, tab stops, image w/h, row height, column widths) | twips (1/20 pt) | — | CONTRACTS.md:36 |
| Layout | CSS px at zoom 1 (1 pt = 96/72 px) | `twipsToPx(tw) = tw / 20 * 96 / 72` = **tw / 15** | core/units.js:24-26 |
| Font size | pt (`char.size`) | `px = pt * 96 / 72`, rounded to 2 decimals | measure.js:49-55 |
| Paragraph border width `sz` | eighths of a point | `px = sz/8 * 96/72` | breaker.js:336 |
| Paragraph border `space` | points | `px = space * 96/72` | breaker.js:337 |

Useful values: 720 tw = 48 px; 1440 tw = 96 px; 120 tw = 8 px; 708 tw = 47.2 px; 108 tw = 7.2 px; 11 pt = 14.67 px; A4 11906×16838 tw = 793.73×1122.53 px.

**Zoom never re-measures.** Layout always runs at zoom 1. The view applies a scale transform (pages.js:32-34, measure.js:4-5). In JUCE, paint through `Graphics::addTransform(AffineTransform::scale(z))`. Do not change font sizes with the zoom.

**Coordinate frames used in the output:**

| Frame | Origin | Used by |
|---|---|---|
| paragraph-relative | x: left edge of the *column 0* text area (= page left margin); y: top of the paragraph's first line | `breakParagraph` output, cache |
| page | x: page left edge; y: page top edge | `posToXY`, `xyToPos`, `rangeRects`, `imageRectAt` |
| page-line | `line.y` is **absolute in the page** after pagination; `seg.x`, `marker.x`, `float.x`, `deco.box.x` stay **relative to the page's left margin** (column offset and table cell offset already added) | Page items, bands, notes |

So the page-x of a seg is `page.margins.left + seg.x` (paginator.js:486, 621, 661).

---

## 2. Inputs the layout reads

The layout never reads style tables directly. It calls a **resolver** (main.js:272-276):

| Resolver call | Returns | Production implementation |
|---|---|---|
| `charOf(block, run)` | full char format = style char of `block.style` (default `'Normal'`) merged with `run.char`. `charOf(block, null)` = the paragraph's style char (used for empty lines, list marker base) | styles.js:205-208 |
| `paraOf(block)` | full para format = style para merged with `block.para` (shallow) | styles.js:216-219 |
| `markerOf(block)` | `{text, char}` or null (list label); see §9 | main.js:248-258 |

Hard defaults when the style chain is empty (styles.js:49-77):
`char = {font:'Aptos', size:11, bold:false, italic:false, underline:'none', strike:false, sub:false, sup:false, color:'auto', highlight:null, allCaps:false, smallCaps:false}`.
`para = {align:'left', line:276, before:0, after:160, left:0, right:0, first:0, tabs:[], keepNext:false, widowControl:true, numbering:null}`.

**Char fields used by layout/paint:** `font, size, bold, italic, smallCaps, allCaps, sub, sup` (measurement). `underline, strike, color, highlight, link, linkTip, ins, del, effect` are paint only. `spacing` (letter spacing) is **[NOT IMPLEMENTED]**: it is never measured or painted (see §4.4).

**Para fields used:** `align` ('left'|'center'|'right'|'justify', default 'left'), `line` (>0, default 240 inside the breaker if absent/invalid), `lineRule` ('auto'|'exact'|'atLeast'), `before`, `after`, `left`, `right`, `first` (negative = hanging), `tabs` (array of numbers or `{pos,type}`; only `pos` is used), `contextualSpacing`, `pageBreakBefore`, `borders`, `shading`, `dropCap`. **Read by nobody in layout:** `keepNext`, `keepLines`, `widowControl` **[NOT IMPLEMENTED]** (paginator.js:19-20; CONTRACTS.md:261).

**Block kinds** in `doc.body` (a flat array):

| Block | Recognised by | Layout treatment |
|---|---|---|
| Body paragraph | `t:'p'` without `hf`, `cell`, `fn` | flowed |
| Table | `t:'table'` | flowed by rows (§13) |
| SmartArt | `t:'smartart'` | indivisible box (§12.6) |
| Header/footer paragraph | `t:'p'` with `hf:{kind:'header'|'footer', variant:'default'|'first'|'even'}` | removed from flow, repeated in bands (§14) |
| Table-cell paragraph | `t:'p'` with `cell:{tableId,row,col}` | placed by its table |
| Foot/endnote paragraph | `t:'p'` with `fn:{id, kind:'footnote'|'endnote', number}` | removed from flow (§15) |

Filter: paginator.js:234-236. Section of a block = `doc.sections.find(s => s.id === block.sec)`, else `sections[0]`, else FALLBACK_SECTION (paginator.js:1151-1158, 45-53).

**Runs** and their linear length (breaker.js:59-63; CONTRACTS.md:39-41):

| Run | Linear length | Layout token |
|---|---|---|
| `{t:'text', text}` | `text.length` in **UTF-16 code units** | words / space groups |
| `{t:'tab'}` | 1 | tab |
| `{t:'break', type:'line'|'page'|'column'}` | 1 | break (unknown type → 'line') |
| `{t:'image', rid, w, h, wrap?, align?, alt?}` | 1 | image (w,h in twips) |
| `{t:'math', src, alt, ast?}` | 1 | math box |
| `{t:'field', code, result}` and **any unknown run type** | 1 | field: painted text = `String(result)` or '' |

**Offsets:** a `Pos = {blockId, offset}` uses UTF-16 units within the block's concatenated linear text. **C++ pitfall:** if you store text as UTF-8 `juce::String`, you still have to compute offsets in UTF-16 units to stay compatible with saved selections, comments and anchors. Never split a surrogate pair (breaker.js:99-109).

---

## 3. Font catalogue, fallback stacks and metric twins (core/fonts.js)

### 3.1 Catalogue
* `SYSTEM` fonts by category (fonts.js:60-93), `src:'system'`. Categories: `sans, serif, mono, display, script, symbol`.
* `WEB` (Google Fonts) families (fonts.js:104-192), `src:'google'`. Each entry is either a name or `[name, axes]`, where axes ∈ `'bi'` (regular, bold, italic, bold-italic; this is the default), `'b'` (regular+bold), `'i'` (regular+italic) or `'r'` (regular only).
* The index is case-insensitive (key = lower-cased trimmed name). The first registration wins, and SYSTEM is registered before WEB (fonts.js:250-269). The list is sorted with Spanish collation (`localeCompare('es', sensitivity base)`).
* Category labels (UI, verbatim): `sans:'Sans serif'`, `serif:'Serif'`, `mono:'Monoespaciada'`, `display:'Decorativa'`, `script:'Manuscrita'`, `symbol:'Símbolos'` (fonts.js:45-52).
* Unknown font name → category `'sans'` (fonts.js:319-322).

Copy the full lists verbatim from fonts.js:60-192 into a C++ table. They are long but they are data.

### 3.2 Metric twins (fonts.js:199-215)
`Calibri→Carlito, Calibri Light→Carlito, Cambria→Caladea, Arial→Arimo, Arial Narrow→PT Sans Narrow, Arial Black→Archivo Black, Helvetica→Arimo, Helvetica Neue→Arimo, Microsoft Sans Serif→Arimo, Times New Roman→Tinos, Courier New→Cousine, Georgia→Gelasio, Garamond→EB Garamond, Franklin Gothic Book→Libre Franklin, Franklin Gothic Medium→Libre Franklin, Segoe UI→Open Sans, Segoe UI Light→Open Sans, Segoe UI Semibold→Open Sans, Consolas→Inconsolata, Comic Sans MS→Comic Neue, Impact→Anton, Century Gothic→Didact Gothic, Trebuchet MS→Fira Sans, Rockwell→Roboto Slab, Futura→Jost, Avenir→Nunito Sans, Avenir Next→Nunito Sans, Bahnschrift→Barlow, Baskerville→Libre Baskerville, Baskerville Old Face→Libre Baskerville, Bodoni MT→Bodoni Moda, Didot→Bodoni Moda, Menlo→Noto Sans Mono, Monaco→Noto Sans Mono, Goudy Old Style→Sorts Mill Goudy, Old English Text MT→UnifrakturMaguntia, Stencil→Stardos Stencil, Broadway→Limelight`.
**Aptos has no twin.**

### 3.3 Category fallbacks (fonts.js:218-225)
| cat | fallback list |
|---|---|
| sans | Calibri, Segoe UI, sans-serif |
| serif | Cambria, Georgia, Times New Roman, serif |
| mono | Consolas, Courier New, monospace |
| display | Calibri, Segoe UI, sans-serif |
| script | Segoe Script, Brush Script MT, cursive |
| symbol | Calibri, Segoe UI, sans-serif |

### 3.4 `fontStack(name, fallbackName='Aptos')` (fonts.js:344-351)
```
first = trimmed(name) if non-empty else fallbackName      // measure.js passes DEFAULT_FONT='Aptos'
e     = catalogue entry of first (may be null)
list  = [first] + ([e.twin] if e && e.twin) + FALLBACKS[e ? e.cat : 'sans']
dedupe keeping the first occurrence (exact, case-sensitive string compare)
```
Examples: `'Aptos' → Aptos, Calibri, "Segoe UI", sans-serif`; `'Times New Roman' → "Times New Roman", Tinos, Cambria, Georgia, serif`. The quoting rule (`/^[A-Za-z][A-Za-z0-9-]*$/` → bare, else `"…"` with inner quotes stripped) is only for CSS. C++ needs only the ordered list.

**C++ resolution rule (equivalent to the browser):** for each glyph, use the first family in the stack that is installed or bundled and has the glyph. The browser does per-glyph fallback. For parity, at minimum choose the first family *installed* for the whole run. Generic names map to platform defaults: `sans-serif`→Arial/DejaVu Sans/Liberation Sans, `serif`→Times New Roman/DejaVu Serif, `monospace`→Consolas/DejaVu Sans Mono, `cursive`→any script.
**Recommendation:** bundle the OFL twins (Carlito, Caladea, Arimo, Tinos, Cousine, Gelasio, …) as binary resources. Skriba downloads them on demand when the Office font is missing (fonts.js:506-512). On Linux this is what keeps pagination close to Word.

### 3.5 Font loading → relayout
The first time the measurer sees a family, it calls `onFamily(name)` once (measure.js:111-121). This triggers `ensureFont`. When a web font or twin finishes loading, `fonts:loaded` fires → the measurer cache is cleared → `invalidateAll()` → reflow (fonts.js:19-21, main.js:494+). C++ equivalent: if fonts can be added at runtime, clear the measure caches and call `invalidateAll()`.

### 3.6 Other data in fonts.js (not layout but same module)
`FONT_SETS` (theme font pairs, fonts.js:594-629), recent fonts (max 6, key `skriba.fonts.recent`), `searchFonts` (accent-insensitive; prefix matches first, then substring matches), `isFontInstalled` (canvas probe with sample `'mmmmmmmmmmlliWwAa@0123'` at 72px against monospace/sans-serif/serif; difference > 0.01 ⇒ installed). These belong to the UI spec. Listed here only for completeness.

---

## 4. Text measurement (layout/measure.js)

### 4.1 Constants
| Name | Value | Ref |
|---|---|---|
| DEFAULT_FONT_SIZE_PT | 11 | measure.js:28 |
| DEFAULT_FONT | 'Aptos' | :31 |
| SUBSUP_SCALE | 0.65 | :34 |
| MAX_CACHE | 20000 entries (cache fully **cleared** when full, no LRU) | :37, :157, :189 |

### 4.2 Effective font size
```
fontSizePx(char):
  pt = char.size if number > 0 else 11
  px = pt * 96 / 72
  if char.sub || char.sup: px *= 0.65
  return round(px * 100) / 100           // 2 decimals; same value used for measuring and painting
```
(measure.js:49-55)

### 4.3 Font descriptor ("font string")
The CSS shorthand order is `[italic] [small-caps] [bold] <sizePx>px <family stack>` (measure.js:76-85). It works as the cache key and selects the face: italic flag, small-caps flag, weight 700 when bold (else 400), size = `fontSizePx`, family stack = `fontStack(char.font)`. In C++ define a value-type `FontKey{stack, sizePx, bold, italic, smallCaps}` with hashing.

### 4.4 Text transform before measuring/painting
* `displayText(text, char)` = `text.toUpperCase()` when `char.allCaps` (JS default Unicode upper-casing, locale-independent; `'ß'→'SS'` lengthens the string), else the text unchanged (measure.js:88-91). Measurement always uses the display text of the *same slice*. When converting offsets, measure `displayText(slice)` and never index into the upper-cased string.
* `smallCaps`: the browser synthesises small caps from the font shorthand (canvas and DOM). C++ must do the same in both measure and paint. Commonly: lower-case letters drawn as upper-case at ~0.7× size (browser-dependent; Chrome ≈ 0.7). Use one shared helper so measure and paint can never disagree.
* **Letter spacing:** `char.spacing` exists in the style model (plan §5.1) but is **ignored** by measure and paint **[NOT IMPLEMENTED]**. WordArt's `char.effect.spacing` is applied **only at paint** as CSS `letter-spacing` px (pages.js:1245) and not measured. This is a Skriba **[BUG]**: text overflows its measured width. For parity, ignore `char.spacing`. If you do implement it, add `spacing * (nChars)` to measured widths and apply the same value at paint.
* Underline/strike/colour/highlight never affect metrics.

### 4.5 Measurer interface
```
textWidth(text, char) -> px      // advance width of displayText(text,char), full shaping (kerning, ligatures)
fontMetrics(char)     -> {ascent, descent, lineHeight}
clearCache()
```
**Real measurer** (measure.js:104-205):
* `textWidth`: returns 0 for empty display text. Otherwise `canvas.measureText(displayText).width` with the font string, cached by key `fontString + "\0" + displayText`. **Widths are not additive.** Skriba always measures prefixes (`text.slice(0,k)`) rather than summing per-character widths (breaker.js:91-96, 115-127). The C++ shaper must return the advance of the whole substring (HarfBuzz / `juce::GlyphArrangement::addLineOfText` → bounding/advance). Prefix-measuring makes caret and hit-testing kerning-aware.
* `fontMetrics`: cache key = font string. Start from the fallback `ascent = 0.9*sizePx`, `descent = 0.3*sizePx`. If the platform exposes the font's bounding-box metrics (`fontBoundingBoxAscent > 0`), use the font's ascent and descent instead (canvas `measureText('Hxg').fontBoundingBox*`). `lineHeight = ascent + descent`, **without the font's line gap** (measure.js:169-192).
  * JUCE pitfall: `juce::Font(height)` treats *height* as ascent+descent, **not** the em size. Construct fonts with point/em-size semantics (`FontOptions().withPointHeight(...)` or scale by `getHeightToPointsFactor()`). Map CSS px size → em size. Ascent/descent must come from the same table the browser reads, scaled to that em size. On Windows Chrome measures through DirectWrite, which uses the OS/2 `usWinAscent`/`usWinDescent` values, or the OS/2 typo ascender/descender when the font sets the USE_TYPO_METRICS flag (`fsSelection` bit 7). It does not use hhea there. Blink then rounds ascent and descent to whole pixels, each on its own, so `fontBoundingBoxAscent`/`Descent` (and `lineHeight`) are integers. On Linux the values come from FreeType/hhea. Calibri and Consolas differ by about 18 % between the two sources.
  * Native port: `render::JuceMeasurer` (src/render/src/JuceMeasurer.cpp) builds the font with `withPointHeight(em)` and `TypefaceMetricsKind::legacy` on Windows (JUCE's name for the DirectWrite win/typo metrics) or `portable` (hhea) elsewhere. It rounds `getAscentInPoints()` and `getDescentInPoints()` with `std::round` and sets `lineHeight = ascent + descent`. When the font gives no usable values (ascent not positive, a negative descent or non-finite numbers) it falls back to 0.9/0.3 × sizePx, unrounded, like measure.js.
* Sub/sup characters get metrics for the **reduced** size (the font string includes the scaled size).

**Fake measurer** for tests (measure.js:213-227): `textWidth = displayText.length (UTF-16 units) * charWidth` (default 8), independent of size. `fontMetrics = {ascent: 0.9*sizePx, descent: 0.3*sizePx, lineHeight: 1.2*sizePx}`. Example: 11 pt → 14.67 px → line height 17.604 px.

---

## 5. Tokenization (breaker.js:133-218)

Walk the runs with a running linear offset `off`. Each token carries `{kind, runIdx, start, end, text, char}`, where `char = resolver.charOf(block, run) || {}`.

* **text run:** split into maximal groups of "U+0020" vs "non-U+0020". Each group becomes one token `kind:'text'` with `space: true|false`. **Only U+0020 counts as a space for breaking.** NBSP (U+00A0), TAB characters inside text, soft hyphen U+00AD, '-', U+200B: all part of words. Offsets: `start = off+i`, `end = off+j`.
* **tab** → `{kind:'tab', text:''}`.
* **break** → `{kind:'break', breakType}` where `breakType = type==='page'|'column' ? type : 'line'`.
* **image** → `{kind:'image', wPx: twipsToPx(w||0), hPx: twipsToPx(h||0), rid, alt, wrap: run.wrap||'inline', side: align==='right'?'right': align==='center'?'center':'left'}`.
* **math** → `{kind:'math', text: run.alt||'', src: run.src||''}`. Its size comes from `mathLayout(src, char, measurer) → {w, asc, desc}` (math engine, separate spec).
* **anything else (field, unknown)** → `{kind:'field', text: result==null ? '' : String(result)}`.

**Break opportunities (consequence):** a line can only break (a) before a non-space word token, (b) before an image/field/math token, (c) at a break run, (d) inside a word when it is wider than the whole line (character fallback), or (e) at a syllable boundary when hyphenation is on. **[BUG]/pitfall:** tokens never merge across runs. A word whose letters span two runs with different formatting ("neg" + **"rita"**) is two tokens, so the line can break *between them* with no space. Word would not. Copy this for parity, or join adjacent non-space text tokens of different runs into one breaking unit if you choose fidelity to Word (document the choice). Soft hyphen (U+00AD) is **not** a break opportunity and is measured like any char.

---

## 6. `breakParagraph(doc, block, contentWidthPx, measurer, resolver, opts={hyphenate})` (breaker.js:366-868)

### 6.1 Setup
```
p          = resolver.paraOf(block) || {}
align      = p.align || 'left'
lineVal    = (p.line is number > 0) ? p.line : 240
lineMode   = p.lineRule in {'exact','atLeast'} ? p.lineRule : 'auto'
factor     = lineMode=='auto' ? lineVal/240 : 1
fixedPx    = lineMode=='auto' ? 0 : twipsToPx(lineVal)
leftPx     = twipsToPx(p.left||0);  rightPx = twipsToPx(p.right||0);  firstPx = twipsToPx(p.first||0)
totalW     = max(0, contentWidthPx)
deco       = paraDecoration(p, leftPx, rightPx, totalW)         // §12.3, may be null
stops      = sorted px positions of p.tabs (t is number ? t : t.pos), keep > 0      // breaker.js:285-291
defaultStep= twipsToPx(720) = 48 px
emptyChar  = resolver.charOf(block, null) || {}
tokens     = tokenize(block)
```
Then, in this order:
1. **Extract floating images** (§12.2): image tokens with `wrap ∉ {'inline','topAndBottom'}` are removed from the token list.
2. **Drop cap** (§12.1) removes the first code point from the first token.
3. **List marker** (§9) is computed: `marker, markerChar, markerW, markerX, markerTextStart`.

State: `lines=[]`, `segs=[]`, `curW=0` (width of segs so far, x relative to the line's text start), `lineStart=0`, `y=0`, `lastChar=null`, `lastRunIdx=0`, `pendingPageBreak`, `pendingColumnBreak`, `pendingHyphen=null`.

### 6.2 Horizontal limits of line `idx` — `limitsFor(idx)` (breaker.js:405-425)
```
extra  = (idx==0) ? firstPx : 0
startX = (marker && idx==0) ? markerTextStart : leftPx + extra
if dropIndent && idx < dropLines: startX += dropIndent
width  = max(1, totalW - rightPx - startX)
for each float f with f.wrap=='square':
    yTop = (lines non-empty) ? last.y + last.height : 0       // top of the line being built
    if yTop >= f.hPx - 0.01: continue
    gap = f.wPx + 10   (FLOAT_GAP)
    if f.side=='right': width = max(1, width - gap)
    else:               startX += gap; width = max(1, width - gap)   // 'left' AND 'center'
return {startX, width}
```
Indents: `first` > 0 indents the first line; `first` < 0 (hanging) moves the first line left of `left`. Right indent reduces width. There is no clamping of `startX` to ≥ 0, so a hanging indent may give a negative x.

### 6.3 Main loop (breaker.js:690-820) — per token
`pushSeg(seg)`: `seg.x = curW; segs.push(seg); curW += seg.w; lastChar = seg.char; lastRunIdx = seg.runIdx`.

1. **break**: `lastChar = tk.char; lastRunIdx = tk.runIdx; finishLine(tk.end, isLast=false)`. The break char belongs to the line it ends, and `line.end` includes it. Then set `pendingPageBreak` (type page) or `pendingColumnBreak` (type column). The flag is attached to the **next** line created. A line break sets nothing.
2. **tab**:
   ```
   lim  = limitsFor(lines.length);  absX = lim.startX + curW
   w    = nextTabStop(absX) - absX
   room = lim.width - curW;  if w > room: w = max(0, room)        // tab never wraps; clamped
   pushSeg({kind:'tab', text:'', w, ...})
   nextTabStop(x): first explicit stop s with s > x + 0.001;
                   else n = floor(x/48 + 0.001) + 1; return n*48
   ```
   All tab stops behave as **left** tabs. Tab `type` (center/right/decimal/bar) and leaders are **[NOT IMPLEMENTED]**. Positions are measured from the column's left edge (page margin), not from the paragraph indent. No implicit stop exists at the hanging indent.
3. **space token** (`text` with `space:true`): `w = textWidth(text)`. Always pushed and never causes a break (spaces "hang" past the right edge).
4. **image / field / math** (atomic):
   ```
   w = image ? wPx : math ? mathLayout(...).w : textWidth(tk.text)
   solo = image && wrap=='topAndBottom'
   if solo && segs non-empty: finishLine(tk.start)
   lim = limitsFor(lines.length)
   if !solo && curW + w > lim.width + 0.001 && segs non-empty: finishLine(tk.start)
   pushSeg({kind, text, w, ... image:{hPx,rid,alt,wrap} | math:{layout, mAsc=asc, mDesc=desc}})
   if solo: finishLine(tk.end)          // image alone on its own line
   ```
   An atom wider than the line is placed anyway and overflows.
5. **word** (non-space text):
   ```
   text, start = tk.text, tk.start;  w = textWidth(text);  lim = limitsFor(lines.length)
   if opts.hyphenate && curW + w > lim.width + EPS:                    // §10
       hyW = textWidth('-', char)
       cut = bestHyphenCut(text, char, lim.width - curW - hyW)
       if cut > 0:
           pushSeg(text[0:cut]);  pendingHyphen = {char, w: hyW}
           finishLine(start + cut)
           start += cut; text = text[cut:]; w = textWidth(text); lim = limitsFor(lines.length)
   if curW + w > lim.width + EPS:
       if segs non-empty: finishLine(start)
       lim = limitsFor(lines.length)
       if w > lim.width + EPS:                                      // character fallback
           while text non-empty:
               l = limitsFor(lines.length); avail = l.width - curW
               k = fitChars(text, char, avail, min1 = segs.empty)
               if k == 0: finishLine(start); continue
               pushSeg(text[0:k]); start += k; text = text[k:]
               if text non-empty: finishLine(start)
           continue
   pushSeg({kind:'text', start, end: tk.end, text, w})
   ```
   `fitChars` (breaker.js:115-127) grows `k` one code point at a time while `textWidth(text[0:j]) <= maxW + 0.001`. If nothing fits and `min1` is set, it returns 1 code point, which guarantees progress.
   Hyphenation is tried **once** per word. The remainder after a hyphen cut is never re-hyphenated; if it is still too long it goes to the character fallback.
6. After all tokens: `finishLine(blockLen, isLast=true)`. An empty paragraph therefore yields exactly 1 line.

EPS = 0.001 px everywhere (breaker.js:56).

### 6.4 `finishLine(endOffset, isLast)` (breaker.js:562-688)
1. If `segs` is empty, push an empty text seg `{runIdx:lastRunIdx, start:end, end:end, text:'', x:0, w:0, char: lastChar || emptyChar, kind:'text'}`.
2. `justifyThis = (align=='justify' && !isLast)`. If not justifying, merge adjacent text segs: same `runIdx`, contiguous offsets, no `spaceExtra` (breaker.js:504-525). When justifying, segs stay unmerged.
3. `lim = limitsFor(lines.length)`. `lineW = lastSeg.x + lastSeg.w` (relative). `hyphenW = pendingHyphen?.w || 0`.
   `contentW = lineW - trailingSpaceWidth(out) + hyphenW`. Trailing U+0020 runs at the end of the line are excluded, and empty text segs are skipped when scanning back (breaker.js:544-559).
4. Alignment shift (§8).
5. `seg.x += lim.startX + shift` for every seg. x is now relative to the column's left edge.
6. Vertical metrics (§7).
7. Build the Line (§11.1). Attach `pageBreak` / `columnBreak` if pending. Attach `hyphen = {text:'-', x: lineW + lim.startX + shift, w: hyphenW, char}` if pending (see **[BUG]** in §20).
8. `y += height; segs = []; curW = 0; lineStart = endOffset`.

### 6.5 Post-processing (breaker.js:827-867)
* Drop cap seg is unshifted into `lines[0].segs` (§12.1). `lines[0].dropCap = {lines, type}`.
* `lines[0].marker = {text, char: markerChar, x: markerX, w: markerW}` when there is a marker.
* `lines[0].floats = floats` when there are floats.
* `height = Σ line.height`. For each float with wrap 'square' (or 'topAndBottom', which never occurs here): `height = max(height, f.hPx)`. **Note:** the paginator ignores this `height` for paragraphs (it sums line heights), so the reservation has no effect (§20).
* Returns `{lines, height}`. `height` does **not** include `before`/`after`.

---

## 7. Line height and baseline (breaker.js:609-652)

```
ascent = descent = natural = 0
for seg in line.segs:
    if seg.kind=='image' && seg.hPx:  ascent = max(ascent, hPx); natural = max(natural, hPx); continue
    if seg.kind=='math':  ascent = max(ascent, mAsc); descent = max(descent, mDesc);
                          natural = max(natural, mAsc + mDesc); continue
    m = fontMetrics(seg.char)          // includes tabs, empty segs, fields, dropcap? (dropcap is added AFTER, so no)
    ascent = max(ascent, m.ascent); descent = max(descent, m.descent); natural = max(natural, m.lineHeight)
if natural <= 0: m = fontMetrics(emptyChar); ascent, descent, natural = m.ascent, m.descent, m.lineHeight
natural = max(natural, ascent + descent)
height  = natural * factor                         // 'auto': factor = line/240 (240 single, 276 = 1.08, 360 = 1.5, 480 = double)
if lineMode=='exact':   height = fixedPx           // may be smaller than natural; text can clip/overlap
if lineMode=='atLeast': height = max(natural, fixedPx)
baseline = ascent + (height - natural) / 2         // extra (or negative) leading split EQUALLY above and below
if deco:
    if first line: height += deco.topExtra; baseline += deco.topExtra
    if isLast:     height += deco.bottomExtra
```
* Images sit **on the baseline** (top = baseline − hPx) and contribute nothing to descent. A line with only an image has `natural = hPx + descent_of_other_segs`.
* The list marker, hyphen and floats do **not** take part in line metrics.
* `baseline` is measured from the top of the line.
* Note the difference from Word: Word puts all extra "multiple" leading *above* the text in some modes. Skriba centres it, and this spec follows Skriba.

### 7.1 Paragraph spacing (paginator.js:355-376)
* `beforePx = twipsToPx(para.before||0)`, `afterPx = twipsToPx(para.after||0)`.
* Gap between consecutive flowed blocks = `prevAfter + before`. The two are **added**, not collapsed to the max.
* **Contextual spacing:** applies when both the previous and the current block are paragraphs (`t:'p'`) and share the same style id (`block.style || 'Normal'`). Then: if the *current* para has `contextualSpacing`, its `before` = 0; if the *previous* one had it, `prevAfter` = 0. Tables and SmartArt reset `prevStyle` to null.
* Spacing is **suppressed at the top of a page** (`page.items.length == 0`). It is *not* explicitly suppressed at the top of column 2+. In practice, though, the line that overflowed resets `y = contentTop` in the new column, so the spacing added before it is lost as well.
* Tables and SmartArt also get `before`/`after` from `paraOf(tableBlock)`. A table normally has no `para`/`style`, so it resolves to **Normal's** values (default `after = 160 tw = 10.67 px`). Copy this.
* `pageBreakBefore` (paragraphs only): if the page already has items, open a new page **before** applying spacing (spacing is then suppressed).

---

## 8. Alignment and justification (breaker.js:584-607)

```
shift = 0
'center':  shift = max(0, (lim.width - contentW) / 2)
'right':   shift = max(0, lim.width - contentW)
'justify' and not the paragraph's last line:
    gap = lim.width - contentW
    if gap > EPS:
        trailIdx = index of first seg of the trailing run of pure-U+0020 text segs (empty text segs skipped)
        counts[i] = (i < trailIdx && seg.kind=='text') ? number of U+0020 AND U+00A0 chars in seg.text : 0
        total = Σ counts
        if total > 0:
            extra = gap / total; acc = 0
            for each seg i: seg.x += acc; if counts[i] > 0: seg.spaceExtra = extra; seg.w += extra*counts[i]; acc += extra*counts[i]
'left' / anything else: shift = 0
```
* Trailing spaces hang into the margin and are neither counted for alignment nor stretched.
* **Last-line rule:** only the paragraph's final line (`isLast`) is not justified. Lines ending in a manual line break, page break or column break **are justified**. Word does not justify lines ending in Shift+Enter. Copy for parity.
* A line with no space chars under justify stays left-aligned. NBSP is stretched like a space (it never breaks).
* `spaceExtra` is painted as CSS `word-spacing` (pages.js:1227): every U+0020/U+00A0 in that seg is widened by `spaceExtra` px. `widthUpTo` accounts for it (breaker.js:91-96).
* Center/right alignment uses `contentW`, which includes the hyphen width.

---

## 9. List label (marker) rendering

### 9.1 Label text — `computeListLabels(doc)` (lists.js:420-470), cached until the next `doc:changed`
* Walk `doc.body` in order. Skip non-`p` blocks and `hf` blocks. Cell paragraphs and note paragraphs **are** included.
* Effective numbering = `block.para.numbering` if the key is present (null = explicitly none), else the style's `numbering` (lists.js:67-77). Valid only if it is an object with `listId != null`. `level` is clamped to 0..8 (MAX_LIST_LEVELS = 9).
* Each `listId` keeps 9 counters. `counters[level] += 1`, and all deeper levels reset to 0. Non-list paragraphs in between do **not** interrupt numbering. `start`/restart overrides are **[NOT IMPLEMENTED]**.
* Definition lookup: `doc.numbering` by id, else the built-in defaults (lists.js:41-62, 80-85). Level = `levels[min(level, levels.length-1)]`.
* **Bullet** if `lvl.fmt == 'bullet'`, or if `!lvl.fmt` and (`def.type == 'bullet'` or `lvl.char != null`). Then text = `lvl.char ?? '•'`, font = `lvl.font`.
* **Number:** `fmt = lvl.fmt ?? def.type ?? 'decimal'`. If `lvl.lvlText` is a non-empty string, replace each `%d` (d = 1..9) with `formatOrdinal(max(1, counters[d-1]), levelDef(d-1).fmt || fmt)` (an out-of-range index gives ''). Otherwise text = `formatOrdinal(counter, fmt) + (lvl.sep is string ? lvl.sep : '.')`.
* `formatOrdinal(n, fmt)` (lists.js:121-133): `lowerLetter` gives a, b, …, z, aa, bb (letter repeated, not base-26: `char = 'a' + (n-1)%26`, repeated `floor((n-1)/26)+1` times). `upperLetter` is the same in upper case. `lowerRoman`/`upperRoman` use standard subtractive notation (n ≥ 1). `ordinal` gives `${n}.º`. Everything else is decimal.
* Built-in defaults: list `n1` (bullet) uses chars cycling `•`, `○`, `▪` with fonts cycling Symbol, Courier New, Wingdings (level 1 has no font). List `n2` (decimal) uses fmts cycling decimal, lowerLetter, lowerRoman with sep '.'. Both use `ind = 720*(level+1)`.
* Indents are **not** computed by layout. When a list is applied, the command writes `para.left = lvl.ind ?? 720 + 360*level` and `para.first = -abs(lvl.hanging ?? 360)` (lists.js:369-394).

### 9.2 Marker char (main.js:248-258)
`char = resolveCharFormat(doc, block, null)` (the paragraph style's char), with `font` replaced by `label.font` if set. Band paragraphs (`hf`) never get a marker. Inside the breaker: `markerChar = {...emptyChar, ...marker.char}`.

### 9.3 Marker geometry (breaker.js:469-477)
```
markerW         = textWidth(marker.text, markerChar)
markerX         = leftPx + firstPx                      // the hanging position
markerGap       = textWidth(' ', markerChar)            // one space of the marker font
markerTextStart = max(leftPx, markerX + markerW + markerGap)
```
The first line's text starts at `markerTextStart` instead of `left + first`. Later lines start at `left`. The marker sits outside `segs`, so it has no offsets and the caret never lands on it. It is painted at `line.marker.x` on the line's baseline using its own font metrics (pages.js:943-950). It does not affect line height. Pitfall: `'•'` in the **Symbol** font. Symbol is category 'symbol', so the stack is `Symbol, Calibri, Segoe UI, sans-serif`. On systems where Symbol has no U+2022, fallback picks it up.

---

## 10. Hyphenation (layout/hyphenate.js + breaker.js:269-282)

Hyphenation is enabled per section through `section.hyphenation` (truthy), passed as `opts.hyphenate` (paginator.js:258-259). It is **never** applied inside table cells, header/footer bands or notes; those calls pass no opts.

### 10.1 Constants
`MIN_HEAD = 2` (letters before the hyphen), `MIN_TAIL = 2` (letters after it), `MIN_WORD = 5` (minimum word length) (hyphenate.js:25-29).
Strong vowels `aeoáéó`; weak vowels `iuü`; stressed weak `íú`, which count as **strong** for hiatus. `esVocal` = any of these. 'y' and 'h' are consonants (hyphenate.js:31-50).
Inseparable consonant pairs: `pr pl br bl fr fl tr dr cr cl gr gl kr kl tl ch ll rr` (hyphenate.js:36-39).

### 10.2 `syllables(word)` (hyphenate.js:71-125)
```
w = lower-case(word)
if len(w) < 3 or not /^[a-záéíóúüñ]+$/i.test(w): return [word]
cuts = []; i = 0
loop while i < len:
    skip consonants;  if i >= len: break
    i += 1                                       // first vowel of the nucleus
    while i < len and isVowel(w[i]) and not (isStrong(w[i-1]) and isStrong(w[i])): i += 1   // diphthongs stay together
    if i >= len: break
    c0 = i; skip consonants; n = i - c0
    if i >= len: break                           // final consonants close the last syllable
    if n == 0:      cut = c0                     // hiatus  (te-a-tro)
    elif n == 1:    cut = c0                     // V-CV    (a-mi-go)
    elif n == 2:    cut = INSEP(w[c0:c0+2]) ? c0 : c0+1        // a-bri-go / car-ta
    else:           cut = INSEP(w[i-2:i]) ? i-2 : i-1          // ins-truir / cons-tan-te
    if 0 < cut < len: cuts.append(cut)
split ORIGINAL word (case/accents preserved) at increasing cuts (skip cut <= prev); drop empty pieces
```
The silent-'u' rule (que/qui/gue/gui) mentioned in the comments is **not** explicitly coded (hyphenate.js:89-90). It works only by accident: weak + strong vowels form a diphthong.
Golden tests (tests/layout.test.js:249-275): `amigo→a|mi|go`, `carta→car|ta`, `abrigo→a|bri|go`, `constante→cons|tan|te`, `perro→pe|rro`, `muchacho→mu|cha|cho`, `cuidado→cui|da|do`, `teatro→te|a|tro`, `aeropuerto→a|e|ro|puer|to`. `http://x`, `2024` and `ab` stay unsplit.

### 10.3 `hyphenPoints(word)` (hyphenate.js:135-147)
If `len < 5` → []. Accumulate syllable lengths. Keep cumulative position `acc` only if `acc >= 2` and `len - acc >= 2`. Examples: `amigo → [3]`; `casa → []`; `constante → [4, 7]`.

### 10.4 `bestHyphenCut(text, char, avail)` (breaker.js:269-282)
```
if avail <= 0: return 0
m = /^([^\p{L}]*)(\p{L}+)/u.exec(text);  if none: return 0     // leading punctuation allowed
off = len(m[1]);  best = 0
for p in hyphenPoints(m[2]):  cut = off + p
    if textWidth(text[0:cut], char) > avail + 0.001: break
    best = cut
return best
```
`avail = lim.width - curW - width('-')`. The hyphen glyph is **not** in the model or the segs: `line.hyphen = {text:'-', x, w, char}` (painted only). Offsets are unaffected: the line ends at `start + cut` and the next line starts there (tests/layout.test.js:277-300: width 80 px with fake measurer 8 px/char, `'ab constante final'` → first line ends at offset 7, "ab cons-").

---

## 11. Output data structures

### 11.1 Line (breaker output; the paginator adds `col` and rewrites `y`)
| Field | Type | Meaning |
|---|---|---|
| `blockId` | string | owning block |
| `start`, `end` | int | linear offsets `[start, end)`. The last line has `end = blockLen` (caret may sit at `end` = before ¶). A line ended by a break run includes that run. Consecutive lines are contiguous (`next.start == prev.end`). |
| `y` | px | breaker: relative to the paragraph top; after paginate: **absolute page y** |
| `height` | px | includes border extras |
| `baseline` | px | from the line top |
| `segs` | Seg[] | in visual order (LTR only; no bidi) |
| `last` | bool | the paragraph's last line |
| `deco`, `first` | object, bool | only when borders/shading (§12.3) |
| `pageBreak` / `columnBreak` | bool | this line must start a new page/column |
| `hyphen` | `{text:'-', x, w, char}` | painted hyphen at line end |
| `marker` | `{text, char, x, w}` | list label (line 0 only) |
| `floats` | Float[] | floating images anchored to the paragraph (line 0 only) |
| `dropCap` | `{lines, type}` | line 0 only |
| `col` | int | column index (set by `placeLine`; table lines always 0) |

### 11.2 Seg
| Field | Meaning |
|---|---|
| `runIdx` | index into `block.runs` (0 for the dropcap seg) |
| `start`, `end` | linear offsets |
| `text` | slice of the run text ('' for tab/image/empty); field → its result text; math → alt text |
| `x`, `w` | px, x relative to the column-0 left edge (later shifted for columns/cells) |
| `char` | resolved char |
| `kind` | `'text'|'tab'|'image'|'field'|'math'|'dropcap'` |
| `spaceExtra` | justify extra per space (px) |
| image: `hPx, rid, alt, wrap` | |
| math: `layout, mAsc, mDesc` | |
| dropcap: `ascent` | |

### 11.3 Float
`{wrap:'square'|'behind'|'front', side:'left'|'right'|'center', x, y:0, wPx, hPx, rid, alt, runIdx, start, end}`.

### 11.4 Page (paginator.js:294-312 plus additions)
```
{ pageNo (1-based), sectionId, wPx, hPx, margins{top,right,bottom,left} (px),
  items: [{blockId, lines: Line[]}],          // body; table cell paragraphs appear as separate items
  contentTop, contentBottom,                   // px, usable body band after header/footer
  headerKey, footerKey ('sec|header|variant' or null), headerY, footerY,
  header: {items, y} | null,  footer: {items, y} | null,      // filled in pass 2
  columns: {count, spacingPx, widths[], offsets[], sep},
  footnotes: {items, top} | null,  notesHeight,
  endnotes?: {items, top},                     // last page only
  tableRects?: [{tableId, row, x, y, w, h, cells:[{x, w, shading}], borders, borderColor}],
  diagrams?: [{blockId, x, y, w, h, shapes}] }
```

---

## 12. Special paragraph content

### 12.1 Drop cap (breaker.js:234-254, 827-842)
* `para.dropCap`: `'none'`, an object with `type == 'none'`, or a missing value means no drop cap. The first token must be a non-space text token; otherwise there is no drop cap.
* `lines = clamp(round(cfg.lines || 3), 2, 10)`. `type = cfg.type == 'in-margin' ? 'in-margin' : 'in-text'`.
* The drop cap is one code point. `char = {...firstToken.char, size: (char.size || 11) * lines}`. `w = textWidth`. `indent = w + twipsToPx(120)` (= w + 8 px).
* The code point is removed from the token (`start += len`). Its offsets `[0, len)` belong to the dropcap seg, which is added to line 0 *after* breaking, so it does not change line 0's height.
* 'in-text': the first `lines` lines get `startX += indent`. 'in-margin': no indent. The seg x is `base - indent` (in-margin) or `base` (in-text), with `base = leftPx + firstPx`.
* Paint: `top = baseline - bigAscent`, with CSS `line-height: 1` (canvas.css:230). The big letter shares the **first** line's baseline and rises above it. It does not descend over N lines as in Word. Copy for parity.

### 12.2 Floating images (breaker.js:434-457, 410-423; pages.js:1079-1106)
* Image runs with `wrap ∈ {'square','behind','front'}` (any value except 'inline'/'topAndBottom') leave the flow.
* `x`: right → `max(0, totalW - rightPx - wPx)`; center → `max(0, (totalW - wPx)/2)`; left → `twipsToPx(p.left)`. `y = 0` relative to the paragraph's first line.
* 'square' narrows the lines whose top is < `hPx` by `wPx + 10` px (FLOAT_GAP) on its side. `center` is treated as left.
* 'behind' is painted under the text (z −1) and 'front' over it (z 2). Neither narrows lines.
* 'topAndBottom' stays in the flow as an atom on its own line (§6.3).
* `plan.md` FASE 12 describes `anchor {blockId, offsetX, offsetY}` and free positioning. This is **[NOT IMPLEMENTED]**: floats always anchor at the paragraph's top-left/right/centre.

### 12.3 Paragraph borders and shading (breaker.js:300-353; pages.js:984-1002)
* `para.borders = {top,bottom,left,right: {style, sz, space, color}}`. A side is active if it is an object and `style ∉ {'none','nil'}` (default 'single').
* Width px = `sz > 0 ? max(0.75, sz/8*96/72) : 0.75`. Space px = `space > 0 ? space*96/72 : 0`.
* `para.shading`: a string other than '' and 'auto' (otherwise no shading). No decoration when there is neither shading nor an active border.
* `topExtra = top ? w + space : 0`; `bottomExtra` likewise. `box.x = leftPx - (left ? w + space : 0)`; `box.w = max(1, totalW - rightPx - leftPx + leftOut + rightOut)`.
* Every line carries `deco`. The painted box covers the full line height. Left/right borders appear on every line, the top border on the first line only, the bottom border on the last line only. Shading is the box background.
* Consecutive paragraphs with identical borders are **not** merged into one box (Word groups them) **[NOT IMPLEMENTED]**.
* CSS border style mapping (pages.js:1278-1298): `double, triple, thinThick*/thickThin* SmallGap/MediumGap` → double; `dotted` → dotted; `dashed, dashSmallGap, dotDash, dotDotDash, dashDotStroked` → dashed; everything else → solid. Colour 'auto' → `#201F1E`. A 6-hex colour gets a '#' prefix.

### 12.4 Inline images
Width = `twipsToPx(w)`, height = `twipsToPx(h)`. The bottom sits on the baseline. A missing medium is painted as a dashed `#B3B0AD` 1 px frame. `imageRectAt(pos)` returns `{pageNo, x: margins.left + seg.x, y: line.y + line.baseline - hPx, w, h, blockId, offset: seg.start, rid}` (paginator.js:651-671).

### 12.5 Math
An atomic box with `w`, `asc`, `desc` from the math engine. It raises line ascent and descent. Painted with top = `baseline - mAsc` (pages.js:1114-1124).

### 12.6 SmartArt (paginator.js:390-407)
An indivisible block. Its height comes from `layoutSmartArt(block, colWidth)`. If `page.items` is non-empty and `y + h > limitBottom + 0.01`, advance to the next column/page. Push `{blockId, x: colDx, y, w: min(entry.width, contentWidth), h, shapes}` to `page.diagrams`. `y += h`. It produces no lines, so the caret cannot enter it. Hit-testing uses `diagramAt(pageNo, y)`, which matches on y only.

---

## 13. Pagination — `LayoutEngine.reflow()` (paginator.js:230-464)

### 13.1 Page geometry — `pageGeometry(section, view)` (paginator.js:1271-1327)
```
page = section.page || FALLBACK.page            // FALLBACK: w 11906, h 16838, margins 1440 x4, orient portrait
wPx = tw2px(page.w || 11906);  hPx = tw2px(page.h || 16838)       // w/h are PHYSICAL; orient never swaps them
margins = tw2px(each of page.margins.{top,right,bottom,left} || 0)
if view.mode == 'web':
    wPx = max(320, view.widthPx || wPx);  hPx = max(400, view.heightPx || 1200)
    lateral = min(96, max(24, round(wPx * 0.05)));  margins = {24, lateral, 24, lateral}
textWidth = max(1, wPx - left - right)
cols  = page.columns || {}
count = clamp(round(cols.count || 1), 1, 12)
spacingPx = tw2px(isFinite(cols.spacing) ? cols.spacing : 708)
widths = (cols.widths is array with length == count) ? widths.map(w => max(1, tw2px(w)))
                                                     : fill(count, max(1, textWidth - spacingPx*(count-1)) / count)
offsets[i] = Σ_{j<i} (widths[j] + spacingPx)
return {wPx, hPx, margins, textWidth, contentWidth: widths[0], contentBottom: hPx - margins.bottom,
        columns: {count, spacingPx, widths, offsets, sep: !!cols.sep}}
```
`setViewMode('web', {widthPx (default 900), heightPx (default 1200)})` → `invalidateAll` (paginator.js:169-178). 'print' = null view.

### 13.2 Pass 1 — break (paginator.js:245-268)
For each flowed block: compute `geo` of its section and `widthPx = geo.contentWidth` (the **first column's width**, used for every column). Re-break the block if `allDirty`, or the block is in `dirty`, or it has no cache entry, or `|cached.widthPx - widthPx| > 0.01`.
* p → `breakParagraph(..., {hyphenate: !!section.hyphenation})`.
* table → `_layoutTable` (§13.6).
* smartart → `layoutSmartArt`.
Cache entries for blocks that disappeared are dropped. Then clear dirty and allDirty.

### 13.3 Pass 2 — place blocks
State: `pages`, `page`, `geo`, `y`, `curSectionId`, `prevAfterPx`, `prevStyle`, `prevContextual`, `sectionFirstPage`, `colIdx`, `colDx`.

`openPage(section)` (paginator.js:288-318):
```
geo = pageGeometry(section); pageNo = pages.length + 1
if !page || page.sectionId != section.id: sectionFirstPage = pageNo
band = _bandMetrics(bands, section, geo, pageNo, sectionFirstPage)          // §14
page = {..., contentTop: band.contentTop, contentBottom: band.contentBottom, columns: geo.columns, footnotes: [], notesHeight: 0}
y = band.contentTop; prevAfterPx = 0; colIdx = 0; colDx = 0
```
`limitBottom() = page.contentBottom - (page.notesHeight ? notesHeight + 14 : 0)` (FOOTNOTE_GAP = 14).
`nextColumn(section)`: if `colIdx+1 < count`, then `colIdx++`, `colDx = offsets[colIdx]`, `y = page.contentTop` (same page). Otherwise `openPage(section)`.

For each block (paginator.js:339-445):
1. **Section change** (`!page || section.id != curSectionId`): if `page` exists, `section.start == 'continuous'` and `page.items.length > 0`, stay on the page: `geo = pageGeometry(section)`, `page.columns = geo.columns`, `colIdx = colDx = 0`, and **y continues**. Otherwise `openPage(section)`. Then `curSectionId = section.id`. `'nextPage'`, `'evenPage'`, `'oddPage'` and missing all simply open a new page. **[NOT IMPLEMENTED]**: no blank page is inserted for even/odd parity.
2. Spacing, contextual spacing, pageBreakBefore (§7.1).
3. table → `_placeTable` (§13.6); smartart → §12.6. `prevAfterPx = afterPx` in both cases.
4. Paragraph lines: for each cached line `ln`:
   ```
   hasContent = page.items.length > 0
   newNotes   = footnotes referenced by ln not yet placed          (§15)
   extra      = Σ newNotes.height + (newNotes non-empty && page.notesHeight == 0 ? 14 : 0)
   forced     = ln.pageBreak && hasContent
   forcedCol  = ln.columnBreak && hasContent
   overflow   = y + ln.height + extra > limitBottom() + 0.01 && hasContent
   if forced: openPage(section); item = null
   elif forcedCol or overflow: nextColumn(section); item = null
   if !item: item = {blockId, lines: []}; page.items.push(item)
   item.lines.push(placeLine(ln, y, colDx, colIdx));  y += ln.height
   for note in newNotes (now confirmed): page.footnotes.push(note); page.notesHeight += note.height; mark placed
   ```
   A line that does not fit on an **empty** page is placed anyway; it overflows and never loops. A paragraph splits between pages at any line boundary (**no widow/orphan control, no keepLines, no keepNext** **[NOT IMPLEMENTED]**). A page break inside a paragraph moves the *following* line. If the page break is the last run, the paragraph's final (empty) line moves to the next page.
5. `prevAfterPx = afterPx`.

After all blocks: if `pages` is empty, `openPage(sectionOf(null))` (one empty page). Then pass 3 (footnotes and endnotes, §15) and pass 4 (bands, §14). Then `_reindex()` and emit `layout:done {pageCount}`.

`placeLine(line, y, dx, col)` (paginator.js:79-88) returns a **copy** with `y`, `col`, and `x += dx` for segs, marker, floats and deco.box. It does not shift `hyphen` (see §20). The cache keeps paragraph-relative coordinates.

### 13.4 Columns
* Text fills column 0 top to bottom, then column 1, and so on. There is no balancing of columns at a section end **[NOT IMPLEMENTED]**.
* All columns are broken at `widths[0]`. With unequal `widths`, text in column 2+ is laid out at column 0's width **[BUG]**. Copy it, or break per column (that requires re-breaking on column change, which Skriba does not do).
* Column separator (`cols.sep`, count > 1): a vertical 1 px line at `x = offsets[i] - spacingPx/2` (relative to the left margin), full body height, colour `#8A8886` (pages.js:832-843, canvas.css:320-324).

### 13.5 Breaks summary
| Break | Effect |
|---|---|
| `break type:'line'` | new line, same paragraph |
| `break type:'page'` | new line flagged `pageBreak` → `openPage` (only if the page already has content) |
| `break type:'column'` | new line flagged `columnBreak` → `nextColumn` (next page if in the last column) |
| `para.pageBreakBefore` | paragraph starts a new page if the page has content |
| section change | new page unless `start:'continuous'` |

### 13.6 Tables (paginator.js:709-849; tables/table.js)
**Layout (`_layoutTable(table, colWidthPx)`):**
* Column edges (table.js:186-198): `cols = table.cols` if it is a non-empty array, else `evenColumns(round(colWidth), columnCount)`. evenColumns splits evenly using floor, and the remainder goes to the last column. Widths in px = `max(1, tw2px(c))`. If `total > colWidth`, every width is scaled by `colWidth/total` (auto-fit). `edges = [0, cumulative…]`.
* `offsetX` (table.js:206-212): `props.align` 'center' → `(colWidth - tableW)/2`; 'right' → `colWidth - tableW`; otherwise 0 (never negative).
* Cell padding px per side = `table.props.cellMargins[side]` (twips, ≥ 0) if finite, else `tw2px(108)` = 7.2 px (paginator.js:97-102).
* Per row r, per cell c:
  * Skip the cell if `isMerged(cell)` (`cell.merged || cell.vMerge == 'continue'`).
  * `span = gridSpan > 1 ? floor(gridSpan) : 1`; `to = min(edges.len-1, c+span)`; `x0 = offsetX + edges[c]`; inner width `= max(1, edges[to] - edges[c] - padL - padR)`.
  * `h = padTop`. For each cell paragraph (blocks with `cell = {tableId, row:r, col:c}` in body order): `h += before`; break at the inner width (no hyphenation); copy each line with segs/deco x += `x0 + padL`, `y = h`; `h += line.height`; after the paragraph, `h += after`. Spacing is never suppressed or collapsed inside cells.
  * `h += padBottom`. `rowSpan = rowSpanOf` (count of following rows whose same-col cell has `vMerge == 'continue'`, when this cell has `vMerge == 'restart'`). Only cells with `rowSpan <= 1` raise the row height.
  * Cell record `{col, x: x0, w: edges[to] - edges[c], rowSpan, items, h, vAlign: cell.vAlign || 'top', shading: cell.shading || null}`.
* Row height = `max(cell heights, tw2px(row.height || 0))`. `row.height` is a **minimum** (exact heights are not supported).
* vAlign: for cells with `rowSpan == 1` and vAlign 'center'/'bottom', `spare = rowH - cell.h`; if `spare > 0.01`, shift its lines by `spare/2` or `spare`.
* Result `{rows: [{row, height, cells}], height: Σ, edges, offsetX, lines: []}`.

**Placement (`_placeTable`):**
```
repeat = props.repeatHeader && rows.length > 1
for i, row in rows:
    fits = y + row.height <= page.contentBottom + 0.01         // NOTE: contentBottom, not limitBottom (footnotes ignored)
    if !fits && page.items.length > 0:
        nextColumn/openPage; y = page.contentTop
        if repeat && i > 0: y += emit(rows[0], y)               // only the FIRST row repeats
    y += emit(row, y)
emit(row, top): for each cell item → page.items.push({blockId, lines: placeLine(ln, top + ln.y, colDx, 0)})
                page.tableRects.push({tableId, row: row.row, x: firstCell.x + colDx, y: top, w: Σ cell.w, h: row.height,
                                      cells: [{x: cell.x + colDx, w: cell.w, shading}], borders: props.borders || 'grid',
                                      borderColor: props.borderColor || null})
```
* **Rows never split** across pages. A row taller than the page overflows. Multiple header rows are **[NOT IMPLEMENTED]** (only row 0 repeats). `cantSplit` is irrelevant since rows never split anyway.
* A vertically merged cell's shading/border box spans only its first row (the rect height = that row's height), while its text may extend below. Merged continuation cells have no rect **[BUG]**.
* Borders paint mode: `'none'` → no borders; `'horizontal'` → horizontal lines only; anything else → full grid. Borders use 1 px (`BORDER_PX`) in `borderColor` or the theme default. They are painted **under** the cell text.
* Cell paragraphs' list markers/hyphens/floats are not shifted to the cell (§20).

---

## 14. Headers and footers ("bands")

### 14.1 Storage (paginator.js:968-984)
Band paragraphs live in `doc.body` with `hf = {kind, variant}`. `kind` = 'footer' if `hf.kind == 'footer'`, else 'header'. `variant` ∈ {'default','first','even'}; anything else → 'default'. Section = `block.sec || sections[0].id || 'sec1'`. They are grouped into the map key `"<secId>|<kind>|<variant>"`, keeping body order.
`section.headers/footers` refs and `linkToPrevious` from plan §5.1 are **not** used by layout. A section without its own band blocks gets no header/footer **[NOT IMPLEMENTED]** inheritance.

### 14.2 Variant choice (`_bandKey`, paginator.js:991-1006)
```
isFirst = (pageNo == sectionFirstPage);  isEven = (pageNo % 2 == 0)      // ABSOLUTE page number parity
if isFirst && section.differentFirst:   candidates = ['first']           // no fallback to default
elif isEven && section.differentEven:   candidates = ['even', 'default'] // falls back to default if no even band
else:                                   candidates = ['default']
return first candidate key that exists in bands, else null
```

### 14.3 Band metrics (`_bandMetrics`, paginator.js:1013-1036) — computed at `openPage`
```
headerDist = tw2px(page.headerDist ?? 720);  footerDist = tw2px(page.footerDist ?? 720)
headerH = Σ over header paragraphs (breakParagraph(width = geo.textWidth).height + before + after)    // fields NOT resolved yet
footerH = same for footer
contentTop    = max(margins.top, headerDist + headerH)
footerTop     = hPx - footerDist - footerH
contentBottom = min(hPx - margins.bottom, footerH ? footerTop : hPx - margins.bottom)
contentBottom = max(contentTop + 1, contentBottom)
headerY = headerDist;  footerY = footerTop
```
Bands use the full text width between margins (not the column width). They never hyphenate. A tall header pushes the body down, and a tall footer pulls the body bottom up.

### 14.4 Pass 4 — place bands with fields (`_layoutBands`, `_placeBand`, paginator.js:1064-1097)
For each page, with `ctx = {page: pageNo, pages: totalPages}`, lay out each band paragraph:
```
y = startY (headerY or footerY)
y += before
breakParagraph(resolveFieldsIn(block, ctx), textWidth)   // re-broken per page
lines' y = absolute
y += Σ line heights + after
```
`page.header = {items, y}`, likewise `page.footer`. Band lines' x is relative to the left margin.

### 14.5 Field evaluation (`resolveFieldsIn`, paginator.js:111-128)
* Only in **bands**. A **copy** of the block gets `result = String(pageNo)` for `code == 'PAGE'` and `String(totalPages)` for `code == 'NUMPAGES'`. The model is never mutated (tests/headerfooter.test.js:141).
* `pageNo` is the absolute 1-based page index. Number formats (i, ii; A, B), "start at" and per-section restart are **[NOT IMPLEMENTED]**.
* PAGE/NUMPAGES fields in the **body** show their cached `result`. They are not updated by layout.
* The band height is measured with the cached results (pass 1). Changing digits changes width only, not height. A header that wraps differently with the real number can overlap the body slightly. That is accepted behaviour.
* All other fields (DATE, TOC, NOTEREF, …) are painted as their cached `result`.

### 14.6 Interaction
* `bandKindOf(blockId)` → 'header' | 'footer' | null.
* The active band page (`_hfPage`, default 1) is set by a click in a band or by `setActiveBandPage(n)`. Band paragraphs exist once per page, so caret lookups prefer the instance on `_hfPage`, else the first page that has it (paginator.js:1240-1247).
* Paint: bands are always drawn. While editing a header the body is dimmed, and while editing the body the bands are dimmed. This is CSS only (canvas.css:239-260, see UI spec).

---

## 15. Footnotes and endnotes (paginator.js:863-959)

* **Collection:** body paragraphs with `fn.id` are broken **once per reflow** at `pageGeometry(sections[0]).textWidth` (always the first section's width, no hyphenation). They are stored by `String(fn.id)` as `{block, lines, height (Σ lines; before/after NOT included), kind: fn.kind == 'endnote' ? 'endnote' : 'footnote', placed: false}`.
* **Reference detection:** a line references note X if one of its segs has `kind == 'field'` and the model run `block.runs[seg.runIdx]` is a field whose `code` matches `/^NOTEREF\s+(\S+)/`; capture group = note id. Only `kind == 'footnote'` notes that are not yet placed count.
* **Reservation:** during line placement (§13.3 step 4), the note heights (+14 px gap if it is the page's first note) are part of the overflow test. Once the line is placed, its notes join that page (the "note follows its reference" rule). A note is never split across pages. A huge note can overflow.
* Lines inside **tables** never reserve or place footnotes, so notes referenced from table cells are never shown **[BUG]**.
* **Pass 3 placement:** for each page with notes, `y = contentBottom - notesHeight`. Stack all note lines (copies with absolute y, x unchanged). `page.footnotes = {items, top: contentBottom - notesHeight}`. Pages without notes get `footnotes = null` (the field is always normalised).
* **Separator:** a horizontal rule at `top - 8` px, width 33% of the text width, 1 px `#8A8886` (pages.js:884-892, canvas.css:422-427).
* **Endnotes:** all `kind == 'endnote'` notes, in body order, go on the **last page**. Start at `y = max(contentTop, bottom of the last page's lowest item line)` and stack. `lastPage.endnotes = {items, top}`. They are **not** paginated and may run past the page bottom **[NOT IMPLEMENTED]** overflow handling.

---

## 16. Caret mapping and hit-testing

### 16.1 Global line index (`_reindex`, paginator.js:1187-1226)
`_lines` is a flat list of `{gi, pageIdx, itemIdx, lineIdx, page, item, line, band}` built in this order:
1. Body items, page by page, item by item. Table cells come cell by cell in placement order: row-major, and each cell's paragraphs together.
2. Notes (`band = 'note'`): footnotes, then endnotes, page by page.
3. Bands (`band = 'header'|'footer'`): per page, the header and then the footer.

`_byBlock: blockId → [gi…]`.

### 16.2 `_findLineRef(pos, preferPrev=false)` (paginator.js:1234-1261)
* `off = clamp(pos.offset, 0, blockLength)`.
* Default: the first of the block's lines with `off < line.end`, else the last line. **An offset exactly at a soft line boundary belongs to the next line.**
* `preferPrev` (used for a range end): the last line with `off > line.start`, or the first line. This keeps the selection end on the previous line at a boundary.
* Band blocks: restricted to instances on `_hfPage` (§14.6).

### 16.3 `xOfOffset(line, offset)` (breaker.js:938-950) — x relative to the left margin
* `offset <= line.start` → `segs[0].x`.
* If a seg has `start <= offset < end`: a text seg returns `seg.x + widthUpTo(seg, offset - seg.start)` (prefix measure + `spaceExtra * #spaces in prefix`). Any other kind returns `seg.x`.
* Otherwise → `lastSeg.x + lastSeg.w`.

### 16.4 `xToOffset(line, x)` (breaker.js:914-929, 884-905)
* No segs → `line.start`. `x <= segs[0].x` → `segs[0].start`.
* If x falls in a seg `[seg.x, seg.x + w)` → `offsetInSeg`:
  * non-text (tab/image/field/math/dropcap): `x < seg.x + w/2 ? start : end`.
  * text: walk code points. `dx = max(0, x - seg.x)`. For each next boundary `j` with prefix width `wj`: if `dx < wj`, return `start + (dx >= (wi + wj)/2 ? j : i)` (Word's half-character rule).
* Past the end: `line.last ? line.end : visibleEnd(line)`. `visibleEnd` is the end without trailing U+0020s, so clicking right of a soft-wrapped line puts the caret before the hanging spaces and not on the next line.

### 16.5 `posToXY(pos)` → `{pageNo, x: margins.left + xOfOffset, y: line.y, height: line.height}` (paginator.js:482-488)
Caret: 1 px wide, colour `#201F1E`, blinks with a 1 s step animation. The blink resets on each move (pages.js:372-401).

### 16.6 `xyToPos(pageNo, x, y)` (paginator.js:497-547)
1. Clamp the page index.
2. `_bandPosAt` (paginator.js:1103-1127): if `y < contentTop` or `y > contentBottom`, look in the header (above) or footer (below). `colX = clamp(x, margins.left, wPx - margins.right) - margins.left`. Pick the nearest line by vertical distance. That sets `_hfPage` and returns the band Pos. If the band is empty, fall through.
3. If the page has no lines, search alternately up and down for the nearest page with lines. If there is none → null.
4. `colX` as above. `yy = clamp(y, margins.top, hPx - margins.bottom)` (margins, not contentTop).
5. Across **body items only**, take the line minimising the vertical distance (0 if inside). Ties go to the smaller horizontal distance to the line's seg span (`lineDistanceX`). This picks the right column or table cell.
6. Return `{blockId, offset: xToOffset(line, colX)}`.

Footnote/endnote lines are **not** reachable by click: they are not in `page.items` and lie inside `[contentTop, contentBottom]`. The comment at paginator.js:1209-1210 claims otherwise **[BUG]**.

### 16.7 `posLineMove(pos, dir, goalX)` (paginator.js:567-583)
`gi ± 1` in `_lines`. Return null at the ends, or if the target's `band` differs from the source's (body ↔ note ↔ header/footer are never crossed by arrows). `colX = goalX - target.page.margins.left` when `goalX` (page coords) is finite, else the current `xOfOffset`. Return `xToOffset(target.line, colX)`. Inside tables, Up/Down follow `_lines` order (cell by cell), not the visual column.

### 16.8 `rangeRects(range)` (paginator.js:590-628)
Find `a = findLineRef(start)` and `b = findLineRef(end, preferPrev)`, swapping them if inverted. An empty collapsed range gives []. For each gi in `[a, b]`: `from = (first ? max(line.start, startOff) : line.start)`, `to = (last ? min(line.end, endOff) : line.end)`, `w = xOfOffset(to) - xOfOffset(from)`, `+ 4 px` (PILCROW_W) if `line.last && gi < gi1`. Skip if `w <= 0`. Rect = `{pageNo, x: margins.left + x1, y: line.y, w, h: line.height}`. The selection fill is `rgba(43,87,154,.25)`.

### 16.9 `lineAt(pos)` → `{page, item, line, lineIdxGlobal}`. `totalHeightPx(gap) = Σ hPx + gap*(n-1)`.

---

## 17. Incremental reflow and caching

* `invalidate(ids)` adds the ids to `dirty`. If an id is a cell paragraph, its table id is added as well (paginator.js:204-216). `invalidateAll()` clears the cache and sets `allDirty`.
* Wiring (main.js:486-492): `doc:changed {blockIds}` → `invalidate(blockIds)`. `structural` or missing ids → `invalidateAll()`. Any change clears the list-label cache. The reflow is scheduled once per animation frame.
* Every reflow re-runs **all of pagination**, plus band and footnote breaking (both uncached). Only the paragraph/table/SmartArt breaking is incremental. The performance budget (plan §9.6) is: typing (insert + repaginate) < 16 ms; paginating 500 pages < 500 ms; 60 fps scroll; < 600 DOM nodes; opening a 5 MB .docx < 1 s to editable.
* Stale-marker pitfall: list labels are recomputed lazily, but cached lines of non-dirty paragraphs keep their old `marker`. Non-structural edits that change numbering elsewhere can show stale numbers until a structural change. For parity, accept it. For correctness, invalidate every list paragraph whose label changed.

---

## 18. View: virtualization, zoom and paint rules (layout/pages.js)

### 18.1 Holder geometry (`_measure`, pages.js:626-640)
`pageGapPx = 24`. `top[0] = 24`, and `top[i+1] = top[i] + hPx[i] + 24`. `left[i] = max(0, (maxW - wPx[i])/2)`, which centres narrower pages. Content height = `24 + Σ (hPx + 24)`. The holder is centred in the viewport with `holderLeft = max(0, (viewportW - contentW*z)/2)`.

### 18.2 Virtualization (pages.js:274-325)
Visible range = `[scrollTop/z, (scrollTop + viewportH)/z]`. Mount every page intersecting it, plus **BUFFER = 1** page above and below. If none intersects, use the nearest page (`_pageIndexAtY`: the first page with `y < top + hPx + 12`). Unmount the others into a pool of at most 8 recyclable page nodes. A page is repainted only when the layout version changed. Overlay layers, bottom to top: comments, find highlights (cap 4000 rects; the active match always included), spelling (cap 4000), selection, caret, image handles. Only rects of mounted pages are painted. In JUCE, a single `Component` that paints only the visible pages and caches per-page images by layout version gives the same effect.

### 18.3 Zoom (pages.js:332-349)
`z = clamp(z, 0.1, 5)`. Keep the document point under the viewport centre fixed:
```
hx = (scrollLeft + vw/2 - holderLeft)/old;  hy = (scrollTop + vh/2)/old
apply z; scrollLeft = max(0, hx*z + holderLeft - vw/2); scrollTop = max(0, hy*z - vh/2)
```
`clientToPage(cx, cy)`: `hx = (cx - holderRect.left)/z`, `hy = (cy - holderRect.top)/z`. Page = `_pageIndexAtY(hy)`. Return `{pageNo, x: hx - left[i], y: hy - top[i]}`.
`scrollPosIntoView(pos)`: padding 24 px. Scroll minimally so that the caret rect, scaled by z, is visible both vertically and horizontally.

### 18.4 Painting a page (pages.js:815-865)
Paint order:
1. White page (or `doc.pageColor`).
2. Watermark: `doc.watermark {text|rid, font (default Aptos), size (default round(wPx/8) px), color (default #C8C6C4), opacity (default 0.4), diagonal (default true → rotate −35°)}`. Bold, centred, under the text. An image watermark is max 70% × 70%.
3. Body clip box `[margins.left, contentTop] .. [wPx - right, contentBottom]`.
4. Column separators.
5. Table row/cell rects (backgrounds and borders).
6. SmartArt.
7. Lines.
8. Header and footer, unclipped.
9. Footnotes with the rule, then endnotes.
10. Page border (`doc.pageBorder {style, width (≥ 0.5, default 1) px, color (default #000000), space (default 24) px inset}`) on top.

Lines (`_buildLine`, pages.js:916-975), relative to the line top:
* Paragraph deco box.
* Floats at `(f.x, 0)` relative to the line. 'behind' goes under the text, 'front' over it.
* List marker.
* Segs:
  * image: box at `(seg.x, baseline - hPx)`.
  * math.
  * text, field, dropcap: segs with `text != ''` (tabs and empty segs are not painted).
* Hyphen.
* The paragraph-mark position for "show ¶" is `round(lastSeg.x + lastSeg.w) + 1` on lines with `last`.

Text seg (`_buildSeg`, pages.js:1156-1248):
* `rise = sup ? baseSizePx*0.33 : sub ? -baseSizePx*0.16 : 0`, where `baseSizePx` = `fontSizePx` without sub/sup.
* `top = baseline - fontMetrics(char).ascent - rise`. Draw the glyph baseline at `top + ascent`. The rise is **not** reflected in line metrics, so superscripts may poke above the line.
* Text = `displayText`, whitespace preserved. Font = stack, `fontSizePx`, weight 700 if bold, italic, small-caps.
* Colour: `char.color` ('auto' → `#201F1E`; a 6-hex value gets '#'). Links with no or auto colour → `#0563C1`. Revision `ins`/`del` → author colour (`AUTHOR_COLORS[hash % 7]`, hash = `h*31 + code` as uint32, palette `#C0392B #1F6FB2 #7D3C98 #117A65 #B9770E #943126 #1A5276`).
* Highlight → background.
* Decorations: underline if `underline != 'none'`, if the char is a link, or if `ins`. Line-through if `strike` or `del`. Style: double/dotted/dashed for `underline` 'double'/'dotted'/'dash'.
* `spaceExtra` → word spacing.
* WordArt `char.effect {gradient[], stroke{color,width}, shadow, spacing}`: paint only.
* Link tooltip text (verbatim Spanish): `"<url o linkTip>\nCtrl+clic para seguir el vínculo"`.

Image handles: 8 handles, `nw n ne e se s sw w`. The corners keep the aspect ratio (pages.js:72-87).

---

## 19. Constants (all in one place)

| Constant | Value | Ref |
|---|---|---|
| px per twip | 1/15 | units.js:24 |
| default font / size | Aptos / 11 pt | measure.js:28-31 |
| sub/sup scale | 0.65 | measure.js:34 |
| font metric fallback | ascent 0.9, descent 0.3 (× sizePx) | measure.js:175-176 |
| measure cache cap | 20000 (clear all) | measure.js:37 |
| fake measurer | 8 px/UTF-16 unit; lineHeight 1.2 × sizePx | measure.js:213 |
| default tab step | 720 tw (48 px) | breaker.js:48 |
| drop cap default lines / range | 3 / [2, 10] | breaker.js:50, 240 |
| drop cap gap | 120 tw (8 px) | breaker.js:52 |
| float text gap | 10 px | breaker.js:54 |
| EPS | 0.001 px (breaker); 0.01 px (paginator fit tests) | breaker.js:56; paginator.js:251, 392, 421, 836 |
| line multiple base | 240 (`line/240`) | breaker.js:369-373 |
| border min width | 0.75 px | breaker.js:336 |
| hyphenation | MIN_HEAD 2, MIN_TAIL 2, MIN_WORD 5 | hyphenate.js:25-29 |
| fallback page | A4 11906×16838 tw, margins 1440 | paginator.js:45-53 |
| header/footer distance default | 720 tw | paginator.js:1017-1018 |
| pilcrow selection width | 4 px | paginator.js:56 |
| max columns | 12 | paginator.js:62 |
| default column spacing | 708 tw | paginator.js:65 |
| footnote gap | 14 px; rule at top − 8 px, 33% width | paginator.js:68; pages.js:890 |
| cell padding default | 108 tw (7.2 px) | table.js:28 |
| web view | min width 320, default 900; height min 400, default 1200; side margin clamp(round(5%·w), 24, 96); top/bottom 24 | paginator.js:171, 1291-1296 |
| page gap | 24 px | pages.js:128 |
| virtualization buffer / pool | 1 page / 8 nodes | pages.js:46, 732 |
| zoom range | 0.1 – 5 | pages.js:333 |
| sup rise / sub drop | 0.33 / 0.16 × base size | pages.js:55-56 |
| auto text colour / link colour | #201F1E / #0563C1 | pages.js:49-52 |
| highlight caps | 4000 find rects, 4000 spell rects | pages.js:63-66 |
| list hanging / level step / first level | 360 / 360 / 720 tw | lists.js:203-207 |

---

## 20. Known bugs, gaps and pitfalls (decide explicitly; recommended action given)

1. **keepNext, keepLines, widowControl are ignored.** Default Normal has `widowControl: true`, and Heading1 has `keepNext: true`, yet Skriba splits freely. *Parity:* ignore them. Keep round-tripping the fields.
2. **No blank page for `evenPage`/`oddPage` section starts**, and no header inheritance via `linkToPrevious`. *Parity:* replicate.
3. **Continuous section + multi-column**: y is not reset, but switching to column 2 resets y to `contentTop`, which overlaps the content above on the same page. `page.columns` is overwritten for the whole page (separators drawn for the new section over the old part). *Recommend fix:* start the columns at the current y, or document the mismatch.
4. **Unequal column widths:** every column is broken at `widths[0]`. *Parity:* replicate; a fix requires re-breaking per column.
5. **Hyphen position under justify:** `hyphen.x` uses the pre-justification line width, so the hyphen overlaps the stretched last word (breaker.js:679). *Recommend fix:* `x = lastSeg.x + lastSeg.w` after justification.
6. **`placeLine` does not shift `line.hyphen`** for columns > 0, and `_layoutTable` does not shift `marker`, `hyphen` or `floats` into cells (paginator.js:79-88, 742-746). List bullets inside table cells and hyphens in column 2 are drawn at the wrong x. *Recommend fix*: shift all x-bearing sub-objects.
7. **Paragraph height reservation for 'square' floats is unused** by the paginator (it sums line heights), so a tall float overlaps the next paragraph. *Recommend:* keep parity unless fixing floats in general.
8. **Footnotes referenced inside tables never appear**, and endnotes are not paginated (may overflow the last page).
9. **Click into footnotes/endnotes is not possible** (`xyToPos` only searches body items), despite the code comment.
10. **Breaks between runs mid-word** (tokens never merge across runs) and **justification of lines ending with Shift+Enter**: both differ from Word. Decide whether to stay at parity (default) or fix.
11. **No soft-hyphen (U+00AD) or explicit '-' break opportunities**, and no tab alignment types or leaders.
12. **Line gap is excluded** from line height (ascent+descent only), and extra leading is split equally above and below. This must match exactly or pagination drifts.
13. **Measurement must be prefix-based with full shaping**, cached by (font, text). Sub/sup metrics use the scaled size, and the sup rise is paint-only.
14. **Offsets are UTF-16 code units** even if the C++ string type is UTF-8.
15. **JUCE font height ≠ CSS font-size**: construct fonts from em size.
16. **Tables take Normal's paragraph spacing** (after = 160 tw) before and after the table.
17. **Band height is measured before PAGE/NUMPAGES resolution**, and band text is re-broken per page with the real numbers.
18. **`letter spacing` (`char.spacing`) is ignored**, and the WordArt `effect.spacing` is paint-only. That is a measurement mismatch in Skriba.
19. **Drop cap** rises above the first line rather than spanning N lines downward.
20. **List label cache staleness** in non-dirty paragraphs (§17).

---

## 21. Tests to port (Catch2) — all use `fakeMeasurer(8)` and a fake resolver

* `tests/breaker.test.js`: word wrap at U+0020 (width 7×8: `'aaa bbb ccc'` → `'aaa bbb '` [0,8) + `'ccc'` [8,11)). Character fallback (`'abcdefghij'` in 32 px → [0,4) [4,8) [8,10)). NBSP no-break. Empty paragraph (1 line, height ≈ 14.67×1.2). Line/page breaks. Center/right. Justify. Indents incl. hanging. Default tab = 48 px. Explicit tabs. `xOfOffset`/`xToOffset` half-char rule. Soft-wrap click. Justify stretch in `xOfOffset`. Non-text length 1. Per-run char. Line multiple.
* `tests/paginator.test.js`: single page; split by lines; manual page break; spacing suppressed at page top; `layout:done`; cache reuse; `totalHeightPx`; section → new page; `xyToPos` clamping; empty doc → 1 page; `posToXY`/`xyToPos` round trip; `lineAt`; `posLineMove` with goalX; `rangeRects` (inverted, multi-line, multi-block, single line).
* `tests/layout.test.js`: column widths (two columns = (textWidth − 47.2)/2 each); flow into column 2; x shift; unequal widths; column break; page break with columns; continuous section; syllables and hyphenation (§10).
* `tests/headerfooter.test.js`: bands out of the body; repeat on every page; PAGE/NUMPAGES per page without mutating the model; tall header pushes the body; footer trims the bottom; differentFirst/differentEven; caret and clicks in bands; arrows don't cross into bands.
* `tests/import-layout.test.js`: lineRule exact/atLeast; borders add to first/last line; none/nil/auto ignored; cell shading/border colour; vAlign; cellMargins; contextualSpacing; pageBreakBefore.
