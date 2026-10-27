# 更新说明 / Changelog

## 0.6.13.13 — 2026-10-27

- 卡片中段收进一个可折叠的**「本机证据」框**：作者行之下、代码／数据徽章之上，附件账目、版面统计、正文一级小节、本地链接与附录原本是四五行平铺，现在同属一个独立描边的框，标题栏右侧写摘要（`附件 13 页 · 链接 2 条 · 附录 3 部分 · 正文小节 7 节`），点「收起／展开」折叠内容。默认展开，与下方模型评价框分成两块，谁读的、谁判的一眼可分。折叠状态只在本窗口内记住，换一批综述即复位；那一篇没有任何本机证据时整块不画。
- **正文一级小节可点击跳页**：扫描时给每个小节记下它所在的页与附件，卡片上的小节标题从纯文本变成按钮（带「第 3 页」），点一下调用 `Zotero.Reader.open(附件 itemID, { pageIndex })` 翻到那一页，与附录小节的跳转共用同一入口。标题用的就是版面统计里那一套，统计与跳页不会各认一套。
- 跳页信息（`sectionRefs`）只在本机流转：不进请求载荷，也不进「复制全文」；历史记录保存它，重开旧综述仍能跳。回读时标题必须确实出现在已保存的版面统计标题里，页码与附件 ID 必须是正整数，坏记录不能凭空造出一个可点小节。
- Turns the middle of each card into one collapsible **"Local evidence" box**, sitting between the author line and the code/data badges: attachment tally, layout counts, top-level body sections, local links and appendix titles were four or five loose rows and are now one bordered panel whose header summarises them (`13 page(s) · 2 link(s) · 3 appendix section(s) · 7 body section(s)`) and toggles the body. It starts expanded and is visually separate from the model rating below, so "measured locally" and "judged by the model" are no longer one block; the collapsed state lives only in the current window and resets with the next batch, and a paper with no local evidence gets no panel at all.
- **Top-level body sections are now clickable**: the scan records each section's page and attachment, so a section title on the card becomes a button with its page number and calls `Zotero.Reader.open(attachmentID, { pageIndex })` — the same entry point the appendix sections use, fed by the same heading list as the layout counts so the two cannot disagree.
- The jump data (`sectionRefs`) stays local: it never enters the request payload or the copied text, and history persists it so an old review still jumps. On read, a title must already be listed in the saved layout headings and page and attachment IDs must be positive integers, so a malformed record cannot invent a clickable section.

## 0.6.13.12 — 2026-10-27

- 新增**本机版面统计**：扫描附件时顺手数出每篇的一级小节标题（最多 12 条）、图数量、表数量、参考文献条数，以及「消融／ablation」「基线／baseline／state-of-the-art／compared with」「人工评测／user study／human evaluation」三组关键词命中次数。外发的只有标题文字与计数，正文一句不出机器；提示词把这一行标成「本机数出，非模型判断」，模型不得把计数当成自己的阅读结论。卡片与「复制全文」显示同一行，参考文献数不出来时写「未数出」而不是 0；历史记录回读时字段类型不对就整条丢掉。
- 一级标题识别按 **35 篇真实 PDF** 逐篇校准：首页单位行（`1. School of …`、`3 Shanghai AI Laboratory`）、每页重复的页眉（`2 自动化学报 51 卷`）、目录行（`Conclusion 23`）、IEEE 段落标签（`3) 进行目标识别`）、带引文标记的正文句、小型大写碎片（`1. 1 M`）、含逗号的中文正文句都不再被当成小节。页眉在主循环之前剔除——它同样以编号开头，会把阿拉伯序号吃掉，真标题随后全被判成「序号回退」。校准后 35 篇（中英日混排、会议／期刊／综述）无一假阳性，且每篇都能切出摘录。
- 新增**单篇按需深读**：批量综述结束后，每篇卡片下方有「深读这篇（单独一次请求）」。点下去先在本机切出有界摘录（最多 3 节、每节 400 字、总计 1200 字；引言取节尾，方法／结论／实验取节首，名字认不出来时按文档顺序补齐），然后弹确认框逐条报清送出多少字、是哪几节、节首还是节尾、在第几页、本机为切它读了多少页，并写明摘录之外的正文、图表、公式与附录都不发送。确认后才有那一次派发；取消、切不出摘录或中途停止都停在本地，状态行写「没有发送任何内容」。
- 深读结果解析成「一句话／方法细节／证据强度／可复现性／局限／评分依据」，评分沿用批量综述同一把尺子；每节带页码与附件 ID，点一下在阅读器里翻到那一页。提示词明确「不得假装读过未送来的部分」，返回无法解析时保留原文，不猜字段。深读写回本机历史里那一篇，不新增记录、不重排；记录已被清空时如实提示没能保存。
- 计费与非幂等契约与批量综述一致：深读是单独一次真实计费请求，上次执行结果未确认时**不自动重发**，只在用户核对提供商后按显式授权、沿用同一会话 ID 重发一次；错误投影仍只给错误码／HTTP 状态／类名，不回显提供商正文或凭据。不点深读时，这一版对批量综述只多了一行版面统计——一次派发、篇数预算与隐私围栏都没变。
- Adds locally measured **layout counts**: while scanning attachments the plugin now counts each paper's top-level section titles (at most 12), figures, tables and references, plus hits for ablation / baseline / human-evaluation wording. Only the titles and counts are sent, never body text, and the prompt labels the line as measured locally rather than judged by the model. An unrecognised reference list reports "unavailable" instead of 0, and history drops a record whose fields do not type-check.
- Heading detection was calibrated page by page on **35 real PDFs**: affiliation lines, per-page running headers, contents rows, IEEE paragraph labels (`3) …`), citation fragments, small-caps stubs and comma-bearing Chinese sentences are no longer read as sections. Running headers are removed before the main loop, because they start with a number too and would consume the sequence, after which every real heading looks like it went backwards. After calibration all 35 papers (mixed Chinese/English/Japanese, conference, journal and survey layouts) yield an excerpt with no false positives.
- Adds **per-paper deep read on demand**: after the batch review, each card offers "Deep read this paper (a separate request)". The plugin first cuts a bounded excerpt locally (at most 3 sections, 400 characters each, 1200 in total — introduction tail, method/conclusion/experiment heads, document order when names are unrecognised), then a confirmation dialog states exactly how many characters will be sent, which sections, head or tail, on which page, and how many pages were read locally to cut it, together with the note that the rest of the body, figures, formulas and the appendix are never sent. Only then is that single dispatch made; cancelling, failing to cut an excerpt or stopping sends nothing and says so.
- Deep-read findings are parsed into fixed fields (in brief, method detail, strength of evidence, reproducibility, limitation, scoring basis) on the same 0–100 ruler as the batch review; every section keeps its page and attachment so clicking jumps into the reader. The prompt forbids pretending to have read what was not sent, an unparsable response keeps the raw text, and the result is written back onto that paper's existing history record without adding or reordering records. Billing and the non-idempotence contract match the batch review: an unconfirmed execution is never resent automatically, only once after the user checks with the provider and explicitly authorises it on the same session ids, and errors still project only code, HTTP status and class name. Without clicking deep read, this version adds one layout line to the batch review — the single dispatch, the per-paper budget and the privacy fence are unchanged.

## 0.6.13.11 — 2026-10-27

- 「代码明确给出」有了硬定义：只有摘要或附录里给出仓库网址（github/gitlab/huggingface/zenodo 等，允许不写协议），或明确写了「源代码已开源／已发布／可获取」，才算 `yes`。项目主页、数据集网站、论文落地页，以及「将开源」「审稿后开源」这类承诺都不算。模型若在没有证据时写 `yes`，客户端会降为「未见说明」；代码与数据徽章的悬停提示把这条口径写明。
- 附录只保留**一级**标题，不再大小标题混排。卡片与复制文本统一成「附录存在，包括以下部分：1. 主要算法代码 2. 模型提示词 3. 数据对比验证」，子小节（`D.1`）、坐标轴刻度与正文句子都不会混进来。
- 真实 PDF 的四种漏检/误判已修：参考文献里的作者行（`A. Dai,`、`A. Cherubini,`）不再被当成小节；附录标题从 `VII` 这类续编开始时仍能取到（此前必须从 1 起）；编号与标题分行、小型大写被拆成碎片（`VII.` + `D` + `ATA` + `C` + `OLLECTION`）时能拼回；行尾断词（`Reproducibil-` + `ity Details`）能接回。复检 6 篇真实 PDF：SuperMimic 7 节、Neural Weights 7 节、Expressive 3 节、Humanoid-GPT 3 节均正确，BeliefOverlap 与 COLA 没有附录，结果为空。
- 逐篇评价改成 0–100 的量化分数：问题价值、方法创新、证据强度、可复现性、应用潜力各 20 分，写作、排版、图表、期刊、引用都不计分。档位由分数折算（80+ 高、65–79 中、50–64 低、其余无法判断），同一批文献用同一把尺子；材料只有题录或摘要被截断时分数上限 45。卡片标题旁显示 `72/100`，悬停可看评分口径与依据；历史记录兼容旧档位与新的 `score`。
- 模型返回的 JSON 有中文标点或漏转义引号时不再整篇报废。此前只要出现一处解析不了的字符，界面就退回「未能解析为结构化综述，已保留模型返回的文字供阅读」，四篇文献的卡片、评价、对比全没了。现在依次尝试：原样解析 → 语法修复（字符串里漏转义的内嵌引号补成 `\"`、字符串外的全角 `，：｛｝［］` 还原成半角、尾逗号与裸控制字符照旧）→ 逐字段恢复（按结构把还能读的顶层字段和数组条目取回来，彻底坏掉的条目丢弃）。带前瞻判断，句子里的中文逗号不会被当成分隔符；恢复成功会如实提示「已逐字段恢复，并跳过 N 处无法解析的内容」，恢复出的空壳条目不算覆盖，会写进「有 N 篇未被覆盖」。截断在完整值之后时，已到达的逐篇评价也能恢复出来。
- 隐私与计费不变：外发仍只有题录、摘要、链接文本与附录一级标题，PDF 正文一句不出机器；扫描不打开任何链接；一次派发、BYOK 未确认结果不自动重发，错误投影只给错误码／HTTP 状态／类名。
- "Code stated" now has a hard definition: only a repository URL (github/gitlab/huggingface/zenodo and the like, with or without a scheme) or an explicit "released / open-sourced / available" statement counts as `yes`. Project pages, dataset sites, paper landing pages and promises such as "will be released" or "after acceptance" do not. A `yes` without that evidence is downgraded to "not stated" on the client, and the badge tooltips spell out the rule.
- Appendixes list top-level titles only, in the form "appendix present, containing: 1. … 2. …"; sub-sections, axis ticks and prose sentences are excluded. Real-PDF fixes: reference authors (`A. Dai,`) are no longer read as sections, numeral continuations such as `VII` are accepted when the appendix does not start at 1, headings split across bare numbers and small-caps fragments are stitched back together, and hyphen-broken titles are rejoined. Re-checked on six real PDFs: SuperMimic 7 sections, Neural Weights 7, Expressive 3, Humanoid-GPT 3, while BeliefOverlap and COLA correctly return none.
- Malformed model output no longer costs the whole review. A single unparseable character used to drop every card, rating and comparison behind "could not be parsed as a structured review; the raw text was kept". Parsing now runs in three stages: as-is, syntax repair (unescaped inner quotes become `\"`, full-width `，：｛｝［］` outside strings becomes ASCII, trailing commas and bare control characters as before), then field-by-field recovery that keeps every readable top-level field and array entry and drops only what is genuinely broken. A lookahead keeps a Chinese comma inside a sentence from being read as a separator; recovery reports how many fragments were skipped, empty shells recovered from broken entries do not count as covered papers, and ratings that arrived before a truncation are recovered too.
- Per-paper ratings are now a 0–100 score: problem value, methodological novelty, strength of evidence, reproducibility and application potential at 20 points each; writing, layout, figures, venue and citations are not scored. Bands derive from the score (80+ high, 65–79 medium, 50–64 low, otherwise unclear), the same batch uses one ruler, and a metadata-only or truncated-abstract input caps at 45. The card shows `72/100` next to the rating title with the scoring rubric on hover, and history reads both old bands and the new `score`. Privacy and billing are unchanged.

## 0.6.13.10 — 2026-10-27

- 链接能点了。卡片里的「本地链接」从纯文本改成按钮，点击经 `Zotero.launchURL` 交给系统浏览器。只接受 http/https——历史记录或旧题录里混进的 `javascript:` 之类不会变成可执行动作。插件自身不访问任何地址，只有用户点下去才打开。
- 附录小节能跳到原文那一页了。扫描时每个小节标题都记下它出现在第几页、来自哪个附件；点击小节按钮调用 `Zotero.Reader.open(附件 itemID, { pageIndex })`，直接翻到附录所在页（`pageIndex` 是 0 起算的物理页，标题所在页减 1）。附件已在阅读器里打开时就地跳转，没打开就新开标签并定位。旧历史记录没有页码，保持纯文本，不假装能跳。
- 新增 `appendixRefs`（标题＋页码＋附件 itemID），只在本机流转：不进请求载荷，也不进「复制全文」。历史记录保存它，重开旧综述仍能跳页；读取时只认正整数页码与附件 ID，且标题必须确实出现在已保存的小节列表里——坏记录不能凭空造出一个可点小节，也不能指到不存在的页。
- 外观沿用原来的药丸样式，补了虚线可点提示、悬停实线、指针光标；按钮可用 Tab 聚焦，聚焦描边复用窗口既有样式。链接行与附录行的说明也改成「点击在浏览器打开」「点击跳到该页」。
- 隐私与计费不变：外发仍只有题录、摘要、链接文本与附录小节标题，PDF 正文一句不出机器；扫描过程不打开任何链接；一次派发、沿用「文献解析」功能模型，BYOK 未确认结果不自动重发，错误投影只给错误码／HTTP 状态／类名。
- Links are clickable now. Each local link is a button that hands the URL to the system browser through `Zotero.launchURL`, and only http/https is accepted so a `javascript:` leftover from an old record cannot become an action. The plugin itself still opens nothing; only an explicit click does.
- Appendix sections jump to their page. The scan now records the page and attachment for every section title, and clicking a section calls `Zotero.Reader.open(attachmentID, { pageIndex })` with the zero-based physical page, reusing an open reader or opening a new tab. Records saved before this version have no page information, so their titles stay plain text rather than pretending to be links.
- The new `appendixRefs` field stays local: it never enters the request payload or the copied text, and history persists it so an old review still jumps. On read, page and attachment IDs must be positive integers and the title must already be listed as a section, so a malformed record cannot invent a clickable section or point at a page that does not exist.
- Styling keeps the existing pill look with a dotted underline, solid on hover, pointer cursor and keyboard focus. Privacy and billing are unchanged: only metadata, abstracts, link text and appendix section titles leave the machine, one dispatch per run, and unconfirmed BYOK executions are never resent.

## 0.6.13.9 — 2026-10-27

