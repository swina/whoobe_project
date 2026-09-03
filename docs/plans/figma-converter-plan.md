-------------------------------
## Figma → Whoobe Converter: Piano di Implementazione

## 1. Panoramica

Un convertitore che importa frame/componenti Figma direttamente nel visual builder Whoobe, traducendo l'albero JSON di Figma in un albero Element Whoobe con classi Tailwind e stili inline. Due modalità di import:

- **Live API**: tramite token Figma + file key (chiamate proxy via core-api)
- **File upload**: caricamento di un JSON esportato da Figma (es. tramite plugin "Design tokens" o "Export to JSON")

L'utente può scegliere all'import se il frame diventa una **pagina intera** (sostituisce il documento) o uno **snippet** (inserito nel container selezionato).

## 2. Architettura

### Nuovo package: `packages/figma-converter` (`@whoobe-cms/figma-converter`)

Pacchetto TypeScript puro, framework-agnostico, con due entry point:

| Entry | Descrizione |
|---|---|
| `convertFigmaTree(figmaNode, options)` | Prende un nodo Figma già parsato e restituisce un albero Whoobe Element |
| `fetchAndConvert(fileKey, nodeIds, accessToken, options)` | Chiama l'API Figma, risolve componenti/stili, converte |

Il package **non dipende dall'editor** — produce un albero `WhoobeElementNode` (lo stesso schema del SDK `@whoobe-cms/schema`) validabile con Zod.

### Integrazione backend (core-api)

Nuovo endpoint: `POST /figma/import`

- **Body**: `{ fileKey, nodeId?, mode: 'page' | 'snippet', settingsId? }`
- Usa il token Figma salvato nelle impostazioni (Settings → Integrations → Figma) o passato esplicitamente
- Chiama l'API Figma, risolve componenti e stili, converte, restituisce `{ element, name, images?: Record<string, string> }`
- Le immagini (fill IMAGE) vengono scaricate e uploadate su MinIO, oppure restituite come URL temporanee

Nuova tabella opzionale: `figma_settings` (token, team_id, workspace)

### Integrazione frontend (whoobe-one-spike)

Nuovo componente: `FigmaImportModal.vue`

- Aperto da un pulsante "Import Figma" nella toolbar del BlockEditor (accanto a "AI Generate")
- Due tab: **Live API** (file key + node selector) e **Upload JSON** (file picker + parse)
- Mostra anteprima del frame selezionato (tramite DocumentPreview)
- Scegli: "Import as Page" (sostituisce documento) / "Import as Snippet" (inserisce nel container corrente)
- Conferma import → normalizza albero (stessa pipeline di AI) → inserisce

### Flusso dati

```
Figma API ──> core-api ──POST /figma/import──> whoobe-one-spike ──> editor.document
                    ↑                                ↑
                    │                          FigmaImportModal.vue
              figma-settings                      preview + confirm
```

```
JSON file ──> whoobe-one-spike ──parse──> convertFigmaTree() ──> editor.document
                        ↑
                  FigmaImportModal.vue
                  (upload + preview + confirm)
```

## 3. Conversion Pipeline

```
Figma Node JSON
    │
    ▼
  1. Risolvi componenti (INSTANCE → mainComponent)
    │
    ▼
  2. Risolvi stili (styleId → style definitions)
    │
    ▼
  3. Normalizza struttura (appiattisci gruppi inutili, rimuovi nodi non convertibili)
    │
    ▼
  4. Converti layout (auto-layout → flexbox, absolute → inline-style)
    │
    ▼
  5. Converti stili (colori, typography, effetti → Tailwind / inline CSS)
    │
    ▼
  6. Converti contenuti (testo, immagini)
    │
    ▼
  7. Applica id fresh + clean classe CSS
    │
    ▼
  8. Valida con Zod (parsePageContent)
    │
    ▼
  Whoobe Element Tree
```

## 4. Mappatura Nodi Figma → Whoobe

