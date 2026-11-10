# BookForge — Authoring Workbench & Artwork Pipeline

**Implementation plan for v0.2–v0.4**
Status: Draft · Owner: TBD · Last updated: 2026-11-09

---

## 1. Summary

BookForge currently does one thing well: topic in, generated book out. The next
step is to make the generated book *ownable* — editable, structured, illustrated,
and exportable in formats authors actually publish.

This plan adds two connected capabilities:

1. **Authoring workbench** — a Scrivener-inspired structure layer (binder,
   outline board, chapter editor, inspector, snapshots, compile profiles) wrapped
   around the existing AI generation flow.
2. **Artwork pipeline** — an art plan generated with the outline, an independent
   image-provider layer, per-chapter/cover illustration generation, user uploads,
   and asset-aware exports, modelled on Playable Lessons' scene-image system.

The two are designed together: artwork is attached to structural nodes, planned
during outlining, reviewed in the workbench, and included by the compile step.
Scrivener's model is adopted; its UI and learning curve are not.

---

## 2. Goals and non-goals

### Goals

- Let a user review and edit the **outline before prose generation** (saves tokens,
  prevents bad books).
- Let a user edit prose, regenerate individual chapters, and continue writing
  without losing prior work.
- Give every book a durable **project folder on disk** with manuscript nodes,
  images, snapshots, and exports.
- Make illustrations a first-class part of the book, not a post-hoc hack:
  cover, frontispiece, chapter openers, optional inline images.
- Export illustrated books to Markdown, HTML, PDF, DOCX, and EPUB.
- Keep the one-click "generate me a book" flow intact for users who want it.

### Non-goals (this plan)

- Rich-text/WYSIWYG editing. Markdown text + preview is the format.
- Real-time collaboration or cloud sync.
- Full Scrivener compile engine (scriptwriting modes, custom metadata sprawl).
- Branching/interactive fiction (Ink). Revisit only as an optional export.
- Audiobook/TTS, translation, print bleed/trim (KDP-ready PDF) — deferred.
- Mobile app.

---

## 3. Design principles

1. **AI is an operator on a document tree, not a replacement for it.** Every
   generation targets a node the user can see, edit, and regenerate.
2. **Approve before you spend.** Outline, art prompts, and cost estimates are
   reviewable before the expensive stages run.
3. **Project data is plain files.** JSON + Markdown + image assets, git-friendly
   and backup-friendly. Secrets stay in `safeStorage`.
4. **Every AI edit is reversible.** Snapshot before any rewrite.
5. **One pipeline, two entry points.** The workbench and the quick-generate flow
   share the same generator and project store.
6. **Images are structural, not decorative.** Each artwork belongs to a node and
   a placement; exports know where it goes and what alt text it carries.

---

## 4. Current state and gaps

| Area | Today | Gap |
|---|---|---|
| Persistence | JSON blob via `electron-store` (`src/main/services/bookStore.ts`) | No project folders, no assets, no snapshots |
| Structure | Flat `chapters[]` with number/title/content | No parts, scenes, front/back matter, briefs |
| Generation | Outline then chapters, consumed immediately (`bookGenerator.ts:96`) | No approval gate; no prior-chapter context |
| Editing | None | No chapter editor, regenerate, or refine |
| Retry | Failed chapter marked `error`, no retry (`bookGenerator.ts:150`) | No per-node retry or resume |
| Cancellation | Checked between chapters only | No abort signal during a request |
| Artwork | None. `BookChapter` has no image field; renderer ignores images | Entire pipeline missing |
| Export | Markdown, HTML, PDF (`bookExporter.ts:16`) | No DOCX/EPUB, no images, no cover/TOC compile options |
| IPC | One `handlers.ts`, book-centric channels | Needs namespaced project/node/artwork/compile surface |
| UI | Generate / library / export / settings pages | Needs a workbench route and components |

Existing tests are green (3 suites, 23 tests) and `tsc --noEmit` passes; this plan
must keep both true at every phase boundary.

---

## 5. Target data model

All persisted dates remain ISO strings for clean IPC round-trips. The model is
versioned with `schemaVersion`.

### 5.1 Project and book

```ts
export interface Project {
  schemaVersion: 2;
  id: string;                    // uuid, validated before path use
  title: string;
  author: string;
  language: string;
  genre?: string;
  description: string;
  createdAt: string;
  modifiedAt: string;
  lastOpenedAt: string;

  book: BookDoc;
  settings: BookGenerationSettings;
  compileProfiles: CompileProfile[];
}

export interface BookDoc {
  status: 'draft' | 'planning' | 'planned' | 'generating' | 'paused'
        | 'completed' | 'error' | 'cancelled';
  provider: string;
  model: string;
  rootNodeIds: string[];         // top-level order
  nodes: Record<string, BookNode>;
  artworks: Artwork[];
  artPlan: ArtPlanMeta | null;
  stats: BookStats;
  currentJob?: { nodeId: string; phase: string; startedAt: string };
  error?: string;
}
```

