# 03 — Editor behaviour: caret, selection, input, commands and undo

Source of truth: Skriba web app at `C:/xampp/htdocs/Skriba`. All paths below are relative to `public/js/` unless stated otherwise.
Files read fully: `editor/editor.js`, `editor/caret.js`, `editor/selection.js`, `editor/input.js`, `editor/find.js`, `editor/outline.js`, `commands/command.js`, `commands/registry.js`, `ui/contextmenu.js`, and the supporting files the behaviour depends on: `formatting/charfmt.js`, `formatting/parafmt.js`, `core/richtext.js` (mutators, lines 370–740), `ui/dialogs/find.js` (find pane), `main.js` (router `route()` lines 697–938, protection guard 292–372, canvas events 541–583, table/list/painter helpers). Also `plan.md` §6 FASE 2/8/9/10 and §8, and `CONTRACTS.md`: global conventions, editor/*, commands/*, and the wave-2 additions.

What the source actually does takes priority over the plan. Where `plan.md` describes a behaviour that Skriba never implemented, this spec says **NOT IMPLEMENTED**, and the C++ port should copy Skriba's real behaviour unless a later spec says otherwise. Anything marked **BUG/QUIRK** is a defect in the source. For each one this spec states whether the port should copy it or fix it.

---

## 0. Architecture summary (how the pieces talk)

```
key/mouse/IME ──► InputHandler (editor/input.js)
                     │  navigation/editing keys → Editor methods
                     │  formatting/app shortcuts → editor.route(id, params) → main.js route()
                     ▼
                  Editor (editor/editor.js) ── owns SelectionModel (editor/selection.js)
                     │  never mutates the document directly
                     ▼
                  commands facade (commands/registry.js#createCommands)
                     │  each factory EXECUTES immediately, pushes onto CommandStack,
                     │  returns the executed command with .result (e.g. {caretPos})
                     ▼
                  core/richtext.js mutators + DocModel.body splices
                     │
                     ▼
                  bus 'doc:changed' → main.js invalidates layout → reflow (next frame)
                  → 'layout:done' → editor.refreshCaret()
```

Rules that all modules follow:
- The Editor never mutates the model directly. Every mutation goes through a command factory, so every mutation can be undone (editor.js:18-21).
- After every edit the caret is set to `cmd.result.caretPos`. If that is missing, a fallback position computed by the editor is used (`_caretOf`, editor.js:791-799). The fallback order is: `result.caretPos`, then `result` if it is itself a Pos, then `result.pos`, then the fallback.
- Commands never call the layout. Layout invalidation is driven by the `doc:changed` event payload: `{structural:true}`, or `{blockIds:[...]}` (registry.js:27-33, main.js:487-492).
- After any edit or navigation the caret is kept visible (`view.scrollPosIntoView(focus)`). The only exception is while a mouse drag is in progress (editor.js:597-614).
- C++ port: keep the same layering, with an `Editor` and `Selection` in the headless engine library. Keyboard and IME translation goes in the JUCE UI layer, and the command facade lives in the engine so the CLI and tests can call it.

---

## 1. Position, range and linear text model

### 1.1 Pos
`Pos = { blockId: string, offset: int }` (CONTRACTS.md "Convenciones globales"; caret.js:8-16).

- `offset` is a **linear offset inside one block**, counted in **UTF-16 code units**. It must satisfy `0 ≤ offset ≤ blockLength(blockId)`.
- Run lengths in linear space:

| run `t` | linear length | char in "linear text" (caret.js) | char in search text (find.js) | char in plain-text copy (editor.js) |
|---|---|---|---|---|
| `text` | `text.length` (UTF-16; an emoji = 2) | its text | its text | its text |
| `tab` | 1 | U+FFFC | `\t` | `\t` |
| `break` (`type` line/page/column) | 1 | U+FFFC | `\n` | `\n` |
| `image` | 1 | U+FFFC | U+FFFC | `""` (nothing) |
| `field` | 1 | U+FFFC | U+FFFC (field `result` is NOT searched) | `String(run.result ?? '')` |
| any other non-text run | 1 | U+FFFC | U+FFFC | `""` |
| zero-length "carrier" text run `{t:'text',text:'',char}` | 0 | `""` | `""` | `""` |

Sources: caret.js:76-96, find.js:44-60, editor.js:51-79, richtext.js:314-328.

- **C++ note:** the offset unit is UTF-16. If the C++ model stores UTF-8 or `juce::String`, the port still has to expose UTF-16 offsets, or else convert every offset in the JSON format, bookmarks, comments (`start`/`end`) and search results. Bookmarks and comment anchors in the saved JSON hold these UTF-16 linear offsets (registry.js:1300, 1822-1824). The safest choice is to store block text internally as UTF-16 (`std::u16string`).
- **Surrogate rule:** a Pos must never sit between a high and a low surrogate. `clampPos` moves such an offset back to the start of the pair (caret.js:129-147). The richtext mutators snap range starts backward and range ends forward (richtext.js header lines 17-21).
- Word segmentation counts **code points**, not grapheme clusters. Combining sequences and ZWJ emoji are not treated as one unit. This is acceptable to copy.

### 1.2 Range
`Range = { start: Pos, end: Pos }`. Every public API normalises it so that `start ≤ end` in document order (caret.js:165-177). A range is **collapsed** when `start.blockId == end.blockId && start.offset == end.offset` (caret.js:183-188).

`comparePos(a,b)`: compare the block indices in `doc.body` first, then the offsets. Returns -1, 0 or 1 (caret.js:157-163).

### 1.3 Document order = `doc.body` order
Navigation walks **every block of `doc.body` in array order** using `blockAt(i)` and `blockCount`. The body contains, in this order:
1. normal paragraphs, `t:'table'` blocks, each table's cell paragraphs placed contiguously right after their table block (registry.js:156-174, 1407-1437), SmartArt blocks, footnote paragraphs (`fn`);
2. **header/footer band paragraphs (`hf`), always grouped at the END of the body** (registry.js:281-297, 1743-1786).

**BUG/QUIRK (important):** `docStart`/`docEnd`, `moveByChar` and `moveByWord` (caret.js:106-120, 206-302) do not skip table blocks or band paragraphs.
- `Ctrl+End`, or →/Ctrl+→ at the end of the last body paragraph, therefore moves the caret into the first band paragraph (header/footer) when bands exist.
- The arrows also step through a `t:'table'` block, which has no runs, so it is a 0-length stop.
- Vertical moves (`layout.posLineMove`) and clicks (`layout.xyToPos`) depend on the layout and avoid these blocks.

Recommendation for the port: define a "flow order" iterator that skips `hf` paragraphs while not in header/footer editing mode, and skips non-paragraph blocks. Use it for `docStart`/`docEnd`/`moveByChar`/`moveByWord`. Treat this as a deliberate fix and record it in the port notes.

### 1.4 clampPos (caret.js:129-147)
```
clampPos(doc, pos):
  if pos invalid or block id not found → return docStart(doc)
  off = floor(pos.offset) (non-finite → 0); off = clamp(off, 0, blockLength)
  linear = linearText(block)
  if 0 < off < len and linear[off] is low surrogate and linear[off-1] is high surrogate: off -= 1
  return {blockId, off}
```
`docStart = {firstBlock.id, 0}` and `docEnd = {lastBlock.id, blockLength(last)}`. An empty document has id `''` and offset 0, but a valid document always has at least one block.

The registry has its own `clampPos` (registry.js:325-336). It does the same thing **without** the surrogate snap.

---

## 2. Selection model (editor/selection.js)

| Field | Meaning |
|---|---|
| `anchor: Pos` | Fixed end of the selection. Initial value `docStart`. |
| `focus: Pos` | Moving end, which is where the caret is drawn. Initial value is equal to anchor. |
| `goalX: number \| null` | Remembered x in **layout px at zoom 1** (page coordinates) for vertical navigation. `null` means "recompute". |
| `range` (getter) | `normalizeRange(anchor, focus)`. Always returns fresh copies. |
| `isCollapsed` | `anchor == focus`. |

Operations:
- `set(pos, {extend=false, keepGoalX=false, silent=false})` (selection.js:73-86):
  - `p = clampPos(pos)`
  - `changed = p != focus || (!extend && !isCollapsed)`
  - `focus = p`; if `!extend`, `anchor = p`; if `!keepGoalX`, `goalX = null`
  - emit `selection:changed` if `changed && !silent`.
- `setRange(range)` (92-107): normalise, clamp both ends, then set **anchor = start and focus = end**. `goalX = null`. Emits only if something changed.
  - Consequence: after a double-click, a find hit, or Tab into a cell, the focus is at the END of the range. Shift+← therefore shrinks the range from the right.
- `selectAll()` = `setRange(docStart, docEnd)` (113-116).
- `collapse(side)` (122-125) collapses to the start or end of the range. It is not used by the editor.
- `revalidate()` (131-140) re-clamps anchor and focus. **Nothing calls it.** See the undo pitfalls in §9.6.
- `contains(pos)` (143-149) is inclusive at both ends. It is used by right-click (§6.4).
- The event `selection:changed` is emitted **only on a real change** (no cascade). The listener in main.js (main.js:529-534) repaints the caret, status bar, header/footer band editing state, and the ribbon state.

**goalX invalidation:** every `set`/`setRange` without `keepGoalX` resets `goalX` to null. Only vertical moves (`line`, `pageUp`, `pageDown`) pass `keepGoalX: true`, after first assigning `selection.goalX = goal`.

---

## 3. Caret movement (Editor.moveCaret, editor.js:371-443)

Signature: `moveCaret(unit, dir = 1, {extend = false})`. `extend` is true when Shift is held. Every move starts from `selection.focus`.

| Key | Without Shift | With Shift | unit / dir |
|---|---|---|---|
| ← / → | move one char. **If a selection exists, collapse it to its start (←) or end (→) without moving further** (editor.js:378-385) | extend by one char | `char`, ∓1 |
| Ctrl+← / Ctrl+→ | word move (§3.2) | extend by word | `word`, ∓1 |
| ↑ / ↓ | line move keeping goalX (§3.3) | extend | `line`, ∓1 |
| Home / End | start/end of the **visual line** (§3.4) | extend | `lineStart` / `lineEnd` |
| Ctrl+Home / Ctrl+End | `docStart` / `docEnd` | extend | `docStart` / `docEnd` |
| PageUp / PageDown | viewport-sized jump (§3.5) | extend | `pageUp` / `pageDown` |

Notes:
- Only the `char` unit collapses an existing selection to one of its edges. For `word`, `line`, Home/End and so on, the move is computed **from the focus** and the selection collapses there (Word itself collapses first for some of these keys; Skriba does not). Copy Skriba's behaviour.
- After each move: `sel.set(clampPos(next), {extend})`, then `refreshCaret()`, which repaints and scrolls the caret into view.
- In the source, AltGr (Ctrl+Alt) is **not** treated as Ctrl for shortcuts (input.js:281). The navigation keys use the same `ctrl` flag, so Ctrl+Alt+→ moves by one char.

### 3.1 moveByChar (caret.js:206-246)
```
dir > 0:
  if offset < len: next = offset+1; if the code unit at offset is a high surrogate followed by a low one, next += 1
  else: if a next block exists → {nextBlock, 0} else stay
dir < 0:
  if offset > 0: prev = offset-1; if the unit at prev is low and prev-1 is high: prev -= 1
  else: if a previous block exists → {prevBlock, blockLength(prev)} else stay
```
Non-text runs count as one step each: tab, image, field and break.

### 3.2 moveByWord (caret.js:267-302), "Word style"
A word char is `[\p{L}\p{N}]`, meaning Unicode letters and digits only. Everything else is a separator: spaces, punctuation, the U+FFFC object char, emoji, underscore. This deliberately simplifies Word, which treats punctuation as its own stop (caret.js:13-15).
```
forward (Ctrl+→):
  if offset >= len: return {nextBlock,0} if one exists, else stay   // a paragraph boundary is a stop
  i = offset
  while i<len and isWord(cpAt(i)): i += cp length      // finish the current word
  while i<len and !isWord(cpAt(i)): i += cp length     // skip separators
  return i      // start of the next word, or the end of the block
backward (Ctrl+←):
  if offset == 0:
     no prev block → stay
     prev block empty → {prev, 0}
     else → moveByWord({prev, len(prev)}, -1)        // start of the last word of the previous block
  i = offset
  while i>0 and !isWord(cpBefore(i)): i -= cp length   // skip separators
  while i>0 and isWord(cpBefore(i)): i -= cp length    // go to the word start
  return i
```

### 3.3 Up/Down with goal x (editor.js:391-399, 831-856)
```
goal = selection.goalX ?? layout.posToXY(focus).x ?? 0
p = layout.posLineMove(focus, dir, goal)
if p is null (no layout, or already on the first/last line): p = dir<0 ? docStart : docEnd
selection.goalX = goal; selection.set(p, {extend, keepGoalX:true})
```
- Pressing ↑ on the first line therefore jumps to the document start, and ↓ on the last line jumps to the document end.
- The layout (spec 02) provides `posLineMove(pos, dir, x)`: it returns the Pos on the adjacent visual line whose x is closest to `x`, crossing pages.
- The layout also provides `posToXY(pos) → {x, y, height, pageNo}`.

### 3.4 Home/End (caret.js:321-329)
`lineStartEnd(layout, pos)` uses `layout.lineAt(pos).line` and returns `{start:{line.blockId, line.start}, end:{line.blockId, line.end}}`. If the layout cannot resolve the line, it returns `{pos, pos}`.
- On the last line of a paragraph, `line.end` can be `blockLength + 1` (the virtual ¶). `clampPos` fixes this.
- **QUIRK (caret affinity):** on a wrapped line, `line.end` equals the start offset of the next line. Skriba has no upstream/downstream affinity, so End can draw the caret at the start of the next line, depending on how `posToXY` resolves the ambiguous offset. The port should either add an affinity flag to the caret (recommended) or make `posToXY` prefer the end of the earlier line for that offset when it was reached through End.

### 3.5 PageUp/PageDown (editor.js:401-419, 859-870)
```
step = PageUp ? -1 : +1
goal = goalX as above
lines = max(1, floor((canvasClientHeight / zoom) / lineH) - 1)
    canvasClientHeight defaults to 700 if unknown; lineH = posToXY(focus).height if > 0, else 20
p = focus
repeat `lines` times: nx = posLineMove(p, step, goal); if null break; p = nx
if p == focus (no movement): p = step<0 ? docStart : docEnd
goalX = goal; set(p, {extend, keepGoalX:true})
```
The view does not scroll by a page explicitly. It scrolls only because the caret has to stay visible.

---

## 4. Selection gestures

| Gesture | Behaviour | Source |
|---|---|---|
| Click (button 0) | Collapse the caret at `xyToPos`. A click outside any page (grey area) does nothing except focus the editor. | editor.js:635-662 |
| Shift+click | `set(pos, {extend:true})` extends from the anchor. | editor.js:658-661 |
| Double-click | Select the word at pos (`wordRangeAt`, §4.1). With no word under pos (space or punctuation), the caret collapses at pos. **Mouse drag-mode = word.** | editor.js:653-656 |
| Triple-click (click count ≥ 3) | Select the paragraph `{blockId,0}..{blockId,len}`. The selection does **not** include the paragraph mark. **Drag-mode = paragraph.** | editor.js:649-652; caret.js:370-375 |
| Drag | While the button is held, mousemove extends the selection. In char mode: `set(pos,{extend:true})`. In word/paragraph mode, the whole unit under the pointer is added, and the original unit stays selected (§4.2). | editor.js:690-728 |
| Autoscroll during drag | Runs every animation frame while dragging. If the pointer is within **36 px** (`AUTOSCROLL_EDGE`) of a canvas edge, scroll that axis by `speed = min(28, max(2, round(distance/2)))` px per frame. `distance` = how far the pointer is inside the edge band, or beyond it. Then extend the selection to the pointer again. Both axes are handled. | editor.js:42-45, 731-754 |
| Pointer outside the canvas while dragging | The point is clamped to the canvas rect inset by 2 px before hit testing, so the selection keeps extending. | editor.js:764-781 |
| Ctrl+A | `selectAll` → docStart..docEnd. Note that this includes the header/footer band paragraphs at the end of the body (see §1.3). | editor.js:446-449; input.js:373-375 |
| Ctrl+click on a hyperlink | Opens the URL (`target.dataset.link` of the `.seg-link` element) in a new window (`noopener`). The caret does not move. | editor.js:637-641, 677-687 |
| Margin click (select line) | **NOT IMPLEMENTED.** A click in the left margin just hit-tests to the nearest pos. Plan §6 F2.6 lists it as Word behaviour. | — |
| Ctrl+click = sentence, Shift+F8 extend mode | **NOT IMPLEMENTED** (plan says v1.1). | plan.md F2.6 |
| Drag-and-drop of selected text (move/copy) | **NOT IMPLEMENTED.** The canvas cancels `dragstart` and `selectstart`. A mousedown inside a selection simply starts a new selection. | editor.js:141-143; plan F8.4 |
| Keyboard Shift+arrows etc. | See §3. | |

During a drag, `refreshCaret` does not auto-scroll the caret into view. On mouseup the listeners are removed, the frame loop is cancelled, and `refreshCaret()` runs, which scrolls the caret into view (editor.js:697-705).

### 4.1 wordRangeAt (caret.js:339-362)
```
text = linearText(block)
if isWord(cpAt(offset)): anchor = offset
else if isWord(cpBefore(offset)): anchor = offset - len(cpBefore)   // caret right after a word → that word
else return null
s = anchor; e = anchor + cp length
expand s backward while isWord(cpBefore(s)); expand e forward while isWord(cpAt(e))
return {start:{block,s}, end:{block,e}}
```
Trailing spaces are **not** included in the selected word. Word includes them; Skriba does not, so copy Skriba.

### 4.2 Drag extension in word/paragraph mode (editor.js:708-728)
```
unit = (mode=='word') ? (wordRangeAt(pos) || {pos,pos}) : paragraphRange(pos.blockId)
if unit.start < origin.start: setRange({unit.start, origin.end})
else:                         setRange({origin.start, unit.end})
```
`setRange` makes `focus = end`, so a backward word-drag leaves the focus at the end. Copy this.

### 4.3 Other mouse hooks in main.js
- **dblclick** on a SmartArt block opens the SmartArt editor (`route('smartart:edit',{blockId})`). On an equation run it opens the equation dialog. This runs in addition to the editor's word selection (main.js:570-583).
- **mouseup** while the format painter is loaded: on the next frame, apply the painter to `expandRangeToWord(selection)`. If that range is still collapsed, keep the painter loaded (main.js:1903-1919).
- **Ctrl+wheel** on the canvas: zoom ±0.1 (wheel up = in). `setZoom` clamps to [0.1, 5.0] and rounds to 0.1 (main.js:541-545, 2581-2585).

---

## 5. Typing and editing semantics

### 5.1 Text input path (input.js:7-31, 429-469)
- Printable characters never come from keydown. They come from a hidden text proxy, through the `input` event: read the whole value, clear the proxy, insert the text **once**.
- If the inserted value contains `\r` or `\n`, it goes through `insertPlainText` (paragraph split, §7.3). Otherwise it goes through `insertText`.
- **IME:**
  - `compositionstart`: set `composing = true` and show the proxy (260 px wide, white background, font `11pt "Aptos", Calibri, "Segoe UI"`) at the caret, so the user sees the pre-edit text. The document is not touched.
  - `compositionupdate`: do nothing.
  - An `input` event that arrives while composing is ignored.
  - `compositionend`: insert `e.data` (or the proxy value) **once** and reset the proxy.
  - Keydown events with `isComposing`, `composing` or keyCode 229 are ignored entirely.
- The proxy is moved over the caret rectangle after every `refreshCaret`, so the IME candidate window is placed next to the caret (input.js:208-222).
- **C++/JUCE mapping:** implement `juce::TextInputTarget` on the document component.
  - `insertTextAtCaret(text)` corresponds to the input/commit path.
  - Composition corresponds to JUCE's `setTemporaryUnderlining` and `getHighlightedRegion` handling.
  - Do not insert pre-edit text into the model before commit, just as the source does not.
  - Use `getCaretRectangleForInput()` (or the equivalent) so the IME window follows the caret.
  - JUCE `KeyPress` handling covers the navigation and editing keys. Printable text must come through `insertTextAtCaret` only, so that characters are never inserted twice.

### 5.2 insertText (editor.js:159-165 → registry.js:639-672 → richtext.js:413-439)
```
Editor.insertText(text):  if text empty → return
  range = selection.range
  cmd = commands.insertText(range, text)
  caret = cmd.result.caretPos ?? {range.start.block, range.start.offset + text.length}

commands.insertText(range, text, charFmt=null):     // undo name "Escribir"
  r = normRange(range); if text=="" and collapsed → noop (caretPos r.start)
  region = blocks spanned by r
  regionCommand("Escribir"):
    fmt = charFmt
    if fmt == null and r not collapsed:
        fmt = rawCharAt({r.start.block, min(r.start.offset+1, len)})   // format of the FIRST replaced char
    mark = revisionMark()   // {a: author, d: date} when tracking is on, else null
    from = r.start
    if not collapsed:
        if mark and markDeletion(r): from = r.end    // tracked: old text is kept and marked deleted; new text goes AFTER it
        else richtext.deleteRange(r)
    if text == "": return {caretPos: from}
    clean = copy(fmt or {}); delete clean.del; if mark: clean.ins = mark
    end = richtext.insertTextAt(from, text, clean non-empty ? clean : fmt)
    return {caretPos: end}
```
`richtext.insertTextAt(pos, text, charFmt)`:
- Snap the offset backward out of any surrogate pair.
- `char = charFmt ?? rawCharAt(pos)`.
- Split the runs at the offset.
- If the previous run is text with an equal `char`, append to it. Otherwise, if the next run is text with an equal `char`, prepend to it. Otherwise insert a new text run, giving it a `char` field only when the format has defined keys.
- Run `mergeAdjacentRuns`.
- Return `{block, offset + text.length}`.
- The text is inserted literally; `\n` is not interpreted.

**Formatting inheritance (`rawCharAt`, richtext.js:380-405):** the new text takes the RAW run override (not the resolved style) of the **character before the caret**.
- At offset 0 it takes the format of the first run of the paragraph.
- If the character before the caret belongs to a non-text run (tab, image, field, break), the result is `{}`. **QUIRK:** text typed right after a tab or image therefore loses any direct formatting and falls back to the paragraph style. Copy this, or improve it by looking further back to the previous text run (the improvement is optional).
- In a paragraph that contains only a zero-length "carrier" run, the carrier's `char` is used. That is how formatting survives Enter (§5.4).
- There is **no "pending format"**: with a collapsed caret in whitespace, Ctrl+B does nothing (§8.1). The typing format therefore always comes from the neighbouring run.

**Overtype / Insert key:** **NOT IMPLEMENTED.** There is no overtype mode, and the Insert key is ignored.

**Undo granularity of typing:** **every `input` event is its own undo entry** named "Escribir". The source does **no** coalescing of consecutive keystrokes. With the 100-level limit (§9), only the last ~100 characters typed can be undone. The port should decide this explicitly. The recommendation is to keep the same command, add coalescing of consecutive single-char inserts in the same block when the caret is contiguous and less than ~1 s apart, and document that as an improvement. If byte-for-byte parity of undo behaviour is required, do not coalesce.

### 5.3 Autocorrect, smart quotes, auto-lists
None of these exist in the files covered here (not in input.js or editor.js). **NOT IMPLEMENTED.**

### 5.4 Enter — split paragraph (editor.js:184-200 → registry.js:678-688 → richtext.js:576-614)
```
Editor.insertParagraph():
  range = selection.range
  if range is collapsed AND blockLength(range.start.block) == 0 AND commands.setList exists:
      out = commands.setList(range, null)            // "Quitar lista"
      if out not noop: caret = range.start; return  // empty list item → leave the list (Word rule)
      // (setList(null) is a noop when the paragraph is not in a list → fall through)
  cmd = commands.insertParagraph(range)              // undo name "Nuevo párrafo"
  caret = cmd.result.caretPos ?? range.start

commands.insertParagraph(range):
  if not collapsed: richtext.deleteRange(r)          // within the SAME undo entry
  res = richtext.splitBlockAt(r.start)
  return {caretPos:{newBlockId, 0}, newBlockId}

richtext.splitBlockAt(pos):
  inherited = rawCharAt(pos)                          // computed BEFORE mutating
  tail = runs after the split point (moved out)
  nb = { t:'p', id:newBlockId(), sec: block.sec, style: block.style ?? 'Normal', runs: tail }
  if block.para has keys: nb.para = deepClone(block.para)   // ALL paragraph props copied (incl. numbering, dropCap, borders…)
  if block.hf:   nb.hf   = clone   // Enter in header/footer → new paragraph in same band
  if block.cell: nb.cell = clone   // Enter in a table cell → new paragraph in the same cell
  if block.fn:   nb.fn   = clone   // Enter in a footnote → stays in the note
  if nb.runs empty and inherited has keys: nb.runs = [{t:'text', text:'', char:inherited}]   // carrier
  mergeAdjacentRuns(block); mergeAdjacentRuns(nb)
  insert nb right after block
```
**Style `next` is NOT honoured.** Styles do declare `next`: `Normal→Normal`, `SinEspacio→SinEspacio`, `Titulo/Subtitulo/Heading1-3/Cita → Normal` (formatting/styles.js:284-308). Even so, `splitBlockAt` always copies `block.style`. Pressing Enter at the end of a `Heading1` produces another `Heading1`; plan F2's validation even states "Enter hereda estilo Heading1".

Recommended port behaviour (Word parity, which the C++ team should confirm): when the split offset equals `blockLength` (Enter at the end of the paragraph) and the style has a `next` different from itself, give the new paragraph `style = next` and drop the heading's direct `para` overrides. Otherwise copy Skriba. Record the choice either way.

Other Enter details:
- The block that was split keeps its runs before the split point. Its own `para` is unchanged.
- `mergeAdjacentRuns` (richtext.js:716-739):
  - Removes empty text runs.
  - If the paragraph becomes empty, keeps exactly one carrier: the first empty text run whose `char` has keys.
  - Merges adjacent text runs whose `char` is deep-equal.
- Paste uses `insertParagraph` for every `\n`, so the "Enter on an empty list item exits the list" rule **also fires during paste**. **BUG:** pasting `"a\n\nb"` into a list paragraph removes the list from the empty middle paragraph instead of creating an empty list item. It also writes an extra "Quitar lista" command into the paste batch, which is harmless for undo. The port should call the raw split (without the list-exit rule) from the paste path.

### 5.5 Shift+Enter, Ctrl+Enter, column break (editor.js:203-214; registry.js:696-710)
- Shift+Enter → `commands.insertBreak(range,'line')`, undo name "Salto de línea".
- Ctrl+Enter → `insertBreak(range,'page')`, undo name "Salto de página". Ctrl+Shift+Enter is also treated as a page break (input.js:327: `ctrl` is checked first).
- Implementation: delete the selection if it is not collapsed, then `insertFragment(r.start, {blocks:[{t:'p', runs:[{t:'break', type}]}]})`. The caret ends up after the break (offset+1).
- **BUG:** `insertBreak` coerces any type other than `'page'` to `'line'` (registry.js:699). The router's column break (`insert:column-break`, main.js:1798-1804) therefore inserts a **line** break, even though the layout understands `type:'column'` (layout/breaker.js:165, 696). The port should accept `'line' | 'page' | 'column'`.
- The break run takes no char format. Its length is 1 in linear space.

### 5.6 Tab / Shift+Tab (editor.js:222-246, 270-293)
Decision order:
```
1. If the caret's block (range.start) is a table cell paragraph:
     dest = nextCell(table, row, col, dir)          // reading order: col+1, wrap to next row; no merge awareness
     if dest == null:
        Shift+Tab in the first cell → do nothing (stay)
        Tab in the last cell        → commands.insertTableRow(tableId, row, 'below'); caret = result.caretPos (first cell of the new row)
     else: select the WHOLE CONTENT of the destination cell's FIRST paragraph ({id,0}..{id,len}); return
   (No tab character is ever inserted inside a table. Word's Ctrl+Tab is not supported.)
2. If (selection not collapsed) or (spans blocks) or (caret offset == 0):
     cmd = commands.setListLevel(range, Shift ? -1 : +1)    // "Nivel de lista"
     if cmd not noop → caret = range.start; return
   (setListLevel is a noop when no paragraph in the range is in a list)
3. If Shift: do nothing.
4. commands.insertTab(range)   // "Tabulación": delete selection, then insertFragment [{t:'tab'}]; caret +1
```
- Caret after a list-level change is `range.start`, which collapses any selection. **QUIRK:** Word keeps the selection. The port may keep the selection; this is an optional improvement.
- **BUG:** `nextCell` and `_cellBlockId` ignore merged cells. After `mergeCells`, the absorbed cells have no paragraphs (their paragraphs were reassigned to the kept cell), so `_cellBlockId` returns null. Tab then returns true **without moving**, and the caret is stuck. The port should skip absorbed or covered cells (spec on tables).

### 5.7 Backspace (editor.js:319-326; registry.js:832-860; richtext.js:622-635)
```
if selection not collapsed → deleteSelection() (commands.deleteRange, "Eliminar")
pos = focus; fallback = moveByChar(pos,-1); if fallback == pos → return (start of document)
commands.deleteBackward(pos):                 // undo name "Retroceso"
  if pos.offset == 0:
     if block index <= 0 → noop
     regionCommand over [idx-1, idx]: richtext.mergeWithPrevious(blockId)
         → prev.runs += clone(block.runs); mergeAdjacentRuns(prev); remove block
         → the RECEIVING (previous) paragraph keeps its style, para and list numbering
     caretPos = join point {prev.id, oldLen(prev)}
  else:
     from = previous code point offset (one surrogate pair = 1 step; a non-text run = 1 step → deleted whole)
     if tracking and markDeletion([from,pos]) → caretPos {block, from}  (text kept, marked del)
     else richtext.deleteRange([from,pos]) → caretPos {block, from}
```
Edge cases:
- **Backspace at the start of a list item:** there is no special rule. The paragraph merges into the previous one. Word would remove the numbering first, or outdent. The source does NOT do this, so copy the source unless a product decision says otherwise.
- **Backspace at the start of a table cell's paragraph / of the paragraph after a table / Delete at end of the last cell:** `mergeWithPrevious` has **no table guard**. **BUG.** Concretely:
  - Backspace at offset 0 of cell (0,1) merges its text into cell (0,0)'s paragraph, and that cell's `blocks` list goes stale.
  - Backspace in the first cell merges into the `t:'table'` block itself. `runsOf` creates `runs:[]` on the table block, and the text is pushed into the table block.
  - Backspace at offset 0 of the paragraph after a table merges it into the last cell.
  - **The port must guard these.** Word's rules:
    - At offset 0 of any cell paragraph that is the first paragraph of its cell, Backspace does nothing (or only moves the caret to the end of the previous cell).
    - At offset 0 of the paragraph right after a table, Backspace moves the caret into the last cell and does not merge.
    - Delete at the end of a cell's last paragraph does nothing.
    - Delete at the end of the paragraph before a table does nothing (Word deletes the paragraph only if it is empty).
- **Backspace at the start of a header/footer band paragraph** would merge into the previous body block (the body's last paragraph). It needs the same guard: never merge across `hf`, `cell`, `fn` or table boundaries.
- The `markDeletion` tracking rule is in §10.
- With tracking on, merging paragraphs at offset 0 is **not** tracked: the paragraph mark is really removed.

### 5.8 Delete (editor.js:329-336; registry.js:866-892)
Mirror of Backspace (undo name "Suprimir"):
- At `offset >= len`: if there is a next block, run `mergeWithPrevious(next.id)`. The current paragraph keeps its properties and the caret stays put. At the end of the document it is a noop.
- Otherwise delete one code point forward. A non-text run is deleted whole.
- With tracking, the char is marked deleted and the **caret moves to after it** (`to`) (registry.js:888). With Backspace the caret goes to `from`.

### 5.9 Ctrl+Backspace / Ctrl+Delete (editor.js:339-359)
- A non-collapsed selection is deleted like a normal delete.
- Otherwise: `start = moveByWord(pos,-1)` (or `end = moveByWord(pos,+1)`), then `commands.deleteRange({start,end})`. The range can cross a block boundary, because moveByWord does; in that case it merges paragraphs.
- Ctrl+Delete deletes up to the **start of the next word**, so trailing separators are deleted too.

### 5.10 deleteRange (registry.js:813-825; richtext.js:446-470)
- A collapsed range is a noop.
- With tracking **and a single-block range**: run `markDeletion`, and the caret goes to `r.end`.
- Otherwise run `richtext.deleteRange`:
  - Single block: remove the span.
  - Multi-block: the start block keeps its own `para` and style. It receives the end block's tail runs, and the intermediate blocks plus the end block are removed.
- Returns the deleted fragment (`extractRange`).
- **QUIRK:** with tracking on, a multi-block delete is a real, untracked delete (inconsistent with `insertText`, which marks multi-block replacements).
- **BUG risk:** a multi-block range that spans part of a table removes table or cell blocks without updating `table.rows[].cells[].blocks`. Ctrl+A followed by Delete in a document with tables leaves no table (all its blocks are inside the range, so this case is consistent). A partial range leaves a broken table. The port should either expand partial table selections to whole tables or clear cell contents only (Word: deleting a range that partially covers a table clears the cells it covers).

---

## 6. Keyboard map (exhaustive, as implemented in input.js:276-417)

Rules:
- `ctrl = (Ctrl or Cmd) && !Alt`.
- Every handled key calls preventDefault and stopPropagation.
- Keys are matched on `e.key` (the character produced, lowercased for Ctrl shortcuts). On a Spanish keyboard Ctrl+Shift+> yields key `>` and so on.
- Unhandled Ctrl combinations fall through to the browser. In the native app they must do **nothing**, never insert text.

### 6.1 Navigation and editing keys

| Key | Action |
|---|---|
| ←/→, Ctrl+←/→ (+Shift) | `moveCaret('char'/'word', ∓1, {extend:Shift})` |
| ↑/↓ (+Shift) | `moveCaret('line', ∓1)`. Ctrl+↑/↓ is the same as plain ↑/↓ (Word: previous/next paragraph — **NOT IMPLEMENTED**) |
| Home / End (+Shift) | `lineStart` / `lineEnd`. With Ctrl: `docStart` / `docEnd` |
| PageUp / PageDown (+Shift) | `pageUp` / `pageDown`. Ctrl+PgUp/PgDn is the same as without Ctrl |
| Backspace / Ctrl+Backspace | `deleteBackward` / `deleteWordBackward` |
| Delete / Ctrl+Delete | `deleteForward` / `deleteWordForward` |
| Enter | `insertParagraph` |
| Shift+Enter | `insertLineBreak` |
| Ctrl+Enter (with or without Shift) | `insertPageBreak` |
| Tab / Shift+Tab | `insertTab(shift)`, see §5.6 |
| Escape | `route('escape')`. **Not consumed** (no preventDefault), so other handlers also see it |
| F1 | `route('help:open')` |
| F3 / Shift+F3 | `route('find:next')` / `route('find:prev')` |
| F5 | `route('goto')` |
| F7 | `route('review:proofing')` |

### 6.2 Ctrl shortcuts (the v0.1 compromise: an EN map mixed with the es-ES letters for B/I/U)

| Shortcut | route id | Notes |
|---|---|---|
| Ctrl+A | — | `editor.selectAll()` directly |
| Ctrl+B, **Ctrl+N** | `bold` | N = «Negrita» (es-ES) |
| Ctrl+I, **Ctrl+K** | `italic` | K = «Cursiva» (es-ES). **Ctrl+K is therefore NOT hyperlink**, despite plan §8 |
| Ctrl+U, **Ctrl+S** | `underline` | S = «Subrayado» (es-ES). **Ctrl+S does NOT save** |
| Ctrl+G | `save` | «Guardar» (es-ES). So Ctrl+G is not "go to"; go to is F5 |
| Ctrl+Z | `undo` | |
| Ctrl+Shift+Z, Ctrl+Y | `redo` | |
| Ctrl+F | `find` | toggles the Find pane (closes it if already open in find mode) |
| Ctrl+H | `replace` | toggles the pane in replace mode |
| Ctrl+P | `print` | |
| Ctrl+M / Ctrl+Shift+M | `indent:inc` / `indent:dec` | step 720 twips |
| Ctrl+E | `align:center` | |
| **Ctrl+Shift+E** | `review:track` | toggle track changes |
| Ctrl+L / Ctrl+R / Ctrl+J | `align:left` / `align:right` / `align:justify` | |
| Ctrl+0 | `zoom:reset` | |
| Ctrl+`>` or Ctrl+`.` | `font-grow` | **QUIRK:** also fires on Ctrl+. without Shift |
| Ctrl+`<` or Ctrl+`,` | `font-shrink` | also fires on Ctrl+, without Shift |
| Ctrl+C / Ctrl+X | — | not intercepted. The proxy is prepared and the platform copy/cut event does the work (§7) |
| Ctrl+V (and Ctrl+Shift+V) | — | not intercepted. The platform paste event does the work. **Paste is always plain text**, so Ctrl+Shift+V behaves the same |

Plan §8 shortcuts that are **NOT IMPLEMENTED** in input.js:
- Ctrl+= and Ctrl+Shift+= (subscript/superscript), Ctrl+Shift+K/W/D
- Ctrl+1/2/5 (line spacing), Ctrl+T and Ctrl+Shift+T
- Ctrl+Shift+L, Ctrl+Shift+S, Ctrl+D, Ctrl+Shift+F
- F4 (repeat), F9 (update fields), Shift+F7
- Ctrl+Alt+F and Ctrl+Alt+D (notes), Ctrl+Shift+Enter (column break), Ctrl+Shift+8 (show ¶)
- Ctrl+Space and Ctrl+Q (clear formatting), F2, Ctrl+Insert/Shift+Insert/Shift+Delete
- Alt key tips

They may be added in the port, but they are not Skriba behaviour.

Shortcuts handled elsewhere:
- Ctrl+wheel zoom (main.js:541).
- Inside the Find pane: Enter, Shift+Enter, F3, Shift+F3, Esc (§11.4).
- Context menu: Esc closes it (contextmenu.js:175-180).

---

## 7. Clipboard

### 7.1 Formats
- **Copy and cut write `text/plain` only.** There is no HTML, no RTF and no internal rich format. The internal rich clipboard and the HTML round-trip described in plan F8.1-F8.3 are **NOT IMPLEMENTED**.
- **Paste reads `text/plain`.** If there is no text, it reads an **image** (MIME types exactly `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/bmp`; input.js:69). **When both are present, text wins** (input.js:495-514).
- Formatted HTML coming from Word or the web is pasted as plain text.

### 7.2 Plain text of the selection (editor.js:474-489)
```
for each block from start.block to end.block (document order, including tables' cell paragraphs and bands):
   slice = blockPlainSlice(block, from, to)    // §1.1 table: tab→'\t', break→'\n', field→result, image→''
join slices with '\n'
```
- A table therefore copies as one cell per line, with no tab-separated rows. The `t:'table'` block contributes an empty line, because it has no runs.
- Line and page breaks both become `\n`.
- Line endings are LF. **C++ note:** on Windows, write CRLF to `CF_UNICODETEXT`. This is a recommendation, because most Windows apps expect it.
- The mirror limit of 200 000 chars (`CLIPBOARD_MIRROR_LIMIT`, input.js:99) applies only to the browser fallback path. It is not needed natively.

### 7.3 Copy / Cut / Paste behaviour
- **Copy** (Ctrl+C or the ribbon `copy`): put `selectedPlainText()` on the clipboard. An empty selection copies nothing; the ribbon path returns false.
- **Cut**: copy, then `deleteSelection()` if the text was not empty. That is a separate "Eliminar" undo entry; there is no "Cortar" name.
- **Paste text** (`insertPlainText`, editor.js:172-181):
  ```
  parts = text.replace(/\r\n?/g,'\n').split('\n')
  if parts == [''] → return
  batch('Pegar'):                       // ONE undo entry
     for i, part: if i>0 → insertParagraph()   (Enter semantics incl. the list-exit quirk §5.4)
                  if part != '' → insertText(part)   (inherits format of the char before the caret)
  ```
  - The first operation replaces the selection: deleting the range is part of the first insertText or insertParagraph.
  - Tabs in the pasted text are inserted as literal `\t` characters inside text runs. They do **NOT** become `{t:'tab'}` runs, because insertText inserts literally. **QUIRK:** the layout probably renders a raw `\t` incorrectly. The port should convert `\t` to tab runs when pasting.
- **Paste image**: `editor.insertImageBlob(blob, name || 'Imagen pegada')` calls the host's `pasteImage(blob, name)` hook without waiting for it. The hook uploads and inserts with `insertFragment(imageFragment)` under the undo name "Insertar imagen". In a protected document the hook refuses before uploading.
- The ribbon `paste` button (`pasteFromSystem`, editor.js:523-550) tries an image first via the async clipboard API (only when the hook exists), then text. It logs «Skriba: el navegador no permite leer el portapapeles; usa Ctrl+V.» if reading is denied. Natively, just read the clipboard: prefer text, otherwise an image.
- **Pasted image naming:** the default name / alt text is «Imagen pegada». A pasted file keeps its own name.

---

## 8. Formatting commands routed from the editor (main.js:697-746)

### 8.1 Character commands
The ids `bold, italic, underline, strike, sub, sup, font-name, font-size, font-grow, font-shrink, font-color, highlight, clear-format` (main.js:701-702) are handled as follows:
```
fmt = editor.currentFormat()      // EFFECTIVE (style-resolved) format at selection start (or caret)
delta = charDeltaForCommand(id, params, fmt.char)
if delta:
   range = expandRangeToWord(doc, selection.range)   // collapsed caret inside/adjacent to a word → that word
   if range still collapsed → NOTHING happens (no pending format)
   elif id == 'clear-format': batch('Borrar formato') { applyCharFormat(range, delta); setStyle(range, 'Normal') }
   else applyCharFormat(range, delta)     // "Formato de fuente"
refresh ribbon; focus canvas
```
`charDeltaForCommand` (charfmt.js:146-209). Each toggle reads the **effective** state at the selection start and writes an explicit value:

| id | params | delta |
|---|---|---|
| bold / italic / strike | — | `{bold: !cur.bold}` and so on |
| sub | — | `cur.sub ? {sub:false} : {sub:true, sup:false}` |
| sup | — | `cur.sup ? {sup:false} : {sup:true, sub:false}` |
| underline | `style?` ∈ none, single, double, words, dotted, dash | without style: `{underline: cur.underline && cur.underline!='none' ? 'none':'single'}`. With style: `{underline: cur.underline==style ? 'none' : style}`. An invalid style returns null |
| font-name | `name` | `{font: name.trim()}`; empty returns null |
| font-size | `pt` or `size` | rounded to 0.5, clamped to [1, 1638] |
| font-color | `color` | normalised: `#RGB` → `#RRGGBB` uppercase, `auto` stays `auto`, `none`/empty → `'auto'`; any other string passes through |
| highlight | `color` | as above, but `auto` → `null` (no highlight) |
| font-grow | — | `{size: growFontSize(cur.size ?? 11)}` |
| font-shrink | — | `{size: shrinkFontSize(...)}` |
| clear-format | — | `{font:'Aptos', size:11, bold:false, italic:false, underline:'none', strike:false, sub:false, sup:false, color:'auto', highlight:null, allCaps:false, smallCaps:false}` |

Font-size scale (`FONT_SIZE_SCALE`, charfmt.js:30-32): 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72.
- grow:
  - below 8 → `min(8, floor(s)+1)`
  - at or above 72 → `min(1638, floor(s/10)*10 + 10)`
  - otherwise the next scale value above s.
- shrink:
  - at or below 8 → `max(1, ceil(s)-1)`
  - above 72 → `v = ceil(s/10)*10 - 10`; if `v <= 72` the result is 72, otherwise v
  - otherwise the largest scale value below s.

Delta semantics (`richtext.applyCharFormat`, richtext.js:645-683):
- A key with value `undefined` is ignored.
- A key with value `null` **removes the override**.
- Only text runs are changed. Runs are split at the range edges and merged again afterwards.
- `registry.applyCharFormat` strips keys that start with `__` and keys that are undefined. A collapsed range or an empty delta is a noop.

### 8.2 Paragraph commands
The ids are `align:*`, `line-spacing`, `space-before`, `space-after` and `indent:*` (main.js:704-707, parafmt.js:69-105):

| id | params | delta |
|---|---|---|
| `align:left/center/right/justify` | — | `{align}` |
| `line-spacing` | `line` (1/240 units, ≥1) or `mult` | `{line}`. Ribbon presets: 1.0=240, 1.15=276, 1.5=360, 2.0=480 |
| `space-before` / `space-after` | `tw` (or `before`/`after`), twips ≥ 0 | `{before}` / `{after}` |
| `indent:inc` / `indent:dec` | `step?` (default 720) | `{__indentDelta: ±step}`. The registry resolves it **per paragraph**: `left = max(0, currentLeft + delta)`, where `currentLeft` is the paragraph's direct `para.left`, else the style's resolved left, else 0 (registry.js:925-956, 563-572) |

`richtext.applyParaFormat` (richtext.js:689-710): Word's rule applies. **If a multi-block range ends at offset 0 of its last block, that block is NOT included.** `null` removes an override. If the delta contains `numbering`, the change is structural (the whole layout is invalidated).

### 8.3 Format painter (main.js:1842-1919)
- `format-painter {sticky}`: load the painter with `{styleId: block.style, char: rawCharAt(start+1), para: block.para copy, sticky}`. A double-click makes it sticky.
- Applying it runs `batch('Copiar formato') { setStyle(range, styleId); applyParaFormat(range, every PARA_KEY → value or null); applyCharFormat(range, every CHAR_KEY → value or null) }`. The painter unloads unless it is sticky.
- Esc (`route('escape')`) unloads the painter first.

---

## 9. Undo / redo model (commands/command.js + registry.js)

### 9.1 CommandStack
| Property | Value |
|---|---|
| Limit | **100** entries (registry.js:312 `new CommandStack(100, ctx)`). When an entry is pushed beyond the limit, the **oldest** entry is dropped (`shift`) (command.js:87-90) |
| Command shape | `{name, execute(ctx), undo(ctx), result?, noop?}` |
| execute(cmd) | Run `cmd.execute(ctx)`. If a batch is open, add the command to the batch; otherwise push it. **Always clear the redo stack.** Emit `undo:changed` (command.js:70-84) |
| undo() | Refused while a batch is open, or when there is nothing to undo. Otherwise pop, call `cmd.undo`, push onto redo, emit (97-104) |
| redo() | Refused while a batch is open, or when there is nothing to redo. Otherwise pop from redo, call `cmd.execute` again, push onto undo (respecting the limit), emit (110-117) |
| beginBatch(name='Acción') / endBatch() | Batches nest; only the outermost one closes. On close, the collected commands become one macro command: execute runs them in order and undo runs them in reverse. An empty batch adds no entry. Closing clears redo and emits (124-160) |
| peekUndo / peekRedo | Return the top entry. **Not used** |
| canUndo / canRedo | Getters |
| Facade `batch(name, fn)` | `beginBatch`; run `fn` in try/finally; `endBatch`. Also closes on an exception (registry.js:621-628) |

Each command's **undo name** (Spanish, shown in menus) is listed in §12.

### 9.2 Region snapshot undo (registry.js:13-26, 417-450)
Every command that touches blocks is a `regionCommand(name, startIdx, count, mutate, {structural})`:
```
execute (first time):
   before = captureRegion(doc, startIdx, count)          // deep clone of body[startIdx .. startIdx+count)
   n0 = blockCount; result = mutate() || {}
   after = captureRegion(doc, startIdx, count + (blockCount - n0))
   emitRegionChange(before, after, structural)
execute (redo): restoreRegion(doc, after, before.count) ; emit
undo:           restoreRegion(doc, before, after.count) ; emit
restoreRegion(region, replaceCount): body.splice(region.startIdx, replaceCount, ...deepClone(region.blocks)); bump id counter; emits doc:changed{structural:true}
```
- This relies on the LIFO order: the indices stay valid because undo and redo always happen in stack order.
- `emitRegionChange`: `doc.touch()`. If `structural` is set, or the block count changed, emit `{structural:true}`. Otherwise emit `{blockIds: union of the ids before and after}`.
- **Pitfall for the port:** the snapshot covers only the blocks in the computed region. Any mutation *outside* that region inside `mutate()` is NOT undoable. Examples are `ensureListDef` writing `doc.numbering` before the command (registry.js:980), and `registerMedia`. Those are acceptable leaks: definitions and media that are left behind are harmless.
- A C++ implementation can use the same approach: deep-copy the block range before and after. That is simple and robust. Plan F9.4 asked for inverse deltas, but the source uses snapshots, so snapshots are fine.

`snapshotCommand(name, read, write, apply, changeInfo)` (461-486): used for state that is not a block (sections, bookmarks, comments, tracking, protection, document properties, theme, styles, name). It stores clones of the value before and after. Undo and redo write those clones back and emit `doc:changed(changeInfo)`.

`noopCommand(name, result)`: `{noop:true}`. It is **not pushed** and emits no event, but it carries `.result.caretPos` so callers can treat it uniformly.

### 9.3 What is not undoable
- Selection changes (undo does not restore the selection; §9.6).
- Zoom and view modes (ruler, gridlines, marks, navigation pane, view mode).
- Find highlights.
- Format painter state.
- `registerMedia`.
- Saving.
- `setDocProps` *is* undoable, and so are the dictionary additions written through it.

### 9.4 Batches used by the app (one undo entry each)
- "Pegar" (paste)
- "Reemplazar todos"
- "Borrar formato"
- "Copiar formato"
- "Nota al pie" / "Nota al final"
- "Crear etiquetas"
- any `commands.batch` call made by dialogs

### 9.5 Typing coalescing
None (§5.2).

### 9.6 Pitfalls
- **The caret/selection is not restored by undo or redo.** The router only refreshes the ribbon and focus. The selection keeps its old Pos, which may point to a block that no longer exists. `clampPos` on the next `set` maps an invalid block to **docStart**, and nothing calls `selection.revalidate()`.
  - Recommended port behaviour: store `selectionBefore` and `selectionAfter` in each command and restore them on undo and redo (Word does this).
  - At minimum, revalidate the selection after undo/redo. The registry header even mentions that `peekUndo` exists "so the facade returns name/selection on undo", but this was never implemented.
- Protection (§10.3) does not block undo/redo.

---

## 10. Track changes, protection

### 10.1 Revision marks during editing (registry.js:508-557)
- `tracking()` returns `doc.tracking` when `enabled` is true.
- `revisionMark()` returns `{a: tracking.author || 'Autor', d: tracking.date || null}`.
- Inserted text gets `char.ins = mark`.
- `markDeletion(r)`:
  - If **every** run touched by r (only when r is within a single block) has `char.ins.a == mark.a`, the text was inserted by this same author and not yet accepted, so it is **really deleted**.
  - Otherwise `applyCharFormat(r, {del: mark})`, which marks the text as deleted.
  - Returns true when tracking is on.
- The text marked as deleted stays in the linear text. The caret walks through it, and the layout draws it struck through.

### 10.2 Accept / reject (registry.js:1906-1942)
- `resolveRevisions(range|null, accept)`:
  - A null range means the whole body.
  - If the region has no `ins`/`del` runs, it is a noop.
  - Accept: remove the runs with `del`, and strip `ins` from the rest.
  - Reject: remove the runs with `ins`, and strip `del` from the rest.
  - An empty `char` is deleted. `mergeAdjacentRuns` runs afterwards. The change is structural.

### 10.3 Protection guard (main.js:292-372)
- `protectionMode()`:
  - Returns `'readOnly'` if the document was opened from a "view only" share link.
  - Otherwise returns `doc.protection.mode`, one of `none | readOnly | comments | tracked`.
- In `readOnly` and `comments` modes, every **content** factory is replaced by a function that shows a notice and returns a noop: «Solo lectura» or «Solo comentarios» in the save-state label for 2.5 s, throttled to once every 4 s.
  - Content factories: insertText, insertParagraph, insertBreak, insertTab, insertFragment, deleteRange, deleteBackward, deleteForward, applyCharFormat, applyParaFormat, setStyle, setList, setListLevel, insertTable, insertTableRow, deleteTableRow, insertTableColumn, deleteTableColumn, deleteTable, setTableProps, mergeCells, splitCell, setBand, resizeImage, setImageProps, replaceBody, setMargins, setPageSize, setColumns, setSectionProps, setSectionFlags, insertSectionBreak, setTheme, setStyleProps, setDocProps, setBookmark, removeBookmark, setFootnote, removeFootnote, insertBlocksAfter, removeBlockById, updateSmartArt.
  - `setFootnote` and `removeFootnote` do not exist in the registry; the guard skips them.
- Annotation factories (addComment, deleteComment, updateComment, setTracking, resolveRevisions) are blocked only for view-only share links.
- `tracked` mode does **not** force tracking on. **QUIRK.**
- undo, redo, setDocName and registerMedia are not guarded.
- The port should implement this guard inside the command facade.

---

## 11. Find and replace (editor/find.js + ui/dialogs/find.js)

### 11.1 Options (find.js:21-38)
| Option | Default | UI label (verbatim) |
|---|---|---|
| `matchCase` | false | «Coincidir mayúsculas y minúsculas» |
| `wholeWord` | false | «Solo palabras completas» |
| `wildcards` | false | «Usar caracteres comodín» |

- There is no regex option. The prefix/suffix options, find-with-formatting and `^p` are **NOT IMPLEMENTED**.
- `MAX_MATCHES = 5000`. After that the result is marked `truncated`.

### 11.2 Matching algorithm (find.js:44-178)
- **Search space:** each block's search text (§1.1 table), searched **block by block**.
  - A match never crosses a paragraph.
  - Field results are not searched.
  - Header/footer band paragraphs and table cell paragraphs ARE searched, because they are all in `doc.body`.
- `compileQuery(query, opts)`:
  - An empty query returns null (no results).
  - `source = wildcards ? wildcardToPattern(q) : escapeRegExp(q)`.
  - If `wholeWord`, wrap it: `(?<![\p{L}\p{N}_])(?:source)(?![\p{L}\p{N}_])`. Here the word chars include `_`, unlike caret word navigation.
  - Flags: global + Unicode, plus case-insensitive when `!matchCase`. Case-insensitive matching uses JS Unicode simple case folding.
  - An invalid pattern throws the error «Patrón de búsqueda no válido. Revisa los comodines.»
- `wildcardToPattern` (find.js:78-109):

| Wildcard | Meaning | Regex equivalent |
|---|---|---|
| `*` | any sequence, **non-greedy** (may be empty) | `[\s\S]*?` |
| `?` | exactly one UTF-16 unit (u-mode: one code point) | `[\s\S]` |
| `[abc]`, `[a-z]` | character class; `-` makes ranges | `[abc]`; inside the class `\ ^ ] [` are escaped |
| `[!abc]` | negated class | `[^abc]` |
| `[]` or `[!]` | literal brackets | `\[\]` / `\[!\]` |
| `[` with no closing `]` | literal `[` | `\[` |
| `\x` | literal x; a trailing `\` is a literal backslash | escaped |
| anything else | literal | escaped |

  Matching is case-insensitive unless matchCase is set, even with wildcards. In Word, wildcard searches are always case-sensitive; Skriba differs, so copy Skriba.
- `findAll`:
  - For each block, iterate the regex matches.
  - **Zero-length matches are skipped**, advancing `lastIndex` by 1 (for example `*` alone or `[!x]*`). Because `*` is non-greedy, `t*to` matches the shortest span.
  - Each match becomes `{start:{block, idx}, end:{block, idx+len}}`.
  - Stop at 5000 matches with `truncated=true`.
- C++: use ICU regex, or a custom engine that supports lookbehind and Unicode properties, and apply the same translation. `std::regex` lacks lookbehind and `\p{}` support.
- `matchIndexFrom(matches, pos, {backwards, wrap=true})`:
  - Forward: the first match whose **start ≥ pos**.
  - Backward: the last match whose **end ≤ pos**.
  - With wrap, if nothing is found, return the first match (forward) or the last one (backward).

### 11.3 Pane behaviour (ui/dialogs/find.js)
- **Open** (`find` / `replace` route, Ctrl+F / Ctrl+H; `toggle` closes the pane if it is open in the same mode):
  - If the selection's plain text contains no `\n` and is at most 200 chars, prefill the query with it.
  - Run a search starting from the selection end and jump to the first match.
  - Focus the query field and select its text.
- **Typing in the query:** debounce **160 ms** (`TYPE_DEBOUNCE`), then search again and jump.
- **Changing an option:** search again without jumping.
- **Document edits while the pane is open:** recompute after a debounce of **220 ms** (`DOC_DEBOUNCE`). This is skipped while a replace is running or when the query is empty. The active index is kept, clamped to the result count.
- **Highlights:**
  - All matches are drawn yellow and the active one orange (`view.drawHighlights(matches, activeIdx)`).
  - The active match is **selected in the document** (`selection.setRange`) and scrolled into view.
  - Closing the pane clears the highlights and returns focus to the editor.
- **Next / prev:**
  - With no active match: use `matchIndexFrom` from the selection end (next) or the selection start (prev).
  - Otherwise: `(active ± 1) mod n`, which wraps.
  - F3 / Shift+F3 open the pane if it is closed (`withFindPane`).
- **Counter text** (verbatim):
  - `"{i} de {n} resultado"` or `"... resultados"` (plural when n ≠ 1); when there is no active match: `"{n} resultado(s)"`.
  - «Sin resultados» when there are none.
  - Truncation note: «Se muestran los primeros 5000 resultados.»
- **Replace current:**
  - With no active match, behaves as find-next.
  - Otherwise `commands.insertText(activeRange, replaceText)`. That is one "Escribir" undo entry. The replacement text inherits the format of the **first replaced char**; with tracking on, the old text is marked deleted.
  - Then recompute, and activate the first match at or after the new caret (wrapping).
  - Status: «Se realizó 1 reemplazo.»
- **Replace all:**
  - `batch('Reemplazar todos') { for i = n-1 down to 0: insertText(match[i], text) }`. Going backwards keeps the earlier offsets valid.
  - Then recompute.
  - Status: «Se realizaron {n} reemplazos.» When truncated: «Se realizaron {n} reemplazos (tope de 5000); repite la operación para continuar.»
  - On an exception: «No se pudieron aplicar todos los reemplazos.» For a single replace: «No se pudo reemplazar.»
  - Replacing with an empty string deletes the matches.
  - The replacement text is literal: there are no `^&` or `\1` back-references.
- **Pane keys:**
  - Query field: Enter = next, Shift+Enter = prev (Enter with no results searches again), Esc = close.
  - Replace field: Enter = replace current, Esc = close.
  - Anywhere in the pane: Esc closes, F3 / Shift+F3 navigate.
- **Labels and titles (verbatim):**
  - Pane title: «Buscar» or «Buscar y reemplazar».
  - Toggle button: «Reemplazar…» or «Ocultar reemplazar».
  - Replace field label: «Reemplazar con».
  - Buttons: «Reemplazar», «Reemplazar todos».
- **Button states:**
  - Prev and next are disabled when there are no matches.
  - Replace is disabled when there are no matches or no active match.
  - Replace all is disabled when there are no matches.

### 11.4 Escape routing (main.js:792-798)
`route('escape')`, in this order:
1. If the format painter is loaded, unload it.
2. Otherwise, if the view mode is `read`, switch to `print`.
3. Otherwise, if the find pane is open, close it.

### 11.5 Go to (F5) and outline
`goto` opens the Go To dialog: page, heading, bookmark, comment (other spec). The heading list comes from `editor/outline.js`:
- `headingLevel(styleId)`:
  - `HeadingN` with N in 1..9 → N.
  - `Titulo` → 0.
  - `Subtitulo` → 1.
  - Anything else → null.
- `outline(doc, {maxLevel=9, skipEmpty=true})`:
  - Covers only `t:'p'` blocks that have neither `hf` nor `cell`, in body order.
  - `text = blockPlainText`: text runs plus field results, tabs as spaces (breaks are dropped), whitespace collapsed, trimmed.
  - Returns `[{blockId, level, text, styleId}]`.
- `numberOutline` adds `number` in the form `"1."`, `"1.2."`, `"1.2.3."`. Level-0 entries get `""`. The counters are reset for deeper levels.
- `DEFAULT_TOC_LEVELS = 3`.

---

## 12. COMPLETE command registry (commands/registry.js#createCommands)

Conventions:
- Every factory **executes immediately** and returns the executed command with `.result`.
- A **noop** result is not pushed onto the stack and emits nothing.
- "Region" means `regionCommand` (block snapshot undo). "Snap" means `snapshotCommand`.
- **Undoable = yes** for every factory, unless the table says otherwise.

### 12.1 Facade (not commands)
| Member | Description |
|---|---|
| `stack` | The CommandStack (limit 100) |
| `execute(cmd)` | Run an external `{name,execute,undo}` command on the stack |
| `undo()` / `redo()` | Return a bool |
| `canUndo` / `canRedo` | **Properties**, not functions |
| `beginBatch(name='Acción')` / `endBatch()` / `batch(name, fn)` | Grouping (§9.1) |

### 12.2 Text and structure
| Factory (params) | Undo name | Noop when | Behaviour | `.result` |
|---|---|---|---|---|
| `insertText(range, text, charFmt=null)` | Escribir | text empty and range collapsed | §5.2 | `{caretPos}` |
| `insertParagraph(range)` | Nuevo párrafo | never | Delete the selection, then `splitBlockAt` (§5.4) | `{caretPos:{newBlock,0}, newBlockId}` |
| `insertBreak(range, type='line')` | Salto de página / Salto de línea | never | Delete the selection; insert `{t:'break', type}` where type is `'page'` or **`'line'` for anything else** (BUG §5.5) | `{caretPos}` after the break |
| `insertTab(range)` | Tabulación | never | Delete the selection; insert `{t:'tab'}` | `{caretPos}` |
| `insertFragment(range, fragment, name='Insertar')` | *name* | `fragment.blocks` empty | Delete the selection; `richtext.insertFragment`. With one block: its runs are inserted inline. With N blocks: the current paragraph is split; the first block's runs are appended to the left part, which keeps its own para; middle blocks are inserted whole (their ids are reused if free); the last block's para properties apply to the right part. **This loses block markers on the first block** | `{caretPos}` = end of the inserted content |
| `insertBlocksAfter(afterBlockId, blocks, name='Insertar')` | *name* | empty list or unknown id | Insert clones after the block with new ids. `t` defaults to 'p', `sec` to the reference block's, `style` to 'Normal', `runs` to `[]`. Keeps markers (`fn`, `toc`, `caption`, `index`, `biblio`). Structural | `{blockIds, caretPos:{first,0}}` |
| `removeBlockById(blockId)` | Eliminar bloque | unknown id, or it is the last remaining block | Remove the block, with no merge. Structural | `{caretPos:{prevNeighbour,0}}` |
| `replaceBody(blocks, name='Reemplazar contenido')` | *name* | empty list | Replace the whole body with clones that get new ids (`sec` defaults to the first section). **Band (`hf`) blocks are kept and appended at the end.** Structural | `{caretPos:{first,0}}` |

### 12.3 Deletion
| Factory | Undo name | Noop when | Behaviour |
|---|---|---|---|
| `deleteRange(range)` | Eliminar | collapsed | §5.10. `.result = {caretPos, fragment}` |
| `deleteBackward(pos)` | Retroceso | offset 0 in the first block | §5.7 |
| `deleteForward(pos)` | Suprimir | end of the last block | §5.8 |

### 12.4 Formatting, lists, styles
| Factory | Undo name | Noop when | Behaviour |
|---|---|---|---|
| `applyCharFormat(range, delta)` | Formato de fuente | the cleaned delta is empty, or the range is collapsed | §8.1. `.result = {caretPos: r.end, range}` |
| `applyParaFormat(range, delta)` | Formato de párrafo | delta empty and no `__indentDelta` | §8.2. Structural if `numbering` is in the delta |
| `setList(range, listId\|null, {level?})` | Aplicar lista / Quitar lista | the lists module is missing; or removing a list when no paragraph in the range has one | `ensureListDef(doc, listId)` runs **before** the command (not undone). For each `t:'p'` in the region: level = `opts.level`, else the paragraph's current level, else 0; then apply `listParaDelta(doc, listId, level)` (sets `numbering` and indents). Structural. `.result={caretPos, listId}` |
| `setListLevel(range, delta)` | Nivel de lista | the lists module is missing, or no paragraph in the range is in a list | Step ±1, clamped to [0, 8] (`MAX_LIST_LEVELS=9`). Paragraphs that are not in a list are skipped. Structural |
| `setStyle(range, styleId)` | Aplicar estilo | never | Set `block.style = styleId` on **every block in the region**. Unlike applyParaFormat, this includes a last block that the range reaches only at offset 0. Direct `para` and `char` overrides are not cleared |
| `setStyleProps(styleId, {char?, para?})` | Modificar estilo | delta empty | Snapshot of `doc.styles`. Shallow-merges into that style; an unknown id leaves it unchanged. Structural |
| `setTheme({majorFont?, minorFont?, colors?, name?})` | Tema | empty | Snapshot of `{theme, styles}`. Merges the theme. For each style that has `char.font` defined: Heading*/Titulo/Subtitulo get the major font, the others the minor font |

