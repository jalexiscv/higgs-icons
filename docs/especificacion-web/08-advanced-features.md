# 08 — Advanced features (later phases of the native port)

Spec for the C++20/JUCE port of **Skriba**. Source root: `C:/xampp/htdocs/Skriba`.
All `file:line` references are relative to that root. Paths under `public/js/` are abbreviated
`js/` (e.g. `js/math/math.js:138` = `public/js/math/math.js` line 138).

This document covers: Equation (linear syntax → AST → box layout → OMML), SmartArt (5 layouts),
WordArt, References (TOC, captions, table of figures, index, citations/bibliography,
cross-references, footnotes/endnotes), Comments, Track changes (+ document protection),
Document compare, Proofing (punctuation rules, word count), Mail merge (data source, fields,
preview, finish, envelopes, labels), Ink, Image editing, the 14 Templates, the font catalogue
(summary) and the server-only features (summary + desktop relevance). It ends with complexity
estimates, a phase order and a consolidated pitfall list.

Spanish UI strings are quoted verbatim. Units: **twips** (1/20 pt) in the model; layout works in
**CSS px at zoom 1** (1 pt = 96/72 px; 1 px = 15 twips; `js/core/units.js:29`).

---

## 0. Shared concepts used by every feature

### 0.1 Linear offsets
A paragraph block `{t:'p', id, sec, style, para?, runs:[]}` has a *linear length*: a `text` run
contributes `text.length` (UTF-16 code units in JS — the port must pick a unit and use it
consistently for comments/proofing anchors; see §16), every other run (`tab`, `break`,
`field`, `image`, `math`) contributes **1** (`js/commands/registry.js:552`,
`js/editor/proofing.js:66-72` uses U+FFFC as the placeholder char for non-text runs).
Positions are `{blockId, offset}`; ranges `{start, end}`.

### 0.2 Fragments and the generic insert commands
Most features produce a **fragment** `{blocks:[...]}` (pure data) and then call one of:

| Command | Behaviour | Ref |
|---|---|---|
| `insertFragment(range, fragment, name)` | Deletes range, inserts the runs of `blocks[0]` inline at the caret (multi-block fragments split the paragraph). One undo entry. | (core commands spec) |
| `insertBlocksAfter(afterBlockId, blocks, name)` | Clones each block, assigns new id (`d.newBlockId()`), `sec` = anchor's `sec` if missing, `style` default `'Normal'`, `runs` default `[]`; splices after the anchor. Result `{blockIds, caretPos}`. Structural. | `js/commands/registry.js:766-789` |
| `removeBlockById(id)` | Removes whole block; no-op if it would leave the document empty. | `registry.js:796-806` |
| `replaceBody(blocks, name)` | Replaces **all non-band** blocks (keeps `hf` blocks, cloned, appended after); every new block gets a fresh id, default `sec` = first section id or `'sec1'`. One undo entry. | `registry.js:2058-2078` |
| `setDocProps(props)` | Snapshot-undoable write of arbitrary **top-level document keys** (`doc[k] = props[k]` for each key present). | `registry.js:1969-1985` |
| `batch(name, fn)` | Groups everything executed inside `fn` into one undo entry. | `registry.js:621-628` |

### 0.3 Generated-content markers
Generated paragraphs carry a marker key so they can be found/replaced later
(`js/editor/references.js:31-36`):

| Key | Values | Producer |
|---|---|---|
| `toc` | `'title'`, `'entry'`, `'empty'` | TOC |
| `figures` | same | Table of figures |
| `index` | same | Alphabetical index |
| `biblio` | same | Bibliography |
| `caption` | `{label:'figura'|'tabla'|'ecuacion', number}` | Caption |
| `fn` | `{id, kind:'footnote'|'endnote', number}` | Footnote/endnote paragraph |

### 0.4 Top-level document keys used by these features

| Key | Shape | Default | Persisted by `DocModel.toJSON()`? | Ref |
|---|---|---|---|---|
| `comments` | `Comment[]` (§5) | `[]` | yes | `js/core/document.js:140,250` |
| `tracking` | `{enabled:bool, author:string, showMarks:bool, date?}` | `{enabled:false, author:'Autor', showMarks:true}` | yes | `document.js:154,257` |
| `protection` | `{mode:'none'|'tracked'|'comments'|'readOnly'}` | `{mode:'none'}` | yes | `document.js:156,258` |
| `ink` | `{ "<pageNo>": Stroke[] }` (map, string keys) | `{}` | yes | `document.js:158,259` |
| `mailMerge` | `{fields:string[], records:object[]}` or `null` | `null` | yes | `document.js:160,260` |
| `bookmarks` | `[{name, blockId, offset}]` | `[]` | yes | `document.js:146,253` |
| `locale` | BCP-47 string | `'es-ES'` | yes | `document.js:183,240` |
| `dictionary` | `string[]` | `[]` | yes | `document.js:162,261` |
| `footnotes`, `trackChanges` | legacy arrays, unused | `[]` | yes (round-trip only) | `document.js:138,142` |
| `sources` | `Source[]` (§4.6) | absent | **NO — lost on save (bug)** | written by `js/ui/dialogs/references.js:218` |
| `citationStyle` | `'APA'|'MLA'|'Chicago'|'ISO690'` | absent → `'APA'` | **NO (bug)** | same |
| `indexEntries` | `[{text, blockId, offset}]` | absent | **NO (bug)** | `js/main.js:1269-1278` |
| `mailMergeKind` | string (`'letters'` default) | absent | NO | `main.js:1076` |
| `notesConvertedAt` | ms timestamp (relayout trigger hack) | absent | NO | `references.js(dialog):539` |

> **Port decision:** the native app MUST persist `sources`, `citationStyle` and `indexEntries`
> (and should tolerate them being absent on load). This is a Skriba bug, not a feature: the
> sources dialog promises «Las fuentes se guardan con el documento y alimentan la bibliografía.»
> (`js/ui/dialogs/references.js:202`). Write them as extra top-level keys; Skriba's loader
> ignores unknown keys, so files stay readable by Skriba. `mailMergeKind`/`notesConvertedAt`
> need not be persisted. Server-side, `fix_empty_objects` forces `media, theme, activeView, ink,
> tracking, protection` to serialize as JSON objects even when empty (`src/api/_common.php:867-878`)
> — the native writer must emit `{}` (not `[]`) for those keys.

### 0.5 Protection guard (applies to all content commands)
`main.js:296-357`: content commands (list incl. `insertBlocksAfter`, `removeBlockById`,
`updateSmartArt`, `resizeImage`, `setImageProps`, `replaceBody`, `setDocProps`, …) become
no-ops when `protection.mode ∈ {readOnly, comments}` (or a shared "ver" link) and flash
«Solo comentarios» / «Solo lectura» in the save-state label (throttled 4000 ms, restored after
2500 ms). Annotation commands (`addComment`, `deleteComment`, `updateComment`, `setTracking`,
`resolveRevisions`) stay allowed except in a "ver" share. **Mode `'tracked'` is stored but
never enforced** (nothing forces `tracking.enabled`) — see §6.5.

---

## 1. Equation engine

Sources: `js/math/math.js` (641 lines, pure except `buildMathDom`), dialog
`js/ui/dialogs/equation.js`, line-breaker hook `js/layout/breaker.js:191-203,621-626,717-755`,
render `js/layout/pages.js:1114-1124`, OMML writer `src/lib/OOXML/Writer.php:641-657,800-937`,
OMML reader `src/lib/OOXML/Reader.php:1673-1800`. Canonical doc:
`docs/componentes/ecuacion-smartart-wordart.md` §1.

### 1.1 Data model (run)
```json
{ "t": "math", "src": "pi r^2", "alt": "π r²", "ast": { "t": "seq", "items": [ ... ] }, "char": { } }
```
| Field | Meaning | Consumer |
|---|---|---|
| `src` | Linear notation as typed (trimmed) | re-editing (double-click) and layout (layout re-parses `src`, never uses `ast`) |
| `alt` | Unicode plain text from `linearizeMath` | clipboard, find, readers, docx fallback |
| `ast` | Parsed AST (§1.4), stored at insert time | docx export to real OMML (PHP does not re-parse) |
| `char` | optional run char format | font/size/bold/color/highlight |

Linear length = **1** (caret jumps over it; Backspace deletes it whole). Created by
`mathFragment(src)` → `{blocks:[{t:'p', runs:[{t:'math', src:trimmed, alt, ast}]}]}`
(`math.js:618-630`), inserted with `insertFragment` (inline in the current paragraph).
Imported equations (docx) have **no `ast`** and `alt === src` (§1.10).

### 1.2 Symbol tables (`math.js:42-74`)
`MATH_SYMBOLS` (name → char):

| Group | Entries |
|---|---|
| Greek lower | alpha α, beta β, gamma γ, delta δ, epsilon ε, zeta ζ, eta η, theta θ, iota ι, kappa κ, lambda λ, mu μ, nu ν, xi ξ, pi π, rho ρ, sigma σ, tau τ, phi φ, chi χ, psi ψ, omega ω |
| Greek upper | Gamma Γ, Delta Δ, Theta Θ, Lambda Λ, Xi Ξ, Pi Π, Sigma Σ, Phi Φ, Psi Ψ, Omega Ω |
| Operators/consts | inf ∞, sum ∑ (U+2211), int ∫, prod ∏ (U+220F), partial ∂, nabla ∇, cdot ·, times ×, div ÷, pm ±, mp ∓, deg °, approx ≈, neq ≠, leq ≤, geq ≥, equiv ≡, propto ∝, forall ∀, exists ∃, `in_` ∈, subset ⊂, cup ∪, cap ∩, to →, implies ⇒, iff ⇔, emptyset ∅, angle ∠ |

Note: `in_` is unreachable (the tokenizer stops words at `_`), keep for parity.
`MATH_FUNCS` (upright functions): `sin cos tan cot sec csc sen tg ctg arcsin arccos arctan sinh cosh tanh log ln lg lim exp max min det mod gcd mcd`.

`DIGRAPHS` (tested **in this order, before single chars**): `+-`→± · `-+`→∓ · `<=`→≤ · `>=`→≥ ·
`!=`→≠ · `~=`→≈ · `->`→→ · `=>`→⇒ · `**`→· · `...`→…

`SUP_DIGITS`: 0-9 → ⁰¹²³⁴⁵⁶⁷⁸⁹, `+`→⁺, `-`→⁻, `n`→ⁿ, `i`→ⁱ.
`SUB_DIGITS`: 0-9 → ₀…₉, `+`→₊, `-`→₋.

### 1.3 Tokenizer (`math.js:85-121`)
Scan left to right, index `i`:
1. Whitespace (`/\s/`) → skip.
2. If any digraph matches at `i` (first in table order wins) → token `{k:'op', v:<char>}`, advance by digraph length.
3. Digit `[0-9]` → consume `[0-9.,]*` → `{k:'num', v}` (so `1,5` and `3.14` are one number; **`f(1,2)` yields number `1,2`**).
4. Letter in `[A-Za-zÁÉÍÓÚáéíóúñÑ]` → consume the same class → `{k:'word', v}`. Multi-letter words are ONE token (`ab` is a single italic symbol "ab", not a·b). Other Unicode letters (π, ∑, Greek typed directly, ü, ç…) are **not** letters here.
5. `(` `)` `^` `_` `/` → token with `k` = that char.
6. Anything else → `{k:'op', v: c === '*' ? '·' : c}` (so `=`, `+`, `-`, `,`, `<`, `∑`, `π` typed directly…).

### 1.4 Parser → AST (`math.js:138-201`)
Never throws; unknown input becomes literal ops. AST node types:

| Node | Fields |
|---|---|
| `seq` | `items: Node[]` |
| `num` | `text` |
| `sym` | `text`, `italic: bool` |
| `op` | `text` |
| `func` | `text` |
| `group` | `items: Node[]` (parentheses are kept and drawn) |
| `frac` | `num`, `den` |
| `sup` | `base`, `exp` |
| `sub` | `base`, `sub` |
| `sqrt` | `arg` (a `seq`) |

Grammar (recursive descent, `p` = token cursor):
```
sequence(stop):                      # stop = ')' or null
  items = []; guard = 0
  while peek() and peek().k != stop and guard++ < 4096:
      a = atom()
      while peek().k == '/':
          next()
          den = (peek() exists and peek().k != stop) ? atom() : {t:'num', text:'1'}
          a = {t:'frac', num:a, den}            # left-associative: a/b/c = (a/b)/c
      items.push(a)
  return {t:'seq', items}

atom():
  a = primary()
  while peek().k in {'^','_'}:
      op = next().k; s = primary()             # NOTE: primary, not atom → x^-1 = (x^-)·1
      a = op=='^' ? {t:'sup', base:a, exp:s} : {t:'sub', base:a, sub:s}
  return a                                      # x_1^2 = sup(sub(x,1),2)

primary():
  tk = next(); if none → {t:'op', text:''}
  num  → {t:'num', text}
  word → if v=='sqrt' and peek().k=='(' : next(); arg=sequence(')'); consume ')' if present; {t:'sqrt', arg}
         elif v in MATH_SYMBOLS: {t:'sym', text:SYMBOL, italic:false}
         elif v in MATH_FUNCS:   {t:'func', text:v}
         else:                   {t:'sym', text:v, italic:true}
  '('  → items = sequence(')'); consume ')' if present; {t:'group', items: items.items}
  else (op, stray ')', '^', '_', '/') → {t:'op', text: tk.v}
```
Root = `sequence(null)`. Unclosed `(` just ends at EOF. `sqrt x` (no paren) → italic sym `sqrt`, sym `x`.

