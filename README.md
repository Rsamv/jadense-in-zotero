<p align="center">
  <img src="content/icons/logo-padded.png" width="128" height="128" alt="Jadense Logo">
</p>
<h1 align="center">Jadense in Zotero（个人 fork）</h1>
<p align="center">攻玉学术 Zotero 阅读插件的个人改版 · 基线官方 v0.6.13</p>
<p align="center">
  <a href="https://www.zotero.org/download/"><img src="https://img.shields.io/badge/Zotero-8%20%7C%209%20%7C%2010-bb2222" alt="Zotero 8 / 9 / 10"></a>
  <a href="https://github.com/Rsamv/jadense-in-zotero/releases/latest"><img src="https://img.shields.io/github/v/release/Rsamv/jadense-in-zotero" alt="fork release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Non--Commercial-16a36a" alt="Non-commercial license"></a>
</p>

**简体中文** · [English](README.en.md)

> **这是个人 fork，不是官方发布渠道。** 上游是 [jadense-ai/jadense-in-zotero](https://github.com/jadense-ai/jadense-in-zotero)，本分支以官方 `v0.6.13` 为基线，叠加自用改动。原 README 里的第三方 API 中转站推广、赞助二维码、Star 增长图和攻玉网页端引导已整块移除，只保留与插件使用有关的内容；官方功能说明见上游仓库与其[使用指南](docs/usage-guide.md)。
>
> 许可证不变，仍是 [Jadense Non-Commercial License 1.0](LICENSE)：仅限个人非商业自用，免费分发，须保留原版权声明，改动已在 [CHANGELOG.md](CHANGELOG.md) 顶部的 `0.6.13.x` 条目逐轮标注，下游继承同样的非商业条件。
>
> 本机构建版本号用四段（`0.6.13.1` → `0.6.13.13`），大于当轮官方、小于将来的官方 `0.6.14`。插件 ID 与包内 `update_url` 保持官方值，所以官方发布更高版本时，Zotero 自动更新会顶掉这里的构建——自用场景下这是预期行为；要长期留在改版上请关闭自动更新。

**在 Zotero 中读懂论文，并把「实际有什么」和「模型说什么」分开。**

本分支的主线是收藏夹批量综述窗口：对一整个收藏夹（含子收藏夹）发起**一次**模型调用，得到总览、逐篇要点、横向对比、趋势与空白，并给每篇 0–100 的评价；扫描证据全部来自本机 PDF，正文默认不出机器。

<!-- release-summary:start -->
## 上游版本基线

本 fork 的代码基线是官方 v0.6.13（尚未发布）。以下是它之前的官方正式版，功能差异以 [CHANGELOG.md](CHANGELOG.md) 为准：

- [v0.6.12](https://github.com/jadense-ai/jadense-in-zotero/releases/tag/v0.6.12) — 发现前沿分离首页、进行与结果，更新文献卡片和收藏操作，新增交集／并集检索与帮助。
- [v0.6.11](https://github.com/jadense-ai/jadense-in-zotero/releases/tag/v0.6.11) — 发现前沿欢迎、扫描与历史布局更新，修复文本居中，改进收藏 PDF 上传恢复与翻译反馈。
- [v0.6.10](https://github.com/jadense-ai/jadense-in-zotero/releases/tag/v0.6.10) — PDF 与 OCR 引擎可分别选择存储位置；BYOK 可按功能设置思考档位。
- [v0.6.9](https://github.com/jadense-ai/jadense-in-zotero/releases/tag/v0.6.9) — 新增简阅模式与主动翻译，改进模型思考档位与翻译进度反馈。
<!-- release-summary:end -->

## 与官方 v0.6.13 的功能差异

### 一、收藏夹快速解析窗口（官方没有这个功能）

在 Zotero 收藏夹右键菜单打开独立窗口，递归读取该收藏夹及其子收藏夹的文献（跳过附件、笔记与回收站条目），一次调用产出结构化综述。

| 能力 | 具体行为 |
| --- | --- |
| 输入范围 | 题录（作者、年份、标题、期刊、收藏名、标签）、摘要、链接文本、附录一级标题、版面统计。**PDF 正文不发送**；单篇按需深读是唯一会发送正文片段的入口，且需逐条确认。 |
| 逐篇评价 | 0–100 分：问题价值、方法创新、证据强度、可复现性、应用潜力各 20 分；写作、排版、图表、期刊、引用不计分。档位由分数折算（80+ 高、65–79 中、50–64 低），同一批文献同一把尺子；材料只有题录或摘要被截断时上限 45 分。 |
| 代码／数据三态 | `yes` 有硬定义：摘要或附录里给出仓库网址（github／gitlab／huggingface／zenodo 等），或明确写「源代码已开源／已发布／可获取」。项目主页、数据集网站、论文落地页、「将开源」「审稿后开源」都不算。模型在无证据时写 `yes`，客户端降为「未见说明」。 |
| 附件取证 | 整篇读取（超过 80 页取首尾两半，单附件上限 60 MB）。文字层抽取 + **超链接注释**（`getAnnotations()` 取 `Link`）双通道合并去重——本机样本里 610 条链接注释有 572 条在文字层根本找不到。arXiv／DOI／OpenReview 落地页、检索站点、断行残串、参考文献里的仓库都不算发现。 |
| 附录识别 | 只收一级标题，子小节（`D.1`）、坐标轴刻度、正文句子不混入；标记从 `VII` 这类续编开始也能取到；编号与标题分行、小型大写碎片、行尾断词都能拼回。读到 `Appendix`／`Supplementary Material`／`附录` 但排不出标题时标「有附录（未列小节）」，模型可以说「有附录」但禁止猜节数或标题。 |
| 版面统计 | 本机数出一级小节标题（最多 12 条）、图／表／参考文献数量，以及消融／基线／人工评测三组关键词命中次数。**只有标题与计数外发**，提示词把这一行标成「本机数出，非模型判断」。 |
| 正文小节跳页 | 每个一级小节记下所在页与附件，卡片上的标题是按钮，点击调 `Zotero.Reader.open(附件 itemID, { pageIndex })` 翻到那一页；附录小节同一入口。跳页数据只在本机流转，不进请求载荷、不进「复制全文」，历史记录保存它，重开旧综述仍能跳。 |
| 单篇按需深读 | 批量综述结束后，每篇卡片下方「深读这篇（单独一次请求）」。先在本机切有界摘录（最多 3 节、每节 400 字、合计 1200 字；引言取节尾，方法／结论／实验取节首），再弹确认框逐条报清送出多少字、是哪几节、在第几页、为切它本机读了多少页，并写明摘录之外的正文、图表、公式与附录都不发送。确认后才派发那一次。 |
| 结果卡片 | 「本机证据」折叠框（附件账目、版面统计、正文小节、本地链接、附录标题）与下方模型评价分成两块，谁读的、谁判的一眼可分。本地链接经 `Zotero.launchURL` 交给系统浏览器，只接受 http/https——历史里混进的 `javascript:` 不会变成可执行动作。 |
| 容错 | 模型返回的 JSON 有中文标点或漏转义引号时**不再整篇报废**：原样解析 → 语法修复 → 逐字段恢复，并如实提示「已逐字段恢复，跳过 N 处无法解析的内容」；恢复出的空壳条目不计入覆盖。 |
| 失败不伪装 | 每篇带 `scanOutcome`（`parsed`／`noAttachment`／`oversize`／`unreadable`／`unavailable`）。Zotero 10 的 `Items.get` 只查缓存、`getAttachments()` 会抛 `UnloadedDataException`，旧版把这个异常吞成「读了 0 页 · 未见链接」——现在改走 `getAsync` 并在失败时 `loadDataType('childItems')` 重试，卡片写「未能读取附件（重新生成会重试）」，回执补「N 篇未能读取附件列表」。 |
| 结果只用于阅读 | 不写入 Zotero 条目、笔记或标签；综述历史保存在本机，可复制全文、可删除、可重开。 |

### 二、对照翻译的缓存回收与自动保存

- 发布新成稿后只保留当前与上一版快照，更早的成稿和写入中断留下的临时稿在下一次打开对照翻译时后台回收；版面解析缓存同样只保留两代。
- 已删除文献的对照成果与版面缓存在连续两次确认（间隔一分钟以上）后清理，文献库尚未就绪时一律不删。想保留的话把首选项 `extensions.jadenseInZotero.removeOrphanTranslatedPDF` 设为 `false`（默认开启清理）。
- 对照译文 PDF 完成后可自动保存到上次导出的目录（`extensions.jadenseInZotero.autoSaveTranslatedPDF`，默认开启），以文献标题命名，不会覆盖原 PDF 或已有文件。
- 缓存清理脚本随本仓库外的工具单独维护，删除前一定先出 dry-run 清单，插件或 Zotero 正在写入时拒绝执行。

### 三、错误提示

失败提示带类型前缀（如【上游服务错误 · 503】），**只投影错误码、HTTP 状态与错误类名**，不回显上游服务正文或密钥。

### 四、刻意保持不动的部分

- **BYOK 非幂等契约**：已产生输出或结果未确认的请求不会自动重发（防重复计费），只有用户在提供商后台核对后显式授权，才沿用同一会话 ID 重发一次。逐篇深读沿用同一契约。本分支不改上游的重试与执行状态判定，并有回归测试钉住这条边界。
- **计费目的地**：快速解析与逐篇深读都沿用「文献解析」功能模型，不新增计费入口；一次批量综述只有一次派发。
- **模型请求直连**：BYOK 请求直接发给你配置的 Provider，不经过任何中转站点；本 fork 移除了 README 里的第三方 API 推广，也没有加入任何统计或回流地址。
- **插件 ID 与更新源**：保持官方值，因此官方版本能覆盖升级本 fork 的构建。

## 依赖

- **宿主**：Zotero 桌面版 8.0–10.0.*。自动识别 PDF 图片需要 Zotero 10.0.1 及以上的兼容 PDF 阅读器。
- **AI 接入**：二选一。自带 API Key（BYOK：Provider 的 API Key、Base URL 和模型 ID，不需要攻玉账号），或连接攻玉学术账号与插件令牌。模型调用费用按所选服务商或攻玉账号规则计算。
- **本机 OCR / 版面解析引擎**：问答、默认选文翻译、参考文献提取都不需要 Python；只有识别扫描页或做 PDF 对照排版翻译时才需要，首次安装需联网并预留数 GB 空间。步骤见上游文档 [docs/local-ocr.md](docs/local-ocr.md) 与 [docs/pdf-engine.md](docs/pdf-engine.md)。

## 安装本 fork

1. 从 [Releases](https://github.com/Rsamv/jadense-in-zotero/releases/latest) 下载 `.xpi`（每个 Release 附 `SHA256SUMS`）。**不要把 Source code 压缩包当安装包。**
2. Zotero「工具 → 插件 → 齿轮 → 从文件安装插件」，选中该 XPI。
3. 已装官方版的用户注意：本 fork 与官方共用插件 ID `jadense-in-zotero@jadense.cn`，装上去即覆盖官方版本；若装过 `@jadense.com` 身份的旧版，先禁用旧插件再手动安装，勿同时启用两种身份。
4. 若要长期留在改版上，在 Zotero 插件设置里关闭自动更新，否则官方发布更高版本时会覆盖。

## 版本命名

包内版本是四段 `0.6.13.x`；本仓库的 Release 序号与包内版号一一对应，规则为 `v0.(10 + x)`——`v0.16` 对应 `0.6.13.6`，`v0.23` 对应 `0.6.13.13`。每轮发布只保留最新一条 Release，旧的连同其标签一起删除，避免装到过期包。

## 从源码构建与跟随官方更新

```bash
# 环境：Node 24、pnpm 10.19.0
pnpm install
npm run build          # tsc --noEmit → scripts/build.mjs → scripts/verify-release.mjs
npm test               # vitest

# 跟随官方发版
git fetch upstream --tags
git checkout local
git merge upstream/tags/v0.6.14   # 冲突集中在 CHANGELOG.md 与 docs/usage-guide.md
```

上游 `.github/scripts/release.mjs resolve` 不接受四段版本号，直接照搬上游 workflow 会让 CI 变红；本 fork 手动打标签、手动上传 XPI。完整开发说明见上游 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 数据去向

| 操作 | 数据去向 |
| --- | --- |
| 设置、对话、图片附件、翻译与解析历史、快速综述记录 | 本机 Zotero profile；API Key 与攻玉令牌也存此处，请勿公开分享 profile |
| 收藏夹快速解析 | 题录、摘要、抽到的链接文本、附录一级标题、版面统计标题与计数发送给所选模型；**PDF 正文不发送**，扫描过程不打开任何链接 |
| 单篇按需深读 | 显式确认后发送有界正文摘录（≤1200 字），单独一次计费请求 |
| BYOK 模型请求 | 插件直连所配置的 Provider，不经中转 |
| 全文翻译 / 参考文献提取 | 默认读 PDF 文字层；启用 OCR 后，提取正文发送至所选翻译服务 |
| 攻玉 AI 功能 | 攻玉接收临时请求与所需上下文，用插件令牌鉴权 |
| 插件自动更新 | Zotero 请求攻玉官方更新清单及安装包 |

本地保存历史不等于离线运行。凭据与安全说明见 [SECURITY.md](SECURITY.md)。

## 已知限制

- 快速解析的判断依据只有题录与摘要（加上本机扫出的链接、附录标题、版面统计）。摘要未提及的内容一律记 `unknown`，模型不得按常识或期刊习惯推断，也不得编造仓库名、网址或许可证——但对「证据强度」这类维度，材料本身就有限，请结合原文核对。
- 版面统计与小节识别按中英日混排的会议／期刊／综述 PDF 逐篇校准过，遇到新的排版仍可能漏检或多检；漏检会写在回执里，不会静默。
- 深读、重发、清理都有确认环节，取消即不发、不删。
- 未实测：macOS、Linux、Zotero 8／9，以及真实付费 Provider 的计费行为。
- 本 fork 的 Issue 仅用于自用记录，不承诺响应第三方反馈。

## 许可与致谢

代码遵循 [Jadense Non-Commercial License 1.0](LICENSE)：允许个人非商业自用与免费再分发，条件是保留声明、标注改动、下游同条件；不授予商标与官方身份，收费代装或托管视为商业使用。

插件本体与全部上游设计来自 [jadense-ai/jadense-in-zotero](https://github.com/jadense-ai/jadense-in-zotero) 与[攻玉学术](https://jadense.cn/)。本 fork 只做删广告、加自用功能、修检测漏检这三类改动，不改变官方的许可意图。

## English summary

This is a **personal fork** of [jadense-ai/jadense-in-zotero](https://github.com/jadense-ai/jadense-in-zotero), based on the official `v0.6.13`. The upstream README's third-party API reseller promotion, donation pages, star-history chart and web-app upsell sections have been removed; nothing was added in their place — no analytics, no redirect endpoints.

What this branch adds:

- **Collection quick review** (not in official builds): one request over a Zotero collection and its sub-collections produces an overview, per-paper digests, a comparison table, trends and gaps, plus a 0–100 rating per paper on five weighted axes. Material is bibliographic metadata and abstracts only.
- **Local forensics that a model cannot fake**: whole-PDF text-layer extraction merged with PDF hyperlink annotations (572 of 610 link annotations in a local corpus never appear in the text layer), top-level appendix titles, layout counts (sections, figures, tables, references, ablation／baseline／human-evaluation hits) and clickable section-to-page jumps. Only titles and counts leave the machine.
- **A hard rule for "code released"**: only a repository URL or an explicit open-source statement counts; project pages, landing pages and "will be released" promises do not, and an unsupported `yes` is downgraded on the client.
- **Bounded per-paper deep read**, one separately billed request, made only after a dialog states exactly how many characters from which sections on which pages will be sent.
- **Cache reclamation** for bilingual PDF translation: two generations of published output, orphan cleanup after two confirmations a minute apart, and named auto-save that never overwrites the source PDF.
- **Scan failures never masquerade as "found nothing"**: each paper carries a `scanOutcome`, so an unreadable attachment list says "attachment unavailable (retried next run)" instead of "read 0 pages, no links".
- **Malformed JSON recovery** in three stages instead of losing the whole review to one unescaped quote.

Deliberately unchanged: the BYOK non-idempotence fence (an unconfirmed execution that already produced output is never resent automatically — only once, after you check with the provider and explicitly authorise it), error projection limited to code／HTTP status／class name, one dispatch per batch review, the same billing destination as "paper analysis", and the official plugin ID and update URL. Package versions are four-segment (`0.6.13.13`); fork releases map as `v0.(10 + x)`, so `v0.23` is `0.6.13.13`. Because the plugin ID and update feed stay official, an official release newer than this branch will replace these builds through Zotero's automatic update — turn automatic update off if you want to stay on the fork.

Licence is unchanged: Jadense Non-Commercial License 1.0 (personal non-commercial use, free redistribution with attribution, changes documented, downstream inherits the same terms). See [CHANGELOG.md](CHANGELOG.md) for the per-round diff against official.