### 12.5 Section, page, document
| Factory | Undo name | Noop when | Behaviour |
|---|---|---|---|
| `setMargins(sectionId, {top?,right?,bottom?,left?})` | Márgenes | unknown section or empty | Overwrites only the finite keys (twips). Structural |
| `setPageSize(sectionId, {w?,h?,orient?})` | Tamaño de página | unknown or empty | If only `orient` is given, swap w and h so that landscape means w>h and portrait means h≥w. If `orient` is absent, `orient = w>h ? 'landscape' : 'portrait'` |
| `setColumns(sectionId, {count?,spacing?,widths?,sep?})` | Columnas | unknown or empty | Default `{count:1, spacing:708}`. `count` is clamped to [1,12]; `spacing` ≥ 0; `widths` is an array of values ≥ 1, or null; `sep` is a bool |
| `setSectionProps(sectionId, props)` | Configurar página | unknown or empty | Write each key as given (hyphenation, watermark, color, borders, vAlign and so on) |
| `setSectionFlags(sectionId, {differentFirst?, differentEven?})` | Opciones de sección | unknown or empty | Bool flags |
| `insertSectionBreak(range, start='nextPage')` | Salto de sección | the block was not found | `start` is one of nextPage, continuous, evenPage, oddPage (anything else becomes nextPage). The new section id is `sec{N}`, starting at N = sections.length+1 and incremented while the id is taken. The new section is a clone of the current one plus `{id, start, linkToPrevious:true}`, inserted after the current one. If the caret is mid-paragraph, the paragraph is split. If the caret is at the end of a non-empty paragraph, the cut is after that paragraph. All following blocks that have `sec == the original section` are reassigned. Undo also restores `doc.sections`. The region runs from the caret block to the **end of the body**. `.result={sectionId, caretPos}` |
| `setDocProps(props)` | Diseño del documento | empty | Writes top-level doc keys (pageColor, watermark, pageBorder, dictionary, citationStyle, mailMergeKind and so on) |
| `setDocName(name)` | Nombre del documento | empty after trim, or unchanged | `.result={name}` |
| `setBookmark(name, pos)` | Marcador | empty name | Remove any bookmark with the same name, then append `{name, blockId, offset}` |
| `removeBookmark(name)` | Eliminar marcador | not found | |
| `registerMedia(rid, info)` | — | — | **NOT a command, not undoable.** Sets `doc.media[rid] = {file, w, h, mime}` and returns the rid |

