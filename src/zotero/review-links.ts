/**
 * 快速解析的开源链接发现：题录字段那一路在 collectReviewRows 里完成，这里只补附件那一路。
 * 两条证据通道：页面文字里的网址，以及 PDF 的超链接注释（文字层抽不出网址时注释仍保留原地址）。
 * 同一次解析里顺手数出版面结构（一级标题、图表编号数、参考文献条数、若干措辞的命中次数）。
 * 只保留链接文本、附录小节标题及其页码、版面标题与计数——正文不外发；扫描过程不打开任何链接，
 * 用户点卡片上的链接才交给系统浏览器，点附录小节才让阅读器翻到那一页。
 * 唯一会送出正文片段的是单篇深读（readDeepReadExcerpt）：它只读用户点开的那一篇，
 * 且只交出切好的有界摘录，切不出来就返回 null，由界面拒绝派发。
 */
import { ANNOTATION_LINK_PAGES, extractAnnotationReviewLinks, extractReviewLinks, extractReviewStructure, hasReviewAppendix, locateReviewAppendixSections, locateReviewBodySections, mergeReviewAppendix, mergeReviewAppendixRefs, mergeReviewSectionRefs, normalizeReviewLinks, normalizeReviewStructure, reviewPageLineEntries, type QuickReviewScanOutcome, type ReviewAppendixRef, type ReviewAppendixSection, type ReviewPaperRow, type ReviewStructure } from '@/chat/quick-review'
import { deepReadSectionText, extractDeepReadExcerpt, type DeepReadExcerpt } from '@/chat/review-deep-read'
import { uiText } from './ui-preferences'
import type { ZoteroLike } from './runtime'
import { diagnostics } from './diagnostics'
import { evidencePageNumbers, loadPdfModule, pdfModuleBase, readPdfPageLinks, readPdfPageTexts } from './pdf-module'

/** 会议论文 PDF 常见 25～50 MB：上限太低会把最该扫的附件静默跳过。 */
const MAX_ATTACHMENT_BYTES = 60_000_000
const MAX_ATTACHMENTS_PER_PAPER = 2
/** 整篇都读，但超大 PDF 截到这么多页：附录可能夹在正文中间，只读首尾页会漏。 */
const MAX_PAGES_PER_ATTACHMENT = 80

type NativeRecord = Record<string, unknown>

/** 单个附件的处置结果，用于把过去的静默跳过变成可读者能看到的数字。 */
type AttachmentOutcome = "parsed" | "oversize" | "unreadable"

/** 扫描失败要留在本地诊断里：下一轮"读了 0 页"才能查到卡在哪一步，而不是只剩一句沉默。 */
function recordScanIssue(stage: string, error: unknown) {
  try { diagnostics()?.record("quick-review", stage, error) } catch { /* 诊断不可用不影响扫描。 */ }
}

/** 附件读取能力由 Zotero 版本决定：缺了就是整轮不成立，而不是"这一篇没有链接"。 */
function attachmentReader(): ((path: string) => Promise<ArrayBuffer | Uint8Array>) | null {
  const io = (globalThis as typeof globalThis & { IOUtils?: { read?: (path: string) => Promise<ArrayBuffer | Uint8Array> } }).IOUtils
  return typeof io?.read === "function" ? io.read.bind(io) : null
}

/** Zotero 对象跨 compartments，方法必须带 this 调用；失败只当作"这一项没有信息"。 */
async function callMethod<T>(owner: NativeRecord, name: string, ...args: unknown[]): Promise<T | undefined> {
  const method = owner[name]
  if (typeof method !== "function") return undefined
  try {
    return await (method as (...callArgs: unknown[]) => unknown).call(owner, ...args) as T
  } catch {
    return undefined
  }
}

/**
 * Zotero 10 的 Items.get 只看缓存：条目已登记但未装载时会抛 UnloadedDataException，
 * 附件对象更是常驻数据库。先走 getAsync 落库读取，同步版只作为旧版回退。
 */
