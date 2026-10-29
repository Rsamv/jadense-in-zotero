<p align="center">
  <img src="content/icons/logo-padded.png" width="128" height="128" alt="Jadense Logo">
</p>
<h1 align="center">Jadense in Zotero (personal fork)</h1>
<p align="center">A private build of the Jadense Zotero reading plugin, based on official v0.6.13</p>
<p align="center">
  <a href="https://www.zotero.org/download/"><img src="https://img.shields.io/badge/Zotero-8%20%7C%209%20%7C%2010-bb2222" alt="Zotero 8 / 9 / 10"></a>
  <a href="https://github.com/Rsamv/jadense-in-zotero/releases/latest"><img src="https://img.shields.io/github/v/release/Rsamv/jadense-in-zotero" alt="fork release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Non--Commercial-16a36a" alt="Non-commercial license"></a>
</p>

[简体中文](README.md) · **English**

> **This is a personal fork, not an official release channel.** The upstream project is [jadense-ai/jadense-in-zotero](https://github.com/jadense-ai/jadense-in-zotero); this branch starts from official `v0.6.13` and adds changes for personal use: a collection quick-review window (0–100 per-paper ratings, local PDF link/appendix/layout forensics, bounded per-paper deep read) and bilingual-translation cache reclamation.
>
> The upstream README's third-party API reseller promotion, donation pages, star-history chart and web-app upsell sections have been removed here. Nothing was put in their place — no analytics, no redirect endpoints. Official feature documentation still lives upstream and in [docs/usage-guide.md](docs/usage-guide.md).
>
> The license is unchanged — [Jadense Non-Commercial License 1.0](LICENSE): personal non-commercial use only, distributed free of charge, original copyright notices retained, modifications identified in the `0.6.13.x` entries at the top of [CHANGELOG.md](CHANGELOG.md), and the same non-commercial conditions passed on downstream.
>
> Local versions use four segments (`0.6.13.1` → `0.6.13.13`), newer than the current official build but older than a future official `0.6.14`. The add-on ID and the packaged `update_url` keep the official values, so an official release newer than the local one replaces this fork's build through auto-update — intended for personal use, but anyone staying on the fork should disable automatic updates.

**Understand papers in Zotero, and turn what you read into the next step of your research.**

[Paper Q&A](docs/usage-guide.md#paper-chat) · [Source-linked annotations](docs/usage-guide.md#paper-analysis) · [Selection translation](docs/usage-guide.md#selection-translation) · [Full translation and local OCR](docs/usage-guide.md#full-translation) · [Figure interpretation](docs/usage-guide.md#figures) · [Reference verification and import](docs/usage-guide.md#references)

Jadense in Zotero is a source-available AI reading assistant from [Jadense (攻玉学术)](https://jadense.cn/). Ask questions about the paper you are reading, keep analysis notes alongside the original passages, and follow up on difficult paragraphs or figures—all within Zotero.

**Free for personal non-commercial use · Commercial use prohibited · Bring your own API key (BYOK) · Jadense account optional**

**[Download this fork's build](https://github.com/Rsamv/jadense-in-zotero/releases/latest)** · [Requirements and installation methods](#requirements) · [What this branch changes](#fork-differences) · [Quick start](#quick-start) · [Changelog](CHANGELOG.md)

The client is source-available under the [non-commercial license](LICENSE). Model usage is billed according to your chosen provider or your Jadense account's subscription and points rules.

**This fork is at package version 0.6.13.13** (release `v0.23`), built on official `v0.6.13`. Rounds `0.6.13.1` through `0.6.13.13` are listed one by one at the top of [CHANGELOG.md](CHANGELOG.md); the sections below summarise what they add.

The baseline itself was verified by upstream on Windows 11 / Zotero 10.0.6. This fork has been run on the same pair with 35 real PDFs in a personal library; macOS, Linux, Zotero 8/9 and live paid providers were not tested.

<!-- release-summary:start -->
## Upstream release baseline

This fork's code baseline is official v0.6.13 (not yet released upstream). The published official releases it descends from:

- [v0.6.12](https://github.com/jadense-ai/jadense-in-zotero/releases/tag/v0.6.12) — Separate discovery home, progress and results; refresh paper cards and saving, add all-keyword / any-keyword search.
- [v0.6.11](https://github.com/jadense-ai/jadense-in-zotero/releases/tag/v0.6.11) — Refresh discovery welcome, scanning and history; fix centered text, improve PDF upload recovery.
- [v0.6.10](https://github.com/jadense-ai/jadense-in-zotero/releases/tag/v0.6.10) — Separate PDF and OCR engine locations, per-feature BYOK thinking levels.
- [v0.6.9](https://github.com/jadense-ai/jadense-in-zotero/releases/tag/v0.6.9) — Add Reading mode with on-demand translation; improve translation progress and the bilingual PDF toolbar.
<!-- release-summary:end -->

<a id="fork-differences"></a>

## What this branch changes, compared with official v0.6.13

### 1. Collection quick review (not present in official builds)

A separate window opened from a Zotero collection's context menu walks that collection and its sub-collections (skipping attachments, notes and trash) and produces a structured digest in **one** model request: overview, per-paper digests, a comparison table, trends and gaps.

| Area | Behaviour in this fork |
| --- | --- |
| What is sent | Bibliographic metadata, abstracts, extracted link text, top-level appendix titles and layout counts. **PDF body text is not sent**; the per-paper deep read is the only entry point that sends body fragments, and it needs explicit confirmation. |
| Per-paper rating | 0–100 on five axes of 20 points each: problem value, methodological novelty, strength of evidence, reproducibility, application potential. Writing, layout, figures, venue and citations are not scored. Bands derive from the score (80+ high, 65–79 medium, 50–64 low), one ruler per batch; metadata-only or truncated-abstract input caps at 45. |
| "Code released" has a hard definition | Only a repository URL (github / gitlab / huggingface / zenodo, with or without a scheme) or an explicit "source code released / open-sourced / available" statement counts as `yes`. Project pages, dataset sites, paper landing pages and promises such as "will be released after acceptance" do not. An unsupported `yes` is downgraded to "not stated" on the client. |
| Attachment forensics | Whole-PDF reading (head and tail halves above 80 pages, 60 MB per file). The text layer is merged with **PDF hyperlink annotations** through `getAnnotations()`: in a 36-PDF local corpus, 572 of 610 link annotations have no counterpart in extracted text. arXiv / DOI / OpenReview landing pages, search sites, line-break fragments and repositories cited inside the reference list are excluded. |
| Appendix detection | Top-level titles only — sub-sections (`D.1`), axis ticks and prose sentences are excluded. Numeral continuations such as `VII` are accepted, headings split across bare numbers and small-caps fragments are stitched back, hyphen-broken titles are rejoined. A paper that only marks an appendix gets "appendix present (sections unnumbered)"; the model may say it has an appendix but must not guess how many sections or their titles. |
| Layout statistics | Locally counted top-level section titles (max 12), figures, tables, references and ablation / baseline / human-evaluation keyword hits. Only titles and counts leave the machine, and the prompt labels the line as measured locally rather than judged by the model. |
| Section-to-page jumps | Every body section records its page and attachment, so its title on the card is a button calling `Zotero.Reader.open(attachmentID, { pageIndex })`. The jump data stays local: never in the request payload or the copied text, but persisted in history so an old review still jumps. |
| Deep read on demand | After the batch review, each card offers "Deep read this paper (a separate request)". The plugin first cuts a bounded excerpt locally (max 3 sections, 400 characters each, 1200 total — introduction tail, method / conclusion / experiment heads), then a dialog states exactly how many characters will be sent, which sections, head or tail, on which page, and how many pages were read locally to cut it. Only then is that one dispatch made. |
| Cards | A collapsible "Local evidence" panel (attachment tally, layout counts, body sections, local links, appendix titles) sits visually apart from the model's rating below, so "measured locally" and "judged by the model" cannot be confused. Local links open through `Zotero.launchURL` and only accept http/https, so a `javascript:` leftover from an old record cannot become an action. |
| Tolerance | Malformed JSON (Chinese punctuation, unescaped quotes) no longer costs the whole review: parse as-is → syntax repair → field-by-field recovery, with an honest note about how many fragments were skipped. Empty shells do not count as covered papers. |
| Failures are not silent | Each paper carries a `scanOutcome` (`parsed` / `noAttachment` / `oversize` / `unreadable` / `unavailable`). In Zotero 10 `Items.get` is cache-only and `getAttachments()` throws `UnloadedDataException` for unloaded items; the old code swallowed both and reported "read 0 pages · no links". Resolution now goes through `getAsync`, retries after `loadDataType('childItems')`, and an unreadable list says "attachment unavailable (retried next run)". |
| Output is read-only | Nothing is written into Zotero items, notes or tags. Reviews stay in local history, can be copied in full and deleted. |

### 2. Bilingual PDF translation cache

- Publishing a new revision keeps only the current and previous snapshot; older published outputs and interrupted temporary files are reclaimed in the background the next time the bilingual reader opens. Layout parsing keeps the same two generations.
- Results and layout caches of attachments deleted from the library are reclaimed after two confirmations at least a minute apart, and nothing is deleted while the library is not ready. Set `extensions.jadenseInZotero.removeOrphanTranslatedPDF` to `false` to keep them.
- Finished translated PDFs can auto-save to the last used export directory (`extensions.jadenseInZotero.autoSaveTranslatedPDF`, on by default), named after the parent item, never overwriting the original PDF or an existing file.

### 3. Error messages

Failure notices gain a typed prefix (e.g. [Upstream service error · 503]) built **only** from error code, HTTP status and error class name — no provider body, no credential.

### 4. Deliberately unchanged

- **BYOK non-idempotence fence**: a request that already produced output, or whose result is unconfirmed, is never resent automatically. Only after you check with the provider and explicitly authorise it does one resend happen on the same session id. The deep read follows the same contract. This branch changes none of the upstream retry or execution-state rules, and regression tests pin the boundary.
- **Billing destination**: quick review and deep read reuse the "paper analysis" feature model; no new billing entry point exists, and one batch review is one dispatch.
- **Direct model requests**: BYOK requests go straight to the provider you configured. This fork removed the third-party API promotion from the README and added no telemetry or redirect endpoint of its own.
- **Plugin ID and update feed** stay official, which is why an official release can overwrite these builds.

### 5. Release numbering

Package versions are four-segment (`0.6.13.13`); this repository's release numbers map one-to-one as `v0.(10 + x)`, so `v0.16` was `0.6.13.6` and `v0.23` is `0.6.13.13`. Only the newest release is kept, together with its tag.


<a id="requirements"></a>

## Start here: requirements, installation methods, and feature links

### Plugin requirements

- **Host application**: [Zotero Desktop 8.0–10.0.*](https://www.zotero.org/download/). Automatic figure detection additionally requires a compatible PDF reader in Zotero 10.0.1 or later.
- **AI access**: to use AI features, configure one AI service. Use [BYOK](docs/usage-guide.md#byok-provider) with a provider API key, base URL, and model ID—no Jadense account required—or [connect Jadense](docs/usage-guide.md#connect) with a Jadense account and plugin token. Model usage follows the billing and access rules of the selected provider or Jadense account.
- **Local OCR**: chat and default selection translation do not require Python; full Markdown, translation and reference extraction use the PDF text layer by default without Python; [optional OCR](docs/local-ocr.md) for scanned pages requires a local runtime, Python dependencies and models. The first setup needs network access and several GB of disk space.
- **Optional Zotero Connector**: Zotero Connector is not a dependency of this plugin. It only collects papers from the browser; whether it is installed does not affect reading local papers and PDFs in Zotero.

### Current installation methods

| Method | How | Notes |
| --- | --- | --- |
| [This fork's Releases](https://github.com/Rsamv/jadense-in-zotero/releases/latest) | Download the `.xpi`, then open it from Zotero **Tools → Plugins → gear → Install Plugin From File…** | Each release carries a `SHA256SUMS` file. The current build is `0.6.13.13` (release `v0.23`). Do not use the **Source code** archive as an installer |
| Official channel | Install from [jadense-ai/jadense-in-zotero](https://github.com/jadense-ai/jadense-in-zotero/releases/latest) or the [official plugin page](https://jadense.cn/plugin/zotero) | Different code, same add-on ID `jadense-in-zotero@jadense.cn`; whichever you install last is the one Zotero keeps |
| Zotero automatic update | In Zotero, open **Tools → Plugins → gear → Check for Updates** | The packaged `update_url` still points at the [official Jadense manifest](https://jadense.cn/plugins/zotero/jadense-in-zotero/updates.json), so an official release newer than this fork overwrites these builds. Disable automatic updates to stay on the fork |
| Build from source | Follow the [contributor guide](CONTRIBUTING.md#开发与本机验证) with Node 24 and pnpm 10.19.0 | This branch's source builds `0.6.13.13`; the upstream release script rejects four-segment versions, so tags and artifacts are produced manually here |

Do not enable the legacy `jadense-in-zotero@jadense.com` identity alongside the current one. See [upgrade instructions](#upgrade) for migration details.


<a id="ocr-installation"></a>

## OCR dependency installation

In 0.5.0, full Markdown, translation and reference extraction use the text layer by default; OCR is optional for scanned pages; ordinary chat and default selection translation do not need Python. Open **Settings → External dependencies → Enable local OCR**, wait for **Ready**, or inspect the logs and choose **Continue setup** after a failure. First setup downloads Python, dependencies and models and needs several GB of disk space. Preinstalled Python and CUDA are not required.

The **[detailed OCR installation guide (Chinese)](docs/local-ocr.md)** covers [settings](docs/local-ocr.md#settings), separate manual steps for [Windows](docs/local-ocr.md#windows), [Linux](docs/local-ocr.md#linux) and [macOS](docs/local-ocr.md#macos), [model verification](docs/local-ocr.md#models), and [repair/reinstallation](docs/local-ocr.md#repair). It explains v0.4.10 controls and differences from older versions.

<a id="pdf-engine-installation"></a>

## PDF layout engine setup (0.6.0)

1. **Automatic:** open **Settings → External dependencies → Layout parsing engine → Prepare PDF translation engine**. The v0.6.5 release XPI prefers its matching complete engine bundle on Windows x64; other platforms prepare isolated Python, locked dependencies, models and fonts from the included installers.
2. **Manual/offline:** choose **Import offline package** with the matching Windows x64 ZIP from [v0.6.5](https://github.com/jadense-ai/jadense-in-zotero/releases/tag/v0.6.5). No preinstalled Python or administrator access is required.
3. **Repository fallback:** use the [included installers and locked source](content/pdf-translation/) to install manually, then **Check installed engine**. This fallback still downloads dependencies and assets; it is not an offline binary mirror.

[Full installation, platform limits and troubleshooting](docs/pdf-engine.en.md). The layout engine is separate from OCR and does not affect ordinary text-layer reading.

### Installation environment and network settings

- **Windows x64: prefer the complete offline package on restricted networks.** Download the complete ZIP from [v0.6.5](https://github.com/jadense-ai/jadense-in-zotero/releases/tag/v0.6.5), install the included XPI, then import the two engine ZIPs following the [guide](docs/usage-guide.md#windows-x64-zip-offline-installation). The matching standalone PDF engine ZIP is about 433 MiB. No preinstalled Python/uv or administrator access is required; allow about 6 GiB for the complete suite. A same-named engine ZIP from an older release may have a different checksum and must not be mixed with this XPI.
- **Check the download path, not just the home page.** Setup needs access to GitHub Release redirects; source-based setup also needs Python, PyPI and model resources. Working AI requests, browser access or changing the OCR download source do not establish connectivity for the PDF installer.
- **Configure the installation process's proxy.** A browser proxy extension does not configure Windows PowerShell. Use an HTTP proxy allowed by your network. For manual installation, configure both the .NET proxy and `HTTPS_PROXY` / `HTTP_PROXY` in the same PowerShell window; see [proxy instructions](docs/pdf-engine.en.md#network-environment). Setting terminal variables does not update an already running Zotero process or an unrelated desktop launch.
- **Managed computers:** setup needs permission to write to the current user's profile and run PowerShell/Python. Contact your administrator for explicit policy blocks; do not disable certificates, package checks or the firewall, or repeatedly elevate privileges to fix an ordinary download failure. Complete bundles for macOS, Linux and Windows ARM64 have not been validated.
- **`install.ps1:41 Invoke-WebRequest` cannot connect:** downloading the uv installation tool failed before the PDF engine was installed. Import the complete package or check the installer's network/proxy; changing the translation model will not fix it.

**Windows policy note:** The plugin starts its installer in a separate PowerShell process with `-ExecutionPolicy Bypass`; users normally do not need to change PowerShell policy. If organizational Group Policy, AppLocker/WDAC or security software still blocks PowerShell or writes to the Zotero profile, ask your administrator to allow the required per-user operation for the Jadense installation. Do not repeatedly elevate Zotero or permanently weaken computer-wide policy.

## Contents

- [What this branch changes, compared with official v0.6.13](#fork-differences)
- [Start here: requirements, installation methods, and feature links](#requirements)
- [OCR dependency installation](#ocr-installation)
- [PDF layout engine setup](#pdf-engine-installation)
- [How to use this plugin](#quick-start)
  - [1. Install and open the workbench](#install)
  - [2. Choose an AI connection](#ai-connection)
    - [2.1 Bring your own key](#use-byok)
    - [2.2 Connect Jadense](#connect-jadense)
  - [3. Your first reading session](#first-reading)
  - [4. Language and theme](#display-language-and-theme)
- [Reading features](#read-and-analyze-papers)
- [Zotero introduction (中文)](docs/zotero-guide.md) · [Illustrated guide (中文)](docs/usage-guide.md)
- [FAQ](#faq) · [Upgrade](#upgrade) · [Changelog](CHANGELOG.md)
- [What this fork adds](#fork-differences) · [License](#license)
- [About the upstream project](#about-upstream)
- [Contribute and share feedback](#contribute-and-share-feedback) · [Release workflow (中文)](CONTRIBUTING.md#发布正式版本)
- [License](#license)

<a id="quick-start"></a>

## How to use this plugin

**Install → configure one AI connection → select a model → open a PDF.** Chat and default selection translation do not require Python. For scanned pages, optionally prepare OCR dependencies and models under **Settings → External dependencies**; first setup needs several GB of disk space. See [OCR setup and troubleshooting (Chinese)](docs/local-ocr.md). BYOK requires access to your configured model API.

The [illustrated guide (Chinese)](docs/usage-guide.md) walks through provider, model, token and reader settings.

The workbench supports both English and Simplified Chinese. The steps below also include Chinese labels for reference; choose your display language in **Settings → General (设置 → 常规)**.

<a id="install"></a>

### 1. Install and open the workbench

1. Download the `.xpi` from [this fork's latest release](https://github.com/Rsamv/jadense-in-zotero/releases/latest) — currently **0.6.13.13** — and check it against the release's `SHA256SUMS`. If you have an older version installed, read the [upgrade instructions](#upgrade) first.
2. In Zotero's plugin manager, choose the option to install a plugin from a file and select the XPI.
3. Open the workbench from Zotero's Jadense entry and choose how to connect to a model service.

Both options use the same installation package and support paper Q&A, translation, analysis, and figure interpretation. Image support depends on the selected model.

| Connection | A good fit if you… | What you need |
| --- | --- | --- |
| Bring your own key (BYOK) | Already use a model service and want to choose your provider and models | The provider's API key, base URL, and model ID; no Jadense account required |
| Connect Jadense | Want to use your Jadense account's model services and bring papers into further research | A Jadense account and plugin token |

Jadense AI requests require the temporary-execution V1 server protocol; older servers show an upgrade message. Recover result retrieves existing pending results, and opening history never resends a request automatically. BYOK works independently and does not automatically retry uncertain third-party requests. Batched reference AI is off by default and can be enabled in feature settings.

<a id="ai-connection"></a>

### 2. Choose an AI connection

<a id="use-byok"></a>

#### 2.1 Bring your own key (BYOK)

1. Open the workbench's gear menu, **Settings → BYOK (设置 → BYOK)**. Add a provider, choose the OpenAI Chat Completions, OpenAI Responses, or Anthropic Messages protocol, and enter your base URL and API key.
2. Add a model, enter its model ID, and set its output limit as required by the provider. You can use the connection test to check the configuration.
3. In **Settings → Feature settings (设置 → 功能配置)**, select your BYOK model for AI chat. **Automatically follow the current Chat model** is enabled by default, so other features use that model. Turn it off to choose independent translation, analysis and figure models.

![BYOK provider settings: protocol, API base URL and key](docs/images/guide-byok-provider.png)

Chinese UI shown from the current build's browser preview with fictional configuration. Replace the example URL and key; do not copy them. [Add a model and select feature models (中文)](docs/usage-guide.md#byok-model).

The plugin sends BYOK model requests directly to your configured provider. **Literature analysis → Analysis settings (文献解析 → 解析配置)** edits the same analysis model setting as Feature settings. Changing or deleting a model does not automatically redirect failed requests to another provider.

<a id="connect-jadense"></a>

#### 2.2 Connect Jadense

1. In [Jadense](https://jadense.cn/), create a token under **Settings → Integrations → Connect Jadense in Zotero (设置 → 集成 → 连接 Jadense in Zotero)**.
2. In the plugin, open **Settings → Connect Jadense (设置 → 连接攻玉)**, paste the plugin token, and save.
3. In **Settings → Feature settings (设置 → 功能配置)**, choose models available to your account. **Jadense → Your account (攻玉学术 → 用户信息)** contains **Your Jadense (你的攻玉)**, with your account, subscription, available points and their source, check-in rewards, and streak.

The top of **Your account** provides links to the Jadense homepage, check-in page, and subscription usage, even before you connect an account. Complete check-in on the website, then refresh **Your Jadense** to view the updated status. Account and points information load separately, so one failed refresh does not hide the other.

<a id="first-reading"></a>

### 3. Your first reading session

Open a PDF with selectable text, select a paragraph you find difficult, and use the translation shortcut. Then click **Ask (提问)** in the PDF toolbar and enter:

> Explain this paper's central research question, and point out the methods and experimental results I should examine most closely.

When you are ready for a closer read, click **Analyze (解析)** to view the summary, notes, and annotations. For more instructions, open **Getting started (上手指南)** in the workbench.

For full translation, analysis, reference import and figures, follow the [step-by-step reading guide (Chinese)](docs/usage-guide.md#reading).

<a id="display-language-and-theme"></a>

### 4. Display language and theme

Open **Settings → General (设置 → 常规)** to choose your display language and theme. The native Zotero plugin settings share the same preferences.

- **Display language**: follow Zotero, Simplified Chinese, or English; the default follows Zotero. Chinese Zotero locales use Simplified Chinese, and other locales use English. Restart Zotero after saving; reopening the workbench alone does not switch languages. This does not change translation direction, AI output requirements, papers, or existing history.
- **Theme**: follow Zotero, light, or dark; the default follows Zotero and updates open plugin interfaces immediately. Existing light/dark choices are preserved. The sidebar button also saves your theme choice, while drafts and active generation continue.
- **Font size and translation panels**: choose a 12–24px plugin font, a standard or frosted-glass panel, and background transparency. Drag the selection-translation panel by its title or resize its edges and corners; the bottom-left Appearance menu offers the same style controls. Full translation uses an opaque, resizable sidebar with independent text settings. Transparency affects only the selection panel background. Frosted glass requires host graphics support and falls back to a standard background when unavailable.

The workbench, reader tools, guide, native settings, menus, and notices support both languages. Zotero continues to control window frames, system title bars, and PDF page appearance.

## Read and analyze papers

### [Keep the key points next to the original text](docs/usage-guide.md#paper-analysis)

Click **Analyze (解析)** in the PDF toolbar to get a summary and detailed notes, with native Zotero annotations that let you check the corresponding passages. Generated annotations can be edited, filtered, and exported with the PDF. They do not overwrite your manual annotations; findings that cannot be located in the original text remain available in the analysis notes.

### [Follow your questions into the methods and evidence](docs/usage-guide.md#paper-chat)

Click **Ask (提问)** to start a conversation about the current paper. You can also attach Zotero items, PDFs, or selected text and ask, “Why did the authors choose this method?” or “What assumptions does this conclusion depend on?” Conversation history is saved locally so you can return to it and keep asking questions.

### [Translate difficult passages as you read](docs/usage-guide.md#selection-translation)

Select text and click **AI translation (智能翻译)** in the selection popup, or press `Ctrl+Alt+T` (`⌘+Alt+T` on macOS), to view a translation in a floating reader panel. Choose from 32 language options for the current selection; existing per-paper language preferences remain effective. **Parallel translation (对照翻译)** in the reading actions opens layout translation; the sidebar's Full translation view provides paragraph translations. Use the selection popup or shortcut for selected text.

### [Translate a whole PDF and check the original passages](docs/usage-guide.md#full-translation)

Choose **Full translation** from the reading actions to read paragraph translations and navigate to their source. Translations now form a continuous document in the reader sidebar, with a table of contents, independent typography, and restored reading position. Reading mode keeps browsing separate from source navigation; Locate mode links paragraphs to the PDF. Hiding the sidebar keeps the task running; after interruption or restart, manually resume from translation history without losing completed parts. Choose AI or Bing/Google in Settings → Feature settings → Full translation. Full translation uses the PDF text layer by default, with optional OCR for scanned pages, then sends extracted text to the selected translation service. The first full translation asks you to confirm cost and stability considerations; canceling sends no request. This paragraph-reading flow is separate from the new PDF layout translation described below.

### [PDF parallel and in-place translation (0.6.0)](docs/usage-guide.md#pdf-translation-060)

Open **Parallel translation** from PDF reading actions to read original and translated pages side by side, switch to a full-width translation or a separate window for another screen. Toggle synchronized scrolling and save translated-only or bilingual PDFs without replacing the original attachment.

**Concise** is the default: translate body text, captions and academic footnotes while retaining publication details and references. **Full** translates all eligible prose. Interface font size now uses an 80%–200% slider with 1% steps and reset. Completed pages appear progressively; partial output remains readable/exportable, and **Translate remaining passages** reuses completed segments. Results need proofreading against the original, especially formulas, tables and complex layouts. Engine setup is required only for this feature.

### [Reading mode (0.6.9)](docs/usage-guide.md#simple-reading-069)

Reading mode keeps the native PDF on the left and shows Zotero's extracted HTML on the right. Start translation explicitly to replace only the right-hand text; partial output and local history remain available. The installed reader must support the required structure extraction.

### [Follow the evidence through references](docs/usage-guide.md#references)

**Analyze** also extracts the current PDF's references. Under **Literature analysis → Paper details → References (文献解析 → 论文详情 → 参考文献)**, inspect the source, verify DOIs, and select reviewed candidates to import into Zotero. “First result selected” identifies a fallback without an exact match and needs careful review. Original order, numbering, duplicates, and unconfirmed text are retained. Import deduplicates by DOI within the same library and saves metadata and links without downloading PDFs.

When reader space is limited, Bilingual PDF keeps an icon in the toolbar, while Reading mode, Ask, Analyze and Quote appear under **•••** reading actions. Click the Jadense icon to open the workbench directly. Collapsing Zotero's native context pane also closes the plugin sidebar; use a reading action to open it again.

### [Interpret figures with the paper's context](docs/usage-guide.md#figures)

Click an automatically detected image, or press `Ctrl+Alt+S` (`⌘+Alt+S` on macOS) to select a PDF region, then start a new conversation or add it to the current one. A new figure conversation links the current paper and extractable PDF text; when the text exceeds the model context, only question-relevant source passages are sent by default, without extra full-document summaries. You can also upload, paste, or drag PNG/JPEG images into a conversation. Images are saved locally with the conversation so you can view them and follow up after reopening it.

Figure interpretation requires a model that accepts images. Automatic detection requires a compatible PDF reader in Zotero 10.0.1 or later. When an image is not detected, you can select a region manually in a PDF reader that supports native cropping. Both capture and translation shortcuts can be customized in Settings.

<a id="about-upstream"></a>

## About the upstream project

The plugin itself, its design and all of its upstream features come from [jadense-ai/jadense-in-zotero](https://github.com/jadense-ai/jadense-in-zotero) by [Jadense (攻玉学术)](https://jadense.cn/). This fork makes three kinds of change only: it removes the promotional blocks from the README, adds the collection quick-review window described above, and fixes detection gaps in link / appendix / code evidence. It does not change the upstream licensing intent, the plugin ID or the update feed.

Uploading papers to the Jadense web app, connecting a Jadense account and using Jadense mode still work exactly as upstream documents them; this README simply no longer funnels readers toward them. See the upstream [usage guide](docs/usage-guide.md) for those features.

## FAQ

For endpoint configuration, authentication errors, model selection and scanned PDFs, see the [full FAQ (Chinese)](docs/faq.md) — note that its sponsorship sections describe the upstream project, not this fork.

### Do I need an account? Is it free?

BYOK does not require a Jadense account. The client is free to download and use for personal non-commercial purposes, learning and research; donations are optional. Commercial use requires separate written permission. Third-party model usage is charged by the corresponding provider; Jadense services follow your account permissions, subscription, and points rules.

Restricted Jadense models show **Upgrade required (需升级)** and the required subscription tier. Choose an available model or upgrade your subscription; adding points does not unlock a restricted model. If an older plugin token lacks points permissions, the account card will prompt you to update it. Other functions already authorized by that token remain available.

<a id="data-and-credentials"></a>

### Data and credentials

The following describes data handling in the **Zotero plugin**.

| Operation | Where the data goes |
| --- | --- |
| Saving settings, conversations, image attachments, translation history, and analysis history | Your local Zotero profile. API keys and Jadense tokens are also stored there; do not share the profile publicly. |
| Cloud OCR | After upload/billing confirmation, relevant PDFs or page images go directly to the selected service. Keys use Zotero’s login manager, with a session-only fallback if persistence is unavailable. |
| BYOK model requests | Directly from the plugin to the selected provider, including the text, paper context, and images needed for the request. The API key authenticates with that provider. |
| Reference recognition, verification, and import | Uncertain fragments may be sent to the selected analysis model; Zotero lookup and Crossref verify DOI and bibliographic information. Exact matches or labeled first-result candidates are imported only after your review and explicit action. |
| Jadense AI features | Jadense receives temporary requests and their required context, authenticated with the plugin token. It also receives the plugin version and feature type for troubleshooting. The server handles processing, billing, and operational records under its own rules. |
| Literature upload | The metadata of papers you explicitly upload, plus local PDFs only when you choose to include them. |
| Plugin updates | Zotero requests the update manifest and installation package from the Jadense website. |

Local history does not mean offline AI. Extractable text from an attached PDF can become model context, and follow-up questions with image context can resend the most recent readable image. Plugin conversations do not create persistent conversations in the Jadense web app. If you have configured a Jadense connection, account cards and other features can still make separate requests to Jadense; BYOK does not disable those requests or automatic updates. See [SECURITY.md (Chinese)](SECURITY.md) for credential handling and security reporting.

### Which versions are supported? What are the reading limits?

The manifest declares compatibility with **Zotero 8.0 through 10.0.\***. Some older screenshots use the local 0.4.4 build on Windows 11 / Zotero 10.0.2; the 0.6.9 Reading mode screenshot uses an isolated Windows 11 / Zotero 10.0.3 profile. All use synthetic data and mocked services. The downloaded [v0.6.10](https://github.com/jadense-ai/jadense-in-zotero/releases/tag/v0.6.10) draft XPI passed three cold starts, Reading mode, engine storage and BYOK thinking checks, and an in-place upgrade from 0.6.9 on Windows 11 / Zotero 10.0.3. Other platforms, Zotero 8/9, Zotero 10.0.4 and live paid providers were not tested.

Scanned PDFs need OCR before operations that depend on extracted text. Analysis depends on the extractable text and model output; check the results against the paper. If generation is interrupted or some annotations cannot be saved, the plugin attempts to retain the generated notes and reports the outcome. Each message can include one new image. Images that were not saved by older versions cannot be recovered automatically.

<a id="upgrade"></a>

### How do I upgrade from an older version?

Install the current v0.6.12 release over an older GitHub version with the same `.cn` plugin ID. An in-place upgrade from 0.6.11 passed on Windows 11 / Zotero 10.0.6. Settings and local history are preserved. Existing translations are not regenerated automatically. The first 0.6.10 launch sets Jadense chat to `qwen-3.8-flash` once; BYOK chat stays unchanged, and later manual choices remain intact.

If your installed version uses `jadense-in-zotero@jadense.com`—including website version 0.3.2—**disable the old Jadense plugin first, then manually install the latest published XPI**. The new ID is `jadense-in-zotero@jadense.cn`. Different IDs do not replace each other through automatic updates; do not enable both at once.

The new version retains the existing preference namespace and history location. Do not delete your Zotero profile. Saved models, routes, and BYOK choices are preserved except for the one-time Jadense chat model switch above. The plugin still reads the [official Jadense update feed](https://jadense.cn/plugins/zotero/jadense-in-zotero/updates.json); a GitHub release does not automatically change that feed. See the [release notes (Chinese and English)](CHANGELOG.md#release-042-en) for version differences.

## Contribute and share feedback

Report plugin problems through the [upstream issue tracker](https://github.com/jadense-ai/jadense-in-zotero/issues), with the plugin version, Zotero version, operating system and reproduction steps, and with account details and private material removed — unless the behaviour only exists in this fork, in which case open an issue here. This fork is maintained for personal use; no response time is promised for third-party reports.

To build this branch yourself: Node 24 and pnpm 10.19.0, then `pnpm install && npm run build && npm test`. To follow an official release, `git fetch upstream --tags` and merge the new tag into `local`; the conflicts concentrate in `CHANGELOG.md` and `docs/usage-guide.md`. The upstream release script rejects four-segment versions, so tagging and artifact upload stay manual here. See [CONTRIBUTING.md](CONTRIBUTING.md) for the upstream workflow and [DESIGN.md](DESIGN.md) for product design.

## License

The code stays under the [Jadense Non-Commercial License 1.0](LICENSE): personal non-commercial use, learning and research are free, redistribution is free under its terms, commercial use needs separate written authorization, and downstream copies inherit the same conditions. Every local round's changes are identified in the `0.6.13.x` entries at the top of [CHANGELOG.md](CHANGELOG.md).

This is source-available software, not OSI open source: the [Open Source Definition](https://opensource.org/osd) does not allow restrictions on commercial use. The license does not revoke rights in previously MIT-licensed material or change third-party licenses. Preserved notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The plugin ID, the packaged update feed, the Jadense name and its trademarks belong to the upstream project and are not licensed by this fork.