### 12.6 Images and SmartArt
| Factory | Undo name | Noop when | Behaviour |
|---|---|---|---|
| `resizeImage(pos, {w,h})` | Tamaño de imagen | bad pos, or w/h not finite | Find the run at `pos.offset` (`runAtOffset`). If it is an image, set `w,h = max(1, round(...))` in twips |
| `setImageProps(pos, {wrap?, align?})` | Ajuste de imagen | bad pos or empty props | Sets `run.wrap` / `run.align`. Structural |
| `updateSmartArt(blockId, {kind?, items?, props?})` | Modificar SmartArt | not a smartart block, or empty | Replace kind; replace items if the array is non-empty; shallow-merge props. Structural |

### 12.7 Tables
Table layout in the body: the `t:'table'` block, followed by every one of its cell paragraphs in reading order. Each cell paragraph has `cell:{tableId,row,col}`, and the table's `rows[r].cells[c].blocks` lists the paragraph ids. A new cell paragraph is `{t:'p', id, sec, style:'Normal', para:{after:0, line:240}, cell, runs:[]}`. A new cell is `{blocks:[id], vAlign:'top', shading:null}`.

| Factory | Undo name | Noop when | Behaviour |
|---|---|---|---|
| `insertTable(range, {rows=2, cols=2, widthTwips=9026})` | Insertar tabla | never | Delete the selection. If the caret is mid-paragraph, split it. If the caret is at the end of a non-empty paragraph, insert after it; otherwise before the caret block. The table has `props {align:'left', borders:'grid', fixedLayout:true, repeatHeader:false}` and `cols = evenColumns(width, n)`: equal widths, with the remainder added to the last column. The router clamps rows to [1,50] and cols to [1,20], and the width is the text column width. `.result={tableId, caretPos: first cell}` |
| `insertTableRow(tableId, at, where='below')` | Insertar fila | not a table | Destination row = `at` (above) or `at+1` (below), clamped. Add a row `{height:null, cells}`, shift the row coordinates of the existing paragraphs, then `renumberCells`. `.result.caretPos` = the new row's first cell |
| `deleteTableRow(tableId, at)` | Eliminar fila | not a table, or only 1 row | Remove that row's paragraphs and the row, shift up, renumber. Caret = first cell of the same row index, clamped |
| `insertTableColumn(tableId, at, where='right')` | Insertar columna | not a table | Destination = `at` (left) or `at+1` (right). Column widths are **re-distributed evenly** over the previous total (or 9026 if the total is 0) |
| `deleteTableColumn(tableId, at)` | Eliminar columna | not a table, or only 1 column | Widths are redistributed evenly. Caret = cell (0, min(col, last)) |
| `deleteTable(tableId)` | Eliminar tabla | not a table | Remove the table and all its cell paragraphs. Caret = {previous block, 0} |
| `setTableProps(tableId, {align?, borders?, repeatHeader?, cols?})` | Propiedades de tabla | not a table or empty | Copies align, borders and repeatHeader as given. `cols` is applied only if its length equals the column count; each width is `max(284 (MIN_COL_TWIPS), round(w))` |
| `mergeCells(tableId, {row1,col1,row2,col2})` | Combinar celdas | not a table, or `!canMerge` | `tables.applyMerge`. The absorbed cells' paragraphs are re-tagged to the kept cell, so their content is appended. Structural |
| `splitCell(tableId, row, col)` | Dividir celda | the cell is not merged (span ≤ 1 and no vMerge) | `applySplit`; each freed cell gets a new empty paragraph; renumber. Structural |
| `setTableStyle(tableId, {id, header, banded, borders, headerShading, bandShading})` | Estilo de tabla | not a table or empty | `props.style = id`; `props.borders` if given. Per-cell shading: row 0 when `header` → headerShading; when `banded`, odd rows r>0 → bandShading; every other cell → null |