async function resolveAttachment(host: ZoteroLike, id: unknown): Promise<NativeRecord | null> {
  const items = host.Items
  const asyncGetter = items?.getAsync
  if (typeof asyncGetter === "function") {
    try {
      const found = await Promise.resolve(asyncGetter.call(items, id as number))
      if (found && typeof found === "object") return found as NativeRecord
      return null
    } catch (error) { recordScanIssue("attachment_resolve", error) }
  }
  const getter = items?.get
  if (typeof getter !== "function") return null
  try {
    const found = await Promise.resolve(getter.call(items, id as number))
    return found && typeof found === "object" ? found as NativeRecord : null
  } catch (error) {
    recordScanIssue("attachment_resolve", error)
    return null
  }
}

/** 条目可能在扫描之间被删掉；取不到只影响这一篇。同步版在 Zotero 10 只查缓存，同样走 Async 优先。 */
async function resolveItem(host: ZoteroLike, libraryID: number, itemKey: string): Promise<NativeRecord | null> {
  const items = host.Items
  const asyncGetter = items?.getByLibraryAndKeyAsync
  if (typeof asyncGetter === "function") {
    try {
      const found = await Promise.resolve(asyncGetter.call(items, libraryID, itemKey))
      if (found && typeof found === "object") return found as NativeRecord
      return null
    } catch (error) { recordScanIssue("attachment_item_resolve", error) }
  }
  const getter = items?.getByLibraryAndKey
  if (typeof getter !== "function") return null
  try {
    const found = await Promise.resolve(getter.call(items, libraryID, itemKey))
    return found && typeof found === "object" ? found as NativeRecord : null
  } catch (error) {
    recordScanIssue("attachment_item_resolve", error)
    return null
  }
}

/**
 * collection.getChildItems() 取回的条目只装载了收藏夹级数据，自身的 childItems 没装载：
 * 直接调 getAttachments() 会抛 UnloadedDataException，被 callMethod 吞成"没有附件"。
 * 先补载一次再重试；补载也失败时返回 null，与"确实没有附件"区分开。
 */
async function childAttachmentIDs(item: NativeRecord): Promise<unknown[] | null> {
  const direct = await callMethod<unknown>(item, "getAttachments")
  if (Array.isArray(direct)) return direct
  const load = item.loadDataType
  if (typeof load !== "function") {
    recordScanIssue("attachment_list_load", new Error("loadDataType unavailable"))
    return null
  }
  try {
    await (load as (dataType: string) => Promise<unknown>).call(item, "childItems")
  } catch (error) {
    recordScanIssue("attachment_list_load", error)
    return null
  }
  const retried = await callMethod<unknown>(item, "getAttachments")
  if (Array.isArray(retried)) return retried
  recordScanIssue("attachment_list_read", new Error("getAttachments unavailable after loadDataType"))
  return null
}

async function attachmentPath(attachment: NativeRecord): Promise<string> {
  const asyncPath = await callMethod<unknown>(attachment, "getFilePathAsync")
  if (typeof asyncPath === "string" && asyncPath.trim()) return asyncPath.trim()
  const syncPath = await callMethod<unknown>(attachment, "getFilePath")
  return typeof syncPath === "string" && syncPath.trim() ? syncPath.trim() : ""
}

type AttachmentScanResult = { links: string[]; appendix: string[]; sections: ReviewAppendixSection[]; sectionRefs: ReviewAppendixSection[]; marked: boolean; pages: number; structure: ReviewStructure | null; outcome: AttachmentOutcome }

/**
 * 读盘 → 交给 pdf.js → 用完销毁；失败统一报成一种处置结果。
 * 批量扫描与单篇深读共用这一层，两边对"读不到"的说法才不会分叉。
 */
async function withAttachmentPdf<T>(
  read: (path: string) => Promise<ArrayBuffer | Uint8Array>,
  pdfjs: Awaited<ReturnType<typeof loadPdfModule>>,
  path: string,
  base: string,
  run: (pdf: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>) => Promise<T>,
  stage: string,
): Promise<{ value: T | null; outcome: AttachmentOutcome }> {
  let data: Uint8Array
  try {
    const raw = await read(path)
    data = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
  } catch (error) {
    recordScanIssue("attachment_read", error)
    return { value: null, outcome: "unreadable" }
  }
  if (data.byteLength > MAX_ATTACHMENT_BYTES) return { value: null, outcome: "oversize" }
  const task = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
  })
  try {
    return { value: await run(await task.promise), outcome: "parsed" }
  } catch (error) {
    recordScanIssue(stage, error)
    return { value: null, outcome: "unreadable" }
  } finally {
    await task.destroy()
  }
}

