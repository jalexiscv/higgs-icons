# 07 — Spanish spell checker (real-time, embedded lexicon, morphology)

Specification for porting Skriba's spell checker to the native C++20/JUCE app.
Self-contained: engineers do not need to read the JS. All references are
`file:line` relative to `C:/xampp/htdocs/Skriba`.

| Source | Role |
|---|---|
| `public/js/editor/spell/lexicon.js` (746 lines) | **Data only**: lemmas + inflection classes |
| `public/js/editor/spell/spellchecker.js` (748 lines) | Pure engine: expansion, recognition, detection, suggestions, user dictionary |
| `public/js/editor/spell/live.js` (224 lines) | Real-time orchestration (debounce, dirty blocks, caret word hiding) |
| `public/js/editor/proofing.js` (236 lines) | Separate punctuation/typography checker (no lexicon), merged into the F7 pane |
| `public/js/main.js:587-680, 1365-1390, 1505-1575` | UI wiring: context menu, dictionary persistence, ribbon toggle |
| `public/js/ui/dialogs/review.js:145-245` | F7 "Ortografía y gramática" pane |
| `public/js/layout/pages.js:66,106,529-575` | Red wavy underline layer |
| `tests/spell.test.js` (240 lines, 21 tests) | Test suite to port to Catch2 |
| `docs/componentes/ortografia-tiempo-real.md`, `docs/checklists/ortografia.md` | Design doc + manual checklist |

Proposed C++ split (mirrors Higgs Audition): headless `skriba_spell` library
(lexicon resource + engine, no JUCE GUI dependency), `LiveSpelling` controller in
the editor layer (needs a timer → `juce::Timer` or an injected scheduler), UI in
the JUCE app, CLI subcommand (`skriba spell <file>`) and Catch2 tests.

---

## 0. Parity strategy (read first)

1. The JS engine has several **genuine bugs** (§10). Two options: (a) bit-exact
   parity (accept exactly the same 70 515 forms), or (b) fix them. Recommended:
   implement the algorithm **exactly as specified here first**, verify against
   the golden file (§1.4) — expected count **70 515** — then apply the fixes in
   §10 behind one flag / in one commit and regenerate the golden file. Every
   test in §12 passes in both modes.
2. All strings are Unicode. JS works in **UTF-16 code units**; every Spanish
   letter used here is in the BMP so "code unit" = "code point" for the lexicon
   itself. **Offsets returned to the editor are UTF-16 code-unit offsets in the
   paragraph's linear text** (§7.1) — the C++ document model must use the same
   offset unit as the rest of the Skriba port (if the C++ model uses code points
   or UTF-8 bytes, convert at the boundary; non-BMP characters are where they
   diverge).
3. Lowercasing = JS `String.prototype.toLowerCase()` = full Unicode simple
   lowercase (use `juce::String::toLowerCase()` or ICU `u_tolower` per code
   point; `Á→á`, `Ñ→ñ`, `Ü→ü`).

---

## 1. Lexicon data (`lexicon.js`)

### 1.1 Encoding

Every list is a JS template string of **comma-separated words**, split by
`palabras(s)` (`lexicon.js:21-23`):

```
palabras(s) = s.split(',') → trim each (JS trim: all Unicode whitespace incl. newlines)
                           → drop empty strings
```

Newlines inside the template literal are just whitespace. Order is preserved
and **duplicates are kept** (they are harmless: everything ends in a set,
except `FREQUENT_FIRST`, where the first occurrence wins).

Word case: everything is lowercase except a few units in `FUNCTION_WORDS`
(`dB`, `kHz`, `MHz`, `GHz`, `Hz`, `lexicon.js:53`) — they are lowercased when
added (§3). No entry contains a digit, except the two data glitches
`deshacer2` and `asumir2` in `VERBS_REGULAR` (`lexicon.js:454`, `:459`), which
end up as literal "words" in the set (harmless, never typed; keep for parity
or drop — they cannot be matched by the tokenizer, which only takes letters).

### 1.2 Tables (exact counts after `palabras`, including duplicates)

| Export | Line | Count | Type | Meaning / how the engine uses it |
|---|---|---|---|---|
| `FUNCTION_WORDS` | 29-58 | 356 | list | Accepted as-is (no inflection). Includes prepositions, pronouns, adverbs, abbreviations (`etc, vs, ej, dr, dra, sr, sra, srta, ing, lic, mg, phd`), roman numerals (`ii … xxi`), units (`km, kg, cm, mm, ml, kb, mb, gb, tb, kbps, mbps, fps, px, dpi, ppp, min, seg, hrs, dB, kHz, MHz, GHz, Hz, ms, cc, mcg`), anglicisms (`firewall, cloud, ticket, webmail, backup, email, online, …`). |
| `NUMBER_WORDS` | 61-76 | 123 | list | Numbers, ordinals, months, weekdays, time units. Added **+ plural** (`pluralize`). |
| `NOUNS` | 83-308 | 1907 | list | Nouns (singular). Added **+ plural**. |
| `ADJECTIVES` | 315-416 | 779 | list | Masculine singular lemma. Added with `adjectiveForms` (4 forms + `-mente`). |
| `VERBS_REGULAR` | 430-528 | 775 | list | Regular verbs (almost all `-ar`; class `''`). |
| `VERBS_ER` | 530-539 | 56 | list | Regular `-er` (class `''`). |
| `VERBS_IR` | 541-557 | 123 | list | Regular `-ir` (class `''`). |
| `VERBS_STEM` | 560-587 | 161 | list of `lemma:class` | Stem-changing verbs. Split each entry on `:`. Classes: `ie`, `ue`, `hue`, `i`, `ie-i`, `ue-u`, `rei`. |
| `VERBS_ZC` | 590-600 | 67 | list | `-cer/-cir` after vowel (class `zc`). |
| `VERBS_UIR` | 602-607 | 26 | list | `-uir` (class `y`). |
| `VERBS_VOWEL_ER` | 610 | 5 | list | vowel+`er` (`leer, creer, poseer, proveer, releer`), class `''` (the engine detects the vowel stem itself). |
| `VERBS_IACC` | 613-618 | 26 | list | Stressed hiatus `í` (`envío`), class `iacc`. |
| `VERBS_UACC` | 619-624 | 25 | list | Stressed hiatus `ú` (`continúo`), class `uacc`. Includes `reunir` (→ `reúno`). |
| `STRONG_PRETERITES` | 635-641 | 20 | map lemma→root | Strong preterite roots (`tener→tuv`, `decir→dij`, …). Root ending in `j` drops the `i` of 3rd plural (`dijeron`). |
| `IRREGULAR_FUTURES` | 644-648 | 12 | map lemma→root | Future/conditional root (`tener→tendr`, `hacer→har`, `decir→dir`, `salir→saldr`, …). |
| `IRREGULAR_PARTICIPLES` | 651-658 | 18 | map lemma→participle | (`hacer→hecho`, `escribir→escrito`, `romper→roto`, `freír→frito`, …). |
| `IRREGULAR_FORMS` | 664-732 | 578 | list | Explicit forms of the most irregular verbs (`ser, ir, estar, haber, tener, hacer, decir, poner, salir, venir, ver, dar, saber, oír, traer, caer, valer, caber, reír, sonreír`, compounds `mantener … satisfacer, prever`, `seguir`). Added as-is. |
| `FREQUENT_FIRST` | 738-746 | 115 | list | Frequency order for ranking suggestions; rank = index of **first** occurrence. |

The engine also has constants that live in `spellchecker.js` and must be part
of the same C++ resource or hard-coded: `AUTO_SKIP` (§2.1), `COMPOUNDS`
(§3.2), `PLURAL_EXCEPCIONES` (§4.1), `perteneceA` prefixes (§3.2), `CLITICS`,
`PREFIXES` (§5), `CONFUSIONES`, `ALFABETO` (§8).

### 1.3 Exact path of the data to convert

- **Lexicon data**: `C:/xampp/htdocs/Skriba/public/js/editor/spell/lexicon.js`
  (ES module; every table is an `export const`). It can be imported directly by
  Node (no bundler).
