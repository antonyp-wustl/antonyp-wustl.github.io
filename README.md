# antony-mathematics

My mathematics site, built with [Quarto](https://quarto.org). Posts are plain markdown files with LaTeX maths.

## Writing a post

```powershell
.\new-post "Quadratic reciprocity, visually" -Category "Number Theory, Visual"
```

That creates `posts/quadratic-reciprocity-visually/index.qmd` as a **draft**. Write in it, then delete the `draft: true` line when it's ready to go live. (Add `-Publish` to skip draft mode.)

You can also just copy any folder in `posts/` and edit it. Each post is one folder with an `index.qmd`, plus any images it uses.

## Writing a note

For quick things (an identity, a problem, a half-formed thought) that don't deserve a full post:

```powershell
.\new-note                                  # no title needed
.\new-note "Odd numbers make squares" -Category Visual
```

That creates `notes/2026-11-02-....qmd`, which goes live on the **Notebook** page the next time you push (add `-Draft` to hold it back). Notes show in full on the Notebook page, newest first, and the latest few appear on the home page.

### Categories

Categories are whatever you put in the post's front matter:

```yaml
categories: [Number Theory, Proofs]
```

There's no list to maintain. A new category shows up on the home page, the Topics page and the Writing filter the first time a post uses it. Use as many per post as you like.

### The front matter

```yaml
---
title: "Three proofs that there are infinitely many primes"
subtitle: "Optional second line under the title"
description: "Shown on cards in the home page and archive. One or two sentences."
date: 2026-10-12
categories: [Number Theory, Proofs]
draft: true        # remove to publish
---
```

Optional extras:

```yaml
series: "Galois theory from scratch"   # links posts into a numbered series
fold-proofs: true                      # every proof starts folded
date-modified: 2026-12-01              # shows "Revised" next to the date
image: my-picture.png                  # your own share image instead of the generated one
```

### What you can write

Open the **style guide** (`posts/style-guide/index.qmd`, a draft that only appears in local preview) for every feature with its source. In brief:

| You write | You get |
|:--|:--|
| `$x^2$`, `$$ ... $$` | Inline and display maths (KaTeX) |
| `$$ ... $$ {#eq-name}` then `@eq-name` | Numbered equation + clickable reference |
| `::: {#thm-name}` … `:::` | Theorem (also `#lem-`, `#cor-`, `#prp-`, `#cnj-`, `#def-`, `#exm-`, `#exr-`) |
| `::: {.proof}` … `:::` | Proof, ending with ■. Readers can fold it away |
| `::: {.proof collapse="true"}` | Proof that starts folded |
| `::: {.solution}` | Solution to an exercise, folded until clicked |
| `\begin{CD} … \end{CD}` | Commutative diagram |
| `^[a note]` | Sidenote in the margin |
| `::: {.callout-tip}` | Callout box (`note`, `tip`, `warning`, `important`) |
| ` ```{ojs} ` | Interactive slider/plot that runs in the browser |

Every definition, theorem, lemma, proposition, corollary and conjecture also appears on the **Theorems** page automatically, searchable.

Shortcut macros like `\R`, `\Z`, `\abs{x}`, `\norm{v}`, `\set{...}` work everywhere. Add your own in `theme/katex-macros.html`.

## Previewing

```bash
quarto preview
```

This opens the site locally and re-renders as you save. Drafts are visible here.

## Publishing

The site lives at **https://antonyp-wustl.github.io** and deploys through `.github/workflows/publish.yml` whenever you push to `main`:

```bash
git add -A
git commit -m "New post"
git push
```

The live site updates about a minute later; progress shows under the repo's **Actions** tab. Drafts are never published.

Publishing also draws a share image for every post (`scripts/cards.mjs`), so links pasted into Discord, iMessage or X get a proper preview. To see them locally, run `quarto render` then `node scripts/cards.mjs`.

(The repo's **Settings → Pages → Source** must stay on **GitHub Actions**. If it's ever switched back to "Deploy from a branch", GitHub publishes the raw source files instead of the built site.)

## Where things live

| Path | What it is |
|:--|:--|
| `posts/` | One folder per post |
| `notes/` | One file per note |
| `index.qmd` | Home page (prime-spiral hero, latest posts, topics) |
| `archive.qmd`, `notebook.qmd`, `topics.qmd`, `theorems.qmd`, `about.qmd` | The other pages |
| `_quarto.yml` | Site settings: title, navbar, footer, links |
| `theme/` | Colours (`dark.scss`, `light.scss`), styling (`common.scss`), macros, the site-wide script (`site.html`) and a small filter for series and notes (`am.lua`) |
| `scripts/cards.mjs` | Draws the share images after rendering |
| `_templates/` | How post lists look on the home, Writing and Topics pages |
| `assets/` | Logo and the spiral animation |

## Optional extras

- **Comments:** readers comment with their GitHub account, and comments are stored as Discussions on the repo. Turn on Discussions (repo **Settings → General → Features**), install the [giscus app](https://github.com/apps/giscus) on the repo, then uncomment the `comments:` block in `posts/_metadata.yml`.
- **View counts:** sign up at [GoatCounter](https://www.goatcounter.com) (free, no cookies), then follow the two-line instructions in `theme/analytics.html`.
- **Keyboard:** `/` search, `t` light/dark, `p` fold or unfold every proof on a post.
- **Printing:** "Print or save as PDF" under a post's contents list (or Ctrl+P) gives a clean light page with every proof shown.