/** 单个附件：读盘 → 解析取证页 → 抽链接与附录标题；失败只算这一篇没有附加证据，并说明卡在哪一步。 */
async function attachmentScan(read: (path: string) => Promise<ArrayBuffer | Uint8Array>, pdfjs: Awaited<ReturnType<typeof loadPdfModule>>, path: string, base: string): Promise<AttachmentScanResult> {
  const failed = (outcome: AttachmentOutcome): AttachmentScanResult => ({ links: [], appendix: [], sections: [], sectionRefs: [], marked: false, pages: 0, structure: null, outcome })
  const parsed = await withAttachmentPdf(read, pdfjs, path, base, async pdf => {
    const pages = evidencePageNumbers(pdf.numPages, MAX_PAGES_PER_ATTACHMENT)
    const pageTexts = await readPdfPageTexts(pdf, pages)
    const text = pageTexts.map(entry => entry.text).join('\n')
    // 文字层抽不出网址的论文，超链接注释里往往还留着：只取靠前页，避免参考列表里的仓库混进来。
    const annotationLinks = extractAnnotationReviewLinks(await readPdfPageLinks(pdf, pages.filter(page => page <= ANNOTATION_LINK_PAGES)))
    // 小节标题连同页码一起留下：卡片上点标题就能翻到那一页。
    const sections = locateReviewAppendixSections(pageTexts)
    // 正文一级小节用与版面统计同一套行：标题认错会让统计和跳页一起错，两边不能各认一套。
    const entries = reviewPageLineEntries(pageTexts)
    const sectionRefs = locateReviewBodySections(entries.map(entry => entry.text))
      .map(section => ({ title: section.title, page: entries[section.line].page }))
    return {
      links: normalizeReviewLinks([...extractReviewLinks(text), ...annotationLinks]),
      appendix: sections.map(section => section.title),
      sections,
      sectionRefs,
      marked: hasReviewAppendix(text),
      pages: pages.length,
      // 版面统计与链接同一次解析里顺手数出来：不额外读盘，也不取正文句子。
      // 一项都没数出来时归一成 null：卡片上不该出现"一级标题 0 节 · 图 0 · 表 0"这种假账。
      structure: normalizeReviewStructure(extractReviewStructure(pageTexts)),
    }
  }, "attachment_parse")
  return parsed.value ? { ...parsed.value, outcome: "parsed" } : failed(parsed.outcome)
}

/** 单篇深读的取料结果：excerpt 为 null 时界面不得派发，notice 要写明"没有发送任何内容"。 */
export type DeepReadSource = {
  excerpt: DeepReadExcerpt | null
  /** 摘录出自哪个附件：界面用它把小节页码变成"在阅读器里跳到那一页"。 */
  attachmentID?: number
  outcome: QuickReviewScanOutcome
  /** 本机为切出这几段读了多少页。 */
  pages: number
  notice: string
}

/**
 * 深读只读这一篇的附件，且只把切出来的有界摘录交回界面；正文其余部分仍然留在本机。
 * 切不出小节就返回 null：宁可报"没读到"，也不能整页倒出去突破预算。
 */