- 修掉真机上附件扫描全部落空的根因：Zotero 10 的 `Items.get` 与 `getByLibraryAndKey` 只查缓存，条目已登记但未装载时会抛 `UnloadedDataException`；从 `collection.getChildItems()` 取到的条目又没有装载自身的 `childItems`，`getAttachments()` 同样抛错。两处异常都被旧的 `callMethod` 吞成「没有附件」，于是每篇都写成「读了 0 页 · 发现链接 0 条 · 未见附录」——而那篇 PDF 第一页就印着 `https://expressive-humanoid.github.io`、附录也有三节。现在改用 `getAsync`／`getByLibraryAndKeyAsync` 落库解析，并在 `getAttachments()` 失败时用 `loadDataType('childItems')` 补载后重试；同步 API 只作旧版回退。
- 失败不再伪装成「读过但什么都没有」。每篇新增 `scanOutcome`：`parsed`／`noAttachment`（条目确实没有 PDF）／`oversize`／`unreadable`／`unavailable`（条目或附件列表读不出来）。只有真正读到附件列表的篇目才标 `attachmentScanned`；`unavailable` 的篇目保持未扫，下次生成自动重试。卡片与徽章按结论分别写「未找到 PDF 附件」「PDF 读取或解析失败」「未能读取附件（重新生成会重试）」，回执补「N 篇未能读取附件列表」。
- 提示词新增 `scan` 字段（`read`／`no-pdf`／`failed`／`off`），明确只有 `read` 才能把空的 `links`／`appendix` 理解为「已读页面里没有」；`no-pdf`、`failed`、`off` 时不得断言这篇没有链接、没有附录或没有开源代码，也不得写「附件链接：无」。顺带把附录说明从「只读首尾若干页」改成实际的「整篇、最多 80 页」。
- 附件解析失败会写进本地诊断（`jadense-diagnostics`）：条目解析、`childItems` 补载、读盘、解析各有阶段名，下一轮出问题时不必只靠界面猜。快速解析窗口复用宿主上同一个诊断实例，不会与工作台各自覆盖记录。
- 历史记录保存 `scanOutcome`，重开旧记录时按当时的结论复原；0.6.13.8 及更早的记录标了「已扫」却一页没读的，一律按「未能读取附件」显示，不再写「读了 0 页」。
- 隐私与计费不变：仍只外发题录、摘要、链接文本与附录小节标题，正文不出机器，也不打开任何链接；一次派发、沿用「文献解析」功能模型，BYOK 未确认结果不自动重发，错误投影只给错误码／HTTP 状态／类名。
- Fixed the root cause behind empty attachment scans on real Zotero. In Zotero 10, `Items.get` and `getByLibraryAndKey` are cache-only and throw `UnloadedDataException` for registered-but-unloaded objects, and items returned by `collection.getChildItems()` do not have their own `childItems` data loaded, so `getAttachments()` throws too. The old `callMethod` swallowed both and every paper was reported as "read 0 pages · 0 links · no appendix" even though the reported PDF prints its project URL on page 1 and has three appendix sections. Resolution now goes through `getAsync`/`getByLibraryAndKeyAsync`, and `getAttachments()` is retried after `loadDataType('childItems')`; the sync API remains only as a legacy fallback.
- Failures no longer masquerade as "read it, found nothing". Each paper carries a `scanOutcome` (`parsed`, `noAttachment`, `oversize`, `unreadable`, `unavailable`) and only papers whose attachment list was actually read are marked scanned; `unavailable` papers stay unscanned so the next run retries. Cards and badges say "no PDF attachment", "PDF could not be read or parsed" or "attachment unavailable (retried next run)", and the summary counts papers whose attachment list could not be read.
- The prompt gains a `scan` field (`read`/`no-pdf`/`failed`/`off`): only `read` allows empty `links`/`appendix` to mean "nothing on the pages that were read"; with `no-pdf`, `failed` or `off` the model must not claim the paper has no links, appendix or code, and must not write "attachment links: none". The appendix note now says the whole PDF (up to 80 pages) is read instead of the stale "first and last pages".
- Attachment resolution failures are recorded in local diagnostics with a distinct stage per step (item resolution, `childItems` load, file read, parse); the quick-review window reuses the host's diagnostics instance so the two windows never overwrite the same record file. History persists `scanOutcome`; records from 0.6.13.8 and earlier that claimed "scanned" while reading zero pages are shown as "attachment unavailable" rather than "0 pages read".
- Privacy and billing are unchanged: only metadata, abstracts, link text and appendix titles leave the machine, no PDF body leaves and no link is opened; one dispatch per run, same billing destination, unconfirmed BYOK executions are never resent, and errors still project only code, HTTP status and class name.

## 0.6.13.8 — 2026-10-27