- **Engine-side constant tables** (hard-code in C++ or move into the resource):
  `C:/xampp/htdocs/Skriba/public/js/editor/spell/spellchecker.js` lines 59-79
  (`AUTO_SKIP`, `COMPOUNDS`), 321-326 (`PLURAL_EXCEPCIONES`), 415-424
  (`perteneceA`), 438-441 (`CLITICS`, `PREFIXES`), 522 (`DOBLES_VALIDAS`),
  628-637 (`ALFABETO`, `CONFUSIONES`).

### 1.4 Conversion tool + golden file (already generated)

A ready script is in this spec folder:

```
spec/tools/export-spell-lexicon.mjs   (node export-spell-lexicon.mjs <SkribaRoot> <outDir>)
```

It writes:

| Output | Content |
|---|---|
| `spec/data/spell-lexicon.json` | Object with the 18 exports of `lexicon.js`, keys sorted, values verbatim (arrays keep order + duplicates; maps are JSON objects). UTF-8. |
| `spec/data/spell-known-forms.golden.txt` | The JS engine's fully expanded `KNOWN` set: **70 515** lowercase forms, sorted by UTF-16 code units, one per line, UTF-8, LF. Use in a Catch2 parity test (C++ build must produce exactly this set in parity mode). |

Recommended C++ resource: embed `spell-lexicon.json` (or a generated `.inc`
with `constexpr std::u16string_view`/UTF-8 arrays) via CMake
(`juce_add_binary_data` or a custom command). Expand at runtime exactly as in
§3 (~50 ms in JS; building once lazily is the JS behaviour). Alternatively,
ship the golden expanded list directly — but then `conjugate`,
`pluralize`, `adjectiveForms` still need to exist because the tests call
behaviour through `isKnown`, and the expansion must stay in sync with the data.

---

## 2. Verb conjugator — `conjugate(lemma, cls)` (`spellchecker.js:132-307`)

Returns a list of forms (duplicates allowed). `cls ∈ {'', 'ie', 'ue', 'hue',
'i', 'ie-i', 'ue-u', 'zc', 'y', 'iacc', 'uacc'}`.

### 2.1 Constants

```
VOWELS = "aeiouáéíóúü"                      (spellchecker.js:81)
esVocal(c) = c is one of VOWELS             (empty char → false)
AUTO_SKIP = {ser, ir, estar, haber, dar, ver, saber, caber, oír, traer, caer,
             valer, reír, sonreír, freír, decir, hacer, poner, salir, venir,
             tener}                         (spellchecker.js:59-63; iteration order as written)
FUERTE = [true, true, true, false, false, true]   // persons 1s,2s,3s,1p,2p,3p: stressed stem?
```

AUTO_SKIP verbs get **no** present indicative, **no** regular preterite/
imperfect subjunctive (unless they have a strong preterite), **no** present
subjunctive and **no** imperative from the conjugator — those come from
`IRREGULAR_FORMS`. (`poder`, `querer`, `seguir` are deliberately NOT in it.)

### 2.2 Helpers

**`unir(stem, ending, grupo, cls)`** — orthographic adjustment when joining
(`spellchecker.js:95-114`). `e0` = first char of `ending` (or empty).

```
if grupo == 'ar' and e0 ∈ {e, é}:
    if stem ends "gu": return stem[:-2] + "gü" + ending      // averigüé
    if stem ends "c" : return stem[:-1] + "qu" + ending      // busqué
    if stem ends "g" : return stem + "u" + ending            // llegué
    if stem ends "z" : return stem[:-1] + "c" + ending       // empecé
if grupo != 'ar' and e0 ∈ {a, á, o, ó}:
    if stem ends "gu": return stem[:-1] + ending             // sigo, siga  (drops the u)
    if stem ends "g" : return stem[:-1] + "j" + ending       // protejo, dirija
    if stem ends "qu": return stem[:-2] + "c" + ending       // delinco
    if stem ends "c" :
        prev = stem[len-2] (or empty)
        return stem[:-1] + ("zc" if esVocal(prev) else "z") + ending   // conozco / venzo
return stem + ending
```
Order matters (`gu` tested before `g`, `qu` before `c`). `cls` is unused.

**`cambiarRaiz(stem, [de, a])`** (`:117-123`): replace the **last** occurrence
of substring `de` in `stem` with `a`; if absent, return stem unchanged.

### 2.3 Setup

```
grupo = last 2 chars of lemma; if grupo ∉ {ar, er, ir}: return [lemma]
       // NB: 'reír','oír','freír','sonreír' end in "ír" → returned as [lemma] only
stem  = lemma[:-2]
esUir = (cls == 'y') and lemma ends with "uir"          // NOT "üir" (argüir)
vocalStem = esVocal(last char of stem) and grupo != 'ar'
            and stem does not end "gu" and does not end "qu"
            // gu/qu digraph is not a vowel stem: conseguir → consiguió, never «consiguyó»
out = [lemma]
skip = lemma ∈ AUTO_SKIP
```

**`raiz(fuerte, especial='')`** (`:147-167`):

```
s = stem
if fuerte:
    ie, ie-i  → s = cambiarRaiz(s, e→ie)
    ue, ue-u  → s = cambiarRaiz(s, o→ue); if s unchanged: s = cambiarRaiz(s, u→ue)   // jugar → juega
    hue       → s = cambiarRaiz(s, o→hue)             // oler → huelo
    i         → s = cambiarRaiz(s, e→i)
    iacc      → s = cambiarRaiz(s, i→í)
    uacc      → s = cambiarRaiz(s, u→ú)
if especial == 'debil-i':
    ie-i or i → s = cambiarRaiz(s, e→i)               // sintió, pidiendo
    ue-u      → s = cambiarRaiz(s, o→u)               // durmió
return s
```
(The `esUir … s = s` line `:165` is a no-op.)

### 2.4 Tenses, in output order

All pushes skip empty strings. Person order is always 1s,2s,3s,1p,2p,3p.

