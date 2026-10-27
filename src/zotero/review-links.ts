/**
 * 快速解析的开源链接发现：题录字段那一路在 collectReviewRows 里完成，这里只补附件那一路。
 * 两条证据通道：页面文字里的网址，以及 PDF 的超链接注释（文字层抽不出网址时注释仍保留原地址）。
 * 只保留链接文本与附录小节标题——正文不外发，也不打开任何链接。
 */
import { ANNOTATION_LINK_PAGES, detectReviewAppendix, extractAnnotationReviewLinks, extractReviewLinks, hasReviewAppendix, mergeReviewAppendix, normalizeReviewLinks, type QuickReviewScanOutcome, type ReviewPaperRow } from '@/chat/quick-review'
import { uiText } from './ui-preferences'
import type { ZoteroLike } from './runtime'
import { diagnostics } from './diagnostics'
import { evidencePageNumbers, loadPdfModule, pdfModuleBase, readPdfPageLinks, readPdfPagesText } from './pdf-module'

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

/** 单个附件：读盘 → 解析取证页 → 抽链接与附录标题；失败只算这一篇没有附加证据，并说明卡在哪一步。 */
async function attachmentScan(read: (path: string) => Promise<ArrayBuffer | Uint8Array>, pdfjs: Awaited<ReturnType<typeof loadPdfModule>>, path: string, base: string): Promise<{ links: string[]; appendix: string[]; marked: boolean; pages: number; outcome: AttachmentOutcome }> {
  let data: Uint8Array
  try {
    const raw = await read(path)
    data = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
  } catch (error) {
    recordScanIssue("attachment_read", error)
    return { links: [], appendix: [], marked: false, pages: 0, outcome: "unreadable" }
  }
  if (data.byteLength > MAX_ATTACHMENT_BYTES) return { links: [], appendix: [], marked: false, pages: 0, outcome: "oversize" }
  const task = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
  })
  try {
    const pdf = await task.promise
    const pages = evidencePageNumbers(pdf.numPages, MAX_PAGES_PER_ATTACHMENT)
    const text = await readPdfPagesText(pdf, pages)
    // 文字层抽不出网址的论文，超链接注释里往往还留着：只取靠前页，避免参考列表里的仓库混进来。
    const annotationLinks = extractAnnotationReviewLinks(await readPdfPageLinks(pdf, pages.filter(page => page <= ANNOTATION_LINK_PAGES)))
    return { links: normalizeReviewLinks([...extractReviewLinks(text), ...annotationLinks]), appendix: detectReviewAppendix(text), marked: hasReviewAppendix(text), pages: pages.length, outcome: "parsed" }
  } catch (error) {
    recordScanIssue("attachment_parse", error)
    return { links: [], appendix: [], marked: false, pages: 0, outcome: "unreadable" }
  } finally {
    await task.destroy()
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
  const empty: QuickReviewScanReport = { rows: [...input.rows], scanned: 0, parsed: 0, found: 0, withAppendix: 0, marked: 0, noAttachment: 0, pages: 0, oversize: 0, unreadable: 0, unavailable: 0, parserMissing: false, readerMissing: false }
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
      if (scan.appendix.length) appendix.set(key, [...(appendix.get(key) ?? []), ...scan.appendix])
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
    return {
      ...row,
      links: normalizeReviewLinks([...(row.links ?? []), ...(links.get(key) ?? [])]),
      appendix: rowAppendix,
      appendixMarked: rowMarked,
      attachmentScanned: true,
      scanPages: (row.scanPages ?? 0) + (rowPages.get(key) ?? 0),
      scanOutcome: outcome,
    }
  })
  return { rows, scanned, parsed, found: links.size, withAppendix, marked: markedCount, noAttachment, pages, oversize, unreadable, unavailable, parserMissing: false, readerMissing: false }
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
  parts.push(uiText(`发现 ${report.found} 条链接、${report.withAppendix} 篇有附录小节`, `${report.found} link(s) and appendix titles in ${report.withAppendix} paper(s) found`))
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