### 5.2 Nodes (the binder tree)

Adjacency list: a node knows its parent and sibling order. This is cheap to
migrate from the flat chapter list and easy to drag/reorder.

```ts
export type BookNodeKind =
  | 'part' | 'chapter' | 'scene'
  | 'front-matter' | 'back-matter';

export type NodeStatus =
  | 'pending' | 'generating' | 'completed' | 'error' | 'regenerating';

export interface BookNode {
  id: string;
  kind: BookNodeKind;
  title: string;
  synopsis: string;             // one-line corkboard card text
  content: string;              // Markdown; empty on container nodes
  parentId: string | null;
  order: number;                // among siblings
  status: NodeStatus;
  wordCount: number;
  tokensIn: number;
  tokensOut: number;
  keywords: string[];
  brief?: ChapterBrief;
  artworkIds: string[];
  generation?: {
    model?: string;
    promptHash?: string;
    generatedAt?: string;
    error?: string;
  };
  createdAt: string;
  modifiedAt: string;
}

export interface ChapterBrief {
  pov?: string;
  tense?: string;
  goals?: string[];
  beats?: string[];
  continuityNotes?: string;
  sourceRefs?: string[];        // research node ids to ground on
}
```

Container nodes (`part`, and `chapter` when it has scene children) render as
headings and carry no prose. Prose lives on `chapter` (simple books) or `scene`
(structured books).

### 5.3 Artwork

One record per image. A cover uses `nodeId: null` and `placement: 'cover'`.

```ts
export type ArtworkPlacement =
  | 'cover' | 'frontispiece' | 'chapter-opener' | 'inline' | 'full-page';

export type ArtworkStatus =
  | 'planned' | 'queued' | 'generating' | 'ready' | 'error' | 'disabled';

export interface Artwork {
  id: string;
  nodeId: string | null;
  placement: ArtworkPlacement;
  prompt: string;
  negativePrompt?: string;
  stylePreset: string;          // key into STYLE_PRESETS
  styleBibleSnapshot?: string;  // style text used at generation time
  source: 'generated' | 'uploaded';
  status: ArtworkStatus;
  asset?: ArtworkAsset;         // absent while planned
  alt: string;                  // required for accessibility
  caption?: string;
  attribution?: string;
  provider?: string;
  model?: string;
  costUsd?: number;
  error?: string;
  order?: number;               // for inline placement
  createdAt: string;
  generatedAt?: string;
}

export interface ArtworkAsset {
  relativePath: string;         // assets/images/<id>.webp
  mime: 'image/webp' | 'image/jpeg' | 'image/png';
  width: number;
  height: number;
  bytes: number;
}

export interface ArtPlanMeta {
  stylePreset: string;
  styleBible: string;           // shared style/character/setting description
  origin: { provider: string; model: string; at: string };
}
```

### 5.4 Snapshots

```ts
export interface Snapshot {
  id: string;
  projectId: string;
  nodeId: string;
  createdAt: string;
  reason: 'manual' | 'pre-ai-edit' | 'pre-regenerate' | 'pre-restore' | 'import';
  label?: string;
  title: string;
  content: string;
  wordCount: number;
  prompt?: string;              // prompt that produced the newer version
  model?: string;
}
```

Snapshots are per node, pruned to the newest 50 per node by default (configurable).
Restoring creates a `pre-restore` snapshot of the current content first.

### 5.5 Compile profiles

```ts
export type CompileFormat = 'markdown' | 'html' | 'pdf' | 'docx' | 'epub';

export interface CompileProfile {
  id: string;
  name: string;
  format: CompileFormat;
  includeKinds: BookNodeKind[];
  frontMatterNodeIds: string[];
  backMatterNodeIds: string[];
  toc: { enabled: boolean; depth: number };
  chapterNumbering: 'none' | 'continuous' | 'restart-per-part';
  metadata: {
    title: string;
    author: string;
    language: string;
    isbn?: string;
    publisher?: string;
  };
  artwork: {
    includeCover: boolean;
    includeFrontispiece: boolean;
    includeChapterOpeners: boolean;
    includeInline: boolean;
    maxWidthPx: number;
    quality: number;            // 1–100, WebP/JPEG
    embedMode: 'linked' | 'embedded'; // HTML/EPUB only
  };
  page?: {
    size: 'A4' | 'Letter' | 'Legal';
    margins: { top: number; bottom: number; left: number; right: number };
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
  };
  outputPath?: string;          // last used, chosen via native dialog
}
```

---

## 6. Storage layout

Secrets and app preferences stay in `electron-store` (`bookforge-config`). Project
content moves to the filesystem.

```
<userData>/projects/<projectId>/
  project.json                  # Project + BookDoc (atomic writes)
  assets/
    images/<artworkId>.webp     # normalised generated/uploaded images
    thumbnails/<artworkId>.webp # binder/corkboard previews
  snapshots/<snapshotId>.json   # standalone, easy to inspect
  exports/<name>.<ext>          # last compile outputs
  .migrated-from-books-v1      # marker file
```