| # | Tense | Condition | Rule |
|---|---|---|---|
| 1 | Present indicative (`:173-189`) | `!skip` | endings `ar: o, as, a, amos, áis, an` / `er: o, es, e, emos, éis, en` / `ir: o, es, e, imos, ís, en`. For person i: `s = raiz(FUERTE[i])`; `term = t`; if `esUir and FUERTE[i]`: `term = "y"+t` (construyo). If `cls=='zc' and i==0`: push `stem[:-1] + "zco"` (conozco, conduzco) and continue. Else push `unir(s, term, grupo, cls)`. |
| 2 | Imperfect indicative (`:192-197`) | always | `ar: aba, abas, aba, ábamos, abais, aban` / `er,ir: ía, ías, ía, íamos, íais, ían`, appended to **plain `stem`** (no `unir`). |
| 3a | Strong preterite + imperfect subjunctive (`:200-217`) | `STRONG_PRETERITES[lemma]` exists (=`R`) | `j = R ends with 'j'`. Preterite endings `e, iste, o, imos, isteis, ieron`; for i=2 when lemma is `hacer` the root is `hiz` (hizo). Push `R + ("eron" if j and t=="ieron" else t)`. Then `base = R + ("e" if j else "ie")`; for `t` in `ra, ras, ra, ramos, rais, ran, se, ses, se, semos, seis, sen`: if `t ∈ {ramos, semos}`: `acc = base[:-1] + ("é" if j else "ié")` else `acc = base`; push `acc + t`. **Bug**: non-j gives `tuvi`+`ié` = `tuviiéramos` (see §10-B1). |
| 3b | Regular preterite + imperfect subjunctive, `-ar` (`:219-227`) | no strong root, `!skip`, `ar` | Push `unir(stem, t, 'ar', cls)` for `é, aste, ó, amos, asteis, aron` (busqué, llegué, empecé, averigüé). Subjunctive: `b = stem+"a"`; for the 12 endings: `acc = stem+"á"` if `ramos/semos` else `b`; push `acc + t` (hablara, habláramos, hablase). |
| 3c | Regular preterite + imperfect subjunctive, `-er/-ir` (`:228-246`) | no strong root, `!skip`, `er/ir` | `y = vocalStem or esUir`; `debil = raiz(false,'debil-i')`. Endings: if y `í, íste, yó, ímos, ísteis, yeron` else `í, iste, ió, imos, isteis, ieron`. Root is `debil` for persons 3s (i=2) and 3p (i=5), plain `stem` otherwise. Push `root + t`. Subjunctive: `b = debil + ("ye" if y else "ie")`; for 12 endings: `acc = b[:-1] + "é"` if `ramos/semos` else `b`; push `acc + t` (leyera, leyéramos, sintiera, durmiésemos). |
| 4 | Future + conditional (`:250-256`) | always | `rf = IRREGULAR_FUTURES[lemma] or lemma`; push `rf + t` for `é, ás, á, emos, éis, án, ía, ías, íamos, íais, ían` (11 forms — the 3s conditional `ía` is not repeated). |
| 5 | Present subjunctive (`:259-275`) | `!skip` | `ar: e, es, e, emos, éis, en` / `er,ir: a, as, a, amos, áis, an`. `debilPl = grupo=='ir' and i∈{3,4} and cls ∈ {ie-i, ue-u, i}`. `s = raiz(false,'debil-i')` if debilPl else `raiz(FUERTE[i])`. `term = t`; if `esUir`: `term = "y"+t` (all persons: construya, construyamos). If `cls=='zc'`: push `stem[:-1] + "zc" + t` and continue. Else push `unir(s, term, grupo, cls)`. |
| 6 | Imperative (`:277-280`) | `!skip` | tú: `tu = unir(raiz(true), 'a' if ar else 'e', grupo, cls)`; push `raiz(true)+"ye"` if esUir else `tu`. vosotros: push `stem + ("ad"|"ed"|"id")`. (Note: `unir` with ending `e` for `-ar` never happens here, so `busca` is plain.) |
| 7 | Gerund (`:285-289`) | always | if `vocalStem or esUir`: `raiz(false,'debil-i') + "yendo"`; elif `ar`: `stem+"ando"`; else `raiz(false,'debil-i') + "iendo"`. |
| 8 | Participle + 3 adjectival forms (`:291-303`) | always | If `IRREGULAR_PARTICIPLES[lemma]` = P: push P, `partBase = P[:-1]`. Elif `ar`: push `stem+"ado"`, `partBase = stem+"ad"`. Else: push `stem + ("ído" if vocalStem else "ido")`, `partBase = stem + ("íd" if vocalStem else "id")`. Then push `partBase + a`, `partBase + os`, `partBase + as`. |

### 2.5 Worked outputs (verified by running the JS)

| Call | Output (space separated, in order) |
|---|---|
| `conjugate('hablar','')` | hablar hablo hablas habla hablamos habláis hablan hablaba hablabas hablaba hablábamos hablabais hablaban hablé hablaste habló hablamos hablasteis hablaron hablara hablaras hablara habláramos hablarais hablaran hablase hablases hablase hablásemos hablaseis hablasen hablaré hablarás hablará hablaremos hablaréis hablarán hablaría hablarías hablaríamos hablaríais hablarían hable hables hable hablemos habléis hablen habla hablad hablando hablado hablada hablados habladas |
| `('pedir','i')` | pedir pido pides pide pedimos pedís piden pedía … pedí pediste pidió pedimos pedisteis pidieron pidiera … pidiéramos … pidiesen pediré … pedirían pida pidas pida pidamos pidáis pidan pide pedid pidiendo pedido pedida pedidos pedidas |
| `('construir','y')` | construir construyo construyes construye construimos construís construyen construía… construí **construíste** construyó **construímos construísteis** construyeron construyera… construya… construyamos… construye construid construyendo **construído construída construídos construídas** (bold = wrong accents, §10-B3) |
| `('leer','')` | leer leo lees lee leemos leéis leen leía… leí leíste leyó leímos leísteis leyeron leyera… leyéramos… lea… lee leed leyendo leído leída leídos leídas |
| `('conocer','zc')` | …conozco conoces conoce conocemos conocéis conocen … conozca conozcas conozca conozcamos conozcáis conozcan conoce conoced conociendo conocido… |
| `('enviar','iacc')` | …envío envías envía enviamos enviáis envían … envié … envíe envíes envíe enviemos enviéis envíen envía enviad enviando enviado… |
| `('jugar','ue')` | …juego juegas juega jugamos jugáis juegan … jugué … juegue juegues juegue juguemos juguéis jueguen juega jugad jugando jugado… |
| `('oler','hue')` | …huelo hueles huele olemos oléis huelen … huela huelas huela olamos oláis huelan huele oled oliendo olido… |
| `('dormir','ue-u')` | …duermo duermes duerme dormimos dormís duermen … dormí dormiste durmió dormimos dormisteis durmieron durmiera… duerma duermas duerma durmamos durmáis duerman duerme dormid durmiendo dormido… |
| `('seguir','i')` | …sigo sigues sigue seguimos seguís siguen … seguí seguiste siguió … siguieron siguiera… siga sigas siga sigamos sigáis sigan sigue seguid siguiendo seguido… |
| `('proteger','')` | …protejo proteges protege … proteja protejas … protejan protege proteged protegiendo protegido… |
| `('vencer','')` | …venzo vences … venza venzas … venzan … |
| `('averiguar','')` | …averigüé averiguaste … averigüe averigües averigüe averigüemos averigüéis averigüen averigua averiguad … |
| `('conducir','zc')` | …conduzco conduces … conduje condujiste condujo condujimos condujisteis condujeron condujera… condujéramos … conduzca… |
| `('tener','')` (AUTO_SKIP) | tener tenía tenías tenía teníamos teníais tenían tuve tuviste tuvo tuvimos tuvisteis tuvieron tuviera tuvieras tuviera **tuviiéramos** tuvierais tuvieran tuviese tuvieses tuviese **tuviiésemos** tuvieseis tuviesen tendré … tendrían teniendo tenido tenida tenidos tenidas |
| `('decir','')` | decir decía… dije dijiste dijo dijimos dijisteis dijeron dijera … dijéramos … dijesen diré … dirían **deciendo** dicho dicha dichos dichas |
| `('hacer','')` | hacer hacía… hice hiciste hizo hicimos hicisteis hicieron hiciera… **hiciiéramos**… haré… haciendo hecho hecha hechos hechas |
| `('ser','')` | ser **sía sías sía síamos síais sían** seré… serían siendo sido **sida sidos sidas** |
| `('ver','')` | ver vía vías vía víamos víais vían veré… verían viendo visto vista vistos vistas |
| `('caer','')` | caer caía… caeré… cayendo caído caída caídos caídas |
| `('reír','')` | reír  (ends in "ír" → only the lemma) |
| `('adquirir','ie')` | adquiro adquires adquire … (**no** diphthong: stem has no `e`, §10-B4) |
| `('argüir','y')` | argüo argües argüe … argüyó … argüa … argüyendo argüído … (esUir false because lemma ends `üir`) |

---

## 3. Lexicon build — `ensureBuilt()` (`spellchecker.js:362-411`)

Lazy, once. `add(w)`: if `w` non-empty, insert `toLowerCase(w)` into `KNOWN`.

### 3.1 Order (order only matters for `DEACCENT` set iteration, which is irrelevant after sorting)

```
for w in FUNCTION_WORDS:            add(w)
for w in NUMBER_WORDS:              add(w); add(pluralize(w))
for w in IRREGULAR_FORMS:           add(w)
for w in NOUNS:                     add(w); add(pluralize(w))
for a in ADJECTIVES:                for f in adjectiveForms(a): add(f)
for v in AUTO_SKIP:                 add all conjugate(v, '')
for v in VERBS_REGULAR:             add all conjugate(v, '')
for v in VERBS_ER:                  add all conjugate(v, '')
for v in VERBS_IR:                  add all conjugate(v, '')
for "lemma:cls" in VERBS_STEM:      add all conjugate(lemma, cls == 'rei' ? '' : cls)
for v in VERBS_ZC:                  add all conjugate(v, 'zc')
for v in VERBS_UIR:                 add all conjugate(v, 'y')
for v in VERBS_VOWEL_ER:            add all conjugate(v, '')
for v in VERBS_IACC:                add all conjugate(v, 'iacc')
for v in VERBS_UACC:                add all conjugate(v, 'uacc')
COMPOUNDS (§3.2)
build DEACCENT, FREQ_RANK (§3.3)
```
Note: a verb listed in two tables (e.g. `plegar`/`desplegar` both in
`VERBS_REGULAR` and `VERBS_STEM:ie`, `exportar`/`importar` twice) gets the
union of both paradigms (`plego` and `pliego` are both accepted).