`renumberCells(doc, table, tableId)` (registry.js:223-263):
1. Take all of the table's paragraphs out of the body, keeping their order.
2. Group them by their (current) `row|col`.
3. Walk the table model in reading order. Each cell gets its group of paragraphs, or **a newly created empty paragraph** if it has none. Each paragraph gets the final coordinates, and `cells[c].blocks` is rewritten.
4. Paragraphs left over (from deleted cells) are dropped.
5. Splice everything back in right after the table block.

**Pitfall:** absorbed (merged-away) cells still exist in the model. `renumberCells` therefore creates new empty paragraphs for them during later row or column operations. Check against the table spec.

### 12.8 Headers and footers
| Factory | Undo name | Noop when | Behaviour |
|---|---|---|---|
| `setBand(sectionId, kind, variant='default', blocks=null)` | Encabezado / Pie de página | both the new and the old band are empty | `kind` ∈ header, footer; `variant` ∈ default, first, even. Remove the existing paragraphs of that band, then append clones to the end of the body with new ids, `t:'p'`, `sec`, `style` defaulting to Normal, and `hf:{kind, variant}`. `null` or `[]` removes the band. The region is all band paragraphs to the end of the body. `.result={blockId: first, caretPos}` |

### 12.9 Comments, revisions, protection
| Factory | Undo name | Noop when | Behaviour |
|---|---|---|---|
| `addComment(range, {text, author?, initials?, date?})` | Comentario | text empty after trim | Snapshot of `doc.comments`. Appends `{id, author:'Autor' by default, initials (first letter of the first and last word, uppercase; '?' if none), date|null, text, blockId:start.block, start:start.offset, end: (same block ? end.offset : blockLength(start block)), resolved:false, replies:[]}`. **id = `c{count+1}-{max numeric suffix+1}`.** `.result={id}` |
| `deleteComment(id)` | Eliminar comentario | not found | |
| `updateComment(id, {resolved?, text?, reply?})` | Comentario | not found or empty | Sets resolved and/or text; pushes the reply onto `replies` |
| `setTracking({enabled?, author?, showMarks?})` | Control de cambios | empty | Merged over the default `{enabled:false, author:'Autor', showMarks:true}`. Structural |
| `resolveRevisions(range\|null, accept=true)` | Aceptar cambios / Rechazar cambios | no ins/del in the region | §10.2 |
| `setProtection({mode?})` | Proteger documento | empty | Default `{mode:'none'}` |