Verified examples (run with Node):
| Input | AST (abridged) | `alt` (linearize) |
|---|---|---|
| `pi r^2` | seq[sym π, sup(sym r, num 2)] | `π r²` |
| `x^(n+1)` | sup(x, group[n,+,1]) | `x^(n + 1)` |
| `a/b/c` | frac(frac(a,b),c) | `a/b/c` |
| `x^-1` | seq[sup(x, op -), num 1] | `x⁻ 1` |
| `sum_(k=1)^(n) k` | seq[sup(sub(∑, group[k,=,1]), group[n]), k] | `∑_(k = 1)ⁿ k` |
| `x = (-b +- sqrt(b^2 - 4 a c))/(2 a)` | … frac(group, group) | `x = ((- b ± √(b² - 4 a c)))/((2 a))` |

### 1.5 Linearizer (`linearizeMath`, `math.js:218-258`)
```
lin(seq)   = join(map(lin, items), ' ') then collapse /\s+/ to ' ' and trim
lin(num|sym|func|op) = text
lin(group) = '(' + lin(seq(items)) + ')'
lin(frac)  = pn + '/' + pd  where pn = lin(num) wrapped in '(...)' iff it contains whitespace (same for pd)
             (a group already has parens → double parens, e.g. "((2 a))" — faithful quirk)
lin(sup):  e = lin(exp) with all '(' ')' removed
           if every char of e is in SUP_DIGITS → lin(base) + mapped chars
           else body = exp is group ? lin(seq(exp.items)) : lin(exp);  lin(base) + '^(' + body + ')'
lin(sub):  same with SUB_DIGITS and '_('
lin(sqrt)  = '√(' + lin(arg) + ')'
```

### 1.6 Box layout (`mathLayout`, `math.js:264-545`)
`mathLayout(src, char, measurer) → {w, asc, desc, root}`; `asc`/`desc` are px above/below the
baseline. `char` is the **resolved** run char (font, size pt, bold…). Measurer API used:
`measurer.textWidth(text, char)` and `measurer.fontMetrics(char) → {ascent, descent}` — the
**same measurer as the paragraph line breaker** (so the native port must use its normal text
shaper metrics).

Memoization: key `` `${src}|${font||''}|${size||11}|${bold?1:0}` ``; LRU-ish map with max 500
entries, cleared entirely when full (`math.js:309-334`).

Constants:
| Name | Value | Meaning |
|---|---|---|
| `s` | `(char.size || 11) * 96/72` | body size in px (`sizePxOf`) |
| `SCRIPT_SCALE` | 0.62 | script size factor (nested scripts compound) |
| `OP_GAP_EM` | 0.16 | gap each side of an op in a seq (×s) |
| `BIG_OP_SCALE` | 1.35 | size factor of ∑ ∏ ∫ ⋂ ⋃ glyphs (always, with or without limits) |
| `BIG_UNDEROVER` | {∑, ∏, ⋂, ⋃} | limits stacked above/below |
| `BIG_GLYPHS` | {∑, ∏, ∫, ⋂, ⋃} | drawn large |

Box kinds:
- **text** `{kind:'text', text, font: char.font||'Aptos', sizePx, italic, bold, scaleY, w, asc: ascent*scaleY, desc: descent*scaleY}` measured with `{...char, italic}`.
- **bar** `{kind:'bar', w, h, asc:h, desc:0}` (fraction bar, radical overline).
- **box** `{kind:'box', w, asc, desc, children:[{box, dx, dy}]}` — `dx` = x offset; `dy` = **rise of the child's baseline above the parent's baseline** (negative = lowered).

Per-node rules (`layoutNode`, `math.js:366-505`):

| Node | Algorithm |
|---|---|
| `seq` | `x=0`; for each item: `isOp = item.t=='op' && text not '(' or ')'`; if isOp `x += 0.16s`; place child at `(x, dy 0)`; `x += child.w`; if isOp `x += 0.16s`; asc/desc = max of children. Empty seq → empty text box. (Unary minus and commas also get gaps.) |
| `num`, `op` | text box, upright |
| `sym` | text box, `italic = node.italic`; if text ∈ BIG_GLYPHS → measured with size×1.35 |
| `func` | text box upright; wrapping box `w = text.w + 0.14s` (thin space after) |
| `group` | inner = layout(seq); `(` and `)` text boxes; `glyphH = paren.asc+paren.desc`, `innerH = inner.asc+inner.desc`; if `innerH > glyphH*1.12`: each paren `scaleY = innerH/glyphH`, `asc = inner.asc`, `desc = inner.desc`. Box w = `(`.w + inner.w + `)`.w; asc/desc = max; children at dx 0, `(`.w, `(`.w+inner.w |
| `sup` | if `naryTarget(node)` → layoutNary. Else base = layout(base, char); exp = layout(exp, char size×0.62); `rise = 0.42s` (s of the *current* char); `w = base.w + exp.w + 1`; `asc = max(base.asc, rise + exp.asc)`; `desc = max(base.desc, exp.desc − rise)`; exp at `dx = base.w+1, dy = rise` |
| `sub` | same with `drop = 0.22s`; `asc = max(base.asc, sub.asc − drop)`; `desc = max(base.desc, drop + sub.desc)`; sub at `dx = base.w+1, dy = −drop` |
| `frac` | `axis = 0.30s`; `bar = max(1, round(0.055s))`; `gap = max(1, 0.08s)`; `pad = 0.18s`; `w = max(num.w, den.w) + 2pad`; `numDy = axis + bar/2 + gap + num.desc`; `denDy = axis − bar/2 − gap − den.asc` (negative); box `asc = numDy + num.asc`, `desc = −denDy + den.desc`; children: num centred `dx=(w−num.w)/2, dy=numDy`; bar `{w, h:bar}` at `dx 0, dy = axis + bar/2`; den centred at `dy=denDy` |
| `sqrt` | arg = layout(arg); sign = text `√`; `argH = arg.asc+arg.desc`; `glyphH = sign.asc+sign.desc`; if `argH > glyphH`: `sign.scaleY = (argH+3)/glyphH`, `sign.asc = arg.asc+3`, `sign.desc = arg.desc`; `rule = max(1, round(s*0.05))`; overline bar `{w: arg.w+4, h: rule}`; box `w = sign.w + arg.w + 6`, `asc = max(sign.asc, arg.asc + 3 + rule)`, `desc = max(sign.desc, arg.desc)`; children: sign (0,0), bar (`dx sign.w`, `dy arg.asc + 2 + rule`), arg (`dx sign.w+2`, `dy 0`) |
| other | empty text box |

`naryTarget(node)` (`math.js:282-301`): walk at most 2 levels down a sup/sub chain collecting
`upper` (first `sup.exp`) and `lower` (first `sub.sub`); the remaining base `cur` qualifies if
(`cur` is `sym` with text in BIG_UNDEROVER) OR (`cur` is `func` `lim` AND lower present AND
upper absent). Otherwise null (so `∫` with limits uses ordinary side scripts, with the big glyph).

`layoutNary` (`math.js:518-545`): op = `lim` text box at normal size, or the glyph at size×1.35;
lower/upper laid out at size×0.62; `gap = 0.10s`; `w = max(op.w, lower.w, upper.w) + 2`; op
centred at dy 0; lower centred at `dy = −(op.desc + gap + lower.asc)`, `desc = op.desc + gap +
lower.asc + lower.desc`; upper centred at `dy = op.asc + gap + upper.desc`, `asc = op.asc + gap +
upper.desc + upper.asc`.

Note: parentheses of `group` nodes are drawn everywhere, including fraction numerators,
scripts and nary limits (`(a+b)/(c+d)` shows parens; `sum_(k=1)` shows "(k=1)" under ∑).
This differs from Word's linear-format build-up but is Skriba's actual behaviour (and the OMML
export emits `m:d` for them too). Keep it for fidelity; an option to strip the outermost group
in frac/script/limit positions can come later.

### 1.7 Painting (`buildMathDom`, `math.js:559-606`)
Container `w = ceil(layout.w)`, `h = ceil(asc+desc)`. Recursive `paint(box, absX, absBaseY)`
starting with `absBaseY = layout.asc` (container-local, y down):
- text: draw at `left = absX`, `top = absBaseY − box.asc`, font family `'<font>', 'Cambria Math', Cambria, serif`, size `sizePx`, italic/bold, no wrapping; if `scaleY ≠ 1` scale vertically by `scaleY` around the **top-left** with the unscaled line box height `(asc+desc)/scaleY`.
- bar: filled rect `currentColor` at `left=absX`, `top = absBaseY − box.asc`, `w×h`.
- box: for each child `paint(child, absX + dx, absBaseY − dy)`.

In the page (`pages.js:1114-1124`): placed at `x = seg.x`, `top = line.baseline − seg.mAsc`;
colour = run char colour (or auto), highlight as background.

### 1.8 Line-breaker integration
- Tokenizer emits `{kind:'math', start, end:start+1, text: alt, src, char}` (`breaker.js:191-203`).
- Main loop: width = `mathLayout(src, char, measurer).w`; if `curW + w > lineWidth` and the line is non-empty → break **before** it (the equation moves whole to the next line; never split) (`breaker.js:717-755`).
- Line metrics: `ascent = max(…, mAsc)`, `descent = max(…, mDesc)`, `natural = max(…, mAsc+mDesc)` (`breaker.js:621-626`) — a fraction enlarges only its own line.

### 1.9 Editing flow & dialog
- Ribbon `insert:equation` with `params.src` inserts directly; otherwise opens the dialog (`main.js:812-816`).
- Double-click on canvas: if `layout.diagramAt` misses, `pos = xyToPos`, `mathRunAt(pos)` scans runs and matches a math run whose `[off, off+1]` contains `pos.offset` (**both sides**) (`main.js:2044-2056`); opens dialog with `src`, title «Editar ecuación».
- Save on edit: `insertFragment({start: run start, end: start+1}, mathFragment(src), 'Editar ecuación')` → one undo entry (`main.js:2070-2084`).
- Dialog (`js/ui/dialogs/equation.js`): width 520; input placeholder «Ej.: x = (-b +- sqrt(b^2 - 4 a c))/(2 a)»; live preview using `mathLayout` with `{font:'Aptos', size:16, color:'auto'}` (fallback: plain `linearizeMath` text if layout throws); empty → «Escribe la ecuación en notación lineal…»; Enter = confirm+close; buttons «Insertar»/«Guardar» + «Cancelar»; help line «Notación: x^2 superíndice · a_1 subíndice · a/b fracción · sqrt(x) raíz · pi alpha Omega griego · +- <= >= != -> signos · sum int inf operadores.»
- Gallery `EQUATION_GALLERY` (`math.js:633-641`):

| id | name | src |
|---|---|---|
| cuadratica | Fórmula cuadrática | `x = (-b +- sqrt(b^2 - 4 a c))/(2 a)` |
| pitagoras | Teorema de Pitágoras | `a^2 + b^2 = c^2` |
| circulo | Área del círculo | `A = pi r^2` |
| binomio | Cuadrado del binomio | `(a + b)^2 = a^2 + 2 a b + b^2` |
| euler | Identidad de Euler | `e^(i pi) + 1 = 0` |
| gauss | Suma de Gauss | `sum_(k=1)^(n) k = (n (n + 1))/2` |
| interes | Interés compuesto | `C = C_0 (1 + r/n)^(n t)` |

### 1.10 DOCX: OMML export (`Writer.php:641-657, 800-937`)
If the run has an array `ast` and it produces non-empty XML → emit `<m:oMath>…</m:oMath>` **as a
direct child of `w:p`** (no `w:r` wrapper, run char ignored). Otherwise fall back to
`<w:r>{rPr}<w:t xml:space="preserve">{alt ?? src}</w:t></w:r>` (empty → nothing). The document
root must declare `xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"`
(also on footnotes.xml).

| AST | OMML |
|---|---|
| seq | concatenation |
| num / sym / op | `<m:r><m:t xml:space="preserve">text</m:t></m:r>` (no italic flag; Word applies math italic) |
| func | `<m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t …>text</m:t></m:r>` |
| group | `<m:d><m:e>…</m:e></m:d>` |
| frac | `<m:f><m:num>…</m:num><m:den>…</m:den></m:f>` |
| sqrt | `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>…</m:e></m:rad>` |
| sup / sub (non-nary) | `<m:sSup><m:e>base</m:e><m:sup>…</m:sup></m:sSup>` / `<m:sSub>…<m:sub>…</m:sub></m:sSub>` |
| `lim` + lower only | `<m:limLow><m:e>{lim as func run}</m:e><m:lim>…</m:lim></m:limLow>` |
| ∑ ∏ ⋂ ⋃ with limits | `<m:nary><m:naryPr><m:chr m:val="∑"/><m:limLoc m:val="undOvr"/>[<m:subHide m:val="1"/>][<m:supHide m:val="1"/>]</m:naryPr><m:sub>…</m:sub><m:sup>…</m:sup><m:e/></m:nary>` |
| ∫ with limits | same with `limLoc subSup` |

`ommlNary` uses the same 2-level chain walk as `naryTarget`, but **includes ∫** (`Writer.php:918`).
Child order inside `m:naryPr` matters (chr → limLoc → subHide → supHide). The nary's `<m:e/>` is
**always empty** — the summand stays as following siblings (Word accepts it; a later improvement
would move the next item into `m:e`). Empty text runs are skipped (`ommlRun`).