### 3.2 Compound verbs (`:66-79`, `:391-398`, `:414-426`)

`COMPOUNDS` rows are `[compound, compound, prefix, base]` (2nd column unused):

| compound | prefix | base |
|---|---|---|
| mantener | man | tener |
| obtener | ob | tener |
| contener | con | tener |
| detener | de | tener |
| sostener | sos | tener |
| suponer | su | poner |
| proponer | pro | poner |
| componer | com | poner |
| disponer | dis | poner |
| exponer | ex | poner |
| imponer | im | poner |
| oponer | o | poner |
| convenir | con | venir |
| prevenir | pre | venir |
| intervenir | inter | venir |
| deshacer | des | hacer |
| rehacer | re | hacer |
| prever | pre | ver |
| distraer | dis | traer |
| atraer | a | traer |
| extraer | ex | traer |
| recaer | re | caer |
| sobresalir | sobre | salir |

```
for each row:
    add(compound)
    formas = conjugate(base, '')
    explicitas = [f in IRREGULAR_FORMS (in order) where perteneceA(f, base)]
    for f in formas ++ explicitas: add(prefix + f)

perteneceA(forma, base): forma starts with any of
    tener: ten, tien, tuv, tendr
    poner: pon, pus, pondr, puest
    venir: ven, vien, vin, vendr
    hacer: hag, hac, hic, hiz, har, hech, haz
    ver:   ve, vi, vist
    traer: tra
    caer:  ca
    salir: sal
    (any other base: false)
```
This heuristic over-generates (e.g. `ver` prefixes match every IRREGULAR_FORM
starting with `ve`/`vi`, so `prevenga`, `previno`… are added through `prever`
too; `caer` matches `cabe`, `caben`…). Harmless; keep for parity.

### 3.3 Auxiliary indexes

- `deaccent(w)` (`:313-318`): replace `á→a, é→e, í→i, ó→o, ú→u` (lowercase
  only); **keeps `ñ` and `ü`**.
- `DEACCENT`: map `deaccent(w) → set of w`, for every `w ∈ KNOWN` with
  `deaccent(w) != w` (only accented forms are indexed).
- `FREQ_RANK`: map word → index in `FREQUENT_FIRST`, first occurrence wins.
- `lexiconSize()` = `|KNOWN|` (JS: **70 515**; test requires `> 30 000`).

---

## 4. Nominal inflection

### 4.1 `pluralize(w)` (`:321-340`)

```
PLURAL_EXCEPCIONES = {imagen: imágenes, examen: exámenes, joven: jóvenes,
  origen: orígenes, margen: márgenes, volumen: volúmenes, resumen: resúmenes,
  orden: órdenes, crimen: crímenes, dictamen: dictámenes, carácter: caracteres,
  régimen: regímenes, espécimen: especímenes}

if w in PLURAL_EXCEPCIONES: return it
last = last char
if last == 'z': return w[:-1] + "ces"                  // luz → luces, vez → veces
if last ∈ {s, x}: return w                            // lunes, tórax, análisis, país(!), mes(!)
if w matches /([áéíóú])([ns])$/ : return w[:-2] + deaccent(vowel) + n|s + "es"
                                                      // canción → canciones, alemán → alemanes
                                                      // (unreachable for 's' because of the rule above)
if last ∈ {a,e,i,o,u}: return w + "s"
if last ∈ {í, ú}: return w + "es"                     // rubí → rubíes, tabú → tabúes
return w + "es"                                       // papel → papeles, ley → leyes
                                                      // also café → «cafées», sofá → «sofáes» (bug §10-B6)
```
Verified: `canción→canciones, luz→luces, lunes→lunes, tórax→tórax, rubí→rubíes,
imagen→imágenes, carácter→caracteres, papel→papeles, ley→leyes, club→clubes,
alemán→alemanes, inglés→inglés, fin→fines, ítem→ítemes, déficit→déficites,
cráter→cráteres, examen→exámenes, régimen→regímenes, país→país, mes→mes,
vez→veces, tren→trenes, café→cafées, menú→menúes`.

### 4.2 `adjectiveForms(adj)` (`:343-355`)

```
out = [adj, pluralize(adj)]
fem = null
if adj ends 'o'          : fem = adj[:-1] + 'a'                    // bueno → buena
elif adj ends "or"       : fem = adj + 'a'                         // trabajadora (also «mayora», «menora»)
elif adj matches [áé]s$  : fem = deaccent(adj)[:-1] + "sa"         // francés → francesa, inglés → inglesa
elif adj matches [áó]n$  : fem = deaccent(adj) + 'a'               // alemán → alemana
elif adj ends "ol"       : fem = adj + 'a'                         // española
if fem: out += [fem, pluralize(fem)]
out += [(fem or adj) + "mente"]                                    // rápidamente, fácilmente, «verdemente»
```
Note: `pluralize('francés')` returns `francés` (ends in s) so `franceses`
is NOT generated (§10-B5); `deaccent` here deaccents the whole word.

---

## 5. Recognition — `isKnown(word, depth=0)` (`:460-509`)

```
ensureBuilt()
w = toLowerCase(word)
if len(w) <= 1: return true
if w ∈ KNOWN: return true
if w ∈ userDict or deaccent(w) ∈ userDict: return true
if depth > 2: return false

// (a) Attached clitics — on the DEACCENTED word, one or two clitics
CLITICS = [se, me, te, nos, os, le, les, lo, la, los, las]
plano = deaccent(w)
for c1 in CLITICS:
    if plano not endswith c1: continue
    r1 = plano[:-len(c1)]
    if len(r1) >= 2 and (r1 ∈ KNOWN or DEACCENT has non-empty set for r1): return true
    for c2 in CLITICS:
        if r1 not endswith c2: continue
        r2 = r1[:-len(c2)]
        if len(r2) >= 2 and (r2 ∈ KNOWN or DEACCENT has r2): return true
// dámelo → damelo → (lo) dame → (me) da ✓ ; levantándose → levantando ✓ ; verte → ver ✓

// (b) Productive prefixes (recursive)
PREFIXES = [des, in, im, re, pre, sub, super, anti, auto, inter, semi, multi,
            micro, mini, vice, contra, sobre, ultra, ex, pos, post, co]
for p in PREFIXES:
    if w startswith p and len(w) - len(p) >= 4 and isKnown(w[len(p):], depth+1): return true

// (c) -mente adverb (recursive)
if w endswith "mente" and len(w) > 7 and isKnown(w[:-5], depth+1): return true

// (d) Diminutives and superlatives (NOT recursive; KNOWN only)
SUFIJOS = [(citos,5),(citas,5),(cito,4),(cita,4),(itos,4),(itas,4),(ito,3),(ita,3),
           (ísimos,6),(ísimas,6),(ísimo,5),(ísima,5)]          // in this order
for (suf, n) in SUFIJOS:
    if not w endswith suf or len(w) - n < 3: continue
    for cand in baseCandidates(w[:-n]): if cand ∈ KNOWN: return true

baseCandidates(s) = [s, s+o, s+a, s+e]
    + (if s endswith "qu": [s[:-2]+"co", s[:-2]+"ca"])        // poquito → poco
    + (if s endswith "gu": [s[:-2]+"go", s[:-2]+"ga"])
    + (if s endswith "c" : [s[:-1]+"zo", s[:-1]+"za"])

// (e) Ungenerated plurals (recursive)
if w endswith "es" and len(w) > 4 and isKnown(w[:-2], depth+1): return true
if w endswith "s"  and len(w) > 3 and isKnown(w[:-1], depth+1): return true
return false
```