Rules:

- All writes atomic: write `<file>.tmp` then `fs.rename`.
- `project.json` is the index; snapshots are standalone files listed by scanning
  `snapshots/`.
- `ProjectStore.resolve(projectId, relativePath)` validates the id (`uuid`) and
  asserts the resolved path stays under the project root (`path.relative` check).
- Autosave is driven by the renderer with a 400 ms debounce per node; metadata
  edits save immediately. Main-process writes are synchronous per IPC call.
- Project deletion moves the folder to the OS trash (`shell.trashItem`), not `rm`.

### Migration from v1

`ProjectStore.migrateLegacyBooks()` runs once on startup when the marker is
absent:

1. Read all records from `bookStore` (`bookforge-books`).
2. Write a timestamped backup of the raw electron-store file.
3. For each book: create `projects/<book.id>/project.json`; convert `chapters[]`
   to `chapter` nodes with `parentId: null` and `order` from `number`; copy
   stats; set `schemaVersion: 2`.
4. Write `.migrated-from-books-v1`.
5. Leave the legacy store untouched for one release; a future release removes it.

Migration is idempotent: an existing project folder is skipped. Unit tests cover a
fixture with 0, 1, and many books.

---

## 7. Main-process architecture

```
src/main/
  ipc/
    handlers.ts            # register all groups (thin)
    project.ts             # project:* and node:*
    generation.ts          # book:*(plan|generate|cancel) + progress events
    artwork.ts             # artwork:* + imageProvider:*
    snapshots.ts           # snapshot:*
    compile.ts             # compile:*
    schemas.ts             # zod schemas (extended)
  services/
    project/
      ProjectStore.ts      # CRUD, atomic IO, path safety
      schema.ts            # zod project schema + validators
      migrate.ts           # v1 -> v2
      tree.ts              # pure tree ops: insert/move/delete/order/flatten
    generation/
      ManuscriptGenerator.ts  # staged, resumable generation
      stages.ts               # analysis/outline/artifact prompts + parsers
      ContextBuilder.ts       # rolling context + summaries
      Summaries.ts            # cache and invalidation
    artwork/
      ArtworkService.ts       # queue, generate, upload, retry, progress
      ArtPlanner.ts           # outline -> artwork records
      ImageProviderRegistry.ts
      stylePresets.ts
      imageProcessing.ts      # sharp: normalise, resize, thumbnail, strip EXIF
      providers/
        BaseImageProvider.ts
        OpenAIImageProvider.ts
        GeminiImageProvider.ts
        CompatibleImageProvider.ts   # LocalAI / OpenRouter / any /images/generations
        SwarmUIImageProvider.ts
        MockImageProvider.ts         # deterministic PNG for tests
    snapshots/
      SnapshotStore.ts
    compile/
      CompileService.ts       # Project -> CompiledDocument -> exporter
      CompiledDocument.ts     # intermediate representation
      exporters/
        markdown.ts
        html.ts
        pdf.ts
        docx.ts
        epub.ts
```

Keep `existing` modules until their replacement lands, then delete:

- `services/bookGenerator.ts` → `generation/ManuscriptGenerator.ts`
- `services/bookExporter.ts` + `bookHtml.ts` → `compile/exporters/*`
- `services/bookStore.ts` → `project/ProjectStore.ts` (legacy read kept for
  migration only)
- `ipc/handlers.ts` → split into the group files above

### 7.1 Generation pipeline v2

```
Intake
  └─ optional clarification (3–5 questions, skippable)
       └─ Analysis (JSON: audience, tone, themes, chapter count, art style)
            └─ Outline + briefs + art plan (JSON, zod-validated)
                 └─ [USER REVIEW / EDIT / APPROVE]        <-- new gate
                      ├─ Prose per node (context builder)
                      ├─ Optional continuity pass
                      └─ Artwork generation (background, optional)
                           └─ [USER REVIEW] → Compile
```

**Stage contracts**

- `book:plan` runs intake → analysis → outline → art plan and returns the project
  draft. No prose. This is cheap and fast.
- `book:generate` consumes the approved project and writes node-by-node. It may
  target all pending nodes or a supplied `nodeIds` subset.
- `book:generateNode` regenerates one node (manual edit flow). Creates a
  `pre-regenerate` snapshot first.
- Every stage validates JSON with zod. On failure: one repair attempt with the
  validation errors appended, then fail with a structured error.
- The project state machine is persisted after each node; `currentJob` allows
  resume after a crash. On startup, a `generating` book with no live job is
  marked `paused` and offered "Resume".

**Outline JSON shape** (stored as nodes, not a second document):

```json
{
  "title": "string",
  "synopsis": "string",
  "artStylePreset": "watercolor",
  "styleBible": "string",
  "nodes": [
    {
      "id": "stable-slug-or-uuid",
      "kind": "chapter",
      "title": "string",
      "synopsis": "string",
      "brief": { "pov": "third", "tense": "past", "goals": [], "beats": [] },
      "art": { "prompt": "string", "alt": "string", "caption": "string" }
    }
  ]
}
```

