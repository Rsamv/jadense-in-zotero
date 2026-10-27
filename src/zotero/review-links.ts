/**
 * 快速解析的开源链接发现：题录字段那一路在 collectReviewRows 里完成，这里只补附件那一路。
 * 只解析 PDF 首页与最后几页的文字，并且只保留抽出来的链接文本——正文不外发，也不打开任何链接。
 */
import { extractReviewLinks, normalizeReviewLinks, type ReviewPaperRow } from '@/chat/quick-review'
import { uiText } from './ui-preferences'
import type { ZoteroLike } from './runtime'
import { edgePageNumbers, loadPdfModule, pdfModuleBase, readPdfPagesText } from './pdf-module'

const MAX_ATTACHMENT_BYTES = 20_000_000
const MAX_ATTACHMENTS_PER_PAPER = 2
const PAGE_LEADING = 1
const PAGE_TRAILING = 3

type NativeRecord = Record<string, unknown>

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

/** 单个附件：读盘 → 只解析首尾页 → 抽链接；任何一步失败都只是这一篇没有链接。 */
async function attachmentLinks(pdfjs: Awaited<ReturnType<typeof loadPdfModule>>, path: string, base: string): Promise<string[]> {
  const io = (globalThis as typeof globalThis & { IOUtils?: { read?: (path: string) => Promise<ArrayBuffer | Uint8Array> } }).IOUtils
  if (!io?.read) return []
  const raw = await io.read(path)
  const data = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
  if (data.byteLength > MAX_ATTACHMENT_BYTES) return []
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
    return extractReviewLinks(await readPdfPagesText(pdf, edgePageNumbers(pdf.numPages, PAGE_LEADING, PAGE_TRAILING)))
  } finally {
    await task.destroy()
  }
}

export async function scanRowsForAttachmentLinks(input: {
  doc: Document
  host: ZoteroLike
  rows: readonly ReviewPaperRow[]
  signal?: AbortSignal
  onProgress?: (message: string) => void
}): Promise<{ rows: ReviewPaperRow[]; scanned: number; found: number; failed: number }> {
  const targets = input.rows.filter(row => !row.attachmentScanned)
  if (!targets.length) return { rows: [...input.rows], scanned: 0, found: 0, failed: 0 }
  const base = pdfModuleBase(input.doc)
  let pdfjs: Awaited<ReturnType<typeof loadPdfModule>> | null = null
  try {
    pdfjs = await loadPdfModule(input.doc, base)
    pdfjs.GlobalWorkerOptions.workerSrc = `${base}pdf.worker.mjs`
  } catch {
    pdfjs = null
  }
  const found = new Map<string, string[]>()
  const done = new Set<string>()
  let scanned = 0
  let failed = 0
  for (const [position, row] of targets.entries()) {
    if (input.signal?.aborted) break
    const key = `${row.libraryID}:${row.itemKey}`
    // 已进入本轮的行一律算扫过：解析器缺失或单个 PDF 读失败都不该让下次生成长重扫。
    done.add(key)
    input.onProgress?.(uiText(`正在扫描附件里的开源链接 · ${position + 1}/${targets.length}`, `Scanning attachments for code links · ${position + 1}/${targets.length}`))
    scanned += 1
    if (!pdfjs) continue
    const item = await resolveItem(input.host, row.libraryID, row.itemKey)
    if (!item || typeof item !== "object") continue
    const attachmentIDs = (await callMethod<unknown[]>(item, "getAttachments")) ?? []
    for (const attachmentID of attachmentIDs.slice(0, MAX_ATTACHMENTS_PER_PAPER)) {
      const attachment = await resolveAttachment(input.host, attachmentID)
      if (!attachment || typeof attachment !== "object") continue
      if (typeof attachment.isPDFAttachment === "function" && attachment.isPDFAttachment.call(attachment) !== true) continue
      const path = await attachmentPath(attachment)
      if (!path) continue
      try {
        const links = await attachmentLinks(pdfjs, path, base)
        if (links.length) found.set(key, links)
      } catch {
        failed += 1
      }
    }
  }
  // 只有真扫过的行才带 attachmentScanned：中途停止时剩下的篇目下次还会再扫。
  const rows = input.rows.map(row => {
    const key = `${row.libraryID}:${row.itemKey}`
    if (!done.has(key)) return row
    return { ...row, links: normalizeReviewLinks([...(row.links ?? []), ...(found.get(key) ?? [])]), attachmentScanned: true }
  })
  return { rows, scanned, found: found.size, failed }
}