| Figma Node Type | Whoobe Element | Note |
|---|---|---|
| `FRAME` (auto-layout) | Container `type: 'container'`, `element: 'div'` | Flex con direction/gap/align/padding da auto-layout |
| `FRAME` (nessun auto-layout) | Container `type: 'container'`, `element: 'div'` | Wrapper semplice, stile inline per posizione |
| `GROUP` | Container `type: 'container'`, `element: 'div'` | Wrapper, scartato se contiene un solo figlio (appiattito) |
| `SECTION` | Container con `semantic: 'section'` | Mappa diretta |
| `TEXT` | Element `type: 'element'` | `element: 'p'` (o 'h1'..'h6' se font size ≥ 24/20/16), contenuto + font/color |
| `RECTANGLE` (con solo colore) | Element `type: 'element'`, `element: 'div'` | `css.css` con bg-color, border-radius |
| `RECTANGLE` (con image fill) | Element `type: 'element'`, `element: 'img'` | `image.url` risolta |
| `RECTANGLE` (contenitore) | Container `type: 'container'`, `element: 'div'` | Se ha figli, si comporta come FRAME |
| `ELLIPSE` | Element `type: 'element'`, `element: 'div'` | `css.css` con `rounded-full`, bg-color |
| `LINE` | Element `type: 'element'`, `element: 'hr'` | Con stile inline per spessore/colore |
| `VECTOR` | Element `type: 'element'`, `element: 'img'` | Render come SVG via API Figma |
| `INSTANCE` | Risolvi → inline il componente principale | Appiattisci nel tree, non mantenere riferimento |
| `COMPONENT` | Container/Element come da contenuto | Trattato come FRAME |
| `BOOLEAN_OPERATION` | Element `type: 'element'`, `element: 'div'` | Render as image via API Figma (troppo complesso per CSS) |
| Altri (STAR, POLYGON, SLICE, CONNECTORS...) | Skippati o renderizzati come immagine | Log warning |

### Regole layout-positioning

- `layoutPositioning: 'ABSOLUTE'` → wrapper container con `position: relative`, figlio con `position: absolute; left: X; top: Y; width: W; height: H` in inline style
- `layoutSizingHorizontal: 'FILL'` → `w-full` o flex-1
- `layoutSizingHorizontal: 'HUG'` → contenuto wrap
- `layoutSizingHorizontal: 'FIXED'` → width inline

## 5. Layout Conversion (Auto-layout → Tailwind Flex)

### Mappa proprietà Figma → Tailwind

| Figma Auto-layout | Tailwind / CSS |
|---|---|
| `layoutMode: 'HORIZONTAL'` | `flex flex-row` |
| `layoutMode: 'VERTICAL'` | `flex flex-col` |
| `primaryAxisAlignItems: 'MIN'` | `justify-start` |
| `primaryAxisAlignItems: 'CENTER'` | `justify-center` |
| `primaryAxisAlignItems: 'MAX'` | `justify-end` |
| `primaryAxisAlignItems: 'SPACE_BETWEEN'` | `justify-between` |
| `counterAxisAlignItems: 'MIN'` | `items-start` |
| `counterAxisAlignItems: 'CENTER'` | `items-center` |
| `counterAxisAlignItems: 'MAX'` | `items-end` |
| `counterAxisAlignItems: 'BASELINE'` | `items-baseline` |
| `itemSpacing: N` | `gap-[Npx]` (o nearest `gap-N`) |
| `paddingLeft: N`, `paddingRight: N` | `px-[Npx]` (o nearest `p{N}`) |
| `paddingTop: N`, `paddingBottom: N` | `py-[Npx]` (o nearest `p{N}`) |
| `layoutWrap: 'WRAP'` | `flex-wrap` |
| `clipsContent: true` | `overflow-hidden` |

### Arrotondamento Tailwind

Tailwind usa una scala 0.25rem = 4px. Per padding/gap:

- `N = 0` → `p-0`
- `N = 1-3` → `p-0.5` (2px) o `p-1` (4px) o inline `p-[Npx]`
- `N = 4-7` → `p-1` (4px) e via
- Per valori non esatti: usa `p-[Npx]` (Tailwind JIT arbitrary value)

**Strategia: fedeltà intermedia**

- Padding/gap/layout → nearest Tailwind classe quando differenza < 2px, altrimenti inline `p-[Npx]`
- Width/height → inline `width: Npx; height: Npx` sempre (per evitare distorsioni)
- Max/min width/height → solo se violano il layout flow
- Font-size → nearest `text-N` se entro il 10%, altrimenti `text-[Npx]`
- Colori → `bg-[#hex]` / `text-[#hex]` (arbitrary values, massima fedeltà)

## 6. Style Conversion

### Colori (Fills SOLID)

```typescript
function convertSolidFill(paint: SolidPaint): { className: string; style: string } {
  const hex = rgbaToHex(paint.color, paint.opacity)
  // Se ha opacità, usa inline style con rgba
  // Se colore puro, usa classi arbitrary: bg-[#ff0000], text-[#ff0000]
  return {
    className: `bg-[${hex}]`,
    style: paint.opacity < 1 ? `background-color: rgba(${r},${g},${b},${paint.opacity})` : ''
  }
}
```

Nessun matching con Tailwind palette predefinita — si usano sempre arbitrary values per massima fedeltà.

### Gradienti

I gradienti Figma non hanno equivalenti Tailwind diretti per multi-stop/angoli complessi. Strategia:

