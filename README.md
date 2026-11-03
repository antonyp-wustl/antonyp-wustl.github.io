# antony-mathematics

My mathematics site, built with [Quarto](https://quarto.org). Posts are plain markdown files with LaTeX maths.

## Writing from the website

Go to **[/write](https://antonyp.com/write)**, log in, and write. The editor has a live preview with the site's own theorem boxes, maths and macros. Pressing **Publish** commits the file to this repo, and the site rebuilds itself about two minutes later. A note at the bottom right follows the rebuild and links to the page once it's live.

- **New post / New note / New problem** start from blank. Posts begin hidden: flip **Visible on site** before pressing the button to publish straight away.
- **Scheduling**: leave **Visible on site** on and pick a future date. The button turns into **Schedule for …**, and the post goes live by itself that morning.
- **Pictures**: drop them onto the text, paste them, or use **Picture**. Big photos are shrunk to 1600 px wide before uploading. They're saved next to the post.
- **Earlier versions**: the ⋯ menu lists every saved version of a page. Pick one to load it back into the editor.
- **Figures**: the **Figure…** menu inserts a slider graph, a Desmos graph or a GeoGebra applet (see below).
- **Editing**: on a device you've logged in from, every post and note gets an **Edit this post** link, and the menu bar gets a **Write** link.
- Unsent work autosaves in the browser, so closing the tab loses nothing. Press <kbd>Ctrl</kbd>+<kbd>S</kbd> to save to the site.

**Setting it up on a new device (once):** the page walks you through making a GitHub key. It's a *fine-grained personal access token* limited to this repository, with *Contents: Read and write* and *Actions: Read-only*. You then choose a passphrase. The key is stored only in that browser, locked with the passphrase, and is only ever sent to GitHub. From then on, logging in just means typing the passphrase. If a device is lost, delete the token at [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens) and it stops working everywhere.

The page itself is `write.qmd`, and the editor is `assets/write.js`. Everything below still works if you'd rather write in files.

## Problems

The **Problems** page is an archive of competition and puzzle problems. Readers filter it by topic and difficulty, hide the ones they've solved, or jump to a random one, and the home page shows a problem of the day. Each problem is one file in `problems/` (or use **New problem** on the Write page):

```markdown
---
title: "An irreducible fraction"
date: 2026-11-03
categories: [Number Theory]
source: "IMO 1959 P1"
difficulty: 1          # 1 (warm-up) to 5 (very hard)
---

Prove that $\dfrac{21n + 4}{14n + 3}$ is irreducible for every natural number $n$.

::: {.hint}
A first nudge. Add as many hints as you like; readers open them one at a time.
:::

::: {.solution}
The solution, folded until the reader opens it.
:::
```

Everything before the first hint is the statement. Readers can tick "I've solved this"; that's remembered in their own browser.

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

The site lives at **https://antonyp.com** (the old https://antonyp-wustl.github.io address forwards there) and deploys through `.github/workflows/publish.yml` whenever you push to `main`:

```bash
git add -A
git commit -m "New post"
git push
```

The live site updates about a minute later; progress shows under the repo's **Actions** tab. Drafts are never published.

Addresses on the live site have no `.html`: `antonyp.com/about`, `antonyp.com/problems/mutilated-chessboard`. The last build step (`scripts/cleanurls.mjs`) rewrites the links, feeds, sitemap and search index, and gives every page a canonical address; GitHub Pages serves `/about` from `about.html` by itself, and old `.html` links keep working. Local preview still uses `.html`.

Publishing also draws a share image for every post (`scripts/cards.mjs`), so links pasted into Discord, iMessage or X get a proper preview. To see them locally, run `quarto render` then `node scripts/cards.mjs`.

(The repo's **Settings → Pages → Source** must stay on **GitHub Actions**. If it's ever switched back to "Deploy from a branch", GitHub publishes the raw source files instead of the built site.)

**The domain.** `antonyp.com` is set in two places: **Settings → Pages → Custom domain** on GitHub (this is the one that counts when deploying with Actions), and `site-url` in `_quarto.yml` (used for feeds, share images, citations and PDF footers). The `CNAME` file just records it. DNS for the domain, at the registrar:

| Type | Name | Value |
|:--|:--|:--|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |
| CNAME | `www` | `antonyp-wustl.github.io` |

## Linking between posts

- **A theorem in another post:** `[](../infinitely-many-primes/#thm-euclid)` with empty link text names itself ("Theorem 1 (Euclid)"), and hovering it shows the statement.
- **Referenced by:** any link from one post, note or problem to another adds it to a "Referenced by" list at the bottom of the page it points to. `scripts/backlinks.mjs` does this after every render.

## Interactive graphs

```markdown
{{< plot "sin(a*x) / x; cos(b*x)" a=1..4 b=0.5..2 x=-10..10 caption="Drag the sliders" >}}
{{< desmos GRAPH-ID >}}
{{< geogebra APPLET-ID >}}
```

`plot` is drawn by the site itself: separate functions with `;`, and every other single letter becomes a slider. `x=` and `y=` fix the axes. Write things like `2x`, `x^2`, `sqrt`, `ln` and `pi`. The style guide has the details.

## PDFs

Every published post gets a **Download PDF (LaTeX)** link, typeset properly with the site's macros. CI builds them after each push (`scripts/pdfs.mjs`) and only rebuilds posts that changed. Interactive parts become a line pointing to the web page. If LaTeX ever fails on a post, the site still goes up; that post just has no PDF until it's fixed.

## Where things live

| Path | What it is |
|:--|:--|
| `posts/` | One folder per post |
| `notes/` | One file per note |
| `problems/` | One file per problem |
| `index.qmd` | Home page (prime-spiral hero, latest posts, topics) |
| `archive.qmd`, `notebook.qmd`, `problems.qmd`, `topics.qmd`, `theorems.qmd`, `about.qmd` | The other pages |
| `write.qmd`, `assets/write.js` | The Write page |
| `_quarto.yml` | Site settings: title, navbar, footer, links |
| `theme/` | Colours (`dark.scss`, `light.scss`), styling (`common.scss`), macros, the site-wide script (`site.html`) a small filter for series, notes and problems (`am.lua`), and the figure shortcodes (`shortcodes.lua`) |
| `scripts/` | Share images (`cards.mjs`), "Referenced by" lists (`backlinks.mjs`), PDFs (`pdfs.mjs`), scheduled posts (`schedule.mjs`) and `.html`-free addresses (`cleanurls.mjs`) |
| `_templates/` | How post lists look on the home, Writing and Topics pages |
| `assets/` | Logo, the spiral animation, the self-hosted fonts (`fonts/`) and libraries (`vendor/`: KaTeX, marked, js-yaml) |
| `.well-known/security.txt` | Where to report a security problem |

## Security

The site loads nothing from other servers: fonts, KaTeX and the editor's libraries are copies in `assets/`, so a compromised CDN can't inject code, and visitors' browsers only ever talk to antonyp.com. The publish workflow gives each job only the permissions it needs and pins every GitHub Action to an exact commit.

What only you can do, most important first:

1. **GitHub account:** use a passkey or security key for two-factor sign-in, keep the recovery codes offline, and add a personal email (not just the WashU one) so you can't be locked out after graduating.
2. **Wix account:** two-factor sign-in, auto-renew for antonyp.com, transfer lock on, WHOIS privacy on.
3. **Verify the domain with GitHub** (your account **Settings → Pages → Add a domain**). GitHub gives you a TXT record to add in Wix; after that, nobody else can attach antonyp.com to their GitHub Pages site.
4. **Stop email spoofing** (the domain sends no email). Add in Wix DNS: TXT `@` `v=spf1 -all`, and TXT `_dmarc` `v=DMARC1; p=reject; adkim=s; aspf=s`. If Wix offers CAA records, add CAA `@` `0 issue "letsencrypt.org"`.
5. **Repo settings → Code security:** turn on secret scanning, push protection and private vulnerability reporting (security.txt points reporters there).

Remember the repo is public: drafts are invisible on the site but readable on GitHub.

## Optional extras

- **Comments:** readers comment with their GitHub account, and comments are stored as Discussions on the repo. Turn on Discussions (repo **Settings → General → Features**), install the [giscus app](https://github.com/apps/giscus) on the repo, then uncomment the `comments:` block in `posts/_metadata.yml`.
- **Email subscriptions:** the home page and every post end with a "Follow along" box listing the RSS feeds. For email sign-ups, make a free account at [Buttondown](https://buttondown.com), switch on its RSS-to-email option for `https://antonyp.com/archive.xml`, and put your Buttondown username in `BUTTONDOWN` near the middle of `theme/site.html`. The box then becomes an email form.
- **View counts:** sign up at [GoatCounter](https://www.goatcounter.com) (free, no cookies), then follow the two-line instructions in `theme/analytics.html`.
- **Keyboard:** `/` search, `t` light/dark, `p` fold or unfold every proof on a post.
- **Scheduled posts** go live in the 11:00 UTC run of the publish workflow. GitHub pauses scheduled workflows in repos with no activity for 60 days; pushing anything wakes it.
- **Printing:** "Print or save as PDF" under a post's contents list (or Ctrl+P) gives a clean light page with every proof shown.
