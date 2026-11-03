# antony-mathematics

My mathematics site, built with [Quarto](https://quarto.org). Posts are plain markdown files with LaTeX maths.

## Writing from the website

Go to **[/write](https://antonyp.com/write)** and write. The editor has a live preview with the site's own theorem boxes, maths and macros. Pressing **Publish** commits the file to this repo, and the site is updated about a minute and a half later. A note at the bottom right follows the rebuild and links to the page once it's live.

- **New post / New note / New problem** start from blank. Two buttons: **Publish** puts it on the site, **Save draft** keeps it hidden. A live page has **Update**; to hide it again, use **Take off the site** in the ⋯ menu.
- **Already written in LaTeX?** Paste it in and it's converted: `\section`, theorem/lemma/definition environments with `\label` and `\ref`, `proof`, `equation`/`align`, `itemize`/`enumerate`, `\emph`, `\footnote`, `\href` and the rest. Ctrl+Z gives you the original back. **Import a file…** (or dropping a `.tex`, `.md` or `.qmd` file on the page) turns a whole file into a new post, title and abstract included. Pictures from the `.tex` need adding again.
- **Scheduling**: pick a future date and the button turns into **Schedule for …**; the post goes live by itself that morning.
- **Pictures**: drop them onto the text, paste them, or use **Picture**. Big photos are shrunk to 1600 px wide before uploading. They're saved next to the post.
- **Earlier versions**: the ⋯ menu lists every saved version of a page. Pick one to load it back into the editor.
- **Figures**: the **Figure…** menu inserts a slider graph, a Desmos graph or a GeoGebra applet (see below).
- **Editing**: on a device you've logged in from, every post and note gets an **Edit this post** link, and the menu bar gets a **Write** link.
- Unsent work autosaves in the browser, so closing the tab loses nothing. Press <kbd>Ctrl</kbd>+<kbd>S</kbd> to save to the site.

**Logging in:** press **Log in with GitHub**, approve, and you're in the editor; the device stays logged in until you press **Log out**. Only an account that can push to this repo can publish. (This needs the one-time setup below. Until it's done, or if you press *Use a GitHub key instead*, the page uses the older key-and-passphrase login described next.)

**Key-and-passphrase login:** the page walks you through making a GitHub key. It's a *fine-grained personal access token* limited to this repository, with *Contents: Read and write* and *Actions: Read-only*. You then choose a passphrase. The key is stored only in that browser, locked with the passphrase, and is only ever sent to GitHub. With **Stay logged in on this device** ticked (the default), the page opens straight into the editor from then on, until you press **Log out**; after that it asks for the passphrase again. Untick it on a shared computer. If a device is lost, delete the token at [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens) and it stops working everywhere.

**As an app:** the Write page can be installed like an app, with its own icon. On a phone, open antonyp.com/write and choose *Add to Home Screen* (iPhone: Share button; Android: ⋮ menu). On a computer, use the install icon in Chrome or Edge's address bar. Long-pressing the icon offers **New post**, **New note** and **New problem** (Android and computers).

The page itself is `write.qmd`, the editor is `assets/write.js`, and the LaTeX converter is `assets/latex.js`. Everything below still works if you'd rather write in files.

### Setting up "Log in with GitHub" (once, about 10 minutes)

GitHub only finishes a login for a server that holds a secret, and this site has no server, so a tiny free [Cloudflare Worker](https://workers.cloudflare.com) (`worker/auth.js`) does that one step. It stores nothing; it swaps GitHub's one-time code for a token and sends you back to the Write page. Tokens can only edit this repository and read its build status, last 8 hours and renew themselves, and stop working when you log out or uninstall the app.

1. **The Worker.** Sign up at [dash.cloudflare.com](https://dash.cloudflare.com) (free). Go to **Workers & Pages → Create → Create Worker**, name it `antonyp-write-login` and press **Deploy**. Press **Edit code**, replace everything with the contents of `worker/auth.js`, and press **Deploy** again. Note its address: `https://antonyp-write-login.<your-name>.workers.dev`.
2. **The GitHub App.** Open [this prefilled form](https://github.com/settings/apps/new?name=antonyp-write&description=Logs%20in%20to%20the%20Write%20page%20on%20antonyp.com&url=https%3A%2F%2Fantonyp.com%2Fwrite&public=false&webhook_active=false&contents=write&actions=read) (GitHub → Settings → Developer settings → GitHub Apps → New). Set **Callback URL** to the Worker's address followed by `/callback`. Leave *Expire user authorization tokens* ticked. Check that **Webhook → Active** is off, that **Repository permissions** shows *Contents: Read and write* and *Actions: Read-only*, and that it can be installed *Only on this account*. Press **Create GitHub App**. (If the name is taken, pick another.)
3. **Its keys.** On the new app's page, copy the **Client ID**, then press **Generate a new client secret** and copy that too (GitHub shows it once).
4. **Give the Worker the keys.** In Cloudflare, open the Worker → **Settings → Variables and Secrets** and add `GITHUB_CLIENT_ID` (Text: the Client ID), `GITHUB_CLIENT_SECRET` (Secret: the client secret) and `SITE` (Text: `https://antonyp.com`). Press **Deploy** if it asks.
5. **Install the app on the repo.** On the app's page, choose **Install App → Install → Only select repositories → antonyp-wustl.github.io**.
6. **Switch it on.** Put the Worker's address in `data-auth="…"` in `write.qmd` and publish. The Write page then shows **Log in with GitHub**.

If you'd rather use the command line for step 1, `worker/wrangler.toml` is set up for `npx wrangler deploy` (then `npx wrangler secret put GITHUB_CLIENT_ID` and `… GITHUB_CLIENT_SECRET`).

To cut off every login at once: GitHub → Settings → Applications → *antonyp-write* → Revoke (or uninstall the app). If the secret ever leaks, generate a new one on the app page and replace it in Cloudflare.

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

That creates `posts/quadratic-reciprocity-visually/index.qmd` as a **draft**. Write in it, then run `.\publish -Live` when it's ready to go live (or delete the `draft: true` line and run `.\publish`). Add `-Publish` to `new-post` to skip draft mode.

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

The site lives at **https://antonyp.com** (the old https://antonyp-wustl.github.io address forwards there) and deploys through `.github/workflows/publish.yml` whenever something reaches `main` on GitHub. After writing or editing files here, one command does it all:

```powershell
.\publish                          # or: .\publish "Fix a typo in the Basel post"
```

It lists the pages you changed, commits everything, picks up anything published from the Write page in the meantime, pushes, waits for the rebuild and prints each page's live address. Drafts stay hidden; `.\publish -Live` publishes the changed ones too (it removes their `draft: true`). Add `-NoWait` to skip waiting. Plain `git add -A`, `git commit` and `git push` still work.

The live site updates about a minute and a half after a push; progress shows under the repo's **Actions** tab. Drafts are never published.

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
| `write.qmd`, `assets/write.js`, `assets/latex.js` | The Write page, and its LaTeX converter |
| `worker/` | The "Log in with GitHub" helper (a Cloudflare Worker, not part of the site) |
| `publish`, `new-post`, `new-note` | One-command publishing and starting posts/notes (`.ps1` scripts; the `.cmd` twins run them from any terminal) |
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