### 1.11 DOCX: OMML import (`Reader.php:1673-1800`)
`m:oMath`/`m:oMathPara` → run `{t:'math', src, alt: src}` (no `ast`), warning «Ecuaciones
importadas a la notación lineal del editor (revisar las complejas)». Mapping (`mathSrc`):
`m:t`/`m:r` text; `f` → `(num)/(den)`; `sSup` → `base^(sup)`; `sSub` → `base_(sub)`;
`sSubSup` → `base_(sub)^(sup)`; `sPre` → e; `rad` → `sqrt(e)`; `d` → `(e1, e2, …)`; `nary` →
`chr` (default ∫) + `_(sub)` + `^(sup)` + `' '` + e; `limLow` → `e_(lim)`; `limUpp` → `e^(lim)`;
`func` → `fName e`; `eqArr`/`m`/`mr` → items joined `', '`; container elements recurse;
`*Pr` ignored. `mathBase` wraps a multi-atom base in parens.

**Pitfall:** imported src contains Unicode symbols (`∑`, `π`…) which the tokenizer treats as
`op` — so imported `∑_(i=1)^(n)` does **not** stack limits on screen (naryTarget requires
`sym`) and gets op gaps; and re-export uses the `alt` fallback (no `ast`) → plain text in Word.
Recommended native improvement (keeps file compatibility): in the tokenizer, map a direct
Unicode char that is a value of `MATH_SYMBOLS` to a `sym` (upright) instead of `op`, and compute
`ast` on import so export is real OMML.
(The canonical doc §8 still says OMML import is "pendiente" — stale; the Reader does it.)

### 1.12 Complexity
Medium. Parser/linearizer: ~300 LOC, trivially testable with golden tests generated from the JS.
Layout: ~250 LOC, needs the shaping measurer + vertical glyph scaling in the painter. OMML
writer ~120 LOC, reader ~150 LOC. **Est. 4–6 dev-days** incl. tests.

---

## 2. SmartArt (diagram engine)

Sources: `js/smartart/smartart.js` (403 lines, pure), dialog `js/ui/dialogs/smartart.js`,
paginator `js/layout/paginator.js:235-256,389-407,637-643`, render `js/layout/pages.js:849-851,1131-1153`,
command `js/commands/registry.js:1723-1737`, docx fallback `Writer.php:330-335,943-966`.

### 2.1 Data model (body block, no runs)
```json
{ "t":"smartart", "id":"b7", "sec":"sec1", "kind":"hierarchy",
  "items":[ {"text":"Dirección","children":[ {"text":"Ventas","children":[]} ]} ],
  "props":{ "color":"#4472C4" } }
```
`kind ∈ {list, process, cycle, hierarchy, pyramid}` (`SMARTART_KINDS`, `smartart.js:35-41`;
names «Lista» «Proceso» «Ciclo» «Jerarquía» «Pirámide», hints «Bloques apilados con niveles»,
«Pasos con flechas», «Etapas alrededor de un círculo», «Organigrama», «Niveles apilados en
triángulo»). Colours `SMARTART_COLORS = #4472C4 #ED7D31 #70AD47 #FFC000 #7030A0 #C00000`.
The caret never enters the block; it is excluded from text operations.
`smartartBlock(spec)`: unknown kind → `'list'`; empty items → `[{text:'Elemento 1', children:[]}]`;
`props.color` default `#4472C4` (`smartart.js:127-137`).

### 2.2 Text panel ⇄ tree
`parseItems(text)` (`smartart.js:91-104`): split on `\n`; skip blank lines; leading
whitespace → `level = floor(Σ (tab ? 1 : 0.5))` (2 spaces = 1 level; 1 space = 0; 3 spaces = 1);
`text = line.trim()`; stack of `{level,node}` seeded with a root at level −1; pop while
`top.level >= level`; append to top's children; push. (A jump from level 0 to 3 nests directly
under the previous node.) `serializeItems(items, level)` writes `'  '.repeat(level) + text` per
node depth-first, joined by `\n`. Round-trip is exact.

### 2.3 Colour helpers
- `mix(a, b, t)`: per channel `round(a + (b−a)·t)`, output `#RRGGBB` uppercase.
- `luma(hex) = (0.299R + 0.587G + 0.114B)/255`.
- `levelFill(base, level) = mix(base, '#FFFFFF', [0, 0.35, 0.55, 0.7][clamp(level,0,3)])`.
- `textOn(fill) = luma(fill) > 0.62 ? '#1F2430' : '#FFFFFF'`.

### 2.4 Layout `layoutSmartArt(block, widthPx) → {shapes, height, width}` (`smartart.js:385-403`)
`width = max(120, widthPx || 120)` (column content width, px@zoom1). After the kind layout,
**every shape `y += 8`** and `height += 16` (8 px margin top & bottom). Shape:
`{type:'rect'|'arrow'|'line', x, y, w, h, text?, fill?, textColor?, fontSize?, radius?, clip?, rot?}`.
`rect(x,y,w,h,text,fill,fontSize=12,radius=6)` sets `textColor = textOn(fill)`.
`flatten(items)` = depth-first list of `{text, level}`.

| Kind | Algorithm (`smartart.js`) |
|---|---|
| **list** (158-171) | `H=38, GAP=8`; for each flat item: `indent = min(width·0.5, level·36)`; rect at `(indent, y)`, `w = max(80, width − indent)`, `h = H`, fill `levelFill(base, level)`; `y += H+GAP`. `height = max(0, y − GAP)` |
| **process** (174-199) | `H=46, ARW=26, VGAP=22`; all flat items (children included); `BOX = min(160, max(96, floor((width − 52)/3)))`; `perRow = max(1, floor((width + ARW)/(BOX + ARW)))`; per row: `rowW = n·BOX + (n−1)·ARW`, `x = max(0,(width−rowW)/2)`; rect `BOX×H` fill by level; between boxes an `arrow {x, y, w:ARW, h:H}`; `y += H+VGAP`. `height = max(0, y − VGAP)` |
| **cycle** (202-239) | `BOX_W=118, BOX_H=42`; `n = max(1, count)`; `height = n<=4 ? 230 : 290`; `cx=width/2, cy=height/2`; `rx = max(BOX_W/2+8, width/2 − BOX_W/2 − 8)`; `ry = (height − BOX_H)/2 − 4`; item i at angle `θ = −π/2 + 2πi/n`: `x = clamp(cx + rx cosθ − BOX_W/2, 0, width−BOX_W)`, `y = clamp(cy + ry sinθ − BOX_H/2, 0, height−BOX_H)`, rect radius **10**. If `n ≥ 2`, for each i an arrow at `mid = −π/2 + 2π(i+0.5)/n`: `{x: cx + rx cos(mid) − 10, y: cy + ry sin(mid) − 10, w:20, h:20, rot: −rot}` with `rot = atan2(ry·cos(mid), −rx·sin(mid)) · (−180/π)` (i.e. final `rot = +atan2(...)·180/π`; screen y grows downward, clockwise travel) |
| **pyramid** (242-271) | `H=46, GAP=4`; `maxW = min(width, 540)`; `x0 = (width − maxW)/2`; for item i of n: `botW = maxW(i+1)/n`, `topW = maxW(i+0.22)/n`; fill `mix(base, '#FFFFFF', n>1 ? 0.55·i/(n−1) : 0)` (apex darkest); rect `x = x0 + (maxW−botW)/2`, `y = i(H+GAP)`, `w = botW`, `h = H`, `fontSize 12`, `clip = clamp(topW/botW, 0.05, 1)` (no radius). `height = n(H+GAP) − GAP` |
| **hierarchy** (274-340) | `BOX_W=132, BOX_H=38, HG=16, VG=30`. `subW(n) = leaf ? BOX_W : max(BOX_W, Σ subW(children) + HG·(k−1))`. `place(node, left, level)`: `w = subW(node)`, `cx = left + w/2`, `y = level(BOX_H+VG)`, rect centred (`cx − BOX_W/2`), fill `levelFill(base, level)`. If children: `busY = y + BOX_H + VG/2`; line `{x: cx−1, y: y+BOX_H, w:2, h: VG/2}`; children strip `childrenW = Σ subW + HG(k−1)`, start `cl = left + (w − childrenW)/2`; each child centre `cl + cw/2`, `place(child, cl, level+1)`, `cl += cw + HG`; if k>1 bus line `{x: minC−1, y: busY−1, w: maxC−minC+2, h:2}`; each child stub `{x: c−1, y: busY, w:2, h: VG/2}`. Roots placed side by side from `left = max(0,(width − total)/2)` with `total = Σ subW(roots) + HG(k−1)`. If `total > width`: `f = width/total`, every shape `x *= f`, `w = max(2, w·f)` (heights unchanged). `height = (maxLevel+1)(BOX_H+VG) − VG + 4` |

### 2.5 Shape rendering (`shapeCss`, `smartart.js:354-376`) — single source of truth for page and dialog preview
- `rect`: fill, text colour `textColor`, font size `fontSize` px (default 12), text centred both ways, padding 2 px V / 8 px H, line-height 1.2, overflow clipped, word wrap. If `clip != null`: trapezoid polygon `((1−clip)/2·100% 0), ((1+clip)/2·100% 0), (100% 100%), (0 100%)`, **no** radius/shadow. Else rounded corners `radius` (default 6) + shadow `0 1px 2px rgba(0,0,0,.18)`. Font family = page UI default (not specified → use body font).
- `arrow`: glyph `➜` (U+279C) centred, colour `#8A8886`, font size `min(18, h)` px, rotated `round(rot)` degrees about its centre.
- `line`: filled rect `#8A8886`.

### 2.6 Pagination, hit-testing, commands
- Paginator: diagram cached per block at column width (`{...layoutSmartArt(block, widthPx), widthPx, lines:[]}`); placed as an **indivisible** block: if the page already has items and `y + h > bottomLimit` → next column/page. Pushed to `page.diagrams = [{blockId, x: colDx, y, w: min(entry.width, contentWidth), h, shapes}]`; `y += h` (`paginator.js:389-407`). Space-before/after of neighbours treated like a paragraph (`prevAfterPx`).
- `layout.diagramAt(pageNo, y)`: first diagram with `d.y <= y <= d.y+d.h` (x ignored) (`paginator.js:637-643`).
- Double-click on a diagram → edit dialog; context menu «Editar SmartArt…» / «Eliminar SmartArt» (`main.js:569-576, 2114-2121`).
- Insert: `insertBlocksAfter(caretBlockId, [block], 'Insertar SmartArt')` (`main.js:2100-2103`). Edit: `updateSmartArt(blockId, {kind, items, props})` — kind if truthy, items only if non-empty array, props merged; structural (`registry.js:1723-1737`). Delete: `removeBlockById`.
- Dialog: title «Insertar SmartArt»/«Editar SmartArt», width 500; kind buttons; textarea (default text `Planificar\nDiseñar\nConstruir\nEntregar`, default kind for **new** diagrams `'process'`), placeholder «Un elemento por línea\n  Dos espacios delante = subelemento»; six swatches; preview at reference width **640** scaled by `min(previewWidth/640, 146/height, 1)` into a 150 px tall box; hint «La sangría de dos espacios crea subelementos (en la jerarquía son los subordinados; en la lista, bloques sangrados).»; OK with no items → refuse (dialog stays open).

### 2.7 DOCX
Export (degraded): each node depth-first → `<w:p><w:pPr><w:ind w:left="{720+360·level}" w:hanging="360"/></w:pPr><w:r><w:t xml:space="preserve">• {text}</w:t></w:r></w:p>`; empty texts skipped (children still visited) (`Writer.php:943-966`). Import: no reconstruction (paragraphs). Native JSON keeps the full diagram.

### 2.8 Complexity
Low–medium: geometry ~250 LOC pure; painting needs rounded rects, shadow, trapezoid clip, rotated glyph, wrapped centred text. **3–4 dev-days.**

---

## 3. WordArt

Source `js/editor/wordart.js` (122 lines), view `js/layout/pages.js:1229-1246`, route
`main.js:2006-2030`.

### 3.1 Model
WordArt is **not an object**: a normal text run whose `char` has an extra `effect`:
```
effect = { gradient?: [c1, c2, ...]   // ≥2 stops; overrides colour on screen
           stroke?:   {color, width}   // glyph outline, width in px
           shadow?:   string           // full CSS text-shadow list
           spacing?:  number }         // letter-spacing px
```
All engine features (caret, find, word count, spell, undo) treat it as plain text.

### 3.2 Presets (`WORDART_PRESETS`, `wordart.js:28-92`) — all `font:'Aptos Display', size:36, bold:true`

| id | name | color | effect |
|---|---|---|---|
| azul | «Relleno azul» | #2F5496 | shadow `1px 2px 2px rgba(0,0,0,.35)` |
| degradado | «Degradado cálido» | #C55A11 | gradient `[#F6B26B, #C0392B]`, shadow `0 2px 3px rgba(0,0,0,.25)` |
| contorno | «Contorno» | #FFFFFF | stroke `{#2F5496, 1.5}` |
| neon | «Neón» | #00B0F0 | shadow `0 0 6px rgba(0,176,240,.9), 0 0 14px rgba(0,176,240,.6)` |
| metal | «Metálico» | #7F7F7F | gradient `[#E8E8E8, #6D6D6D]`, stroke `{#4D4D4D, 0.75}`, shadow `0 2px 2px rgba(0,0,0,.35)` |
| sombra | «Sombra larga» | #1F2430 | shadow `2px 2px 0 #C8C6C4, 4px 4px 0 #E1DFDD`, spacing 1 |
| arcoiris | «Arcoíris» | #E4572E | gradient `[#E4572E, #F3A712, #76B041, #17BEBB, #6A4C93]`, shadow `0 1px 2px rgba(0,0,0,.25)` |

`wordartPreset(id)` → preset or first. Placeholder `WORDART_PLACEHOLDER = 'Su texto aquí'`.