export async function readDeepReadExcerpt(input: {
  doc: Document
  host: ZoteroLike
  row: ReviewPaperRow
  signal?: AbortSignal
}): Promise<DeepReadSource> {
  const refused = (outcome: QuickReviewScanOutcome, notice: string): DeepReadSource => ({ excerpt: null, outcome, pages: 0, notice })
  const base = pdfModuleBase(input.doc)
  let pdfjs: Awaited<ReturnType<typeof loadPdfModule>> | null = null
  try {
    pdfjs = await loadPdfModule(input.doc, base)
    pdfjs.GlobalWorkerOptions.workerSrc = `${base}pdf.worker.mjs`
  } catch {
    pdfjs = null
  }
  if (!pdfjs) return refused("unavailable", uiText('本机未能加载 PDF 解析模块，深读没有读取附件，也没有发送任何内容。', 'The local PDF parser could not be loaded, so the deep read sent nothing.'))
  const read = attachmentReader()
  if (!read) return refused("unavailable", uiText('当前 Zotero 版本缺少附件读取能力，深读没有读取附件，也没有发送任何内容。', 'This Zotero build cannot read attachment files, so the deep read sent nothing.'))

  const item = await resolveItem(input.host, input.row.libraryID, input.row.itemKey)
  const attachmentIDs = item ? await childAttachmentIDs(item) : null
  if (!attachmentIDs) return refused("unavailable", uiText('未能读取这篇的附件列表，深读没有发送任何内容。', 'The attachment list could not be read, so the deep read sent nothing.'))

  let best: { excerpt: DeepReadExcerpt; attachmentID: number; pages: number } | null = null
  let pages = 0
  const outcomes: AttachmentOutcome[] = []
  let unresolved = 0
  for (const attachmentID of attachmentIDs.slice(0, MAX_ATTACHMENTS_PER_PAPER)) {
    if (input.signal?.aborted) break
    const attachment = await resolveAttachment(input.host, attachmentID)
    if (!attachment || typeof attachment !== "object") { unresolved += 1; continue }
    if (typeof attachment.isPDFAttachment === "function" && attachment.isPDFAttachment.call(attachment) !== true) continue
    const path = await attachmentPath(attachment)
    if (!path) { unresolved += 1; continue }
    const parsed = await withAttachmentPdf(read, pdfjs, path, base, async pdf => {
      const numbers = evidencePageNumbers(pdf.numPages, MAX_PAGES_PER_ATTACHMENT)
      return { numbers, texts: await readPdfPageTexts(pdf, numbers) }
    }, "deep_read_parse")
    outcomes.push(parsed.outcome)
    if (!parsed.value) continue
    pages += parsed.value.numbers.length
    const excerpt = extractDeepReadExcerpt(parsed.value.texts)
    // 一篇有多个附件时取读到页数最多的那个：深读要的是正文最全的那份 PDF。
    if (excerpt && (!best || parsed.value.numbers.length > best.pages)) {
      best = { excerpt, attachmentID: Number(attachmentID), pages: parsed.value.numbers.length }
    }
  }
  // 用户中途停止：报"没有 PDF 附件"会被读成这篇确实没有附件，这里单独说清是停了。
  if (input.signal?.aborted && !best) {
    return refused("unavailable", uiText('深读已停止；没有发送任何内容。', 'The deep read was stopped; nothing was sent.'))
  }
  if (!outcomes.length) {
    return unresolved
      ? refused("unavailable", uiText('未能读取这篇的附件，深读没有发送任何内容。', 'The attachment could not be read, so the deep read sent nothing.'))
      : refused("noAttachment", uiText('这篇没有可读的 PDF 附件，深读没有发送任何内容。', 'This paper has no readable PDF attachment, so the deep read sent nothing.'))
  }
  if (!best) {
    const outcome = rowOutcome(outcomes) ?? "unreadable"
    if (outcome === "parsed") {
      // 读到了 PDF 却切不出摘录：可能是认不出一级小节，也可能是小节里没有成段正文。
      // 两种情况在这里已经分不开，说清"读到了但没东西可送"，否则用户会以为深读没做。
      return { excerpt: null, outcome, pages, notice: uiText(`本机读了 ${pages} 页，但没能切出可送的正文摘录：认不出正文一级小节，或这些小节里没有成段正文；这次没有发送任何内容。`, `${pages} page(s) were read locally but no sendable body excerpt could be cut: no top-level sections were recognised, or those sections held no running prose. Nothing was sent.`) }
    }
    return refused(outcome, outcome === "oversize"
      ? uiText('PDF 超过 60 MB，未读取；深读没有发送任何内容。', 'The PDF is over 60 MB and was not read, so the deep read sent nothing.')
      : uiText('PDF 读取或解析失败；深读没有发送任何内容。', 'The PDF could not be read or parsed, so the deep read sent nothing.'))
  }
  const sections = deepReadSectionText(best.excerpt.sections)
  return {
    excerpt: best.excerpt,
    attachmentID: Number.isSafeInteger(best.attachmentID) && best.attachmentID > 0 ? best.attachmentID : undefined,
    outcome: "parsed",
    pages,
    notice: uiText(`本机读了 ${pages} 页，切出 ${best.excerpt.chars} 字摘录：${sections}。`, `${pages} page(s) read locally; a ${best.excerpt.chars}-character excerpt was cut: ${sections}.`),
  }
}