The implementation maps this to `BookNode` + `Artwork` records, preserving stable
ids so regenerating an outline can update rather than duplicate. If the provider
cannot emit reliable JSON, fall back to Markdown outline parsing (the existing
`parseOutline` logic) and synthesise briefs.

**ContextBuilder**

The current generator sends only the outline to each chapter
(`bookGenerator.ts:215`). That is the biggest quality gap. New behaviour:

- Inputs: style bible, full outline (titles + synopses), previous chapter tail
  (~800 tokens), running summary of all prior prose, node brief, selected
  research snippets.
- Budget from model context minus `maxTokens` and a safety margin:
  system/style 10%, outline 15%, research 15%, previous tail 10%, summary 50%.
- Summaries are generated once per completed node (or every ~2,000 tokens) using
  the current model at low `maxTokens`; cached in `summaries.json` keyed by
  `nodeId + contentHash`; invalidated for that node and all downstream nodes on
  edit.
- Research snippets are selected by keyword overlap with the node brief; opt-in
  per node via `brief.sourceRefs`.
- The builder is pure and unit-tested against budgets.

**Cancellation and retry**

- Add `signal?: AbortSignal` to `GenerationParams` (`src/shared/types/provider.ts`)
  and thread it through `ProviderManager` and every provider's `fetch`/SDK call.
- `book:cancel` aborts the in-flight request; partial node content is saved and
  status becomes `cancelled`. No more "stops after the current chapter".
- `BaseProvider.withRetry` remains the retry mechanism; the UI adds an explicit
  "Retry" action on failed nodes and a "Retry failed chapters" bulk action.

### 7.2 Artwork pipeline

**Stage A — plan (with outline).**
`ArtPlanner` asks the text model for a cover plus one illustration per chapter
(or per scene for structured books), each with prompt, alt text, and caption, plus
a `styleBible` covering recurring characters, setting, palette, and medium. The
planner is a separate prompt with a strict JSON schema. Records are created as
`status: 'planned'`. The user can edit prompts, toggle items, or add items.

**Stage B — generate.**
`ArtworkService` queues approved items (concurrency 1, configurable), emits
`artwork:progress`, and for each:

1. Builds the final prompt: `stylePreset directive + styleBible + item prompt`.
2. Calls the configured `ImageProvider.generate(prompt, opts)` → `Buffer`.
3. Normalises with sharp: strip metadata, convert to WebP (quality 82), resize to
   a max width (1600 default, 2000 for covers), generate a 400 px thumbnail.
4. Writes `assets/images/<id>.webp` + `assets/thumbnails/<id>.webp` atomically.
5. Updates the `Artwork` record to `ready` with dimensions/bytes/cost.

Failures keep the prompt and allow retry. A per-book cap (`maxImages`) and
`maxCostUsd` stop the queue before overspending; the UI shows the estimate and
requires confirmation when above a threshold.

**Stage C — upload.**
`artwork:upload` opens a native file dialog, validates by magic bytes (PNG, JPEG,
WebP, GIF; SVG allowed only by rasterising through sharp), enforces max 20 MB and
max 8000 px, re-encodes, and stores it like a generated image with `source:
'uploaded'`. Alt text is required (defaults to the file name if the user skips).

**Stage D — display and export.**
Renderer loads thumbnails in the binder and full images via the existing `app://`
protocol. Compile resolves artwork per node and placement.

**Image provider interface**

```ts
export interface ImageProviderInfo {
  id: string;
  name: string;
  requiresApiKey: boolean;
  supportsReferenceImages: boolean;
  defaultModel: string;
  sizes: string[];               // provider-supported dimensions
}

export interface ImageGenOptions {
  model?: string;
  size?: string;                 // e.g. '1024x1024'
  stylePreset?: string;
  signal?: AbortSignal;
}

export interface ImageProvider {
  readonly info: ImageProviderInfo;
  initialize(config: ImageProviderConfig): Promise<void>;
  validateConfig(config: ImageProviderConfig): Promise<ConfigValidationResult>;
  generate(prompt: string, opts: ImageGenOptions): Promise<Buffer>;
  estimateCost(images: number, size: string): CostEstimate;
  dispose(): Promise<void>;
}
```

Providers in scope:

| Provider | Default model | Notes |
|---|---|---|
| OpenAI | `gpt-image-1` | `b64_json` response; dall-e fallback needs `response_format` |
| Gemini | `imagen-4.0-fast-generate-001` | `:predict`, base64 payload |
| OpenAI-compatible | user-specified | LocalAI, OpenRouter, LiteLLM; require base URL + model |
| SwarmUI | user-specified | Native API, optional LoRA |
| Mock | deterministic PNG | Tests and offline demos |

Image provider configs use the same encrypted store path as text providers
(`secureStore`), namespaced under `images.<id>`; keys are never returned to the
renderer. Add `imageProvider:list|initialize|test|setCurrent|remove` IPC.