Important details:
- Lengths are UTF-16 lengths of the lowercase word.
- User dictionary is consulted at every recursion level (so `userword` +
  prefix/plural is accepted) but **not** inside the clitic, diminutive or
  suggestion checks (those use `KNOWN` only).
- The `len(w) <= 1 → true` short-circuit makes every one-letter remainder
  "known" during recursion, e.g. trailing-`s` stripping of 2-letter stems.
- Clitic acceptance is deliberately permissive and over-accepts:
  `perola` (pero+la), `casala` (casa+la), `ingleses` (ing+les) are accepted.
  `países`, `cafés`, `sofás`, `menús`, `meses`, `ingleses` are accepted only
  via these fallbacks; `franceses`, `mamás`, `paises` are not.
- No `-illo/-illa` diminutives and no `-azo` augmentatives, despite the design
  doc (`ortografia-tiempo-real.md:73`) mentioning `-illo` — the code does not
  implement them.
- Superlatives work only when the base without `-ísimo` + o/a/e is in KNOWN:
  `riquísimo` ✓ (riqu→rico), `rapidísimo` ✗ (rápido is accented).

---

## 6. Detection

### 6.1 `mechanicalError(w)` (`:530-538`) — `w` already lowercase

Evaluated in this order; first hit wins. Messages are verbatim Spanish:

| # | Test | Message |
|---|---|---|
| 1 | any letter (`\p{L}`) repeated 3+ times consecutively (`/(\p{L})\1\1/u`) | `Tres letras iguales seguidas.` |
| 2 | a `q` not followed by `u` + one of `e i é í` (`/q(?!u[eiéí])/u`) | `En español la «q» va seguida de «ue» o «ui».` |
| 3 | doubled ASCII consonant from class `[b-df-hj-np-tv-z]` (b c d f g h j k l m n p q r s t v w x y z, **not ñ**), found with a global scan of non-overlapping pairs; if any pair ∉ `{cc, ll, rr, nn}` | `La doble «XX» no existe en español.` where XX = the **first** invalid pair in scan order |
| — | none | `null` |

Consequences (verified): `qatar`, `quórum`, `aqua` → q error; `pizza` → «zz»;
`cappuccino` → «pp»; `creer`, `leer`, `zoo` → null (vowels are not checked).
Regex 3 is a global non-overlapping scan: `"ssss"` gives pairs `ss`,`ss` (but
rule 1 fires first anyway).

### 6.2 `shouldCheck(word)` (`:541-546`) — precision policy

```
if len(word) <= 1: false                  // single letters ("x" as a variable)
if first char is uppercase letter (\p{Lu}): false   // proper nouns, acronyms (Pérez, NASA, Ñandú, Éxito)
if word contains an ASCII digit (\d): false        // B12, 5G (unreachable from the tokenizer, see §7)
true
```

### 6.3 `checkWordSpelling(word)` (`:553-562`)

```
ensureBuilt()
if not shouldCheck(word): return null
w = toLowerCase(word)
if w ∈ ignored: return null
mech = mechanicalError(w); if mech: return {rule:'spelling', message: mech}
if isKnown(w): return null
return {rule:'spelling', message: "«" + word + "» no está en el diccionario."}   // original case
```
**Pitfall**: the mechanical check runs **before** the user dictionary (which
is only consulted inside `isKnown`). A user-dictionary word like `pizza` or
`cappuccino` is still flagged ("La doble «zz» no existe en español."). Only
"Omitir todas" suppresses it. Replicate (or fix deliberately, §10-B7).

---

## 7. Tokenization and text/paragraph/document checks

### 7.1 `checkTextSpelling(text)` (`:569-580`)

- Word regex: `/[\p{L}\u00AD]+/gu` — maximal runs of **Unicode letters
  (General Category L*: Lu, Ll, Lt, Lm, Lo)** and the **soft hyphen U+00AD**.
- Everything else separates words: spaces, digits, apostrophes (`'` and `’`),
  hyphens (`-`, U+2010…), punctuation, **combining marks (\p{M})**, U+FFFC.
  So: `l’ortografia` → `l`, `ortografia`; `bien-estar` → `bien`, `estar`;
  `B12` → `B` (then skipped, length 1); `abc123def` → `abc`, `def`.
  **Pitfall**: decomposed (NFD) text `o` + U+0301 splits the word; the JS does
  not normalize. Recommend the C++ import path stores NFC (Skriba's own JSON
  is NFC in practice); do not normalize inside the checker or offsets break.
- `word = match with all U+00AD removed`; `start = match index`, `end = start
  + match length` (**raw** length, soft hyphens included). Offsets are UTF-16
  code units of `text`.
- For each match: `err = checkWordSpelling(word)`; if non-null, emit
  `{start, end, word, rule:'spelling', message}`.

Example (test): `"la ortografia importa"` → one item `{start:3, end:13,
word:"ortografia"}`.

Verified example: `'la ortografia importa. Pérez cassa qeso x B12 bien-estar l’ortografia so\u00ADbre ñandu'` →
`[3,13) ortografia «no está en el diccionario»`, `[29,34) cassa «La doble «ss»…»`,
`[35,39) qeso «q…»`, `[59,69) ortografia`, `[77,82) ñandu`. (`so­bre` → `sobre`, known.)

### 7.2 `checkBlockSpelling(block)` (`:589-597`)

```
if block is null or block.t != 'p': return []
texto = concat over block.runs: run.t == 'text' ? (run.text ?? '') : "\uFFFC"
        // every non-text run (image, field, tab, break, math, footnote ref…) = ONE code unit
if texto empty: return []
return checkTextSpelling(texto), each item + {blockId: block.id}
```
This "linear text" convention (non-text run = 1 unit) is shared by the caret
model and `proofing.js:66-72`. Test: runs `"hola "`, image, `" ablar"` →
`ablar` at `[7,12)`.

### 7.3 `checkDocumentSpelling(doc, opts)` (`:608-622`)

```
max = opts.max if finite number else 2000
for block in doc.body (top-level list, in order):
    skip if not a 'p' block or block.hf is truthy   // header/footer bands are never checked
    for err in checkBlockSpelling(block):
        if opts.suggest: err.suggestion = suggest(err.word, 1)[0] or null
        append; if count >= max: return
```
Table-cell paragraphs are top-level `p` blocks with a `cell` marker in the
Skriba model (`core/templates.js:166-172`), so they ARE checked. Sections and
other block types (`t != 'p'`) are skipped.

### 7.4 Locale gate — `isSpanishLocale(locale)` (`:740-742`)

`/^es\b/i` on `String(locale || '')`: true for `es`, `es-ES`, `es-CO`, `ES`,
`es_MX`?? — careful: `\b` between `s` and `_` is **not** a boundary (`_` is a
word char), so `es_MX` → **false**; `es-MX`, `es.utf8`, `es MX` → true;
`esp` → false; `''`, null → false. `doc.locale` defaults to `es-ES`
(`core/document.js:118`).

---

## 8. Suggestions — `suggest(word, max = 6)` (`:663-708`)

```
ensureBuilt()
w = toLowerCase(word)
cand: map candidate → (level, rank)
meter(s, level):
    if s ∉ KNOWN or s == w: return            // only KNOWN; user dict never suggested
    rank = FREQ_RANK[s] if present else 9999
    if s not in cand or level < cand[s].level: cand[s] = (level, rank)

// Level 0 — accent restoration
for s in DEACCENT[deaccent(w)] (if any): meter(s, 0)

// Level 1 — Spanish confusion pairs; each rule = ONE variant with ALL matches replaced
for (pattern, replacement) in CONFUSIONES:
    v = replaceAll(w, pattern, replacement)
    if v != w:
        meter(v, 1)
        for s in DEACCENT[deaccent(v)] (if any): meter(s, 1)

// Level 2 — edit distance 1
d1 = edits1(w)                       // ordered set (insertion order)
for v in d1: meter(v, 2)

// Level 3 — edit distance 2, only if needed
if cand.size < max and len(w) <= 9:
    budget = 20000
    for v in d1 (insertion order):
        if budget <= 0: break
        for v2 in edits1(v) (insertion order):
            meter(v2, 3)
            budget -= 1; if budget <= 0: break

sort cand by (level asc, rank asc, Spanish collation of the word asc)
return first `max` words
```

