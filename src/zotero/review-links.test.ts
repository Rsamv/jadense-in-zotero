/** 附件链接扫描的边界：只读首尾页、只外传链接文本、解析器缺失时不阻塞综述。 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ReviewPaperRow } from '@/chat/quick-review'
import { scanRowsForAttachmentLinks } from './review-links'
import { initializeUiLocale } from './ui-preferences'
import type { ZoteroLike } from './runtime'

const state = vi.hoisted(() => ({ getDocument: vi.fn(), loaded: 0, rejects: false, pages: [] as number[] }))

/** 五页样例：尾页三页（3/4/5）加首页才是该读的，第 2 页一次都不该被取。 */
const EDGE_PAGES = [1, 3, 4, 5]
const PAGE_TEXT: Record<number, string> = {
  1: 'Project page at https://yushi-du.github.io/COLA/ with demos.',
  3: 'Body prose without any address here.',
  4: 'A results table with no link.',
  5: 'Code: https://github.com/tiny/attn. Data availability: https://zenodo.org/records/1234.',
}

vi.mock('./pdf-module', async importActual => ({
  ...(await importActual<typeof import('./pdf-module')>()),
  loadPdfModule: async () => {
    state.loaded += 1
    if (state.rejects) throw new Error('no parser')
    return {
      GlobalWorkerOptions: {},
      getDocument: (input: { data: Uint8Array }) => {
        state.getDocument(input)
        return {
          promise: Promise.resolve({
            numPages: 5,
            getPage: async (page: number) => {
              state.pages.push(page)
              return {
                getTextContent: async () => ({ items: [{ str: PAGE_TEXT[page] ?? '', hasEOL: true }] }),
              }
            },
          }),
          destroy: async () => {},
        }
      },
    }
  },
}))

const row = (itemKey: string, links: string[] = []): ReviewPaperRow => ({
  libraryID: 1, itemKey, title: `Paper ${itemKey}`, creators: [], date: "2025", publicationTitle: "", doi: "",
  abstract: "We report a measured result.", tags: [], links,
})

function hostFixture(attachments: Record<number, unknown>) {
  const items: Record<number, unknown> = {
    10: { getAttachments: () => [101], key: "PAPER1", libraryID: 1 },
    11: { getAttachments: () => [102], key: "PAPER2", libraryID: 1 },
  }
  return {
    Items: {
      getByLibraryAndKey: (_libraryID: number, key: string) => Object.values(items).find(item => (item as { key: string }).key === key),
      get: (id: number) => (attachments[id] ?? items[id]),
    },
  } as unknown as ZoteroLike
}

const pdfAttachment = (path: string, isPDF = true) => ({
  isPDFAttachment: () => isPDF,
  getFilePathAsync: () => path,
})

const io = (bytes: () => Uint8Array) => {
  ;(globalThis as typeof globalThis & { IOUtils?: { read: (path: string) => Promise<Uint8Array> } }).IOUtils = { read: async () => bytes() }
}

beforeEach(() => {
  initializeUiLocale({ locale: 'zh-CN' })
  state.getDocument.mockReset(); state.loaded = 0; state.rejects = false; state.pages = []
  io(() => new Uint8Array([1, 2, 3]))
})

afterEach(() => {
  delete (globalThis as typeof globalThis & { IOUtils?: unknown }).IOUtils
})

const pdfHost = hostFixture({ 101: pdfAttachment('C:/tmp/one.pdf'), 102: pdfAttachment('C:/tmp/two.pdf') })

describe('attachment link scanning', () => {
  it('keeps only the link text from the first and last pages', async () => {
    const scanned = await scanRowsForAttachmentLinks({ doc: document, host: pdfHost, rows: [row('PAPER1', ['https://github.com/tiny/attn'])] })
    // 首尾页之外的页面一次都不该被读取。
    expect(state.pages).toEqual(EDGE_PAGES)
    expect(scanned.rows[0].links).toEqual([
      'https://github.com/tiny/attn',
      'https://yushi-du.github.io/COLA/',
      'https://zenodo.org/records/1234',
    ])
    expect(scanned.rows[0].attachmentScanned).toBe(true)
    expect(scanned).toMatchObject({ scanned: 1, found: 1, failed: 0 })
    expect(JSON.stringify(scanned.rows)).not.toContain('Body prose')
  })

  it('marks every scanned row once and never re-reads the batch', async () => {
    const first = await scanRowsForAttachmentLinks({ doc: document, host: pdfHost, rows: [row('PAPER1'), row('PAPER2')] })
    expect(first.rows.every(r => r.attachmentScanned)).toBe(true)
    expect(state.loaded).toBe(1)
    const readPages = state.pages.length
    const again = await scanRowsForAttachmentLinks({ doc: document, host: pdfHost, rows: first.rows })
    expect(again.scanned).toBe(0)
    expect(state.loaded).toBe(1)
    // 重跑一次不重复读盘：页数没有增加。
    expect(state.pages).toHaveLength(readPages)
  })

  it('stops after the first paper when the window is closed', async () => {
    const controller = new AbortController()
    const seen: string[] = []
    const scanned = await scanRowsForAttachmentLinks({
      doc: document, host: pdfHost, rows: [row('PAPER1'), row('PAPER2')],
      signal: controller.signal,
      onProgress: message => { seen.push(message); if (seen.length === 1) controller.abort() },
    })
    expect(scanned.scanned).toBe(1)
    // 没轮到的那篇保持未扫，下次生成还会补上，而不是被静默跳过。
    expect(scanned.rows[0].attachmentScanned).toBe(true)
    expect(scanned.rows[1].attachmentScanned).toBeUndefined()
  })

  it('ignores non-PDF attachments and files that are too large', async () => {
    const skipped = hostFixture({ 101: pdfAttachment('C:/tmp/one.pdf', false), 102: pdfAttachment('C:/tmp/two.pdf') })
    const notPdf = await scanRowsForAttachmentLinks({ doc: document, host: skipped, rows: [row('PAPER1')] })
    expect(notPdf.rows[0].links).toEqual([])
    expect(state.getDocument).not.toHaveBeenCalled()

    io(() => new Uint8Array(20_000_001))
    const tooBig = await scanRowsForAttachmentLinks({ doc: document, host: pdfHost, rows: [row('PAPER1')] })
    expect(tooBig.rows[0].attachmentScanned).toBe(true)
    expect(state.getDocument).not.toHaveBeenCalled()
  })

  it('still finishes the review when the parser or the file reader is unavailable', async () => {
    state.rejects = true
    const noParser = await scanRowsForAttachmentLinks({ doc: document, host: pdfHost, rows: [row('PAPER1')], onProgress: () => {} })
    expect(noParser.rows[0]).toMatchObject({ attachmentScanned: true, links: [] })

    delete (globalThis as typeof globalThis & { IOUtils?: unknown }).IOUtils
    state.rejects = false
    const noIO = await scanRowsForAttachmentLinks({ doc: document, host: pdfHost, rows: [row('PAPER1')] })
    expect(noIO).toMatchObject({ scanned: 1, found: 0, failed: 0 })
    expect(noIO.rows[0].attachmentScanned).toBe(true)
  })

  it('treats a broken library item as one paper without links', async () => {
    const broken = {
      Items: { getByLibraryAndKey: () => { throw new Error('gone') }, get: () => null },
    } as unknown as ZoteroLike
    const scanned = await scanRowsForAttachmentLinks({ doc: document, host: broken, rows: [row('PAPER1')] })
    expect(scanned).toMatchObject({ scanned: 1, found: 0 })
    expect(scanned.rows[0].attachmentScanned).toBe(true)
  })
})