**Style presets** (`stylePresets.ts`): `storybook`, `watercolor`, `line-art`,
`engraving`, `photorealistic`, `cinematic`, `technical-diagram`, `isometric`,
`childrens-book`. Each is a short directive prepended to every prompt. The
`styleBible` is appended after it so per-book consistency dominates the preset.

### 7.3 Compile and export

Introduce a `CompiledDocument` intermediate:

```ts
interface CompiledDocument {
  metadata: CompileProfile['metadata'];
  chapters: Array<{
    nodeId: string;
    level: number;               // heading depth
    title: string;
    markdown: string;
    artwork: Array<{ artwork: Artwork; assetPath: string; caption?: string }>;
  }>;
  cover?: { artwork: Artwork; assetPath: string };
}
```

`CompileService` walks the tree in order, applies `includeKinds`, numbering, and
front/back matter, then hands the document to one exporter. Profile selection and
output path live in a native save dialog.

**Markdown** — write the manuscript and copy images to `<name>-assets/`; image
references are relative (`![alt](<name>-assets/cover.webp)`); optional YAML front
matter per profile.

**HTML** — single-file (base64 images) or linked. Extend the export CSP to
`img-src 'self' data: https:` so linked local images load. Raw HTML from the model
stays stripped (`bookHtml.ts:47`).

**PDF** — write the HTML + assets to a temp directory, load it into an offscreen
`BrowserWindow`, and `printToPDF` with `printBackground`. Cover as page one,
chapter openers, CSS `@page` margins. Note: headers/footers/page numbers via
Electron are limited; ship clean pagination first and evaluate a dedicated PDF
engine only if print-quality page numbers become a requirement.

**DOCX** — use the `docx` package. Headings from node depth, images via `ImageRun`
with widths in inches, static TOC (no field-update prompt), metadata in core
properties.

**EPUB 3** — build with `jszip`: `mimetype` (uncompressed), `META-INF/container.xml`,
`OEBPS/content.opf`, `nav.xhtml`, one XHTML per chapter, `OEBPS/images/*`, cover
image. Reflowable first; fixed-layout for picture books is deferred.

**Backwards compatibility:** keep `export:markdown|html|pdf` channels for one
release, delegating to default compile profiles, so existing renderer code and
tests keep working.

---

## 8. IPC and preload surface

All payloads are zod-validated. Handlers return the existing envelope
(`{ success: true, ... }` or `{ success: false, error }`). Progress events are
throttled to 4/s.

```
project:list | create | open | updateMeta | delete | duplicate
node:create | update | move | delete
book:plan | generate | generateNode | cancel | resume
book:progress            (event)
snapshot:list | create | restore | diff
artwork:list | update | create | delete | upload | generate | generateAll
artwork:progress         (event)
imageProvider:list | initialize | test | setCurrent | remove
compile:profiles:list | save | delete
compile:run | preview
export:markdown | html | pdf        (legacy, delegating)
```

Preload exposes a namespaced, typed API; update
`src/renderer/types/electron.d.ts` to match. Renderer code uses a thin typed
client (`src/renderer/lib/api/`) instead of raw `window.electronAPI` calls.

---

## 9. Renderer plan

New route: `/book/[id]` (workbench). `/library` becomes the projects dashboard.

```
app/book/[id]/page.tsx
components/workbench/
  WorkbenchShell.tsx       # three panes: binder | editor | inspector
  Binder.tsx               # tree, drag/drop, status badges, word counts
  OutlineBoard.tsx         # corkboard cards, synopsis editing, approvals
  EditorPane.tsx           # Markdown editor + preview, autosave, AI actions
  Inspector.tsx            # brief, keywords, tokens, snapshots, artwork link
  ArtworkTab.tsx           # plan review, generate, upload, alt/caption
  ArtworkCard.tsx
  SnapshotDrawer.tsx
  DiffView.tsx
  CompileDialog.tsx
lib/stores/projectStore.ts # Zustand: project, selection, autosave queue
lib/stores/artworkStore.ts
lib/stores/generationStore.ts
lib/api/project.ts | artwork.ts | compile.ts
```

UI details:

- **Binder**: parts/chapters/scenes with collapse, drag-to-reorder (dnd-kit or
  `@tanstack/react-virtual` for large books), status icons (pending, generating,
  error, illustrated), word count. Add front/back matter from a menu.
- **Outline board**: cards show title + synopsis + art thumbnail; click to edit
  inline; "Approve outline" enables generation. This replaces the current
  immediate generate-and-run behaviour for workbench users.
- **Editor**: split Markdown textarea + rendered preview; toolbar actions:
  *Refine*, *Expand*, *Shorten*, *Continue*, *Rewrite tone*, *Regenerate*.
  All AI actions snapshot first and stream results. Keyboard shortcuts for save
  and navigation.
- **Inspector**: brief fields, keywords, token/cost per node, snapshot list with
  diff/restore, artwork attachments.