### 8.1 `CONFUSIONES` (exact, in order; `:631-637`)

| # | Pattern (JS regex) | Replacement | Meaning |
|---|---|---|---|
| 1 | `/b/g` | `v` | b→v |
| 2 | `/v/g` | `b` | v→b |
| 3 | `/ll/g` | `y` | ll→y |
| 4 | `/y/g` | `ll` | y→ll |
| 5 | `/g(?=[eéií])/g` | `j` | ge/gi→je/ji |
| 6 | `/j(?=[eéií])/g` | `g` | je/ji→ge/gi |
| 7 | `/s/g` | `c` | s→c |
| 8 | `/c(?=[eéií])/g` | `s` | ce/ci→se/si |
| 9 | `/z/g` | `c` | z→c |
| 10 | `/c(?=[aáoóuú])/g` | `z` | ca/co/cu→za/zo/zu |
| 11 | `/^h/` | `` | drop initial h (first char only) |
| 12 | `/^(?=[aáeéiíoóuú])/` | `h` | prepend h if the word starts with a vowel |
| 13 | `/x/g` | `s` | x→s |
| 14 | `/k/g` | `qu` | k→qu |
| 15 | `/nb/g` | `mb` | nb→mb |
| 16 | `/np/g` | `mp` | np→mp |

Global replacement = all non-overlapping left-to-right matches, lookaheads do
not consume. Only a whole-word substitution is tried (not one occurrence at a
time): `bebe` → only `veve` for rule 1.

### 8.2 `edits1(w)` (`:640-653`) — exact generation order

```
ALFABETO = "abcdefghijklmnñopqrstuvwxyzáéíóúü"   (33 chars, in this order)
out = ordered set
for i in 0..len(w):
    a = w[:i]; b = w[i:]
    if b non-empty:      add(a + b[1:])                          // deletion
    if len(b) > 1:       add(a + b[1] + b[0] + b[2:])            // transposition
    for c in ALFABETO:
        if b non-empty:  add(a + c + b[1:])                      // substitution (incl. identity)
        add(a + c + b)                                           // insertion
```
The order matters **only** for level 3 because of the 20 000-iteration
budget: the budget counts every generated `v2` (duplicates included) in this
exact order, iterating `d1` in insertion order (first-add position). To match
JS results for long-ish words, preserve these orders exactly (use an
insertion-ordered set, e.g. vector + unordered_set).

### 8.3 Ranking and collation