/** 一篇的最佳结论：任一附件解析成功就算扫到；否则报出最先命中的失败原因。 */
function rowOutcome(outcomes: readonly AttachmentOutcome[]): AttachmentOutcome | null {
  if (!outcomes.length) return null
  if (outcomes.includes("parsed")) return "parsed"
  return outcomes[outcomes.length - 1]
}

export type QuickReviewScanReport = {
  rows: ReviewPaperRow[]
  /** 本轮真正进入扫描流程的篇数；解析器缺失时为 0，下次还会再来。 */
  scanned: number
  parsed: number
  found: number
  /** 抽到附录小节的篇数：与 found 分开报，否则"有附录没链接"会被读成什么都没扫到。 */
  withAppendix: number
  /** 数出版面统计（标题／图表／参考文献／关键词）的篇数。 */
  withStructure: number
  /** 解析成功但一篇 PDF 都没有的篇数——这是"实际有却没检测出来"最容易被误读的一类。 */
  noAttachment: number
  /** 本轮实际读过的页数，用来说明"扫过了"到底扫了多少。 */
  pages: number
  /** 读到附录标记的篇数：小节标题排不出编号时，这一项仍然说明"有附录"。 */
  marked: number
  oversize: number
  unreadable: number
  /** 取不到条目或附件列表的篇数：这些行不算扫过，下次生成会重试，也不能当作"没有附件"。 */
  unavailable: number
  /** PDF 解析模块加载失败：整轮一条证据都没抽，不能把行标成已扫描。 */
  parserMissing: boolean
  /** 运行环境没有文件读取能力（IOUtils.read 缺失），与单个 PDF 读坏是两回事。 */
  readerMissing: boolean
}