- **Compile dialog**: profile picker, format, front/back matter, TOC, artwork
  options, page settings, estimated output size.
- **Quick generate**: `/generate` remains; after completion it opens the
  workbench with the book loaded. No forced detour.

State rules: selection and UI state in Zustand; project content fetched from main
and refreshed on events. Autosave is optimistic with a retry toast on failure.
The editor never owns the source of truth longer than the debounce window.

---

## 10. Phased implementation

Estimates assume one senior developer; renderer and main work can overlap with a
second person. Each phase ends with `npm test`, `npm run typecheck`, and
`npm run lint` green.

### Phase 0 — Foundations (≈1.5 weeks)

**Goal:** fix generation quality and create the seams for later work without
changing the UI much.

**Status: 5/7 complete (2026-11-09).** The stage split and schema versioning move
to Phase 1, where the outline approval UI and project store give them a purpose.

- [x] Add `signal?: AbortSignal` to `GenerationParams`; thread through
      `ProviderManager` and all providers.
- [x] Replace between-chapter cancellation with true abort; save partial node.
- [x] Add `ContextBuilder` + summary cache; feed prior content into chapter
      prompts.
- [ ] Split generation into stages (analysis/outline) behind existing channel;
      keep the auto-run path working. *Deferred to Phase 1 with the outline gate.*
- [x] Add per-node retry actions and a "Retry failed chapters" handler.
      *`book:retry` retries every incomplete chapter (also resumes cancelled
      books); per-node editor actions arrive with the workbench.*
- [ ] Extend `bookStore` records with `schemaVersion` and node shape behind an
      adapter (no disk relocation yet). *Folded into the Phase 1 ProjectStore
      migration.*
- [x] Add cost estimation (`book:estimate`, shown on the generate page).

**Acceptance:** A 10-chapter book generated with the Mock provider references
earlier chapters; cancelling aborts within 2 s; failed nodes can be retried;
existing tests pass; new tests cover abort, context budgeting, and retry.

**Delivered artifacts:** `src/main/services/contextBuilder.ts` (+ tests),
`src/main/services/bookGenerator.test.ts`, abort plumbing across all text
providers and the mock, `book:estimate`/`book:retry` IPC, and a resume/retry
action in the library.

### Phase 1 — Project store and workbench (≈3 weeks)

**Goal:** durable projects, binder, editor, outline gate, snapshots, compile
profiles for existing formats.

**Status: complete (2026-11-09).**

- [x] `ProjectStore` with atomic IO, path validation, delete-to-trash.
- [x] v1 → v2 migration + fixture tests.
- [x] Tree operations (`tree.ts`) with tests: insert, move across parents,
      delete subtree, reorder, flatten for compile.
- [x] IPC groups for `project:*`, `node:*`, `snapshot:*`, `node:aiEdit`,
      `compile:*`; zod schemas; preload and typed renderer client.
- [x] `/library` becomes a project dashboard (open, duplicate, delete).
- [x] `/book` workbench shell with binder, editor, inspector.
- [x] Outline board: edit title/brief inline, plan, then write chapters.
- [x] Chapter editor with autosave, split Markdown preview, and
      refine/expand/shorten/continue/regenerate actions (snapshot before each).
- [x] Snapshots: create, list, line diff against current content, restore;
      auto-snapshot before AI edits and restores.
- [x] `SnapshotStore` pruning.
- [x] Compile via `CompiledDocument`: presets, table of contents, front/back
      matter, chapter numbering, title page, Markdown/HTML/PDF dialogs.
- [x] Binder drag-and-drop reordering (accessible API underneath).
- [x] `/export` page compiles projects through the same pipeline.

**Acceptance:** Create a project, approve an edited outline, generate chapters,
edit prose with AI actions, preview it, diff and restore a snapshot, reorder the
binder, and compile Markdown/HTML/PDF with a title page, TOC, and chosen matter;
restarting the app preserves everything; a legacy book appears as a project after
migration.

**Delivered artifacts:** `src/main/services/project/{projectStore,mapping,tree,
snapshotStore,compileService,compiledDocument,manuscriptEditor,diff}.ts` (+
tests), `src/main/ipc/projectHandlers.ts`, the workbench components (binder,
outline board, editor, inspector, compile dialog), and a project-aware generate
and export flow.

### Phase 2 — Artwork pipeline (≈3 weeks)

**Goal:** cover and chapter illustrations generated, edited, uploaded, and
embedded in all exports.

**Status: complete (2026-11-09).** The pipeline runs end to end with the Mock
provider and the four real image providers. Packaging config unpacks sharp; run a
full installer build on each platform before release.

- [x] `ImageProvider` interface + registry + Mock provider.
- [x] OpenAI, Gemini, OpenAI-compatible, SwarmUI providers with contract tests.
- [x] Secure config for image providers; Settings UI with provider, key, base URL,
      model, and size controls (Save validates config; no paid test call).
- [x] `stylePresets.ts` and style-bible plumbing.
- [x] `ArtPlanner` runs after outline planning when an image provider exists, and
      on demand from the Artwork tab; records start as `planned`.