- Gradienti semplici (2 stop, 90/180/270°) → `bg-gradient-to-r/from-X/to-Y` nearest match
- Gradienti complessi → inline `background: linear-gradient(...)` in style

### Typography

| Figma TypeStyle | Output |
|---|---|
| `fontFamily` | `font-['Open_Sans']` o family in `font` field |
| `fontWeight: 400` | `font-normal` |
| `fontWeight: 700` | `font-bold` |
| `fontSize: N` | `text-[Npx]` |
| `textAlignHorizontal: 'CENTER'` | `text-center` |
| `letterSpacing: N` | `tracking-[Npx]` |
| `lineHeightPx: N` | `leading-[Npx]` |
| `textDecoration: 'UNDERLINE'` | `underline` |
| `italic: true` | `italic` |

Il font-family viene mappato su:
- Google Font noto → scarica via Google Fonts + set `font: 'Font+Name'` (stesso meccanismo dei temi)
- Font sconosciuto → font-family inline style

### Border Radius

```typescript
function convertCornerRadius(cornerRadius, individualRadii): string {
  if (allEqual) return cornerRadius === 9999 ? 'rounded-full' : `rounded-[${cornerRadius}px]`
  else return inline `border-radius: ${tl}px ${tr}px ${br}px ${bl}px`
}
```

### Shadows (Effects)

- `DROP_SHADOW` → nearest `shadow-N` o inline `box-shadow`
- `INNER_SHADOW` → inline `box-shadow: inset ...`
- `LAYER_BLUR` → inline `filter: blur(Npx)`

### Opacity

`opacity < 1` → `opacity-N` (arrotondato a 5/10/25/50/75/90/95) o inline `opacity: 0.N`

## 7. Risoluzione Componenti e Stili

### INSTANCE nodes

Quando si incontra un `type: 'INSTANCE'`:

1. Leggi `componentId` (es. `"4:5"`)
2. Cerca nel map `components` del response Figma — contiene solo metadati, NON il tree del componente
3. Per ottenere il tree effettivo: bisogna aver già scaricato il componente via `GET /v1/files/{fileKey}/nodes?ids={componentId}`
4. Sostituisci l'instance con il tree risolto (deep merge, applicando `componentProperties` per varianti)
5. Se il componente non è disponibile (remoto/non accessibile): render come placeholder

**Ottimizzazione**: quando si richiede un FRAME/COMPONENT via `GET /v1/files/{fileKey}/nodes`, Figma restituisce già il tree completo con tutti i nodi inline (le istanze non sono referenze nel response). La risoluzione è necessaria solo se si naviga da un frame a un componente non incluso nel subtree originale.

### Style References

I nodi hanno `styles: { FILL: "styleId", TEXT: "styleId" }`. Il response Figma contiene `styles` map con le definizioni.

1. Leggi `styleId` dal nodo
2. Cerca in `response.styles[styleId]` — contiene solo metadati, non gli attibuti di stile
3. Il nodo ha già i valori applicati inline (fontSize, fills, ecc.) — Figma "appiattisce" sempre i valori
4. Usa i valori inline del nodo, non c'è bisogno di risolvere lo style

**Conclusione**: per il convertitore, i valori sono già inline nel nodo. La `styleId` serve solo per logging / debug.

## 8. Immagini

### Image Fills

I `RECTANGLE` con `fills[].type === 'IMAGE'` hanno:

```json
{
  "type": "IMAGE",
  "scaleMode": "FILL",
  "imageRef": "abc123"
}
```

Per ottenere l'URL reale:
1. `POST /v1/files/{fileKey}/images` → restituisce `{ "abc123": "https://..." }`
2. Questi URL scadono dopo 14 giorni

**Strategia**: durante la conversione server-side (core-api):
1. Ottieni URL immagine da Figma
2. Scarica l'immagine
3. Upload su MinIO via asset-processor
4. Usa l'URL DAM nel nodo Whoobe

In modalità upload JSON (senza API key):
- Se il JSON esportato include `imageRef`, mostra placeholder e logga warning
- Se il JSON esportato include URL già risolte, usale direttamente

### VECTOR / BOOLEAN_OPERATION

Render come immagine PNG tramite `GET /v1/images/{fileKey}?ids={nodeId}&format=png`, upload su MinIO.

## 9. Fasi di Implementazione

### Fase 1: Core Converter (pacchetto figma-converter)

