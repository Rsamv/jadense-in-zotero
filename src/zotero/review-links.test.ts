/** 附件扫描的边界：整篇都读但只外传链接文本与附录标题、扫到什么没扫到都要报数、环境缺件时不标记已扫；单篇深读只交出有界摘录，切不出来就一段都不送。 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ReviewPaperRow } from '@/chat/quick-review'
import { DEEP_READ_EXCERPT_CHARS_MAX } from '@/chat/review-deep-read'
import { quickReviewScanNotice, readDeepReadExcerpt, scanRowsForAttachmentLinks } from './review-links'
import { initializeUiLocale } from './ui-preferences'
import type { ZoteroLike } from './runtime'

const state = vi.hoisted(() => ({ getDocument: vi.fn(), loaded: 0, rejects: false, pages: [] as number[], annots: {} as Record<number, string[]>, numPages: [] as number[], texts: null as Record<number, string> | null }))

/** 十页样例：取证要读全部页，链接与附录标题分别埋在首页、中间页与末页；版面标题埋在正文页。 */
const ALL_PAGES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const PAGE_TEXT: Record<number, string> = {
  1: 'Project page at https://yushi-du.github.io/COLA/ with demos. Our project website is available at https://\nexpressive-humanoid.github.io.',
  2: 'Body prose without any address here.',
  3: '2 Method\nWe compare with three baselines and report an ablation.',
  4: 'Body prose without any address here.',
  5: '3 Experiments\nFigure 4. Accuracy curves.\nTable 2: comparison of tracking errors.',
  6: 'Code: https://github.com/tiny/attn.',
  7: 'Reference https://doi.org/10.1145/3197517.3201311 is not a code link.',
  8: 'Robot hardware page https://www.unitree.com/h1.',
  9: 'Appendix marker belongs to the next page.',
  10: 'Appendix\nA. Motion Dataset Selection\nWe collect 40 hours of data.\nB. Additional Training Details\nData availability: https://zenodo.org/records/1234.',
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
            // 一篇可能有多个附件：用队列给每个附件指定页数，验证深读取的是正文最全的那份。
            numPages: state.numPages.length ? state.numPages.shift()! : 10,
            getPage: async (page: number) => {
              state.pages.push(page)
              return {
                getTextContent: async () => ({ items: [{ str: (state.texts ?? PAGE_TEXT)[page] ?? '', hasEOL: true }] }),
                // 超链接注释：文字层抽不出网址时，地址仍然挂在这里。
                getAnnotations: async () => (state.annots[page] ?? []).map(url => ({ subtype: 'Link', url })),
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
  state.getDocument.mockReset(); state.loaded = 0; state.rejects = false; state.pages = []; state.annots = {}; state.numPages = []; state.texts = null
  io(() => new Uint8Array([1, 2, 3]))
})

afterEach(() => {
  delete (globalThis as typeof globalThis & { IOUtils?: unknown }).IOUtils
})

const pdfHost = hostFixture({ 101: pdfAttachment('C:/tmp/one.pdf'), 102: pdfAttachment('C:/tmp/two.pdf') })

describe('attachment link scanning', () => {
  it('reads every page for evidence but only ships link text and appendix titles', async () => {
    const scanned = await scanRowsForAttachmentLinks({ doc: document, host: pdfHost, rows: [row('PAPER1', ['https://github.com/tiny/attn'])] })
    // 真实体检里有一篇 15 页 PDF 的 8 个附录小节全在中间页：只读首尾页就会漏。
    expect([...new Set(state.pages)]).toEqual(ALL_PAGES)
    // 注释只回到靠前两页取：参考列表页里的仓库不算作者资源。
    expect(state.pages.slice(ALL_PAGES.length)).toEqual([1, 2])
    expect(scanned.rows[0].links).toEqual([
      'https://github.com/tiny/attn',
      'https://yushi-du.github.io/COLA/',
      'https://expressive-humanoid.github.io',
      'https://zenodo.org/records/1234',
      'https://www.unitree.com/h1',
    ])
    expect(scanned.rows[0].scanPages).toBe(10)
    // 附录只带出小节标题；正文里那句 40 小时的数据描述不外发。
    expect(scanned.rows[0].appendix).toEqual(['Motion Dataset Selection', 'Additional Training Details'])
    // 小节页码与附件 ID 一起留下：卡片点标题就能让阅读器翻到那一页，这些只在本机。
    expect(scanned.rows[0].appendixRefs).toEqual([
      { title: 'Motion Dataset Selection', page: 10, attachmentID: 101 },
      { title: 'Additional Training Details', page: 10, attachmentID: 101 },
    ])
    expect(scanned.rows[0].attachmentScanned).toBe(true)
    // 正文一级小节也带页：与版面统计同一套标题，点一下就能翻到标题所在页。
    expect(scanned.rows[0].sectionRefs).toEqual([
      { title: 'Method', page: 3, attachmentID: 101 },
      { title: 'Experiments', page: 5, attachmentID: 101 },
    ])
    // 版面统计只带标题与计数：正文那句"compare with three baselines"本身不外发，只留下命中次数。
    expect(scanned.rows[0].structure).toEqual({ headings: ['Method', 'Experiments'], figures: 1, tables: 1, references: null, ablation: 1, baselines: 2, humanEval: 0 })
    expect(scanned).toMatchObject({ scanned: 1, parsed: 1, found: 1, withAppendix: 1, withStructure: 1, noAttachment: 0, pages: 10, oversize: 0, unreadable: 0, parserMissing: false, readerMissing: false })
    expect(JSON.stringify(scanned.rows)).not.toContain('Body prose')
    expect(JSON.stringify(scanned.rows)).not.toContain('40 hours')
    expect(JSON.stringify(scanned.rows)).not.toContain('three baselines')
    // 扫到了东西也要报数：回执不能只在出问题时才开口。
    expect(quickReviewScanNotice(scanned)).toContain('读了 1 篇 PDF 共 10 页')
    expect(quickReviewScanNotice(scanned)).toContain('发现 1 条链接、1 篇有附录')
    expect(quickReviewScanNotice(scanned)).toContain('1 篇数出版面结构')
  })

  it('picks links out of PDF hyperlink annotations when the text layer has no URL', async () => {
    // 真实样本里 610 条注释链接有 572 条文字层抽不到：只扫文字就会把作者自己的项目页漏掉。
    state.annots = {
      1: ['https://bopi-loco.github.io/', 'https://orcid.org/0000-0002-1031-7621', 'https://arxiv.org/abs/2610.13087v1'],
      9: ['https://github.com/someone/cited-tool'],
    }
    const scanned = await scanRowsForAttachmentLinks({ doc: document, host: pdfHost, rows: [row('PAPER1')] })
    expect(scanned.rows[0].links).toContain('https://bopi-loco.github.io/')
    // 身份页、论文落地页不算资源；参考列表页（第 9 页）里的仓库属于被引工作，不能算这篇的代码。
    expect(scanned.rows[0].links).not.toContain('https://orcid.org/0000-0002-1031-7621')
    expect(scanned.rows[0].links).not.toContain('https://arxiv.org/abs/2610.13087v1')
    expect(scanned.rows[0].links).not.toContain('https://github.com/someone/cited-tool')
    expect(scanned.rows[0].scanPages).toBe(10)
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

  it('ignores non-PDF attachments and reports the ones that are too large', async () => {
    const skipped = hostFixture({ 101: pdfAttachment('C:/tmp/one.pdf', false), 102: pdfAttachment('C:/tmp/two.pdf') })
    const notPdf = await scanRowsForAttachmentLinks({ doc: document, host: skipped, rows: [row('PAPER1')] })
    expect(notPdf.rows[0].links).toEqual([])
    expect(state.getDocument).not.toHaveBeenCalled()

    // 会议论文的带附录 PDF 常见 25～50 MB：这类必须真扫，不能静默跳过。
    io(() => new Uint8Array(22_000_000))
    const midSized = await scanRowsForAttachmentLinks({ doc: document, host: pdfHost, rows: [row('PAPER1')] })
    expect(midSized).toMatchObject({ parsed: 1, oversize: 0 })
    expect(state.getDocument).toHaveBeenCalledTimes(1)

    io(() => new Uint8Array(60_000_001))
    state.getDocument.mockClear()
    const tooBig = await scanRowsForAttachmentLinks({ doc: document, host: pdfHost, rows: [row('PAPER1')] })
    expect(tooBig.rows[0].attachmentScanned).toBe(true)
    expect(tooBig).toMatchObject({ parsed: 0, oversize: 1, unreadable: 0 })
    expect(state.getDocument).not.toHaveBeenCalled()
    // 跳过要说得出原因：否则用户会把"没扫到"读成"论文没有链接"。
    expect(quickReviewScanNotice(tooBig)).toContain('1 篇超过 60 MB')
  })

  it('names the papers that have no readable PDF instead of staying quiet', async () => {
    // 条目能读到、但一条附件都没有：这才是"确实没有 PDF"，要和"没读到附件列表"分开。
    const empty = { Items: { getByLibraryAndKey: () => ({ key: 'PAPER9', getAttachments: () => [] }), get: () => null } } as unknown as ZoteroLike
    const report = await scanRowsForAttachmentLinks({ doc: document, host: empty, rows: [row('PAPER9')] })
    expect(report).toMatchObject({ scanned: 1, parsed: 0, found: 0, noAttachment: 1, unavailable: 0, pages: 0 })
    expect(report.rows[0]).toMatchObject({ attachmentScanned: true, scanOutcome: 'noAttachment' })
    expect(quickReviewScanNotice(report)).toContain('1 篇没有可读的 PDF 附件')
    expect(quickReviewScanNotice(report)).toContain('发现 0 条链接、0 篇有附录')
  })

  it('leaves the rows unscanned when the parser or the file reader is unavailable', async () => {
    state.rejects = true
    const noParser = await scanRowsForAttachmentLinks({ doc: document, host: pdfHost, rows: [row('PAPER1')], onProgress: () => {} })
    // 一条都没查的行不能带已扫描标记：下次生成还要能重试。
    expect(noParser.rows[0].attachmentScanned).toBeUndefined()
    expect(noParser).toMatchObject({ scanned: 0, parserMissing: true })
    expect(quickReviewScanNotice(noParser)).toContain('本机未能加载 PDF 解析模块')

    delete (globalThis as typeof globalThis & { IOUtils?: unknown }).IOUtils
    state.rejects = false
    const noIO = await scanRowsForAttachmentLinks({ doc: document, host: pdfHost, rows: [row('PAPER1')] })
    expect(noIO).toMatchObject({ scanned: 0, parsed: 0, readerMissing: true })
    expect(noIO.rows[0].attachmentScanned).toBeUndefined()
    expect(quickReviewScanNotice(noIO)).toContain('缺少附件读取能力')
  })

  it('resolves items and attachments through the async API loaders Zotero 10 requires', async () => {
    // 真实缺陷：从收藏夹取到的条目没装载 childItems，Items.get 只看缓存。
    // 两者的失败都被吞成"没有附件"，卡片才写出"读了 0 页 · 未见附录"。
    const paper = {
      key: 'PAPER1', libraryID: 1, childItemsLoaded: false,
      async loadDataType(type: string) { if (type === 'childItems') this.childItemsLoaded = true },
      getAttachments() {
        if (!this.childItemsLoaded) throw new Error('Item data not yet loaded (childItems)')
        return [101]
      },
    }
    const host = {
      Items: {
        // Zotero 10：同步 get 只查缓存，未装载就抛 UnloadedDataException。
        get: () => { throw new Error('Item 101 not yet loaded') },
        getAsync: async (id: number) => (id === 101 ? pdfAttachment('C:/tmp/one.pdf') : false),
        getByLibraryAndKey: () => false,
        getByLibraryAndKeyAsync: async () => paper,
      },
    } as unknown as ZoteroLike
    const scanned = await scanRowsForAttachmentLinks({ doc: document, host, rows: [row('PAPER1')] })
    expect(scanned.rows[0].links).toContain('https://yushi-du.github.io/COLA/')
    expect(scanned.rows[0]).toMatchObject({ attachmentScanned: true, scanOutcome: 'parsed', scanPages: 10 })
    expect(scanned).toMatchObject({ parsed: 1, unavailable: 0 })
  })

  it('reports an unreadable attachment list instead of marking the paper as scanned', async () => {
    const host = {
      Items: {
        getByLibraryAndKeyAsync: async () => ({
          getAttachments: () => { throw new Error('Item data not yet loaded (childItems)') },
          loadDataType: async () => { throw new Error('database is closed') },
        }),
        get: () => false,
      },
    } as unknown as ZoteroLike
    const scanned = await scanRowsForAttachmentLinks({ doc: document, host, rows: [row('PAPER1')] })
    expect(scanned).toMatchObject({ scanned: 1, parsed: 0, noAttachment: 0, unavailable: 1 })
    // 未读到附件 ≠ 查过没有：行不能带已扫描标记，下次生成还要重试。
    expect(scanned.rows[0]).toMatchObject({ attachmentScanned: false, scanOutcome: 'unavailable' })
    expect(quickReviewScanNotice(scanned)).toContain('1 篇未能读取附件列表')
  })

  it('treats a broken library item as one paper without links', async () => {
    const broken = {
      Items: { getByLibraryAndKey: () => { throw new Error('gone') }, get: () => null },
    } as unknown as ZoteroLike
    const scanned = await scanRowsForAttachmentLinks({ doc: document, host: broken, rows: [row('PAPER1')] })
    expect(scanned).toMatchObject({ scanned: 1, found: 0, parsed: 0 })
    expect(scanned.rows[0].attachmentScanned).toBe(false)
  })
})

describe('deep read excerpt sourcing', () => {
  it('cuts a bounded excerpt locally and reports which sections and pages it came from', async () => {
    const source = await readDeepReadExcerpt({ doc: document, host: pdfHost, row: row('PAPER1') })
    expect(source.outcome).toBe('parsed')
    expect(source.attachmentID).toBe(101)
    expect(source.pages).toBe(10)
    expect(source.excerpt?.sections.map(section => [section.heading, section.part, section.page])).toEqual([
      ['Method', 'head', 3], ['Experiments', 'head', 5],
    ])
    expect(source.excerpt!.chars).toBeGreaterThan(0)
    expect(source.excerpt!.chars).toBeLessThanOrEqual(DEEP_READ_EXCERPT_CHARS_MAX)
    expect(source.excerpt!.chars).toBe(source.excerpt!.sections.reduce((total, section) => total + section.text.length, 0))
    // 账目写在回执里：确认框要能照实说出读了多少页、切了哪几节。
    expect(source.notice).toContain('本机读了 10 页')
    expect(source.notice).toContain('Method（节首，第 3 页）')
    // 正文边界之外的内容不进摘录：附录页那句数据描述没有被送出去。
    const sent = source.excerpt!.sections.map(section => section.text).join('\n')
    expect(sent).not.toContain('40 hours')
    expect(sent).not.toContain('Motion Dataset Selection')
  })

  it('reads the attachment with the most pages when a paper has several PDFs', async () => {
    state.numPages = [4, 10]
    const attachments: Record<number, unknown> = { 201: pdfAttachment('C:/tmp/short.pdf'), 202: pdfAttachment('C:/tmp/full.pdf') }
    const host = {
      Items: {
        getByLibraryAndKey: (_libraryID: number, key: string) => (key === 'PAPER1' ? { key, libraryID: 1, getAttachments: () => [201, 202] } : false),
        get: (id: number) => attachments[id],
      },
    } as unknown as ZoteroLike
    const source = await readDeepReadExcerpt({ doc: document, host, row: row('PAPER1') })
    // 深读要的是正文最全的那份 PDF：跳页也只有对着它才准。
    expect(source.attachmentID).toBe(202)
    expect(source.pages).toBe(14)
    expect(source.excerpt).not.toBeNull()
  })

  it('refuses without sending anything when the parser, the reader or the attachment list is unavailable', async () => {
    state.rejects = true
    const noParser = await readDeepReadExcerpt({ doc: document, host: pdfHost, row: row('PAPER1') })
    expect(noParser.excerpt).toBeNull()
    expect(noParser.outcome).toBe('unavailable')
    expect(noParser.notice).toContain('本机未能加载 PDF 解析模块')
    expect(noParser.notice).toContain('没有发送任何内容')

    state.rejects = false
    delete (globalThis as typeof globalThis & { IOUtils?: unknown }).IOUtils
    const noReader = await readDeepReadExcerpt({ doc: document, host: pdfHost, row: row('PAPER1') })
    expect(noReader.excerpt).toBeNull()
    expect(noReader.notice).toContain('缺少附件读取能力')
    expect(noReader.notice).toContain('没有发送任何内容')
    io(() => new Uint8Array([1, 2, 3]))

    const unreadableList = {
      Items: {
        getByLibraryAndKeyAsync: async () => ({
          getAttachments: () => { throw new Error('Item data not yet loaded (childItems)') },
          loadDataType: async () => { throw new Error('database is closed') },
        }),
        get: () => false,
      },
    } as unknown as ZoteroLike
    const noList = await readDeepReadExcerpt({ doc: document, host: unreadableList, row: row('PAPER1') })
    // 未读到附件列表 ≠ 这篇没有附件：说法必须分开，下次点击还要能重试。
    expect(noList.excerpt).toBeNull()
    expect(noList.outcome).toBe('unavailable')
    expect(noList.notice).toContain('未能读取这篇的附件列表')
    expect(noList.notice).toContain('没有发送任何内容')
  })

  it('says so when there is no PDF, when the PDF is too large, and when the run was stopped', async () => {
    const empty = { Items: { getByLibraryAndKey: () => ({ key: 'PAPER9', getAttachments: () => [] }), get: () => null } } as unknown as ZoteroLike
    const noPdf = await readDeepReadExcerpt({ doc: document, host: empty, row: row('PAPER9') })
    expect(noPdf.excerpt).toBeNull()
    expect(noPdf.outcome).toBe('noAttachment')
    expect(noPdf.notice).toContain('没有可读的 PDF 附件')
    expect(noPdf.notice).toContain('没有发送任何内容')

    io(() => new Uint8Array(60_000_001))
    state.getDocument.mockClear()
    const tooBig = await readDeepReadExcerpt({ doc: document, host: pdfHost, row: row('PAPER1') })
    expect(tooBig.excerpt).toBeNull()
    expect(tooBig.outcome).toBe('oversize')
    expect(tooBig.notice).toContain('超过 60 MB')
    expect(tooBig.notice).toContain('没有发送任何内容')
    expect(state.getDocument).not.toHaveBeenCalled()

    io(() => new Uint8Array([1, 2, 3]))
    const stopped = await readDeepReadExcerpt({ doc: document, host: pdfHost, row: row('PAPER1'), signal: AbortSignal.abort() })
    // 用户点了停止：不能报成"这篇没有 PDF 附件"。
    expect(stopped.excerpt).toBeNull()
    expect(stopped.notice).toContain('深读已停止')
    expect(stopped.notice).toContain('没有发送任何内容')
    expect(state.getDocument).not.toHaveBeenCalled()
  })

  it('reports a paper whose sections could not be located instead of shipping whole pages', async () => {
    state.texts = { 1: 'Plain prose without any heading at all.', 2: 'More plain prose in the same shape.' }
    const source = await readDeepReadExcerpt({ doc: document, host: pdfHost, row: row('PAPER1') })
    // 认不出一级小节就一段都不送：整页倒出去既突破预算，也说不清送的是哪一节。
    expect(source.excerpt).toBeNull()
    expect(source.outcome).toBe('parsed')
    expect(source.pages).toBe(10)
    expect(source.notice).toContain('没能切出可送的正文摘录')
    expect(source.notice).toContain('认不出正文一级小节')
    expect(source.notice).toContain('没有发送任何内容')
  })
})

describe('evidence page selection', () => {
  it('reads the whole paper when it fits and the head plus tail when it does not', async () => {
    const { evidencePageNumbers } = await import('./pdf-module')
    // 15 页那篇样本的 8 个附录小节全在中间页：中间页必须被读到。
    expect(evidencePageNumbers(15)).toEqual(Array.from({ length: 15 }, (_, index) => index + 1))
    const capped = evidencePageNumbers(200, 80)
    expect(capped).toHaveLength(80)
    expect(capped[0]).toBe(1)
    expect(capped[capped.length - 1]).toBe(200)
    expect(capped).toContain(40)
    expect(capped).not.toContain(41)
    expect(evidencePageNumbers(0)).toEqual([])
  })
})
