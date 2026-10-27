/**
 * 快速解析的开源链接发现：题录字段那一路在 collectReviewRows 里完成，这里只补附件那一路。
 * 只解析 PDF 首页与末尾几页的文字，并且只保留抽出来的链接文本与附录小节标题——正文不外发，也不打开任何链接。
 */
import { detectReviewAppendix, extractReviewLinks, mergeReviewAppendix, normalizeReviewLinks, type ReviewPaperRow } from '@/chat/quick-review'
import { uiText } from './ui-preferences'
import type { ZoteroLike } from './runtime'
import { evidencePageNumbers, loadPdfModule, pdfModuleBase, readPdfPagesText } from './pdf-module'

/** 会议论文 PDF 常见 25～50 MB：上限太低会把最该扫的附件静默跳过。 */
const MAX_ATTACHMENT_BYTES = 60_000_000
const MAX_ATTACHMENTS_PER_PAPER = 2
/** 整篇都读，但超大 PDF 截到这么多页：附录可能夹在正文中间，只读首尾页会漏。 */
const MAX_PAGES_PER_ATTACHMENT = 80

type NativeRecord = Record<string, unknown>

/** 单个附件的处置结果，用于把过去的静默跳过变成可读者能看到的数字。 */
type AttachmentOutcome = "parsed" | "oversize" | "unreadable"

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

/** 附件可能在扫描之间被删掉：取不到就当这一篇没有附件，不让整批失败。 */
async function resolveAttachment(host: ZoteroLike, id: unknown): Promise<NativeRecord | null> {
  const getter = host.Items?.get
  if (typeof getter !== "function") return null
  try {
    return await Promise.resolve(getter(id as number)) as NativeRecord | null
  } catch {
    return null
  }
}

/** 条目可能在扫描之间被删掉；同步抛错也只当作这一篇没有附件。 */
async function resolveItem(host: ZoteroLike, libraryID: number, itemKey: string): Promise<NativeRecord | null> {
  const getter = host.Items?.getByLibraryAndKey
  if (typeof getter !== "function") return null
  try {
    return await Promise.resolve(getter(libraryID, itemKey)) as NativeRecord | null
  } catch {
    return null
  }
}

async function attachmentPath(attachment: NativeRecord): Promise<string> {
  const asyncPath = await callMethod<unknown>(attachment, "getFilePathAsync")
  if (typeof asyncPath === "string" && asyncPath.trim()) return asyncPath.trim()
  const syncPath = await callMethod<unknown>(attachment, "getFilePath")
  return typeof syncPath === "string" && syncPath.trim() ? syncPath.trim() : ""
}

/** 单个附件：读盘 → 解析取证页 → 抽链接与附录标题；失败只算这一篇没有附加证据，并说明卡在哪一步。 */
async function attachmentScan(read: (path: string) => Promise<ArrayBuffer | Uint8Array>, pdfjs: Awaited<ReturnType<typeof loadPdfModule>>, path: string, base: string): Promise<{ links: string[]; appendix: string[]; pages: number; outcome: AttachmentOutcome }> {
  let data: Uint8Array
  try {
    const raw = await read(path)
    data = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
  } catch {
    return { links: [], appendix: [], pages: 0, outcome: "unreadable" }
  }
  if (data.byteLength > MAX_ATTACHMENT_BYTES) return { links: [], appendix: [], pages: 0, outcome: "oversize" }
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
    return { links: extractReviewLinks(text), appendix: detectReviewAppendix(text), pages: pages.length, outcome: "parsed" }
  } catch {
    return { links: [], appendix: [], pages: 0, outcome: "unreadable" }
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
  oversize: number
  unreadable: number
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
  const empty: QuickReviewScanReport = { rows: [...input.rows], scanned: 0, parsed: 0, found: 0, withAppendix: 0, noAttachment: 0, pages: 0, oversize: 0, unreadable: 0, parserMissing: false, readerMissing: false }
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
  const done = new Set<string>()
  let scanned = 0
  let parsed = 0
  let withAppendix = 0
  let noAttachment = 0
  let pages = 0
  let oversize = 0
  let unreadable = 0
  for (const [position, row] of targets.entries()) {
    if (input.signal?.aborted) break
    const key = `${row.libraryID}:${row.itemKey}`
    // 已进入本轮的行一律算扫过：单个 PDF 读失败不该让下次生成长重扫。
    done.add(key)
    input.onProgress?.(uiText(`正在扫描附件里的开源链接与附录 · ${position + 1}/${targets.length}`, `Scanning attachments for links and appendix titles · ${position + 1}/${targets.length}`))
    scanned += 1
    const item = await resolveItem(input.host, row.libraryID, row.itemKey)
    if (!item || typeof item !== "object") { noAttachment += 1; continue }
    const attachmentIDs = (await callMethod<unknown[]>(item, "getAttachments")) ?? []
    const outcomes: AttachmentOutcome[] = []
    for (const attachmentID of attachmentIDs.slice(0, MAX_ATTACHMENTS_PER_PAPER)) {
      const attachment = await resolveAttachment(input.host, attachmentID)
      if (!attachment || typeof attachment !== "object") continue
      if (typeof attachment.isPDFAttachment === "function" && attachment.isPDFAttachment.call(attachment) !== true) continue
      const path = await attachmentPath(attachment)
      if (!path) continue
      const scan = await attachmentScan(read, pdfjs, path, base)
      outcomes.push(scan.outcome)
      pages += scan.pages
      if (scan.links.length) links.set(key, [...(links.get(key) ?? []), ...scan.links])
      if (scan.appendix.length) appendix.set(key, [...(appendix.get(key) ?? []), ...scan.appendix])
    }
    switch (rowOutcome(outcomes)) {
      // 一篇 PDF 都没解析上：单独计数，回执里要说"没有可读附件"而不是"没找到链接"。
      case null: noAttachment += 1; break
      case "parsed": parsed += 1; break
      case "oversize": oversize += 1; break
      case "unreadable": unreadable += 1; break
      default: break
    }
  }
  // 只有真扫过的行才带 attachmentScanned：中途停止时剩下的篇目下次还会再扫。
  const rows = input.rows.map(row => {
    const key = `${row.libraryID}:${row.itemKey}`
    if (!done.has(key)) return row
    const rowAppendix = mergeReviewAppendix([...(row.appendix ?? []), ...(appendix.get(key) ?? [])])
    if (rowAppendix.length) withAppendix += 1
    return {
      ...row,
      links: normalizeReviewLinks([...(row.links ?? []), ...(links.get(key) ?? [])]),
      appendix: rowAppendix,
      attachmentScanned: true,
    }
  })
  return { rows, scanned, parsed, found: links.size, withAppendix, noAttachment, pages, oversize, unreadable, parserMissing: false, readerMissing: false }
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
  const gaps: string[] = []
  if (report.noAttachment) gaps.push(uiText(`${report.noAttachment} 篇没有可读的 PDF 附件`, `${report.noAttachment} had no readable PDF attachment`))
  if (report.oversize) gaps.push(uiText(`${report.oversize} 篇超过 60 MB`, `${report.oversize} over 60 MB`))
  if (report.unreadable) gaps.push(uiText(`${report.unreadable} 篇读取或解析失败`, `${report.unreadable} failed to read or parse`))
  if (gaps.length) parts.push(uiText(`跳过：${gaps.join('；')}`, `skipped: ${gaps.join('; ')}`))
  return uiText(`${parts.join('，')}；综述仍按题录与摘要生成。`, `${parts.join(', ')}; the review still uses metadata and abstracts.`)
}
