# 05 — User Interface Inventory (Ribbon, Backstage, Panes, Dialogs, Icons)

Spec for rebuilding the Skriba web UI natively in JUCE. It describes Skriba **as implemented**.
Where `plan.md` promises more than the code delivers, this spec says so and marks the gap
**[NOT IMPLEMENTED]**. Suggestions for the native port are marked **[NATIVE NOTE]**. They are
optional and do not describe Skriba's own behaviour.

## 0. Conventions

### 0.1 Source references

All paths are relative to `C:/xampp/htdocs/Skriba/public/`.

| Abbrev | File |
|---|---|
| `idx` | `index.html` |
| `main` | `js/main.js` |
| `rb` | `js/ui/ribbon.js` |
| `ic` | `js/ui/icons.js` |
| `bs` | `js/ui/backstage.js` |
| `sb` | `js/ui/statusbar.js` |
| `ru` | `js/ui/ruler.js` |
| `nav` | `js/ui/navigation.js` |
| `th` | `js/ui/thumbnails.js` |
| `dn` | `js/ui/docname.js` |
| `cm` | `js/ui/comments.js` |
| `ctx` | `js/ui/contextmenu.js` |
| `dlg` | `js/ui/dialogs/dialog.js` |
| `d/<name>` | `js/ui/dialogs/<name>.js` |
| `inp` | `js/editor/input.js` (keyboard) |
| `tok` | `css/tokens.css` |
| `wcss` | `css/word.css` |
| `rcss` | `css/ribbon.css` |
| `ccss` | `css/canvas.css` |
| `dcss` | `css/dialogs.css` |
| `plan` | `../plan.md` |

A reference looks like `rb:1094`: file `rb`, line 1094.

### 0.2 Units and number formats

* All pixel values are CSS px at a device pixel ratio of 1. JUCE logical pixels map 1:1.
* Document measurements are stored in **twips**: 1 pt = 20 twips, 1 in = 1440 twips, and
  1 cm = 566.93 twips (rounded). See `js/core/units.js`:
  * `cmToTwips(cm) = round(cm*10*1440/25.4)`
  * `ptToTwips(pt) = round(pt*20)`
  * `twipsToPx(tw) = tw/20*96/72`
* Line spacing (`para.line`) is in 1/240 of a line. 240 is single spacing.
* UI number display uses the es-ES format: a comma is the decimal separator and trailing
  zeros are dropped. For example, `fmtNum(1.5)` gives `1,5` (`rb:307`).
* Input parsing accepts both `,` and `.` as the decimal separator.
* Tooltips are the HTML `title` attribute. Reproduce them with `juce::TooltipClient` or
  `SettableTooltipClient`.

### 0.3 Command dispatch model

Every interactive control calls a single router: `onCommand(id, params)`, which is
`route()` in `main:711`. The command id is a string such as `'bold'` or `'align:left'`.
`params` is a small object. Exceptions thrown by the router are caught and logged at
`rb:337`.

**[NATIVE NOTE]** Keep the same string ids. The ribbon tests and the CLI can then share them.
Section 7 is the full catalogue.

---

## 1. Window layout

### 1.1 Vertical stack

Defined at `wcss:32-51` and `tok:76-83`. The window is a 5-row grid at 100 % of the viewport
height. The body never scrolls; the only scroll area is the document canvas.

| Row | Element | Height | Background | Bottom/top line |
|---|---|---|---|---|
| 1 | Title bar `#titlebar` | **48** | `#FFFFFF` | bottom 1 px `#D9D9D9` |
| 2 | Ribbon `#ribbon` | auto: **33** (tabs) + **75** (body) + 1 (border) = **109** | tabs `#F3F2F1`, body `#FFFFFF` | bottom 1 px `#D9D9D9` |
| 3 | Horizontal ruler `#ruler-h` | **24** | `#F3F2F1` | bottom 1 px `#D9D9D9` |
| 4 | Workspace `#workspace` | remaining space (minmax 0, 1fr) | – | – |
| 5 | Status bar `#statusbar` | **28** | `#F3F2F1` | top 1 px `#D9D9D9` |

The workspace is a horizontal flex box (`idx:51-62`, `wcss:229-246`). Children in DOM order:

1. `#find-pane`: left side pane. Hidden by default.
2. `#nav-pane`: left side pane. Hidden by default.
3. `#proof-pane`: left side pane. Hidden by default.
4. `#canvas`: flexible. This is the only scroll container (both axes).
5. `#comments-pane`: **right** side pane. Hidden by default.

Several panes can be open at the same time. The canvas shrinks to make room. After a pane
opens or closes, `afterPaneResize()` (`main:2573`) runs `view.refreshAll()`, `ruler.refresh()`
and `editor.refreshCaret()`.

#### View-mode overrides

These are UI-only classes on `<body>` (`wcss:467-483`):

* **Ruler off** (`no-ruler`): row 3 collapses to 0.
* **Read mode** (`view-read`): rows 2 and 3 collapse to 0. Ribbon and ruler are hidden. The
  title bar and status bar stay.
* **Web layout** (`view-web`): pages have no shadow. It also changes the layout itself (see
  `view:mode` in section 7).

**Pitfall (comment `wcss:44-46`):** each area must stay pinned to its own grid row. If a row
is simply removed, the canvas lands in a zero-height row and disappears. In JUCE, compute the
row heights explicitly in `resized()`.

### 1.2 Overlay z-order

From back to front (`wcss:444-457`, `dcss`, `dlg:411`):

| Layer | z-index | Notes |
|---|---|---|
| Backstage (`#backstage-root` > `.backstage`) | 6000 (`dcss:376`) | Full window, covers everything including the title bar. |
| Modal dialog overlay | `5000 + openCount*2` | Overlay is `rgba(0,0,0,0.18)` over the whole window (`dcss:18-23`). |
| Ribbon dropdown panels (`.xl-dropdown`) | 3000 | Inside `#contextmenu-root`. |
| Context menus (`.xl-cm`) | 4000 | |

Caveat: the root containers have their own stacking (backstage root 900 < dialog root 1000 <
context-menu root 1100). The **effective** order is therefore:

backstage < dialogs < dropdowns and context menus.

Dialogs opened from the backstage (for example the login dialog) appear above it.

**[NATIVE NOTE]**
* Backstage: a full-window child component placed on top.
* Dialogs: `juce::DialogWindow` or a custom modal component with a dimming overlay.
* Dropdowns and menus: `juce::PopupMenu` or `CallOutBox`-like popups that always sit on top.

### 1.3 Window title and minimum size

* The window title is `"<docName> - Skriba"`, initially `"Documento1.docx - Skriba"`
  (`idx:6`, `main:2774`).
* No minimum size is defined. **[NATIVE NOTE]** Use about 800×600.
* Large pieces are clipped horizontally with `overflow:hidden`. This applies to the ribbon,
  the tab row and the status bar. Nothing collapses the way Word's adaptive ribbon does.

### 1.4 Fonts

From `tok:85-89`.

| Role | Family stack | Size |
|---|---|---|
| UI | `"Segoe UI", system-ui, sans-serif` | 12 px base |
| Document default | `Aptos, Calibri, "Segoe UI", sans-serif` | 11 pt = 14.6667 px |

Other UI sizes:

| Size | Used for |
|---|---|
| 9 px | ruler numbers |
| 10.5 px | group labels, big-button labels |
| 11.5 px | medium buttons, combo boxes |
| 13 px | document name, backstage text |
| 15 px | pane titles |
| 26 px | backstage H1 |
| 30 px Light (300) | account dialog title |

**[NATIVE NOTE]** On Linux, fall back to "Noto Sans" or "DejaVu Sans" for the UI font.

---

## 2. Design tokens

### 2.1 Colours

From `tok:5-73`. All UI colours come from these tokens unless listed in §2.2.

| Token | Value | Use |
|---|---|---|
| `--wd-blue` | `#2B579A` | Brand blue: "Archivo" tab, backstage navigation, logo |
| `--wd-blue-dark` | `#1F4172` | Hover and active state of brand-blue surfaces |
| `--wd-accent` | `#185ABD` | Accent: primary buttons, focus, active borders, toggle "on" |
| `--wd-accent-dark` | `#1349A0` | Hover of the accent colour |
| `--wd-link` | `#0563C1` | Hyperlinks and link-buttons |
| `--wd-titlebar-bg` | `#FFFFFF` | |
| `--wd-qat-bg` | `#FFFFFF` | |
| `--wd-ribbon-bg` | `#F3F2F1` | Ribbon tab row |
| `--wd-ribbon-tab-active-bg` | `#FFFFFF` | Active tab "pill" |
| `--wd-ribbon-body-bg` | `#FFFFFF` | Ribbon body |
| `--wd-ruler-bg` | `#F3F2F1` | |
| `--wd-canvas-bg` | `#E1DFDD` | Grey area around the pages |
| `--wd-grid` | `#D8E2F0` | Gridlines (Vista → Mostrar) |
| `--wd-page-bg` | `#FFFFFF` | |
| `--wd-statusbar-bg` | `#F3F2F1` | |
| `--wd-gallery-bg` | `#EDEBE9` | Gallery and pane backgrounds, style-name strip |
| `--wd-text` | `#201F1E` | Primary text |
| `--wd-text-2` | `#323130` | Secondary text (most controls) |
| `--wd-text-secondary` | `#605E5C` | Tertiary text, hints, group labels |
| `--wd-text-disabled` | `#A19F9D` | |
| `--wd-separator` | `#D9D9D9` | Bar borders, list separators |
| `--wd-border-soft` | `#C8C6C4` | Combos, dropdowns, menus |
| `--wd-border-strong` | `#8A8886` | Form controls in dialogs |
| `--wd-group-sep` | `#E1DFDD` | Vertical separator between ribbon groups; menu separators |
| `--wd-danger` | `#E81123` | Hover of a dialog's close "X" (white glyph) |
| `--wd-error` | `#A4262C` | Form error text |
| `--wd-selection` | `rgba(43,87,154,0.25)` | Text selection |
| `--wd-caret` | `#201F1E` | Caret, 1.5 px wide |
| `--wd-table-border` | `#A6A6A6` | Default cell border |
| `--wd-find-hit` | `rgba(255,214,0,0.45)` | Find match |
| `--wd-find-hit-active` | `rgba(255,140,0,0.55)` | Active find match |
| `--wd-hover` | `rgba(0,0,0,0.06)` | Translucent hover |
| `--wd-hover-solid` | `#EDEBE9` | Solid hover (ribbon buttons, menu items) |
| `--wd-pressed` | `#E1DFDD` | Pressed, and button whose dropdown is open |
| `--wd-toggle-active-bg` | `#D5E1F2` | Toggle "on" (B/I/U, alignments) |
| `--wd-toggle-active-ring` | `#A3BDE3` | 1 px inner ring of a toggle that is on |
| `--wd-toggle-active-hover` | `#C6D7EE` | Hover over a toggle that is on |
| `--wd-ruler-mark` | `#605E5C` | Ruler ticks and numbers |
| `--wd-ruler-indent` | `#323130` | Indent markers (reserved; not drawn) |
| `--wd-ruler-margin-bg` | `#D0CECC` | Ruler margin zones |
| `--wd-spell` | `#C00000` | Reserved. The actual squiggle is `#E51400` (§2.2). |
| `--wd-grammar` | `#2B579A` | Reserved |

### 2.2 Shadows and hard-coded colours outside the tokens

**Shadows**

| Shadow | Value |
|---|---|
| Menu (`--wd-menu-shadow`) | `0 6.4px 14.4px rgba(0,0,0,.13), 0 1.2px 3.6px rgba(0,0,0,.11)` |
| Dialog (`--wd-dialog-shadow`) | `0 25.6px 57.6px rgba(0,0,0,.22), 0 4.8px 14.4px rgba(0,0,0,.18)` |
| Page (`--wd-page-shadow`) | `0 2px 8px rgba(0,0,0,.15)` |

**Hard-coded colours**

| Where | Value | Ref |
|---|---|---|
| Dialog border | `#B5B3B1`, radius 6 | `dcss:29` |
| Dialog overlay | `rgba(0,0,0,0.18)` | `dcss:22` |
| Combo hover border | `#A19F9D` | `rcss:281` |
| Status-bar slider thumb | `#605E5C`, 1 px white border; accent on hover | `rcss:655` |
| Spelling squiggle | `#E51400`. Wave tile 6×3 px, path `M0 2.2 Q1.5 .4 3 2.2 T6 2.2`, stroke 1, repeated along the bottom edge of the word rectangle. | `ccss:139` |
| Commented text | fill `rgba(255,193,94,0.28)`, bottom border 2 px `rgba(216,138,0,0.7)`; active fill `rgba(255,193,94,0.52)` | `ccss:386-393` |
| Paragraph mark ¶ | accent colour, opacity .55 | `ccss:371-379` |
| Table column-grip hover | `rgba(43,87,154,0.18)` | `ccss:457` |
| Image selection frame and handles | frame 1 px accent; handles 8×8 white with 1 px accent border, radius 1 | `ccss:210-227` |
| Account dialog input border | `#ABABAB`, square | `dcss:557` |
| Account dialog error text | `#C42B1C` | `dcss:570` |
| Style gallery / list-sample sample line | `#B3B0AD` | `rb:842` |
| Comment author avatars | Palette `#C0392B #1F6FB2 #7D3C98 #117A65 #B9770E #943126 #1A5276`. Index = `h % 7` where `h = (h*31 + charCode) >>> 0` over the author name. | `js/layout/pages.js:1255-1265` |
| Preview boxes (dialogs) | `#FAFAFA` | `dcss:306` |
| Logo glyph (`word` icon) | rect `#2B579A`, white "W" | `ic:252` |

### 2.3 Layout constants

| Constant | Value | Ref |
|---|---|---|
| Side pane width | 336 px | `tok:83` |
| Page gap (vertical, between pages and above the first) | 24 px | `tok:81`, `pages.js:128` |
| A4 page at 100 % zoom | 794 × 1123 px (11906 × 16838 twips) | `plan:154` |
| Default margins | 1440 twips (96 px) on all four sides | |
| Caret blink | 1 s, `steps(1)`: on 0–50 %, off 50–100 %. No blink with reduced motion. | `ccss:144-160` |

---

## 3. Title bar and Quick Access Toolbar

### 3.1 Structure

The title bar is a 3-column grid `1fr auto 1fr` with horizontal padding 10 px (`wcss:57-69`,
`idx:22-42`).

**Left** (flex, gap 8):

1. **App icon:** 24×24 bitmap (`assets/icon/icon-64.png`, drawn at 24 px).
2. **"Autoguardado" toggle:**
   * Label "Autoguardado", 12 px, `#323130`.
   * Switch 28×14, radius 7. On: `#185ABD`. Off: `#8A8886`.
   * Knob 10×10 white, 2 px inset. On: knob at the right.
   * Tooltip "Autoguardado activado".
   * **Decorative only.** Always on; clicking does nothing (`wcss:80`).
3. **QAT** (`#qat`): margin-left 8, gap 2.

**Centre** (flex, gap 8):

* **Document name** `#doc-name`:
  * 13 px, `#201F1E`, padding 4 8, radius 4, ellipsis.
  * Hover background `rgba(0,0,0,.06)`.
  * Tooltip "Cambiar nombre".
  * Click starts an in-place rename (§3.3).
* **Saved state** `#doc-saved-state`:
  * 11 px, `#605E5C`.
  * Initial text "Guardado".

**Right** (flex, gap 6):

* `#account-area`, filled by `initAccountUI` (`d/account:198-234`) when a user is logged in:
  * A chip with the user's email: max width 180, ellipsis, 11 px, `#605E5C`, tooltip
    "Sesión iniciada".
  * A text button "Cerrar sesión": transparent, `#605E5C`; hover `rgba(0,0,0,.06)` with
    `#201F1E` text. It logs out and reloads.
* **"Compartir" button** `#btn-share`:
  * Accent background, white 12 px text, padding 6 14, radius 4. Hover `#1349A0`.
  * Opens the Share dialog (§12.15).
  * Hidden when the document was opened through a share link or in admin view (`main:464-480`).

### 3.2 QAT buttons

Built at `rb:2236-2251`. Each button is 26×26, radius 4, icon 16 in `#323130`. Hover
`#EDEBE9`, pressed `#E1DFDD`, disabled `#A19F9D`.

| Order | Icon | Tooltip | Command |
|---|---|---|---|
| 1 | `save` | "Guardar (Ctrl+G)" | `save` |
| 2 | `undo` | "Deshacer (Ctrl+Z)" | `undo` |
| 3 | `redo` | "Rehacer (Ctrl+Y)" | `redo` |

Undo and Redo are disabled while `canUndo()` / `canRedo()` is false. They resync on
`undo:changed` and on every `updateState` (`rb:2280-2287`).

**Pitfall:** the QAT is outside the ribbon body. `setEnabled(false)` does **not** disable it.

### 3.3 Document-name editor

Defined in `dn` (whole file).

**Starting the edit**

* Triggered by a click on the name, or by Enter or F2 while it has focus.
* The label is hidden and a text box (class `doc-name-input`) appears in its place:
  * width 32ch, max 50vw, 13 px, padding 3 8;
  * 1 px accent border plus a 1 px inset accent ring.
* Max length **150** characters.
* The text is pre-selected **without the extension**: selection = `[0, lastIndexOf('.'))`,
  or the whole text if there is no dot (`dn:278-282`).

**Ending the edit**

* Enter, or losing focus: commit.
* Escape: cancel.
* Commit and cancel run only once (`cerrado` flag). Enter triggers a blur, so without the flag
  it would fire twice.

**Normalisation** (`normalizeDocName`, `dn:222-230`):

1. Replace each run of `[\\/:*?"<>|]` or control characters U+0000–U+001F with one space.
2. Collapse runs of whitespace and trim.
3. If the result is empty or equals `.docx`, treat it as empty. Empty or unchanged means no-op.
4. If the name does not match `/\.[A-Za-z0-9]{1,8}$/`, append `.docx`.
5. Truncate to 150 characters.

**On rename** (`main:456-460`): `commands.setDocName(name)` (undoable), update the label and
window title, then `saveNow()`.

**Read-only cases** (share link in "ver" mode, or admin view): `canEdit()` returns false. The
label gets class `doc-name-readonly` (no hover, default cursor) and its tooltip is cleared.

### 3.4 Saved-state texts

| Text | Meaning | Ref |
|---|---|---|
| "Guardado" | Saved | `api/client.js:42-46` |
| "Guardando…" | Autosave in progress (2 s debounce after `doc:changed`; retry with exponential backoff up to 30 s) | `api/client.js:42-46` |
| "Sin conexión — copia local" | Save failed; a local backup was kept | `api/client.js:42-46` |
| "Solo lectura" | Document opened through a "ver" share link | `main:428` |
| "Solo lectura" / "Solo comentarios" | Shown for 2.5 s when an edit is blocked by protection. Throttled to once per 4 s, then the previous text returns. | `main:360-373` |
| "Insertando imagen…" | During an image upload | `main:2448` |
| "Destinatario {i} de {n}" | During a mail-merge preview | `main:1102` |

---

## 4. Ribbon framework

Implemented in `rb` and styled by `rcss`.

### 4.1 Tab row

Defined at `rcss:31-70` and `rb:2183-2232`.

**Row layout**

* Height 33, padding 0 8, gap 2.
* Tabs are bottom-aligned; background `#F3F2F1`.

**"Archivo" button** (first item)

* Not a real tab: clicking fires `file:backstage`, which opens the backstage on "Inicio".
* Tooltip "Archivo".
* Background `#2B579A`, white text, radius 4, margin 3 6 4 0, padding 4 16 5.
* Hover `#1F4172`.

**Regular tabs**

* Padding 6 11 7, radius 4 4 0 0, text `#323130`.
* Hover background `#EDEBE9`.
* **Active tab:** white background, `#201F1E`, weight 600, shadow `0 -1px 2px rgba(0,0,0,.06)`.
  It visually merges with the white body below it.

**Tab order and ids** (`rb:2195-2206`). The default active tab is `inicio`.

| id | Label |
|---|---|
| `inicio` | Inicio |
| `insertar` | Insertar |
| `dibujar` | Dibujar |
| `diseno` | Diseño |
| `disposicion` | Disposición |
| `referencias` | Referencias |
| `correspondencia` | Correspondencia |
| `revisar` | Revisar |
| `vista` | Vista |
| `ayuda` | Ayuda |

**Behaviour**

* Activating a tab closes any open ribbon dropdown, marks the tab active and shows only its
  panel (`rb:2225-2231`).
* `showTab(id)` lets other code switch tabs.
* There are **no contextual tabs** (no "Diseño de tabla" or "Formato de imagen"). Table
  actions live in the canvas context menu (§11.4).

**[NOT IMPLEMENTED]**

* Alt key-tips (`plan:1045`).
* Double-click to collapse the ribbon.

### 4.2 Body, panels and groups

Defined at `rcss:76-148` and `rb:703-726`.

**Body and panel**

* Body: height 75, white, `overflow:hidden`.
* `setEnabled(false)` adds opacity .45 and blocks input. This affects the body only, not the
  tabs or the QAT.
* Panel: flex row, padding 3 8 0.

**Group**

* Flex column, padding 0 6.
* Right border 1 px `#E1DFDD`; the last group has none.
* **Content area:** flex row, centred vertically, gap 3. Height = 75 − 3 − 17 = **55 px** usable.
* **Label row:** height 17, centred, 10.5 px, `#605E5C`, gap 4.
* **Optional launcher button:** glyph `⇲` (U+21F2) at 9 px, padding 1 3, radius 2.
  * Hover `#EDEBE9` with `#201F1E` text.
  * Tooltip `"{label}: más opciones"`.
  * Fires the group's launcher command.

**Helpers**

| Helper | Layout |
|---|---|
| `row()` | Horizontal, gap 2 |
| `col()` | Vertical, centred, gap 2. Holds up to 3 medium buttons (3×22 + 2×2 = 70 > 55). |
| `vsep()` | Vertical separator 1×18, `#E1DFDD`, horizontal margin 3 |

**Pitfall:** three medium buttons need 70 px but only 55 are available. The buttons are
`inline-flex` with a fixed 22 px height, so they do not shrink. The column is centred in its
55 px slot, so it overflows by about 7.5 px above and 7.5 px below:

* the top overflow eats into the 3 px panel padding and is clipped by the body;
* the bottom overflow overlaps the group-label row.

Take a screenshot of the web app before you decide how to reproduce this. **[NATIVE NOTE]**
Either use 3 rows of about 18 px, or make the body about 90 px tall (3 × 22 + 2 × 2 + 17 +
3 = 90).

### 4.3 Control types

All buttons share these properties:

* No border, radius 4, text `#323130`.
* Hover `#EDEBE9`, pressed `#E1DFDD`.
* Disabled: `#A19F9D` text, no hover.
* A toggle that is on: background `#D5E1F2`, inset 1 px `#A3BDE3`, hover `#C6D7EE`.
* A button whose dropdown is open: background `#E1DFDD` (class `is-open`).

| Type | Factory | Geometry and behaviour |
|---|---|---|
| **Small** | `sBtn` (`rb:416`) | 24×24, icon 16. Fires `cmd(params)`. Optional `toggleKey` registers it as a toggle (§4.6). |
| **Small with menu** | `sMenuBtn` (`rb:426`) | 34×24: icon 16 plus chevron-down 10×10 (margin-left −2). A click opens a standard menu under the button. |
| **Split (small)** | `splitBtn` (`rb:435`) | Main part 24×24 (left corners rounded) plus an arrow part 13×24 with a 9 px chevron. Both parts share the tooltip. Main runs `onMain`; the arrow runs `openMenu(arrow, main)`. The toggle state is tracked on the main part. |
| **Big** | `bigBtn` (`rb:451`) | 58 wide, min height 54, padding 4 2 2, column layout, gap 2. Icon drawn at **20×20**, label 10.5 px with line height 1.1, wraps. With a `menu`, a 9 px chevron follows the label text and a click opens the menu. Otherwise the click runs `onClick(btn)`. The tooltip defaults to the label. |
| **Big split (Pegar)** | `rb:970-982` | 50×54. Top part (flex) holds a 20 px icon. Bottom part is 22 px tall with the label "Pegar" and a 9 px chevron in a column. |
| **Medium** | `medBtn` (`rb:464`) | Height 22, padding 0 6, 11.5 px, left-aligned, no wrapping. Contents: icon, label, then a 9 px chevron if it has a menu or dropdown. A `dropdown` opens a custom panel (`openDropdown`); a `menu` opens a context-style menu; otherwise it fires `cmd(params)`. |
| **Combo (editable)** | `combo` (`rb:480`) | See §4.4. |
| **Spin box** | `numBox` (`rb:644`) | See §4.5. |
| **Checkbox** | `checkbox` (`rb:2144`) | Label plus checkbox, 11.5 px, gap 6, padding 2 4, radius 4. Hover `#EDEBE9`. Tick in the accent colour. Fires `onChange(checked)`. |
| **Gallery** | style, design-spacing and list galleries | §4.7, §5.4, §4.8. |