export async function scanRowsForAttachmentLinks(input: {
  doc: Document
  host: ZoteroLike
  rows: readonly ReviewPaperRow[]
  signal?: AbortSignal
  onProgress?: (message: string) => void
}): Promise<QuickReviewScanReport> {
  const empty: QuickReviewScanReport = { rows: [...input.rows], scanned: 0, parsed: 0, found: 0, withAppendix: 0, withStructure: 0, marked: 0, noAttachment: 0, pages: 0, oversize: 0, unreadable: 0, unavailable: 0, parserMissing: false, readerMissing: false }
  const targets = input.rows.filter(row => !row.attachmentScanned)
  if (!targets.length) return empty
  const base = pdfModuleBase(input.doc)
  let pdfjs: Awaited<ReturnType<typeof loadPdfModule>> | null = null
  try {
    pdfjs = await loadPdfModule(input.doc, base)
    pdfjs.GlobalWorkerOptions.workerSrc = `${base}pdf.worker.mjs`
  } catch {
    pdfjs = null
  }
  if (!pdfjs) {
    // 解析器没起来就标已扫描，等于把这批文献永久记成"查过没有"；这里只报状态，不改行。
    return { ...empty, parserMissing: true }
  }
  const read = attachmentReader()
  if (!read) {
    // 同上：没有读盘能力时一条都没查，不能把这批行写成已扫过。
    return { ...empty, readerMissing: true }
  }
  const links = new Map<string, string[]>()
  const appendix = new Map<string, string[]>()
  /** 标题 → 附件与页码：界面据此跳到附录所在页，附件 ID 只留在本机。 */
  const appendixRefs = new Map<string, ReviewAppendixRef[]>()
  /** 一篇有多个附件时，取读过页数最多的那个附件的版面统计；正文小节页码跟着同一份附件走。 */
  const structures = new Map<string, { structure: ReviewStructure; sections: ReviewAppendixSection[]; attachmentID: number; pages: number }>()
  const marked = new Set<string>()
  /** 每篇读过多少页：卡片上要能写出这个数，"扫过"才不是一句空话。 */
  const rowPages = new Map<string, number>()
  /** 每篇的结论；取不到附件列表的篇目不在其中，下次生成还会重试。 */
  const rowOutcomes = new Map<string, QuickReviewScanOutcome>()
  /** 本轮真正尝试过的行：中途停止后没轮到的行不该被写成"未能读取"。 */
  const attempted = new Set<string>()
  let scanned = 0
  let parsed = 0
  let withAppendix = 0
  let withStructure = 0
  let markedCount = 0
  let noAttachment = 0
  let pages = 0
  let oversize = 0
  let unreadable = 0
  let unavailable = 0
  for (const [position, row] of targets.entries()) {
    if (input.signal?.aborted) break
    const key = `${row.libraryID}:${row.itemKey}`
    attempted.add(key)
    input.onProgress?.(uiText(`正在扫描附件里的开源链接与附录 · ${position + 1}/${targets.length}`, `Scanning attachments for links and appendix titles · ${position + 1}/${targets.length}`))
    scanned += 1
    const item = await resolveItem(input.host, row.libraryID, row.itemKey)
    const attachmentIDs = item ? await childAttachmentIDs(item) : null
    if (!attachmentIDs) {
      // 条目或附件列表读不出来：这不是"没有附件"，标成已扫会把这批文献永久记成"查过没有"。
      unavailable += 1
      continue
    }
    const outcomes: AttachmentOutcome[] = []
    /** 有附件对象却连文件路径都取不到：同样是没读成，不能算"没有 PDF"。 */
    let unresolved = 0
    for (const attachmentID of attachmentIDs.slice(0, MAX_ATTACHMENTS_PER_PAPER)) {
      const attachment = await resolveAttachment(input.host, attachmentID)
      if (!attachment || typeof attachment !== "object") { unresolved += 1; continue }
      if (typeof attachment.isPDFAttachment === "function" && attachment.isPDFAttachment.call(attachment) !== true) continue
      const path = await attachmentPath(attachment)
      if (!path) { unresolved += 1; continue }
      const scan = await attachmentScan(read, pdfjs, path, base)
      outcomes.push(scan.outcome)
      pages += scan.pages
      rowPages.set(key, (rowPages.get(key) ?? 0) + scan.pages)
      if (scan.links.length) links.set(key, [...(links.get(key) ?? []), ...scan.links])
      if (scan.marked) marked.add(key)
      const refID = Number(attachmentID)
      if (scan.structure) {
        const previous = structures.get(key)
        if (!previous || scan.pages > previous.pages) {
          structures.set(key, { structure: scan.structure, sections: scan.sectionRefs, attachmentID: refID, pages: scan.pages })
        }
      }
      if (scan.appendix.length) appendix.set(key, [...(appendix.get(key) ?? []), ...scan.appendix])
      if (scan.sections.length && Number.isInteger(refID) && refID > 0) {
        appendixRefs.set(key, [...(appendixRefs.get(key) ?? []), ...scan.sections.map(section => ({ ...section, attachmentID: refID }))])
      }
    }
    if (!outcomes.length && unresolved) { unavailable += 1; continue }
    // 一篇 PDF 都没解析上：单独计数，回执里要说"没有可读附件"而不是"没找到链接"。
    const outcome = rowOutcome(outcomes) ?? "noAttachment"
    rowOutcomes.set(key, outcome)
    if (outcome === "parsed") parsed += 1
    else if (outcome === "noAttachment") noAttachment += 1
    else if (outcome === "oversize") oversize += 1
    else unreadable += 1
  }
  // 只有真扫过（读到了附件列表）的行才带 attachmentScanned：中途停止或附件列表读不到的篇目下次还会再扫。
  const rows = input.rows.map(row => {
    const key = `${row.libraryID}:${row.itemKey}`
    if (!attempted.has(key)) return row
    const outcome = rowOutcomes.get(key)
    if (!outcome) {
      // 被中止打断的行保持原样；真正尝试过却没拿到附件的行要当场说清楚，不能画成"读了 0 页"。
      return input.signal?.aborted ? row : { ...row, attachmentScanned: false, scanOutcome: "unavailable" as const }
    }
    const rowAppendix = mergeReviewAppendix([...(row.appendix ?? []), ...(appendix.get(key) ?? [])])
    if (rowAppendix.length) withAppendix += 1
    const rowMarked = row.appendixMarked === true || marked.has(key) || rowAppendix.length > 0
    if (rowMarked) markedCount += 1
    const rowRefs = mergeReviewAppendixRefs([...(row.appendixRefs ?? []), ...(appendixRefs.get(key) ?? [])])
    const rowStructure = structures.get(key)
    if (rowStructure) withStructure += 1
    // 正文小节页码只在附件 ID 有效时才成立：没有 ID 就点不到那一页，宁可不给。
    const rowSectionRefs = mergeReviewSectionRefs([
      ...(row.sectionRefs ?? []),
      ...(rowStructure && Number.isInteger(rowStructure.attachmentID) && rowStructure.attachmentID > 0
        ? rowStructure.sections.map(section => ({ ...section, attachmentID: rowStructure.attachmentID }))
        : []),
    ])
    return {
      ...row,
      links: normalizeReviewLinks([...(row.links ?? []), ...(links.get(key) ?? [])]),
      appendix: rowAppendix,
      ...(rowRefs.length ? { appendixRefs: rowRefs } : {}),
      ...(rowStructure ? { structure: rowStructure.structure } : {}),
      ...(rowSectionRefs.length ? { sectionRefs: rowSectionRefs } : {}),
      appendixMarked: rowMarked,
      attachmentScanned: true,
      scanPages: (row.scanPages ?? 0) + (rowPages.get(key) ?? 0),
      scanOutcome: outcome,
    }
  })
  return { rows, scanned, parsed, found: links.size, withAppendix, withStructure, marked: markedCount, noAttachment, pages, oversize, unreadable, unavailable, parserMissing: false, readerMissing: false }
}