### 3.3 Behaviour (`main.js:2006-2030`)
- Non-collapsed selection → `applyCharFormat(range, deepClone(preset.char))` (font, size, bold, color **and** effect).
- Collapsed caret → `insertBlocksAfter(caretBlockId, [ {t:'p', style:'Normal', para:{align:'center', line:240, before:160, after:160}, runs:[{t:'text', text:'Su texto aquí', char: clone(preset.char)}]} ], 'WordArt')`, then select the whole new paragraph.

### 3.4 Rendering (`pages.js:1231-1246`)
- gradient (≥2 stops): **vertical** linear gradient top→bottom (CSS `180deg`), evenly spaced stops, clipped to glyph shapes; glyph fill otherwise transparent.
- stroke: outline of `width` px in `color` (CSS `-webkit-text-stroke`: centred on the outline, painted over the fill).
- shadow: parse a CSS `text-shadow` list: comma-separated items `offX offY [blur] color`, colours as `#hex` or `rgba(r,g,b,a)`; draw in reverse list order (first = topmost) behind the text; blur = Gaussian with σ ≈ blur/2.
- spacing: add `spacing` px after every glyph.
- Revision colour (§6) overrides `color` but gradient wins visually (as in Skriba).

**Pitfall:** Skriba's measurer ignores `effect.spacing` (`grep` finds no use in `measure.js`/`breaker.js`), so on screen the text overflows its measured width. The native port should **include spacing in measurement** (deliberate improvement; flag in the release notes).

### 3.5 DOCX
Effects are dropped; text keeps font/size/bold/colour. (Future: `w14:textFill`, `w14:shadow`.)

### 3.6 Complexity
Low for model; medium for rendering (gradient-clipped text, stroked glyph paths, blurred
shadows → render glyphs to `juce::Path`). **2–3 dev-days.**

---

## 4. References tab

Sources: `js/editor/references.js` (406 lines, pure), `js/editor/outline.js` (93),
`js/ui/dialogs/references.js` (540), wiring `js/main.js:1154-1344`, footnote pagination
`js/layout/paginator.js:68,321-322,409-454,851-959`, notes render `pages.js:862-905`,
CSS `public/css/canvas.css:411-427`.

### 4.1 Outline (`outline.js`)
`headingLevel(styleId)`: `/^Heading([1-9])$/` → N; `Titulo` → 0; `Subtitulo` → 1; else null.
`blockPlainText(block)`: concat text runs + field `result` + tab→' '; collapse whitespace; trim.
`outline(doc, {maxLevel=9, skipEmpty=true})`: body paragraphs (skip `hf` and `cell`) whose style
has a level ≤ maxLevel and non-empty text → `[{blockId, level, text, styleId}]`.
`numberOutline` (used by navigation only): counters per level 1..9, level<1 → `''`, else
`"1.2.3."`.

**Pitfall (faithful but undesirable):** generated titles (TOC «Contenido», bibliography,
index, figures) use style `Heading1`, so they themselves appear in the outline and in the next
TOC update. Recommended: exclude blocks having `toc|figures|index|biblio` markers from
`outline()` in the port (no file-format impact).

### 4.2 Table of contents
`tocFragment(entries, opts)` (`references.js:54-103`):
- opts: `tabTwips` (default **9026**), `levels` (default 3), `showPages` (default true), `title` (default «Contenido»; `null` = no title), `hyperlinks` (default true).
- Title block: `{t:'p', style:'Heading1', runs:[{t:'text', text:title}], toc:'title'}`.
- Each entry with `level <= levels`: `nivel = max(0, level − 1)` (level 0 and 1 both indent 0); runs: `{t:'text', text, char:{link:'#'+blockId, linkTip:text}}` (no char when hyperlinks false), then if showPages `{t:'tab'}` + `{t:'field', code:'PAGEREF '+blockId, result: String(page || 1)}`; para `{left: 360·nivel, after:0, line:240, tabs:[{pos: tab, type:'right', leader:'dot'}]}`; marker `toc:'entry'`.
- No entries → paragraph «No hay títulos a los que aplicar la tabla de contenido.» with `toc:'empty'`.

Wiring (`main.js:1234-1242`): entries = `outline(doc, {maxLevel: levels}).map(e => ({...e, page: pageOfBlock(e.blockId)}))`; `pageOfBlock` = page number of the line containing `{blockId, offset 0}` (1 if not paginated) (`main.js:1157-1164`); `tabTwips` = current column width in twips.

**Replace-or-insert** `replaceGenerated(key, fragment, name)` (`main.js:1184-1208`):
1. `existing = body.filter(b => b[key])`.
2. None → `insertBlocksAfter(caret block, blocks)`; caret to first new block.
3. Else, in one batch: `insertBlocksAfter(lastExisting.id, blocks)` then `removeBlockById` for each existing (so content stays in place).
`ref:toc-update` regenerates with defaults (levels 3, showPages true). `ref:toc-remove`
(`removeGenerated`, `main.js:1211-1222`) does `deleteRange` from offset 0 of the first marked
block to the end of the last one (leaves one empty paragraph; it deletes **everything between**
first and last marked blocks, including any non-TOC block in between).

Page numbers are snapshots (no live update). DOCX: entries export as normal paragraphs with
`w:hyperlink w:anchor="<blockId>"` and `w:fldSimple w:instr="PAGEREF <blockId>"`; Writer does not
emit bookmarks named after block ids, so Word's F9 update breaks these (verify in docx spec).

### 4.3 Captions
`CAPTION_LABELS` (`references.js:110-114`): `figura` {singular «Figura», plural «Tabla de
ilustraciones»}, `tabla` {«Tabla», «Índice de tablas»}, `ecuacion` {«Ecuación», «Índice de
ecuaciones»}.
`captionFragment({label, number, text, position})` (`references.js:123-141`): unknown label →
`figura`; number default 1; block `{t:'p', style:'Cita', para:{align:'center', before:80,
after:160, line:240}, runs:[{text:'<Singular> <n>', char:{bold:true}}, {text: text ? '. '+text : ''}],
caption:{label, number}}`.
Dialog (`dialogs/references.js:306-381`): «Insertar título», width 460; rows «Rótulo:», «Título:»
(placeholder «Descripción de la ilustración»), «Posición:» («Debajo de la selección» /
«Encima de la selección»), live preview `Figura 3. text`. **Number = count of existing blocks
with `caption.label == initialLabel` + 1, computed once when the dialog opens** (changing the
label in the combo does not recompute; no renumbering on insertion order). Insert with
`insertBlocksAfter(anchor)` where anchor = selection end block (below) or the block **before**
the selection start (above; if the selection starts at block 0 this resolves to block 0 itself,
i.e. below). Undo name «Insertar título».

### 4.4 Table of figures (`figureTableFragment`, `references.js:149-182`; `main.js:1245-1256`)
Entries = body blocks with `caption.label == label` → `{blockId, text: blockText, page}`.
Title default = label's plural (`Heading1`, `figures:'title'`). Entry runs `text`, `tab`,
`PAGEREF blockId` field; para `{after:0, line:240, tabs:[right dot at tab]}` (no indent, no
hyperlink). Empty → «Todavía no hay títulos de ilustración en el documento.»

### 4.5 Alphabetical index
Mark entry (`main.js:1269-1278`): prompt «Entrada de índice:» prefilled with selected text;
appends `{text, blockId: selection start block, offset}` to `doc.indexEntries` via
`setDocProps` (not persisted in Skriba — persist in the port).
`indexFragment(entries)` (`references.js:196-232`): title «Índice» (`index:'title'`); group by
trimmed text (skip empty) collecting a **set** of pages (`Number(page) || 1`); sort keys with
Spanish collation (`localeCompare(_, 'es')` → use ICU/`juce` collator with `es` locale); each
entry `"<text>, p1, p2"` with pages ascending, para `{left:0, first:-180, after:0, line:240}`.
Empty → «No hay entradas de índice marcadas.» Pages come from `pageOfBlock(entry.blockId)`.

### 4.6 Citations and bibliography
Source record (`dialogs/references.js:125-132`): `{author, title, year, publisher, city, url}`
(all strings; `page` only transient for citations). Styles `['APA','MLA','Chicago','ISO690']`.

`surname(author)` (`references.js:239-243`): split on whitespace; ≤1 part → that part; else all
parts after the first (`"Ana Pérez López"` → `"Pérez López"`). **Pitfall:** the sources dialog
placeholder says «Apellidos, Nombre», but the algorithm assumes "Nombre Apellidos"; keep
behaviour, maybe fix later.

`formatCitation(src, style)` (`references.js:251-267`); `autor = surname || author || 'Anónimo'`,
`anio = year ? String(year) : 's. f.'`, `pag = page || ''`:

| Style | Output |
|---|---|
| APA (default) | `(${autor}, ${anio}${pag ? ', p. '+pag : ''})` |
| MLA | `(${autor}${pag ? ' '+pag : ''})` |
| Chicago | `(${autor} ${anio}${pag ? ', '+pag : ''})` |
| ISO690 | `(${AUTOR_UPPER}, ${anio})` |

`formatReference(src, style)` (`references.js:275-301`); `autor = author.trim() || 'Anónimo'`,
`titulo = title || 'Sin título'`, editorial/ciudad/url trimmed:

| Style | Template |
|---|---|
| APA | `${autor} (${anio}). ${titulo}. ${editorial}${editorial ? '.' : ''}` |
| MLA | `${autor}. ${titulo}. ${editorial}${editorial && anio ? ', ' : ''}${anio}.` |
| Chicago | `${autor}. ${anio}. ${titulo}. ${ciudad ? ciudad+': ' : ''}${editorial}.` |
| ISO690 | `${AUTOR_UPPER}. ${titulo}. ${ciudad ? ciudad+': ' : ''}${editorial}, ${anio}.` |
then `if url: += ' ' + url`; finally collapse `\s+`→' ', replace every `..`→`.`, trim.
Golden outputs for `{author:'Ana Pérez López', year:2020, title:'Libro', publisher:'Planeta', city:'Madrid'}`, page 12:
APA `(Pérez López, 2020, p. 12)` / `Ana Pérez López (2020). Libro. Planeta.`;
MLA `(Pérez López 12)` / `Ana Pérez López. Libro. Planeta, 2020.`;
Chicago `(Pérez López 2020, 12)` / `Ana Pérez López. 2020. Libro. Madrid: Planeta.`;
ISO690 `(PÉREZ LÓPEZ, 2020)` / `ANA PÉREZ LÓPEZ. Libro. Madrid: Planeta, 2020.`
Edge: `{}` APA → `Anónimo (s. f.). Sin título.`; `{author:'X'}` Chicago → `X. s. f. Sin título. .` (sic).
Uppercasing must be Unicode-aware (`É`).

`bibliographyFragment(sources, {style, title})` (`references.js:309-340`): style fallback APA;
title default «Bibliografía»; sort by `author` with Spanish collation; each entry one text run,
para `{left:720, first:-720, after:120, line:240}` (hanging indent), `biblio:'entry'`; empty →
«No hay fuentes registradas.». Inserted with `replaceGenerated('biblio', …)` using
`doc.citationStyle || 'APA'`.

Citation insert (`dialogs/references.js:234-296`): no sources → dialog «Todavía no hay fuentes.
Añádelas primero en «Administrar fuentes».» with button «Administrar fuentes…». Otherwise list
(formatted references), «Página:» (placeholder «opcional»), preview, «Insertar» → **plain text
`insertText`** (not a field; does not update when style changes).

Sources dialog (`dialogs/references.js:98-224`), title «Administrar fuentes», width 520: style
combo (on change re-renders list + preview), «Nueva» / «Eliminar», list of formatted references
(«No hay fuentes registradas.» when empty), fields «Autor:» (placeholder «Apellidos, Nombre»),
«Título:», «Año:», «Editorial:», «Ciudad:», «URL:», preview («Añade una fuente para ver aquí su
formato.» when empty), note «Las fuentes se guardan con el documento y alimentan la
bibliografía.». OK: commit active form, drop sources with neither author nor title,
`setDocProps({sources, citationStyle})`. Ribbon `ref:citation-style` sets `citationStyle` directly.

### 4.7 Cross-reference (`dialogs/references.js:391-482`)
Type: «Título» (outline), «Marcador» (`doc.bookmarks` → `{id: blockId, text: name}`), «Título
de ilustración» (caption blocks → their text). Format: «Texto del elemento» (`text`),
«Número de página» (`página N`), «Texto y página» (`text (página N)`). Inserts
`{t:'text', text, char:{link:'#'+targetBlockId}}` via `insertFragment` (undo «Referencia
cruzada»). Static text, not a REF field. Empty list «No hay elementos de este tipo.», item without
text «(sin texto)».

### 4.8 Footnotes and endnotes
**Model.** The reference mark is a field run in the text:
`{t:'field', code:'NOTEREF <noteId>', result:'<n>', char:{sup:true}}` (`references.js:352-364`).
The note text is a **body paragraph appended at the end of the body** marked `fn`
(`references.js:371-385`):
```json
{ "t":"p", "style":"Normal", "para":{"left":0,"first":0,"before":0,"after":0,"line":240},
  "fn":{"id":"n<base36 ms>","kind":"footnote|endnote","number":3},
  "runs":[ {"t":"text","text":"3 ","char":{"sup":true}}, {"t":"text","text":"note text","char":{"size":9}} ] }
```
**Insert** (`main.js:1294-1315`): `number = numberFootnotes(doc).size + 1`; `id = 'n' +
Date.now().toString(36)`; prompt «Texto de la nota al pie:» / «Texto de la nota al final:»
(cancel → abort; empty text allowed); in one batch: `insertFragment(selection, ref)` then
`insertBlocksAfter(lastBlockOfBody, [noteBlock])` (last block may be a header/footer band block —
harmless since `fn` blocks are pulled out of flow).
`numberFootnotes(doc)` (`references.js:392-406`): scan body paragraphs **without `fn`**, each
field whose code matches `/^NOTEREF\s+(\S+)/` gets the next number in document order (footnotes
and endnotes share one sequence). **It is never used to renumber** — numbers are fixed at
insert time (a note inserted before existing ones gets a higher number). The port should
renumber (update ref `result`, `fn.number` and the leading superscript run) after any edit that
adds/removes/moves NOTEREF fields, in document order and separately per kind if you want Word
semantics; this is a behavioural improvement, flag it.
«Siguiente nota» (`main.js:1318-1328`): cycle caret through `fn` blocks.
Notes dialog (`dialogs/references.js:493-540`): shows «Notas al pie: N\nNotas al final: M»,
buttons «Convertir todas en notas al final», «Convertir todas en notas al pie», «Cerrar». The
conversion mutates `fn.kind` **directly inside a batch (not undoable — bug)** and then
`setDocProps({notesConvertedAt: Date.now()})` to force relayout. Port: implement as a proper
undoable command.