**Plan F9.2 names that do not exist as separate factories** (they are covered by the factories above): InsertImage (insertFragment plus registerMedia), InsertField (insertFragment), UpdateTOC (removeBlockById plus insertBlocksAfter, in a batch), SetZoom (not a command). `setFootnote` and `removeFootnote` are referenced in the guard but **do not exist**.

---

## 13. UI router command ids (main.js `route(id, params)`, lines 711-938)

These are the ids that the ribbon, the Quick Access Toolbar, keyboard shortcuts and menus send. Each entry lists what it calls and which registry factory or factories it uses. An unknown id logs «Skriba: comando sin implementar en v0.1 →». Undoability follows from the factory used. "—" means not undoable (view or UI state).

**Editing and clipboard**

| id | params | Action |
|---|---|---|
| `bold` `italic` `underline{style?}` `strike` `sub` `sup` `font-name{name}` `font-size{pt}` `font-grow` `font-shrink` `font-color{color}` `highlight{color}` `clear-format` | see §8.1 | applyCharFormat (clear-format: batch «Borrar formato» + setStyle Normal) |
| `align:left/center/right/justify`, `line-spacing{line\|mult}`, `space-before{tw}`, `space-after{tw}`, `indent:inc/dec{step?}` | §8.2 | applyParaFormat |
| `style` | `{id}` or `{styleId}` or a string | setStyle |
| `undo` / `redo` | — | stack |
| `save` | — | save now (—) |
| `copy` / `cut` / `paste` | — | §7 |
| `select-all` | — | selectAll (—) |
| `format-painter{sticky}` / `format-painter:off` | | §8.3 |
| `escape` | — | §11.4 |
| `font-dialog`, `paragraph-dialog` | | open the dialogs (they issue applyCharFormat / applyParaFormat) |