- 直接读 PDF 的超链接注释。用户那篇《Expressive Whole-Body Control for Humanoid Robots》第一页明明印着 `https://expressive-humanoid.github.io`，文字层却抽不到——因为不少论文把项目主页排成图形、分段文字或带字形问题的字体。本机 36 个 PDF 里，超链接注释共 610 条，其中 572 条在文字层里找不到对应网址。现在每篇附件的第 1～2 页会额外调用 `getAnnotations()` 取 `Link` 注释，与文字层结果合并去重；复检：注释通道在文字层之外多找出 8 条链接，涉及 7 篇论文（多是作者自己的 `*.github.io` 项目页与仓库）。
- 注释通道沿用文字层的噪声过滤，并加两条专有规则：身份／视频／社交站点（orcid、crossmark、YouTube、X、Bilibili 等）不进证据，期刊自己的 `/article/doi/…` 落地页也不算资源。只看前两页，是为了把参考文献列表里的仓库排除在外——体检里一条 `github.com/...` 出现在第 9 页，正是引文。每篇链接上限 4→6，注释与文字层各占几条，4 条在真实样本里会把项目页挤掉。
- 「什么都没发现」不再是一片空白。每篇卡片新增一行本机证据：`附件：读了 13 页 · 发现链接 1 条 · 附录小节 3 节`；没链接写「未见链接」，没附录写「未见附录」，本次没扫的卡片写「附件：本次未扫描」。文献清单的徽章也补齐「附件已扫 N 页，未见链接」和「有附录（未列小节）」。
- 读到附录标记但排不出小节标题时不再当作没有附录。真实样本里 `Appendix`／`Supplementary Material`／`附录` 之后常是整段正文或不分编号的小节。现在这类论文带 `appendixMarked` 标记：结果卡片与清单显示「有附录（未列小节）」，提示词允许说「有附录」但禁止说有几节或猜标题，扫描回执补一句「另有 N 篇读到附录标记但没排出小节标题」。标记正则同时修好了中文行（`附录：` 后跟 CJK 时旧的 `\b` 边界不成立）与「附录：A. 额外实验」这种标记加标题同一行的写法。体检：36 个 PDF 里读到附录标记 8 篇，其中排出小节标题 6 篇（上一版 3 篇）。
- 历史记录保存 `attachmentScanned`／`scanPages`／`appendixMarked`，重开旧记录时证据行与徽章按当时的扫描结果复原；旧记录没有这些字段则不显示证据行。
- 隐私与计费不变：注释通道只取 URL 文本，正文依旧一句不出机器，也不打开任何链接；仍是一次派发、沿用「文献解析」功能模型，BYOK 未确认结果不自动重发，错误投影只给错误码／HTTP 状态／类名。
- Read PDF hyperlink annotations directly. The reported paper prints `https://expressive-humanoid.github.io` on page 1 yet the text layer never yields it, because many papers typeset project URLs as graphics, split runs or with broken font maps. Across 36 local PDFs there are 610 link annotations and 572 of them have no counterpart in extracted text. Pages 1–2 of every attachment now also go through `getAnnotations()` and merge `Link` targets with text-layer results: the annotation channel contributes 8 links the text layer never sees, across 7 papers. The channel reuses the text-layer noise filters plus two of its own (identity/video/social hosts are dropped; a journal's own `/article/doi/…` landing page is not a resource) and only reads the first two pages so repositories inside the reference list stay out. The per-paper link cap moves from 4 to 6.
- A paper that yields nothing now says so. Every card gets a local evidence line (`Attachment: read 13 pages · 1 link · 3 appendix sections`), with explicit "no links", "no appendix" and "not scanned" wording, and the paper list gains matching badges. A paper whose PDF only marks an appendix without numbered section titles is flagged `appendixMarked`: the card says "appendix present (sections unnumbered)", the model may say the paper has an appendix but not how many sections or guess titles, and the scan summary counts them separately. Appendix detection now stands at 8 of 36 papers marked, 6 with section titles (up from 3). History records persist the scan tallies so reopening an old review restores the same evidence line. Privacy and billing are unchanged: only URL text and appendix titles leave the machine, no link is opened, one dispatch per run, no auto-resend on unconfirmed BYOK results.

## 0.6.13.7 — 2026-10-27

- 取证改为整篇读，不再只读首尾页。用插件同一套函数扫本机 36 个真实 PDF 做体检，抓到一类确凿的漏检：一篇 15 页的《Modeling and Understanding Neural Weights of Humanoid Policies》有 8 个附录小节，全部位于中间页，"第一页＋最后六页"一个都读不到。实测全文抽取一篇 27 页 45.7 MB 的 PDF 只要 313 ms、最慢的一篇 972 ms，省这点时间毫无意义，所以现在整篇都读（超过 80 页取首尾两半）。复检结果：36 篇里"读全文能抽到、读取证页抽不到"的链接 0 条、附录小节 0 节。
- 清掉参考文献带来的假链接。同一份体检显示漏检清单里三分之二是 OpenReview 的论文页（`openreview.net/forum?id=…`、`openreview.net/pdf/…`）——和 arXiv 同类，指向的还是这篇稿子，不是代码或数据，于是 `openreview.net` 从"资源站点"改列进落地页排除，并且不再占每篇 4 条的额度。另外去掉两类断行残串与检索站点：以 `-`／`_` 收尾的（`https://github.com/hill-`、`https://www.1x.tech/1x-world-mod-`），以及 `semanticscholar.org`、`mlr.press`、`acm.org`、`ieee.org`、`springer.com`、`citeseerx…`、`eprints.…` 这类参考文献域名。
- 扫描回执每轮都说，不再只报问题。上一版只在有附件被跳过时才开口，于是"扫过、确实没有"和"根本没扫成"在界面上完全一样——这正是"我每次测的论文都有网站，却还是什么都没看到"读不出原因的地方。现在状态行固定给出：读了几个 PDF、共多少页、发现几条链接、几篇有附录小节，以及三类没扫到的原因（没有可读 PDF 附件／超过 60 MB／读取或解析失败）。
- 只有一篇文献时不再产出「横向对比」。单篇没有对比对象，模型只能把一篇拆成两半自比。现在提示词按篇数分支：多篇仍要 3～5 个可比维度，单篇明确要求 `comparison` 返回空数组，示例 JSON 里也不再摆一条对比（示例是模型照抄的形状）。
- 隐私边界不变：外发的仍然只有题录、摘要、抽到的链接文本与附录小节标题；读得更多页只是在本机多扫一遍文字，正文一句不出机器（回归测试继续断言附录标题下方的正文与 `40 hours` 不会进载荷），也不打开任何链接。请求次数与计费目的地不变：一次派发、沿用「文献解析」功能模型，BYOK 未确认的执行不自动重发，错误投影只给错误码、HTTP 状态与类名。
- Evidence scanning now reads the whole PDF instead of the head and tail. An audit of 36 real local PDFs using the plugin's own functions found a concrete miss: a 15-page paper has eight appendix sections, all of them on middle pages that "page 1 plus the last six" never reaches. Full-text extraction costs 313 ms for a 27-page 45.7 MB file and 972 ms for the slowest paper in the set, so there was nothing to save — every page is read now, capped at 80 pages by taking the head and tail halves. Re-running the audit reports zero links and zero appendix sections that full text finds but the scan misses.
- Reference-list noise is gone. Two thirds of the items the previous round flagged as misses turned out to be OpenReview paper pages, which are the same class as arXiv: they host the manuscript, not the code. `openreview.net` moved from the resource list to the landing-page exclusions and no longer consumes one of the four slots. Tokens ending in `-` or `_` (line-break fragments such as `https://github.com/hill-`) and citation hosts (semanticscholar, mlr.press, acm.org, ieee.org, springer, citeseerx, eprints and friends) are dropped too.
- The scan now reports every run instead of only on problems. Previously it stayed silent unless something was skipped, which made "scanned, nothing there" indistinguishable from "never scanned" — exactly the ambiguity behind "every paper I test has a website and I still see nothing". The status line now states how many PDFs were read, how many pages, how many links and how many papers had appendix sections, plus the three reasons a paper may have produced nothing (no readable PDF attachment, over 60 MB, failed to read or parse).
- A single-paper review no longer produces a comparison table. With nothing to compare against the model has to split one paper in half, so the prompt now branches on paper count: multiple papers still get 3-5 comparable dimensions, one paper is explicitly told to return an empty `comparison` array, and the example JSON drops its sample row so the shape cannot be copied.
- Privacy is unchanged: reading more pages happens locally and still only ships link text and appendix titles — the regression that asserts appendix body prose never reaches the payload is still there. One dispatch, same billing destination, unconfirmed BYOK executions are never resent, and errors still project only code, HTTP status and class name.

## 0.6.13.6 — 2026-10-27

- 「全不选」不再留下打勾的图标。上一版清空的是勾选集合，图标仍按清单初始状态显示，于是提示说「本次发送 0 篇」而下面一排全是勾。现在「全选」「全不选」都调用同一个 `syncChecks`，只认 `included` 集合重画每行的复选框，文字与图标同一个来源。
- 链接抽取补上跨行粘合。PDF 排版经常把 `https://` 留在行尾、域名挪到下一行，pdf.js 取回的是两段文字，旧的正则一条也匹配不上——这就是实测「第一页明明写着项目主页却什么都没识别到」的直接原因。现在只有当断口后面是主机名形状（`域名.顶级域`）时才粘合，`https://` 后面接普通词的行尾断句不会被误当链接。
- arXiv 与 DOI 落地页不再算作发现。arXiv 地址只是这篇论文的托管页，指向的仍是同一份稿子，不能当开源证据；`arxiv.org`、`doi.org` 以及 `doi.acm.org` 这类以 `doi.` 开头的解析器前缀一律排除。同时去掉只有域名而没有路径的仓库根链接（`https://github.com` 这种指向空页），以及截断在域名中间的残串（去掉 `www.` 后没有点号，如 `https://www.agilityrobotics`）——发出去只会让模型猜完整网址。每篇上限 3→4 条，因为仓库、项目主页与数据集站点经常同时出现。
- 附件扫描上限放宽：单附件 20 MB→60 MB，尾页 3 页→6 页。会议论文 PDF 常在 25～50 MB，旧上限会把最该扫的附件静默跳过；附录小节标题也往往排在正文之后好几页，只读最后三页读不到。测试里那篇 Expressive Whole-Body Control（22,772,375 字节、13 页）在旧版因超限被整个跳过，本版能解析，第一页抽出 `https://expressive-humanoid.github.io`，尾页抽出三个附录小节。
- 新增附录小节标题识别。读到 `Appendix`／`Supplementary Material`／`附录` 标记行之后，形如「A. Motion Dataset Selection」「A. 额外实验」的标题会被收集（最多 8 节，重复去重），作为 `appendix` 字段与 `links` 一起进入证据链：提示词说明它、结果卡片与「复制全文」多一行「附录小节」、本机历史记录保存并在重开时复原。以句号收尾的整句正文不收，避免把段落首行误读成标题。
- 附录只证明「有这些标题」。提示词明确：`appendix` 为空只表示在已读的页面里没发现附录标记，不能据此断言这篇没有附录；也不得由标题猜附录里的数值、表格内容或实验设置。测得的三个标题对应数据集选择、额外训练细节与真实世界结果可视化——除这三节外，附录里没有单独的代码或数据小节。
- 扫描跳过要说出来。附件超过上限、读取或解析失败时，窗口状态行会补一句回执（`附件扫描跳过 N 篇（超过 60 MB：K 篇；读取或解析失败：L 篇）…`），因为静默跳过会让人以为「这篇没有链接」。pdf.js 模块加载失败或本机 Zotero 缺少附件读取能力时直接说明原因，并且不把行标记成已扫描，下次仍会重扫。
- 评价依据里的空话清掉。实测出现档位给「中等」而依据末尾写着「知识：AI 推断，需核对；依据现有材料不足以判断其相对新颖性。」——一句没有内容的占位标签，还推翻了自己刚判的档。原因在提示词：0.6.13.5 要求逐句标「摘要：」「链接：」「知识：」，示例 JSON 又写成 `basis: "摘要：…；知识：…（AI 推断，需核对）"`，模型于是照抄形状。现在改为只有真的引用了材料之外的了解才写「知识：」，且这一句要写出那条了解是什么；没引用就整段省略。另加一条同调要求：材料确实不足就填 `unclear` 并说明缺什么，已给 high／medium／low 便不得再写「无法判断」「依据现有材料不足以判断」。示例 JSON 换成带具体内容的依据。
- 隐私边界不变：外发的仍只有题录、摘要、抽到的链接文本与附录小节标题，PDF 正文一句不外发（回归测试专门断言附录标题下方的正文数值不会出现在载荷里），也不打开任何链接。请求次数与计费目的地不变：仍是一次派发、沿用「文献解析」功能模型；BYOK 未确认的执行依旧不自动重发，错误投影依旧只给错误码、HTTP 状态与类名，不回显上游正文或凭据。
- "Clear selection" left the tick icons on. It cleared the selection set but never repainted the rows, so the hint said "0 papers" while every line still looked checked; both buttons now go through one `syncChecks` that reads the same `included` set.
- Link extraction now rejoins URLs that PDF line breaks split after the scheme. That was the actual reason a project site printed on page 1 came back as nothing: pdf.js returns two separate text items and the old pattern matched neither. Gluing only happens when the gap is followed by hostname-shaped text, so a trailing `https://` in front of an ordinary word is not turned into a link.
- arXiv and DOI landing pages no longer count as discoveries — they host the same manuscript rather than point at code. `arxiv.org`, `doi.org` and resolver prefixes beginning with `doi.` are excluded, as are bare registry roots with no path and host fragments truncated mid-domain. The per-paper cap moves 3→4 because a repository, a project page and a dataset site often all appear.
- Attachment scanning was widened from 20 MB to 60 MB per file and from the last three pages to the last six. Conference PDFs routinely weigh 25–50 MB, so the old cap silently skipped exactly the files worth scanning; the Expressive Whole-Body Control sample (22,772,375 bytes, 13 pages) was skipped before and now yields `https://expressive-humanoid.github.io` from page 1 plus three appendix headings.
- Appendix section titles are detected after an `Appendix` / `Supplementary Material` / `附录` marker and sent as the `appendix` field: the prompt documents it, result cards and the copied text gain an "Appendix sections" line, and local history stores and restores it. Full sentences ending with a period are not collected. The prompt also states that an empty `appendix` only means no marker was found on the pages read — it cannot be used to claim a paper has no appendix, and section titles must not be used to guess numbers or settings inside them.
- Skipped attachments are now reported in the status line instead of passing silently, and a failed pdf.js load or a Zotero build without attachment reading says so and leaves those rows unscanned so the next run retries.
- Empty disclaimers are gone from the rating basis. A real run produced band "medium" followed by "知识：AI 推断，需核对；依据现有材料不足以判断其相对新颖性" — a label with no content that also contradicted the band it had just assigned. The prompt was the cause: the previous round asked every sentence to carry a 摘要／链接／知识 prefix and the example JSON showed `basis: "摘要：…；知识：…（AI 推断，需核对）"`, so the model copied the shape. Now 「知识：」 is only written when knowledge outside the material is actually cited, and that sentence must say what the recalled fact is; otherwise the segment is omitted. A consistency rule adds: if the material really is insufficient the band must be `unclear`, and a paper already graded high/medium/low may not restate that it cannot be judged.
- The privacy fence is unchanged: only bibliographic metadata, abstracts, extracted link text and appendix titles leave the machine — no PDF prose, no link opened. Still one dispatch to the same paper-analysis model, with unconfirmed BYOK executions never resent and error notices still projecting only code, HTTP status and class name.

## 0.6.13.5 — 2026-10-27

- 逐篇评价改用固定档位锚点。同一批文献每次给出的评价不一样，原因在模型侧的采样：插件的提示词本身是确定生成的，全仓库也没有 `temperature`／`top_p`／`seed` 任何一项。本版不动请求体（保持 BYOK 请求构造原样），改的是判档口径：`high`／`medium`／`low`／`unclear` 各写死判据（例如 `low`＝换骨干、调超参、加一个模块这类增量改动，`unclear`＝材料不足或缺摘要），并要求「不要为了拉开差距而分档」。
- 评价允许结合模型自己的知识。`value`／`novelty` 可以引用你对该方向已有工作、常见做法与后续影响的了解，不必只盯摘要；但 `basis` 必须逐句标来源——「摘要：」「链接：」「知识：」，凭记忆而材料未证实的部分要写「AI 推断，需核对」，也不得拿未提供的数值支撑档位。缺摘要的条目仍在锚点里被要求归 `unclear`。
- 开源代码与数据集改为多路证据查找。发给模型的每篇数据新增 `links` 字段：题录的 `url` 与 `extra` 里的网址会被抽出来；`code`／`data` 判 `yes` 时可在 `resourceNote` 里引用「摘要：」「题录链接：」「附件链接：」任一类来源，两类证据都没有才记 `unknown`，仍禁止编造或改写仓库名与网址。模型只被允许原样引用 `links` 里已经出现的地址，不输出其它网址。
- 本机附件首尾页解析（新开关「扫描附件找开源链接」，首选项 `extensions.jadenseInZotero.quickReviewScanLinks`，默认开启）。很多文献只在 PDF 首页或文末几页给出项目主页，而库里常常只存了 PDF 本身：现在用插件自带的 pdf.js 只读每篇附件的第一页与最后三页，从文字里抽链接，单附件上限 20 MB、每篇最多 2 个附件，每批只扫一次（授权重发沿用已扫过的那批，不重读盘）。送出去的只有抽到的链接文本，PDF 正文不外发，也不打开任何链接；关掉开关即回到上一版「只发题录与摘要、不读取 PDF」。窗口顶部的说明行会跟着开关改写，明确这次到底带不带附件。
- 结果卡片与复制全文增加「本地链接」一行，以不可点击的等宽文本展示（不生成 `<a>`，避免误点外部地址）；文献清单里带链接的行标出条数；本机历史记录保存这些链接，重新打开记录时卡片上仍然看得到。
- 开源徽章措辞修正：证据不再只来自摘要，「摘要明确给出／摘要未提及」改为「明确给出／明确不给／未见说明」。`resourceNote` 上限 100→120（要放得下一条完整网址加来源前缀），评价 `basis` 120→150；提示词里写给模型的长度限制仍与客户端裁剪上限同源生成。
- 请求次数与计费目的地不变：仍是一次派发、沿用「文献解析」功能模型；BYOK 未确认的执行依旧不自动重发，错误投影依旧只给错误码、HTTP 状态与类名，不回显上游正文或凭据。
- Ratings now land on fixed level anchors. The same papers getting different ratings every run is provider-side sampling: the plugin's prompt is deterministically generated and nothing in the codebase sets `temperature`, `top_p` or `seed`. This build leaves the request body untouched (the BYOK request construction is unchanged) and instead pins the bands — `high`/`medium`/`low`/`unclear` each carry explicit criteria, with an instruction not to spread grades just to create separation.
- Ratings may draw on the model's own knowledge of the field, but every sentence in `basis` must be labelled 「摘要：」/「链接：」/「知识：」, and anything recalled without support in the material has to be marked as an AI inference to verify. Unsupported numbers still cannot justify a band, and abstract-less entries still fall to `unclear`.
- Open-source evidence is now gathered from several sources: each paper carries a `links` field built from the bibliographic `url` and `extra` fields, and `code`/`data` may be justified by an abstract sentence or one of those links, prefixed with abstract / bibliography-link / attachment-link. Only links already present in `links` may be quoted back; nothing else leaves as a URL.
- A new "Scan attachments for code links" switch (`extensions.jadenseInZotero.quickReviewScanLinks`, on by default) reads only page 1 and the last three pages of each local PDF with the bundled pdf.js — project pages usually live in the first-page footer or the "Code availability" at the end — capped at 20 MB per file and 2 attachments per paper, once per batch. Only the extracted link text is sent; PDF prose never leaves the machine and no link is opened. Turning it off restores the previous "metadata and abstracts only, no PDF reading" behaviour, and the header line in the window states which of the two is about to happen.
- Result cards and the copied text gained a "Local links" line rendered as selectable, non-clickable monospace text; the paper list shows how many links each row carries, and local history stores them so a reopened record still shows them.
- Availability badges no longer claim the abstract is the only source: "stated in the abstract" became "stated" / "stated as unavailable" / "not stated". `resourceNote` grew 100→120 so a URL plus its source prefix fits, rating `basis` 120→150, and the limits quoted to the model are still generated from the same constants the client clips with.
- One dispatch, same paper-analysis model, same billing destination: unconfirmed BYOK executions are still never resent, and error notices still project only code, HTTP status and class name.

## 0.6.13.4 — 2026-10-26

- 快速解析窗口的「收藏夹」和「一次发送」改用插件自绘列表框。上一版给原生 `<select>` 的 `option` 补背景是无效修复：chrome 文档里原生下拉的弹出层是文档内 XUL menupopup，根本不读页面主题，所以选项文字仍与下一行重叠。现在两处都走 `createJdxSelect`，弹层是页面内 `position: fixed` 的不透明层，带边框与投影；收藏夹一项还支持输入关键字筛选。Escape 在弹层展开时只收起弹层，不会再关掉整个窗口。
- 「一次发送」默认改为前 6 篇（可选 6／12／20／30），超过 12 篇才弹确认。
- 一次调用的输出预算整体收紧，综述生成等待随之变短：总览 1200→600，逐篇「定位」160→80 并改名「一句话」，问题 240→120，思路／方法／实验流程／结论各 320→160，工具与开源依据各 200→100，横向对比最多 5 个维度且每条说明 900→240、维度名 80→40，趋势与空白各 900→400，逐篇评价的实用价值／创新性 240→140、依据 200→120、总体评价 600→300。四篇含评价的最坏输出从约 22,680 字降到约 9,340 字。提示词里写给模型的长度限制与客户端的裁剪上限改用同一组常量生成，两处不再各说一套。
- 提示词补一条写作要求：每项写成一到两个短句，不复述摘要原句，不写铺垫和「本文认为」这类填充。
- 修正「定位」字段的含义。上一版提示词写的是「说明该文献在收藏夹中的位置」，模型于是成片输出「该文位于收藏夹中关于……的研究位置」这种归位套话。现在要求用一句话说清这篇做了什么、面向谁，并明确禁止提收藏夹、目录或分类；发给模型的每篇数据也不再带目录路径，只保留这批文献所属的收藏夹名。界面与复制文本的标签同步改为「一句话」。
- 生成中的状态行不再整段不动：接收阶段按已收字数补一行「正在接收综述 · 已收到 N 字」，字数有增长且距上次上报不少于 2 秒才更新，不刷日志。
- 请求次数与计费目的地不变：仍是一次派发、沿用「文献解析」功能模型；BYOK 未确认执行依旧不自动重发，错误投影依旧只给错误码、HTTP 状态与类名。
- The collection and papers-per-request controls in the quick review window now use the plugin's own list box. The previous round's background fix on native `<option>` could not work: in a chrome document the native popup is an in-document XUL menupopup that never reads the page theme, so option text kept overlapping the line below. Escape now only closes an open popup instead of shutting the whole window.
- Papers per request default to the first 6 (6/12/20/30), and confirmation is only asked above 12.
- The per-request output budget was cut across the board, which is what the wait is bound by: overview 1200→600, the per-paper note 160→80 (renamed "In brief"), question 240→120, idea/method/experiments/finding 320→160 each, tools and resource basis 200→100 each, comparison capped at 5 dimensions with notes 900→240 and dimension names 80→40, trends and gaps 900→400 each, rating value/novelty 240→140, basis 200→120 and the overall rating 600→300. The worst case for four papers with ratings drops from about 22,680 characters to about 9,340. The limits written into the prompt and the limits the client clips with are now generated from one set of constants.
- The "role in the collection" instruction was wrong, so every paper came back as "this paper sits in the collection's position for …". The field now asks for one sentence on what the paper does and for whom, forbids any mention of the collection, folder or classification, and the per-paper payload no longer carries a folder path — only the collection name for the batch.
- The status line keeps moving while a review streams: a throttled "Receiving the review · N characters so far" appears once the count grows and at least 2 seconds have passed since the last update.
- Dispatch count and billing destination are unchanged: one request, still the paper-analysis feature model, unconfirmed BYOK executions are still never resent, and error notices still project only code, HTTP status and class name.

## 0.6.13.3 — 2026-10-26

- 快速解析窗口默认更大：按可用屏幕面积的 88% 开窗，最小 1440×820；屏幕本身不够大时退回可用范围，绝不超出屏幕。历史行的标题、时间与「删除」键保持同一水平线。
- 「一次发送篇数」等下拉框补上不透明背景与边框，展开的选项不再和窗口底色重叠。
- 提示词新增逐篇「思路」「实验流程」「工具」，并要求分别给出开源代码与数据集情况（`yes`／`no`／`unknown`）及一句话判断依据。模型只能按摘要写明的事实标注：不得按常识、期刊或「通常会开源」推断，不得编造仓库名、网址或许可证；摘要未提及一律记为 `unknown`。界面用颜色徽章区分「摘要明确给出／明确不给／未提及」，复制的纯文本同样保留。
- 新增「逐篇评价（实用价值、创新性）」勾选：在同一次调用里追加逐篇评价与总体评价，不增加请求次数，也不新增计费目的地。勾选状态写入首选项 `extensions.jadenseInZotero.quickReviewEvaluate`（默认不勾选）。评价与对应的逐篇要点排在同一行，向下浏览时一起滚动，无需两边对照。
- 评价仍受同一围栏约束：BYOK 未确认的执行依旧不自动重发，用户显式授权重发时沿用这次已锁定的勾选状态；信息不足时评价档位归为「证据不足」，缺摘要的条目被要求只能填该档。
- 从本机历史重新打开记录时恢复逐篇卡片与评价栏：结构化正文按记录内的序号一并保存，序号对不上题录的要点或评价会被丢弃。0.6.13.3 之前只存整段文字的记录仍原样显示文本，不伪造成卡片。
- Quick review windows open larger: 88% of the available screen with a 1440×820 floor, falling back to the usable area on smaller screens so the history row's title, timestamp and Remove button stay on one line. The papers-per-request select now has an opaque background instead of overlapping the window.
- The prompt additionally asks for each paper's idea, experimental setup and tools, plus open-source code and dataset availability (`yes`/`no`/`unknown`) with a one-line basis. Claims must come from what the abstract states: no inference from journal or "usually open-sourced" conventions, and no invented repository names, URLs or licences. Colour badges separate "stated", "stated as unavailable" and "not stated", and the copied text keeps the same wording.
- A new "Rate each paper (practical value, novelty)" checkbox folds per-paper ratings and an overall assessment into the same single request — no extra dispatch, no new billing destination. The choice persists in `extensions.jadenseInZotero.quickReviewEvaluate` (off by default), and each rating sits on the same row as its digest so both scroll together. Unconfirmed BYOK executions are still never resent, and an authorised resend reuses the locked-in choice.
- Reopening a saved review restores the per-paper cards and rating column because the structured digest is now stored alongside the record, bound to the record's own paper indexes; anything pointing at an unknown index is dropped. Records saved before 0.6.13.3 keep showing their stored text instead of being faked into cards.

## 0.6.13.2 — 2026-10-26

- 新增「快速解析此收藏夹」：在 Zotero 收藏夹右键打开独立窗口，递归读取该收藏夹及子收藏夹的文献（跳过附件、笔记与回收站条目），一次调用产出总览、逐篇要点、横向对比、趋势与脉络、空白与值得跟进，可复制全文并保留本机历史。
- 输入只有题录与摘要，不读取 PDF、不上传全文；默认一次发送前 12 篇（可选 6／12／20／30，超过 12 篇需确认），摘要过长按篇数均分预算自动压缩，缺摘要的条目在结果中标注为仅依据题录。
- 结果只用于阅读：不写入 Zotero 条目、笔记或标签。模型只按序号回指文献，标题与条目身份由本地回填；无法解析为结构化综述时保留原始返回文字，不猜测任何一篇的结论。
- 模型沿用「文献解析」的功能配置，不新增计费目的地。BYOK 未确认的执行仍不自动重发：窗口提示先在提供商后台核对，用户显式授权后才沿用同一会话顶掉旧记录；已收到的部分综述照常保留。
- 失败提示继续只投影错误码、HTTP 状态与错误类名，不回显上游正文或密钥；提示词把收藏夹名、标题、摘要与标签声明为不可信引用材料，忽略其中要求执行工具或改写任务的文字。
- Collection quick review: a new collection context-menu window walks the collection and its sub-collections and produces an overview, per-paper notes, a comparison table, trends and gaps in a single request, with local history and full-text copy.
- Only bibliographic metadata and abstracts are sent — never PDFs. Twelve papers go per request by default (6/12/20/30, above 12 asks for confirmation); the abstract budget is shared across papers and items without an abstract are marked as bibliography-only.
- The digest is display-only and never writes items, notes or tags. The model references papers by index while titles and item identities are filled locally; an unparsable response is kept as raw text instead of inventing conclusions.
- The review reuses the paper-analysis feature model, so no new billing destination exists. Unconfirmed BYOK executions are still never resent: the window asks you to check the provider first and only a user-authorized retry supersedes the recorded execution, while partial output is retained. Error notices keep projecting only code, HTTP status and class name, and the prompt treats collection names, titles, abstracts and tags as untrusted quoted material.

## 0.6.13.1 — 2026-10-26

- 对照翻译不再无限堆积缓存：发布新成稿后只保留当前与上一版快照，任务目录里更早的成稿和写入中断留下的临时稿会在下一次打开对照翻译时后台回收；版面解析缓存同样每次重解析后只保留当前与上一版。
- 已删除文献的对照成果与版面缓存在连续两次确认（间隔一分钟以上）后自动清理，避免残留孤儿目录；文献库尚未就绪时一律不删。想保留已删除文献的成果，可将首选项 `extensions.jadenseInZotero.removeOrphanTranslatedPDF` 设为 `false`（默认开启清理）。
- 对照译文 PDF 完成后可自动保存到上次导出过的目录（首选项 `extensions.jadenseInZotero.autoSaveTranslatedPDF`，默认开启）；手动导出与自动保存都以文献标题命名，附件占位名「PDF」不再当作标题，且不会覆盖原 PDF 或已有文件。
- 失败提示新增错误类型前缀（如【上游服务错误 · 503】），只投影错误码、HTTP 状态与错误类名，不回显上游正文或密钥。
- BYOK 计费围栏沿用 0.6.13 上游设计：已产生输出或结果未确认的请求不会自动重发，需用户显式授权；本版不再改动 BYOK 重试与执行状态判定，并补充了锁定该边界的回归测试。
- Bilingual PDF translation no longer accumulates cache: only the current and previous revisions survive a publish, while older published PDFs and interrupted temporary files are reclaimed in the background the next time the bilingual reader opens; layout parsing keeps the same two generations.
- Results and layout caches of attachments deleted from the library are reclaimed after two confirmations at least a minute apart, and nothing is deleted while the library is not ready. Set `extensions.jadenseInZotero.removeOrphanTranslatedPDF` to `false` to keep them.
- Finished bilingual PDFs can auto-save to the last used export directory (`extensions.jadenseInZotero.autoSaveTranslatedPDF`, on by default). Manual export and auto-save are named after the parent literature item instead of the attachment placeholder "PDF", and never overwrite the original PDF or an existing file.
- Failure notices gain a typed prefix (e.g. [Upstream service error · 503]) built only from error code, HTTP status and class name, so no provider body or credential can leak.
- The BYOK billing fence keeps the 0.6.13 behaviour: output-producing or unconfirmed executions are never resent without an explicit user choice. This build changes no BYOK retry or execution-state rules and adds tests that pin that boundary.

## 0.6.13 — Unreleased / 尚未发布

- 文献解析与 PDF 对照翻译保存任务进度；可恢复的暂时故障等待后继续，重启后恢复此前明确运行的任务，用户暂停的任务等待手动继续。已完成的模型结果只补本地保存、批注或 PDF 排版。
- 解析完成状态不再被抽样说明误标为失败；保留缺页、生成与保存错误，解析详情提供「继续解析」，并区分暂停与等待恢复。
- 选文浮窗与简阅新增 80%–200% 的独立文字大小；PDF 对照翻译新增 25%–500% 译文缩放，同步滚动开启时两侧一起缩放。调整显示不触发翻译。
- PDF 来源或配置失效时，恢复入口明确为「按当前设置重新翻译」，保留旧成果；未确认的 BYOK 请求仍提示可能重复计费。未修改文件或设置却收到配置变化提示的原始原因仍在调查，本版不宣称已解决。
- Paper analysis and bilingual PDF translation retain task progress, wait before resuming recoverable temporary failures, and restore previously running tasks after restart. User-paused tasks require manual continuation. Completed model results only need local saving, annotations or PDF typesetting.
- Sampling notices no longer mark completed analysis as failed. Missing pages and generation/save errors remain visible; analysis details offer Continue analysis and distinguish paused tasks from tasks waiting to resume.
- Add separate 80%–200% text size for selection translation and Reading mode, plus 25%–500% zoom for translated PDFs. Sync scroll zooms both PDFs together. Display changes do not request translation.
- PDF tasks blocked by source or configuration checks offer Translate again with current settings while retaining old results. Unconfirmed BYOK requests still warn about possible duplicate charges. Reports of configuration-change errors without file or settings changes remain under investigation; this release does not claim to resolve their original cause.

## 0.6.12 — 2026-10-18

- 发现前沿侧栏入口回到首页，进行与结果独立显示；进度页保留停止操作，历史在首页回看。
- 更新结果文献卡片、摘要与 AI 评价展开、原文入口和收藏／PDF 操作，改善浅深色、窄窗与字号缩放。
- 兴趣档案新增交集／并集检索模式；默认并集，帮助提示说明关键词与完整短语的匹配方式，并改善弹窗关闭图标对齐。
- Discover frontiers opens at home, with separate progress and result views, a stop action during a run and history on the home page.
- Refresh result cards, abstract/review expansion, original-paper links and save/PDF actions across themes, narrow windows and font sizes.
- Add all-keyword and any-keyword modes to interests, defaulting to any-keyword matching; contextual help explains keyword/phrase matching and the dialog close icon is centered.

## 0.6.11 — 2026-10-15

- 发现前沿更新小玉欢迎页、兴趣摘要、逐篇扫描与发现历史，修复说明段落偏左、滚动区和窄窗布局；保留来源选择、模型设置与收藏功能。
- 改进收藏 PDF 的预检、未完成上传恢复、已保存文件关联重试及逐项结果反馈；需要配套服务端支持。
- 改进简阅与 PDF 翻译的部分结果保留、停止及未确认请求提示，模型选择器统一展示 Auto 与直接模型。
- Refresh Discover frontiers with a welcome page, interests, per-paper scanning and history; fix paragraph centering, scrolling and narrow-window layout while retaining sources, model settings and favorites.
- Improve PDF upload preflight, pending-intent recovery, saved-file association retries and per-item feedback; matching server support is required.
- Improve partial translation retention, cancellation and unconfirmed-request feedback; show Auto alongside direct models in model menus.

## 0.6.10 — 2026-09-30

- PDF 版面引擎与本机 OCR 可分别选择存储位置；移动已有安装时先复制、校验并检查健康状态，失败保留原位置。
- BYOK 模型可配置并按功能选择思考档位；未明确选择时由提供商决定，已有配置继续可用。
- 首次启动 0.6.10 时，攻玉对话模型一次性改为 `qwen-3.8-flash`。BYOK 对话目的地、翻译等独立模型不变；之后的手动选择不会在重启或后续更新时再次被覆盖。
- PDF layout and local OCR engines can use separate storage locations. Moving an installation copies and verifies files and checks engine health before switching; failures keep the old location.
- BYOK models now support configurable thinking levels per feature. Without an explicit level, the provider decides; existing configurations remain usable.
- The first 0.6.10 launch sets Jadense chat to `qwen-3.8-flash` once. BYOK chat and independent feature models stay unchanged, and later manual choices are preserved across restarts and subsequent updates.
- 已正式公开发布；Windows 11 / Zotero 10.0.3 上，草稿原包通过三次冷启动、0.6.9 原位升级、简阅、引擎存储、BYOK 思考档位和原生解析侧栏专项，两种引擎通过离线安装检查。其他系统、Zotero 8/9、Zotero 10.0.4 和真实付费服务未实测。
- Released publicly. On Windows 11 / Zotero 10.0.3, the original draft assets passed three cold starts, an in-place upgrade from 0.6.9, Reading mode, engine storage, BYOK thinking and native analysis sidebar checks. Both engines passed offline installation checks. Other systems, Zotero 8/9, Zotero 10.0.4 and live paid services were not tested.


## 0.6.9 — 2026-09-30

- PDF 阅读器新增「简阅模式」：左侧保留原生 PDF，右侧显示 Zotero 提取的结构化 HTML；只有主动点击翻译才替换右侧文字，可查看部分成果、补译和历史版本。缺少所需阅读器能力时会提示不可用。
- 模型选择新增思考档位与可搜索列表；选文、简阅及 PDF 对照翻译的进度、停止和失败反馈更清楚。简阅与 PDF 对照的翻译上下文预算分别可调，默认各为 128K。
- PDF 对照翻译改进单行控制栏、视图切换及侧栏宽度变化后的适宽；工具栏入口使用 Languages 图标。文献解析与 AI 请求中断后的恢复反馈也更明确。
- 现有设置和历史保留；官方完整 XPI 继续包含前沿雷达，公开源码基础构建不包含该模块。
- PDF Reading mode keeps the native PDF on the left and Zotero's extracted HTML on the right. Translation starts only on request and replaces right-hand text; partial results, remaining passages and local history remain available. Unsupported reader capabilities produce a clear message.
- Model selection adds thinking controls and searchable choices. Selection, Reading mode and bilingual PDF translation show clearer progress, stop and failure feedback. Reading mode and bilingual PDF each have an editable 128K default context budget.
- Bilingual PDF improves its compact toolbar, view switching and fit-to-width after sidebar resizing, and uses the Languages icon. Analysis and interrupted AI requests provide clearer recovery feedback.
- Existing settings and history are retained. Official full packages continue to include Frontier Radar; public-source base builds omit it.
- 已正式公开发布；Windows 11 / Zotero 10.0.3 上，草稿原包通过三次冷启动、0.6.8 原位升级、简阅、PDF 对照翻译、选文工具栏、前沿雷达专项及两种引擎的离线安装检查。其他系统、Zotero 8/9、Zotero 10.0.4 和真实付费服务未实测。
- Released publicly. On Windows 11 / Zotero 10.0.3, the original draft assets passed three cold starts, an in-place upgrade from 0.6.8, Reading mode, bilingual PDF, selection toolbar, Frontier Radar checks and offline installation checks for both engines. Other systems, Zotero 8/9, Zotero 10.0.4 and live paid services were not tested.

## 0.6.8 — 2026-09-29

- 前沿雷达开放双模式：通用模式追踪 arXiv，攻玉模式可选择 13 个公开文献来源；两种模式均可手动或每日追踪、查看历史和收藏。
- 前沿雷达新增独立模型配置与结构化 AI 预评阅读，兴趣档案默认最近 3 天、最多 30 篇候选。攻玉模式还为文献分类提供账号 Jev 判断，并在本机 OCR 未就绪时提供攻玉 OCR 选择。
- 改进模型选择反馈、阅读器工具栏与 PDF 翻译交互。官方完整 XPI 包含前沿雷达；公开源码基础构建不含该模块。
- Frontier Radar now runs in both modes: arXiv in standard mode and a choice of 13 public sources in Jadense mode, with manual or daily runs, history and saving in either mode.
- Add separate radar model settings and structured optional AI reviews; research interests default to the last three days and 30 candidates. Jadense mode also provides account based Jev classification and an OCR option when local OCR is unavailable.
- Improve model selection feedback, reader toolbar and PDF translation interactions. The official full XPI includes Frontier Radar; public source builds omit this optional module.
- 已正式公开发布；Windows 11 / Zotero 10.0.3 上，草稿原包通过三次冷启动、0.6.7 原位升级、雷达原生专项及两种引擎的离线安装检查。其他系统、Zotero 8/9 和真实付费服务未实测。
- Released publicly. On Windows 11 / Zotero 10.0.3, the original draft assets passed three cold starts, in-place upgrade from 0.6.7, native radar checks and offline installation checks for both engines. Other systems, Zotero 8/9 and live paid services were not tested.

## 0.6.7 — 2026-09-27

- 新增文献雷达：兴趣档案、arXiv 发现、相关性评分、可选 AI 评价、每日执行、历史与文献/PDF 收藏。仅支持 arXiv；多源及来源选择 UI 于下一版本开放。
- 新增默认关闭的攻玉模式；文献雷达的真实追踪需要连接攻玉并开启该模式，关闭时可查看演示。
- 本机 OCR 环境检查、安装与模型准备支持停止；PDF 翻译改进中断恢复与成果状态反馈。
- Literature Radar adds research interests, arXiv discovery, relevance scores, optional AI reviews, daily runs, history and paper/PDF saving. Only arXiv is supported; multiple sources and their selector are planned for the next version.
- Jadense mode is off by default. Live radar requires a Jadense connection and this mode; a demo is available while it is off.
- Stop local OCR setup/model preparation and improve PDF translation recovery and result feedback.
- 官方完整安装包包含文献雷达；公开源码基础构建不含该模块。Official complete packages include Literature Radar; public-source base builds do not.

## 0.6.6 — 2026-09-26

- 修复设置页“GitHub 下载与手动安装指南”点击后不打开系统浏览器的问题。
- 修复 PDF 离线检测请求带 UTF-8 BOM 时的解析错误，以及深层 Zotero profile 下 PDF/OCR 引擎解压路径过长的问题。
- 用户手动选择的官方离线引擎 ZIP 可直接导入并完成离线健康检查；自动下载继续验证下载结果。OCR 安装失败时显示实际错误，而不再用解压进度淹没原因。
- 更新 Windows x64 离线安装与环境排障指南；本版仍提供包含 XPI、PDF 引擎和 OCR 引擎的完整套装。
- Fix the PDF engine guide link so it opens the system browser from Zotero settings.
- Accept a leading UTF-8 BOM in the PDF engine's offline-check request and shorten extraction paths for both engines under deep Zotero profiles.
- Allow a user-selected official engine ZIP to proceed to offline health checks; automatic downloads still verify downloaded bytes. OCR installation errors now show the actual failure instead of extraction progress.
- Update Windows x64 offline setup and troubleshooting guidance; the release includes the XPI and both engines in one suite.
- 已公开发布；完整离线套装仅覆盖 Windows x64。Windows 11 / Zotero 10.0.3 的草稿原包通过三次冷启动、0.6.5 原位升级及两种引擎的普通用户离线安装和健康检查；其他系统及 Zotero 8/9 未实测。
- Released publicly. The complete offline suite targets Windows x64. Draft assets passed three cold starts, in-place upgrade from 0.6.5 and offline installation/health checks for both engines on Windows 11 / Zotero 10.0.3; other systems and Zotero 8/9 were not tested.

## 0.6.5 — 2026-09-26

- Windows x64 新增包含插件、PDF 版面引擎与全文 OCR 引擎的完整离线 ZIP。解压后安装其中的 XPI，再分别导入两个引擎 ZIP；无需预装 Python/uv 或管理员权限。
- PDF 引擎优先使用固定版本的完整包，并改进代理继承、可恢复下载及阶段化错误说明。完整性或离线健康检查失败时保留已有引擎。
- 本机 OCR 增加匹配版本的离线引擎导入，包含全文识别模型；选文公式增强仍在首次使用时另行下载。AI 翻译仍需要服务与网络。
- 固定 Docling TableFormer 的 ModelScope 下载提交，避免镜像分支前移导致离线引擎构建摘要不匹配。
- Windows x64 gains a complete offline ZIP containing the plugin, PDF layout engine and full-document OCR engine. Extract it, install the included XPI, then import each engine ZIP; preinstalled Python/uv and administrator access are unnecessary.
- PDF setup prefers the fixed full bundle, with improved proxy inheritance, resumable downloads and stage-specific errors. The existing engine is retained if integrity or offline health checks fail.
- Local OCR can import the matching offline engine bundle, including full-document recognition models. Selection formula enhancement still downloads separately on first use; AI translation still requires a service and network access.
- Pin the Docling TableFormer ModelScope commit so offline engine builds do not drift when the mirror branch advances.
- 已公开发布；完整离线套装仅覆盖 Windows x64。Windows 11 / Zotero 10.0.3 通过 XPI 冷启动、普通用户环境下两种引擎离线安装与识别/渲染检查；其他系统及 Zotero 8/9 未实测。
- Released publicly. The complete offline suite targets Windows x64. Windows 11 / Zotero 10.0.3 passed XPI cold starts and both engines' offline installation and recognition/rendering checks in a standard-user environment; other systems and Zotero 8/9 were not tested.

## 0.6.3 — 2026-09-24

- 关联 PDF 超出模型上下文时，AI 对话和图片解读默认选取问题相关的原文片段，不再自动发起多轮全文概括；新建图片对话本身不会整理全文。
- 如需分批概括全文，可在「设置 → 功能配置 → AI 对话 → 关联 PDF 长文处理」明确开启；图片解读沿用同一设置。开启后按模型输入容量尽量填满每批，减少不必要的整理请求及等待。
- AI 请求长时间没有输出时会结束等待并提示；停止请求后界面及时解除加载。长文结果仍需对照 PDF 原文核查，真实 Provider 的速度和质量取决于服务端。
- Linked PDFs that exceed the model context now use question-relevant source passages by default in chat and figure interpretation, without automatic full-document summaries. Starting a figure conversation alone does not summarize the PDF.
- Opt in to full-document batch summaries under Settings → Feature settings → AI chat → Linked PDF long text. Figure interpretation shares this setting; enabled batches fill the model input budget more efficiently.
- Requests with no output for an extended period end with a visible notice, and stopping a request clears the loading state. Check answers against the PDF; provider latency and quality vary.

## 0.6.2 — 2026-09-24

- 自动更新提示和手动检查更新窗口显示 GitHub 最新正式版的更新要点；Release 正文从本版起使用固定的中英文 Markdown 栏目，旧版说明仍可回退读取。更新内容获取失败时仍可查看版本和下载入口。
- 「对照翻译」归入统一阅读操作，窄窗口下进入「•••」菜单；运行时图标显示进度，阅读器侧栏遵循 Zotero 原生侧栏的收起与重新展开状态。
- 不新增设置或数据迁移；继续使用现有 PDF 排版引擎，Windows x64 离线引擎包仍见 v0.6.0 附件。GitHub 发布不会自动更新官网安装清单。
- The automatic update prompt and manual update check show highlights from the latest GitHub Release. Release bodies use fixed bilingual Markdown sections from this version onward, with a fallback for older notes.
- Parallel translation joins the reading actions menu when space is tight; the running icon shows progress, and the plugin sidebar follows Zotero's native pane state. Existing settings and the v0.6.0 layout-engine bundle remain compatible.

## 0.6.1 — 2026-09-23

- 移除设置 → 功能配置底部的“查看待恢复 AI 请求”按钮及专用结果面板，清理关联样式；任务与聊天内部的恢复机制不变。
- 不增加配置项或数据迁移；已有 AI 服务、字号、历史与版面解析引擎可继续使用。引擎离线包继续使用 v0.6.0 附件。
- Remove the “Show pending AI requests” button and its dedicated panel from feature settings; task and chat recovery remain unchanged. Existing settings, history and the v0.6.0 layout-engine bundle remain compatible.

## 0.6.0 — 2026-09-23

## 本次更新

v0.6.0 相比 v0.5.1，重点新增 **PDF 对照与原位翻译**：保留论文版面阅读译文，边生成边查看，失败后保留已有成果并继续补译。同时改进翻译请求调度、长文处理和设置体验。

### PDF 对照阅读与导出

- 从 PDF 阅读操作进入「对照翻译」，并排查看原文和译文；可切换为整页译文，也可打开独立窗口用于多屏阅读。
- 支持连续滚动、同步/解除同步滚动，方便按自己的节奏对照核读。
- 「保存译文」导出仅译文 PDF，「保存对照」导出原文与译文对照 PDF；不会覆盖原附件。
- 新功能与原有侧栏段落翻译并存，可根据阅读习惯选择。

### 精简、完整与部分成果

- 默认「精简」：翻译正文、图表说明和学术脚注，出版信息与参考文献保留原文；「完整」翻译所有可译文字。
- 整理文段并聚合请求，减少碎片化翻译；完成内容逐步显示，不必等待全文结束。
- 部分段落失败时，已完成成果仍可阅读和导出；点击「补译未完成部分」复用已完成片段。
- 改进临时网络错误、限流、模型输出不完整和版面处理异常的恢复提示。重试和补译可能继续产生服务费用，不代表原请求一定未计费。

### 翻译与设置体验

- 全文翻译新增「请求与速度（高级）」：按服务地址设置并发、每分钟 HTTP 请求数和 PDF 每批原文 token，并查看在途及排队状态。多个翻译入口共享相应服务额度。
- OCR 与 PDF 排版引擎集中到「外置依赖配置」，功能设置提供跳转入口。
- 「界面字号」改为滑块：80%–200%、1% 微调，显示当前百分比，拖动即时生效，可恢复 100%；工作台与原生设置共用偏好。
- 改进长文提取、翻译成果读取与文件处理，减少重复工作；保留已有设置及历史。

## 操作与配置

### 1. 安装与升级

下载本页 `jadense-in-zotero-v0.6.0.xpi`，在 Zotero「工具 → 插件 → 齿轮 → 从文件安装插件」选择它，安装后重启 Zotero。

GitHub v0.5.1 用户可直接覆盖安装；相同 `.cn` 插件身份保留设置及本地历史。不要删除 Zotero profile。仍使用 `jadense-in-zotero@jadense.com` 的旧版用户，先禁用旧插件再安装，避免两套插件同时启用。GitHub Release 与官网自动更新渠道独立；未收到更新时请手动安装。

### 2. 选择翻译服务、模型与范围

1. **BYOK**：在「设置 → BYOK」添加服务商，填写 API Key、Base URL、协议与模型 ID；不需要攻玉账号。也可在「设置 → 连接攻玉」保存插件令牌，使用账号可用模型。
2. 在「设置 → 功能配置 → 全文翻译」选择翻译接口、AI 模型和精简/完整范围；目标语言按翻译入口选择。选文翻译与全文翻译独立配置。
3. 检查模型输出上限及服务商额度。首次建议保持默认速度，用较短的文字版 PDF 验证；遇到限流时降低并发或 HTTP 请求/分钟，不要同时启动大量任务。
4. 若需调整，展开「请求与速度（高级）」并保存：并发数为 1–8；RPM 包含检查和恢复请求。新速度用于尚未发送的请求，单批原文容量用于新任务。Bing/Google 网页翻译保持串行。

模型 Key 只填自己的服务商凭据，不要使用文档示例。翻译会将所需文字发送到选定服务；本机排版不代表 AI 离线运行。

### 3. 安装 PDF 版面解析引擎

普通问答、选文翻译及文字层 Markdown 提取不需要排版引擎；对照翻译需要它。**排版引擎与 OCR 独立**。

**自动安装**：在「设置 → 外置依赖配置 → 版面解析引擎」点击「准备 PDF 翻译引擎」，等待“已就绪”。也可从「功能配置 → 全文翻译 → 外置依赖」跳转。此版本自动准备使用随插件的安装器，下载独立 Python 3.12、锁定依赖、模型和字体，无需预装 Python；需能访问相关下载站。

**手动离线安装（Windows x64）**：下载本 Release 的 `jadense-pdf-engine-0.6.4-1-windows-x64.zip`，点击「导入离线包」选择 ZIP，无需解压、管理员权限或预装 Python/uv。可以在另一台电脑下载后复制过来。插件按固定 SHA-256 校验，在临时目录检测模型及 PDF 渲染，通过后替换引擎，保留任务成果及原 PDF。

- 包大小：462102143 字节（约 441 MiB）；建议至少预留 3 GiB。
- SHA-256：`b9b160f727f3bb962df8011a14131250c20753f64faac1793e902dbf6b6cf887`。
- 完整 ZIP 的自动下载开关在本版本仍未开启；自动准备与离线导入是两条不同安装路径。

**库内备用安装**：使用仓库 `content/pdf-translation/` 内的安装器、锁文件和适配器，按指南手动安装后点击「检测已安装引擎」。此备用源是安装源码，仍需联网下载依赖和资产，不是另一份模型镜像。请勿混用不同插件版本的文件。

检测不下载、不调用翻译服务；缺少模型或字体时使用「修复引擎」或重新导入匹配的离线包。不要关闭哈希校验或自行创建就绪标记。

详细步骤：[中文安装指南](https://github.com/jadense-ai/jadense-in-zotero/blob/main/docs/pdf-engine.md) · [English setup](https://github.com/jadense-ai/jadense-in-zotero/blob/main/docs/pdf-engine.en.md) · [操作指南](https://github.com/jadense-ai/jadense-in-zotero/blob/main/docs/usage-guide.md#pdf-translation-060)。

### 4. 开始对照翻译

打开文字版 PDF → 阅读操作「对照翻译」→ 选择目标语言和范围 → 等待译文逐步显示。可随时核对原文；部分完成时使用「保存译文 / 保存对照」，失败后再点「补译未完成部分」。更换范围仅影响新任务，旧历史不会自动重译。

扫描页保持原文；安装 PDF 引擎不会自动开启扫描 OCR。需要识别扫描文字时，请单独配置本机/云 OCR，并使用相应的原文提取与段落翻译流程。公式、表格和复杂版面应人工核对。

## 升级与兼容

- Manifest 声明支持 Zotero 8.0–10.0.*；实测范围见下方验收记录。
- Windows x64 提供完整引擎离线包；macOS、Linux、Windows ARM64 暂无本次验证的完整包，手动安装路径不等于已完成对应平台验收。
- 新版可复用兼容的历史成果；旧版未完成任务可能按新的分片策略重新开始，界面会提示，旧缓存仍保留。
- 原件和文献资料库不会因导出译文而被替换；翻译质量与网络可用性取决于所选模型/服务。真实付费 Provider、其他操作系统与 Zotero 8/9 不在本次实测范围。

## 验证与下载

- 使用标签 CI 原始 XPI，在 **Windows 11 build 26200 / Zotero 10.0.3** 验证三次冷启动、v0.5.1 原地升级、后台解析、中英文设置、窄窗与深浅色、150% 字号及重启保存。
- PDF 专项通过真实离线引擎导入、离线健康检查、真实排版、逐步成果、模拟 AI 批处理与共享限流、部分失败后仅补缺、同步滚动、原位切换、多屏往返、缓存与冷重启复用。翻译服务为合成回复，不代表真实模型译质。文件选择器初始化和导出流程已验证，人工确认保存对话框未端到端点击。
- 完整 PDF 专项首次在等待最新成果版本时超时，同一原包复验通过；原升级脚本的旧工具栏宽度/菜单断言已按新增入口修正，页码命中与遮挡检查保留。
- 1002 项 TypeScript 测试、Python 测试 37 项通过（1 项需显式资产路径的端到端用例跳过）、lint、类型检查、构建及制品校验通过；[发布 PR #25](https://github.com/jadense-ai/jadense-in-zotero/pull/25)、main 与[标签 CI](https://github.com/jadense-ai/jadense-in-zotero/actions/runs/35823684830)通过。
- XPI：4291117 字节；SHA-256：`e1ebc1b3b88cbef8f04c63ef37df2981e2f36444aa61abe933e658da15c9292d`。用附件 `SHA256SUMS` 核验 XPI；引擎 ZIP 使用同名 `.sha256` 文件。
- 附件包括 XPI、元数据、XPI 校验和、Windows x64 完整引擎 ZIP 与校验和、排版适配器/安装器源码包。其他平台、Zotero 8/9、真实云 OCR 与付费 Provider 未在本次验收。

---

### English

v0.6.0 adds layout-preserving parallel/in-place PDF translation, full-width and multi-screen reading, synchronized scrolling, and translated-only/bilingual PDF export. Concise mode translates body text, captions and academic footnotes while preserving publication details and references; Full mode translates all eligible prose. Results appear progressively. Partial output stays readable/exportable, and **Translate remaining passages** reuses completed segments.

Configure a provider under **Settings → BYOK**, or connect Jadense with a plugin token. Choose your translation service/model and scope under **Feature settings → Full translation**. Advanced request settings control concurrency (1–8), HTTP requests/minute and source tokens per PDF batch. Limits are shared by translation tools using the same service; Bing/Google remain serial. Retries may incur further charges.

Prepare the layout engine under **External dependencies → Layout parsing engine**. Automatic setup downloads isolated Python, locked dependencies, models and fonts. For Windows x64, import this release's complete engine ZIP without extracting it; preinstalled Python/uv and administrator access are not required. The full-bundle automatic-download switch is not enabled in this version. Repository-source manual installation still requires network downloads. See the [English installation guide](https://github.com/jadense-ai/jadense-in-zotero/blob/main/docs/pdf-engine.en.md).

The interface font setting is now an 80%–200% slider with 1% steps and an instant reset to 100%. Upgrade from v0.5.1 by installing the XPI and restarting Zotero; settings/history are retained. Do not enable the old `.com` plugin alongside the current `.cn` identity. Website automatic updates are maintained separately.

Scanned pages remain original; OCR is separate. Proofread formulas, tables and layout against the source. Windows x64 is the validated engine platform; other operating systems, Zotero 8/9 and live paid providers are not covered by this release's validation.


## 0.5.1 — 2026-09-22

- 新增可选云 OCR：MinerU、智谱 GLM-OCR、硅基流动、阿里百炼和 OpenAI 兼容服务；使用前配置密钥、模型和 HTTPS 地址，并确认文档上传及费用。普通文字层提取仍无需 OCR。
- 选文翻译和全文翻译独立配置；旧设置自动迁移，不覆盖已有独立设置。工作台与 Zotero 原生设置按任务分组，OCR 用途与引擎配置分开。
- 改进 Markdown、提取结果和更新弹窗显示。
- Optional cloud OCR supports MinerU, GLM-OCR, SiliconFlow, Alibaba Bailian and OpenAI-compatible services. Configure credentials/model/HTTPS endpoint and confirm upload and billing before use; ordinary text-layer extraction needs no OCR.
- Selection and full-document translation have separate settings. Existing settings migrate without overwriting independent preferences; workbench and native preferences group controls by task.
- Improve Markdown, extraction results and update-dialog presentation.
- 从 0.5.0 安装升级后重启；已有成果不会自动重算。Restart after upgrading from 0.5.0; existing results are not regenerated.
- [操作与配置 / Setup](docs/usage-guide.md#settings-051)。真实云服务、OCR 准确率、其他系统及 Zotero 8/9 尚未实测 / Live providers, OCR accuracy, other operating systems and Zotero 8/9 are not validated.

## 0.5.0 — 2026-09-21

## 本次更新

v0.5.0 相对 v0.4.10，新增文献分类和对话文件附件，让长 PDF 问答能按模型容量准备正文，并把全文任务的 OCR 改为按需使用。参考文献的原文、检索候选和选择状态也更清楚，便于导入前核对。

### 1. 独立文献分类窗口：先预览，再应用

- 在 Zotero 文献列表选择条目，右键「文献分类…」打开独立窗口，不必先打开对话工作台。
- 从当前文库选择候选分类目录，生成推荐后逐项核对，再应用到资料库；生成推荐本身不会修改条目，支持撤销本次归类。
- 分类独立使用 TypeSafe 的 Jev 服务，只发送所选文献的标题、摘要、标签和候选目录信息，不发送 PDF。需单独配置 TypeSafe API Key，不跟随对话模型或攻玉连接。
- 请求失败会停止后续请求，已完成的预览仍可查看；应用前会重新检查条目与目录状态，避免把过期预览写入资料库。

### 2. 对话可附文件：从论文扩展到研究材料

- 可在对话中添加 PDF、Word DOCX、HTML、Markdown 和常用文本文件，包括 CSV、TSV、JSON、BibTeX、TeX、XML、YAML、RIS；PNG/JPEG 图片入口继续可用。
- 文字在本机提取，附件信息与提取文字随本地对话保存，后续问题可继续使用相应上下文。
- 单个上传文件最大 **20 MB**，最多保留前 **60,000 字符**，超出或无可提取文字会提示。DOCX 只提取正文，不含嵌入图片、批注、页眉页脚；旧 `.doc` 请先另存为 `.docx`。
- 上传文件与关联 Zotero PDF 是两个入口。需要完整长文阅读时，请关联 Zotero PDF；上传附件仍受上述提取上限约束。

### 3. 关联长 PDF：分层阅读与页码来源

- 关联 Zotero PDF 后，在本机缓存可提取正文；短文直接准备上下文，长文按模型容量分块概括，并根据问题召回相关原文。
- 显示阅读进度、缺页提示与页码来源；追问可复用已保存的正文和概括，避免每次从头准备。
- 模型窗口、历史消息与图片共同影响本次可用上下文。分块概括和回答可能产生多次模型请求及费用，不等于一次请求读取全部原文。
- 扫描页无文字层时仍需 OCR；缺页、提取或缓存问题会提示。模型回答和页码引用仍应回到原文核对。

### 4. 全文任务默认文字层，OCR 按需开启

- 全文 Markdown、全文翻译和参考文献提取默认读取 PDF 文字层，不再要求先安装 Python、OCR 依赖和模型。
- 原文提取工具栏可为本次提取选择「不使用 OCR / 使用 OCR」；OCR 需先配置就绪。扫描文献可在「设置 → OCR配置」启用全文 OCR 增强。
- OCR 失败时尝试文字层，并保留不可读页提示；完善准备等待、取消与重试处理，避免准备状态妨碍普通阅读。
- 首次全文翻译增加积分消耗与稳定性提示，取消发生在提取和翻译请求之前；确认记录保存在当前 profile。建议先选中需要精读的段落翻译。

### 5. 参考文献更容易核对

- 修复独立年份行、跨行年份被误拆成新引用或序号的问题。
- 将「原文引用」和「检索结果」分开展示，选择框放在行首；缩短长作者列表的显示，导入使用的完整元数据仍保留。
- 优先采用精确匹配；无精确匹配时选用首条有效检索候选并显示「已选首条」。**这不是准确匹配的保证**，请核对题名、作者和年份后再导入。
- 编辑原始引用会清除旧候选，重新核验后再导入；导入仍需用户主动操作。

### 6. 阅读侧栏与本机诊断

- 改进侧栏首次加载、失效后的恢复、成果读取重试，以及阅读器重开时的初始化。
- 扩充本机生命周期与 OCR 诊断信息，便于区分界面挂载、资料读取和依赖准备问题；可从工具菜单或「帮助 → 错误诊断」查看、导出。
- 诊断保存在本机，导出后请检查内容再主动分享；没有自动上传诊断。

## 操作与配置

1. **分类**：在工作台「设置 → 功能配置」保存 TypeSafe API Key，再从 Zotero 文献右键菜单进入「文献分类…」，选择候选目录、生成预览、核对并应用。测试密钥会发送示例请求，可能消耗服务额度。
2. **文件问答**：在对话输入区添加文件；长论文优先使用「关联文件」选择 Zotero PDF。检查提取范围与缺页提示后提问。
3. **OCR**：普通文字层任务可直接开始。只有需要识别扫描页时才准备 OCR 依赖和模型，首次安装需要联网和数 GB 磁盘空间。
4. **AI 服务**：对话、解析和翻译继续使用各自配置的攻玉或 BYOK 服务；分类密钥独立配置。本地保存历史不代表离线 AI，准备好的上下文会发送到所选服务。

详细步骤见[使用指南](https://github.com/jadense-ai/jadense-in-zotero/blob/main/docs/usage-guide.md#unreleased-050)及[本机 OCR 指南](https://github.com/jadense-ai/jadense-in-zotero/blob/main/docs/local-ocr.md)。

## 升级与兼容

- 从 GitHub 0.4.0–0.4.10 使用相同 `.cn` 插件身份安装升级，保留现有设置与本地历史；建议安装后重启 Zotero。旧译文与已经拆分的参考文献不会自动重新生成，需要时主动重新提取或翻译。
- 旧 `.com` 身份安装应先禁用旧插件，再手动安装本包，不要同时启用两个身份。
- Manifest 声明支持 **Zotero 8.0–10.0.***；PDF 图片自动识别仍需 Zotero 10.0.1+ 的兼容阅读器。声明范围不等于各版本均已实测。
- 此次发布仅更新 GitHub Release，不推进官网更新清单；若 Zotero 自动更新没有出现本版，请手动安装 XPI。
- 继续遵守项目非商业使用许可证；模型、分类与翻译费用按所选服务规则计算。

## English

Compared with v0.4.10, v0.5.0 adds a standalone paper-classification window, document attachments in Chat, layered reading of linked long PDFs and optional OCR for full-document tasks.

- **Classify papers with a preview:** select Zotero items, open Paper classification from the context menu, choose candidate collections, review recommendations and apply. Undo is available. Configure a separate TypeSafe API key in Settings → Feature configuration. Classification uses Jev and sends titles, abstracts, tags and candidate collections, not PDFs. Key testing and recommendations may incur service charges.
- **Attach research files:** PDF, DOCX, HTML, Markdown and common text formats are supported. Uploaded files are limited to 20 MB and the first 60,000 extracted characters. DOCX extracts body text only; convert legacy DOC files first. Extracted text is stored locally with the conversation and used as model context.
- **Read linked long PDFs:** link a Zotero PDF to cache its extractable text, prepare chunked summaries within model limits and retrieve relevant source passages for questions. Progress, missing-page notices and page references help you check coverage. Follow-ups reuse saved text and summaries. This differs from uploaded files, whose extraction limits remain in place. Long-document preparation can require multiple billed requests; verify answers against the original.
- **Use OCR when needed:** full Markdown, translation and reference extraction default to the PDF text layer without Python. Choose configured OCR in the extraction toolbar or enable it in OCR settings for scanned pages. Failed OCR falls back to the text layer with unreadable-page warnings. The first full translation asks you to acknowledge cost and stability considerations; canceling starts no request.
- **Review reference candidates clearly:** standalone year lines remain with their citation. Original citations and search results are labeled separately. Exact matches take priority; otherwise “First result selected” identifies the fallback candidate and does not guarantee a correct match. Review before importing. Editing the citation clears its previous candidate.
- **Recover reading sessions:** improve sidebar initialization/recovery, saved-result retries, OCR cancellation/waiting and local diagnostics. Diagnostics are not automatically uploaded.

Upgrade over GitHub 0.4.0–0.4.10 using the same `.cn` plugin ID; existing settings and local history remain. Restart Zotero after installation. Existing translations and reference extractions are not regenerated automatically. Disable the legacy `.com` add-on before installing this identity. The manifest supports Zotero 8.0–10.0.*; automatic figure detection requires a compatible Zotero 10.0.1+ reader. GitHub publishing does not update the website's automatic-update channel. Local storage does not mean offline AI: selected context is sent to the configured service. The non-commercial license remains in effect.


## 验证与下载

- 发布 PR：[#21](https://github.com/jadense-ai/jadense-in-zotero/pull/21)。PR、main 与 [v0.5.0 标签 CI](https://github.com/jadense-ai/jadense-in-zotero/actions/runs/35561916138) 均通过：880 项单元测试、6 项发布边界测试、lint、类型检查、构建与制品验证。
- 从草稿下载的同一 XPI 在 **Windows 11 Pro x64 build 26200 / Zotero 10.0.3** 完成三次冷启动；分类、文件附件、81 页长 PDF 与冷重启缓存复用、v0.4.10 原位升级及后台解析、侧栏恢复、诊断、中英文外观共 **107 项专项检查**通过。
- 原生测试使用隔离 profile、合成文献与模拟服务。旧综合脚本仍等待已取消的“解析自动打开工作台”，在该步骤超时，**未全程通过**；后台解析的当前行为已由专项验证。首次完整 OCR 下载与识别、完整全文翻译链路、真实 TypeSafe/模型/翻译服务、macOS/Linux 和 Zotero 8/9 未在本次发布实测。
- 下载 **`jadense-in-zotero-v0.5.0.xpi`**，在 Zotero「工具 → 插件 → 齿轮 → 从文件安装插件」中安装，完成后重启。`Source code` 压缩包不是插件安装包。
- 附件包含 XPI、`release-metadata.json`、`SHA256SUMS`。XPI 大小 **3,219,781 bytes**，SHA-256：

```text
fd743ff4cab1ab30fe89a7268f5d367e11dc19e9d8a43527be24fdf831272705
```

Validation: PR/main/tag CI passed (880 unit tests, six release-boundary tests, lint, typecheck and build). The exact draft XPI passed three cold starts and 107 targeted checks on Windows 11 Pro x64 build 26200 / Zotero 10.0.3, including an in-process upgrade from v0.4.10. Tests use synthetic data and mocked services. The legacy combined smoke timed out waiting for the removed automatic Manager opening and did not complete; current background-analysis behavior passed its targeted test. First-time complete OCR setup/recognition, the complete full-translation flow, real providers, macOS/Linux and Zotero 8/9 were not validated for this release. Download the XPI asset, install it from Zotero's Plugins menu and restart.


## 0.4.10 — 2026-09-19

### 简体中文

- OCR 准备显示阶段、文件/批次、下载量、平均速度与等待时间；为环境检查、依赖安装和模型验证增加有界等待，复用已就绪缓存。
- 新增依赖删除与重新安装，默认保留模型，可选择同时删除模型；已保存文献成果、PDF、日志及用户自行安装的 Python/uv 保留。
- 扩展 [OCR 安装指南](docs/local-ocr.md)：设置操作、Windows/Linux/macOS 分环境手动安装、锁定依赖、模型验证与排障；中英文 README 增加独立入口。
- 验证：766 项单元测试及 CI 通过；Windows 11 / Zotero 10.0.3 的标签原包通过三次冷启动、后台解析专项及从 v0.4.9 原地升级。旧综合脚本期待已取消的自动打开工作台，完整翻译专项缺少 OCR 就绪环境，英文选文 12px 布局断言在本版与 v0.4.9 均未通过。首次完整 OCR、其他平台及真实服务未验收，详见 [Release](https://github.com/jadense-ai/jadense-in-zotero/releases/tag/v0.4.10)。

### English

- Show OCR setup stages, files/batches, download size, average speed and elapsed time; bound environment checks, dependency installation and model verification, and reuse confirmed caches.
- Add dependency removal and reinstallation, retaining models by default with optional model removal; keep saved results, PDFs, logs and user-installed Python/uv.
- Expand the [OCR guide (Chinese)](docs/local-ocr.md) with settings, separate Windows/Linux/macOS manual steps, locked dependencies, model checks and troubleshooting; add dedicated sections to both READMEs.
- Validation: 766 unit tests and CI passed. The tag-built XPI passed three cold starts, background-analysis checks and in-process upgrade from v0.4.9 on Windows 11 / Zotero 10.0.3. Legacy combined checks expect the removed automatic Manager opening; full translation lacked a ready OCR environment; the English selection popup 12px layout assertion failed on both this version and v0.4.9. First-time full OCR setup, other platforms and real providers remain unverified. See the [Release](https://github.com/jadense-ai/jadense-in-zotero/releases/tag/v0.4.10).

## 0.4.9 — 2026-09-18

### 简体中文

- 全文翻译正确处理流式结束，保留已完成进度；模型配置变化、积分不足和中断提供明确提示与手动继续入口。
- OCR 配置使用「启用本机 OCR / 继续准备」统一完成依赖、模型和离线验证，自动读取状态并复用已有缓存；支持魔搭 ModelScope 下载源。
- 新增本机错误诊断的筛选、复制、导出与清空；改进解析任务状态和文献成果提示。
- 验证：756 项单元测试、6 项发布边界测试、文档检查、lint、类型检查、XPI 构建与制品校验通过。当前发布环境未安装 Zotero，未重新执行原生冷启动/升级冒烟；真实服务商、macOS/Linux 与完整首次模型下载仍未实测。

### English

- Handle full-document stream completion, preserve completed progress, and show actionable notices for configuration changes, insufficient points and interruptions, with manual resume.
- Prepare OCR dependencies, models and offline verification through Enable local OCR / Continue setup; read readiness automatically, reuse existing caches and support ModelScope downloads.
- Add local diagnostic filtering, copy, export and clear actions; improve analysis task state and document-result notices.
- Validation: 756 unit tests, 6 release-boundary tests, documentation checks, lint, typecheck, XPI build and artifact verification passed. Zotero was not installed in the release environment, so native cold-start/upgrade smoke checks were not rerun; real providers, macOS/Linux and a complete first-time model download remain untested.

## 0.4.8 — 2026-09-14

### 简体中文

- 新增默认关闭的「OCR增强选中文本内容提取」。在「设置 → 功能配置 → 选中文本」开启后，引用或翻译前在本机识别选区文字和公式；失败时提示并沿用原选文。
- 默认文字层提取改善段落换行、跨行断词、连字和上下标；复杂公式仍需对照原 PDF。
- 选文浮窗记住位置与大小，可跟随选文；支持等待、自动翻译或引用到新侧栏对话，引用仅创建草稿。
- OCR 模型支持可选第三方 HF-Mirror 下载源；新增正式版更新提示。
- 安装后重启 Zotero，保留已有设置和历史。首次使用选文 OCR 需要准备本机依赖和模型。

### English

- Add opt-in local OCR before quoting or translating selected text, including formulas. Enable it under Settings → Feature configuration → Selected text. Failed recognition falls back to the original selection with a notice.
- Improve text-layer extraction of paragraphs, line-end hyphenation, ligatures and superscripts/subscripts. Check complex formulas against the PDF.
- Remember selection window geometry, optionally follow selections, translate automatically or quote into a new sidebar draft without sending.
- Add an optional third-party HF-Mirror model download source and stable-release update notices.
- Restart Zotero after installation. Existing settings and history are retained; first-time selection OCR requires local dependencies and models.

## 0.4.7 — 2026-09-13

### 简体中文

- 修复解析历史详情与设置页面混杂的问题；切换到对话、攻玉学术和指南时也会正确隐藏旧页面。
- 返回解析历史时保留原有详情，已有设置和历史无需迁移。安装 0.4.7 后重启 Zotero。

### English

- Fix analysis details remaining visible behind Settings, Chat, Jadense academic, or the guide.
- Preserve the selected details when returning to analysis history. Existing settings and history require no migration. Install 0.4.7 and restart Zotero.

## 0.4.6 — 2026-09-13

### 简体中文

- 新增逐条编辑和删除参考文献。编辑后可重新核验；删除仅移除解析结果中的引用记录。
- 去掉引用正文开头的文献序号，序号仍在列表侧边显示；原 PDF 定位保持可用。
- 已有参考文献记录在打开时清理版式换行和开头序号，改善显示与检索。

安装 0.4.6 后重启 Zotero，可保留已有设置与历史。参考文献匹配结果仍需结合原文核对。

### English

- Edit or delete individual references, then verify edited citations again. Deleting a reference removes only its analysis record.
- Remove leading citation numbers from reference text while retaining the list numbering and PDF source navigation.
- Normalize layout line breaks and leading numbers when opening saved reference records.

Install 0.4.6 and restart Zotero. Existing settings and history are retained.

## 0.4.5 — 2026-09-13

### 简体中文

- 新增独立 OCR 配置入口，改善首次安装、模型准备及启动提示。
- 清理新提取参考文献的版式换行，恢复底部全选框，并优化工作台与阅读布局。

### English

- Add dedicated OCR settings and improve first-time installation and startup feedback.
- Normalize layout line breaks in newly extracted references, restore the bottom select-all checkbox, and refine reading layouts.


## 0.4.4 — 2026-09-13

### 简体中文

- 新增按文献与附件组织的成果工作区，统一浏览原文、译文、选中翻译和解析历史。
- 新增 Bing/Google 传统翻译和本机 OCR；全文翻译先识别完整 PDF，公式保留本机原图。首次安装需下载环境与模型。
- 新增快速开始、图文指南与 FAQ。0.4.4 起采用非商业许可，历史 MIT 授权和第三方许可继续保留。

- 优化工作台顶部导航与聊天模型选择，让对话、翻译历史、文献解析和连接设置之间的切换更清晰；可继续跟随攻玉账号默认模型，也可为当前对话明确选择模型。
- 提升全文翻译在跨章节、长段落和不同上下文容量下的稳定性：只在请求内部拆分超长内容，阅读与定位仍对应完整原文段落，已有译文可继续恢复。
- 优化阅读工作区与管理界面的响应式布局、提示和上手引导，保留选文工具条的完整文字与宿主内容宽度适配。

从 GitHub 0.4.3 可直接安装更新，保留设置和历史；旧 .com 身份需先禁用再安装。攻玉 AI 需要服务端临时执行 V1 协议，旧服务端会提示升级；本客户端发布不代表生产服务已部署。BYOK 独立可用。GitHub 发布不推进官网自动更新。

### English

- Group original text, translations and analysis history by paper and attachment.
- Add Bing/Google translation and local OCR before full translation; formulas remain local images. First setup downloads the runtime and models.
- Add onboarding, illustrated guides and FAQ. Version 0.4.4 adopts the non-commercial license; prior MIT grants and third-party licenses remain intact.

- Clarify the workbench navigation and chat model selection, making it easier to move between Chat, translation history, literature analysis, and connection settings. Chat can still follow the Jadense account default or use an explicit model for the current conversation.
- Improve full-translation stability across sections, long paragraphs, and different context capacities: oversized content is split only inside requests, while reading and source navigation continue to correspond to complete original paragraphs and completed translations remain recoverable.
- Refine responsive layouts, notices, and the getting-started guide across the reader workspace and Manager while preserving full selection-toolbar labels and host-width containment.

Install over GitHub 0.4.3 to retain settings and history. Disable legacy .com builds first. Jadense AI requires the temporary-execution V1 server protocol; older servers show an upgrade message. This client release does not establish production server readiness. BYOK remains independent. Website automatic updates are unchanged.

最终验收与制品校验 / Validation and checksums: [v0.4.4 Release](https://github.com/jadense-ai/jadense-in-zotero/releases/tag/v0.4.4).


## 0.4.3 — 2026-09-11

### 简体中文

- 全文译文以连续文档呈现在阅读器侧栏，提供目录、阅读/定位模式、独立字号与行距、阅读位置恢复，并支持独立 PDF 窗口。
- 优化跨页完整段落提取与翻译批次，改善换行和页边编号干扰；旧译文保留，回看不会自动重新翻译。
- 文献解析新增论文详情，将总结、笔记与参考文献放在同一处，保留搜索、筛选和导入选择。
- 参考文献批量 AI 默认关闭，支持明确开启、暂停和继续；业务拒绝后停止后续批次。
- 攻玉请求支持持久请求身份与结果恢复；BYOK 保留本地完成结果，不自动重发未确认请求。修复大字号选文工具栏溢出。

从 GitHub 0.4.2 可直接安装更新，保留设置和历史；旧 .com 身份需先禁用再安装。攻玉 AI 需要服务端临时执行 V1 协议，旧服务端会提示升级；本客户端发布不代表生产服务已部署。BYOK 独立可用。GitHub 发布不推进官网自动更新。

### English

- Read full translations as a continuous document in the reader sidebar, with a table of contents, Reading/Locate modes, independent typography, restored position, and detached PDF-window support.
- Improve complete-paragraph extraction and batching across pages, including line breaks and margin-number handling. Existing translations remain readable without automatic regeneration.
- Open paper details with summaries, notes, and references together, retaining search, filters, and import selections.
- Batched reference AI is off by default, with explicit opt-in, pause/resume, and stopping after a business rejection.
- Recover Jadense results using persistent request identities. BYOK keeps completed local results and never automatically resends uncertain requests. Fix selection-toolbar overflow at larger font sizes.

Install over GitHub 0.4.2 to retain settings and history. Disable legacy .com builds first. Jadense AI requires the temporary-execution V1 server protocol; older servers show an upgrade message. This client release does not establish production server readiness. BYOK remains independent. Website automatic updates are unchanged.

Validation and final package checksum: [v0.4.3 Release](https://github.com/jadense-ai/jadense-in-zotero/releases/tag/v0.4.3).

## 0.4.2 — 2026-09-10

[简体中文](#release-042-zh) · [English](#release-042-en)

<a id="release-042-zh"></a>

本次更新将翻译从选文扩展到整篇 PDF，并把参考文献核验、导入与文献解析放在一起。阅读浮窗和字号也可以按习惯调整。

**[下载 0.4.2 插件](https://github.com/jadense-ai/jadense-in-zotero/releases/download/v0.4.2/jadense-in-zotero-v0.4.2.xpi)** · [安装与快速开始](README.md#quick-start)

### 功能与体验

- **可恢复的全文翻译**：从阅读操作选择「全文翻译」，按段阅读、复制译文并跳回原文核对。隐藏浮窗后继续处理；中断或重启后可手动继续，已完成内容保留。全文翻译与实时翻译共用模型配置。
- **参考文献核验与导入**：「解析」同时提取同一 PDF 的参考文献，在「文献解析 → 参考文献」查看原文、核验 DOI 并导入已确认条目。保留引用顺序、编号、重复项及未确认内容；同库 DOI 去重，不覆盖已有文献，不自动下载 PDF。
- **更合适的阅读外观**：「设置 → 常规」新增 12–24px 字号、普通/毛玻璃浮窗及背景透明度。选文与全文浮窗均支持标题拖动和边角缩放，也可从左下角「外观」直接调整。
- **阅读器入口更清楚**：空间不足时，提问、解析、引用与全文翻译收在「•••」菜单内，为 Zotero 页码和批注工具留出空间；点击 Jadense 图标打开工作台。选文翻译使用选区弹出栏的「智能翻译」或 `Ctrl+Alt+T`（macOS：`⌘+Alt+T`），顶部不再放置选文翻译按钮。

### 升级与兼容

从 GitHub 0.4.0 / 0.4.1 可直接从文件安装更新，插件 ID 保持 `jadense-in-zotero@jadense.cn`，保留设置和本地历史。使用旧 `.com` 身份的版本（包括官网 0.3.2）需先禁用旧插件，再安装新版；不要删除 profile 或同时启用两个身份。GitHub 发布不推进官网自动更新清单。

全文翻译需要可提取文字的 PDF，不提供 OCR 或覆盖原版式；重启后不会自动恢复模型请求，需要手动继续。参考文献核验可能因来源信息不足或服务不可用而保留为未确认；只有已验证条目可导入。毛玻璃效果依赖宿主图形能力，不可用时保留普通背景。

已知界面现象：原生截图验收中曾出现窄窗口导航未自动收起，同包复跑恢复正常，根因尚未确认；遇到时可使用侧栏收起按钮。

Manifest 声明 Zotero **8.0–10.0.***；本版原生验收使用 **Windows 11 / Zotero 10.0.2**、隔离 profile、合成资料与模拟服务。其他系统、Zotero 8/9、真实 Provider 翻译品质及实际 Crossref 命中率未实测。最终安装包校验和原生验收结果见 [v0.4.2 Release](https://github.com/jadense-ai/jadense-in-zotero/releases/tag/v0.4.2)。

<a id="release-042-en"></a>

### English

Translate a whole PDF, verify and import its references alongside literature analysis, and adjust the reading panels to your preferences.

**[Download version 0.4.2](https://github.com/jadense-ai/jadense-in-zotero/releases/download/v0.4.2/jadense-in-zotero-v0.4.2.xpi)** · [Installation and quick start](README.en.md#quick-start)

- **Resumable full-document translation**: choose Full translation in the reading actions, read or copy paragraph translations, and navigate to their source. Processing continues while the panel is hidden. After interruption or restart, resume manually while keeping completed parts. It uses the real-time translation model setting.
- **Reference verification and import**: Analyze also extracts references from the same PDF. Inspect sources, verify DOIs, and import confirmed entries under Literature analysis → References. Original order, numbering, duplicates, and unconfirmed text are retained. Import deduplicates by DOI within the same library without overwriting existing items or downloading PDFs.
- **Adjustable reading appearance**: General settings now offer a 12–24px font, standard or frosted-glass panels, and background transparency. Drag either translation panel by its title and resize its edges or corners; the bottom-left Appearance menu offers the same style controls.
- **Clearer reader actions**: when space is limited, Ask, Analyze, Quote, and Full translation appear under the ••• menu. The Jadense icon opens the workbench. Translate selected text from the selection popup's AI translation action or `Ctrl+Alt+T` (`⌘+Alt+T` on macOS); the top toolbar no longer has a selection-translation button.

Install the XPI over GitHub 0.4.0 or 0.4.1 to keep settings and local history under the same `.cn` plugin ID. Disable older `.com` ID builds, including website 0.3.2, before installing; do not delete your profile or enable both identities. GitHub releases do not update the website's automatic update manifest.

Full translation requires extractable PDF text, provides no OCR or original-layout overlay, and resumes only on request after restart. Incomplete source information or unavailable services can leave references unverified; only verified entries can be imported. Frosted glass depends on host graphics support and falls back to a standard background.

Known UI behavior: a native screenshot run intermittently failed to collapse navigation in a narrow window; the same package passed on rerun, and the cause remains unconfirmed. Use the sidebar collapse button if needed.

The manifest declares Zotero **8.0–10.0.***. Native validation uses **Windows 11 / Zotero 10.0.2**, isolated profiles, synthetic documents, and mocked services. Other platforms, Zotero 8/9, real-provider translation quality, and real Crossref matching accuracy were not tested. See the [v0.4.2 release](https://github.com/jadense-ai/jadense-in-zotero/releases/tag/v0.4.2) for final artifact checksums and validation results.

## 0.4.1 — 2026-09-09

[简体中文](#release-041-zh) · [English](#release-041-en)

<a id="release-041-zh"></a>

本次更新让插件更贴合你的阅读习惯：选择熟悉的界面语言，在深浅主题间切换，并集中查看攻玉账号与积分信息。

**[下载 0.4.1 插件](https://github.com/jadense-ai/jadense-in-zotero/releases/download/v0.4.1/jadense-in-zotero-v0.4.1.xpi)** · [安装与快速开始](README.md#quick-start)

### 功能与体验

- **中英文界面更完整**：工作台、阅读器工具、上手指南、设置、菜单和动态提示支持简体中文与 English，让日常阅读与配置更顺手。
- **新增「常规」设置**：在「设置 → 常规」选择跟随 Zotero、简体中文或 English；Zotero 原生插件设置提供相同配置。保存后重启 Zotero 生效，重开工作台不会提前切换。界面语言不会改变翻译方向、AI 输出要求或已有内容。
- **主题随你选择**：跟随 Zotero、浅色、深色三种模式，立即同步已打开的插件界面，保留草稿和进行中的生成。原有主题选择继续生效，侧栏主题按钮也会同步保存当前选择。
- **账号信息更集中**：「你的攻玉」汇总账号、订阅、可用积分与来源，以及签到奖励和连续天数。账号与积分分别加载，单项刷新失败不影响另一项显示。顶部提供攻玉首页、签到页、订阅与用量的网页入口；签到在网页完成后，可刷新查看状态。

### 升级与兼容

从 GitHub v0.4.0 可直接从文件安装更新，保留设置与本地历史，插件 ID 仍为 `jadense-in-zotero@jadense.cn`。官网 0.3.2 及更早旧 `.com` ID 版本需先禁用旧插件再安装，请勿删除 Zotero profile 或同时启用两个身份。GitHub 发布不修改官网自动更新清单。

Manifest 声明兼容 Zotero **8.0 至 10.0.***；自动识图需要 Zotero 10.0.1+ 的兼容 PDF 阅读器。实际验收环境为 **Zotero 10.0.1 / Windows 11 Pro x64（build 26200）**，使用隔离 profile、合成资料和模拟接口。其他系统、Zotero 8/9 及真实付费 Provider 未实测。

<details>
<summary>查看本版验收记录与安装包校验信息</summary>

- 完整 488 项测试、发布边界测试、lint、类型检查及打包校验通过；PR、主分支与标签 CI 均通过。
- 对标签 CI 的同一 XPI 完成三次冷启动、从同 ID 正式版 0.4.0 原位升级及 134 项研究检查，中英文分别通过 12 项外观检查。
- 草稿下载与公开下载的 XPI 哈希一致，三份附件的发布证明及摘要已核验；未重新构建或替换 CI 附件。

XPI：`jadense-in-zotero-v0.4.1.xpi`，**603122 bytes**。Release 同时提供 `release-metadata.json` 和 `SHA256SUMS` 用于核验。

SHA-256：

```text
5f5f9cbc20ef13b6c23c45d11f58e70d0fe48b8a2d93395ecb4a4f6d8b69649d
```

详见 [PR #3](https://github.com/jadense-ai/jadense-in-zotero/pull/3)、[标签 CI](https://github.com/jadense-ai/jadense-in-zotero/actions/runs/34320869610) 和 [v0.4.1 Release](https://github.com/jadense-ai/jadense-in-zotero/releases/tag/v0.4.1)。本记录描述 0.4.1 发布验收；后续文案调整不代表重新执行验收，标签和附件保持不变。

</details>

---

<a id="release-041-en"></a>

### English

Choose the interface language and appearance that suit your reading workflow, with a clearer overview of your Jadense account.

**[Download version 0.4.1](https://github.com/jadense-ai/jadense-in-zotero/releases/download/v0.4.1/jadense-in-zotero-v0.4.1.xpi)** · [Installation and quick start](README.en.md#quick-start)

#### Features and experience

- **More complete Chinese and English support** throughout the workbench, reader tools, guide, settings, menus, and notices makes reading and configuration easier in your preferred language.
- **New General settings** let you follow Zotero’s language or choose Simplified Chinese or English under Settings → General. The native plugin preferences offer the same controls. Restart Zotero to apply language changes; reopening the workbench keeps the current language until then. Translation direction, AI output requirements, and existing content stay intact.
- **Light, dark, or follow Zotero** themes update open plugin interfaces immediately, preserving drafts and active generation. Existing theme choices remain effective, and the sidebar theme button saves its selection to the same setting.
- **Your Jadense brings account information together**: view your account, subscription, available points and their source, check-in rewards, and consecutive days in one place. Account and points information load independently, so a failed refresh of one does not hide the other. Website, check-in, and subscription-and-usage shortcuts appear at the top. Complete check-in on the website and refresh to see the updated status.

#### Upgrade and compatibility

Install over GitHub v0.4.0 from a file to update while keeping settings and local history; the plugin ID remains `jadense-in-zotero@jadense.cn`. For website version 0.3.2 or earlier releases using the old `.com` ID, disable the old plugin before installing. Do not delete your Zotero profile or enable both identities at once. This GitHub release does not change the website’s automatic-update manifest.

The manifest declares compatibility with Zotero **8.0 through 10.0.***. Automatic figure detection requires a compatible PDF reader in Zotero 10.0.1 or later. Release acceptance checks ran on **Zotero 10.0.1 / Windows 11 Pro x64 (build 26200)** using isolated profiles, synthetic materials, and simulated services. Other platforms, Zotero 8/9, and live paid providers were not tested.

<details>
<summary>Release acceptance record and package verification</summary>

- All 488 tests, release-boundary tests, lint, type checking, and package verification passed. PR, main-branch, and tag CI passed.
- The same XPI produced by tag CI passed three cold starts, an in-place upgrade from version 0.4.0 with the same plugin ID, and 134 research checks. Chinese and English each passed 12 appearance checks.
- Draft and public downloads had matching XPI hashes. Release attestations and digests for all three attachments were verified; the CI attachments were not rebuilt or replaced.

XPI: `jadense-in-zotero-v0.4.1.xpi`, **603122 bytes**. The release also provides `release-metadata.json` and `SHA256SUMS` for verification.

SHA-256:

```text
5f5f9cbc20ef13b6c23c45d11f58e70d0fe48b8a2d93395ecb4a4f6d8b69649d
```

See [PR #3](https://github.com/jadense-ai/jadense-in-zotero/pull/3), [tag CI](https://github.com/jadense-ai/jadense-in-zotero/actions/runs/34320869610), and the [v0.4.1 release](https://github.com/jadense-ai/jadense-in-zotero/releases/tag/v0.4.1). This record describes the 0.4.1 acceptance checks. Later text edits do not imply those checks were rerun; the tag and attachments remain unchanged.

</details>

## 0.4.0 — 2026-09-09

[简体中文](#release-040-zh) · [English](#release-040-en)

<a id="release-040-zh"></a>
<a id="release-zh"></a>

**在 Zotero 中读懂论文，把阅读所得变成下一步研究的起点。**

Jadense in Zotero 迎来首个 GitHub 正式发布版本。这个由[攻玉学术（Jadense）](https://jadense.cn/)推出的开源阅读助手，把文献问答、原文批注、选文翻译和图表解读带进 Zotero。你可以自带 API Key 独立使用，也可以连接攻玉账号，两种方式使用同一安装包。

**[下载 0.4.0 插件](https://github.com/jadense-ai/jadense-in-zotero/releases/download/v0.4.0/jadense-in-zotero-v0.4.0.xpi)** · [安装与快速开始](https://github.com/jadense-ai/jadense-in-zotero#quick-start)

客户端以 MIT 开源；模型调用费用由所选服务商或攻玉账号的订阅、积分规则决定。

### 用它开始一次论文阅读

- **把重点留在原文旁**：点击「解析」生成总结、详细笔记和 Zotero 原生批注，便于回到对应段落核对，不覆盖人工批注。
- **带着问题继续读**：关联文献、PDF 或选文，围绕方法、证据和结论继续对话。
- **就地理解难读的段落**：选文翻译支持 32 种语言选项，可调整文章或当前选文的翻译方向，并从历史回到原文页。
- **结合论文背景解读图表**：自动识图或手动截图后，开启新对话或追加追问；也可上传、粘贴或拖入图片。图片随本地对话保存，重开后仍可查看。

这些阅读能力延续自官网 0.3.2。图片解读需要支持图片输入的模型，自动识图需要 Zotero 10.0.1+ 的兼容 PDF 阅读器。

### 相比官网 0.3.2，这次改进了什么？

- **攻玉模型选择更清楚**：受限模型标注「需升级」及所需订阅档位；遇到限制时，提示更换可用模型或升级订阅，减少将模型权限问题误当成积分不足的困惑。充值积分不会解锁受限模型。
- **更新新配置的默认模型**：连接攻玉后，新配置默认使用 DeepSeek V4 Flash Vision（`deepseek-v4-flash-vision-exp`）。已有具体模型、路由和 BYOK 选择会保留；旧版已保存 GLM 的用户可在「设置 → 功能配置」主动更换。
- **统一攻玉连接与插件身份**：正式连接使用 `jadense.cn`，插件身份更新为 `.cn`；BYOK 自定义服务配置保持独立。旧版安装需要按下方步骤手动迁移。
- **便于定位使用问题**：攻玉 AI 请求附带插件版本与功能标识，用于区分对话、图片解读、翻译和解析请求，原有内容处理路径保持不变。
- **提供可核验的开源安装包**：本次 GitHub Release 附 XPI、构建元数据与 SHA-256，既可直接安装，也可检查对应源码。

### 从几篇论文，走向一个研究问题

当你准备比较几篇论文的方法与证据，可以在插件「连接攻玉 → 文献同步」中，将选中文献上传到攻玉收藏夹，再到攻玉网页端的项目中「添加上下文」，选择这些资料继续讨论。

例如：「比较这些论文的研究对象、方法和证据边界，列出还需补充检索的问题，并拟一份综述提纲。」让已经读过的材料，成为下一步研究的起点。

上传为 **Zotero → 攻玉单向操作**，可自行选择是否包含 PDF；插件对话、笔记和批注不会自动同步到网页端。BYOK 阅读功能可继续独立使用。

[在攻玉学术继续研究](https://jadense.cn/) · [项目与资料使用说明](https://jadense.cn/docs/research-resources)

### 安装与旧版迁移

新用户下载上方 `.xpi` 文件，在 Zotero 插件管理器中选择「从文件安装插件」，再打开工作台配置 BYOK 或连接攻玉。详细步骤见 [README](https://github.com/jadense-ai/jadense-in-zotero#quick-start)。

**安装过官网 0.3.2 或更早旧 ID 版本时，先禁用旧 Jadense 插件，再手动安装新版。** 插件 ID 从 `jadense-in-zotero@jadense.com` 改为 `jadense-in-zotero@jadense.cn`，不同身份不会自动覆盖升级，请勿同时启用。

新版沿用原有本地偏好命名空间与历史保存位置，请勿删除 Zotero profile。GitHub 发布不修改官网自动更新清单。

### 兼容性与已知限制

Manifest 声明兼容 Zotero **8.0 至 10.0.***。本次实际验收环境为 **Windows 11 Pro x64（10.0.26200）/ Zotero 10.0.1**，使用临时 profile、合成资料与本机模拟接口；未实测 macOS、Linux、Zotero 8/9 或真实付费 Provider。

连续窗口缩放验收中，出现过一次窄窗口导航未自动收起的超时；同一 XPI、相同测试在新临时 profile 完整复跑通过，根因尚未确认。遇到时可用左上角导航收起按钮。

解析依赖 PDF 可提取正文，扫描件需先 OCR；模型生成的解释与批注请结合原文核对。本地历史不代表离线 AI，模型请求会携带所需上下文，数据路径见 [README](https://github.com/jadense-ai/jadense-in-zotero#数据与凭据)。每条消息可新附一张图片，旧版本未保存的图片无法自动恢复。

<details>
<summary>查看本版验收记录与安装包校验信息</summary>

- 已下载原草稿附件，核对 XPI、元数据、SHA256SUMS 及 GitHub asset digest。
- `smoke:installed --xpi` 三次冷启动通过。
- `smoke:research --xpi --screenshots` 完整 **131 项检查**通过，包含阅读器、图片历史恢复、翻译、解析、BYOK、功能模型及订阅提示；未通过修改测试或重建附件消除上述窗口缩放记录。
- 同 ID 上一正式版升级检查不适用：官网 0.3.2 使用旧 `.com` ID，本版为 `.cn`，需手动迁移。
- 已核对更新说明、安装迁移和三个附件，并由维护者公开。本记录来自 0.4.0 发布验收，文案调整不代表重新执行验收。

XPI：`jadense-in-zotero-v0.4.0.xpi`，**577815 bytes**。

SHA-256：

```text
ba6acbc2f6ee9d73f80462fe50091fb97abd3aa131b72222d01b28efddc17057
```

附件全部来自[同一次标签 CI](https://github.com/jadense-ai/jadense-in-zotero/actions/runs/34272736935)，源码提交为 `49cc4c6951eb38244aa0931116ad657cf3cf8495`。正式版本的标签和附件保持不变，更换制品字节必须升版。

本版包含由 [@jadense-ai](https://github.com/jadense-ai) 贡献的 [PR #1：PR 检查与不可变草稿发布](https://github.com/jadense-ai/jadense-in-zotero/pull/1)和 [PR #2：0.4.0 发布准备](https://github.com/jadense-ai/jadense-in-zotero/pull/2)。这是该账号在本仓库的首次贡献；[完整提交记录](https://github.com/jadense-ai/jadense-in-zotero/commits/v0.4.0)。

</details>

---

<a id="release-040-en"></a>
<a id="release-en"></a>

### English

**Understand papers in Zotero, and turn what you read into the next step of your research.**

This is the first official GitHub release of Jadense in Zotero. This open-source reading assistant from [Jadense (攻玉学术)](https://jadense.cn/) brings paper Q&A, annotations alongside the source text, selected-text translation, and figure interpretation into Zotero. Use your own API key independently, or connect a Jadense account. Both options use the same installation package.

**[Download version 0.4.0](https://github.com/jadense-ai/jadense-in-zotero/releases/download/v0.4.0/jadense-in-zotero-v0.4.0.xpi)** · [Installation and quick start](https://github.com/jadense-ai/jadense-in-zotero/blob/main/README.en.md#quick-start)

The client is open source under the MIT License. Model usage is subject to your chosen provider's fees or your Jadense account's subscription and points rules. In version 0.4.0, the workbench uses mainly Chinese labels; the historical instructions below retain those labels so you can find the controls in that version.

#### Start with a paper

- **Keep the key points beside the source text:** choose 「解析」 (Analyze) to generate a summary, detailed notes, and native Zotero annotations that help you return to the relevant passages. Your manual annotations are preserved.
- **Read with a question in mind:** associate papers, PDFs, or selected passages with a conversation, then ask follow-up questions about methods, evidence, and conclusions.
- **Translate difficult passages where you read them:** choose from 32 language options, set the translation direction for a paper or the current selection, and return to the original page from translation history.
- **Interpret figures with the paper as context:** use automatic figure detection or a manual screenshot, then start a new conversation or continue an existing one. You can also upload, paste, or drop images. Images are saved with the local conversation and remain available when you reopen it.

These reading features carry forward from website version 0.3.2. Figure interpretation requires a model that accepts image input. Automatic figure detection requires a compatible PDF reader in Zotero 10.0.1 or later.

#### What changed since website version 0.3.2?

- **Clearer Jadense model access:** restricted models show 「需升级」 (Upgrade required) and the required subscription tier. If a request is restricted, the message explains how to choose an available model or upgrade, helping distinguish model access from a low points balance. Buying more points does not unlock a restricted model.
- **An updated default for new configurations:** after connecting Jadense, new configurations default to DeepSeek V4 Flash Vision (`deepseek-v4-flash-vision-exp`). Existing explicit model, route, and BYOK selections are preserved. If an older installation has a GLM model saved, you can change it under 「设置 → 功能配置」 (Settings → Feature configuration).
- **Consistent Jadense connection and plugin identity:** the official connection uses `jadense.cn`, and the plugin ID now uses `.cn`. Custom BYOK provider settings remain independent. Existing installations using the old ID require the manual migration below.
- **Easier troubleshooting:** Jadense AI requests include the plugin version and feature identifier to distinguish chat, figure interpretation, translation, and paper analysis. Existing content-processing paths are unchanged.
- **A verifiable open-source package:** this GitHub release includes the XPI, build metadata, and SHA-256 checksums. Install the package directly or inspect the corresponding source code.

#### From a few papers to a research question

When you are ready to compare methods and evidence across papers, open 「连接攻玉 → 文献同步」 (Connect Jadense → Literature sync) in the plugin and upload the selected papers to a Jadense favorites folder. Then open a project in the Jadense web app, choose 「添加上下文」 (Add context), and select those materials to continue the discussion.

For example: “Compare the research subjects, methods, and limits of the evidence in these papers. List questions that need further literature searches, and draft a literature-review outline.” The papers you have read become the starting point for your next step.

Uploads are **one-way, from Zotero to Jadense**, and you choose whether to include PDFs. Plugin conversations, notes, and annotations do not automatically sync to the web app. BYOK reading features remain available independently.

[Continue your research in Jadense](https://jadense.cn/) · [Projects and research materials guide](https://jadense.cn/docs/research-resources)

#### Installation and migration from an older version

New users can download the `.xpi` file above, choose the install-from-file option (「从文件安装插件」) in Zotero's plugin manager, and then open the workbench to configure BYOK or connect Jadense. See the [English quick start](https://github.com/jadense-ai/jadense-in-zotero/blob/main/README.en.md#quick-start) for the full steps.

**If you installed website version 0.3.2 or an earlier release with the old ID, disable the old Jadense plugin before manually installing this version.** The plugin ID changes from `jadense-in-zotero@jadense.com` to `jadense-in-zotero@jadense.cn`. Different IDs do not replace each other during installation; do not enable both at once.

This version retains the existing local preference namespace and history locations. Do not delete your Zotero profile. Publishing on GitHub does not change the website's automatic-update manifest.

#### Compatibility and known limitations

The manifest declares compatibility with Zotero **8.0 through 10.0.***. Release acceptance checks ran on **Windows 11 Pro x64 (10.0.26200) / Zotero 10.0.1**, using temporary profiles, synthetic materials, and local mock endpoints. macOS, Linux, Zotero 8/9, and live paid providers were not tested in this release's acceptance run.

During repeated window-resizing checks, one run timed out because navigation did not automatically collapse in a narrow window. A complete rerun with the same XPI and tests passed in a fresh temporary profile; the cause remains unconfirmed. If this occurs, use the navigation-collapse button at the top left.

Paper analysis requires extractable PDF text; scanned documents need OCR first. Check model-generated explanations and annotations against the original paper. Local history does not mean offline AI: model requests include the context needed for the request. See [Data and credentials](https://github.com/jadense-ai/jadense-in-zotero/blob/main/README.en.md#data-and-credentials) for the data paths. Each message can include one new image; images not saved by older versions cannot be recovered automatically.

<details>
<summary>Release acceptance record and package verification</summary>

- The original draft attachments were downloaded, and the XPI, metadata, `SHA256SUMS`, and GitHub asset digest were verified.
- `smoke:installed --xpi` passed three cold starts.
- `smoke:research --xpi --screenshots` passed the full **131 checks**, covering the reader, restored image history, translation, analysis, BYOK, feature models, and subscription messages. Tests were not modified and attachments were not rebuilt to remove the window-resizing issue recorded above.
- An upgrade check from an earlier official release with the same ID does not apply: website version 0.3.2 uses the old `.com` ID, while this version uses `.cn` and requires manual migration.
- The release notes, migration instructions, and three attachments were checked before the maintainer published the release. This record describes the 0.4.0 acceptance checks; editing the release text does not imply those checks were rerun.

XPI: `jadense-in-zotero-v0.4.0.xpi`, **577815 bytes**.

SHA-256:

```text
ba6acbc2f6ee9d73f80462fe50091fb97abd3aa131b72222d01b28efddc17057
```

All attachments come from [the same tag CI run](https://github.com/jadense-ai/jadense-in-zotero/actions/runs/34272736935), built from source commit `49cc4c6951eb38244aa0931116ad657cf3cf8495`. The published tag and attachments remain unchanged. Changing artifact bytes requires a new version.

This release includes [PR #1: PR checks and immutable draft releases](https://github.com/jadense-ai/jadense-in-zotero/pull/1) and [PR #2: Preparing the 0.4.0 release](https://github.com/jadense-ai/jadense-in-zotero/pull/2), contributed by [@jadense-ai](https://github.com/jadense-ai). These are the account's first contributions to this repository. See the [full commit history](https://github.com/jadense-ai/jadense-in-zotero/commits/v0.4.0).

</details>