- Key 1: level (0 accent < 1 confusion < 2 distance-1 < 3 distance-2).
- Key 2: frequency rank (`FREQUENT_FIRST` index, unknown = 9999).
- Key 3: `a.localeCompare(b, 'es')` — ICU Spanish collation. Implement with
  ICU (`icu::Collator` locale `es`) if available; otherwise approximate:
  primary comparison on base letters with accents/ü removed and **`ñ` as a
  separate letter sorting after `n`**, then secondary tie-break unaccented <
  accented. (JUCE's `String::compareNatural` is NOT equivalent.)
- Default `max` = 6 (context menu also asks for 6; F7 asks `suggest(w,1)`).

### 8.4 Expected suggestion outputs (JS, verified; good Catch2 goldens)

| Input | `suggest(input)` |
|---|---|
| ortografia | `[ortografía]` |
| cancion | `[canción]` |
| arbol | `[árbol, rol]` |
| dividio | `[dividió, dividid, dividido, dividir, divido, envidio]` |
| ablar | `[hablar, bailar, bajar, bañar, bazar, cablear]` |
| vaia | `[vaca, vais, vaya, para, nada, casa]` |
| cassa | `[casa, casas, causa, hasta, acusa, falsa]` |
| aqui | `[aquí, que, qué, fui, saque, saqué]` |
| dificil | `[difícil, edificio]` |
| qeso | `[eso, peso, queso, es, pero, esto]` |
| haora | `[ahora, hora, para, abra, ahorra, barra]` |
| bez | `[vez, pez, de, el, es, en]` |
| cosina | `[cocina, cosida, domina, opina, tosida]` |
| jente | `[gente, junte, mente, rente, este, ante]` |
| yegar | `[llegar, cegar, negar, pegar, regar, segar]` |
| exelente | `[excelente]` |
| canpo | `[campo, canto, banco, dando, gano, lanzo]` |
| dias | `[días, dais, das, digas, odias, las]` |
| skriba | `[arriba, escriba]` |
| zzzzzzzzzzzz | `[]` |

(Words longer than 9 never get level 3, e.g. `exelente` is 8 so it does; a
12-char unknown gets only levels 0-2.) Timing in JS: 1-10 ms per call.
Suggestions are computed **only on demand** (context menu / F7), never while
typing.

---

## 9. User dictionary and "ignore all"

### 9.1 Engine state (`:47-50`, `:715-748`)

| Function | Behaviour |
|---|---|
| `addToDictionary(word)` | `w = trim(String(word or '')).toLowerCase()`; if non-empty add to `userDict`; return the full list (insertion order). |
| `loadUserDictionary(words)` | For each `w` in `words` (null/undefined list → nothing): `trim(String(w or '')).toLowerCase()`; add if non-empty. Union; never clears. (`null` → `''` → skipped.) |
| `userDictionary()` | List in insertion order. |
| `ignoreWord(word)` | `ignored.add(String(word or '').toLowerCase())` — **no trim**. Session only, never persisted. |
| `_resetUserState()` | Clears both sets (tests only). |

Matching: `isKnown` accepts `w` if `w ∈ userDict` **or** `deaccent(w) ∈
userDict` (adding `cafe` also accepts `café`; adding `café` does not accept
`cafe`). Matching against `ignored` is exact lowercase.
Both sets are **process-global** in JS (module singletons). In C++ make it an
instance (`SpellChecker` object owned by the app/session) but keep one shared
instance per app window so semantics match.

### 9.2 Persistence (main.js:607-628)

- **Per document**: `doc.dictionary` — JSON array of strings in Skriba's native
  document format (`core/document.js:162` load: `Array.isArray(data.dictionary)
  ? copy : []`; `:261` save). Written via `commands.setDocProps({dictionary:
  list})` → **undoable** and autosaved.
- **Per machine**: browser `localStorage['skriba:dictionary']` = JSON array.
  C++ equivalent: a user-settings file (e.g. `juce::PropertiesFile` key
  `dictionary` or `<appdata>/Skriba/dictionary.json`). Parse errors ignored.
- Load order: on startup and on every `doc:loaded`, `loadUserDictionary(doc.dictionary)`
  then `loadUserDictionary(machineList)` — **before** the first scan. The
  engine set is never cleared when switching documents (words from a previous
  document stay accepted for the session — replicate).
- `addWordToDictionary(word)`: engine add → write the full engine list to the
  machine store → `setDocProps({dictionary: full engine list})` (so the doc
  receives the union, including words from the machine store/other docs) →
  `liveSpell.rescan()`.
- "Omitir todas": `ignoreWord(word)` → `liveSpell.rescan()`.

---

## 10. Known bugs / quirks in the JS (decide: replicate or fix)

| ID | Where | Behaviour | Effect | Fix |
|---|---|---|---|---|
| B1 | `:213-215` | Strong preterite non-j: `base[:-1] + 'ié'` = `tuvi`+`ié` | `tuviiéramos, hiciiéramos, pudiiéramos, quisiiésemos` generated; real **`tuviéramos, hiciéramos, estuviéramos, pudiéramos, hubiéramos, pusiéramos, mantuviéramos` are flagged** (verified unknown) | use `base[:-2] + 'ié'` when non-j |
| B2 | AUTO_SKIP conjugation | stem of `ser`=`s`, `ir`=`` | junk forms `sía, sías, síamos, sida, sidos, sidas, ía, ías, ida, idos…` accepted; `deciendo`, `podiendo`, `poded` (decir/poder gerund/imperative) accepted | skip gerund/imperfect for ser/ir/ver; harmless otherwise |
| B3 | `:231-232, :300-301` | `-uir` treated as vowel stem | generates `construíste, construímos, construísteis, construído(s/a/as)`; the correct `-uido` participles are NOT generated: **`construido`, `destruido` are flagged** (verified); `incluido`, `distribuido` pass only because they are listed in `ADJECTIVES`; `construiste` passes only through the clitic fallback (`…te`) | for esUir use the non-accented endings `iste, imos, isteis` and `ido/id` |
| B4 | `adquirir:ie` | stem has `i` not `e` | `adquiero` flagged | special class `i→ie` |
| B5 | `pluralize` | words ending in `s` return unchanged | `franceses`, `ingleses` (only via clitic accident), `meses`/`países` only via fallbacks | `[áé]s$` → deaccent + `es`; monosyllables in s → + `es` |
| B6 | `pluralize` | `á é ó` endings fall to `+es` | `cafées, sofáes, mamáes, menúes` generated (junk), `mamás` flagged | add `áéó` to the `+s` branch |
| B7 | `checkWordSpelling` | mechanical check before user dict | user-added `pizza` still flagged | check userDict before `mechanicalError` |
| B8 | adjectives in `or` | `mayor→mayora`, `menor→menora`, `superior→superiora` | junk accepted | restrict to agentive -dor/-tor/-sor |
| B9 | `argüir` | `esUir` false (ends `üir`) | `arguyo` flagged, `argüo` accepted | treat `üir` like `uir` with stem `argu` |
| B10 | Clitic heuristic | any known word + clitic accepted | `perola`, `casala` accepted | restrict base to infinitive/gerund/imperative forms |
| B11 | Design doc | mentions `-illo` diminutives and "21 tests" | code has no `-illo`; test file has **21** tests (matches) | — |
| B12 | `lexicon.js:454,459` | `deshacer2`, `asumir2` | literal entries | drop |

In parity mode all of these must be reproduced to hit 70 515 forms.

---

## 11. Real-time scheduling — `initLiveSpelling(ctx)` (`live.js`)

### 11.1 Inputs

`getDoc()` → document; `view.drawSpelling(ranges)`; event bus with
`doc:changed {blockIds?: string[], structural?: bool}`, `doc:loaded`,
`selection:changed`; `getCaret()` → `{blockId, offset}` when the selection is
**collapsed**, else null (main.js:594-602).

### 11.2 State

```
enabled = true
byBlock : map blockId → list of errors (model offsets)
dirty   : set of blockIds
full    = true
timer   = none
hidden  = null            // the error currently hidden because it contains the caret
DEBOUNCE_MS = 350
```

### 11.3 Algorithm

```
active() = enabled and doc != null and isSpanishLocale(doc.locale)

hiddenAviso(caret): if caret null → null
    for a in byBlock[caret.blockId]: if a.start <= caret.offset <= a.end → return a   // inclusive both ends
    null

draw():
    if view has no drawSpelling: return
    if not active(): hidden = null; drawSpelling([]); return
    hidden = hiddenAviso(getCaret())
    ranges = for each (blockId, list) in byBlock (map insertion order), each a != hidden:
             {start:{blockId, offset:a.start}, end:{blockId, offset:a.end}}
    drawSpelling(ranges)

check():
    timer = none
    if not active() or doc null: byBlock.clear(); dirty.clear(); full = false; draw(); return
    if full:
        byBlock.clear()
        for e in checkDocumentSpelling(doc):        // default max 2000, no suggestions
            byBlock[e.blockId].append(e)
    else:
        for id in dirty:
            block = doc.getBlock(id)
            if block missing or block.t != 'p' or block.hf: byBlock.erase(id); continue
            errs = checkBlockSpelling(block)
            if errs non-empty: byBlock[id] = errs else byBlock.erase(id)
    full = false; dirty.clear(); draw()

schedule(): cancel timer; timer = after 350 ms → check()     // trailing debounce

on doc:changed(info):
    if not enabled: return
    if info.structural or info.blockIds is not an array: full = true
    else dirty += info.blockIds
    schedule()
on doc:loaded: full = true; schedule()          // even when disabled (check() then clears)
on selection:changed:
    if byBlock empty: return
    if hiddenAviso(getCaret()) != hidden (identity): draw()   // redraw only when the hidden word changes

setEnabled(on): enabled = (on != false)
    if enabled: full = true; check() (immediately)
    else: cancel timer; byBlock.clear(); dirty.clear(); drawSpelling([])
rescan(): cancel timer; full = true; check()        // after ignore/add-to-dictionary
errorAt(pos): if pos null or not active() → null; first a in byBlock[pos.blockId]
              with a.start <= pos.offset <= a.end (caret word INCLUDED, for the context menu)
rangeOf(a) → {start:{a.blockId,a.start}, end:{a.blockId,a.end}}
destroy(): cancel timer, unsubscribe the three handlers

Initial sweep: on idle (requestIdleCallback, fallback setTimeout 200 ms):
    if enabled: ensureBuilt(); full = true; check()
```

Word rule (as in Word): the word containing the caret (offset within
`[start, end]` inclusive, i.e. the caret just after the last letter still
hides it) is not underlined until the caret leaves it. Typing a space moves
the caret to `end+1` → word becomes visible on the next `selection:changed`.

C++ notes: use `juce::Timer` (message thread) for the 350 ms debounce and
`juce::Timer::callAfterDelay`/an idle callback for the initial sweep; the
whole engine is synchronous and cheap per block. Expanding the lexicon (~50 ms
in JS) may be done on a background thread at startup, but `isKnown` must not
be called before it finishes (gate with an atomic flag; the JS builds it
synchronously on first use).

### 11.4 Rendering (pages.js)

- Layer order: comments, find, **spell**, selection, caret (`pages.js:214`).
- Each range → `layout.rangeRects(range)` (exceptions → skip, block may be
  gone); cap **`MAX_SPELL_RECTS = 4000`** rectangles total (`pages.js:66`,
  checked before each range); only pages currently mounted are painted
  (virtualization). Recomputed on every `refreshAll` (zoom/scroll/reflow).
- Underline = repeated-x SVG tile 6×3 px at the bottom of the word rect:
  path `M0 2.2 Q1.5 .4 3 2.2 T6 2.2`, stroke `#e51400`, width 1, no fill
  (`pages.js:106`). Drawn at zoom 1 coordinates then scaled with the page.

### 11.5 UI strings and actions (verbatim)

| Place | Text / behaviour |
|---|---|
| Context menu on a flagged word (main.js:637-680) | Up to 6 suggestions (`suggest(word, 6)`), icon `spellcheck`; click → `commands.insertText(range, s)` (undoable) where range = error range clamped to the current block length `[max(0,min(len,start)), max(ini,min(len,end))]`. If none: disabled item `Sin sugerencias`. Separator, `Omitir todas`, `Agregar al diccionario`. Shown only when `errorAt(pos)` hits; otherwise the table/normal menu. The right-click first moves the caret to the click unless it is inside the current selection. |
| Ribbon → Revisar | checkbox `Ortografía mientras escribe` (default on) → `setEnabled(on)`; turning off clears instantly (ribbon.js:1676). |
| F7 pane `Ortografía y gramática` (review.js) | Merges `proofing.checkDocument(doc)` + `checkDocumentSpelling(doc, {suggest:true})`, sorted by block order in `doc.body` then `start`. Rule label for spelling: `Ortografía` (rendered uppercase "ORTOGRAFÍA" by CSS). Buttons: `Corregir: <suggestion>` (if suggestion non-null), `Omitir todas` (spelling) / `Omitir` (others), `Agregar al diccionario` (spelling). Omitir todas / Agregar remove every spelling item with the same `word` from the list and rescan the canvas. Summary: `No se han encontrado problemas.` or `N aviso(s) de escritura` (`1 aviso de escritura` / `N avisos de escritura`). Empty text: `La revisión comprueba la ortografía (diccionario en español), la puntuación, el espaciado y los signos de apertura.` + `No se han encontrado problemas.`. Pane refreshes 400 ms after `layout:done` while open. |
| Messages | `«{word}» no está en el diccionario.` / `Tres letras iguales seguidas.` / `En español la «q» va seguida de «ue» o «ui».` / `La doble «{xx}» no existe en español.` |

### 11.6 `proofing.js` (punctuation checker merged in F7, summary)

No lexicon. `checkText(t)` rules, each item `{start,end,rule,message,suggestion,text}`, then sorted by `(start,end)`:

| Rule id | Label | Detection | Message | Suggestion |
|---|---|---|---|---|
| `double-space` | `Espacios de más` | `/ {2,}/g` (ASCII space only) | `Sobran espacios entre palabras.` | `" "` |
| `space-before-punct` | `Espacio antes del signo` | `/ +([,.;:!?%)\]])/g` | `No se deja espacio antes de «X».` | `X` |
| `missing-space` | `Falta un espacio` | `/([,;:])(?=\S)/g`; skip if prev and next chars are digits (1,5 / 12:30) or next ∈ `)]}»"'`; range = the sign only | `Después de «X» va un espacio.` | `"X "` |
| `repeated-word` | `Palabra repetida` | `/\b(\p{L}{2,})(\s+)\1\b/giu` (case-insensitive; JS `\b` is ASCII-word based!), skip if lower ∈ {que, muy, no, si, sí, ya, tan, más} | `«W» aparece dos veces seguidas.` | `W` |
| `lowercase-after-dot` | `Minúscula tras punto` | `/(\p{L}+)\.\s+(\p{Ll})/gu`; skip if word (lower) ∈ ABREVIATURAS or length ≤ 1; range = the lowercase letter | `Después de un punto la palabra empieza por mayúscula.` | uppercase letter |
| `missing-opening` | `Falta el signo de apertura` | each `?`/`!`: sentence start = after last `. ? ! \n` before it (or 0); flag if `¿`/`¡` not in `[start, pos)` | `En español la pregunta o exclamación abre con «¿».` / `«¡»` | null |
| `straight-quotes` | `Comillas rectas` | each `"` | `Usa comillas tipográficas («») o inglesas (“”).` | null |
| `ellipsis` | `Puntos suspensivos` | `/\.{3}/g` | `Los puntos suspensivos son un solo carácter.` | `…` |

ABREVIATURAS = `sr sra srta dr dra lic ing prof av avda c cl núm num pág pag ed vol cap art fig tel etc ej aprox ud uds vd vds ss op cit p pp ii iii iv vi vii viii ix xi xii`.
`checkDocument(doc, {rules?, includeBands?, max=2000})` iterates `p` blocks,
skips `hf` unless `includeBands`, uses the same linear text (U+FFFC per
non-text run). `documentStats` (word count dialog) and `isWordChar(c)` =
`[\p{L}\p{N}]` are also here (`proofing.js:201-236`) — note the spell
tokenizer does NOT accept digits while `isWordChar` does. This module belongs
to the proofing spec; it is listed here because F7 merges both.

---

## 12. Test cases (tests/spell.test.js) — port 1:1 to Catch2

Fixtures: `p(id, text)` = `{t:'p', id, sec:'sec1', style:'Normal', runs:[{t:'text', text}]}`; `docOf(...blocks)` = `{version:1, body:[…]}`.

| # | Line | Name | Assertions |
|---|---|---|---|
| 1 | 50 | lexicon > 30 000 forms | `ensureBuilt(); lexiconSize() > 30000` (JS actual: 70 515 — add a parity test against the golden file) |
| 2 | 55 | regular conjugation | `isKnown` true: hablo, hablaste, hablará, hablaría, hablemos, hablaran, hablando, hablado, comimos, comerán, vivieron, viviendo |
| 3 | 62 | orthographic adjustments | true: busqué, llegué, empecé, toquen, pague, protejo, sigo |
| 4 | 68 | stem changes | true: pienso, puede, pidió, durmió, sintiendo, juega, empieza |
| 5 | 74 | strong preterites, irregular futures, participles | true: tuvo, tuviera, dijeron, hizo, supimos, estuvo, propuso, tendrá, saldría, hecho, escrito, vuelto, puesto, deshecho |
| 6 | 81 | very irregular explicit forms | true: soy, eres, vamos, fueron, sé, estoy, hay, oye |
| 7 | 87 | -uir/vowel+er/-zc/-guir | true: construyó, leyó, creyeron, conozco, parezca, sigue, consiguió, envío, continúa; **false**: consiguyó |
| 8 | 96 | plurals, gender, accent exceptions | true: canciones, luces, páginas, imágenes, exámenes, trabajadora, francesa, españolas |
| 9 | 103 | productive derivation | true: rápidamente, fácilmente, gatito, poquito, casitas, riquísimo, releer, incompleto, dámelo, verte, levantándose |
| 10 | 112 | never flagged | `shouldCheck`: Pérez→false, NASA→false, x→false, B12→false; `checkWordSpelling`: Pérez, NASA, x → null |
| 11 | 122 | correct vs unknown | `checkWordSpelling('casa')` null; `checkWordSpelling('ortografia')` non-null, rule `spelling`, message contains `ortografia` |
| 12 | 132 | mechanical errors | non-null: qeso, cassa, holaaa; null: carro, llave, acción, innato |
| 13 | 144 | text offsets | `checkTextSpelling('la ortografia importa')` → 1 item, word `ortografia`, start 3, end 13 |
| 14 | 152 | non-text runs = 1 unit | block b1 runs `[text "hola ", image rid r1, text " ablar"]` → 1 item, word `ablar`, start 7, end 12, blockId `b1` |
| 15 | 170 | document skips hf bands | doc: b1 "Texto correcto de prueba.", b2 "aqui falta una tilde", h1 "ablar en el encabezado" with `hf={kind:'header'}` → no item with blockId h1; some item b2/`aqui` |
| 16 | 183 | suggest option | doc b1 "la cancion sonaba", `{suggest:true}` → exactly 1 item, suggestion `canción` |
| 17 | 192 | accent restoration first | `suggest(x)[0]`: ortografia→ortografía, cancion→canción, arbol→árbol, dividio→dividió |
| 18 | 199 | confusion pairs | `suggest('ablar')` contains hablar; `suggest('vaia')` contains vaya; `suggest('cassa')` contains casa |
| 19 | 207 | user dict + ignore all | reset; `checkWordSpelling('skriba')` non-null; `addToDictionary('Skriba')` returns list containing `skriba`; `userDictionary()` deep-equals that list; `checkWordSpelling('skriba')` null; `checkWordSpelling('jsdoc')` non-null; `ignoreWord('jsdoc')`; now null; reset; `checkWordSpelling('skriba')` non-null again |
| 20 | 224 | loadUserDictionary union | reset; `loadUserDictionary(['Fable', '  omml  ', '', null])` → list contains `fable` and `omml` (and only those two); `checkWordSpelling('fable')` null; reset |
| 21 | 233 | isSpanishLocale | es-ES true, es-CO true, es true, en-US false, '' false, null false |

Recommended extra Catch2 tests (from this spec, verified in JS):
- Parity: expanded set == `spell-known-forms.golden.txt` (70 515 lines).
- `conjugate` outputs of §2.5 (full sequences for hablar, pedir, leer, dormir).
- `pluralize` / `adjectiveForms` tables of §4.
- Suggestion goldens of §8.4 (needs Spanish collation for ties).
- Tokenizer: soft hyphen, apostrophe, hyphen, U+FFFC cases of §7.1.
- `mechanicalError`: `pizza`→«zz», `qatar`→q message, `zoo`→null.
- `isSpanishLocale('es_MX') == false` (JS `\b` quirk).
- Live controller with a fake clock: debounce 350 ms, caret-word hiding
  (inclusive end), `errorAt` includes the caret word, disabled → empty draw,
  non-Spanish locale → empty draw.

Manual checklist to replicate (docs/checklists/ortografia.md): `la ortografia
es dificil` marks ortografia + dificil; `escribien` not marked while caret is
inside; Pérez/NASA/B12/x never marked; right-click `ortografia` → first
suggestion `ortografía`; `ablar` → `hablar` listed; Omitir todas on a word
repeated 3× clears all 3; Agregar persists across reload; language → Inglés
(Estados Unidos) clears all marks, back to Español restores; table-cell typo is
marked; header/footer bands never underlined; underline follows zoom/scroll;
undo of paste restores previous marks.
