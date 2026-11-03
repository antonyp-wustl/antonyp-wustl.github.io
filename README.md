# antony-mathematics

My mathematics site, built with [Quarto](https://quarto.org). Posts are plain markdown files with LaTeX maths.

## Writing a post

```powershell
.\new-post "Quadratic reciprocity, visually" -Category "Number Theory, Visual"
```

That creates `posts/quadratic-reciprocity-visually/index.qmd` as a **draft**. Write in it, then delete the `draft: true` line when it's ready to go live. (Add `-Publish` to skip draft mode.)

You can also just copy any folder in `posts/` and edit it. Each post is one folder with an `index.qmd`, plus any images it uses.

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

### What you can write

Open the **style guide** (`posts/style-guide/index.qmd`, a draft that only appears in local preview) for every feature with its source. In brief:

| You write | You get |
|:--|:--|
| `$x^2$`, `$$ ... $$` | Inline and display maths (KaTeX) |
| `$$ ... $$ {#eq-name}` then `@eq-name` | Numbered equation + clickable reference |
| `::: {#thm-name}` … `:::` | Theorem (also `#lem-`, `#cor-`, `#prp-`, `#cnj-`, `#def-`, `#exm-`, `#exr-`) |
| `::: {.proof}` … `:::` | Proof, ending with ■ |
| `^[a note]` | Sidenote in the margin |
| `::: {.callout-tip}` | Callout box (`note`, `tip`, `warning`, `important`) |
| ` ```{ojs} ` | Interactive slider/plot that runs in the browser |

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

(The repo's **Settings → Pages → Source** must stay on **GitHub Actions**. If it's ever switched back to "Deploy from a branch", GitHub publishes the raw source files instead of the built site.)

## Where things live

| Path | What it is |
|:--|:--|
| `posts/` | One folder per post |
| `index.qmd` | Home page (prime-spiral hero, latest posts, topics) |
| `archive.qmd`, `topics.qmd`, `about.qmd` | The other pages |
| `_quarto.yml` | Site settings: title, navbar, footer, links |
| `theme/` | Colours (`dark.scss`, `light.scss`), styling (`common.scss`), macros, and the site-wide script |
| `_templates/` | How post lists look on the home, Writing and Topics pages |
| `assets/` | Logo and the spiral animation |

## Optional extras

- **Comments:** set up [giscus](https://giscus.app) on the repo and uncomment the `comments:` block in `posts/_metadata.yml`.
- **Custom domain:** add a `CNAME` file containing the domain and update `site-url`.