**Pagination** (`paginator.js`):
- `fn` blocks are excluded from the flow (`236`). `_collectFootnotes` breaks each note paragraph once per reflow at the **first section's** text width (`863-879`).
- `FOOTNOTE_GAP = 14` px (`68`). The page's bottom limit is `contentBottom − (notesHeight ? notesHeight + 14 : 0)` (`321-322`).
- For each body line: `newNotes` = footnote-kind notes referenced by NOTEREF field segs of that line and not yet placed; `extra = Σ heights + (newNotes && !page.notesHeight ? 14 : 0)`; overflow test uses `y + lineHeight + extra > limit` (`409-428`). After placing the line, those notes are appended to `page.footnotes` and `notesHeight += height` (note travels to the page where its mark ended; notes are never split across pages).
- `_layoutFootnotes` (`917-959`): per page, stack notes from `y = contentBottom − notesHeight` downward; `page.footnotes = {items:[{blockId, lines}], top}` or null. Endnotes: all on the **last page**, starting below the last content line (`max(contentTop, last line bottom)`), `page.endnotes = {items, top}` — no overflow handling (can run off the page).
- Render (`pages.js:862-905`): notes drawn like header/footer bands; footnotes get a separator rule: width **33%** of the text column, 1 px top border `#8A8886`, drawn at `top − 8` px (`canvas.css:422-427`).

**DOCX** export (`Writer.php:681-688, 1255-1299`): all `fn` blocks go to `word/footnotes.xml`
(ids 0 = separator, 1 = continuationSeparator, notes from 2); the leading superscript text run
is dropped and `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteRef/></w:r>`
is injected at the start of the paragraph; the mark becomes `<w:footnoteReference w:id="N"/>`.
**Endnotes are exported as footnotes (kind lost).** Import (`Reader.php:1276-1362`): reads
footnotes.xml/endnotes.xml; each reference → NOTEREF field `fn<id>`/`en<id>` and a note block
with `kind` preserved; multi-paragraph notes joined with line breaks. Port: export endnotes to
`endnotes.xml` with `w:endnoteReference` (improvement).

### 4.9 Complexity
TOC/figures/index/biblio/captions/cross-refs: low (pure generators + the replace helper) —
**3 days**. Footnotes in the paginator: medium–high (interaction with line placement) —
**4–5 days**. Persisting sources/indexEntries + renumbering: 1 day.

---

## 5. Comments

Sources `js/ui/comments.js`, commands `js/commands/registry.js:1792-1874`, colour
`js/layout/pages.js:1255-1265`, highlight CSS `public/css/canvas.css:386-393`.

### 5.1 Model (`doc.comments[]`)
```json
{ "id":"c1-1", "author":"Ana Pérez", "initials":"AP", "date":null, "text":"…",
  "blockId":"b12", "start":4, "end":19, "resolved":false,
  "replies":[ {"author":"Luis","text":"…"} ] }
```
- Anchor = single block + linear offsets. A multi-block selection is truncated to the start block (`end = start block length`).
- `id = 'c' + (count+1) + '-' + (max numeric part after '-' among existing ids + 1)` (imported ids `c<n>` have no dash → treated as 0).
- `initials` (registry `iniciales`, `registry.js:96-100`): first letter of first word + first letter of last word (if >1 word), uppercased; `'?'` if empty. (Reader uses all words' initials, max 3, default `'A'` — `Reader.php:2906-2916`.)
- `date`: `null` in practice (no timestamp is set when created from the UI).
- Anchors are **not** adjusted when text is edited; consumers clamp: `start = clamp(start, 0, len)`, `end = clamp(end ?? len, start, len)`. Comments whose block disappeared sort last and are not highlighted.

### 5.2 Commands (all snapshot-undoable on `doc.comments`)
- `addComment(range, {text, author, initials?, date?})`: text trimmed; empty → no-op. Result `{id}`.
- `deleteComment(id)`; `updateComment(id, {resolved?, text?, reply?})` (reply appended `{author, text}`).
- «Eliminar todos los comentarios»: batch of deletes.

### 5.3 Pane UI (`comments.js`)
Side pane «Comentarios», close tooltip «Cerrar el panel de comentarios». Cards sorted by
(block index, start). Card: avatar circle 24 px with initials on `authorColor(author)`, author
name (default «Autor»), actions ✓ («Marcar como resuelto» / «Reabrir el comentario») and ✕
(«Eliminar el comentario»), quote `«<anchored text trimmed>»` (single line, ellipsis), text,
replies as `author: text`. Resolved cards at 58% opacity. Only the **active, unresolved** card
shows a reply textarea («Responder…») + button «Responder». Empty state: «No hay
comentarios.<br><br>Selecciona texto y pulsa <b>Nuevo comentario</b> en la pestaña Revisar.»
Clicking a card activates it: select the anchor range, scroll into view. Next/prev wrap around.
New comment: prompt «Comentario:» (port: inline editor), author = `tracking.author || 'Autor'`.
Refresh debounced 200 ms after layout.
Canvas highlight (only while the pane is open): background `rgba(255,193,94,0.28)` + 2 px bottom
border `rgba(216,138,0,0.7)`; active `rgba(255,193,94,0.52)`; hidden when printing.

`authorColor(name)`: `h = 0; for each UTF-16 code unit c: h = (h·31 + c) mod 2^32`;
palette `['#C0392B','#1F6FB2','#7D3C98','#117A65','#B9770E','#943126','#1A5276'][h % 7]`.

### 5.4 DOCX
Import: yes (`Reader.php:456-471, 2878-2904`): range start/end by commentRange markers; a range
crossing paragraphs is truncated to the first; comments without position dropped (warning).
Export: **not implemented** in Writer (no comments.xml). Port should add export (improvement).

### 5.5 Complexity
Low–medium: model+commands 1 day; pane + highlight layer 2 days.

---

## 6. Track changes and protection

Sources: `js/commands/registry.js:504-557, 639-672, 812-892, 1876-1958`; render
`js/layout/pages.js:1193-1224`; CSS `canvas.css:394-409`; wiring `main.js:1447-1472`.

### 6.1 Model
Revision marks live in the run char:
`char.ins = {a: author, d: date|null}` (inserted), `char.del = {a, d}` (deleted, still present
in the runs). `doc.tracking = {enabled, author, showMarks}`; `date` is never set by the UI, so
`d` is always `null`.

### 6.2 Recording (only when `tracking.enabled`)
`revisionMark() = {a: tracking.author || 'Autor', d: tracking.date || null}`.
`markDeletion(range)` (`registry.js:528-541`):
```
runs = runsOfRange(range)   # non-empty only if range is within ONE block; runs overlapping [start,end)
if runs non-empty and every run has char.ins with ins.a == mark.a:
    really delete the range                       # author removing own pending insertion
else:
    applyCharFormat(range, {del: mark})            # mark (works across blocks too)
return true
```
Operations:
| Operation | Tracked behaviour |
|---|---|
| `insertText` over a selection | `markDeletion(selection)`, then insert the new text **after** the marked range (at `range.end`) with char = (format of first replaced char or given fmt) minus `del`, plus `ins: mark` (`registry.js:656-670`) |
| `insertText` at caret | new text gets `ins: mark` |
| `deleteRange` | only if start and end in the same block → `markDeletion`, caret to `range.end`; cross-block deletions are **real** deletions (`registry.js:819`) |
| Backspace inside a paragraph | mark previous char; caret moves to `from` (before it) |
| Delete inside a paragraph | mark next char; caret moves to `to` (after it) |
| Backspace at offset 0 / Delete at end (paragraph merge), Enter, paste/insertFragment, formatting, tables, images | **not tracked** (performed normally) |

### 6.3 Accept / reject (`resolveRevisions(range|null, accept)`, `registry.js:1906-1942`)
Region = whole document (range null) or **all blocks touched by the range** (not just the
selected characters — accepting "the selection" resolves every revision in those paragraphs).
No marks in region → no-op. For each block: `remove = accept ? 'del' : 'ins'`, `clean = accept ?
'ins' : 'del'`; drop runs whose char has `remove`; delete `clean` from remaining runs' char (and
`char` itself if empty); `mergeAdjacentRuns(block)`. One undo entry («Aceptar cambios» /
«Rechazar cambios»), structural. Ribbon: `review:accept`, `accept-all`, `reject`, `reject-all`.

### 6.4 Display
- Inserted: underline + author colour; deleted: strikethrough + author colour (`authorColor` overrides run colour) (`pages.js:1196-1223`).
- `showMarks === false` («Mostrar marcas» off): deleted runs hidden (not drawn — note: Skriba hides them with CSS but they still occupy layout width, because layout ignores `showMarks`; the port should decide: recommended to exclude them from layout in "final" view), inserted runs drawn in normal text colour without underline (`canvas.css:397-401`). Printing always hides deleted runs and comment highlights (`canvas.css:407-410`).
- `toggleTracking()` sets `{enabled: !enabled, author: tracking.author || 'Autor'}`.

### 6.5 Protection (`dialogs/review.js:401-451`)
Dialog «Restringir edición», width 420, radio options:
«Sin restricciones» (none) – «El documento se puede editar con libertad.»;
«Cambios controlados» (tracked) – «Se puede escribir, pero todo queda marcado como revisión.»;
«Solo comentarios» (comments) – «El texto no se puede cambiar; sí se pueden añadir comentarios.»;
«Solo lectura» (readOnly) – «El documento no admite ninguna modificación.»;
note «La restricción vive en el documento: se guarda con él y sigue activa al volver a abrirlo.»;
buttons «Aplicar»/«Cancelar» → `setProtection({mode})`. Enforcement: §0.5. Read-only also hides
the caret. **`tracked` is not enforced** — port should force tracking on while mode is
`tracked` (improvement consistent with the promise in the UI).

### 6.6 DOCX
Import: `w:ins`/`w:moveTo` content accepted as normal text, `w:del`/`w:moveFrom` dropped
(«Texto eliminado con control de cambios descartado (se importa el documento como aceptado)»)
(`Reader.php:764-787`). Export: **`char.ins`/`char.del` are NOT written** (the Writer header
claims w:ins/w:del, but no code does it) → pending deletions are exported as ordinary visible
text. Port must at minimum skip `del` runs (or better, emit `<w:ins w:id w:author w:date>` /
`<w:del>` with `w:delText`).

### 6.7 Complexity
Medium: recording touches every editing command; accept/reject is simple. **3–4 days** (+2 for
OOXML w:ins/w:del).

---

## 7. Document compare

Source `js/editor/compare.js` (171 lines, pure), dialog `dialogs/review.js:462-529`.

### 7.1 Algorithm
```
mark = {a: opts.author || 'Comparación', d: opts.date || null}
A = original.body filtered: t=='p' && !hf && !cell        # tables, smartart, cell paragraphs dropped!
B = revised.body  filtered the same way
textOf(block) = concat of text runs only
pairs = LCS(A, B, key=textOf)                              # O(n·m) DP, Int32 table
out = []; i=j=0
for (pi,pj) in pairs:
    while i<pi: out += marked(A[i++], 'del')
    while j<pj: out += marked(B[j++], 'ins')
    out += {...B[pj], id: undefined}                       # identical paragraph, kept as-is
    i=pi+1; j=pj+1
restA = A[i:], restB = B[j:]
if len(restA)==1 and len(restB)==1:
    out += {t:'p', sec: restB.sec||sec, style: restB.style||'Normal', para: copy, runs: diffRuns(textOf(restA), textOf(restB), mark)}
else: out += marked(each restA,'del'); out += marked(each restB,'ins')
if out empty: out = [{t:'p', sec, style:'Normal', runs:[]}]
sec = B[0].sec || A[0].sec || 'sec1'
```
`marked(block, kind)` = `{t:'p', sec, style||'Normal', para copy, runs: each text run gets
char.{kind} = mark (other runs unchanged)}` — **drops `fn`, `caption`, `toc`, … markers**.

LCS backtrack (`compare.js:39-67`): `dp[i][j]` filled from the end; walk `i,j` from 0: equal →
pair; else if `dp[i+1][j] >= dp[i][j+1]` → `i++` else `j++` (tie prefers advancing A, i.e.
deletions before insertions).

`diffRuns(old, new)` (`compare.js:81-111`): tokens = `/\s+|[^\s]+/g` (whitespace runs are
tokens); LCS on tokens; emit deletions, then insertions, then the common token; merge
consecutive pieces with identical char (JSON-equal) into one run. Only plain text (formatting of
the rewritten paragraph is lost).

Note: the word-level diff is applied **only to the trailing unmatched pair** when exactly one
paragraph remains on each side; changed paragraphs in the middle become whole del + whole ins.