**Lists**

| id | params | Action |
|---|---|---|
| `bullets{listId?}` / `numbering{listId?}` / `multilevel{listId?}` | | toggle: the target is `listId`, or the first gallery entry of that kind. If the current paragraph already has that listId, apply null (remove); otherwise setList |
| `list:none` | | setList(null) |
| `list:level-inc` / `list:level-dec` | | setListLevel(±1) |

**Find, navigation, view, zoom**

| id | params | Action |
|---|---|---|
| `find`, `replace` | | toggle the pane (—) |
| `find:next`, `find:prev` | | open the pane if needed, then navigate (—) |
| `goto` | | Go To dialog (—) |
| `print` | | print (—) |
| `zoom:in` / `zoom:out` | | ±0.1 (—) |
| `zoom:reset` | | 1.0 (—) |
| `zoom:set{value}` | percent | value/100 (—) |
| `zoom:fit{fit}` | | (—) |
| `view:mode{mode}`, `view:ruler{on}`, `view:gridlines{on}`, `view:navigation{on}`, `view:marks{on}` | | view state (—) |
| `window:new`, `window:switch` | | (—) |
| `file:backstage` | | open the backstage at «inicio» (—) |

**Insert**

| id | params | Action |
|---|---|---|
| `insert:page-break` | | Ctrl+Enter path |
| `insert:line-break` | | Shift+Enter path |
| `insert:column-break` | | insertBreak('column') → **line break (BUG)** |
| `insert:section-break{start}` | | insertSectionBreak |
| `insert:blank-page` | | insertFragment «Página en blanco» |
| `insert:symbol{char}` | | insertFragment «Insertar símbolo» |
| `insert:cover{design}` | | insertFragment at the document start, «Insertar portada» |
| `insert:symbol-dialog`, `insert:datetime`, `insert:hyperlink`, `insert:bookmark`, `insert:cover-dialog`, `insert:table-dialog` | | dialogs |
| `dropcap{type: in-text\|in-margin\|other, lines}` | | applyParaFormat `{dropCap:{type, lines∈[2,10] default 3}}` or `{dropCap:null}` |
| `insert:wordart{preset}`, `insert:equation{src?}`, `insert:equation-dialog`, `insert:smartart-dialog` | | see the other specs |
| `smartart:edit{blockId}` | | dialog → updateSmartArt |
| `smartart:delete{blockId}` | | removeBlockById |
| `insert:image` | | file picker → upload → insertFragment «Insertar imagen» |
| `image:wrap{wrap}`, `image:align{align}`, `image:position{h}` | | setImageProps. `position` sets `{wrap:'square', align:h\|'left'}` |
| `insert:header` / `insert:footer` | | setBand (creates an empty band with tab stops if missing, then edits it) |
| `remove:header` / `remove:footer` | | setBand(..., null) |
| `insert:page-number{...}`, `remove:page-number` | | other spec |
| `insert:table{rows, cols}` | | insertTable |