### 4.4 Combo box

Defined at `rb:480-507` and `rcss:272-320`.

**Appearance**

* Height 22, 1 px `#C8C6C4` border, radius 2, white.
* Hover border `#A19F9D`; focus border is the accent colour.
* Text input 11.5 px, padding 0 5. Arrow button 15 px wide with a 9 px chevron and no focus
  stop. The arrow tooltip equals the input tooltip.

**Widths**

* Font combo: **128 px**. This inline value overrides the CSS class value of 118.
* Size combo: **48 px**.

**Keys in the text box**

* Enter: prevent the default action, close the dropdown, run `onCommit(text)`, remove focus.
* Escape: remove focus. The value is not reverted; `updateState` rewrites it on the next
  selection change.

**Arrow**

* Opens the list dropdown, anchored to the whole combo.
* The font combo also has `onInput`: each keystroke reopens or refreshes the dropdown,
  filtered by what was typed.

**Font name commit** (`rb:1006-1011`)

* `name = trim(text)`. If empty, do nothing.
* Otherwise call `noteFontUsed(name)` and fire `font-name {name}`.
* Names that are not in the catalogue are accepted.

**Size commit** (`rb:1022-1025`)

* `n = parseFloat(text.replace(',', '.'))`. If n is finite and greater than 0, fire
  `font-size {pt:n}`.
* No upper bound here. The Font dialog limits size to 1638.

**Size list** (`rb:65`): 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72.
Narrow list, min width 56. Clicking an entry sets the input text and fires `font-size {pt}`.

**Font list dropdown** (`buildFontList`, `rb:537-595`)

* Width 232–320. Items are 14 px tall with line height 1.25.
* Each font name is drawn in its own family, except symbol fonts.
* A category tag (10 px UI font, `#605E5C`) is right-aligned when the category is not
  "sans": `Serif`, `Monoespaciada`, `Decorativa`, `Manuscrita` or `Símbolos`.
* Item tooltip: `"{name} — {Category}"`. Web fonts add `" · fuente web: se descarga al usarla"`.

Sections, each with a title of 11 px `#605E5C`, padding 6 10 3:

1. **"Fuentes del tema"**
   * `"{majorFont} (Títulos)"` and `"{minorFont} (Cuerpo)"`, from `doc.theme`.
   * Default theme: Aptos / Aptos (`js/core/theme.js:24-30`).
   * Only entries matching the filter are shown. Hidden entirely if none match.
2. **"Usadas recientemente"**
   * Up to **6** names, most recent first.
   * Persisted in localStorage key `skriba.fonts.recent` (`js/core/fonts.js:527-579`).
   * **[NATIVE NOTE]** Persist in the app's `PropertiesFile`.
3. **"Todas las fuentes"**
   * `searchFonts(filter)`, which returns catalogue entries.
   * If nothing matches, show one disabled item:
     "Sin coincidencias (Intro aplica el nombre tal cual)".

Filter: case-insensitive substring match on the trimmed text.

Picking an entry sets the input text, closes the list, calls `noteFontUsed` and fires
`font-name {name}`.

Lazy loading: web fonts are downloaded only when their row scrolls into view.

### 4.5 Spin box (`numBox`)

Defined at `rb:644-701`.

**Layout**

* Row: height 22, gap 4.
* Label: 11 px, `#201F1E`, min width 60.
* Value box: combo-style, 62 px wide, right-aligned text.
* Spin column: two buttons 11 px tall (padding 0 2) with `chevron-up` and `chevron-down`
  icons and no focus stop.

**Display:** `fmtNum(v) + unit`, for example `"1,25 cm"` or `"8 pt"`.

**Parsing (`leer`)**

1. Replace `,` with `.`.
2. Strip every character except digits, `.` and `-`.
3. `parseFloat`.
4. Clamp to [min, max]. If the result is not a number, return null.

**Commit:** if parse returns null, do nothing. Otherwise rewrite the text and run
`onCommit(n)`. Commit triggers: Enter (also removes focus), focus loss, ArrowUp/ArrowDown
(adds ±step, then commits), and the spin buttons (±step, then commit).

**`set(v)`** updates the text only when the input does not have focus.

**Pitfall:** focus loss always commits, even when nothing changed. Tabbing through the boxes
therefore re-applies the current indent or spacing and creates undo entries. **[NATIVE NOTE]**
Commit only when the value actually changed.

### 4.6 Toggle registry and `updateState(fmt)`

Defined at `rb:2293-2331`. The input is `fmt = {char, para, styleId, painter}` from
`editor.currentFormat()` (`main:692-698`). It is called on every `layout:done`,
`selection:changed` and `undo:changed`.

| Toggle key | Condition for "on" |
|---|---|
| `format-painter` | `fmt.painter` (painter loaded) |
| `bold` | `char.bold` |
| `italic` | `char.italic` |
| `underline` | `char.underline` is set and is not `'none'` |
| `strike` | `char.strike` |
| `sub` | `char.sub` |
| `sup` | `char.sup` |
| `align:left`, `align:center`, `align:right`, `align:justify` | `para.align` equals that value (default `'left'`) |
| `bullets` | `para.numbering.listId` starts with `lb-` |
| `numbering` | `para.numbering.listId` starts with `ln-` |
| `multilevel` | `para.numbering.listId` starts with `lm-` |
| `pen`, `highlighter`, `eraser`, `lasso`, `none` | Set through `setViewState({inkTool})`: the key equal to `inkTool` (or `'none'`) is on |

`updateState` also does the following:

* Font combo text = `char.font` or `'Aptos'`; size combo text = `char.size` (default 11) with
  `.` replaced by `,`. Neither is overwritten while it has focus.
* Disposición spin boxes:
  * left/right indent from `twipsToCm(para.left)` and `twipsToCm(para.right)`;
  * before/after spacing from `twipsToPt(para.before)` and `twipsToPt(para.after)`.
* Remembers the paragraph's list id (`activeListId`) so the list gallery can highlight it.
* Marks the active style in the gallery: `fmt.styleId` or `'Normal'`.
* Resyncs undo and redo.

**Pitfall:** the small "Control de cambios" toggle in Revisar → Seguimiento registers the key
`track-changes`, but nothing ever sets that key. The button never shows the tracking state.
**[NATIVE NOTE]** Drive it from `doc.tracking.enabled`.

### 4.7 `setViewState(state)`

Defined at `rb:2344-2367` and called from `main:1522`. `state` can contain `mode`, `ruler`,
`gridlines`, `navigation`, `marks`, `spelling` and `inkTool`.

* `mode` (`print`, `web` or `read`) marks the matching big button in Vista → Vistas as active.
* The boolean fields set these checkboxes:
  * "Regla", "Líneas de cuadrícula", "Panel de navegación", "Marcas de párrafo" (Vista);
  * "Ortografía mientras escribe" (Revisar).
* `inkTool` sets the Dibujar toggles.

### 4.8 Dropdown panel mechanics

Defined at `rb:372-409`.

**`openDropdown(anchor, panel)`**

* Closes any other dropdown first. Only one can be open at a time.
* The panel is white, 1 px `#C8C6C4` border, radius 4, menu shadow, padding 4, max height
  70 % of the window, scrolls, 12 px text in `#323130`.
* Positioning:
  * `x = anchor.left`, `y = anchor.bottom + 2`.
  * If `x + w > window.width − 4`, then `x = max(4, window.width − w − 4)`.
  * If `y + h > window.height − 4`, then `y = max(4, anchor.top − h − 2)` (the panel flips
    above the anchor).
* The anchor gets the "open" state while the panel is showing.

**Closing:** a pointer-down outside both the panel and the anchor, Escape, or choosing an item.
Choosing an item calls `closeDropdown()` **before** firing the command.

**`menuBelow(anchor, items)`** opens a **context menu** (§11) at `(anchor.left, anchor.bottom+2)`.
This is a different component from the dropdown panel, with different overflow rules.

**List items in dropdowns** (`.xl-list-item`, `rcss:407-430`)

* Padding 5 10, radius 2. Hover `#EDEBE9`; active `#D5E1F2`; disabled grey.
* Separator: 1 px `#E1DFDD`, margin 4 6.
* "More…" footer: top border, accent text.

### 4.9 Colour palettes

**Office palette** (`buildPalette`, `rb:736-773`, `rcss:488-540`)

* Panel width 216, padding 4.
* **Special row** (first): a swatch (`specialColor`) next to `specialLabel`.
  * Font colour: "Automático" with a black swatch.
  * Page colour: "Sin color" with a white swatch.
  * Pen: "Negro" with a black swatch.
  * Picking it calls `onPick(null)`.
* **"Colores del tema"** (title 11 px `#605E5C`, margin 6 2 3): a grid of 10 columns × 18 px
  with gap 2.
  * Row 1 holds the base colours `THEME_COLORS` (`rb:68-73`):

    | Hex | Name |
    |---|---|
    | `#FFFFFF` | "Blanco, Fondo 1" |
    | `#000000` | "Negro, Texto 1" |
    | `#E7E6E6` | "Blanco, Fondo 2" |
    | `#44546A` | "Azul oscuro, Texto 2" |
    | `#4472C4` | "Azul, Énfasis 1" |
    | `#ED7D31` | "Naranja, Énfasis 2" |
    | `#A5A5A5` | "Gris, Énfasis 3" |
    | `#FFC000` | "Oro, Énfasis 4" |
    | `#5B9BD5` | "Azul claro, Énfasis 5" |
    | `#70AD47` | "Verde, Énfasis 6" |

  * Rows 2–6 hold the variants of each column (algorithm below). The grid is filled row by
    row.
* **"Colores estándar"** (`rb:76-81`), 1 row of 10:

  | Hex | Name |
  |---|---|
  | `#C00000` | Rojo oscuro |
  | `#FF0000` | Rojo |
  | `#FFC000` | Naranja |
  | `#FFFF00` | Amarillo |
  | `#92D050` | Verde claro |
  | `#00B050` | Verde |
  | `#00B0F0` | Azul claro |
  | `#0070C0` | Azul |
  | `#002060` | Azul oscuro |
  | `#7030A0` | Púrpura |

* Swatches: 18×18, 1 px `rgba(0,0,0,.18)` border, radius 2. Hover or active: 2 px accent
  outline. Tooltip `"{name} {HEX}"`; variants reuse the column's base name.
* There is **no** "Más colores…" entry.

**Theme variant algorithm** (`rb:272-297`)

```
mix(a, b, t):
    each channel = round(ca + (cb - ca) * t)
    return uppercase "#RRGGBB"

luma(hex) = (0.299*R + 0.587*G + 0.114*B) / 255

variants(base):
    L = luma(base)
    if L > 0.85:   return [mix(base, black, t) for t in 0.05, 0.15, 0.25, 0.35, 0.50]
    if L < 0.15:   return [mix(base, white, t) for t in 0.50, 0.35, 0.25, 0.15, 0.05]
    otherwise:     return [mix(base, white, 0.8), mix(base, white, 0.6), mix(base, white, 0.4),
                           mix(base, black, 0.25), mix(base, black, 0.5)]
```

**Highlight palette** (`buildHighlightPalette`, `rb:776-795`)

* A grid of 5 columns × 20 px swatches, gap 3, holding 15 colours (`rb:84-90`):

  | Hex | Name |
  |---|---|
  | `#FFFF00` | Amarillo |
  | `#00FF00` | Verde brillante |
  | `#00FFFF` | Turquesa |
  | `#FF00FF` | Rosa |
  | `#0000FF` | Azul |
  | `#FF0000` | Rojo |
  | `#000080` | Azul oscuro |
  | `#008080` | Verde azulado |
  | `#008000` | Verde |
  | `#800080` | Violeta |
  | `#800000` | Rojo oscuro |
  | `#808000` | Amarillo oscuro |
  | `#808080` | Gris 50 % |
  | `#C0C0C0` | Gris 25 % |
  | `#000000` | Negro |

* After the grid, a "Sin color" row with a white swatch calls `onPick(null)`.
* Tooltip: the colour name only.
* **Pitfall:** the CSS class `is-highlight` (5-column layout) is never added in JS
  (`rb:778`). The grid therefore actually renders with the default **10 columns of 18 px**.
  Pick one layout; 5 × 20 px is the intended one.

**Colour bar on split buttons:** the `fontcolor` and `highlight` icons contain a rectangle
(`rect.cbar`) whose fill shows the last colour used. Initial last colours: font `#C00000`,
highlight `#FFFF00` (`rb:369`).

### 4.10 List gallery dropdown

Defined at `rb:816-877`.

**Panel**

* Palette-style panel with a title.
* Grid of 4 columns × 52 px, gap 4, padding 4.
* Each cell is 52×44: 1 px `#C8C6C4` border, radius 2, white, padding 4 6, 9 px text
  `#201F1E`.
* The entry whose `id` equals the paragraph's current list id gets a `#185ABD` border and a
  `#EDEBE9` background.
* Each cell has 3 sample rows. A row is a marker text (min width 12, right-aligned) followed
  by a 22×2 bar in `#B3B0AD`.
* Clicking a cell fires `{cmd} {listId: entry.id}`.

**Footer**

* "Ninguno": fires `list:none`.
* A disabled row "Cambiar nivel de lista ▸ Tab / Mayús+Tab" at opacity .65.

**Sample marker for level i** (`muestraNivel`)

```
lvl = entry.levels[i]
if lvl is missing:                          ''
if lvl.fmt == 'bullet' or lvl.char is set:  lvl.char, or '•'
if lvl.lvlText is set:                      lvlText with each "%d" replaced by:
                                              i+1  if d == 1
                                              1    otherwise
otherwise:
    ordinals = ORDINAL_SAMPLES[lvl.fmt], or ORDINAL_SAMPLES.decimal
    ordinals[i mod 3] + ('' if lvl.sep == ' ' else (lvl.sep or '.'))
```

`ORDINAL_SAMPLES`:

| fmt | Samples |
|---|---|
| `decimal` | 1, 2, 3 |
| `lowerLetter` | a, b, c |
| `upperLetter` | A, B, C |
| `lowerRoman` | i, ii, iii |
| `upperRoman` | I, II, III |
| `ordinal` | 1.º, 2.º, 3.º |

**Gallery entries** (`js/formatting/lists.js:283-317`)

| Gallery | Title | Entries (id → name) |
|---|---|---|
| `bullet` | "Biblioteca de viñetas" | `lb-disc` Viñeta redonda (•); `lb-circle` Viñeta hueca (○); `lb-square` Viñeta cuadrada (▪); `lb-arrow` Viñeta de flecha (➢); `lb-check` Viñeta de visto (✓); `lb-diamond` Viñeta de rombo (◆); `lb-dash` Viñeta de guion (–); `lb-star` Viñeta de estrella (★) |
| `number` | "Biblioteca de numeración" | `ln-decimal` "1. 2. 3."; `ln-paren` "1) 2) 3)"; `ln-upper-letter` "A. B. C."; `ln-lower-letter` "a) b) c)"; `ln-upper-roman` "I. II. III."; `ln-lower-roman` "i. ii. iii."; `ln-ordinal` "1.º 2.º 3.º" |
| `multilevel` | "Biblioteca de listas" | `lm-legal` "1. / 1.1. / 1.1.1."; `lm-mixed` "1. / a. / i."; `lm-bullet` "• / ○ / ▪" |

The cell tooltip is the entry name.

### 4.11 Style gallery

Defined at `rb:884-960` and `rb:1167-1181`.

**Container**

* Horizontal row, gap 4, `overflow:hidden`, max width **270**, smooth scrolling.
* Prev/next buttons: two small buttons stacked in a column to the right.
  * `chevron-left`, tooltip "Estilos anteriores": scroll left by 124 px.
  * `chevron-right`, tooltip "Estilos siguientes": scroll right by 124 px.

**Contents:** `styles.styleGalleryList(doc)` (see the styles spec). Rebuilt on `doc:loaded`.
If the styles module fails, the gallery stays empty and nothing else breaks.

**Thumbnail** (`styleThumb`)

* Button 58×46, 1 px `#C8C6C4` border, radius 2, white, padding 2, column, centred, gap 1.
* Sample text "AaBbCc", drawn with the resolved character format of the style
  (`resolveStyle(doc, id).char`):
  * family = `ch.font` or Aptos;
  * size px = `clamp(round((ch.size or 11) * 0.72), 9, 13)`;
  * colour = `ch.color` (`auto` means black);
  * bold, italic, underline (any value other than `none`).
* Style name: 9 px, `#605E5C`, max width 54, ellipsis.
* Tooltip: the style name, or its id.
* Click fires `style {id}`.
* Active: border `#185ABD`, background `#EDEBE9`.

### 4.12 Insert-table grid

Defined at `rb:1372-1423` and `rcss:685-726`.

**Panel:** padding 8, white, 1 px `#C8C6C4` border, menu shadow, radius 3.

**Title**

* 12 px, centred, margin-bottom 6.
* Text "Insertar tabla", or `"Tabla de {cols} × {rows}"` while hovering.

**Grid**

* **10 columns × 8 rows** of 18×18 cells, gap 2.
* Cells: 1 px `#C8C6C4` border, white.
* Hovering cell (r, c) highlights every cell with `row ≤ r` and `col ≤ c`: background
  `#D5E1F2`, accent border.
* Leaving the grid resets the highlight.

**Actions**

* Click a cell: close, then fire `insert:table {rows:r, cols:c}`.
* Footer button "Insertar tabla…" (full width, top border, 12 px, left-aligned): fires
  `insert:table-dialog`.

---

## 5. Complete ribbon inventory

Column key for the tables in this section:

* **Type:** S = small, SM = small with menu, SP = split, B = big, BS = big split, M = medium,
  M▾ = medium with menu, MD = medium with dropdown panel, C = combo, N = spin box,
  CB = checkbox, G = gallery.
* **T?** means the control is a toggle; its key is given.
* Menu items are listed as "label [icon] → command {params}".

### 5.1 INICIO (`rb:966-1195`)

#### Group "Portapapeles" (no launcher)

| Control | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Pegar (top half) | BS | `paste` | "Pegar (Ctrl+V)" | `paste` |
| Pegar ▾ (bottom half, label "Pegar") | BS | – | "Opciones de pegado" | Menu (below) |
| Cortar | S | `cut` | "Cortar (Ctrl+X)" | `cut` |
| Copiar | S | `copy` | "Copiar (Ctrl+C)" | `copy` |
| Copiar formato | S, T? `format-painter` | `format-painter` | "Copiar formato — doble clic para aplicarlo varias veces (Esc para salir)" | click: `format-painter`; double-click: `format-painter {sticky:true}` |

"Opciones de pegado" menu:

* "Pegar" [paste], shortcut "Ctrl+V" → `paste`
* "Mantener solo texto" [clear-format] → `paste`

**Pitfall:** "Mantener solo texto" fires a normal `paste`. There is no plain-text paste.
**[NATIVE NOTE]** Implement a real plain-text paste with a new id such as `paste:text`.

Layout: the big split button, then a column of the 3 small buttons.

#### Group "Fuente" (launcher → `font-dialog`)

Row 1:

| Control | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Font name | C (128 px), default "Aptos" | – | "Fuente" | `font-name {name}` |
| Font size | C (48 px), default "11" | – | "Tamaño de fuente" | `font-size {pt}` |
| Aumentar tamaño | S | `font-grow` | "Aumentar tamaño de fuente (Ctrl+Mayús+>)" | `font-grow` |
| Disminuir tamaño | S | `font-shrink` | "Disminuir tamaño de fuente (Ctrl+Mayús+<)" | `font-shrink` |
| Borrar formato | S | `clear-format` | "Borrar todo el formato" | `clear-format` |

Row 2:

| Control | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Negrita | S, T? `bold` | `bold` ("N") | "Negrita (Ctrl+N)" | `bold` |
| Cursiva | S, T? `italic` | `italic` ("K") | "Cursiva (Ctrl+K)" | `italic` |
| Subrayado | SP, T? `underline` | `underline` ("S") | "Subrayado (Ctrl+S)" | main: `underline`; arrow: menu (below) |
| Tachado | S, T? `strike` | `strike` | "Tachado" | `strike` |
| Subíndice | S, T? `sub` | `sub` | "Subíndice (Ctrl+=)" | `sub` |
| Superíndice | S, T? `sup` | `sup` | "Superíndice (Ctrl+Mayús+=)" | `sup` |
| (vsep) | | | | |
| Resaltado | SP | `highlight` (yellow bar) | "Color de resaltado del texto" | main: `highlight {color:lastHighlight}`; arrow: highlight palette → `highlight {color:hex or null}` |
| Color de fuente | SP | `fontcolor` (red bar) | "Color de fuente" | main: `font-color {color:lastFont}`; arrow: Office palette, special "Automático" → `font-color {color:'auto'}`, a swatch → `font-color {color:'#RRGGBB'}` |

Underline arrow menu (`rb:93-99`):

| Label | Icon | Command |
|---|---|---|
| "Subrayado sencillo" | underline | `underline {style:'single'}` |
| "Subrayado doble" | underline | `underline {style:'double'}` |
| "Solo palabras" | underline | `underline {style:'words'}` |
| "Subrayado punteado" | underline | `underline {style:'dotted'}` |
| "Sin subrayado" | close | `underline {style:'none'}` |

Last-colour rules:

* Picking "Automático" stores black as the last font colour and paints a black bar.
* Picking "Sin color" in the highlight palette does not change the last highlight colour.

#### Group "Párrafo" (launcher → `paragraph-dialog`)

Row 1:

| Control | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Viñetas | SP, T? `bullets` | `bullets` | "Viñetas" | main: `bullets`; arrow: list gallery "Biblioteca de viñetas" → `bullets {listId}` |
| Numeración | SP, T? `numbering` | `numbering` | "Numeración" | main: `numbering`; arrow: "Biblioteca de numeración" → `numbering {listId}` |
| Lista multinivel | SP, T? `multilevel` | `multilevel` | "Lista multinivel" | main: `multilevel`; arrow: "Biblioteca de listas" → `multilevel {listId}` |
| (vsep) | | | | |
| Disminuir sangría | S | `indent-dec` | "Disminuir sangría (Ctrl+Mayús+M)" | `indent:dec` |
| Aumentar sangría | S | `indent-inc` | "Aumentar sangría (Ctrl+M)" | `indent:inc` |

Row 2:

| Control | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Izquierda | S, T? | `align-left` | "Alinear a la izquierda (Ctrl+L)" | `align:left` |
| Centrar | S, T? | `align-center` | "Centrar (Ctrl+E)" | `align:center` |
| Derecha | S, T? | `align-right` | "Alinear a la derecha (Ctrl+R)" | `align:right` |
| Justificar | S, T? | `align-justify` | "Justificar (Ctrl+J)" | `align:justify` |
| (vsep) | | | | |
| Interlineado | SM | `line-spacing` | "Espaciado entre líneas y párrafos" | Menu (below) |

Interlineado menu (`rb:1130-1145`; `PARA_SPACE` = 240 twips = 12 pt):