### 7.2 UI
Dialog «Comparar documentos», width 440: «Comparar el documento actual (revisado) con:» + combo
of server files («Cargando documentos…», «No hay documentos guardados», «No se pudo consultar
el servidor»); note «Se genera un documento nuevo donde lo añadido aparece subrayado y lo
suprimido, tachado. Puedes aceptar o rechazar cada cambio desde esta misma pestaña.»; «Comparar»
→ `compareDocuments(loaded, current, {author: tracking.author || 'Autor'})` then
**`replaceBody(result, 'Comparar documentos')` on the current document** (contradicts the note:
no new document is created; one undo entry). Desktop port: pick a file (.json/.docx) from disk;
recommended to open the result as a new untitled document (matches the UI text).

Side effects to be aware of: block ids regenerate → comment anchors orphaned; tables, SmartArt
and cell paragraphs disappear from the result; header/footer bands kept.

### 7.3 Complexity
Low: ~150 LOC + O(n·m) memory (use `std::vector<int32_t>`; for >10k paragraphs consider Myers).
**1–2 days.**

---

## 8. Proofing (punctuation/typography), word count, language

Source `js/editor/proofing.js` (236 lines, pure). (Dictionary spell-check lives in
`js/editor/spell/*` — separate spec.) `proofing.js` contains **no track-changes code**.

### 8.1 Rules (`checkText`, `proofing.js:87-156`) — JS regex semantics
Each finding `{start, end, rule, message, suggestion|null, text: t.slice(start,end)}`; final
sort by `(start, end)`.

| # | rule id | Label | Detection | Message | Suggestion |
|---|---|---|---|---|---|
| 1 | `double-space` | «Espacios de más» | `/ {2,}/g` (U+0020 only) | «Sobran espacios entre palabras.» | `' '` |
| 2 | `space-before-punct` | «Espacio antes del signo» | `/ +([,.;:!?%)\]])/g`, range covers spaces+sign | «No se deja espacio antes de «X».» | the sign |
| 3 | `missing-space` | «Falta un espacio» | `/([,;:])(?=\S)/g`; skip if prev and next are digits; skip if next ∈ `)]}»"'`; range = the sign | «Después de «X» va un espacio.» | `X + ' '` |
| 4 | `repeated-word` | «Palabra repetida» | `/\b(\p{L}{2,})(\s+)\1\b/giu` (case-insensitive backreference); skip if lower(word) ∈ {que, muy, no, si, sí, ya, tan, más} | «X» aparece dos veces seguidas. (message: `«${w}» aparece dos veces seguidas.`) | the word |
| 5 | `lowercase-after-dot` | «Minúscula tras punto» | `/(\p{L}+)\.\s+(\p{Ll})/gu`; skip if lower(word) ∈ ABBREVIATIONS or word length ≤ 1; range = the lowercase letter | «Después de un punto la palabra empieza por mayúscula.» | uppercase letter |
| 6 | `missing-opening` | «Falta el signo de apertura» | each `?`/`!`: sentence start = index after the last `.`, `?`, `!` or `\n` before it; flag if `¿`/`¡` not in `[start, pos)` | «En español la pregunta o exclamación abre con «¿».» (or ¡) | null |
| 7 | `straight-quotes` | «Comillas rectas» | each `"` | «Usa comillas tipográficas («») o inglesas (“”).» | null |
| 8 | `ellipsis` | «Puntos suspensivos» | `/\.{3}/g` | «Los puntos suspensivos son un solo carácter.» | `…` |

ABBREVIATIONS: `sr sra srta dr dra lic ing prof av avda c cl núm num pág pag ed vol cap art fig tel etc ej aprox ud uds vd vds ss op cit p pp ii iii iv vi vii viii ix xi xii`.
JS `\b` is ASCII-only even with `/u`: words starting/ending with accented letters (e.g. «él él»)
are not detected by rule 4. Reproduce exactly (use a JS-compatible regex engine or hand-code
the scan) and decide later whether to "fix".

`checkDocument(doc, {rules?, includeBands=false, max=2000})`: paragraphs only, skip `hf` unless
`includeBands`; text = linear text (non-text runs → U+FFFC); adds `blockId`; stops at `max`.

### 8.2 Review pane (`dialogs/review.js:95-288`)
Pane «Revisión»; merges proofing + spelling findings sorted by (block order, start); summary
«No se han encontrado problemas.» / `${n} aviso(s) de escritura`; each item: rule label (upper),
message, buttons «Corregir: <suggestion>» (applies `insertText(range, suggestion)` then
re-checks and activates `min(i, n−1)`), «Omitir» («Omitir todas» for spelling: ignore word
document-wide), «Agregar al diccionario» (spelling). Recompute debounced 400 ms after layout.

### 8.3 Word count (`documentStats`, `proofing.js:201-231`; dialog `review.js:298-335`)
Paragraphs only, bands excluded. Text per paragraph: text runs + tab/break → `' '` + field
`result`. `paragraphs += 1` (empty ones count); `charsWithSpaces += len`; `chars += len without
\s`; `words += count of non-empty parts of split(/[\s ]+/)`. Pages = layout page count; lines =
Σ lines of all page items (body only). Dialog «Contar palabras» rows «Páginas», «Palabras»,
«Caracteres (sin espacios)», «Caracteres (con espacios)», «Párrafos», «Líneas», numbers
formatted `es-ES` (thousands `.`), note «Los encabezados y los pies de página no se cuentan,
igual que en Word.» Note: images/math count as nothing; table cell paragraphs and footnote
paragraphs **are** counted.

### 8.4 Language (`review.js:341-395`)
Dialog «Idioma» sets `doc.locale` from: es-ES «Español (España)», es-MX «Español (México)»,
es-AR «Español (Argentina)», es-CO «Español (Colombia)», en-US «Inglés (Estados Unidos)», en-GB
«Inglés (Reino Unido)», pt-BR «Portugués (Brasil)», fr-FR «Francés (Francia)», de-DE «Alemán
(Alemania)», it-IT «Italiano (Italia)», ca-ES «Catalán», gl-ES «Gallego», eu-ES «Euskera».
Read-aloud uses OS TTS with `doc.locale` (desktop: Windows SAPI / speech-dispatcher; optional).

### 8.5 Complexity
Low: **1–2 days** (+ pane).

---

## 9. Mail merge

Sources `js/editor/mailmerge.js` (322 lines, pure), dialogs `js/ui/dialogs/mailmerge.js`,
wiring `main.js:1052-1152`.

### 9.1 Data source (`doc.mailMerge = {fields, records}`)
`parseDelimited(text, sep?)` (`mailmerge.js:39-78`):
1. Normalize CRLF/CR → LF; trim; empty → `{fields:[], records:[]}`.
2. Delimiter (if not given) from the **first line**: contains TAB → `\t`; else contains `;` and no `,` → `;`; else `,`.
3. RFC-4180-ish scan: `"` toggles quoted mode; inside quotes `""` → `"`; delimiter and LF are literal inside quotes; outside, delimiter ends field, LF ends row. A quote in the middle of an unquoted field also enters quoted mode.
4. Header = first row, trimmed. Records = remaining rows that have at least one non-blank value; `record[header[i]] = (row[i] ?? '').trim()` (extra columns dropped; duplicate header names: last wins).
Records are objects keyed by field name; JSON key order = header order.

Recipients dialog «Seleccionar destinatarios» (width 560): textarea placeholder
«Nombre,Apellidos,Empresa,Direccion,CP,Ciudad\nAna,Pérez López,Acme,Calle Mayor 1,28001,Madrid»,
pre-filled with the current list re-serialized as `fields.join(',')` + rows joined with `,`
(**no quoting — values containing commas/quotes corrupt on re-edit: bug; port should quote**),
«Desde archivo:» (.csv,.tsv,.txt, read as UTF-8), live preview table (first 30 rows) +
`${records} destinatario(s) · ${fields} campo(s)`; intro «Pega la lista en formato CSV (la
primera fila son los nombres de campo) o carga un archivo .csv exportado de una hoja de
cálculo.»; OK → `setDocProps({mailMerge: parsed})`. Edit-list dialog «Destinatarios de la
combinación»: table (200 rows), buttons «Editar la lista…», «Vaciar la lista», «Cerrar».

### 9.2 Merge fields
Field run: `{t:'field', code:'MERGEFIELD <Name>', result:'«<Name>»'}` (`mergeFieldFragment`).
Field dialog «Insertar campo combinado»: chips per field; with no fields: «Primero hay que
seleccionar los destinatarios: sus columnas son los campos.» + «Seleccionar destinatarios…».

`ADDRESS_HINTS` (`mailmerge.js:20-30`), matched case-insensitively: a field matches a hint if
`lower(field) == hint` or `lower(field)` **contains** hint; hints tried in order, first field
wins:
| key | hints |
|---|---|
| tratamiento | tratamiento, titulo, título, title |
| nombre | nombre, name, first, firstname |
| apellidos | apellidos, apellido, last, lastname, surname |
| empresa | empresa, company, organizacion, organización |
| direccion | direccion, dirección, address, calle |
| cp | cp, codigo postal, código postal, zip, postal |
| ciudad | ciudad, city, poblacion, población, localidad |
| provincia | provincia, state, region, región |
| pais | pais, país, country |
(Beware "contains": a field "Apellido" also matches hint `name`? no — but `"Nombre de empresa"` matches `nombre`; `cp` matches any field containing "cp". Keep exact semantics.)

`addressBlockFragment(fields)`: lines (each a paragraph `para:{after:0, line:240}`, omitted if
empty): [tratamiento, ' ' if tratamiento, nombre, ' ' if nombre&&apellidos, apellidos];
[empresa]; [direccion]; [cp, ' ' if cp&&ciudad, ciudad]; [provincia]; [pais]. Literal
separators are text runs; others MERGEFIELD runs. None → «(La lista no tiene campos de
dirección)».
`greetingLineFragment({fields, greeting='Estimado/a', punctuation=','})`: `"<greeting> "` +
MERGEFIELD(nombre-hint field, else apellidos-hint field) or text «destinatario» + punctuation.

### 9.3 Resolution, preview and finish
`resolveMergeFields(block, record)`: every field run with code `/^MERGEFIELD\s+(.+)$/` → text
run with `String(record[name] ?? '')`, keeping `char`; returns same block if none.
`previewRecord(doc, record)`: map paragraphs through resolve.
Preview (`main.js:1085-1104`): index wraps modulo record count; first preview snapshots the body
(in memory, not persisted); `replaceBody(resolved snapshot, 'Vista previa de la combinación')`
(**one undo entry per preview step**); status label «Destinatario i de N». Next/prev.
Finish (`main.js:1110-1125`): source = snapshot if previewing else doc;
`mergeDocument(source, records, {separator, limit})` (`mailmerge.js:206-229`): body blocks
without `hf`/`fn`; for each record (up to `limit`): copy each block (paragraphs resolved), drop
`id`, shallow-copy runs; between records (not after the last) a paragraph
`{t:'p', runs:[{t:'break', type:'page'}]}` (`separator:'section'` is accepted but ignored);
empty → one empty paragraph. Then `replaceBody(…, 'Combinar correspondencia')`, clear the
snapshot; mode `print` opens print after 300 ms.
**Pitfalls:** (1) tables are duplicated with the same `cell.tableId` references while the table
block gets a new id → broken tables in merged output; port must remap table ids per copy.
(2) Fields in header/footer bands are never resolved. (3) Edits made while previewing are lost
on finish. (4) Footnote blocks are dropped from merged copies but NOTEREF marks remain.
(5) Comment anchors orphaned (ids regenerate). Desktop port: produce the merge into a **new
document** rather than replacing the template.