**Tables**

| id | params | Action |
|---|---|---|
| `table:row-above` / `table:row-below` | | insertTableRow on the caret's cell |
| `table:col-left` / `table:col-right` | | insertTableColumn |
| `table:delete-row` / `table:delete-col` / `table:delete` | | |
| `table:props{align?, borders?, repeatHeader?, cols?}` | | setTableProps |
| `table:merge` | | mergeCells over the rectangle from the selection's start cell to its end cell (same table only) |
| `table:split` | | splitCell on the caret's cell |
| `table:style{id}` | | setTableStyle |
| `table:autofit` | | setTableProps `{cols: equal split of the current total (or the column width)}` |

**Layout tab**

| id | params | Action |
|---|---|---|
| `layout:margins{margins}` | | setMargins |
| `layout:orientation{orient}` | | setPageSize |
| `layout:size{name}` | | setPageSize with the paper size, keeping the current orientation |
| `layout:columns{preset}` | | setColumns |
| `layout:indent{left?, right?}` (cm) | | applyParaFormat; cm → twips, ≥ 0 |
| `layout:hyphenation{mode}` | | setSectionProps `{hyphenation: mode=='auto'}` (skipped if unchanged) |
| `section:flags{differentFirst?, differentEven?}` | | setSectionFlags |
| `layout:*-dialog` | | dialogs |