1. "1,0" [line-spacing] → `line-spacing {line:240}`
2. "1,15" [line-spacing] → `line-spacing {line:276}`
3. "1,5" [line-spacing] → `line-spacing {line:360}`
4. "2,0" [line-spacing] → `line-spacing {line:480}`
5. separator
6. "Agregar espacio antes del párrafo" → `space-before {tw:240}`
7. "Quitar espacio antes del párrafo" → `space-before {tw:0}`
8. "Agregar espacio después del párrafo" → `space-after {tw:240}`
9. "Quitar espacio después del párrafo" → `space-after {tw:0}`
10. separator
11. "Opciones de interlineado…" [line-spacing] → `paragraph-dialog`

#### Group "Estilos" (no launcher)

The style gallery (G, §4.11) followed by the column of prev/next buttons. Firing:
`style {id}`.

#### Group "Edición" (no launcher; a column of 3 medium buttons)

| Label | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Buscar | M | `find` | "Buscar (Ctrl+F)" | `find` |
| Reemplazar | M | `replace` | "Reemplazar (Ctrl+H)" | `replace` |
| Seleccionar | M▾ | `select` | "Seleccionar" | Menu: "Seleccionar todo", shortcut "Ctrl+A" → `select-all` |

### 5.2 INSERTAR (`rb:1206-1369`)

Disabled "soon" buttons (`rb:1210-1214`) are medium buttons. Their tooltip is
`"{label} — {reason}"`.

#### Group "Páginas" (column)

| Label | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Portada | M▾ | `cover-page` | "Insertar una portada al principio del documento" | Menu (below) |
| Página en blanco | M | `blank-page` | "Insertar una página en blanco" | `insert:blank-page` |
| Salto de página | M | `page-break` | "Salto de página (Ctrl+Entrar)" | `insert:page-break` |

Portada menu:

* "Simple" [cover-page] → `insert:cover {design:'simple'}`
* "Austin" [cover-page] → `insert:cover {design:'austin'}`
* "Faceta" [cover-page] → `insert:cover {design:'faceta'}`
* separator
* "Portada personalizada…" [cover-page] → `insert:cover-dialog`

#### Group "Tablas"

| Label | Type | Icon | Tooltip | Action |
|---|---|---|---|---|
| Tabla | B | `table` | "Insertar tabla" | Opens the insert-table grid dropdown (§4.12) |

#### Group "Ilustraciones" (two columns)

| Label | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Imágenes | M▾ | `image` | "Insertar una imagen" | Menu (below) |
| Formas | M, disabled | `shapes` | "Formas — fuera del alcance de la v1 (roadmap v1.1)" | – |
| Iconos | M, disabled | `icons` | "Iconos — fuera del alcance de la v1" | – |
| SmartArt | M | `smartart` | "Insertar un diagrama SmartArt (lista, proceso, ciclo o jerarquía)" | `insert:smartart-dialog` |

Imágenes menu:

* "Este dispositivo…" [pc] → `insert:image`
* "Imágenes en línea…" [image], disabled

#### Group "Vínculos" (column)

| Label | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Vínculo | M | `link` | "Insertar hipervínculo (Ctrl+Alt+K)" | `insert:hyperlink` |
| Marcador | M | `bookmark` | "Crear o localizar un marcador" | `insert:bookmark` |
| Referencia cruzada | M, disabled | `cross-reference` | "Referencia cruzada — previsto para la v1.1" | – |

#### Group "Comentarios"

| Label | Type | Icon | Tooltip |
|---|---|---|---|
| Comentario | M, disabled | `comment` | "Comentario — llega con la fase de Revisión" |

Comments actually work through Revisar → Nuevo comentario. This button stays disabled.

#### Group "Encabezado y pie" (column)

| Label | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Encabezado | M▾ | `header-footer` | "Editar el encabezado de la página" | Menu (below) |
| Pie de página | M▾ | `header-footer` | "Editar el pie de página" | Menu (below) |
| Número de página | M▾ | `page` | "Insertar números de página" | Menu (below) |

Encabezado menu:

* "Editar encabezado" [header-footer] → `insert:header`
* "Quitar encabezado" [close] → `remove:header`

Pie de página menu:

* "Editar pie de página" [header-footer] → `insert:footer`
* "Quitar pie de página" [close] → `remove:footer`

Número de página menu:

* "Principio de página (centrado)" [page] → `insert:page-number {where:'header', align:'center'}`
* "Principio de página (derecha)" [page] → `insert:page-number {where:'header', align:'right'}`
* "Final de página (centrado)" [page] → `insert:page-number {where:'footer', align:'center'}`
* "Final de página (derecha)" [page] → `insert:page-number {where:'footer', align:'right'}`
* separator
* "Página X de Y (pie, centrado)" [page] → `insert:page-number {where:'footer', align:'center', style:'x-de-y'}`
* "Quitar números de página" [close] → `remove:page-number`

#### Group "Texto" (two columns)

| Label | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Cuadro de texto | M, disabled | `textbox` | "Cuadro de texto — necesita objetos flotantes (v1.1)" | – |
| Elementos rápidos | M, disabled | `quick-parts` | "Elementos rápidos — previsto para la v1.1" | – |
| WordArt | M▾ | `wordart` | "Insertar texto decorativo" | Menu: one item per WordArt preset (below) |
| Letra capital | M▾ | `drop-cap` | "Letra capital del párrafo actual" | Menu (below) |
| Fecha y hora | M | `date-time` | "Insertar la fecha o la hora" | `insert:datetime` |

WordArt menu: one item per preset, each with icon `wordart`, firing
`insert:wordart {preset:id}` (`js/editor/wordart.js:28+`):

| id | Label |
|---|---|
| `azul` | Relleno azul |
| `degradado` | Degradado cálido |
| `contorno` | Contorno |
| `neon` | Neón |
| `metal` | Metálico |
| `sombra` | Sombra larga |
| `arcoiris` | Arcoíris |

Letra capital menu:

* "Ninguna" [close] → `dropcap {type:'none'}`
* "En texto" [drop-cap] → `dropcap {type:'in-text', lines:3}`
* "En margen" [drop-cap] → `dropcap {type:'in-margin', lines:3}`

#### Group "Símbolos" (column)

| Label | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Ecuación | M▾ | `equation` | "Insertar una ecuación" | Menu (below) |
| Símbolo | M▾ | `symbol` | "Insertar un símbolo" | Menu (below) |

Ecuación menu: one item per gallery entry, each with icon `equation`, firing
`insert:equation {src}`. Gallery (`js/math/math.js:633-641`):

| Label | src |
|---|---|
| Fórmula cuadrática | `x = (-b +- sqrt(b^2 - 4 a c))/(2 a)` |
| Teorema de Pitágoras | `a^2 + b^2 = c^2` |
| Área del círculo | `A = pi r^2` |
| Cuadrado del binomio | `(a + b)^2 = a^2 + 2 a b + b^2` |
| Identidad de Euler | `e^(i pi) + 1 = 0` |
| Suma de Gauss | `sum_(k=1)^(n) k = (n (n + 1))/2` |
| Interés compuesto | `C = C_0 (1 + r/n)^(n t)` |

After the gallery: separator, then "Insertar nueva ecuación…" [equation] →
`insert:equation-dialog`.

Símbolo menu:

* 16 items whose label is the character itself, with no icon, each firing
  `insert:symbol {char}`:
  `€ £ © ® ™ ± ≠ ≤ ≥ ÷ × ° µ ¶ § …`
* separator
* "Más símbolos…" [symbol] → `insert:symbol-dialog`

### 5.3 DIBUJAR (`rb:1446-1504`)

#### Group "Herramientas"

Row of small toggles. Each fires `draw:tool {tool}`; the toggle key equals the tool.

| Tooltip | Icon | Tool |
|---|---|---|
| "Seleccionar (desactiva la tinta)" | `select` | `none` |
| "Selección de lazo" | `lasso` | `lasso` |
| "Borrador" | `eraser` | `eraser` |

Second row: medium button "Borrar selección" [close], tooltip "Eliminar los trazos
seleccionados" → `draw:delete`.

#### Group "Plumas"

| Label | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Lápiz | SP, T? `pen` | `pen` | "Lápiz" | main: `draw:tool {tool:'pen'}`; arrow: Office palette with special "Negro" (black) → `draw:pen {color: c or '#000000'}` |
| Marcador de resaltado | SP, T? `highlighter` | `highlighter-pen` | "Marcador de resaltado" | main: `draw:tool {tool:'highlighter'}`; arrow: highlight palette → `draw:highlighter {color: c or '#FFFF00'}` |
| Grosor | M▾ (in a column) | `line-spacing` | "Grosor del trazo" | Menu: "1 px", "2 px", "3 px", "5 px", "8 px", "12 px", "16 px" → `draw:width {width}` |

#### Group "Tinta" (column)

| Label | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Borrar esta página | M | `eraser` | "Quitar toda la tinta de la página actual" | `draw:clear-page` |
| Borrar todo | M | `close` | "Quitar la tinta de todo el documento" | `draw:clear-all` |

Canvas cursors while inking (`ccss:442-445`):

* crosshair in general;
* `cell` with the eraser;
* `copy` with the lasso.

The caret is hidden while inking.

### 5.4 DISEÑO (`rb:1799-1913`)

#### Group "Formato del documento"

**Temas** (B, icon `theme`, tooltip "Tema del documento: fuentes y colores"). Menu: one item
per theme, icon `theme`, firing `design:theme {id}` (`rb:130-137`, `main:1645-1652`):

| id | Label | Major / minor font | accent1–6 |
|---|---|---|---|
| `office` | Office | Aptos Display / Aptos | `#4472C4 #ED7D31 #A5A5A5 #FFC000 #5B9BD5 #70AD47` |
| `clasico` | Clásico | Cambria / Calibri | `#1F497D #C0504D #9BBB59 #8064A2 #4BACC6 #F79646` |
| `editorial` | Editorial | Georgia / Georgia | `#7A5C3E #B07D48 #8E9B6C #4E6E81 #A34E4E #6B5B95` |
| `moderno` | Moderno | Segoe UI / Segoe UI | `#0F6CBD #00838F #7B61FF #D83B01 #107C10 #5C2E91` |
| `tecnico` | Técnico | Arial / Arial | `#003A70 #0078D4 #505050 #8C8C8C #C43E1C #498205` |
| `academico` | Académico | Times New Roman / Times New Roman | `#2F5496 #833C0C #375623 #7B2E2E #525252 #3B3838` |

**Spacing gallery** (G). Holds the first **5** entries of `PARA_SPACING_SETS` (`rb:145-153`).
Values are in twips; `line` is in 1/240.

| id | Name | before | after | line |
|---|---|---|---|---|
| `default` | Predeterminado | 0 | 160 | 276 |
| `none` | Sin espacio de párrafo | 0 | 0 | 240 |
| `compact` | Compacto | 0 | 80 | 240 |
| `tight` | Ajustado | 0 | 120 | 276 |
| `open` | Abierto | 0 | 200 | 360 |
| `relaxed` | Suelto | 0 | 120 | 360 |
| `double` | Doble | 0 | 160 | 480 |

Gallery details:

* Container: max width 250, gap 4.
* Thumbnails: 56×46, `#C8C6C4` border, padding 4.
  * Three bars 2 px tall, `#B3B0AD`, each with margin-bottom `round(line/240*2)` px.
  * Name: 8 px, `#605E5C`, ellipsis.
* Tooltip `"{name} — interlineado {fmtNum(line/240)}"`.
* Click fires `design:spacing {id}`.

**Column of medium buttons**

| Label | Type | Icon | Tooltip | Action |
|---|---|---|---|---|
| Fuentes | MD | `styles` | "Pareja de fuentes del documento" | Opens the font-set panel (below) |
| Colores | M▾ | `fontcolor` | "Juego de colores del tema" | Menu: the 6 theme names, icon `fontcolor` → `design:colors {id}` |
| Espaciado entre párrafos | M▾ | `line-spacing` | "Espaciado entre párrafos de todo el documento" | Menu: all **7** spacing sets, icon `line-spacing` → `design:spacing {id}` |

**Font-set panel** (`rb:603-634`, `rcss:461-485`). One row per `FONT_SETS` entry
(`js/core/fonts.js:594-629`, 34 entries).

* Row: min width 240, padding 4 10, gap 10.
  * "Aa" in the major font: 22 px, in a 34 px wide box.
  * Two text lines:
    * set name, 12 px;
    * `"{major} · {minor}"`, 12 px, `#605E5C`, ellipsis. Each name is drawn in its own font.
* Tooltip `"{major} (títulos) · {minor} (cuerpo)"`.
* Click fires `design:fonts {id}`.

FONT_SETS (id: major / minor):

| id | Major / minor |
|---|---|
| `aptos` | Aptos Display / Aptos |
| `calibri` | Calibri Light / Calibri |
| `cambria` | Cambria / Cambria |
| `georgia` | Georgia / Georgia |
| `times-arial` | Times New Roman / Arial |
| `garamond` | Garamond / Garamond |
| `verdana` | Verdana / Verdana |
| `office-2010` | Cambria / Calibri |
| `arial` | Arial / Arial |
| `times` | Times New Roman / Times New Roman |
| `candara` | Candara / Candara |
| `century-gothic` | Century Gothic / Century Gothic |
| `constantia` | Constantia / Constantia |
| `corbel` | Corbel / Corbel |
| `franklin-gothic` | Franklin Gothic Medium / Franklin Gothic Book |
| `gill-sans` | Gill Sans MT / Gill Sans MT |
| `tw-cen` | Tw Cen MT / Tw Cen MT |
| `consolas-verdana` | Consolas / Verdana |
| `segoe` | Segoe UI Semibold / Segoe UI |
| `book-antiqua` | Book Antiqua / Book Antiqua |
| `montserrat-open-sans` | Montserrat / Open Sans |
| `playfair-source-sans` | Playfair Display / Source Sans 3 |
| `merriweather-lato` | Merriweather / Lato |
| `raleway-roboto` | Raleway / Roboto |
| `oswald-noto-sans` | Oswald / Noto Sans |
| `lora-nunito-sans` | Lora / Nunito Sans |
| `poppins-inter` | Poppins / Inter |
| `eb-garamond` | EB Garamond / EB Garamond |
| `roboto-slab-roboto` | Roboto Slab / Roboto |
| `baskerville-franklin` | Libre Baskerville / Libre Franklin |
| `cormorant-mulish` | Cormorant Garamond / Mulish |
| `josefin-lato` | Josefin Sans / Lato |
| `work-sans-source-serif` | Work Sans / Source Serif 4 |
| `bebas-open-sans` | Bebas Neue / Open Sans |

Display names (`name`), in the same order as the table:

> Aptos · Calibri · Cambria · Georgia · Times New Roman / Arial · Garamond · Verdana ·
> Office 2007-2010 · Arial · Times New Roman · Candara · Century Gothic · Constantia · Corbel ·
> Franklin Gothic · Gill Sans MT · Tw Cen MT · Consolas / Verdana · Segoe UI · Book Antiqua ·
> Montserrat / Open Sans · Playfair Display / Source Sans · Merriweather / Lato ·
> Raleway / Roboto · Oswald / Noto Sans · Lora / Nunito Sans · Poppins / Inter · EB Garamond ·
> Roboto Slab / Roboto · Libre Baskerville / Libre Franklin · Cormorant Garamond / Mulish ·
> Josefin Sans / Lato · Work Sans / Source Serif · Bebas Neue / Open Sans

The first seven ids are frozen for backward compatibility (`fonts.js:589-593`).

#### Group "Fondo de página"

| Label | Type | Icon | Tooltip | Action |
|---|---|---|---|---|
| Marca de agua | B▾ | `watermark` | "Texto de fondo en todas las páginas" | Menu (below) |
| Color de página | B (opens a dropdown) | `page-color` | "Color de fondo de las páginas" | Office palette with special "Sin color" (white) → `design:page-color {color: hex or null}` |
| Bordes de página | B▾ | `page-borders` | "Borde alrededor de cada página" | Menu (below) |

Marca de agua menu:

* "URGENTE", "CONFIDENCIAL", "BORRADOR", "MUESTRA", "NO COPIAR", "EJEMPLO", each with icon
  `watermark` → `design:watermark {text}`
* separator
* "Marca de agua personalizada…" → `design:watermark-dialog`
* "Quitar marca de agua" [close] → `design:watermark {text:null}`

Bordes de página menu:

* "Continuo" → `design:page-border {style:'solid'}`
* "Doble" → `{style:'double'}`
* "Discontinuo" → `{style:'dashed'}`
* "Punteado" → `{style:'dotted'}`
* "Con relieve" → `{style:'groove'}`
* separator
* "Bordes y sombreado…" → `design:borders-dialog`
* "Sin borde" [close] → `design:page-border {style:'none'}`

### 5.5 DISPOSICIÓN (`rb:1920-2071`)

#### Group "Configurar página" (launcher → `layout:page-dialog`)

**Márgenes** (B▾, icon `margins`, tooltip "Márgenes de la sección"). Menu items carry a `hint`
that the context menu **does not display** (pitfall; **[NATIVE NOTE]** show it as a
secondary line). Each item fires `layout:margins {preset:id, margins:{top,bottom,left,right}}`
with values in twips:

| id | Label | Hint text | top / bottom / left / right |
|---|---|---|---|
| `normal` | Normal | "Sup./Inf. 2,54 cm · Izq./Der. 2,54 cm" | 1440 / 1440 / 1440 / 1440 |
| `estrecho` | Estrecho | "Sup./Inf. 1,27 cm · Izq./Der. 1,27 cm" | 720 / 720 / 720 / 720 |
| `moderado` | Moderado | "Sup./Inf. 2,54 cm · Izq./Der. 1,91 cm" | 1440 / 1440 / 1080 / 1080 |
| `ancho` | Ancho | "Sup./Inf. 2,54 cm · Izq./Der. 5,08 cm" | 1440 / 1440 / 2880 / 2880 |

After the presets: separator, then "Márgenes personalizados…" → `layout:margins-dialog`.

**Orientación** (B▾, icon `orientation`, tooltip "Orientación de la página"):

* "Vertical" [page] → `layout:orientation {orient:'portrait'}`
* "Horizontal" [page] → `layout:orientation {orient:'landscape'}`

**Tamaño** (B▾, icon `page`, tooltip "Tamaño del papel"). Each item fires
`layout:size {name}`:

| name | Label | Twips (w × h), from `units.paperSize` |
|---|---|---|
| `A4` | "A4 · 21 × 29,7 cm" | 11906 × 16838 |
| `Letter` | "Carta · 21,59 × 27,94 cm" | 12240 × 15840 |
| `Legal` | "Oficio · 21,59 × 35,56 cm" | 12240 × 20160 |
| `A3` | "A3 · 29,7 × 42 cm" | 16838 × 23811 |
| `A5` | "A5 · 14,8 × 21 cm" | 8391 × 11906 |
| `B5` | "B5 · 17,6 × 25 cm" | 9979 × 14173 |
| `Executive` | "Ejecutivo · 18,41 × 26,67 cm" | 10440 × 15120 |
| `Tabloid` | "Tabloide · 27,94 × 43,18 cm" | 15840 × 24480 |

`paperSize()` also knows `Oficio` (same as Legal). Unknown names fall back to A4.

After the sizes: separator, then "Más tamaños de papel…" → `layout:size-dialog`.

**Columnas** (B▾, icon `columns`, tooltip "Dividir el texto en columnas"). Each item fires
`layout:columns {preset}`:

* "Una" (`one`)
* "Dos" (`two`)
* "Tres" (`three`)
* "Izquierda" (`left`, ratio 1:2)
* "Derecha" (`right`, ratio 2:1)
* separator
* "Más columnas…" → `layout:columns-dialog`

**Saltos** (B▾, icon `page-break`, tooltip "Saltos de página y de sección"):

* "Página", shortcut "Ctrl+Entrar" [page-break] → `insert:page-break`
* "Columna" [columns] → `insert:column-break`
* "Ajuste del texto", shortcut "Mayús+Entrar" [page-break] → `insert:line-break`
* separator
* "Sección: página siguiente" [page] → `insert:section-break {start:'nextPage'}`
* "Sección: continua" → `{start:'continuous'}`
* "Sección: página par" → `{start:'evenPage'}`
* "Sección: página impar" → `{start:'oddPage'}`