### 9.4 Envelopes and labels
`ENVELOPE_SIZES` (twips, landscape physical w>h): DL «DL (110 × 220 mm)» 12474×6237; C5 «C5 (162
× 229 mm)» 12983×9185; C6 «C6 (114 × 162 mm)» 9185×6464; Americano «Americano (9,5 × 4,1")»
13680×5904. `envelopeFragment` → section page `{w, h, orient:'landscape', margins all 720,
headerDist 360, footerDist 360, columns {count 1, spacing 708}}`; blocks: one paragraph per
sender line (`para {after:0,line:240}`, runs size 9; empty line → no runs), one spacer
`{before:1440, after:0, line:240}`, one paragraph per recipient line `{left:5040, after:0,
line:240}` size 12. Dialog «Sobres» → batch «Crear sobre»: `setPageSize(sec0, {w,h,orient})`,
`setMargins(sec0, margins)`, `replaceBody(blocks)` (note «El sobre sustituye el contenido del
documento actual y ajusta el tamaño del papel.»).

`LABEL_FORMATS`: '3x8' «3 × 8 (24 etiquetas, 70 × 37 mm)» 3c×8r; '2x7' «2 × 7 (14 etiquetas,
105 × 42 mm)»; '2x4' «2 × 4 (8 etiquetas, 105 × 74 mm)»; '1x10' «1 × 10 (10 etiquetas, 210 ×
29 mm)». `labelGrid({format, text, records})`: `cells[i] = values(records[i % n]).filter(nonEmpty).join('\n')`
(record cycling) or every cell = text. Dialog «Etiquetas»: «Formato:», «Contenido:» («El mismo
texto en todas» / «Un destinatario por etiqueta», default records if any), textarea; «Crear hoja»
→ batch: insert table rows×cols at **offset 0 of the first block** with column width = current
column width, borders 'none', and each cell gets `insertText(lines.join(' · '))` (lines joined
with « · », not separate paragraphs). Row heights are not set (labels don't match physical
sizes — known gap).

### 9.5 DOCX
MERGEFIELD runs export as `<w:fldSimple w:instr="MERGEFIELD Name">` with cached `«Name»`;
the reader recognizes MERGEFIELD (`Reader.php:61`). No mail-merge data source is written to the
docx (only in native JSON).

### 9.6 Complexity
Medium: CSV + generators 1.5 days; preview/finish flow + tables remap 2 days; envelopes/labels 1
day.

---

## 10. Ink (Draw tab)

Source `js/editor/ink.js` (334 lines), routes `main.js:842-849, 1007-1050`, CSS
`canvas.css:433-445`.

### 10.1 Model
`doc.ink = { "<pageNo>": [ {tool, color, width, points:[[x,y], ...]} ] }` — page number as
string key (1-based), points in **page coordinates, px @ zoom 1** (independent of zoom/scroll).
Ink is anchored to the page, not to text (reflow does not move it). Empty pages are deleted
from the map. Not exported to docx.

### 10.2 Tools (`INK_TOOLS`)
| tool | default width | opacity | cap |
|---|---|---|---|
| pen | 2 | 1 | round |
| highlighter | 14 | 0.4 | square |
| eraser | 12 | 1 | round |
| lasso | 1 | 1 | round |
State defaults: `tool null` (ink off), `color '#C00000'`, `width 2`. `setTool(id)`: unknown →
off; clears selection; highlighter → width 14; pen with width > 6 → width 2. `setWidth(w)` →
`clamp(Number(w)||2, 1, 24)`. `setColor(c)` → c or `'#000000'`.

### 10.3 Interaction
- Pointer down (left button, tool active, point maps to a page): set current page. Eraser → erase at point, start a transient eraser stroke. Else clear selection, start stroke `{tool, color, width, points:[[x,y]]}`.
- Move: ignore if point on another page; append only if distance to last point ≥ **1.5 px** (`MIN_STEP`); eraser erases at each new point.
- Up: eraser → nothing stored. Lasso → selection = indices of strokes on that page whose **centroid** is inside the lasso polygon (even-odd ray casting; `strokeInsidePolygon`, polygon needs ≥3 points). Other tools: if `points < 2` and tool ≠ pen → discard (a pen click stores a dot); else append stroke.
- Erase at p: remove strokes with any segment within **8 px** of p (`strokeHitsPoint`: point–segment distance with clamped projection; single-point strokes use point distance); if anything removed → write.
- Every write = `setDocProps({ink: newMap})` (undoable). **Each eraser hit is its own undo entry** — port should group a whole erase drag into one entry.
- `deleteSelection()` removes the lasso-selected strokes; `clearPage(n)`; `clearPage(null)` → `ink = {}`. Lasso "move" is mentioned in the header but **not implemented**.
- While inking: caret hidden, cursor crosshair (eraser: cell, lasso: copy).

### 10.4 Rendering
Overlay above text (z-index 3), no hit testing. Path: polyline `M p0 L p1 …`; single point →
`M x y l 0.1 0` (a dot via round cap). Stroke = `color`, width = `stroke.width || tool default`,
round joins, cap per tool, opacity 0.4 for highlighter else 1. Selected strokes: dashed `4 3`,
opacity 0.6. Redraw on layout done and zoom changes.

### 10.5 Complexity
Low: **2 days** (JUCE `Path`, `PathStrokeType`).

---

## 11. Image editing

Sources `js/editor/imageedit.js` (250 lines), handle spots `js/layout/pages.js:72-87`,
commands `registry.js:1336-1381`, routes `main.js:823-828`.

Image run (model reminder): `{t:'image', rid, w, h, alt?, wrap?, align?}` with `w,h` in twips,
`wrap ∈ {inline (default), square, topAndBottom, behind, front}`, `align ∈ {left, center,
right}` (`breaker.js:185-188`). There are **no** crop/brightness/recolor/rotate operations.

- Click on an image selects its run: selection `[offset, offset+1]` so Delete/Backspace remove it; draw frame + 8 handles. Click elsewhere clears.
- Handles (`HANDLE_SPOTS`): `nw (0,0) n (0.5,0) ne (1,0) e (1,0.5) se (1,1) s (0.5,1) sw (0,1) w (0,0.5)`; corners keep ratio. Cursors nwse/ns/nesw/ew.
- Drag: `dx, dy` from the press point (page coords). `w = w0 ± dx` for e/w, `h = h0 ± dy` for s/n. `keepRatio = cornerHandle XOR shift`. If keepRatio and `ratio = w0/h0 > 0`: if `|dx| ≥ |dy|` → `h = w/ratio` else `w = h·ratio`. Clamp both ≥ **12 px**. Only the frame moves during drag (no reflow); status bar shows `"${wCm.toFixed(2)} × ${hCm.toFixed(2)} cm"` (dot decimal).
- Release: if change < 0.5 px in both → nothing; else ONE command `resizeImage(pos, {w: pxToTwips(w), h: pxToTwips(h)})` → run `w,h = max(1, round(..))` twips.
- `setImageProps(pos, {wrap?, align?})`; ribbon `image:wrap`, `image:align`, `image:position` (= `{wrap:'square', align: h || 'left'}`).
Complexity: low–medium (**2 days**), depends on the image layout spec.

---

## 12. Templates (14)

Source `js/core/templates.js` (985 lines, pure); doc `docs/componentes/plantillas.md`.

### 12.1 API
`TEMPLATE_CATEGORIES` = cartas «Cartas y comunicaciones», comercial «Comercial», informes
«Informes y actas», academico «Académico», personal «Personal y otros».
`listTemplates()` → `[{id, nombre, descripcion, categoria, destacada}]`; `getTemplate(id)`;
`buildTemplateDocument(id, base?)` → full native document: starts from `base` (keeps name,
dates, theme, media) or a minimal doc (`version 1, app 'Skriba-word', locale 'es-ES', name
'Documento1.docx', theme default, styles [], numbering [], sections [A4], body [], media {},
comments [], activeView {view:'print', zoom:1, page:1}`); styles = `defaultStyles()` if empty;
sets `numbering`, `sections`, `body` (or one empty Normal paragraph), `pageBorder` if set.
Unknown id throws «Plantilla desconocida: <id>».

### 12.2 Constants and Builder
`PAGE_W 11906, PAGE_H 16838, MARGIN 1440, CONTENT_W 9026`; colours `ACCENT #2F5496,
ACCENT_DARK #1F3763, GRAY #595959, GRAY_LIGHT #808080, LINE #BFBFBF, SHADE #F2F2F2, SHADE_HEAD
#D9E2F3`. Dates: `fechaLarga()` = `es-ES` long date «22 de agosto de 2026» (day numeric, month
long, year); `anio()` = current year. Block ids sequential `b1…bN` (tables and cells included),
single section `sec1`.

Section: `{id, page:{w,h (physical, landscape ⇒ w>h), orient, margins, headerDist 720, footerDist
720, columns {count 1, spacing 708}}, headers/footers {default,first,even: null},
differentFirst false, differentEven false, linkToPrevious true}`.

| Builder method | Output |
|---|---|
| `page({margins, orient})` | replace section (margins number = all sides) |
| `border(b)` | `pageBorder = {style, color, width(px), space(px)}` |
| `p(content, {style='Normal', para, char, cell, hf})` | paragraph; content = string / run / array; `char` merged *under* each text run's own char |
| `blank(n=1)` | n empty paragraphs `para {after:0}` |
| `title/subtitle/h1/h2` | styles `Titulo`, `Subtitulo`, `Heading1`, `Heading2` |
| `text(c, opts)` | paragraph with `para.align='justify'` (overridable) |
| `lines(arr)` | one `SinEspacio` paragraph per line |
| `list(items, {listId='lb-disc', level 0, style, para, char})` | ensures list def; para `{numbering:{listId, level}, left, first (from levelIndent), after:40, ...para}` |
| `bullets` / `numbers` | listId `lb-disc` («Viñeta redonda» • ○ ▪) / `ln-decimal` (decimal, lowerLetter, lowerRoman) |
| `pageBreak()` | paragraph with `{t:'break', type:'page'}`, `after:0` |
| `rule({color=LINE, sz=6, after=120})` | empty paragraph with bottom border `{style:'single', sz, space:1, color}` |
| `header(c, {align='left', char, para, variant='default'})` | paragraph with `hf:{kind:'header', variant}`, char `{size:9, color:GRAY_LIGHT, ...}`, para `{align, after:0}` |
| `footer(c, {align='center', …})` | same with `kind:'footer'` |
| `footerPages({prefix='', align='center'})` | footer runs: `prefix ? prefix + '  ·  Página ' : 'Página '`, field `PAGE` (result '1'), ' de ', field `NUMPAGES` |
| `table({cols, rows, props, headerRow=false, headShading=SHADE_HEAD, compact=true, cellChar})` | see below |
| `datos(pairs, {labelWidth=2200})` | 2-col borderless table, label bold |
| `signature(lines, {align})` | `blank(2)` + `SinEspacio` lines, first bold |

`table`: `cols` = widths array or count → `evenCols(contentWidth, n)` (floor, remainder to last).
Table block `{t:'table', id, sec, props:{align:'left', borders:'grid', fixedLayout:true,
repeatHeader: headerRow, borderColor: LINE, cellMargins:{top:60,left:108,bottom:60,right:108},
...props}, cols, rows:[{height:null, cells:[…]}]}`. Cell spec: string | run | array (runs) |
`{text|runs|paras, char, para, shading, vAlign, span, style}`. Each cell
`{blocks:[ids], vAlign (default 'top'), shading (spec, else headShading for header row, else
null), gridSpan if span>1}`; spanned positions get `{blocks:[], vAlign:'top', shading:null,
merged:true}`; short rows padded with empty cells. Cell paragraphs: style default Normal, char =
`{...cellChar, bold if header row, ...spec.char}`, para `{after:0, line:240}` if compact plus
spec.para, `cell:{tableId, row, col}`; **all cell paragraphs are appended right after the
table block** (reading order), then one empty paragraph `{after:0}` after the table.
Note: header/footer (`hf`) paragraphs are emitted **interleaved in body order** where the
template calls `header()/footer()` (often first), not at the end of the body as `setBand`
does — the paginator must accept bands anywhere in `body`.

### 12.3 Catalogue (structure; placeholder text is in `[brackets]`)
Common helpers: `destinatario(lines)` = «Señor(a)» (SinEspacio) + first line bold (SinEspacio) +
remaining lines (SinEspacio). `membrete({nombre='[Nombre de la empresa]', datos='[Dirección]  ·  [Ciudad]  ·  [Teléfono]  ·  [correo@empresa.com]'})`
= header «nombre» (14 pt bold ACCENT) + header «datos» (8.5 pt GRAY_LIGHT, bottom border single sz 6 space 4 LINE).

| # | id · nombre · categoría · destacada | Margins / orient | Structure (in order) | Ref |
|---|---|---|---|---|
| 1 | `carta-formal` · «Carta formal» · cartas · ★ | default | membrete; footer «[Nombre de la empresa]  ·  [www.sitioweb.com]»; «[Ciudad], <fecha>» right after 240; destinatario(4 lines); blank; «**Asunto:** [Asunto de la carta]» after 240; salutation after 200; 3 justified paragraphs; «Cordialmente,» before 120; signature(4); blank; «Anexos: …» SinEspacio 9 pt GRAY | `templates.js:387-409` |
| 2 | `carta-presentacion` · «Carta de presentación» · cartas | default | name 16 pt bold ACCENT; contact line 9.5 pt GRAY with bottom rule (after 280); date right; destinatario(3); blank; «Asunto: Candidatura al cargo de …»; salutation; 4 justified paragraphs; «Atentamente,»; signature(2) | `410-434` |
| 3 | `carta-recomendacion` · «Carta de recomendación» · cartas | default | membrete(nombre «[Nombre de la empresa o institución]»); date right; «A quien corresponda:»; 3 justified paragraphs (first with bold run for the recommended person); «Atentamente,»; signature(3) | `435-451` |
| 4 | `memorando` · «Memorando» · cartas | default | «MEMORANDO» 26 pt bold ACCENT after 60; company line 10 pt GRAY after 240; datos PARA/DE/FECHA/ASUNTO (labelWidth 1600); rule ACCENT sz 12 after 240; 2 justified paragraphs; 3 bullets; closing text before 120; signature(2); blank; «Copia: …» 9 pt GRAY | `452-476` |
| 5 | `circular` · «Circular / comunicado» · cartas | default | membrete; «CIRCULAR N.º [001-<año>]» 16 pt bold ACCENT centered; date centered GRAY after 280; datos PARA/DE/ASUNTO (1600); rule; paragraph; «Puntos a tener en cuenta:» after 80; numbered list ×3; 2 paragraphs; signature(3) | `477-500` |
| 6 | `cotizacion` · «Cotización» · comercial · ★ | margins 1134 | 2-col borderless head table (58%/42%: company name 16 pt bold ACCENT + NIT line + contact 9 pt GRAY, vAlign center / «COTIZACIÓN» 22 pt bold GRAY + «N.º COT-<año>-001» 11 pt bold, right); rule ACCENT 12 after 200; 4-col client table (1700, W/2−1700, 1700, rest) labels bold SHADE: Cliente/Fecha, NIT / CC/Validez «15 días calendario», Contacto/Elaborada por; h2 «Detalle de la cotización» ACCENT; 5-col items table (600, rest, 1100, 1800, 1800), header row shading ACCENT with white text, cellChar 10 pt, 3 item rows, rows «Subtotal», «IVA (19 %)», «TOTAL» spanning 4 cols (TOTAL bold ACCENT, SHADE); h2 «Condiciones comerciales»; 5 bullets with bold lead-ins; closing text; signature(2); footerPages prefix «[Nombre de la empresa]  ·  Cotización COT-<año>-001» | `503-560` |
| 7 | `cuenta-cobro` · «Cuenta de cobro» · comercial | default | «CUENTA DE COBRO N.º [001-<año>]» 18 pt bold ACCENT centered; date centered GRAY after 360; payer (bold 12 centered) + NIT line; «DEBE A:» bold centered; payee + CC line; «La suma de:» + «Por concepto de:» paragraphs; 2-col table (W−2400, 2400) header row Detalle/Valor, 2 concept rows, TOTAL bold SHADE; «Forma de pago:» paragraph; regime note 9.5 pt GRAY after 360; signature(3) | `561-592` |
| 8 | `propuesta-comercial` · «Propuesta comercial» · comercial | default | cover: blank(4), «PROPUESTA COMERCIAL» 12 pt bold GRAY allCaps centered, Titulo (ACCENT, centered), Subtitulo centered after 600, «Preparada para:», «Preparada por:», date; pageBreak; h1 «1. Resumen ejecutivo» … «7. Aceptación» with text, 3 bullets (Entregables), 3-col schedule table (50/25/25 %) header Fase/Duración/Entrega, 2-col investment table, 3 bullets (Condiciones), acceptance text, blank(2), 2-col borderless signature table; footerPages prefix «Propuesta comercial  ·  [Nombre de la empresa]» | `593-652` |
| 9 | `informe-ejecutivo` · «Informe» · informes · ★ | default | Titulo «Informe [título del informe]» ACCENT; Subtitulo; «Preparado por: … · Fecha: …» 10 pt GRAY with bottom rule after 360; h1 1..6 + «Anexos» (Resumen ejecutivo, Objetivos (3 bullets), Metodología, Resultados (4-col table 40/20/20/20 header Indicador/Meta/Resultado/Variación, centred values) + interpretation, Conclusiones, Recomendaciones (3 numbers)); header «Informe [título]  ·  [Empresa o área]» right; footerPages | `655-698` |
| 10 | `informe-avance` · «Informe de avance de proyecto» · informes | default | Titulo «Informe de avance»; Subtitulo; datos (labelWidth 2600) Proyecto/Responsable/Periodo/Fecha del informe/Estado general; h1 1..5: summary, 4-col activity table (42%/22%/1300/rest), 3-col risk table (40%/1500/rest), budget text, 3 bullets; header right; footerPages | `699-748` |
| 11 | `acta-reunion` · «Acta de reunión» · informes · ★ | default | «ACTA DE REUNIÓN N.º [01]» 18 pt bold ACCENT centered; org line GRAY after 280; 4-col info table (Fecha/Hora, Lugar/Convoca, Objetivo spanning 3); h2 «Asistentes» + 3-col table (40/35/25 %) Nombre/Cargo / área/Asistió; h2 «Orden del día» + 4 numbers; h2 «Desarrollo» + 2 bold topic + text pairs; h2 «Compromisos» + 3-col table (50/30/20 %); «Próxima reunión:»; 2-col borderless signature table (Presidente(a) / Quien convoca, Secretario(a)); footerPages prefix «Acta N.º [01]» | `749-807` |
| 12 | `trabajo-academico` · «Trabajo académico» · academico | default | cover: blank(6), title 20 pt bold centered, subtitle 13 pt GRAY after 1200, author 13 pt, code GRAY after 1200, course, «Docente: …» after 1200, institution bold, faculty, «[Ciudad], <año>»; pageBreak; h1 Introducción, «1. Marco conceptual», «2. Desarrollo» (h2 2.1, 2.2), Conclusiones, Referencias (3 paragraphs with hanging indent left 720 first −720 after 120 align left); footerPages | `810-847` |
| 13 | `curriculum` · «Currículum vitae» · personal · ★ | margins 1134 | name 26 pt bold ACCENT; profession 13 pt GRAY; contact 9.5 pt GRAY with ACCENT rule sz 12; section headings 12 pt bold ACCENT allCaps with bottom rule sz 4 (Perfil profesional, Experiencia laboral, Formación académica, Habilidades, Idiomas, Referencias); job entries (bold title — place, dates 9.5 pt GRAY) + 2 bullets (after 20); 2-col borderless skills table with «•  …» paragraphs; languages line; «Disponibles a solicitud.» GRAY | `850-897` |
| 14 | `certificado` · «Certificado / constancia» · personal | **landscape**, margins 1134, page border `{style:'double', color:ACCENT, width:4, space:28}` | blank(2); institution 13 pt bold GRAY allCaps centered after 360; «CERTIFICADO» 40 pt bold ACCENT; «DE [PARTICIPACIÓN / ASISTENCIA / RECONOCIMIENTO]» 12 pt GRAY; «Se otorga a» 13 pt italic; name 28 pt bold ACCENT_DARK with bottom rule, indents left/right 1800; reason 12 pt centered indents 900; «Se expide en [Ciudad], a los <fecha>.» 11 pt GRAY after 720; 3-col borderless signature table (third, middle empty, third) centered | `898-927` |

**Port recommendation:** generate the 14 documents once with Node (`buildTemplateDocument`)
using a fixed date, store them as JSON resources with tokens for `fechaLarga()`/`anio()`, and
substitute at instantiation (avoids re-implementing the builder; golden files double as tests).
Alternatively port the Builder (~250 LOC) and keep templates as C++ data. The Skriba thumbnail
renderer (`js/ui/thumbnails.js`) is an approximation; the desktop app can render real first-page
thumbnails with the layout engine. Complexity: **2–3 days**.

---

## 13. Font catalogue (summary of `docs/componentes/catalogo-fuentes.md`)

442 entries: 107 system (Windows/Office/macOS) + 335 Google Fonts, each `{name, cat, src:
'system'|'google', twin?, axes?}`, `cat ∈ sans|serif|mono|display|script|symbol`. Twins (metric
compatible free fonts) for 38 system fonts: Calibri→Carlito, Cambria→Caladea, Arial→Arimo, Times
New Roman→Tinos, Courier New→Cousine, Georgia→Gelasio, Garamond→EB Garamond, Segoe UI→Open Sans,
Consolas→Inconsolata, Impact→Anton, Century Gothic→Didact Gothic, Futura→Jost, Helvetica→Arimo,
Rockwell→Roboto Slab… Fallback stacks per category: sans/unknown/symbol/display `Calibri, "Segoe
UI", sans-serif`; serif `Cambria, Georgia, "Times New Roman", serif`; mono `Consolas, "Courier
New", monospace`; script `"Segoe Script", "Brush Script MT", cursive`. Recents: max 6. 34 font
pairs (`FONT_SETS`) for Design → Fonts. Web fonts download on first measurement and trigger
re-measure + reflow.
**Desktop:** keep the catalogue as data; resolve via installed fonts → twin → category fallback;
optionally ship the OFL twins (Carlito, Caladea, Arimo, Tinos, Cousine, Gelasio) so Linux lays
out Office documents with identical metrics; Google download is optional (network, licence OK
for OFL/Apache). Same rule: after a font becomes available, invalidate measurement caches
(incl. the math layout cache) and reflow.

---

## 14. Server-only features (summary) and desktop relevance

| Feature | What it is in Skriba | Desktop verdict |
|---|---|---|
| Accounts (`src/lib/Auth.php`) | Table `usuarios {id, email (unique, lowercase), password_hash, rol 'usuario'|'admin', created_at}`; PHP session cookie `SKRIBASESION`, 30-day lifetime; first admin from `.env` `ADMIN_EMAIL/ADMIN_PASSWORD`; invariant "≥1 admin" enforced by API | **Not needed.** Local files; author name from OS user / preferences (used for comments & tracking). |
| Sharing (`src/lib/Share.php`) | Table `comparticiones {token 32 hex, documento_id, propietario_id, email, modo 'ver'|'editar', revocada_at}`; token is the credential; "ver" forces read-only in the editor | **No** as such. Keep the *read-only mode* concept (open file read-only). Collaboration could come later via a cloud connector. |
| API keys (`src/lib/ApiKey.php`) | `claves_api`, secret `sk_` + 40 alphanumerics stored as sha256, prefix shown, scopes `auth, users, documents, shares` or `*` | **No.** |
| External API `/api/v1` (`src/api/v1.php`) | ping; auth verify/sessions (one-time SSO token, `AccessToken.php`); users CRUD; documents CRUD + export docx/json; shares | **No.** The CLI of the native app should cover the useful parts locally: `export --format docx|json`, `convert`, `merge` (mail merge from CSV), `compare`, `template new <id>`. |
| Admin panel `/admin` | users, documents, shares, API keys, SMTP config | **No.** |
| Server storage + autosave | per-user JSON store, autosave | Replace with local file save + periodic autosave/recovery file. |
| Compare's file list (`client.listFiles`) | server documents | Use file chooser (+ recent files). |
| Templates "Nuevo" flow | create on server then fill | Local: build doc in memory as Untitled. |
| Spell dictionary per user (browser localStorage + doc `dictionary`) | — | Keep `doc.dictionary`; user dictionary in app data dir. |
| Read aloud (Web Speech) | — | Optional via OS TTS. |
| PDF export / print | browser print | Native print & PDF via JUCE/OS (separate spec). |

---

## 15. Complexity summary and recommended phase order

| Feature | Complexity | Est. days | Depends on |
|---|---|---|---|
| Comments (model, commands, pane, highlights) | low–med | 3 | selection, layout rects |
| Track changes (recording, accept/reject, display) + protection | med | 4 (+2 OOXML) | all edit commands |
| References generators (TOC, captions, figures, index, biblio, cross-ref) | low | 3 | outline, page-of-block, fields, tabs w/ leaders |
| Footnotes/endnotes (pagination + render + numbering) | med–high | 5 | paginator |
| Equation (parser, layout, paint, OMML in/out) | med | 5 | measurer, breaker |
| SmartArt | low–med | 3–4 | paginator (indivisible block) |
| WordArt | low model / med render | 2–3 | glyph paths |
| Compare | low | 2 | track-changes display |
| Proofing + word count + language | low | 2 | — |
| Mail merge (+ envelopes, labels) | med | 4–5 | fields, tables |
| Ink | low | 2 | page overlay |
| Image editing (resize handles, wrap/align) | low–med | 2 | image layout |
| Templates | low | 2–3 | tables, lists, bands, page border |

Recommended order (after core editing, layout, styles, tables, images, bands and .docx I/O are
in place):
1. **Phase A — Review basics:** Comments → Track changes (+ protection enforcement incl. `tracked`) → Proofing/word count. These touch the command layer, so do them early before more commands accumulate. Fix docx export of `del` runs in the same phase.
2. **Phase B — References:** outline-based generators + replace helper → captions/figures/index/biblio (persist `sources`, `citationStyle`, `indexEntries`) → footnotes/endnotes in the paginator (with renumbering).
3. **Phase C — Objects:** Equation (with OMML I/O) → SmartArt → WordArt → Image editing polish.
4. **Phase D — Productivity:** Templates (as data) → Compare (into a new document) → Mail merge (+ CLI `merge`) → Envelopes/labels.
5. **Phase E — Extras:** Ink; read-aloud; optional font downloads.

---

## 16. Consolidated pitfalls / bugs found in the source

1. `sources`, `citationStyle`, `indexEntries` are written with `setDocProps` but **not serialized by `DocModel.toJSON()`** → lost on save (`document.js:236-264`). Persist them in the port.
2. Track-changes marks are **not exported** to .docx; pending deletions appear as normal text in Word. Comments are imported but **not exported**.
3. Endnotes are exported into `footnotes.xml` (kind lost).
4. Footnote numbers are assigned at insertion (`count + 1`) and never renumbered; `numberFootnotes` exists but is unused.
5. Note-kind conversion mutates the model directly (not undoable) and uses a fake `notesConvertedAt` prop to force relayout.
6. `protection.mode = 'tracked'` is not enforced.
7. Accept/reject "selection" resolves all revisions in every paragraph the selection touches. Cross-block deletes, paragraph merges/splits, paste and formatting are not tracked. Revision dates are always null.
8. Compare drops tables/SmartArt/cell paragraphs, strips `fn`/`caption`/generated markers from changed paragraphs, regenerates ids (orphaning comments), replaces the **current** body although the UI says a new document is created; word-level diff only for the single trailing unmatched paragraph pair.
9. Mail merge duplicates tables without remapping `cell.tableId`; band fields never resolved; preview creates one undo entry per step and keeps the original body only in memory; the recipients dialog re-serializes CSV without quoting.
10. Equation: groups always draw their parentheses (fractions, scripts, limits); `x^-1` binds only the minus; multi-letter words are single italic symbols; `in_` unreachable; ⋂/⋃ not reachable by name; imported OMML (Unicode ops, no `ast`) doesn't stack limits and re-exports as plain text; `m:nary` exported with empty `m:e`; `alt` of fractions with groups has double parentheses (`((2 a))`) — reproduce for byte-identical files.
11. WordArt `effect.spacing` is not included in text measurement (overflow) — fix in the port.
12. Generated titles use `Heading1`, so TOC/biblio/index titles feed back into the outline/TOC.
13. Caption numbering is computed once at dialog open from the initial label, ignores document position; "above" at block 0 inserts below.
14. `removeGenerated` deletes everything between the first and last marked block.
15. TOC `PAGEREF <blockId>` and `#blockId` anchors have no matching bookmarks in exported .docx.
16. Proofing rule 4 uses JS `\b` (ASCII-only) — accented word boundaries are missed; replicate deliberately or document the divergence.
17. Each ink eraser hit = separate undo entry; lasso "move" not implemented.
18. Linear offsets are UTF-16 code units in JS (surrogate pairs count 2). If the C++ model uses UTF-8 or code points, convert comment/index/bookmark offsets on load/save to stay compatible with Skriba files.
19. Templates put `hf` band paragraphs anywhere in `body` (often first); `setBand` puts them at the end — the paginator and exporters must accept both.
20. Label sheets ignore physical label sizes (no row heights); cell lines are joined with « · ».
