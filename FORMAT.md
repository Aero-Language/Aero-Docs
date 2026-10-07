# Content Format

Format version: 1

All site content lives in JSON files. The site is only a renderer for them.
This file is the reference for that format and is updated with every change to it.

## Files

- `site.json`: the manifest, lists every document and the site-wide settings
- `content/*.json`: one file per document (spec, compiler guide, ...)
- `templates/*.html`: one HTML template per block type
- `src/parser.js`: pure functions, JSON in, document tree out, no DOM access
- `tests/parser.test.mjs`: tests for the parser, they also check the real content files
- `src/render.js`: tree plus templates in, HTML out
- `css/style.css`: all styling

## Manifest (`site.json`)

```json
{
  "title": "Aero",
  "icon": "aero.svg",
  "default": "#language",
  "variables": { "version": "0.3.0", "status": "Work In Progress" },
  "docs": [
    { "file": "content/spec.json", "title": "Language" },
    { "file": "content/compiler.json", "title": "Compiler Guide" }
  ]
}
```

- `docs` order is the order in the top navigation
- `default` is the root id of the document shown first
- `variables` are values shared by all documents, see Variables
- The root `id` inside each document file is what identifies it, `title` here is only the nav label

## Variables

Values that appear in many places, like the version number, are defined once and used by name.

```json
{ "badge": "v{{version}} · {{status}}" }
```

- Defined in `site.json` under `variables`, available in every document
- A document can define its own `variables` object at the root, its values win over the site ones
- Used as `{{name}}` in any text: titles, descriptions, badges, text blocks, table cells, button titles and the footer
- Names are lowercase letters and `-`. Values are plain strings, they can contain inline markup but no other variables
- Code blocks, ids, types, links and option fields (`kind`, `variant`, `lang`) are never substituted
- Substitution runs first, before ids are built and before inline markup is parsed
- An unknown variable is reported as a warning and stays in the text as written

## Document

```json
{
  "format": 1,
  "id": "#spec",
  "title": "Aero",
  "description": "A <b>statically</b> typed language.",
  "badge": "v0.1.0-draft",
  "buttons": [ { "title": "Quickstart", "link": "#quickstart" } ],
  "sections": [],
  "footer": { "content": [] }
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `format` | no | Format version, defaults to 1 |
| `id` | yes | Root id, unique across all documents |
| `title` | yes | Plain text |
| `description` | no | Text with inline markup, single paragraph |
| `badge` | no | Plain text shown next to the title |
| `variables` | no | Overrides and additions to the site variables |
| `buttons` | no | `title` plus `link`, links use the id rules below |
| `sections` | no | Top level sections |
| `footer` | no | Object with a `content` array |

## Sections

```json
{
  "id": "#core-tenets",
  "title": "Core Tenets",
  "tag": "Planned",
  "content": [],
  "sections": []
}
```

- A section is an addressable part of the document tree, `sections` nests further sections
- `id` is required, `title` is required, `tag`, `content` and `sections` are optional
- `tag` renders as a small badge next to the title
- Titles are plain text, no markup, the style (uppercase start, bold) comes from the CSS only

### Ids

- Only the document root and sections have ids
- An id starts with `#` and contains lowercase letters and `-`. Digits are accepted by the parser but should be avoided
- The global id of a nested section is the parent's global id and its own id joined by `_`, with the `#` of the child removed. Example: `#overview` containing `#core-tenets` becomes `#overview_core-tenets`
- Links inside the same document use the global id: `#overview_core-tenets`
- Links to another document use the root id: `#compiler/lexer_token-types`
- A missing id is derived from the title and reported as a warning
- A duplicate global id is an error, the second one is dropped from navigation

## Content

`content` is an array of blocks. A block is either a string or an object with a `type`.

- A string is shorthand for `{ "type": "text", "text": "..." }`
- Unknown types are skipped and reported as a warning
- An empty or missing array renders nothing, they mean the same thing
- A block with nothing to show (empty text, no rows) renders nothing

### text

```json
{ "type": "text", "text": "First paragraph.\n\nSecond one.\n-- item one\n-- item two" }
```