**Design tab**

| id | params | Action |
|---|---|---|
| `design:theme{id}`, `design:fonts{id}`, `design:colors{id}` | | setTheme |
| `design:spacing{id}` | | setStyleProps |
| `design:watermark{...}` | | setDocProps / setSectionProps |
| `design:page-color{color}` | | setDocProps `{pageColor}` |
| `design:page-border{style}` | | |
| `design:watermark-dialog`, `design:borders-dialog` | | dialogs |

**Review tab**

| id | params | Action |
|---|---|---|
| `review:track` | | setTracking `{enabled: toggled, author: current user}` |
| `review:show-marks` | | setTracking `{showMarks}` — **undoable, although it is really a view setting** |
| `review:accept` / `review:reject` | | resolveRevisions(selection, accept) |
| `review:accept-all` / `review:reject-all` | | resolveRevisions(null, accept) |
| `review:proofing`, `review:spelling-live{on}`, `review:word-count`, `review:language`, `review:protect`, `review:compare`, `review:read-aloud`, `review:read-stop` | | panes and dialogs |
| `comment:new`, `comment:delete`, `comment:delete-all`, `comment:next`, `comment:prev`, `comment:pane` | | comments pane → addComment / deleteComment |

**References, mailings, draw, help** (detailed in other specs)

| id | params | Action |
|---|---|---|
| `ref:toc`, `ref:toc-update`, `ref:toc-remove`, `ref:footnote`, `ref:endnote`, `ref:next-note`, `ref:caption`, `ref:figure-table{label}`, `ref:citation`, `ref:sources`, `ref:bibliography`, `ref:citation-style{style}`, `ref:cross`, `ref:index-mark`, `ref:index`, `ref:index-update`, `ref:notes-dialog` | | insertBlocksAfter / removeBlockById / insertFragment / setDocProps |
| `mail:recipients`, `mail:edit-list`, `mail:field`, `mail:envelope`, `mail:labels`, `mail:address-block`, `mail:greeting`, `mail:start{kind}`, `mail:preview`, `mail:preview-next`, `mail:preview-prev`, `mail:finish{mode}` | | replaceBody / setDocProps |
| `draw:tool{tool}`, `draw:pen{color}`, `draw:highlighter{color}`, `draw:width{width}`, `draw:delete`, `draw:clear-page`, `draw:clear-all` | | ink layer |
| `help:open`, `help:shortcuts`, `help:about`, `help:whats-new`, `help:feedback` | | dialogs (—) |

After a char, para, style, undo or redo command, `afterUiCommand()` refreshes the ribbon state and returns focus to the canvas.

---

## 14. Context menus (ui/contextmenu.js + main.js:555-566)

### 14.1 Component
`showContextMenu(x, y, items) → {close}`.

Item fields: `{label, icon?, shortcut?, disabled?, separator?, submenu?, onClick, content?}`.
- `content` is a custom element row. A click on any button inside it closes the menu.
- `icon` is either a name from the icon catalogue or raw SVG markup.

Behaviour:
- Only one root menu can exist at a time.
- Submenus open on hover, at `(row.right-2, row.top-5)`. If a submenu would overflow the right edge (`x+w > viewportW-4`), it opens to the left: `x = max(4, anchor.left - w + 2)`. A root menu that would overflow is moved to `max(4, vw - w - 4)`. Vertical overflow sets `y = max(4, vh - h - 4)`.
- Entering a row closes any deeper submenus.
- Clicking a row that has a submenu does nothing. Clicking any other enabled row closes all menus and then calls `onClick(item)`.
- The menu closes on: pointer-down outside any open menu (capture phase), Esc (stopPropagation), a wheel event outside the menu, window resize, and window blur.

### 14.2 Right-click on the canvas
```
hit = clientToPage; if none → native menu
if a SmartArt is under the point → menu: «Editar SmartArt…» | separator | «Eliminar SmartArt»
pos = xyToPos; if pos and NOT selection.contains(pos) → collapse caret to pos   (right-click inside the selection keeps it)
if pos is on a misspelled word → spelling menu: up to 6 suggestions (each replaces the word via insertText, "Escribir"),
     or «Sin sugerencias» (disabled) if none; separator; «Omitir todas»; «Agregar al diccionario» (setDocProps dictionary)
else if the caret is in a table → table menu:
   «Insertar fila encima», «Insertar fila debajo», «Insertar columna a la izquierda», «Insertar columna a la derecha», —,
   «Combinar celdas», «Dividir celda», «Distribuir columnas», «Estilos de tabla» ▸ (one entry per table style name), —,
   «Eliminar fila», «Eliminar columna», «Eliminar tabla», —,
   «Mostrar bordes» | «Quitar bordes» (toggles borders grid/none), «Repetir la primera fila en cada página» (toggle), —,
   «Alinear tabla a la izquierda», «Centrar tabla», «Alinear tabla a la derecha»
else → no custom menu
```
- **NOT IMPLEMENTED:** a general Cut / Copy / Paste / Font / Paragraph context menu on plain text.
- The native port should show no menu in that case, or add a standard Cortar / Copiar / Pegar menu as a documented addition.

---

## 15. Rendering hooks the editor needs from layout/view

| Call | Purpose |
|---|---|
| `layout.xyToPos(pageNo, x, y)` | Click/drag hit test (page px, zoom 1) |
| `layout.posToXY(pos) → {x, y, height}` | goalX and line height |
| `layout.posLineMove(pos, dir, x) → Pos\|null` | ↑/↓ |
| `layout.lineAt(pos) → {line:{blockId, start, end}, page}` | Home/End; current page number |
| `view.clientToPage(clientX, clientY) → {pageNo, x, y}\|null` | Screen → page coordinates |
| `view.drawSelection(range\|null)` | Draw the selection (collapsed → null) |
| `view.drawCaret(focusPos)` | Draw the caret |
| `view.scrollPosIntoView(pos)` | Keep the caret visible |
| `view.drawHighlights(matches, activeIdx)` | Find highlights |
| `view.zoom` | Zoom factor |

`editor.currentFormat()` returns `formatAtPos(doc, collapsed ? focus : range.start)`, the effective format, used for the ribbon state. On error it falls back to `{char:{}, para:{}, styleId:'Normal'}` (editor.js:620-628).

---

## 16. Constants (all in one place)

| Constant | Value | Source |
|---|---|---|
| Undo limit | 100 | command.js:31, registry.js:312 |
| Default batch name | 'Acción' | command.js:124 |
| AUTOSCROLL_EDGE | 36 px | editor.js:43 |
| AUTOSCROLL_MAX | 28 px/frame (min 2, `round(dist/2)`) | editor.js:45, 752-754 |
| Drag hit-test inset | 2 px | editor.js:770-771 |
| PageUp/Down defaults | viewport height 700 px, line height 20 px, lines = floor(h/zoom/lineH) - 1, minimum 1 | editor.js:859-870 |
| IME proxy, composing | 260 px wide, white background, text #201F1E, 11pt Aptos | input.js:235-242 |
| IME proxy, hidden | 1 px wide, min height 12 px | input.js:96, 218 |
| CLIPBOARD_MIRROR_LIMIT | 200 000 chars | input.js:99 |
| IMAGE_MIMES | png, jpeg, gif, webp, bmp | input.js:69 |
| Default pasted image name | «Imagen pegada» | editor.js:533, 558 |
| MAX_MATCHES (find) | 5000 | find.js:38 |
| Find debounce, typing / doc change | 160 / 220 ms | ui/dialogs/find.js:34-36 |
| Find prefill max length | 200 chars, no newline | ui/dialogs/find.js:405 |
| Indent step | 720 twips | parafmt.js:41 |
| Line spacings | 240 / 276 / 360 / 480 | parafmt.js:50 |
| Font size range | 1..1638 pt, 0.5 pt steps | charfmt.js:35-36, 96-101 |
| Zoom range | 0.1..5.0, step 0.1 | main.js:2581-2585 |
| Max list levels | 9 (levels 0..8) | formatting/lists.js:23 |
| Table defaults | 2×2, 9026 twips width, column min 284 twips; router clamps rows 1..50, cols 1..20 | registry.js:1397; tables/table.js:31; main.js:2137-2142 |
| Section default columns | `{count:1, spacing:708}`, count clamped 1..12 | registry.js:1133-1138 |
| Protection notice | shown 2.5 s, throttled to once per 4 s | main.js:364-372 |

---

## 17. Pitfalls checklist for the C++ team (summary)

1. **UTF-16 offsets** are part of the file format (bookmarks, comments) and of every Pos. Never split surrogate pairs.
2. **Body order includes tables, cell paragraphs and header/footer bands at the end.** Char/word navigation, docEnd and Ctrl+A do not skip them in the source. Add a flow-order filter (§1.3).
3. **Backspace/Delete have no table, band or footnote boundary guards** (§5.7). They can corrupt tables. They must be guarded.
4. **Enter copies the style.** `style.next` is ignored (§5.4). Decide on Word parity explicitly.
5. **Enter on an empty list item removes the list.** This also fires inside paste (§5.4).
6. **No typing coalescing.** Each keystroke is one undo entry, and the limit is 100 (§5.2, §9).
7. **Undo does not restore the selection.** Store selections in commands (§9.6).
8. **Clipboard is plain text only, both ways.** Pasted `\t` stays a literal char, not a tab run (§7).
9. **The column break becomes a line break** in `insertBreak` (§5.5).
10. **The shortcut map is non-standard:** Ctrl+S = underline, Ctrl+G = save, Ctrl+N = bold, Ctrl+K = italic, Ctrl+Shift+E = track changes; Ctrl+. and Ctrl+, change the font size (§6.2).
11. **Character formatting with a collapsed caret** applies to the word under the caret, or to nothing. There is no pending format (§8.1).
12. **The typing format** is the raw override of the previous char. After a tab, image or field it falls back to `{}` (§5.2).
13. **Find** works per paragraph. Wildcards translate to a regex with a non-greedy `*`. It is case-insensitive unless matchCase. The whole-word boundary includes `_`. The 5000 cap. Replace-all runs backwards inside one batch (§11).
14. **Tab in a table** selects the whole first paragraph of the next cell. Tab in the last cell adds a row. Merged cells can trap the caret (§5.6).
15. **Tracked deletes:** Backspace puts the caret before the deleted char and Delete puts it after. A multi-block deleteRange is NOT tracked, but insertText over a multi-block selection IS (§5.10, §10).
16. **Protection** is enforced in the command facade, not in the UI (§10.3).