- [x] Artwork tab: review/edit prompts, alt text, captions, enable/disable,
      thumbnails, generate/regenerate, upload, delete, cover and per-chapter art.
- [x] `ArtworkService` sequential queue, progress events, per-item retry, image
      and cost caps, abort via the project cancel action.
- [x] `imageProcessing.ts` with sharp: validate, auto-orient, resize, thumbnail,
      strip metadata, convert to WebP.
- [x] Compile integrates cover, chapter openers, and node-attached inline art into
      Markdown (copied assets), HTML/PDF (embedded data URLs), DOCX, and EPUB.
- [x] DOCX and EPUB exporters with image embedding and alt text.
- [x] Alt-text validation in compile (warn, do not block).

**Acceptance:** Generate a 5-chapter book with a cover and one image per chapter
using the Mock provider; edit a prompt and regenerate one image; upload a cover;
compile all five formats and verify images and alt text are present; cost estimate
is recorded per artwork.

**Delivered artifacts:** `src/main/services/artwork/*` (registry, providers,
planner, service, style presets, sharp processing, asset storage),
`src/main/services/project/{compiledDocument,compileService,exporters/*}.ts`,
new `imageProvider:*` / `artwork:*` IPC, the Artwork tab, the image provider
settings card, and tests for providers, planning, processing, service wiring,
Markdown/HTML artwork rendering, DOCX, and EPUB.

### Phase 3 — Research, grounding, and polish (≈2 weeks)

**Status: complete (2026-11-09).**

- [x] Research nodes (`kind: 'research'`) excluded from manuscript; import text,
      Markdown, and PDF text; selected by keyword overlap and injected into both
      chapter generation and AI edits.
- [x] Book templates (blank, course companion, practical guide, short novel) that
      prefill settings, chapter skeletons, and the art style preset.
- [x] Continuity pass: advisory JSON review that flags conflicts and dropped
      threads with chapter references and suggestions.
- [x] Batch compile of multiple projects into one chosen folder.
- [x] Empty states, keyboard shortcuts (Cmd/Ctrl+S, Escape), and aria labels on
      icon-only controls. Onboarding remains lightweight.
- [x] Documentation: README feature update + `docs/USER_GUIDE.md`.
      ARCHITECTURE.md not yet refreshed for the workbench.

**Acceptance:** Ground a chapter in an imported research note and observe it in
the prompt context; apply a template to a new project; compile two projects in
one action.

**Delivered artifacts:** `src/shared/types/{templates,artwork,image}.ts`,
`src/main/services/project/{continuity,researchImport}.ts` (+ tests), research
and continuity IPC, the image/research/continuity UI, template-aware project
creation, batch compile, the user guide, and README updates.

### Deferred backlog

Series support, collaboration, cloud sync, fixed-layout EPUB/picture-book
templates, audiobook/TTS, translation, print-ready PDF with bleed/trim, Ink/branching
export, plugin system.

---

## 11. Security and safety

- **Path safety:** project ids and node/artwork ids are uuid-validated before any
  path join; resolved paths must remain under the project root. Renderer never
  supplies absolute paths; native dialogs supply them.
- **IPC:** every new channel parses with zod; unknown keys rejected; error
  envelopes preserve the existing code/message contract.
- **Secrets:** image-provider keys use `secureStore` like text providers; never
  logged, never returned; redacted views only.
- **Remote images:** only absolute `http(s)` URLs; request timeout; max response
  size; redirects to `file:`/`data:` rejected; warn when a user-configured base
  URL points at a private range (SSRF awareness).
- **Uploads:** magic-byte check, size/dimension limits, re-encode through sharp
  (strips EXIF and payloads); SVG only via rasterisation; no raw file passthrough.
- **Exported HTML:** strict CSP (`default-src 'none'; img-src 'self' data: https:;
  style-src 'unsafe-inline'; font-src data:`), raw model HTML stripped.
- **Prompt injection:** research text and user notes are delimited as data and
  never concatenated into system instructions.
- **Copyright:** surface provider terms, keep an `attribution` field, warn against
  generating real people/brands, and never claim generated art is licensed for
  commercial use without the user checking their provider.

---

## 12. Cost controls

- `book:plan` returns estimated tokens/cost for prose (provider pricing already in
  `estimateCost`) and image cost for the art plan.
- Confirmation dialog above a configurable threshold (default US$0.50).
- Image queue enforces `maxImagesPerBook` (default 12) and `maxCostUsd` (default
  US$2.00); the UI shows progress against both.
- Summary generation is budgeted and uses low `maxTokens`; allow "reuse summary"
  to avoid regeneration.
- Token and cost totals roll up per node, per book, and per session.

---

## 13. Testing strategy

**Unit**

- `tree.ts`: insert/move/delete/order/flatten, cycle prevention on moves.
- `ProjectStore`: atomic write, concurrent updates, path traversal rejection,
  delete-to-trash, migration fixtures.