**Guiones** (M▾, in a column, icon `text-effects`, tooltip "Partir las palabras al final de
la línea"):

* "Ninguno" [close] → `layout:hyphenation {mode:'none'}`
* "Automático" [check] → `layout:hyphenation {mode:'auto'}`

#### Group "Párrafo" (launcher → `paragraph-dialog`)

Two columns of spin boxes (§4.5):

| Label | Tooltip | Default | Step | Min | Max | Unit | Command |
|---|---|---|---|---|---|---|---|
| "Izquierda:" | "Sangría izquierda" | 0 | 0.25 | 0 | 55 | " cm" | `layout:indent {left: cm}` |
| "Derecha:" | "Sangría derecha" | 0 | 0.25 | 0 | 55 | " cm" | `layout:indent {right: cm}` |
| "Antes:" | "Espacio antes del párrafo" | 0 | 6 | 0 | 1584 | " pt" | `space-before {tw: round(pt*20)}` |
| "Después:" | "Espacio después del párrafo" | 8 | 6 | 0 | 1584 | " pt" | `space-after {tw: round(pt*20)}` |

#### Group "Organizar" (column)

**Ajustar texto** (M▾, icon `align-justify`, tooltip "Ajuste del texto alrededor de la imagen
seleccionada"):

* "En línea con el texto" [align-left] → `image:wrap {wrap:'inline'}`
* "Cuadrado" [align-justify] → `{wrap:'square'}`
* "Arriba y abajo" [align-center] → `{wrap:'topAndBottom'}`
* "Detrás del texto" [image] → `{wrap:'behind'}`
* "Delante del texto" [image] → `{wrap:'front'}`

**Alinear** (M▾, icon `align-left`, tooltip "Alineación de la imagen seleccionada"):

* "Alinear a la izquierda" [align-left] → `image:align {align:'left'}`
* "Centrar" [align-center] → `{align:'center'}`
* "Alinear a la derecha" [align-right] → `{align:'right'}`

**Posición** (M▾, icon `shapes`, tooltip "Posición de la imagen en la página"):

* "En línea con el texto" [image] → `image:wrap {wrap:'inline'}`
* "Arriba a la izquierda" [image] → `image:position {h:'left', v:'top'}`
* "Arriba centrado" [image] → `{h:'center', v:'top'}`
* "Arriba a la derecha" [image] → `{h:'right', v:'top'}`

### 5.6 REFERENCIAS (`rb:1568-1666`)

#### Group "Tabla de contenido"

**Tabla de contenido** (B▾, icon `toc`, tooltip "Insertar una tabla de contenido a partir de
los títulos"):

* "Tabla automática (3 niveles)" → `ref:toc {levels:3}`
* "Tabla automática (2 niveles)" → `ref:toc {levels:2}`
* "Tabla sin números de página" → `ref:toc {levels:3, showPages:false}`
* separator
* "Quitar tabla de contenido" [close] → `ref:toc-remove`

**Agregar texto** (M▾, icon `styles`, tooltip "Marcar el párrafo como título para que salga en
la tabla"):

* "Título 1" → `style {id:'Heading1'}`
* "Título 2" → `style {id:'Heading2'}`
* "Título 3" → `style {id:'Heading3'}`
* "No mostrar en la tabla" [close] → `style {id:'Normal'}`

**Actualizar tabla** (M, icon `redo`, tooltip "Recalcular títulos y páginas") →
`ref:toc-update`.

#### Group "Notas al pie" (launcher → `ref:notes-dialog`; column)

| Label | Icon | Tooltip | Command |
|---|---|---|---|
| Insertar nota al pie | `footnote` | "Nota al final de la página (Alt+Ctrl+O)" | `ref:footnote` |
| Insertar nota al final | `footnote` | "Nota al final del documento" | `ref:endnote` |
| Siguiente nota | `chevron-right` | "Ir a la nota siguiente" | `ref:next-note` |

#### Group "Citas y bibliografía" (two columns)

| Label | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Insertar cita | M | `citation` | "Citar una fuente en el texto" | `ref:citation` |
| Administrar fuentes | M | `book` | "Alta, edición y borrado de fuentes" | `ref:sources` |
| Bibliografía | M▾ | `book` | "Insertar la lista de fuentes" | Menu (below) |
| Estilo | M▾ | `styles` | "Estilo de las citas y de la bibliografía" | Menu: "APA", "MLA", "Chicago", "ISO690" → `ref:citation-style {style}` |

Bibliografía menu:

* "Bibliografía" → `ref:bibliography {title:'Bibliografía'}`
* "Referencias" → `{title:'Referencias'}`
* "Obras citadas" → `{title:'Obras citadas'}`

#### Group "Títulos" (column)

**Insertar título** (M▾, icon `caption`, tooltip "Rotular una figura, una tabla o una
ecuación"):

* "Figura" [caption] → `ref:caption {label:'figura'}`
* "Tabla" [table] → `{label:'tabla'}`
* "Ecuación" [equation] → `{label:'ecuacion'}`

**Tabla de ilustraciones** (M▾, icon `index`, tooltip "Índice de figuras, tablas o
ecuaciones"):

* "De figuras" → `ref:figure-table {label:'figura'}`
* "De tablas" → `{label:'tabla'}`
* "De ecuaciones" → `{label:'ecuacion'}`

**Referencia cruzada** (M, icon `cross-reference`, tooltip "Enlazar con un título o un
marcador") → `ref:cross`.

#### Group "Índice" (column)

| Label | Icon | Tooltip | Command |
|---|---|---|---|
| Marcar entrada | `bookmark` | "Marcar la selección para el índice (Alt+Mayús+X)" | `ref:index-mark` |
| Insertar índice | `index` | "Insertar el índice alfabético" | `ref:index` |
| Actualizar índice | `redo` | "Recalcular las páginas del índice" | `ref:index-update` |

### 5.7 CORRESPONDENCIA (`rb:1510-1562`)

#### Group "Crear"

| Label | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Sobres | B | `envelope` | "Crear un sobre" | `mail:envelope` |
| Etiquetas | B | `labels` | "Crear una hoja de etiquetas" | `mail:labels` |

#### Group "Iniciar combinación"

**Iniciar combinación** (B▾, icon `mail-merge`, tooltip "Tipo de documento que se va a
combinar"):

* "Cartas" [word] → `mail:start {kind:'letters'}`
* "Mensajes de correo" [envelope] → `mail:start {kind:'email'}`
* "Sobres" [envelope] → `mail:envelope`
* "Etiquetas" [labels] → `mail:labels`
* "Directorio" [table] → `mail:start {kind:'directory'}`

Column of medium buttons:

| Label | Icon | Tooltip | Command |
|---|---|---|---|
| Seleccionar destinatarios | `table` | "Pegar o cargar la lista de destinatarios" | `mail:recipients` |
| Editar lista | `table` | "Ver y editar los destinatarios" | `mail:edit-list` |

#### Group "Escribir e insertar campos" (column)

| Label | Icon | Tooltip | Command |
|---|---|---|---|
| Bloque de direcciones | `envelope` | "Insertar el bloque de dirección" | `mail:address-block` |
| Línea de saludo | `textbox` | "Insertar la línea de saludo" | `mail:greeting` |
| Insertar campo combinado | `quick-parts` | "Insertar un campo de la lista" | `mail:field` |

#### Group "Vista previa" (column)

| Label | Icon | Tooltip | Command |
|---|---|---|---|
| Vista previa de resultados | `find` | "Ver el documento con los datos del primer destinatario" | `mail:preview` |
| Destinatario siguiente | `chevron-right` | "Ver el siguiente destinatario" | `mail:preview-next` |
| Destinatario anterior | `chevron-left` | "Ver el destinatario anterior" | `mail:preview-prev` |

#### Group "Finalizar"

**Finalizar y combinar** (B▾, icon `check`, tooltip "Generar el documento combinado"):

* "Editar documentos individuales" [word] → `mail:finish {mode:'document'}`
* "Imprimir documentos" [print] → `mail:finish {mode:'print'}`

### 5.8 REVISAR (`rb:1672-1793`)

#### Group "Revisión"

| Label | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Ortografía y gramática | B | `spellcheck` | "Revisar ortografía, puntuación, espaciado y signos de apertura (F7)" | `review:proofing` (toggles the proof pane) |
| Contar palabras | B | `word-count` | "Palabras, caracteres, párrafos y líneas" | `review:word-count` |
| Ortografía mientras escribe | CB, default ✓ | – | – | `review:spelling-live {on}` |
| Leer en voz alta | M | `translate` | "Leer el documento en voz alta" | `review:read-aloud` |
| Detener lectura | M | `close` | "Detener la lectura" | `review:read-stop` |

The last three controls sit in one column.

#### Group "Idioma"

| Label | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Idioma | M | `language` | "Idioma de revisión del documento" | `review:language` |

#### Group "Comentarios"

| Label | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Nuevo comentario | B | `comment` | "Comentar el texto seleccionado" | `comment:new` |
| Eliminar | M | `close` | "Eliminar el comentario seleccionado" | `comment:delete` |
| Anterior | M | `chevron-left` | "Comentario anterior" | `comment:prev` |
| Siguiente | M | `chevron-right` | "Comentario siguiente" | `comment:next` |
| Mostrar comentarios | M | `comment` | "Abrir o cerrar el panel de comentarios" | `comment:pane` |
| Eliminar todos | M | `close` | "Eliminar todos los comentarios" | `comment:delete-all` |

Layout: the big button, then a column (Eliminar, Anterior, Siguiente), then a column
(Mostrar comentarios, Eliminar todos).

#### Group "Seguimiento"

| Label | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Control de cambios | B | `track-changes` | "Marcar todo lo que se escriba o se borre" | `review:track` |
| (small duplicate) | S, T? `track-changes` (never updated, §4.6) | `track-changes` | "Control de cambios (Ctrl+Mayús+E)" | `review:track` |
| Mostrar marcas | M | `find` | "Ver el documento con o sin las marcas de revisión" | `review:show-marks` |

#### Group "Cambios" (column)

**Aceptar** (M▾, icon `check`, tooltip "Aceptar los cambios"):

* "Aceptar este cambio" [check] → `review:accept`
* "Aceptar todos los cambios" [check] → `review:accept-all`

**Rechazar** (M▾, icon `close`, tooltip "Rechazar los cambios"):

* "Rechazar este cambio" [close] → `review:reject`
* "Rechazar todos los cambios" [close] → `review:reject-all`

#### Group "Comparar"

| Label | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Comparar | B | `compare` | "Comparar con otra versión guardada" | `review:compare` |

#### Group "Proteger"

| Label | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Restringir edición | B | `protect` | "Limitar lo que se puede modificar" | `review:protect` |

### 5.9 VISTA (`rb:2073-2141`)

#### Group "Vistas"

| Label | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Modo de lectura | B (active when mode = read) | `read-mode` | "Leer a pantalla completa (Esc para salir)" | `view:mode {mode:'read'}` |
| Diseño de impresión | B (active by default) | `print-layout` | "Ver las páginas tal como se imprimirán" | `view:mode {mode:'print'}` |
| Diseño web | B | `web-layout` | "Ver el documento como una página web continua" | `view:mode {mode:'web'}` |

#### Group "Mostrar"

Two columns of checkboxes:

| Label | Default | Command |
|---|---|---|
| "Regla" | ✓ | `view:ruler {on}` |
| "Líneas de cuadrícula" | ☐ | `view:gridlines {on}` |
| "Panel de navegación" | ☐ | `view:navigation {on}` |
| "Marcas de párrafo" | ☐ | `view:marks {on}` |

Column 1 holds Regla and Líneas de cuadrícula; column 2 holds the other two.

#### Group "Zoom"

**Zoom** (B▾, icon `zoom`, tooltip "Nivel de zoom"):

* "50 %", "75 %", "100 %", "125 %", "150 %", "200 %", "400 %" → `zoom:set {value}`
* separator
* "Ancho de página" [zoom] → `zoom:fit {fit:'width'}`
* "Página completa" [zoom] → `zoom:fit {fit:'page'}`
* "Restablecer al 100 %" [zoom] → `zoom:reset`

**100 %** (B, icon `zoom-out`, tooltip "Restablecer el zoom al 100 % (Ctrl+0)") → `zoom:reset`.

Column of small buttons:

* `zoom-in`, tooltip "Acercar" → `zoom:in`
* `zoom-out`, tooltip "Alejar" → `zoom:out`

Column of medium buttons:

| Label | Icon | Tooltip | Command |
|---|---|---|---|
| Una página | `onepage` | "Ajustar una página completa" | `zoom:fit {fit:'page'}` |
| Varias páginas | `multipage` | "Ver dos páginas a la vez" | `zoom:fit {fit:'multi'}` |
| Ancho de página | `ruler` | "Ajustar al ancho de la ventana" | `zoom:fit {fit:'width'}` |

#### Group "Ventana" (column)

| Label | Icon | Tooltip | Command |
|---|---|---|---|
| Nueva ventana | `new-file` | "Abrir otra vista del mismo documento" | `window:new` |
| Cambiar ventanas | `folder` | "Abrir otro documento guardado" | `window:switch` (opens backstage "Abrir") |

### 5.10 AYUDA (`rb:1426-1440`)

#### Group "Ayuda"

| Label | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Ayuda | B | `help` | "Guía rápida y atajos de teclado (F1)" | `help:open` |
| Atajos de teclado | B | `book` | "Lista completa de atajos" | `help:shortcuts` |
| Novedades | M | `check` | "Qué se ha añadido en esta versión" | `help:whats-new` |
| Acerca de Skriba | M | `word` | "Versión y créditos" | `help:about` |

The two medium buttons sit in one column.

#### Group "Comentarios"

| Label | Type | Icon | Tooltip | Command |
|---|---|---|---|---|
| Enviar comentarios | M | `comment` | "Contar qué te ha parecido" | `help:feedback` |

### 5.11 Dead code

`PLACEHOLDER_TABS` and `buildPlaceholder` (`rb:207-265`, `rb:2161-2177`) are **unused**
leftovers from v0.1. All ten tabs are now real. Do not port them.

---

## 6. Backstage ("Archivo")

Source: `bs` (whole file). Base styles come from `dcss:367-526`; additional styles are injected
in a CSS layer at `bs:831-1000`.

**CSS precedence pitfall:** rules that are not in a layer beat rules inside a layer. The
**effective** values given below already account for that.

### 6.1 Frame

* Covers the whole window, z 6000, white background, flex row.
* Entry animation: 0.12 s ease-out, opacity from .4 to 1 and a translateY from 6 px to 0.
* Opened by `file:backstage` (section `inicio`) and `window:switch` (section `abrir`).
* Closed by Escape (captured at document level), the back arrow, or the "Cerrar" navigation
  item.
* On close, focus returns to the canvas and pending asynchronous renders are invalidated with
  a token (`bs:793-805`).
* On open, focus moves to the back button.

**Left navigation**

* 230 px wide, background `#2B579A`, white text, scrolls vertically.
* Padding: 12 px top, 16 px bottom. Gap between items: 2 px.

**Back button**

* 34×34 circle, margin 4 0 18 14, filled `rgba(255,255,255,.16)`; hover `.28`.
* Icon `chevron-left`. Tooltip and accessible label: "Atrás".

**Navigation item**

* 14 px text, left-aligned, padding 9 16 9 24, a transparent 3 px left border.
* Hover: `rgba(255,255,255,.12)`.
* Selected: `rgba(255,255,255,.20)`, white left border, weight 600.
* Focus ring: 2 px white, inset 2.

**Right panel**

* White, padding **40 56**, scrolls. Scroll resets to top whenever the section changes.

**Typography in the panel**

| Element | Size | Weight | Colour | Margin | Other |
|---|---|---|---|---|---|
| H1 | 26 | 600 | `#201F1E` | 0 0 16 | letter-spacing −.2 |
| H2 | 15 | 600 | `#323130` | 22 0 8 | |
| Body text (`bs-text`) | 13 | | `#605E5C` | 0 0 12 | |
| Hint (`bs-hint`) | 13 | | `#605E5C` | | padding 14 2 |

**Panel buttons (`bs-btn`)**

* 13 px, padding 6 16, min height 30, radius 2, 1 px `#8A8886` border, white.
  Hover `#EDEBE9`.
* Primary: accent background with white text; hover `#1349A0`.

**Link-buttons (`bs-link`)**: 12.5 px, accent colour, underline on hover.

### 6.2 Navigation entries

The normal menu (`bs:64-74`):

| id | Label | Behaviour |
|---|---|---|
| `inicio` | Inicio | Shows the panel |
| `nuevo` | Nuevo | Shows the panel |
| `abrir` | Abrir | Shows the panel |
| `guardar` | Guardar | **Action:** emits `save` (saves, then closes the backstage). Has no panel. |
| `guardar-como` | Guardar como | Shows the panel |
| `imprimir` | Imprimir | Shows the panel |
| `exportar` | Exportar | Shows the panel |
| `cerrar` | Cerrar | **Action:** emits `close` and closes the backstage |
| `cuenta` | Cuenta | Shows the panel |

**Shared-document variants** (`bs:80-94`) apply when the document was opened by link without
an account:

* `ver`: "Guardar una copia", "Imprimir", "Exportar", "Cerrar".
* `editar`: "Guardar" (action), "Guardar una copia", "Imprimir", "Exportar", "Cerrar".

In these variants the initial section is the first entry that has a panel. Invalid section
ids fall back to it.

**Section aliases accepted by `open()`** (`bs:100-111`):

* `inicio`: `home`, `""`
* `nuevo`: `new`
* `abrir`: `open`
* `guardar`: `save`
* `guardar-como`: `guardar como`, `save-as`, `saveas`
* `guardar-copia`: `guardar una copia`, `save-copy`
* `imprimir`: `print`
* `exportar`: `export`
* `cerrar`: `close`
* `cuenta`: `account`

The `guardar` alias exists, and if it is shown, it renders a "Guardar" panel (§6.6).

**[NOT IMPLEMENTED]** Word pages that Skriba does not have: "Información", "Compartir"
(sharing lives in the title-bar button), "Opciones", "Historial de versiones".
**[NATIVE NOTE]** If you add them, keep the same visual style. Do not invent behaviour that
the format cannot store.

### 6.3 "Inicio" panel

Built at `bs:529-547`.

1. H1 "Inicio".
2. H2 "Nuevo", then a template gallery: the "Documento en blanco" card followed by the
   **featured** templates (`destacada: true`).
3. Link-button "Más plantillas →": goes to the "Nuevo" section.
4. A two-column grid (gap 0 40). It becomes one column when the window is narrower than
   1180 px.
   * Column 1: H2 "Recientes" and the file list (§6.5).
   * Column 2: H2 "Compartidos" and the shared-documents list (§6.5).

### 6.4 "Nuevo" panel and template gallery

Built at `bs:553-588` and `bs:337-373`.

**Contents**

1. H1 "Nuevo".
2. Text: "Elige una plantilla: el documento nuevo se abre con la estructura y los textos de
   ejemplo listos para reemplazar."
3. **Category chips**:
   * "Todas", then the categories from `TEMPLATE_CATEGORIES` (`js/core/templates.js:47-53`):

     | id | Label |
     |---|---|
     | `cartas` | Cartas y comunicaciones |
     | `comercial` | Comercial |
     | `informes` | Informes y actas |
     | `academico` | Académico |
     | `personal` | Personal y otros |

   * Chip style: 12.5 px, padding 4 12, radius 14, 1 px `#C8C6C4` border, white.
     Hover `#EDEBE9`.
   * Selected chip: accent background, white text, weight 600.
   * Default selection: "Todas".
4. The gallery for the active category.
   * The blank card appears **only** under "Todas".
   * An empty category shows the hint "No hay plantillas en esta categoría."

**Gallery layout:** flex wrap, gap 18.

**Card**

* 168 wide, transparent, column layout, gap 8.
* Thumbnail: 168×218, white, 1 px `#C8C6C4` border, page shadow. Border turns accent on hover.
* Label: 13 px.

**Blank card**

* Thumbnail shows a "+" glyph: 34×34, two 2 px bars in `#605E5C` at opacity .55.
* Label and tooltip: "Documento en blanco".
* Click emits `new` with no parameters.

**Template card**

* Thumbnail background `#F3F2F1`, padding 6, holding the SVG thumbnail (§15) scaled to fit.
* Tooltip `"{nombre}: {descripcion}"`.
* Click emits `new {template:id}`.
* Thumbnails are cached per template id for the session.

**Template catalogue** (`js/core/templates.js:388-903`; contents belong to the templates spec):

| id | nombre | categoria | featured |
|---|---|---|---|
| `carta-formal` | Carta formal | cartas | ✓ |
| `carta-presentacion` | Carta de presentación | cartas | |
| `carta-recomendacion` | Carta de recomendación | cartas | |
| `memorando` | Memorando | cartas | |
| `circular` | Circular / comunicado | cartas | |
| `cotizacion` | Cotización | comercial | ✓ |
| `cuenta-cobro` | Cuenta de cobro | comercial | |
| `propuesta-comercial` | Propuesta comercial | comercial | |
| `informe-ejecutivo` | Informe | informes | ✓ |
| `informe-avance` | Informe de avance de proyecto | informes | |
| `acta-reunion` | Acta de reunión | informes | ✓ |
| `trabajo-academico` | Trabajo académico | academico | |
| `curriculum` | Currículum vitae | personal | ✓ |
| `certificado` | Certificado / constancia | personal | |

**`new` action** (`main:2657-2673`):

1. Create a server document.
2. If a template was given, fetch the base document, build the template document, and save it.
3. Navigate to the new document. On any error the document opens blank.

**[NATIVE NOTE]** Create a new in-memory document, build the template, and open it in a new
editor window or tab.

### 6.5 Document lists ("Recientes" and "Compartidos")

Built at `bs:382-523`.

**Pagination**

* Pages of **50** items, newest first.
* While `loaded < total`, a "Ver más" button appears. Its tooltip is
  `"Cargar {min(50, total-loaded)} documentos más"`. While loading it is disabled and reads
  "Cargando…".
* When `total > 50` or an error occurred, a counter shows `"Mostrando {loaded} de {total}"`.
* An error after the first page shows "No se pudo cargar más." in red (`#A4262C`, 12 px).
  "Ver más" stays so the user can retry.

**"Recientes" list**

* States:
  * loading: "Cargando archivos…"
  * empty: "No hay documentos guardados todavía."
  * error: "No se pudo obtener la lista de archivos (sin conexión con el servidor)."
* Header row: 11 px uppercase, letter-spacing .4, `#605E5C`, bottom border.
  Columns "Nombre", "Modificado", "Tamaño".
* Data row: a full-width button with padding 8, bottom border, hover `#EDEBE9`.
* Column grid: `24px | 1fr | 160px | 90px`. Inside the two-column Inicio layout the grid is
  `24 | 1fr | 132 | 72`.
* Cells:
  * icon `word` (the blue W logo);
  * name, 13 px with ellipsis, or "(sin nombre)";
  * date, 12 px `#605E5C`;
  * size, 12 px, right-aligned.
* Tooltip: the file name.
* Click emits `open {id}`.

**"Compartidos" list**

* States:
  * loading: "Cargando documentos compartidos…"
  * empty: "Todavía no has compartido ningún documento."
  * error: "No se pudo obtener la lista de documentos compartidos (sin conexión con el servidor)."
* Columns "Nombre", "Compartido con", "Permiso", "Compartido".
* Column grid: `24 | 1.2fr | 1fr | 96 | 130`. Inside Inicio: `24 | 1.1fr | 1fr | 86 | 118`.
* "Compartido con" shows up to two emails, then `"{a}, {b} y {n} más"`. Its tooltip lists
  every email, one per line.
* "Permiso":
  * "Ver y editar" when there are links of both modes;
  * otherwise "Puede editar" if any link is `editar`;
  * otherwise "Puede ver".

**Formatting helpers**

* Dates use es-ES `dd/mm/yyyy, hh:mm` via `Intl` with 2-digit day, month, hour and minute.
* Numeric epochs below 1e12 are treated as seconds.
* Server DATETIME strings (`"YYYY-MM-DD HH:MM:SS"`) have the space replaced by `T` before
  parsing.
* Sizes (`tamanoES`, `bs:152-161`):
  * under 1024 bytes: `"{n} B"`;
  * otherwise divide by 1024 repeatedly and use units KB, MB or GB, with at most 1 decimal
    and a comma separator, e.g. `"1,5 KB"`.

**[NATIVE NOTE]**
* Map "Recientes" to the app's MRU list of local files.
* "Compartidos" depends on the server API. Hide it, or keep it behind an optional server
  connector.

### 6.6 "Abrir", "Guardar", "Guardar como", "Guardar una copia"

**"Abrir"** (`bs:591-609`)

1. H1 "Abrir".
2. A row with:
   * a "place" label: icon `pc` plus "Este equipo", 13 px `#323130`;
   * a "Examinar…" button, tooltip "Importar un documento de Word (.docx)". It opens a file
     picker that accepts `.docx` and emits `import-docx {file}`.
3. H2 "Recientes", then the file list.

After an import, the warnings dialog appears once (§12.17).

**"Guardar"** (`bs:612-620`)

1. H1 "Guardar".
2. Text `Guarda «{name}» en el servidor.`
3. A primary "Guardar" button that emits `save`.

**"Guardar como"** (`bs:623-650`)

1. H1 "Guardar como".
2. Text "Este equipo — carpeta de documentos del servidor."
3. A row with:
   * a text box (min width 320, 13 px, padding 5 8, `#8A8886` border, 2 px accent focus
     outline) pre-filled with the current name;
   * a primary "Guardar" button.
4. A second row with a "Guardar como .docx" button that emits `export-docx`.

Validation: the trimmed name must not be empty; if it is, focus the box. Otherwise emit
`save-as {name}`. Enter in the box does the same.

The handler sets the document name, saves, and closes. **Pitfall:** the name is **not**
passed through `normalizeDocName`, so `.docx` is not appended. **[NATIVE NOTE]** Normalise
it.

**"Guardar una copia"** (shared mode, `bs:656-669`)

1. H1 "Guardar una copia".
2. Text `Descarga una copia de «{name}» en tu equipo. El documento original no se modifica.`
3. A primary button "Descargar copia (.docx)" that emits `save-copy`.
4. A second button "Copia en formato Skriba (.json)" that emits `export-json`.

### 6.7 "Imprimir" and "Exportar"

**"Imprimir"** (`bs:672-683`)

1. H1 "Imprimir".
2. Text `Imprime «{name}» tal como se ve en la vista Diseño de impresión. La impresora, las
   copias y el intervalo de páginas se eligen en el diálogo del navegador.`
3. A primary "Imprimir" button (tooltip "Imprimir (Ctrl+P)") that emits `print`.
4. Text "Sugerencia: Ctrl+P imprime sin pasar por este panel."

The handler closes the backstage and opens the system print dialog 150 ms later.

**[NATIVE NOTE]** Use the JUCE or OS print path, or a PDF export followed by the system
viewer. The print spec is separate.

**"Exportar"** (`bs:686-708`): three option blocks. Each block has max width 620, padding
14 0 18 and a bottom separator. Titles are 14 px, weight 600.

1. "Crear documento PDF"
   * Text: "Conserva el diseño y la paginación. En el diálogo que se abre, elige «Guardar
     como PDF» como destino."
   * Primary button "Crear PDF" → `export-pdf`. In Skriba this is the same as `print`.
2. "Crear documento de Word (.docx)"
   * Text: "Compatible con Microsoft Word: párrafos, estilos y formato básico."
   * Button "Exportar .docx" → `export-docx`.
3. "Copia local (.json)"
   * Text: "Descarga el documento en el formato nativo de Skriba."
   * Button "Descargar .json". It downloads `{name without .docx}.json` from the server
     export URL, or emits `export-json` when there is no id.

**[NATIVE NOTE]** The native app writes `.docx`, `.json` and `.pdf` directly with a save-file
chooser.

### 6.8 "Cuenta"

Built at `bs:715-765`.

1. H1 "Cuenta".
2. H2 "Información de usuario".
3. A container (max width 620) that first shows "Consultando la sesión…".

**Not authenticated**

* Text: "No hay ninguna sesión iniciada. Inicia sesión para guardar tus documentos en línea."
* Primary button "Iniciar sesión" → `account-login` (closes the backstage and opens the login
  dialog; reloads on success).

**Authenticated**

* User card:
  * avatar: 56×56 circle, accent colour, white initial (24 px, weight 600) = first letter of
    the email in upper case;
  * name = the part of the email before "@" (15 px, weight 600); falls back to "Usuario";
  * email, 13 px `#605E5C`.
* Two link-buttons:
  * "Cerrar sesión" → `account-logout` (logs out and reloads);
  * "Cambiar de cuenta" → `account-switch` (logs out, then opens the mandatory login dialog).
* Text: "Tus documentos se guardan en línea en tu almacén privado, sin límite de cantidad."

**Server error:** "No se pudo consultar la sesión (sin conexión con el servidor)."

**[NATIVE NOTE]** The desktop app is local-first. Keep the page and show "Sin cuenta" or an
optional server login.

---

## 7. Command catalogue (router)

Router: `route()` at `main:711-976`. "Effect" summarises what the command does; the details
live in the engine specs.

### 7.1 Character commands

The ids are `bold`, `italic`, `underline{style?}`, `strike`, `sub`, `sup`, `font-name{name}`,
`font-size{pt}`, `font-grow`, `font-shrink`, `font-color{color}`, `highlight{color|null}` and
`clear-format`.

Steps:

1. `delta = charDeltaForCommand(id, params, currentFormat.char)`.
2. `range = expandRangeToWord(doc, selection)`. A collapsed caret inside a word expands to
   that word.
3. If the range is still collapsed, **do nothing**. There is no pending caret format.
4. `clear-format` runs, in a single batch named "Borrar formato", `applyCharFormat(delta)`
   and then `setStyle('Normal')`.
5. Afterwards refresh the ribbon state and focus the canvas (`main:713-731`).

### 7.2 Paragraph commands

The ids are `align:left|center|right|justify`, `line-spacing{line}`, `space-before{tw}`,
`space-after{tw}` and `indent:inc|dec`. The router runs
`applyParaFormat(selection, paraDeltaForCommand(id, params))`.

### 7.3 Everything else

| id {params} | Effect |
|---|---|
| `style {id}` | `setStyle(selection, id)` |
| `undo`, `redo` | Command stack |
| `save` | `saveNow()` (§3.4) |
| `paste`, `copy`, `cut` | System clipboard through the editor |
| `select-all` | Select the whole document |
| `file:backstage` | Open the backstage on "Inicio" |
| `font-dialog` | §12.2 |
| `paragraph-dialog` | §12.3 |
| `zoom:in`, `zoom:out` | zoom ± 0.1 |
| `zoom:reset` | zoom = 1 |
| `zoom:set {value}` | zoom = value / 100 |
| `zoom:fit {fit: width\|page\|multi}` | `fitZoom` (below) |
| `view:mode {mode}` | `setViewMode` (below) |
| `view:ruler {on}` | Show or hide row 3 |
| `view:gridlines {on}` | Canvas class `show-gridlines` (§14) |
| `view:navigation {on}` | Open or close the navigation pane |
| `view:marks {on}` | Canvas class `show-marks` |
| `window:new` | Open the same document in a new window |
| `window:switch` | Backstage "Abrir" |
| `format-painter {sticky?}` | Load the painter (below) |
| `format-painter:off` | Unload the painter |
| `bullets`, `numbering`, `multilevel` `{listId?}` | `toggleList`: target = `listId`, or the first gallery entry. If the paragraph already uses the target list, remove it (`setList(null)`); otherwise apply it. |
| `list:none` | Remove the list |
| `list:level-inc`, `list:level-dec` | `setListLevel(±1)`. No ribbon control; the keyboard uses Tab and Shift+Tab inside lists. |
| `find`, `replace` | Toggle the find pane in that mode (§13.1) |
| `find:next`, `find:prev` | Open the pane if needed, then move |
| `goto` | §12.4 |
| `print` | System print |
| `escape` | In this order: unload the painter if loaded; else leave read mode (switch to print); else close the find pane (`main:792-798`) |
| `insert:page-break` | Page break at the caret |
| `insert:line-break` | Line break at the caret |
| `insert:column-break` | `insertBreak('column')` |
| `insert:section-break {start}` | `nextPage`, `continuous`, `evenPage` or `oddPage` |
| `insert:blank-page` | Blank-page fragment |
| `insert:symbol {char}` | Insert the text |
| `insert:symbol-dialog` | §12.5 |
| `insert:datetime` | §12.6 |
| `insert:hyperlink` | §12.7 |
| `insert:bookmark` | §12.8 |
| `insert:cover {design}` | Cover fragment inserted at the **start** of the document. Title = doc name without `.docx`, subtitle "Subtítulo", date = long es-ES date. |
| `insert:cover-dialog` | §12.10 |
| `dropcap {type, lines}` | `para.dropCap = {type, lines: clamp(lines, 2, 10)}`, or `null` for `none` |
| `insert:wordart {preset}` | With a selection: apply the preset's char format. Without: insert a WordArt paragraph after the current block and select its placeholder text. |
| `insert:equation {src?}` | With `src`: insert a math run. Without: open the dialog (§12.12). |
| `insert:equation-dialog` | §12.12 |
| `insert:smartart-dialog` | §12.13 (new diagram) |
| `smartart:edit {blockId}` | §12.13 (edit) |
| `smartart:delete {blockId}` | Remove the block |
| `insert:image` | File picker (png, jpeg, gif, webp, bmp), then upload and insert. Scaled down to the column width; natural px at 96 dpi; sizes in twips. |
| `image:wrap {wrap}` | `inline`, `square`, `topAndBottom`, `behind` or `front`, on the selected image or the image at the caret |
| `image:align {align}` | Same targeting as `image:wrap` |
| `image:position {h, v}` | Sets `wrap: 'square'` and `align = h`. `v` is ignored. |
| `insert:header`, `insert:footer` | Edit the band (create it if missing, with centre and right tabs at col/2 and col) |
| `remove:header`, `remove:footer` | Remove the band |
| `insert:page-number {where, align, style?}` | **Replaces** the whole band with a page-number paragraph |
| `remove:page-number` | Removes only bands that contain nothing but a page number |
| `insert:table {rows, cols}` | Rows clamped to 1–50, cols to 1–20. Width = text column width. The caret moves into the first cell. |
| `insert:table-dialog` | §12.9 |
| `table:row-above`, `table:row-below`, `table:col-left`, `table:col-right`, `table:delete-row`, `table:delete-col`, `table:delete`, `table:merge`, `table:split`, `table:autofit`, `table:style {id}`, `table:props {…}` | Table operations (§11.4) |
| `help:open`, `help:shortcuts`, `help:about`, `help:whats-new`, `help:feedback` | §12.16 |
| `draw:tool {tool}` | `pen`, `highlighter`, `eraser`, `lasso` or `none` |
| `draw:pen {color}`, `draw:highlighter {color}` | Set the colour and the tool |
| `draw:width {width}` | Stroke width |
| `draw:delete`, `draw:clear-page`, `draw:clear-all` | Ink operations |
| `mail:*` | §12.14. `mail:start {kind}` sets `doc.mailMergeKind` (`setDocProps({mailMergeKind: kind or "letters"})`) and opens the recipients dialog. `preview`, `preview-next` and `preview-prev` swap the body with a merged record (cyclic index) and show "Destinatario i de n". `finish {mode}` replaces the body with the merged document and prints if `mode` is `print`. |
| `ref:toc {levels, showPages?}`, `ref:toc-update`, `ref:toc-remove` | Generated blocks |
| `ref:footnote`, `ref:endnote` | Uses `window.prompt('Texto de la nota al pie:')` or `'Texto de la nota al final:'`. **[NATIVE NOTE]** Replace with a small input dialog. |
| `ref:next-note`, `ref:caption`, `ref:figure-table`, `ref:citation`, `ref:sources`, `ref:bibliography`, `ref:citation-style`, `ref:cross`, `ref:notes-dialog` | References. `ref:citation-style` writes `doc.citationStyle`. |
| `ref:index-mark` | Uses `window.prompt('Entrada de índice:', selectedText)` |
| `ref:index`, `ref:index-update` | Index |
| `review:proofing` | Toggle the proof pane |
| `review:spelling-live {on}` | Live spelling on or off |
| `review:word-count`, `review:language`, `review:protect`, `review:compare` | §12.11 |
| `review:read-aloud`, `review:read-stop` | Speech synthesis of the selection or the whole body (non-header paragraphs), language `doc.locale`. If unsupported: `alert('Este navegador no admite la lectura en voz alta.')` |
| `review:track` | Toggle `doc.tracking.enabled` (author = `doc.tracking.author`, or "Autor") |
| `review:show-marks` | Toggle `doc.tracking.showMarks` |
| `review:accept`, `review:accept-all`, `review:reject`, `review:reject-all` | Resolve revisions in the selection or in the whole document |
| `comment:new` | Uses `window.prompt('Comentario:')`, then adds the comment and opens the pane |
| `comment:delete`, `comment:delete-all`, `comment:next`, `comment:prev`, `comment:pane` | §13.3 |
| `design:theme {id}` | `setTheme({name, majorFont, minorFont, colors})` |
| `design:fonts {id}` | Change the fonts only |
| `design:colors {id}` | Change the colours only |
| `design:spacing {id}` | `setStyleProps('Normal', {para: {before, after, line}})` |
| `design:watermark {text\|null}` | Preset watermark: font Aptos, size 0 (auto), colour `#C8C6C4`, diagonal true, opacity 0.4 |
| `design:page-color {color\|null}` | `doc.pageColor` |
| `design:page-border {style}` | `{style, color: previous or #000000, width: previous or 1, space: previous or 24}`. `none` removes it. |
| `design:watermark-dialog`, `design:borders-dialog` | §12.11 |
| `layout:margins {margins}` | Margins of the current section |
| `layout:orientation {orient}` | Orientation |
| `layout:size {name}` | `w`/`h` from `paperSize`, swapped for landscape |
| `layout:columns {preset}` | Count; spacing 708 twips; widths from the ratio (§12.11) |
| `layout:indent {left?, right?}` | cm converted to twips, minimum 0 |
| `layout:hyphenation {mode}` | Section `hyphenation` boolean |
| `layout:*-dialog` | §12.11 |
| `section:flags {…}` | `setSectionFlags`. No UI calls it directly. |
| unknown id | `console.info` only |

**Zoom rules** (`main:2581-2585`, `main:1626-1637`)

* `setZoom(z)`: `clamped = min(5, max(0.1, round(z*10)/10))`.
* Ctrl + mouse wheel over the canvas: ±0.1 (wheel up zooms in).
* `fitZoom(fit)`, with `w = canvasW − 48` and `h = canvasH − 48` (each at least 120):

  | fit | zoom |
  |---|---|
  | `width` | `w / page.w` |
  | `page` | `min(w / page.w, h / page.h)` |
  | `multi` | `min(w / (2*page.w + 24), h / page.h)` |

* Zoom is a visual scale applied around the top centre. The layout is never recomputed.

**`setViewMode(mode)`** (`main:1532-1553`)

* Invalid modes become `print`.
* Body classes are updated (§1.1).
* `layout.setViewMode('web' or 'print', {widthPx: max(320, canvasW − 48),
  heightPx: max(600, canvasH)})`.
* Read mode then runs `fitZoom('width')`. Web mode sets zoom to 1.
* Finally sync the ribbon's Vista state.

**Format painter** (`main:1842-1919`)

* **Load:** take the paragraph style, the raw character overrides at `offset + 1` (the first
  selected character), and the raw paragraph overrides. The canvas cursor becomes `cell`.
* **Apply:** on mouse-up over the canvas, wait one frame, then expand the selection to the
  word. If the result is empty, keep the painter loaded.
* Otherwise, in one batch named "Copiar formato":
  1. `setStyle`;
  2. `applyParaFormat`, where every `PARA_KEYS` entry missing from the source becomes `null`;
  3. `applyCharFormat`, where every `CHAR_KEYS` entry missing from the source becomes `null`.
* The painter unloads unless it is sticky.

---

## 8. Keyboard accelerators

### 8.1 Implemented

Handler: `inp:276-417`. Ctrl means Ctrl or Cmd, **without Alt**, so AltGr is not treated as a
shortcut. Keys are ignored during IME composition.

**Navigation** (Shift extends the selection)

| Key | Action |
|---|---|
| ← / → | Move one character; with Ctrl, one word |
| ↑ / ↓ | Move one line |
| Home / End | Line start / end; with Ctrl, document start / end |
| PageUp / PageDown | Move one page |

**Editing**

| Key | Action |
|---|---|
| Backspace / Delete | Delete a character; with Ctrl, a word |
| Enter | New paragraph |
| Shift+Enter | Line break |
| Ctrl+Enter | Page break |
| Tab / Shift+Tab | Insert a tab, or move to the next / previous table cell |
| Esc | `escape` command (not consumed) |
| F1 | `help:open` |
| F3 / Shift+F3 | `find:next` / `find:prev` |
| F5 | `goto` |
| F7 | `review:proofing` |

**Ctrl shortcuts** (es-ES letters plus the English map)

| Shortcut | Command |
|---|---|
| Ctrl+A | Select all |
| Ctrl+C / Ctrl+X / Ctrl+V | Native clipboard (not consumed) |
| Ctrl+B and Ctrl+N | `bold` |
| Ctrl+I and Ctrl+K | `italic` |
| Ctrl+U and Ctrl+S | `underline` |
| Ctrl+Z | `undo` |
| Ctrl+Shift+Z and Ctrl+Y | `redo` |
| Ctrl+G | `save` |
| Ctrl+F | `find` |
| Ctrl+H | `replace` |
| Ctrl+P | `print` |
| Ctrl+M / Ctrl+Shift+M | `indent:inc` / `indent:dec` |
| Ctrl+E | `align:center` |
| Ctrl+Shift+E | `review:track` |
| Ctrl+L / Ctrl+R / Ctrl+J | `align:left` / `align:right` / `align:justify` |
| Ctrl+0 | `zoom:reset` |
| Ctrl+`>` or Ctrl+`.` | `font-grow` |
| Ctrl+`<` or Ctrl+`,` | `font-shrink` |

**Other mouse and keyboard rules**

* Ctrl + wheel over the canvas zooms (§7.3).
* The name label: Enter or F2 starts the rename.
* Dialogs: Escape closes; Tab and Shift+Tab cycle focus inside the dialog.
* Backstage: Escape closes.
* Menus and dropdowns: Escape closes.

### 8.2 Shown in tooltips but NOT implemented (pitfall)

| Shortcut | Where it is advertised |
|---|---|
| Ctrl+= | "Subíndice" |
| Ctrl+Mayús+= | "Superíndice" |
| Ctrl+Alt+K | "Vínculo" |
| Alt+Ctrl+O | "Insertar nota al pie" |
| Alt+Mayús+X | "Marcar entrada" |

The special-character table in the Symbol dialog (§12.5) also lists shortcuts that are not
implemented.

**[NATIVE NOTE]** Either implement these or remove them from the tooltips. Implementing them
is the better choice and is consistent with `plan:1004-1047`, which also lists many more that
are not implemented, such as Ctrl+D or Ctrl+T.

### 8.3 Help dialog shortcut list

`d/help:90-129` holds the same list, grouped as Archivo, Edición, Formato, Inserción, Vista
and Revisión. Port it verbatim (§12.16).

---

## 9. Status bar

Source: `sb` and `rcss:577-679`.

**Container:** height 28, `#F3F2F1`, top border, flex, padding 0 10, gap 12, 12 px text in
`#323130`, overflow hidden.

**Items, left to right**

1. `"Página {page} de {pageCount}"`. `page` is the page that holds the caret
   (`currentPageNo`).
2. Word count: `"1 palabra"` for one word, otherwise `"{n} palabras"`, with `n` formatted by
   `Intl.NumberFormat('es-ES')`.
   * **Pitfall:** es-ES only groups numbers of 5 digits or more. 1234 becomes "1234" and 12345
     becomes "12.345". Reproduce this, or decide deliberately not to.
3. `"Español (España)"`. This is **hard-coded** in `main:390`, even when `doc.locale` changes,
   although the Language dialog claims otherwise. **[NATIVE NOTE]** Show the display name for
   `doc.locale`.
4. A spacer that takes the remaining space.
5. **Zoom cluster** (gap 6):
   * Button "−" (U+2212): 18×18, 13 px, radius 3, tooltip "Alejar" → `zoom:out`.
   * Slider:
     * range 10–500, step 1, 100 px wide;
     * track 2 px tall `#8A8886`, radius 1;
     * thumb 8×14, radius 2, `#605E5C` with a 1 px white border; accent on hover;
     * tooltip "Zoom";
     * every input fires `zoom:set {value}` and immediately updates the percent label.
   * Button "+": tooltip "Acercar" → `zoom:in`.
   * Percent button: min width 46, right-aligned, 12 px, text `"{pct} %"`, tooltip
     "Restablecer el zoom al 100 %" → `zoom:set {value:100}`.

**Item style:** padding 2 6, radius 3, no wrapping.

**[NOT IMPLEMENTED]**

* The page and word items are not clickable. The CSS cursor rule targets `.st-page`, but the
  element's class is `st-pages`.
* The view-switch buttons (`.st-views` in the CSS) are not built.
* `plan:563` wanted the page item to open "Ir a". **[NATIVE NOTE]** Clicking the page item
  should open "Ir a".

**Repaint**

* Coalesced to one per frame.
* Triggered by `layout:done`, `selection:changed`, `zoom:changed`, `doc:changed` and
  `doc:loaded`.
* `pct = clamp(round(zoom*100), 10, 500)`.
* **Bug-fix note** (`sb:325-336`): while the user drags the slider, its position is not
  rewritten. The router rounds zoom to 10 % steps, which would make the thumb jump under the
  pointer. When the drag ends, a refresh runs.

---

## 10. Horizontal ruler

Source: `ru` and `wcss:179-223`.

**As implemented:** a static drawing. There is **no** dragging, **no** indent markers, **no**
tab stops and **no** vertical ruler.

### 10.1 Geometry inputs

`rulerInfo()` (`main:2594-2615`) supplies the inputs. It always uses the **first page**
(`layout.pages[0]`).

| Input | Value |
|---|---|
| `pageWPx` | `page.wPx`, default 794 |
| `marginLeftPx` | `page.margins.left`, default 96 |
| `marginRightPx` | `page.margins.right`, default 96 |
| `zoom` | Current zoom |
| `canvasScrollLeft` | Horizontal scroll of the canvas |
| `pageOffsetLeftPx` | `(canvas.left − ruler.left)` + `max(0, (canvas.clientWidth − pageWPx*zoom)/2)` |

The first term of `pageOffsetLeftPx` compensates for open left panes; the second centres the
page.

Normalisation (`ru:71-97`):

* `zoom ≥ 0.05`, `pageWPx ≥ 1`, margins ≥ 0.
* If `mL + mR ≥ pageW`, each margin becomes `min(margin, pageW/3)`.

### 10.2 Drawing

All values are in screen px, i.e. multiplied by zoom.

* The track starts at `x0 = pageOffsetLeftPx − canvasScrollLeft` and is `pageW*zoom` wide.
* **Margin zones:** `[0, mL)` and `[W − mR, W)`, full ruler height, `#D0CECC`.
* **Origin:** `x = mL`, the left margin. One **major** tick is drawn there: 1 px wide, 7 px
  tall, bottom at 5 px. The number 0 is never drawn.
* For k = 1 to 200:
  * `dCm = twipsToPx(cmToTwips(k))*zoom`
  * `dHalf = twipsToPx(cmToTwips(k − 0.5))*zoom`
  * **Minor ticks** at `origin ± dHalf`, inside `[0, W]`: 1 px wide, 4 px tall, bottom at 5 px,
    colour `#605E5C`.
  * **Numbers** `k` at `origin ± dCm`, inside `[0, W]`: 9 px, `#605E5C`, centred on x and
    vertically centred. No tick is drawn under a number.
  * Stop when nothing was drawn and both `origin − dHalf < 0` and `origin + dHalf > W`.
* The drawing is rebuilt only when `pageW`, the margins or the zoom change. Scrolling just
  moves the track.
* Repainting is coalesced per frame. Triggers: `layout:done`, `zoom:changed`, `doc:loaded`,
  canvas scroll, window resize and pane resize.

**Pitfalls**

* The ruler always follows page 1. With multiple sections and different page sizes, it does
  not follow the caret's section.
* A centimetre ruler is hard-coded. There is no inch option.

### 10.3 Planned behaviour

From `plan:557`; marked **[NOT IMPLEMENTED]**. **[NATIVE NOTE]** These are recommended for
parity with Word.

* Indent markers in `--wd-ruler-indent` `#323130`: first-line (down triangle), hanging (up
  triangle) and left (small box). Dragging updates `para.first`, `para.left` and `para.right`
  through undoable `applyParaFormat`.
* Tab stops: click to add, drag off to remove. Double-click opens a tabs dialog.
* Dragging a margin boundary changes `section.page.margins` through `setMargins`.
* A vertical ruler.

If implemented, snap to 0.25 cm (matching the spin-box step) and show a dashed guide line
across the canvas while dragging.

---

## 11. Context menus

### 11.1 Component

Source: `ctx` and `dcss:119-166`.

**API:** `showContextMenu(x, y, items)` returns `{close}`. Each item can have:

* `label`
* `icon`: an icon name or raw SVG
* `shortcut`: text shown on the right
* `disabled`
* `separator: true`
* `submenu: items[]`
* `onClick(item)`
* `content`: a custom element; any button inside it closes the menu
* `hint`: present in the data but **ignored** by the renderer

**Box**

* White, 1 px `#C8C6C4` border, radius 4, menu shadow, padding 4 0.
* Width 180–320. Max height = window height − 8; scrolls beyond that.
* 12 px text.

**Item**

* Flex, gap 8, padding 5 12 5 8, `#323130`, no wrapping.
* Hover `#EDEBE9`. Disabled items are `#A19F9D` and do nothing on hover.
* Contents, left to right:
  * a fixed 16×16 icon slot (empty if no icon, so labels align);
  * the label (flexible);
  * the shortcut, if any (margin-left 24, 11 px, `#605E5C`);
  * a submenu chevron-right (10 px), if the item has a submenu.

**Separator:** 1 px `#E1DFDD`, margin 4 8.

**Behaviour**

* Only one root menu exists at a time.
* Hovering an item closes deeper submenus. If the item has a submenu, it opens at
  `(row.right − 2, row.top − 5)`.
* Clicking an item with a submenu does nothing. Clicking a leaf closes everything, then runs
  `onClick`.
* Positioning:
  * If `x + w > window.width − 4`: submenus flip to `max(4, anchor.left − w + 2)`; root menus
    use `max(4, window.width − w − 4)`.
  * If `y + h > window.height − 4`: `y = max(4, window.height − h − 4)`.
* Closes on: pointer-down outside every open level, Escape (which stops propagation), a wheel
  event outside, window resize, or window blur.

**[NATIVE NOTE]** `juce::PopupMenu` covers all of this. Use a custom `LookAndFeel` to match
the metrics, and add the `hint` as a second line.

### 11.2 Canvas right-click

Dispatch order at `main:555-565`:

1. If the click hits a **SmartArt** diagram, show the SmartArt menu (§11.3).
2. Otherwise compute the document position. If the click is outside the current selection,
   move the caret there. A click inside the selection keeps it, as in Word.
3. If the position is on a word flagged by **live spelling**, show the spelling menu:
   * Up to 6 suggestions, each with icon `spellcheck`, replacing the word.
   * If there are none: "Sin sugerencias" (disabled).
   * separator
   * "Omitir todas": ignore the word for the session and rescan.
   * "Agregar al diccionario" [spellcheck]: adds the word to the user dictionary, which is
     stored in `doc.dictionary` (undoable through `setDocProps`) and in localStorage
     `skriba:dictionary`. Then rescan.
4. Else, if the caret is inside a table cell, show the table menu (§11.4).
5. Else **no menu at all**. The browser's native menu appears.

**[NATIVE NOTE]** Add a basic text menu: "Cortar", "Copiar", "Pegar", separator, "Fuente…",
"Párrafo…", "Nuevo comentario", "Vínculo…". Mark it as a native addition.

### 11.3 SmartArt menu

* "Editar SmartArt…" [smartart] → `smartart:edit {blockId}`
* separator
* "Eliminar SmartArt" [close] → `smartart:delete {blockId}`

Double-clicking a SmartArt also edits it. Double-clicking an equation opens the equation
dialog in edit mode (`main:569-580`).

### 11.4 Table menu

Defined at `main:2229-2274`.

1. "Insertar fila encima" [table] → `table:row-above`
2. "Insertar fila debajo" [table] → `table:row-below`
3. "Insertar columna a la izquierda" [table] → `table:col-left`
4. "Insertar columna a la derecha" [table] → `table:col-right`
5. separator
6. "Combinar celdas" [table] → `table:merge`. Merges the rectangle from the selection's start
   cell to its end cell; does nothing within a single cell.
7. "Dividir celda" [table] → `table:split`
8. "Distribuir columnas" [columns] → `table:autofit`. Equal widths: `floor(total/n)`, with the
   rounding remainder added to the last column.
9. "Estilos de tabla" [table], **submenu** → `table:style {id}`:
   * `plain` "Tabla sencilla"
   * `grid-header` "Cuadrícula con encabezado"
   * `banded` "Filas con bandas"
   * `list` "Lista sin bordes"
   * `accent-blue` "Énfasis azul"
   * `accent-green` "Énfasis verde"
   * `accent-orange` "Énfasis naranja"
   * `minimal` "Solo líneas horizontales"
10. separator
11. "Eliminar fila" [close] → `table:delete-row`
12. "Eliminar columna" [close] → `table:delete-col`
13. "Eliminar tabla" [close] → `table:delete`
14. separator
15. "Quitar bordes" when borders are not `none`, otherwise "Mostrar bordes" [table] →
    `table:props {borders: 'none' or 'grid'}`
16. "Repetir la primera fila en cada página" [check] → `table:props {repeatHeader: !current}`.
    The check icon is always shown, whatever the state (pitfall).
17. separator
18. "Alinear tabla a la izquierda" → `table:props {align:'left'}`
19. "Centrar tabla" → `table:props {align:'center'}`
20. "Alinear tabla a la derecha" → `table:props {align:'right'}`

---

## 12. Dialogs

### 12.1 Base modal (`dlg`)

**API:** `openDialog({title, body, buttons, width = 420})` returns `{close, el}` (`dlg:405`).

**Overlay**

* Fixed over the whole window, `rgba(0,0,0,.18)`, z-index `5000 + openCount*2`.
* Dialogs can be nested.

**Box**

* White, 1 px `#B5B3B1` border, radius 6, dialog shadow, 12 px UI font, column layout.
* Max size: window − 24 px in each direction.
* Width = `width` px.

**Title bar**

* Height 34, padding 0 4 0 14, bottom border `#EDEBE9`, cursor `move`.
* Title text: 13 px, weight 600.
* Close button: 32×28, icon `close`, tooltip "Cerrar". Hover: `#E81123` background with a
  white glyph.
* With an empty title, the bar shows only the X (account and share dialogs).

**Body:** padding 14, scrolls.

**Footer**

* Right-aligned, gap 8, padding 10 14 14.
* Omitted when `buttons` is `[]`.
* `buttons: null` means the defaults: "Aceptar" (primary) and "Cancelar".

**Buttons (`xl-btn`)**

* Min width 78, height 26, 1 px `#8A8886` border, radius 2, white, padding 0 12.
* Hover `#F3F2F1`. Disabled: `#A19F9D` text on `#F3F2F1`.
* Primary: accent fill and border, white text; hover `#1349A0`.

**Button semantics**

* `onClick(api)` runs first.
* If it returns **exactly `false`**, the dialog stays open (validation failed).
* Otherwise the dialog closes.

**Positioning**

* `left = max(8, (window.width − w)/2)`.
* `top = max(8, (window.height − h)/3)`, i.e. one third from the top.

**Dragging by the title bar** (not from the X):

* `x` is clamped to `[−w + 60, window.width − 60]`.
* `y` is clamped to `[0, window.height − 34]`.

**Keyboard**

* Escape closes. It stops propagation and counts as Cancel.
* Tab and Shift+Tab wrap around inside the dialog.

**Focus**

* Initial focus: the first primary button, otherwise the dialog itself.
* On close, focus returns to the canvas.

**No close callback.** The account dialog watches for DOM removal to work around this.
**[NATIVE NOTE]** Provide an `onClose` callback.

**Form styles shared by many dialogs** (`dcss:173-364`)

* Tab strip:
  * bottom border `#D9D9D9`;
  * tab padding 6 10 7;
  * active tab: accent text, weight 600, 2.5 px accent underline.
* Inputs and selects: 12 px, 1 px `#8A8886` border, radius 2, padding 3 6.
  Focus: accent border plus a 1 px inset accent ring.
* Checkboxes use the accent tick.
* List items: active background `#D5E1F2`, accent text, weight 600.
* Preview boxes: `#FAFAFA` background, 1 px `#D9D9D9` border.
* Error text: 11 px, `#A4262C`.

Several dialogs inject their own small style rules (prefixes `ins-`, `lay-`, `dsg-`, `ref-`,
`rev-`, `mm-`, `hlp-`, `eq-`, `sa-`, `goto-`, `share-`). The common pattern is:

* row = label (92–104 px wide, 12 px, `#323130`) + control (13 px, padding 4–5 8, radius 3,
  `#8A8886` border, accent border on focus);
* hint = 11 px, `#605E5C`.

### 12.2 "Fuente"

Source: `d/font`. Opened by the `font-dialog` command (Fuente group launcher). Width 540.

**Initial state** (`d/font:140-158`)

* Read from `currentFormat().char`.
* Defaults: font Aptos, size 11, bold false, italic false, underline `none`, strike/sub/sup
  false, colour `auto`.
* Colours are normalised to `#RRGGBB` upper case. Anything that is not a valid 6-digit hex
  becomes `auto`.
* The target range is captured when the dialog opens.

**Layout**

1. **Three columns** (grid `1fr 130px 88px`, gap 12), each with a label above:
   * "Fuente:"
     * an editable text box;
     * a 7-row list of every catalogue font (`fontNames()`).
     * Rows are drawn in their own font when that font is available and is not a symbol
       font.
     * A font that is not in the catalogue is inserted at the top of the list.
     * Typing selects the first list entry that **starts with** the text (case-insensitive).
     * State: if the typed text matches an entry exactly (case-insensitive), use the
       catalogue spelling; otherwise use the typed text.
   * "Estilo de fuente:" (7-row list):
     * "Normal": bold off, italic off.
     * "Cursiva": italic.
     * "Negrita": bold.
     * "Negrita Cursiva": bold and italic.
   * "Tamaño:"
     * a number box, min 1, max 1638, step 1;
     * a 7-row list of the sizes 8–72 from §4.4.
     * Typing a valid value v (0 < v ≤ 1638, comma accepted) updates the state. If v is not
       in the list, the list selection is cleared.
2. **Two columns:**
   * "Estilo de subrayado:" select:

     | Label | Value |
     |---|---|
     | "(ninguno)" | `none` |
     | "Sencillo" | `single` |
     | "Doble" | `double` |
     | "Punteado" | `dotted` |
     | "Solo palabras" | `words` |

   * "Color de fuente:" compact picker:
     * an "Automático" button;
     * a 10-column grid of 14×14 swatches: the neutrals `#FFFFFF #000000 #E7E6E6 #44546A`,
       then the default theme `#2F5496 #C55A11 #548235 #7030A0 #C00000 #1F4E79`, then the 10
       standard colours (§4.9);
     * a hex box (max 7 characters, placeholder "#RRGGBB"; valid only as `#?[0-9a-f]{6}`);
     * a current-colour sample 22×14. `auto` shows black with the tooltip
       "Automático (negro)".
3. **Fieldset "Efectos"** with checkboxes "Tachado", "Subíndice" and "Superíndice".
   Subíndice and Superíndice are mutually exclusive: checking one unchecks the other.
4. **"Vista previa"**: a 64 px tall box with a centred sample "AaBbCcYyZz".
   * Font family, weight and style follow the state.
   * Size = `size × (0.65 if sub or sup, otherwise 1)` pt.
   * Colour (`auto` = black).
   * Vertical alignment sub or super.
   * Underline (double or dotted when chosen) and strike-through.
5. A note (11 px `#605E5C`): "Esta es una fuente TrueType. Se usará la misma fuente en la
   pantalla y en la impresora."

**Buttons:** "Aceptar" (primary) and "Cancelar".

**On Accept**

* `delta` = the keys among `font, size, bold, italic, underline, strike, sub, sup, color`
  whose value **changed** from the initial state.
* If `delta.sub` is true and sup changed, add `sup: false`. Do the same the other way round.
* If the delta is empty, do nothing.
* If the target range is collapsed, expand it to the word.
* If a font changed, call `noteFontUsed`.
* Apply with **one** `applyCharFormat(range, delta)`.

### 12.3 "Párrafo"

Source: `d/paragraph`. Opened by `paragraph-dialog` (Párrafo group launcher, Disposición →
Párrafo launcher, or "Opciones de interlineado…"). Width 520.

**Initial state**

* Read from `currentFormat().para`.
* Defaults: align `left`, line 276, before 0, after 160, left 0, right 0, first 0.

**Fieldsets**

1. **"General":** "Alineación:" select with "Izquierda", "Centrada", "Derecha" and
   "Justificada".
2. **"Sangría":**
   * "Izquierda:" and "Derecha:" text boxes in **cm** with 2 decimals, es-ES formatting
     (`toLocaleString`), unit label "cm".
   * "Especial:" select with "(ninguno)", "Primera línea" and "Francesa".
   * "En:" in cm. Initial value = `|first|` in cm, or **1,25** when `first` is 0. Disabled
     when Especial is "(ninguno)".
   * `first = +twips(cm)` for "Primera línea", `−twips(cm)` for "Francesa", 0 for none.
3. **"Espaciado":**
   * "Antes:" and "Después:" in **pt** with 1 decimal, unit "pt".
   * "Interlineado:" select:

     | Label | Value |
     |---|---|
     | "Sencillo" | 240 |
     | "1,15" | 276 |
     | "1,5" | 360 |
     | "Doble" | 480 |

     If the current value is not one of these, an extra option `"Múltiple ({line/240})"` is
     added, formatted with 2 decimals.
4. **"Vista previa":** two grey placeholder lines, a sample paragraph ("Texto de ejemplo" × 10)
   styled from the state, then two more grey lines. Scale: 16 px per cm.
   * Left margin, right margin and text indent are each clamped to ±60–90 px.
   * Hanging indent is drawn with left padding.
   * Top and bottom margins = `min(24, pt*0.35)`.
   * Line height = `line/240`.

**Parsing:** comma or point decimal. Invalid input is ignored and the last valid value is
kept. There is no explicit min or max, so negative indents are possible.

**On Accept** (`d/paragraph:293-312`)

* The delta contains only keys whose control the user **touched** (`tocado` set) **and**
  whose value differs from the initial one.
* This avoids spurious deltas from the cm↔twips rounding.
* Apply with one `applyParaFormat`.

**[NOT IMPLEMENTED]** The "Líneas y saltos" tab (widow/orphan control, keep with next, page
break before), tab stops and outline level. The model supports them.

### 12.4 "Ir a"

Source: `d/goto`. Opened by `goto` (F5). Width 520.

**Layout**

* **Left list** (148 px wide, max height 232) of destination kinds:

  | Kind | Label |
  |---|---|
  | `page` | "Página" (default) |
  | `heading` | "Título" |
  | `bookmark` | "Marcador" |
  | `comment` | "Comentario" |
  | `footnote` | "Nota al pie" |
  | `table` | "Tabla" |

  The active kind has an accent background and white text.
* **Right side:**
  * text box, 13 px;
  * a list (max height 180);
  * a hint line.

**Kind = page**

* Placeholder "Número de página (admite +3 o -2)".
* The list shows one line: "Escribe el número de página y pulsa Ir a."
* Hint `"El documento tiene {n} página(s)."`
* Input:
  * `+N` or `−N` is relative to the caret's page;
  * otherwise an absolute number;
  * the result is rounded and clamped to `[1, pageCount]`.
* Target: the first line of the first item of that page.

**Other kinds**

* Placeholder "Filtrar…". Filtering is a case-insensitive substring match.
* Hint `"{n} destino(s)."`
* Item texts:
  * Headings: indented by two spaces per level after the first.
  * Bookmarks: the bookmark name.
  * Comments: `"{author}: {text}"`, truncated to 70 characters.
  * Footnotes: `"{n}. {first 60 characters}"`.
  * Tables: `"Tabla {i} ({rows} filas)"`.
* An empty list shows "No hay destinos de este tipo."
* Clicking selects an item; double-clicking jumps and closes the dialog.

**Keys in the text box**

* Enter: jump (the dialog stays open).
* ↓ / ↑: move the selection.
* **Pitfall:** ↓ has no upper clamp.

**Buttons**

* "Ir a" (primary): jumps and **stays open**.
* "Cerrar".

### 12.5 "Símbolo"

Source: `d/insert:145-255`. Opened by `insert:symbol-dialog`. Width 460.

**Tabs**

* Active tab: white, bordered, weight 600.
* "Símbolos":
  * "Subconjunto" select;
  * a grid of 12 columns, 30 px rows, 17 px document font, max height 210;
  * the active cell has an accent background with white text;
  * a footer with a 22 px preview and `"Código de carácter: U+XXXX"` (upper-case hex padded
    to 4 digits).
* "Caracteres especiales": a list of name and shortcut pairs.

**Subsets** (`js/editor/insert.js:196-241`):

| id | Name | Characters |
|---|---|---|
| `recientes` | Símbolos usados recientemente | `€ £ ¥ © ® ™ ± ≠ ≤ ≥ ÷ × ∞ µ α β π Ω ° ·` (static list) |
| `latino` | Latín extendido | `á é í ó ú ü ñ Á É Í Ó Ú Ü Ñ ç Ç à è ì ò ù â ê î ô û ä ë ï ö` |
| `puntuacion` | Puntuación general | `¿ ¡ « » “ ” ‘ ’ – — … • ‰ † ‡ § ¶ ‹ › ·` |
| `moneda` | Símbolos de moneda | `€ $ £ ¥ ¢ ₡ ₱ ₩ ₪ ₫ ₭ ₮ ₹ ₽ ₴ ₦` |
| `matematicos` | Operadores matemáticos | `± × ÷ ≠ ≈ ≡ ≤ ≥ √ ∑ ∏ ∫ ∂ ∆ ∇ ∈ ∉ ∩ ∪ ⊂ ⊃ ∞ ∝ ∴ ° ′ ″ ƒ ¬ ∅ %` |
| `griego` | Griego y copto | `α β γ δ ε ζ η θ ι κ λ μ ν ξ π ρ σ τ φ χ ψ ω Γ Δ Θ Λ Ξ Π Σ Φ Ψ Ω` |
| `flechas` | Flechas | `← ↑ → ↓ ↔ ↕ ⇐ ⇑ ⇒ ⇓ ⇔ ↵ ➔ ➜ ➤ ⌂` |
| `formas` | Formas y viñetas | `■ □ ▪ ▫ ● ○ ◘ ◙ ◦ ★ ☆ ✓ ✔ ✗ ✘ ☐ ☑ ♠ ♣ ♥ ♦` |

**Special characters** (`js/editor/insert.js:243-256`):

| Character | Name | Shortcut shown |
|---|---|---|
| — | Guion largo (em) | Alt+Ctrl+Num - |
| – | Guion corto (en) | Ctrl+Num - |
| U+00A0 | Espacio de no separación | Ctrl+Mayús+Espacio |
| U+2011 | Guion de no separación | Ctrl+Mayús+- |
| U+00AD | Guion opcional | Ctrl+- |
| … | Puntos suspensivos | Alt+Ctrl+. |
| © | Copyright | Alt+Ctrl+C |
| ® | Marca registrada | Alt+Ctrl+R |
| ™ | Marca comercial | Alt+Ctrl+T |
| § | Símbolo de sección | (none) |
| ¶ | Símbolo de párrafo | (none) |
| ‰ | Por mil | (none) |

None of these shortcuts is implemented (§8.2).

**Interaction**

* Click selects a character.
* Double-click inserts it immediately.

**Buttons**

* "Insertar" (primary): inserts the chosen character as text and **always keeps the dialog
  open**. The `onClick` returns `false` in both branches, mirroring Word's "Insertar".
* "Cerrar".

### 12.6 "Fecha y hora"

Source: `d/insert:266-322`. Opened by `insert:datetime`. Width 400.

**Layout**

* Label "Formatos disponibles:".
* A list of formats computed from the current date (`js/editor/insert.js:100-121`).
  * `MESES` and `DIAS` are the Spanish month and weekday names in lower case.
  * The default selection is the 3rd entry.

  | Key | Example | Field code |
  |---|---|---|
  | `d/M/yyyy` | 3/10/2026 | DATE |
  | `dd/MM/yyyy` | 03/10/2026 | DATE |
  | `d MMMM yyyy` | 3 de octubre de 2026 | DATE |
  | `dddd, d MMMM yyyy` | sábado, 3 de octubre de 2026 | DATE |
  | `MMMM yyyy` | octubre de 2026 | DATE |
  | `d/M/yyyy H:mm` | 3/10/2026 9:05 | DATE |
  | `H:mm` | 9:05 | TIME |
  | `H:mm:ss` | 9:05:07 | TIME |
  | `h:mm a` | 9:05 a. m. (or "p. m.") | TIME |

* Checkbox "Actualizar automáticamente" (default off).
* Hint: "Con la casilla marcada se inserta un campo que se recalcula al abrir el documento;
  sin marcar, la fecha queda fija como texto."

**Insert:** with the checkbox ticked, insert a field `{code: DATE or TIME, result: label}`;
otherwise insert the label as plain text. Double-clicking a format inserts it.

**Buttons:** "Aceptar" (inserts) and "Cancelar".

**Pitfall:** when the box is ticked, the field code carries **no format switch**. A recompute
cannot reproduce the chosen format. **[NATIVE NOTE]** Store the format key, e.g. as
`\@ "d 'de' MMMM 'de' yyyy"`.

### 12.7 "Insertar hipervínculo"

Source: `d/insert:343-400`. Opened by `insert:hyperlink`. Width 460.

**Fields**

* "Texto": the selected text with newlines replaced by spaces; placeholder "Texto que se
  mostrará".
* "Dirección": placeholder "https://ejemplo.com". Gets focus when the dialog opens.
* "Info. en pantalla": placeholder "Texto que aparece al pasar el ratón".
* Hint: "Ctrl+clic sobre el vínculo lo abre en una pestaña nueva."

**URL normalisation** (`normalizeUrl`)

1. Trim. If empty, return `''`.
2. If it starts with `https?:`, `mailto:`, `tel:` or `ftp:` (case-insensitive), keep it.
3. If it looks like an email (`x@y.z`), prefix `mailto:`.
4. If it starts with `www.`, or looks like a domain (`a.b` optionally followed by `/`),
   prefix `https://`.
5. Otherwise keep it as typed.

**Validation:** an empty URL focuses the field and returns `false`, so the dialog stays open.

**Apply** (one batch named "Insertar hipervínculo")

* `char = {link: url}`, plus `linkTip` when the tooltip field is not empty.
* If there is a selection **and** the text field is empty or unchanged: apply `char` to the
  selection.
* Otherwise insert the text (or the URL when the text is empty) as a new run with `char`.

**Buttons:** "Aceptar" and "Cancelar".

### 12.8 "Marcador"

Source: `d/insert:407-497`. Opened by `insert:bookmark`. Width 400.

**Fields**

* "Nombre": placeholder "NombreDelMarcador".
* A list of the document's bookmarks. When there are none: "El documento no tiene
  marcadores."
* Hint: "El nombre debe empezar por letra y no admite espacios (regla de Word)."

Clicking a list item selects it and copies its name into the field.

**Name validation:** `^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ_][\wÁÉÍÓÚÜÑáéíóúüñ]{0,39}$`, i.e. at most 40
characters.

**Buttons**

| Button | Behaviour |
|---|---|
| "Agregar" (primary) | Invalid name: the hint changes to "Nombre no válido: debe empezar por letra y no llevar espacios." in `--wd-error`, and the dialog stays open. Valid: `setBookmark(name, selection.start)`, then close. |
| "Ir a" | Requires a selected bookmark. Moves the caret there and closes. |
| "Eliminar" | Requires a selected bookmark. Calls `removeBookmark`, refreshes the list, and **stays open**. |
| "Cerrar" | Closes. |

### 12.9 "Insertar tabla"

Source: `d/insert:508-576`. Opened by `insert:table-dialog`. Width 380.

**Fields**

| Field | Control | Default |
|---|---|---|
| "Columnas" | number, 1–20 | **5** |
| "Filas" | number, 1–50 | **2** |
| "Alineación" | select: Izquierda / Centrada / Derecha | Izquierda |
| "Mostrar todos los bordes" | checkbox | ✓ |
| "Repetir la primera fila en cada página" | checkbox | ☐ |

**On Accept**

* `parseInt` each number and clamp it. Invalid input becomes 1.
* In one batch named "Insertar tabla":
  1. route `insert:table {rows, cols}`;
  2. `setTableProps(cell.tableId, {align, borders: 'grid' or 'none', repeatHeader})`.

### 12.10 "Portada"

Source: `d/insert:608-675`. Opened by `insert:cover-dialog`. Width 460.

**Design cards:** three flexible cards, "Simple", "Austin" and "Faceta" (default Simple).

* Card: 2 px border, accent when active, radius 4.
* Each card has a 96 px schematic thumbnail made of grey bars (`#A19F9D`). Bar positions are
  `(left %, top %, width %, height px)`:
  * Austin: (12,30,62,9) (12,46,40,4) (12,76,30,3) (12,84,24,3)
  * Faceta: (20,28,60,9) (28,45,44,4) (2,58,96,2) (30,76,40,3)
  * Simple: (18,32,64,9) (26,49,48,4) (32,78,36,3)
* Name: 11 px.

**Fields**

* "Título": the document name without `.docx`, or "Título del documento".
* "Subtítulo": "Subtítulo".
* "Autor": empty.
* Checkbox "Incluir la fecha ({long date})", checked by default.

**On Accept:** insert the cover fragment at the start of the document. An empty title becomes
"Título del documento".

**Cover fragment structure** (`js/editor/insert.js:135-178`):

1. An empty Normal paragraph with `after: 0`. It merges into the paragraph at the insertion
   point.
2. Title paragraph (style `Title`), subtitle paragraph (style `Subtitulo`), an optional bold
   author paragraph (Normal), and an optional date paragraph (Normal).
3. A paragraph containing a page break.
4. An empty paragraph.

Alignment and spacing per design (twips):

| Design | Title | Subtitle | Author / date |
|---|---|---|---|
| Austin | left; before 2400, after 120 | after 2400 | left |
| Faceta | center; before 3000, after 120 | after 2000 | center |
| Simple | center; before 2800, after 160 | after 2600 | center |

### 12.11 Dialogs of Disposición, Diseño, Referencias and Revisar

#### Shared layout blocks (`d/layout`)

Number rows use `<input type="number">` with a label 92 px wide. Values show up to 2 decimals.

**Margins block**

* Fieldset "Márgenes (cm)", 2×2 grid:

  | Field | Default |
  |---|---|
  | "Superior:" | 2,54 |
  | "Inferior:" | 2,54 |
  | "Izquierdo:" | 2,54 |
  | "Derecho:" | 2,54 |

  Step 0.1, min 0, max 200 (browser hint only; not enforced on read).
* Fieldset "Orientación": two 76 px cards, each with a sheet icon (30×40 or 40×30) and a
  label: "Vertical" / "Horizontal". Active card: accent border.
* Read: `round(cmToTwips(value))` for each margin, plus `orient`.

**Paper block**

* Fieldset "Papel".
* "Tamaño:" select: A4, Carta (Letter), Oficio (Legal), A3, A5, B5, Ejecutivo (Executive),
  Tabloide (Tabloid), plus "Personalizado" (value `''`).
* "Anchura:" and "Altura:" in cm, min 1, max 200.
* Pre-selection: the catalogue size that matches the current size within ±20 twips, in
  either orientation.
* Picking a size fills both measurements. Typing a measurement switches the select to
  "Personalizado".

**Columns block**

* Fieldset "Preestablecidas": five cards, "Una", "Dos", "Tres", "Izquierda" (1:2) and
  "Derecha" (2:1). Each has a 34 px thumbnail of grey bars whose flex weights follow the
  ratio.
* Fieldset "Ancho y espacio":
  * "Número:" 1–12, step 1;
  * "Espacio:" in cm, 0–10, default `twipsToCm(spacing ?? 708)`;
  * checkbox "Línea entre columnas" (`sep`).
* Typing in "Número" clears the preset ratio.
* Initial preset: one, two or three according to the current count.
* Read:
  * `count = clamp(round(n), 1, 12)`;
  * `spacing = round(cmToTwips(value))`, falling back to 1.25 cm;
  * `widths`, only when a ratio is set **and** its length equals `count`:

    ```
    util   = max(1, textColumnWidth − spacing*(count−1))
    widths = round(util*r/Σr) for each ratio entry r
    last  += util − Σwidths          # absorbs the rounding remainder
    ```

    `textColumnWidth = max(1440, page.w − margins.left − margins.right)`. The ribbon presets
    use the same algorithm (`main:1758-1785`).

**Layout ("Diseño") block**

* Fieldset "Encabezados y pies":
  * "Primera página diferente" (`differentFirst`)
  * "Páginas pares e impares diferentes" (`differentEven`)
* Fieldset "Desde el borde (cm)":
  * "Encabezado:" (`headerDist`, default 1,25)
  * "Pie de página:" (`footerDist`, default 1,25)
  * Both: step 0.1, 0–10.
* Fieldset "Texto": "Partir palabras con guion automáticamente" (`hyphenation`).

#### The dialogs

| Dialog | Title | Width | Contents | On Accept |
|---|---|---|---|---|
| Márgenes personalizados (`layout:margins-dialog`) | "Configurar página — Márgenes" | 460 | Margins block | Batch "Configurar página": `setMargins`, then `setPageSize({orient})` |
| Más tamaños de papel (`layout:size-dialog`) | "Configurar página — Papel" | 460 | Paper block | `setPageSize({w, h})`. Orientation is not updated. |
| Más columnas (`layout:columns-dialog`) | "Columnas" | 460 | Columns block | `setColumns(section, {count, spacing, widths, sep})` |
| Configurar página (group launcher) | "Configurar página" | 480 | Tabs "Márgenes", "Papel", "Diseño" | Batch: `setMargins`, `setPageSize({w, h, orient})`, `setSectionFlags(flags)`, `setSectionProps({hyphenation, page: {...page, headerDist, footerDist}})` |

**Pitfall in "Configurar página":** the `page` object in `setSectionProps` is a copy taken
**before** the batch runs. `setSectionProps` **replaces** `section.page`
(`commands/registry.js:1158-1177`). Depending on whether `setPageSize` mutates the page in
place, this can silently revert a size change made in the same dialog. **[NATIVE NOTE]** Merge
only `headerDist` and `footerDist` into the **current** page after applying the margins and
the size.

#### Diseño dialogs (`d/design`)

Labels are 104 px wide. Colour pickers are 44×28.

**"Marca de agua"** (`design:watermark-dialog`, width 440)

Fields, defaults taken from `doc.watermark`:

| Field | Default | Constraints |
|---|---|---|
| "Texto:" | "CONFIDENCIAL" | |
| "Fuente:" | Aptos | select of every catalogue font; a font outside the catalogue is added at the top |
| "Tamaño (px):" | 0 | 0–400, step 4 |
| "Color:" | `#C8C6C4` | colour picker |
| "Opacidad (%):" | 40 | 5–100, step 5 |
| "En diagonal" | ✓ | checkbox |

Preview:

* 118 px tall, bold text.
* Displayed size = the size value, or 44 px when it is 0.
* Opacity = value/100, or 40 % when invalid.
* Rotated −35° when diagonal.

Hint: "Con el tamaño en 0 la marca se ajusta sola al ancho de la página."

Buttons:

* "Aceptar": empty text means `watermark: null`. Otherwise
  `{text, font, size (0 if invalid), color, diagonal, opacity: (n or 40)/100}`.
* "Quitar": `watermark: null`.
* "Cancelar".

**"Bordes de página"** (`design:borders-dialog`, width 420)

| Field | Options / constraints | Default |
|---|---|---|
| "Estilo:" | none "Ninguno", solid "Continuo", double "Doble", dashed "Discontinuo", dotted "Punteado", groove "Con relieve" | current or `none` |
| "Color:" | colour picker | `#000000` |
| "Ancho (px):" | 0.5–12, step 0.5 | 1 |
| "Margen (px):" | 0–96, step 2 | 24 |

Preview: a 120×88 sheet with an inner frame at inset `min(28, margin/3)`.

Hint: "El borde se dibuja dentro de la página y no altera el área de texto."

Accept: style `none` means `pageBorder: null`. Otherwise
`{style, color, width (n or 1), space (n or 24)}`.

**Pitfall:** a margin of 0 becomes 24 because of `|| 24`.

#### Referencias dialogs (`d/references`)

**"Administrar fuentes"** (`ref:sources`, width 520)

* "Estilo:" select: APA, MLA, Chicago, ISO690. Defaults to `doc.citationStyle` or APA.
* Toolbar buttons "Nueva" and "Eliminar".
* A list of sources, each formatted with `formatReference(source, style)`. When empty:
  "No hay fuentes registradas."
* Form fields:
  * "Autor:" (placeholder "Apellidos, Nombre")
  * "Título:", "Año:", "Editorial:", "Ciudad:", "URL:"
* A live preview of the formatted reference. With no sources and no author:
  "Añade una fuente para ver aquí su formato."
* Note: "Las fuentes se guardan con el documento y alimentan la bibliografía."
* Switching sources first saves the form into the current one.
* Accept: drop sources without an author **and** without a title, then
  `setDocProps({sources, citationStyle})`.

**"Insertar cita"** (`ref:citation`, width 480)

* With no sources: a body with "Todavía no hay fuentes. Añádelas primero en «Administrar
  fuentes»." and the buttons "Administrar fuentes…" (opens that dialog) and "Cancelar".
* Otherwise:
  * the list of sources;
  * "Página:" (placeholder "opcional");
  * a preview of `formatCitation({...source, page}, style)`.
* "Insertar" replaces the selection with the citation text.

**"Insertar título"** (`ref:caption`, width 460)

* "Rótulo:" select: Figura, Tabla, Ecuación. Defaults to the parameter.
* "Título:" (placeholder "Descripción de la ilustración").
* "Posición:" select: "Debajo de la selección" (`below`, default) or "Encima de la selección"
  (`above`).
* Preview `"{Rótulo} {n}"`, plus `". {text}"` when a text is entered.
* `n` = 1 + the number of existing captions with that label. The number is computed for the
  label **passed in when the dialog opens**, not the one chosen later. **Pitfall:** switching
  the label inside the dialog keeps the old number.
* Accept inserts the caption block after the anchor: the selection's end block for "below",
  or the block before the start block for "above".

**"Referencia cruzada"** (`ref:cross`, width 460)

* "Tipo:" select: Título (`heading`), Marcador (`bookmark`), Título de ilustración
  (`caption`).
* "Referencia a:" select:
  * "Texto del elemento" (`text`)
  * "Número de página" (`page`) → `"página {n}"`
  * "Texto y página" (`both`) → `"{text} (página {n})"`
* A list of targets. When empty: "No hay elementos de este tipo."
* Note: "La referencia se inserta como texto con vínculo al destino."
* "Insertar" inserts a text run with `link: '#{blockId}'`. It returns `false` when there is
  no target.

**"Notas al pie y notas al final"** (`ref:notes-dialog`, width 420)

* Preview text: `"Notas al pie: {a}\nNotas al final: {b}"`.
* Note: "Las notas al pie se colocan al fondo de la página donde está su marca; las notas al
  final, todas juntas al terminar el documento."
* Buttons:
  * "Convertir todas en notas al final"
  * "Convertir todas en notas al pie"
  * "Cerrar" (primary)
* **Pitfall:** the conversion mutates `block.fn.kind` **directly**, inside an empty batch, and
  then calls `setDocProps({notesConvertedAt: Date.now()})` only to trigger a relayout. It is
  **not undoable** and leaves a junk property. **[NATIVE NOTE]** Implement a real undoable
  command.

#### Revisar dialogs (`d/review`)

**"Contar palabras"** (`review:word-count`, width 380)

* Rows: label on the left, bold tabular number on the right, separated by `#C8C6C4` lines.
* Rows: "Páginas", "Palabras", "Caracteres (sin espacios)", "Caracteres (con espacios)",
  "Párrafos", "Líneas".
* Line count = the sum of laid-out lines over all pages.
* Note: "Los encabezados y los pies de página no se cuentan, igual que en Word."
* Button: "Cerrar".

**"Idioma"** (`review:language`, width 380)

* Note "Idioma de revisión del documento:" above a full-width select:

  | Code | Label |
  |---|---|
  | `es-ES` | Español (España) |
  | `es-MX` | Español (México) |
  | `es-AR` | Español (Argentina) |
  | `es-CO` | Español (Colombia) |
  | `en-US` | Inglés (Estados Unidos) |
  | `en-GB` | Inglés (Reino Unido) |
  | `pt-BR` | Portugués (Brasil) |
  | `fr-FR` | Francés (Francia) |
  | `de-DE` | Alemán (Alemania) |
  | `it-IT` | Italiano (Italia) |
  | `ca-ES` | Catalán |
  | `gl-ES` | Gallego |
  | `eu-ES` | Euskera |

* Note: "El idioma decide el formato de las fechas que se insertan, la voz de «Leer en voz
  alta» y el rótulo de la barra de estado." (The last part is not true; see §9.)
* Accept: `setDocProps({locale})`.

**"Restringir edición"** (`review:protect`, width 420)

* Radio group, each option with a bold title and a help line:

  | Value | Title | Help |
  |---|---|---|
  | `none` | "Sin restricciones" | "El documento se puede editar con libertad." |
  | `tracked` | "Cambios controlados" | "Se puede escribir, pero todo queda marcado como revisión." |
  | `comments` | "Solo comentarios" | "El texto no se puede cambiar; sí se pueden añadir comentarios." |
  | `readOnly` | "Solo lectura" | "El documento no admite ninguna modificación." |

* Note: "La restricción vive en el documento: se guarda con él y sigue activa al volver a
  abrirlo."
* Buttons: "Aplicar" → `setProtection({mode})`, and "Cancelar".
* Effects (`main:297-357`):
  * `readOnly` and `comments` turn every content command into a no-op and show the
    saved-state warning.
  * Annotation commands are blocked only for "ver" share links.
  * `readOnly` hides the caret and uses the default cursor.

**"Comparar documentos"** (`review:compare`, width 440)

* Note "Comparar el documento actual (revisado) con:".
* A select of saved files. It shows "Cargando documentos…" first, then the file names, or
  "No hay documentos guardados", or "No se pudo consultar el servidor".
* Note: "Se genera un documento nuevo donde lo añadido aparece subrayado y lo suprimido,
  tachado. Puedes aceptar o rechazar cada cambio desde esta misma pestaña."
* "Comparar": loads the chosen document and runs
  `replaceBody(compareDocuments(original, current, {author}))`.
* **Pitfall:** the note says a new document is created, but the current body is
  **replaced** (undoable). **[NATIVE NOTE]** Open the result in a new window, as the text
  promises, or reword the note.

### 12.12 "Insertar ecuación" / "Editar ecuación"

Source: `d/equation`. Width 520.

**Title**

* `ctx.title`, or "Editar ecuación" when there is a source, or "Insertar ecuación".
* When editing from a double-click, `main:2069` passes the title explicitly.

**Fields**

* A text box: placeholder "Ej.: x = (-b +- sqrt(b^2 - 4 a c))/(2 a)", initial value = the
  existing source.
* A live preview rendered by the real math engine at Aptos 16 pt, colour `#201F1E`.
  * Empty input: "Escribe la ecuación en notación lineal…".
  * Parse error: the linearised source.
* A gallery of the 7 examples (§5.2), each a name plus its source. Clicking one fills the
  text box.
* Help text, verbatim:
  "Notación: `x^2` superíndice · `a_1` subíndice · `a/b` fracción · `sqrt(x)` raíz ·
  `pi alpha Omega` griego · `+- <= >= != ->` signos · `sum int inf` operadores."

**Keys:** Enter confirms and closes.

**Buttons:** "Insertar" (or "Guardar" when editing) and "Cancelar". An empty source inserts
nothing.

When editing, the new math run replaces the old one (range `start .. start+1`) with a single
undo entry.

### 12.13 "Insertar SmartArt" / "Editar SmartArt"

Source: `d/smartart`. Width 500.

**Kinds** (one button each; default `process`):

| id | Name | Hint |
|---|---|---|
| `list` | Lista | "Bloques apilados con niveles" |
| `process` | Proceso | "Pasos con flechas" |
| `cycle` | Ciclo | "Etapas alrededor de un círculo" |
| `hierarchy` | Jerarquía | "Organigrama" |
| `pyramid` | Pirámide | "Niveles apilados en triángulo" |

**Text area**

* One item per line. Two leading spaces make a child item.
* Placeholder: "Un elemento por línea\n  Dos espacios delante = subelemento".
* Default "Planificar\nDiseñar\nConstruir\nEntregar", or the serialised existing items.

**"Color:"** six swatches: `#4472C4 #ED7D31 #70AD47 #FFC000 #7030A0 #C00000`.

**Preview**

* Laid out at a 640 px reference width.
* Scale = `min(previewWidth/640, 146/layoutHeight, 1)`.
* Uses the same shape CSS as the page. Arrows are drawn as ➜.

**Hint:** "La sangría de dos espacios crea subelementos (en la jerarquía son los
subordinados; en la lista, bloques sangrados)."

**Buttons:** "Insertar" or "Guardar", and "Cancelar".

* No items: return `false` (the dialog stays open).
* Edit: `updateSmartArt(blockId, {kind, items, props: {color}})`.
* New: insert the block after the caret's block.

### 12.14 Correspondencia dialogs (`d/mailmerge`)

**"Seleccionar destinatarios"** (`mail:recipients`, and after `mail:start`; width 560)

* Note: "Pega la lista en formato CSV (la primera fila son los nombres de campo) o carga un
  archivo .csv exportado de una hoja de cálculo."
* Text area:
  * placeholder "Nombre,Apellidos,Empresa,Direccion,CP,Ciudad\nAna,Pérez López,Acme,Calle
    Mayor 1,28001,Madrid";
  * pre-filled with the current list re-serialised with commas.
* "Desde archivo:": a file picker accepting `.csv,.tsv,.txt`, read as UTF-8.
* Live preview: a table of up to 30 rows, then `"{r} destinatario(s) · {f} campo(s)"`.
* Accept: `setDocProps({mailMerge: parseDelimited(text)})`.

**"Destinatarios de la combinación"** (`mail:edit-list`, width 560)

* A read-only table of up to 200 rows, then `"{n} destinatario(s) en la lista."`
* Buttons:
  * "Editar la lista…" opens the dialog above.
  * "Vaciar la lista" sets `mailMerge` to `{fields: [], records: []}`.
  * "Cerrar" (primary).
* With no fields, the table area shows "Todavía no hay destinatarios."

**"Insertar campo combinado"** (`mail:field`)

* With no fields (width 420): "Primero hay que seleccionar los destinatarios: sus columnas
  son los campos." and the buttons "Seleccionar destinatarios…" (primary) and "Cancelar".
* Otherwise (width 460): "Elige el campo que quieres intercalar:", then one chip per field.
  Clicking a chip inserts the field and closes. Button: "Cerrar".

`mail:address-block` and `mail:greeting` insert their fragments directly, with no dialog.

**"Sobres"** (`mail:envelope`, width 480)

* "Tamaño:" select:

  | id | Label | Twips (w × h) |
  |---|---|---|
  | `DL` | "DL (110 × 220 mm)" | 12474 × 6237 |
  | `C5` | "C5 (162 × 229 mm)" | 12983 × 9185 |
  | `C6` | "C6 (114 × 162 mm)" | 9185 × 6464 |
  | `Americano` | "Americano (9,5 × 4,1")" | 13680 × 5904 |

* "Remitente:" text area (min height 76), placeholder "Remitente (una línea por renglón)".
* "Destinatario:" text area (min height 96), placeholder "Destinatario (una línea por
  renglón)".
* Note: "El sobre sustituye el contenido del documento actual y ajusta el tamaño del papel."
* "Crear sobre": one batch that sets the page size and margins of **section 0** and replaces
  the body.

**"Etiquetas"** (`mail:labels`, width 480)

* "Formato:" select:

  | id | Label |
  |---|---|
  | `3x8` | "3 × 8 (24 etiquetas, 70 × 37 mm)" |
  | `2x7` | "2 × 7 (14 etiquetas, 105 × 42 mm)" |
  | `2x4` | "2 × 4 (8 etiquetas, 105 × 74 mm)" |
  | `1x10` | "1 × 10 (10 etiquetas, 210 × 29 mm)" |

* "Contenido:" select:
  * "El mismo texto en todas" (`text`)
  * "Un destinatario por etiqueta" (`records`), the default when there are records.
* Text area, placeholder "Texto de la etiqueta".
* Note: `"Hay {n} destinatario(s) cargados."`, or "Sin destinatarios cargados: se usará el
  texto de arriba en todas las etiquetas."
* "Crear hoja": inserts a borderless table at the **start** of the document. Each cell's text
  has its lines joined with `" · "` (`main:1128-1152`).

### 12.15 "Compartir"

Source: `d/share`. Opened by the title-bar button. Width 480. No title text and no footer.

**Body**

* H1 "Compartir", followed by the document name.
* "Enviar a": an email input, placeholder "alguien@ejemplo.com".
* Radio group:
  * "Puede ver" (default), detail "Solo lectura: leer, imprimir o guardar una copia."
  * "Puede editar", detail "Sus cambios se guardan en el documento original."
* An error line.
* Primary button "Enviar enlace".
* A result block, hidden until a link is created.
* H2 "Personas con acceso", followed by the list of existing links.

**Send**

1. Validate the email (browser type=email check). On failure: "Escribe un correo electrónico
   válido."
2. Run `ensureSaved()`.
3. If there is no id: "El documento aún no está guardado en el servidor."
4. `createShare(id, email, mode)`.
5. On success:
   * clear the input;
   * show "Enlace enviado a {email}." or "No se pudo enviar el correo a {email}; copia el
     enlace y hazlo llegar tú.";
   * show a read-only link field and a "Copiar" button (reads "Copiado" for 2 s).
6. On error: the server message, or "No se pudo conectar con el servidor."

Enter in the email field sends.

**Access list**

* No id: "Guarda el documento para poder compartirlo."
* While loading: "Consultando…"
* Empty: "Todavía no has compartido este documento."
* Error: "No se pudo consultar la lista de accesos."
* Each row:
  * the email;
  * `"{Puede editar|Puede ver} · {dd/mm/yyyy}"`;
  * buttons "Copiar enlace" (reads "Copiado" for 2 s) and "Revocar" (disabled while running,
    then the list reloads).

**[NATIVE NOTE]** Server-dependent. Keep it behind an optional cloud connector, or hide the
button.

### 12.16 Ayuda dialogs (`d/help`)

**"Ayuda de Skriba"** (`help:open`, F1; width 620)

* A tab strip with one tab per ribbon area: Inicio, Insertar, Disposición, Diseño,
  Referencias, Revisar, Vista, Dibujar, Correspondencia.
* Each tab lists "title → description" rows.
* Port the texts verbatim from `d/help:132-183`.
* Button "Cerrar".

**"Atajos de teclado"** (`help:shortcuts`, width 600)

* Groups: Archivo, Edición, Formato, Inserción, Vista, Revisión.
* Keys are drawn as key caps, splitting the shortcut on `" / "`.
* Texts verbatim from `d/help:90-129`.
* Button "Cerrar".

**"Acerca de Skriba"** (`help:about`, width 720)

* The splash image `splashscreen.png`, 1177×733 scaled to fit.
* Text block:
  * `"Skriba 2.1 — procesador de textos con paginación real."`
  * a technology paragraph (`d/help:267-269`);
  * `"Documento actual: {name}"`, `"Idioma: {locale}"`, `"Palabras: {n}"`.
* `APP_VERSION = '2.1'`.
* **[NATIVE NOTE]** Update the technology paragraph to describe C++/JUCE.

**"Novedades de Skriba 2.1"** (`help:whats-new`, width 560): nine title/description rows
(`d/help:289-299`).

**"Enviar comentarios"** (`help:feedback`, width 480)

* A text area, placeholder "Cuéntanos qué funciona bien y qué no…".
* Note: "Skriba no envía nada a ningún servidor externo. El comentario se guarda **dentro del
  documento**, para que puedas compartirlo con quien quieras."
* "Guardar comentario": an empty text returns `false`. Otherwise
  `addComment(selection, {author: 'Comentarios de Skriba', text})`.
* "Cancelar".

### 12.17 "Documento importado" (import warnings)

Source: `main:104-144`.

Shown once after a `.docx` import, when the importer returned warnings. Width 520.

* Intro: "El documento se importó. Algunos elementos no tienen equivalente exacto en Skriba y
  se adaptaron o se omitieron:"
* A bulleted list of at most **12** warnings (12 px, line height 1.45, max height 260,
  scrolls).
* With more than 12: an extra item `"… y {n−12} avisos más"`.
* Button: "Aceptar".

### 12.18 "Iniciar sesión" / "Crear cuenta"

Source: `d/account`. Width 480. No title text and no footer. Body padding 0 56 44.

**Contents**

* Title: 30 px Light, `#323130`. "Iniciar sesión" or "Crear cuenta".
* Label "Cuenta de Skriba" with a link "¿Qué es esto?". The link toggles the hint "Tu cuenta
  de Skriba es el correo y la contraseña con los que guardas tus documentos en línea y los
  abres desde cualquier equipo."
* Email input, placeholder "alguien@ejemplo.com".
* "Contraseña" input. In register mode, the hint "Mínimo 8 caracteres." is shown.
* An error line.
* Primary button: "Iniciar sesión" or "Registrarse".
* Footer text:
  * login mode: "¿No dispones de una cuenta de Skriba?" with the link "Regístrate ahora";
  * register mode: "¿Ya dispones de una cuenta?" with the link "Inicia sesión".

**Validation**

* Invalid email: "Escribe un correo electrónico válido."
* Password shorter than 8: "La contraseña debe tener al menos 8 caracteres."
* Server errors are shown as returned.

Enter sends.

**Mandatory mode:** if the dialog closes without a successful login, it reopens after 250 ms.

**[NATIVE NOTE]** Optional in a desktop app.

---

## 13. Side panes

Common style (`wcss:253-421`):

* Width 336, white, padding 10 14 14, column layout, gap 8, scrolls vertically.
* Right border 1 px `#D9D9D9` with shadow `1px 0 3px rgba(0,0,0,.06)`. The comments pane uses
  a left border and a mirrored shadow instead.

Header:

* Title: 15 px, weight 600.
* Close button: 24×24, icon `close`.

Opening or closing a pane calls `onLayoutShift`, which refreshes the view, the ruler and the
caret.

### 13.1 "Buscar" / "Buscar y reemplazar"

Source: `d/find`.

**Title:** "Buscar", or "Buscar y reemplazar" in replace mode. Close tooltip "Cerrar (Esc)".

**Search field**

* Icon `find`, then an input with placeholder "Buscar en el documento", 13 px.
* The field has a `#C8C6C4` border that turns accent when focused.
* Error state: red text.

**Navigation row**

* A counter (12 px, `#605E5C`, ellipsis):
  * empty when there is no query;
  * "Sin resultados";
  * `"{active+1} de {n} resultado(s)"`, using "resultado" for exactly one.
* Previous button (`chevron-up`, tooltip "Resultado anterior (Mayús+F3)").
* Next button (`chevron-down`, tooltip "Resultado siguiente (F3)").
* Both 24×24, disabled when there are no matches.

**Options** (top border):

| Checkbox | Option |
|---|---|
| "Coincidir mayúsculas y minúsculas" | `matchCase` |
| "Solo palabras completas" | `wholeWord` |
| "Usar caracteres comodín" | `wildcards` |

All default to false.

**Toggle link** (`#0563C1`, 12 px): "Reemplazar…" or "Ocultar reemplazar".

**Replace section** (top border)

* Label "Reemplazar con" and an input.
* Buttons "Reemplazar" and "Reemplazar todos" (primary). They share the row width.

**Status line** (11 px; red for errors)

* `"Se muestran los primeros 5000 resultados."` when the result set was truncated.
* "Se realizó 1 reemplazo."
* `"Se realizaron {n} reemplazos."`, or `"Se realizaron {n} reemplazos (tope de 5000); repite
  la operación para continuar."` when truncated.
* Errors: "No se pudo reemplazar.", "No se pudieron aplicar todos los reemplazos.", and the
  pattern error "Patrón de búsqueda no válido. Revisa los comodines."

**Behaviour**

* Opening pre-fills the search field with the selected text when it has no newline and is at
  most 200 characters. It then searches from the caret and selects and focuses the input.
* Typing re-searches after **160 ms** and jumps to the first match at or after the caret.
* A document change re-searches after **220 ms** without jumping. This is suppressed while the
  pane itself is replacing.
* Find next and previous wrap around. With no active match they start from the caret.
* Enter goes to the next match (Shift+Enter: previous). If there are no matches yet, it runs a
  search.
* Escape closes. F3 and Shift+F3 navigate.
* "Reemplazar":
  * with no active match, it acts as find-next;
  * otherwise it replaces the active match and jumps to the next match after the inserted
    text.
* "Reemplazar todos": one batch named "Reemplazar todos", processed **from the last match to
  the first** so earlier offsets stay valid.
* Highlights:
  * every match: `rgba(255,214,0,.45)`;
  * active match: `rgba(255,140,0,.55)`.
  * They are cleared when the pane closes.
* Toggling with the same mode closes the pane; with a different mode it switches modes.
* Maximum number of matches: `MAX_MATCHES = 5000`.

### 13.2 "Navegación"

Source: `nav`.

**Header:** "Navegación"; close tooltip "Cerrar el panel de navegación".

**Tabs** (equal width, 12 px; active tab has accent text, a 2 px underline and weight 600):

* "Títulos" (default)
* "Páginas"

**"Títulos" tab**

* The outline from `outline(doc)`.
* Item: 12 px, padding 5 8, radius 3, ellipsis. Indent and colour by level:

  | Level | Weight | Left padding | Colour |
  |---|---|---|---|
  | 0 | bold | – | – |
  | 1 | – | 8 | – |
  | 2 | – | 22 | `#323130` |
  | 3 | – | 36 | `#323130` |
  | 4 or deeper | – | 50 | `#605E5C` |

* The active item (the caret's block) has a `#D5E1F2` background and weight 600.
* Clicking moves the caret to the start of the block, scrolls it into view and focuses the
  editor.
* Empty state: "Este documento no tiene títulos.<br><br>Aplica los estilos **Título 1**,
  **Título 2**… desde la galería de Inicio y aparecerán aquí."

**"Páginas" tab**

* One row per page: the page number (bold, 11 px, 22 px wide) and the first 60 characters of
  the first block that has lines, or "(sin texto)".
* Clicking goes to that block.
* Empty state: "Todavía no hay páginas que mostrar."

**Refresh:** debounced **220 ms** after `layout:done`. A selection change refreshes the
active heading.

**Pitfall:** the active highlight compares only the caret's block id with the heading's block
id. It is not "the heading whose section contains the caret".

**[NOT IMPLEMENTED]** Page thumbnails in the pane (`plan:565`). The "Páginas" tab is text
only.

### 13.3 "Comentarios" (right side)

Source: `cm`.

**Header:** "Comentarios"; close tooltip "Cerrar el panel de comentarios".

**List:** column, gap 8. Comments are sorted in document order: block index first, then
`start`.

**Card**

* 1 px `#C8C6C4` border, radius 6, white, padding 8 10, shadow `0 1px 2px rgba(0,0,0,.06)`.
* Active card: accent border plus a 1 px accent ring.
* Resolved card: opacity .58.

**Card header**

* Avatar: 24 px circle, white initials (10 px, bold) on the author colour (§2.2). Initials are
  `c.initials` or "?".
* Author: 12 px, weight 600, ellipsis. Falls back to "Autor".
* Action buttons:
  * `check`, tooltip "Marcar como resuelto" or "Reabrir el comentario". Toggles `resolved`.
  * `close`, tooltip "Eliminar el comentario".

**Card body**

* Quote: `«{commented text}»`, 11 px, `#605E5C`, 2 px left border, one line with ellipsis.
  Omitted when empty.
* Comment text: 12 px, preserves line breaks.
* Replies: `"{author}: {text}"`, separated by dashed top borders.
* **Only on the active card that is not resolved:** a text area (placeholder "Responder…") and
  a primary "Responder" button. Empty replies are ignored.

**Card click:** makes the card active, selects the commented range and scrolls it into view.

**Empty state:** "No hay comentarios.<br><br>Selecciona texto y pulsa **Nuevo comentario** en
la pestaña Revisar."

**Canvas highlights:** drawn only while the pane is open (§2.2 colours).

**Navigation:** next and previous wrap around and open the pane.

**"Eliminar todos":** one batch named "Eliminar todos los comentarios".

**Adding a comment:** `add()` asks for the text with a native prompt "Comentario:". An empty
text cancels. **[NATIVE NOTE]** Replace the prompt with an inline editor card.

**Refresh:** debounced **200 ms** after `layout:done`.

### 13.4 "Revisión" (proofing)

Source: `d/review:95-288`.

**Header:** "Revisión"; close tooltip "Cerrar el panel de revisión".

**Summary line** (12 px): "No se han encontrado problemas.", or `"{n} aviso(s) de escritura"`
(singular "aviso" for exactly one).

**Items**

* Card: `#C8C6C4` border, radius 5, padding 8 10. Hover border `#8A8886`. Active: accent ring.
* Contents:
  * rule label: 10 px, upper case, `#605E5C`;
  * message: 12 px;
  * buttons (11 px, padding 3 10):
    * `"Corregir: {suggestion}"` (primary), only when a suggestion exists;
    * "Omitir todas" for spelling warnings, "Omitir" otherwise;
    * "Agregar al diccionario", spelling warnings only.

**Rule labels**

| Rule | Label |
|---|---|
| Spelling | Ortografía |
| Double space | Espacios de más |
| Space before punctuation | Espacio antes del signo |
| Missing space | Falta un espacio |
| Repeated word | Palabra repetida |
| Lowercase after full stop | Minúscula tras punto |
| Missing opening sign | Falta el signo de apertura |
| Straight quotes | Comillas rectas |
| Ellipsis | Puntos suspensivos |

**Empty state:** "La revisión comprueba la ortografía (diccionario en español), la puntuación,
el espaciado y los signos de apertura.<br><br>No se han encontrado problemas."

**Behaviour**

* Opening runs a full check (proofing plus spelling with suggestions), sorted in document
  order, and activates the first warning.
* Activating a warning selects its range.
* "Corregir" replaces the range, re-checks on the next tick and activates the warning at
  `min(i, n−1)`.
* "Omitir todas" (spelling) ignores the word everywhere. "Omitir" removes only that warning.
* Re-check runs **400 ms** after `layout:done` while the pane is open.

**Pitfall:** the Help guide says "No lleva diccionario léxico", but spelling with a
dictionary **is** implemented. Trust the code.

---

## 14. Canvas visuals related to the UI

Source: `ccss`. The page rendering itself belongs to the layout spec.

**Canvas**

* Background `#E1DFDD`. Cursor: default arrow outside pages, I-beam over pages.
* The page holder is centred horizontally. Zoom scales it around its top centre.

**Pages**

* White, page shadow, 24 px gap.
* Header and footer bands at **opacity .65**.
* While a band is being edited:
  * the body is at opacity .4 and the edited band at 1;
  * a dashed top line (`#8A8886`) runs across the band, extending 8 px beyond it on each side.
  * The mode follows the caret: `syncBandEditing` on every selection change.

**Layers** (bottom to top, inside the holder)

| Layer | z | Notes |
|---|---|---|
| Watermark | 0 | |
| Body text | 1 | |
| Find highlights | 1 | |
| Spelling | 2 | |
| Image handles | 2 | |
| Ink | 3 | |
| Selection | 3 | |
| Caret | 4 | 1.5 px `#201F1E` |
| Table column grips | 4 | Hover `rgba(43,87,154,.18)`; cursor `col-resize` while dragging |

**Show gridlines** (Vista): over the page body only, 1 px lines every **18.9 px** (0.5 cm at
100 %) in both directions, colour `#D8E2F0`. Not printed.

**Paragraph marks** (Vista): a "¶" at the end of the last line of each paragraph, accent
colour at 55 % opacity.

**[NOT IMPLEMENTED]** Visible tab arrows, despite the CSS comment.

**Tables**

* Cell borders 1 px `#A6A6A6`.
* With borders off, screen-only dashed `#D9D9D9` gridlines are drawn.

**Image selection**

* 1 px accent frame plus **8** handles (corners and edge midpoints): 8×8 white squares with a
  1 px accent border, centred on their points.

**Format painter loaded:** cursor `cell` over the canvas and the pages.

**Tracked changes with "Mostrar marcas" off**

* Deleted runs are hidden.
* Inserted runs are drawn in normal text colour without underline.

**Read-only protection:** default cursor and no caret.

**Read mode:** ribbon and ruler hidden, the canvas fits to width. Escape returns to print
layout.

---

## 15. Template thumbnails (`th`)

`documentThumbnailSvg(doc)` returns SVG markup for the **first page**. It is used only in the
backstage gallery, inside a 168×218 box. It is an approximate render, not the layout engine.

**[NATIVE NOTE]** Better: render page 1 with the real engine into a `juce::Image` and cache it.
If that is too slow, port this algorithm.

**Constants**

| Constant | Value |
|---|---|
| Pixels per twip | `96/1440` |
| Average character width | `0.5 em` |
| Line height | `1.25 em` |
| Font | `"Aptos, Calibri, 'Segoe UI', sans-serif"` |

### 15.1 Page

* `W × H` from section 0 (`w = 11906`, `h = 16838` twips by default). Margins default to 1440.
* Draw a white rectangle with a `#C8C6C4` stroke.

### 15.2 Page border

Only when `doc.pageBorder.style` is not `none`.

* Inset = `space` (default 24). Stroke width = `max(1, width)`. Colour = `color`.
* For `double`, add an inner rectangle at `inset + 2*width` with stroke `max(0.8, width/2)`.

### 15.3 Header band

* Start at `y = headerDist` (default 720 twips).
* Draw every default-variant header paragraph in sequence.

### 15.4 Footer band

* Total height = `Σ (fontSize*1.25 + before + after)` over the default-variant footer
  paragraphs.
* Start at `y = H − footerDist − total`.

### 15.5 Body

* Start at `y = margin.top`. Skip header/footer blocks and table-cell blocks.
* For each paragraph:
  * If `pageBreakBefore` is set and this is not the first paragraph: stop.
  * Draw it (§15.6). If it would cross `H − margin.bottom`: stop.
  * If the paragraph contains a manual page break: stop after drawing it.
* Tables: draw them (§15.7); stop if they are cut.

### 15.6 Paragraph

1. Font size px = `max(4, size_pt * 96/72)`; line height = `fs * 1.25`.
2. **Text:** concatenate the runs:
   * `text` runs as is;
   * a tab as 4 spaces;
   * a field as its `result`;
   * a line break as a space.
3. **Wrap** greedily by words with `maxChars = max(4, floor(usableWidth / (fs*0.5)))`.
   `usableWidth = max(8, columnWidth − left − right)`.
4. **Shading:** a rectangle over the text lines.
5. **Alignment**
   * `start` at `x0 + left`;
   * `middle` at `x0 + left + usable/2`;
   * `end` at `x0 + width − right`.
6. **Text attributes:** baseline at `y + fs*0.95`; bold, italic and all caps are applied.
7. **List marker** (first line only) at `x0 + left + min(0, first)`.
8. **Bottom border**, when set:
   * stroke width = `max(0.8, sz/8 * 96/72)`;
   * y = after the last line `+ space*20*PX*0.5 + 1`.
9. **Top border:** 1 px, at `y + before − 1`.
10. **Height consumed** = `before + lines*lh + after`. If the lines would pass the limit
    (plus 0.5), the paragraph is cut.

### 15.7 Table

1. Column widths: `cols` in twips, scaled down proportionally when their sum exceeds the
   width.
2. Border colour = `borderColor`, default `#8A8886`, stroke 0.8. No stroke when
   `borders == 'none'`.
3. Cell padding: x = `cellMargins.left` (default 108 twips); y = `cellMargins.top + 1 px`.
4. Row height = max over cells of `2*padY + Σ(lines*fs*1.25 + after)`, and at least the row's
   `height`.
5. Merged cells: skip continuation cells; `gridSpan` widens a cell.
6. Cell shading is filled.
7. If a row would cross the limit, stop.

---

## 16. Icon catalogue

Source: `ic`.

**Rendering contract**

* `viewBox 0 0 16 16`, drawn at 16×16. Big buttons scale to 20×20.
* `fill="none"`, `stroke=currentColor`, `stroke-width 1.5`, round caps and joins.
* Text glyphs use Segoe UI (`fill=currentColor`, no stroke) unless stated otherwise.
* An unknown name falls back to `_fallback`: a dashed square `(3,3,10,10)` with radius 1 and
  dash pattern 2/1.6.
* The colour bars in `fontcolor` and `highlight` are a filled rectangle whose colour is set
  dynamically.

**[NATIVE NOTE]** Port the exact path data from `ic:23-258` into `juce::Path` objects. JUCE
can parse SVG path strings with `Drawable::parseSVGPath`. Text-based icons should be drawn
with `GlyphArrangement`, or converted to outlines at build time.

| Name | Glyph description (ref `ic` line) |
|---|---|
| `paste` | Clipboard: a board outline with a small rounded clip on top and two text lines (23) |
| `copy` | Two overlapping sheets: a front rectangle plus the back sheet's L-shaped edge (26) |
| `cut` | Scissors: two circles at the bottom and two crossing blades up to the top (29) |
| `format-painter` | Paint roller: a horizontal roller head, a handle bending down, a short grip rectangle (32) |
| `bold` | Letter "N", heavy weight 800, 13 px (37) |
| `italic` | Letter "K", italic, weight 600, 13 px (38) |
| `underline` | Letter "S" with a horizontal line underneath (39) |
| `strike` | "ab" with a horizontal line through the middle (42) |
| `sub` | Large "X" with a small "2" bottom right (45) |
| `sup` | Large "X" with a small "2" top right (48) |
| `fontcolor` | Letter "A" above a filled colour bar, default `#C00000` (51) |
| `highlight` | Highlighter tip (slanted marker) above a filled colour bar, default `#FFFF00` (54) |
| `clear-format` | Letter "A" with an eraser block and a base line to its right (58) |
| `font-grow` | Letter "A" with an up arrow on the right (62) |
| `font-shrink` | Smaller "A" with a down arrow on the right (65) |
| `align-left` | Four lines, long/short alternating, flush left (70) |
| `align-center` | Four lines, long/short alternating, centred (71) |
| `align-right` | Four lines, long/short alternating, flush right (72) |
| `align-justify` | Four lines of equal length (73) |
| `line-spacing` | Vertical double-headed arrow on the left, four text lines on the right (74) |
| `indent-inc` | Four lines (middle two indented) with a filled right-pointing triangle at the left (77) |
| `indent-dec` | Same lines with a filled left-pointing triangle (80) |
| `bullets` | Three filled dots with three lines (83) |
| `numbering` | "1." "2." "3." with three lines (88) |
| `multilevel` | Staggered "1", "a", "i", each with a line that shortens as the indent grows (93) |
| `styles` | Bold "A" plus smaller "a" over an underline (102) |
| `undo` | Curved arrow pointing left (108) |
| `redo` | Curved arrow pointing right (109) |
| `save` | Floppy disk: body with a cut corner, a shutter at the top, a label at the bottom (110) |
| `open` | Open folder: folder back plus a slanted front flap (113) |
| `new` / `new-file` | Page with a folded corner and a "+" (116-117) |
| `export` | Page with a folded corner and a right arrow (118) |
| `import` | Page with a folded corner and a left arrow (119) |
| `print` | Printer: paper on top, body, output sheet, small indicator dot (120) |
| `share` | Up arrow rising out of an open tray (123) |
| `find` | Magnifier: circle plus handle (128) |
| `replace` | Two curved arrows forming a cycle, with arrowheads (129) |
| `comment` | Speech bubble with a tail at the bottom left (132) |
| `spellcheck` | Small "abc" above a check mark (134) |
| `zoom-in` | Magnifier with a "+" (139) |
| `zoom-out` | Magnifier with a "−" (140) |
| `zoom` | Plain magnifier (141) |
| `book` | Open book with two pages and a spine (142) |
| `page` | Page with a folded corner (147) |
| `margins` | Page rectangle with a dashed inner rectangle at 55 % opacity (148) |
| `orientation` | Portrait page plus a landscape outline and a turn arrow (151) |
| `columns` | Four vertical lines (154) |
| `toc` | "1" "2" "3" with dashed leader lines (155) |
| `envelope` | Envelope rectangle with a V flap (160) |
| `image` | Frame with a sun circle and a mountain polyline (165) |
| `table` | Rounded rectangle with a header-row line and two column lines (166) |
| `shapes` | Square overlapped by a circle (167) |
| `icons` | Five-point star outline (168) |
| `smartart` | Three circles (one left, two right) joined by lines (169) |
| `textbox` | Frame with a serif "A" (Georgia) inside (170) |
| `header-footer` | Page with lines near the top and bottom (171) |
| `wordart` | Outlined bold serif "A" (stroke only) (172) |
| `equation` | "π" in Georgia/Times (173) |
| `symbol` | "Ω" in Georgia/Times (174) |
| `pen` | Pencil diagonal from bottom-left to top-right (175) |
| `help` | Circle with a question mark (176) |
| `link` | Two interlocking chain links (179) |
| `bookmark` | Ribbon bookmark with a V-notched bottom (181) |
| `cross-reference` | Three text lines on the left plus a right arrow at the bottom right (182) |
| `footnote` | Text lines with a small "1" at the bottom right (183) |
| `caption` | Picture rectangle above two caption lines (185) |
| `citation` | Bold curly quotes “” (186) |
| `index` | Two columns of short lines; the right column dashed (187) |
| `cover-page` | Tall page with three text lines (188) |
| `blank-page` | Tall page with a dashed outline (189) |
| `page-break` | Page outline split by a dashed horizontal line (190) |
| `drop-cap` | Large bold "A" at the left with lines to its right and below (191) |
| `text-effects` | Outlined bold "A" in Segoe UI (193) |
| `date-time` | Calendar with two rings on top and a header line (194) |
| `quick-parts` | Rectangle with a header strip and a left column (195) |
| `theme` | Circle with the right half filled at 55 % (196) |
| `watermark` | Square with a faded "abc" in the middle (197) |
| `page-color` | Square filled at 18 % with a diagonal stroke (199) |
| `page-borders` | Thick square border with a dashed inner square at 45 % (201) |
| `track-changes` | Pencil with a line beneath (203) |
| `compare` | Two side-by-side pages, each with two lines (205) |
| `protect` | Padlock (207) |
| `labels` | 2×2 grid of small rounded rectangles (208) |
| `mail-merge` | Envelope with a short line at the bottom right (210) |
| `word-count` | "123" above two lines (212) |
| `translate` | "A" top left, "文" bottom right, a line between them (214) |
| `language` | Globe: circle with an equator and a meridian ellipse (217) |
| `read-mode` | Open book without the spine line (220) |
| `print-layout` | Two stacked page rectangles (221) |
| `web-layout` | Browser window with a top bar line (222) |
| `ruler` | Horizontal bar with tick marks (223) |
| `navigation` | Narrow left panel plus a wide right panel with three lines (225) |
| `onepage` | Single portrait page (227) |
| `multipage` | Two portrait pages side by side (228) |
| `select` | Mouse-pointer arrow (229) |
| `eraser` | Slanted eraser block with a base line (232) |
| `highlighter-pen` | Marker tip with a thick 2.2-stroke base line (234) |
| `lasso` | Ellipse loop with a trailing rope curve (235) |
| `plus` | "+" (238) |
| `close` | "×" diagonal cross (239) |
| `check` | Check mark (240) |
| `chevron-down`, `chevron-up`, `chevron-right`, `chevron-left` | Open V chevrons (241-244) |
| `clock` | Clock face with hands (247) |
| `pc` | Monitor on a stand (248) |
| `folder` | Closed folder with a tab (249) |
| `word` | App logo: filled `#2B579A` rounded square (radius 2.5) with a white bold "W", 9 px (252) |
| `_fallback` | Dashed square (257) |

**Ribbon glyphs that are not icons**

* Group launcher: the "⇲" character.
* Status-bar zoom buttons: the characters "−" and "+".

---

## 17. Consolidated pitfalls and bug notes

1. **CSS precedence:** in the backstage, panel styles not in a CSS layer override the layered
   ones. Use the effective values in §6.1.
2. **Unimplemented shortcuts** advertised in tooltips: Ctrl+=, Ctrl+Mayús+=, Ctrl+Alt+K,
   Alt+Ctrl+O, Alt+Mayús+X, and the special-character shortcuts (§8.2).
3. **Spanish shortcut letters:** Ctrl+N is bold (not New), Ctrl+K is italic, Ctrl+S is
   underline (not Save), Ctrl+G is save. The English Ctrl+B, Ctrl+I and Ctrl+U also work. Do
   **not** bind Ctrl+S to save.
4. **"Mantener solo texto"** pastes normally (§5.1).
5. **The small "Control de cambios" toggle** never reflects state (§4.6).
6. **The highlight palette** renders with 10 columns instead of 5 (§4.9).
7. **Margin preset hints** are never displayed (§5.5).
8. **Spin boxes commit on every focus loss**, creating spurious undo entries (§4.5).
9. **"Guardar como"** does not normalise the name (§6.6).
10. **The status-bar language** is hard-coded (§9).
11. **es-ES number grouping** starts at 5 digits (§9).
12. **The ruler** uses page 1 only, is static, and supports cm only (§10).
13. **"Configurar página"** may revert size changes through a stale page copy (§12.11).
14. **Converting notes** mutates the model directly and is not undoable (§12.11).
15. **"Comparar"** replaces the current body, although the text says it opens a new document
    (§12.11).
16. **Page-border margin 0** becomes 24 (§12.11).
17. **"Fecha y hora" fields** are stored without a format switch (§12.6).
18. **"Insertar título"** keeps the number computed for the initial label (§12.11).
19. **"Ir a":** ArrowDown has no upper clamp (§12.4).
20. **Native prompts** (`window.prompt`) are used for comments, footnotes and index entries.
    Replace them with proper dialogs.
21. **No context menu** appears on plain text (§11.2).
22. **Ribbon body height:** three 22 px medium rows plus a 17 px label do not fit in 75 px.
    Verify the native layout (§4.2).
23. **The Archivo "button"** is not a tab. It never becomes the active tab; it opens the
    backstage.
24. **The QAT is not disabled** by `setEnabled(false)`.
25. **Character commands do nothing on a collapsed caret** that is not inside a word. There is
    no "pending format" for the next typed text (§7.1). Typing after Ctrl+B in empty space
    does not produce bold text. Reproduce this for parity, or add a pending format as a
    deliberate improvement, flagged.
26. **Dead code:** `PLACEHOLDER_TABS` and `buildPlaceholder`.
27. **Read-only and protection** checks wrap the command facade (`main:336-357`). Keep that
    single choke point in the native command layer, so the ribbon, the keyboard and the
    dialogs all respect it.