| Task | Dettagli |
|---|---|
| 1.1 Struttura package | package.json, tsconfig, exports in index.ts |
| 1.2 Figma type definitions | figma-types.ts — interfacce per FigmaNode, Paint, TypeStyle, LayoutConstraint, ecc. |
| 1.3 Mappatura nodi base | RECTANGLE, TEXT, FRAME, GROUP, ELLIPSE, LINE → WhoobeElementNode |
| 1.4 Layout converter | Auto-layout → flexbox, padding/gap → Tailwind, absolute → inline |
| 1.5 Style converter | Colori SOLID → bg/text-[#hex], typography → classi Tailwind, corner radius |
| 1.6 Test suite | Test con fixture Figma JSON reali (5-10 frame di complessità crescente) |

### Fase 2: Live API Integration (core-api + figma-settings)

| Task | Dettagli |
|---|---|
| 2.1 Tabella figma_settings (migration) | token, team_id (crittografato) |
| 2.2 Settings UI → Integrations → Figma | Salva token Figma |
| 2.3 POST /figma/import | Proxy API Figma + fetch + convert + upload immagini su MinIO |
| 2.4 Risoluzione componenti / immagini | Chiamate parallele per componenti e imageRef |

### Fase 3: UI Integration (whoobe-one-spike)

| Task | Dettagli |
|---|---|
| 3.1 FigmaImportModal.vue | Due tab (Live API / Upload JSON), file picker, field per file key |
| 3.2 Node selector | Dopo aver caricato il file, mostra lista di frame/canvas, scegli quale importare |
| 3.3 Preview | DocumentPreview del frame selezionato prima di importare |
| 3.4 Mode selector | Import as Page / Import as Snippet (radio button) |
| 3.5 Import handler | Inserimento nel documento (stessa logica di template-gallery per page, kits-panel per snippet) |
| 3.6 Pulsante toolbar | Accanto a AI Generate in BlockEditor.vue |

### Fase 4: Polish & Edge Cases

| Task | Dettagli |
|---|---|
| 4.1 Gradienti complessi | Fallback a inline CSS per gradienti multi-stop |
| 4.2 Effetti (shadow, blur) | Mappatura a classi Tailwind o inline |
| 4.3 Instance resolution | Deep-resolve componenti annidati |
| 4.4 Test con Figma reali | 10+ frame da progetti Figma reali, verifica fedeltà visiva |
| 4.5 Gestione errori | Token scaduto, rate limit, nodo non trovato, JSON malformato |

## 10. File Summary

```
packages/figma-converter/
├── package.json                        # @whoobe-cms/figma-converter, dipende da @whoobe-cms/schema
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts                        # Esporta: convertFigmaTree, fetchAndConvert, FigmaConversionOptions
│   ├── figma-types.ts                  # Interfacce Figma Node (FRAME, TEXT, RECTANGLE...)
│   ├── converter.ts                    # Entry point: figmaNode → WhoobeElementNode
│   ├── layout.ts                       # Layout conversion: auto-layout → flex + tailwind
│   ├── style.ts                        # Style conversion: colori, typography, effetti → tailwind/inline
│   ├── text.ts                         # Text conversion: TypeStyle → font/weight/size/alignment
│   ├── resolve.ts                      # Risoluzione componenti/immagini
│   └── utils.ts                        # RGBA → hex, Tailwind nearest match, arrotondamento
│   └── __tests__/
│       ├── converter.test.ts           # Test con fixture reali
│       ├── layout.test.ts              # Test layout conversion
│       ├── style.test.ts               # Test style mapping
│       └── fixtures/
│           ├── simple-text.json         # Singolo frame con testo
│           ├── auto-layout-card.json    # Card con auto-layout
│           ├── complex-page.json        # Pagina multi-frame
│           └── component-tree.json      # Frame con istanze

apps/core-api/src/
├── routes/figma.ts                     # POST /figma/import, POST /figma/settings, GET /figma/settings
├── figma-settings-schema.ts            # Drizzle schema figma_settings

apps/whoobe-one-spike/src/
├── figma-api.ts                        # HTTP client per POST /figma/import
├── components/FigmaImportModal.vue      # Modal import (live API + upload JSON)
├── components/FigmaNodeSelector.vue     # Selettore frame/canvas da importare
├── components/FigmaPreviewPanel.vue     # Anteprima del frame prima dell'import
└── scripts/figma-actions.ts             # insertFigmaAsPage(), insertFigmaAsSnippet()
```

## 11. Open Questions

| Domanda | Opzioni |
|---|---|
| Dove salvare il token Figma? | Nuova tabella `figma_settings` OPPURE campo in `settings.json` esistente |
| Gestione rate limit Figma? | Retry con backoff OPPURE coda di attesa |
| Upload immagini su MinIO: sync o async? | Sync (bloccante) durante la conversione per semplicità OPPURE async con placeholder e sostituzione successiva |
| Cosa fare con testi che usano font non-Google? | Convertire in font-family inline style OPPURE ignorare (fallback a sans-serif) |
| Supporto varianti (COMPONENT_SET)? | Mostra lista varianti e scegli OPPURE usa default |
| Supporto FigJam? | No (solo Figma design) |