- `ContextBuilder`: token budgets, selection, invalidation on edit.
- Stage parsers: valid JSON, fenced JSON, malformed JSON repair, fallback outline.
- `ArtPlanner`: schema validation, missing art, duplicate prompts.
- `stylePresets`/prompt builder: directive order and style-bible inclusion.
- Image providers: request shape and response decoding (mocked HTTP).
- `imageProcessing`: dimensions, format conversion, metadata stripping (fixtures).
- Exporters: snapshot/golden output for Markdown/HTML; structural assertions for
  DOCX/EPUB (unzip and inspect manifest, XHTML, image entries); PDF smoke test
  (non-zero pages, contains title text where extractable).
- Cost caps: queue stops at limits.

**Integration**

- Fake text provider + Mock image provider: plan → approve → generate → compile
  all formats; assert files, image references, alt text, and totals.
- Restart mid-generation: project resumes from the persisted node.
- Migration: legacy store → project folder, idempotent on rerun.

**E2E (Playwright Electron)**

1. Create project from topic, edit outline, approve, generate with Mock.
2. Add uploaded artwork, edit a chapter, restore a snapshot.
3. Compile to Markdown and HTML, verify exported files in a temp directory.
4. Settings: save an image provider config and see the redacted view.

**Non-functional**

- Binder with 500 nodes renders without jank (virtualised).
- Autosave does not write more than once per 400 ms per node.
- Progress event rate ≤ 4/s.
- Exports of a 100-page book under 5 s excluding image generation.

---

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Scope creep into a full word processor | Markdown only; explicit non-goals; phase gates |
| `sharp` native packaging breaks installers | Add early in Phase 2; test packaged builds on all three platforms; `asarUnpack` native binaries |
| Provider JSON unreliability | Strict schema + one repair retry + Markdown fallback |
| Image cost overruns | Estimates, caps, confirmation threshold, queue stop |
| Image inconsistency across a book | Style bible + preset + optional reference-image support later |
| Data loss during migration | Backup, marker file, idempotency, fixtures, trash instead of delete |
| DOCX/EPUB formatting edge cases | Start minimal and well-formed; structural tests; iterate on fixtures |
| Context window overflow for long books | Budgeted builder + cached summaries; hard token cap per request |
| Copyright/licensing of art | Attribution field, provider-terms warning, no real-person prompts |
| PDF pagination expectations | Ship clean pagination first; evaluate dedicated engine only if needed |

---

## 15. Dependencies to add

| Package | Purpose | Notes |
|---|---|---|
| `sharp` | Resize/convert/strip metadata | Native; rebuild via existing `electron-builder install-app-deps`; unpack from asar |
| `jszip` | EPUB packaging | Pure JS |
| `docx` | DOCX export | Pure JS |
| `diff` | Snapshot diffs | Small |
| `@dnd-kit/core`, `@dnd-kit/sortable` | Binder drag/drop | Alternative: HTML5 drag events if avoiding deps |
| `file-type` or manual magic bytes | Upload validation | `file-type` is ESM; dynamic import or hand-rolled check |

Already available and reusable: `zod`, `marked`, `zustand`,
`@tanstack/react-virtual`, `electron-store`, `safeStorage`, `app://` protocol.

Verify every addition against the project's Node 18+ baseline and Electron 30.

---

## 16. Open questions

1. **Project scope:** one book per project (recommended) or a project may hold a
   series? Plan assumes one; add `seriesId` later without reshaping storage.
2. **Outline storage:** JSON in `project.json` (recommended) or a human-editable
   `outline.md`? JSON keeps ids stable for regeneration.
3. **Default image provider:** none (opt-in) is recommended to avoid surprising
   costs; offer Gemini Imagen as the suggested cheap default.
4. **Research grounding:** automatic keyword selection or explicit per-node
   `sourceRefs`? Plan supports both; default to explicit.
5. **Print quality:** is Electron `printToPDF` sufficient for v1, or is KDP-ready
   output a launch requirement? Plan assumes v1 is screen/ebook first.
6. **Legacy store removal:** one release after migration is safe; confirm before
   deleting user data.
7. **Image consistency:** is reference-image support (character sheets) required
   at launch, or is prompt-level consistency acceptable? Plan defers reference
   images behind the provider capability flag.

---

## 17. Milestones

| Milestone | Contents | Target |
|---|---|---|
| M1 — Better books | Abort, retry, prior context, repeatable generation | End of Phase 0 |
| M2 — Editable books | Projects on disk, binder, editor, outline gate, snapshots | End of Phase 1 |
| M3 — Illustrated books | Art plan, image providers, cover/chapter art, all exports | End of Phase 2 |
| M4 — Grounded books | Research notes, templates, continuity, polish | End of Phase 3 |

**Definition of done for the whole plan:** a user can go from topic to an edited,
illustrated project and export it to Markdown, HTML, PDF, DOCX, and EPUB, with the
workbench and quick-generate flow both working, all tests and typechecks green,
and the app packaged on all three platforms.