/**
 * 扫描回执：每次都把"扫了几篇、读了多少页、抽到什么"说出来。
 * 上一版只在有东西没扫到时才开口，结果"扫过但确实没有"与"根本没扫成"在界面上长得一样。
 */
export function quickReviewScanNotice(report: QuickReviewScanReport): string {
  if (report.parserMissing) return uiText('本机未能加载 PDF 解析模块，本次没有读取附件；综述仍按题录与摘要生成。', 'The local PDF parser could not be loaded, so no attachment was read. The review still uses metadata and abstracts.')
  if (report.readerMissing) return uiText('当前 Zotero 版本缺少附件读取能力，本次没有解析 PDF。', 'This Zotero build cannot read attachment files, so no PDF was parsed.')
  if (!report.scanned) return ''
  const parts = [uiText(`附件扫描：读了 ${report.parsed} 篇 PDF 共 ${report.pages} 页`, `Attachment scan: ${report.parsed} PDF(s), ${report.pages} page(s) read`)]
  parts.push(uiText(`发现 ${report.found} 条链接、${report.withAppendix} 篇有附录`, `${report.found} link(s) and appendix titles in ${report.withAppendix} paper(s) found`))
  // 版面统计是"扫到了什么"的另一半账：数出来几篇就报几篇，没数出来的篇数由跳过项说明。
  parts.push(uiText(`${report.withStructure} 篇数出版面结构`, `layout counts measured for ${report.withStructure} paper(s)`))
  // 只认得出附录标记、排不出小节编号的篇目也要说：否则"有附录但没列标题"会被读成"没有附录"。
  if (report.marked > report.withAppendix) parts.push(uiText(`另有 ${report.marked - report.withAppendix} 篇读到附录标记但没排出小节标题`, `${report.marked - report.withAppendix} further paper(s) have an appendix marker without numbered sections`))
  const gaps: string[] = []
  if (report.noAttachment) gaps.push(uiText(`${report.noAttachment} 篇没有可读的 PDF 附件`, `${report.noAttachment} had no readable PDF attachment`))
  if (report.unavailable) gaps.push(uiText(`${report.unavailable} 篇未能读取附件列表（下次生成会重试）`, `${report.unavailable} could not read their attachment list (retried next time)`))
  if (report.oversize) gaps.push(uiText(`${report.oversize} 篇超过 60 MB`, `${report.oversize} over 60 MB`))
  if (report.unreadable) gaps.push(uiText(`${report.unreadable} 篇读取或解析失败`, `${report.unreadable} failed to read or parse`))
  if (gaps.length) parts.push(uiText(`跳过：${gaps.join('；')}`, `skipped: ${gaps.join('; ')}`))
  return uiText(`${parts.join('，')}；综述仍按题录与摘要生成。`, `${parts.join(', ')}; the review still uses metadata and abstracts.`)
}