- Newlines are written as `\n`
- A blank line (`\n\n`) starts a new paragraph, a single `\n` is a line break
- Consecutive lines starting with `-- ` form a bullet list. A single `-` never starts a list
- Inline markup, see below

### section

An unaddressable titled block inside content. No id, not part of the navigation.
It renders one heading level below its parent.

```json
{ "type": "section", "title": "A small heading", "text": "...", "content": [] }
```

`text` and `content` are both optional and rendered in that order.

### box

```json
{ "type": "box", "title": "Direct to native", "subtitle": "No VM or GC", "content": [] }
```

`subtitle` is optional, `content` takes any blocks, including other boxes.
Boxes that follow each other are laid out as a grid.

### badge

```json
{ "type": "badge", "title": "Memory: Manual", "variant": "accent" }
```

- `variant` is optional: `accent` (default), `neutral` or `outline`
- Badges that follow each other are grouped into one row

### code

```json
{ "type": "code", "lang": "aero", "title": "Main.aero", "code": "fun Main() {\n}" }
```

- `lang` is optional, `aero` is highlighted, anything else is shown as plain text
- `title` is optional and shown in the header bar of the block
- The block always has a copy button
- Code is shown literally, no inline markup

### table

```json
{ "type": "table", "headers": ["Case", "Example"], "rows": [["PascalCase", "Int"]] }
```

- Without `headers` (or with an empty array) the table is drawn as plain row boxes
- Cells are strings with inline markup, lists are not available in cells
- Short rows are padded, extra cells are dropped and reported as a warning

### callout

```json
{ "type": "callout", "kind": "warning", "title": "Careful", "content": [] }
```

- `kind` is optional: `note` (default), `tip`, `warning` or `planned`
- `title` is optional, `content` takes any blocks

## Inline markup

Available in `text` blocks, the `text` of a `section` block, the document `description` and table cells. Titles, badges and code never use it.

| Tag | Result |
| --- | --- |
| `<b>` | bold |
| `<i>` | italic |
| `<q>` | quote |
| `<code>` | inline code |
| `<a href="...">` | link, only `#...` and `http(s)://` targets |

- Only these exact tags are interpreted. Any other `<` is shown literally, so `List<T>` can be written as is
- Tags must be closed and can be nested
- Attributes other than `href` on `<a>` are ignored
- Everything else is escaped, the output can never contain markup that is not listed here

## Parser contract

`parse(json, siteVariables)` never throws. It returns:

```json
{ "doc": {}, "index": {}, "order": [], "errors": [] }
```

- `doc` is the normalized tree: every shorthand expanded, global ids set, empty blocks removed
- `index` maps every global id to its section node, used for navigation and search
- `order` lists the global ids in document order, used for previous and next links and for search
- `errors` is a list of `{ "level": "error" | "warning", "path": "sections[2].content[1]", "message": "..." }`

Text and table cells come out as inline nodes: a plain string, or `{ "tag": "b" | "i" | "q" | "code" | "br", "children": [] }`, and `{ "tag": "a", "href": "...", "children": [] }` for links.
Text blocks come out as `parts`, each either a paragraph (`kind: "p"`, `inline`) or a list (`kind: "list"`, `items`).

Further exports of `src/parser.js`, all without side effects:

- `parseSite(json)` validates the manifest and returns `{ site, errors }`
- `resolveLink(href, currentDocId, docs)` returns `{ docId, gid }`, `{ external: true }` or `null`
- `validateLinks(docs)` returns one error for every dead link or duplicate root id across all documents
- `sectionToText(section)` returns the plain text of a section's own content for search

Run the tests with `npm test`.

## Rendering contract

- Every block type has a template: `templates/<type>.html`, plus `document.html`, `section.html` and `footer.html`
- Templates use `{{name}}` for escaped values and `{{{content}}}` for already rendered children
- Every property that is drawn in a special way has its own class, named `doc-<type>` for the block and `doc-<type>-<property>` for its parts. Example: `doc-box`, `doc-box-title`, `doc-box-subtitle`
- Variants add a modifier class: `doc-badge-outline`, `doc-callout-warning`

## Changelog

- 1: first version, variables added while drafting
