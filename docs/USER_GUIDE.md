# BookForge User Guide

BookForge turns a topic into an editable, illustrated book project. Everything is
stored locally; API keys are encrypted with the OS keychain.

## 1. Configure providers

Open **Settings**.

- **AI Providers** generate text. Pick one, paste a key (or use an environment
  key), save, and choose a model. Groq, Claude, OpenAI, Gemini, Ollama, and any
  OpenAI-compatible endpoint are supported.
- **Image Providers** generate artwork. OpenAI, Google Imagen, any
  OpenAI-compatible `/images/generations` endpoint, SwarmUI, and a Mock provider
  are supported. Save a provider and set it as current.

The Mock image provider is useful for trying the workflow without spending money.

## 2. Create a book

Open **Generate**.

1. Enter a topic.
2. Pick a template: blank, course companion, practical guide, or short novel.
   Templates can pre-plan chapter titles and briefs.
3. Choose style and length. A rough cost estimate appears when a text provider is
   ready.
4. Click **Generate Book**.

Blank projects plan an outline first, then write chapters. Template projects skip
outlining and write the pre-planned chapters. The workbench opens when generation
finishes.

## 3. Workbench

Open a project from **Library**.

- **Binder** (left): the chapter tree. Add parts, chapters, or import research.
  Drag rows to reorder. Status dots show pending, writing, complete, or error.
- **Outline** tab: edit chapter titles and briefs as cards. Saving is automatic.
- **Write** tab: edit Markdown, use **Split** for a rendered preview, and run
  targeted AI actions:
  - Refine, Expand, Shorten, Continue, Regenerate
  - Optional direction, e.g. “simplify for beginners”
  - Cmd/Ctrl+S forces a save
- **Artwork** tab: plan prompts, review and edit them, generate images, upload
  your own, and set alt text/captions.
- **Inspector** (right): project totals, selected node metadata, snapshots,
  continuity check, and compile.

### Snapshots and continuity

Every AI rewrite snapshots the node first. Open **Inspector → Snapshots** to diff a
snapshot against current content or restore it. Restoring snapshots the current
version first.

**Continuity** runs an advisory review across chapters and lists contradictions
or dropped threads. It never edits the text.

### Research

Use the binder’s import button to add a `.txt`, `.md`, or `.pdf` research node.
Research is never exported; BookForge selects the most relevant notes by keyword
and includes them as grounding context when writing or editing chapters.

## 4. Artwork

1. Configure and select an image provider.
2. Open **Artwork → Plan artwork**. BookForge proposes a cover and one image per
   chapter, plus a style bible for consistency.
3. Review prompts, alt text, captions, and enable/disable decisions.
4. Generate one image or **Generate all**. Default caps are 12 images and US$2.
   Cancel stops after the current image.

Assets are normalised to WebP at up to 1600 px (2000 px for covers), with 400 px
thumbnails. Uploads are validated, resized, and stripped of metadata.

## 5. Compile

Use **Inspector → Compile…** for one project, or **Export** for one or all
projects.

| Format | Notes |
|---|---|
| Markdown | Images copied to `<name>-assets/images/` |
| HTML | Self-contained; images embedded as data URLs |
| PDF | Self-contained; printed from the same HTML |
| DOCX | Headings, images, captions, and a static contents page |
| EPUB 3 | Cover, nav, chapters, images, and styles |

Options include table of contents, chapter numbering, front matter, and back
matter. Compile warns if an image is missing alt text but does not block it.

## 6. Files and backups

Projects live under the app's user-data directory:

- macOS: `~/Library/Application Support/BookForge/projects/`
- Windows: `%APPDATA%/BookForge/projects/`
- Linux: `~/.config/BookForge/projects/`

Each project folder contains `project.json`, `assets/images`, `assets/thumbnails`,
and `snapshots/`. Back it up by copying the folder. Legacy books are imported once
on first launch.

## 7. Troubleshooting

- **No provider ready**: configure a text provider in Settings and choose a model.
- **Artwork buttons disabled**: choose an image provider as current.
- **Export cancelled**: the native save dialog was dismissed; run it again.
- **Image generation fails**: check the provider’s model id, size, base URL, and
  API key. SwarmUI needs a base URL; OpenAI-compatible needs a base URL and model.
- **Moving files from exFAT**: prefer a POSIX filesystem (APFS/HFS+) for the
  project folder. If you must use exFAT, commit and push often and run
  `dot_clean -m .` if `._*` files appear.
