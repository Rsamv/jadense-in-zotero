/** jsdom 只挂载快速解析界面：验证派发一次、超量确认门、结构化渲染与历史回显；单篇深读必须逐篇确认，未确认不自动重发。不联网，也不读真实凭据。 */
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'

import { formatQuickReview, parseQuickReview, prepareQuickReviewPapers } from '@/chat/quick-review'
import { appendQuickReviewRecord, QUICK_REVIEW_HISTORY_PREF_KEY, type QuickReviewRecord } from '@/chat/quick-review-history'
import type { DeepReadExcerpt } from '@/chat/review-deep-read'
import { collectReviewRows, type DeepReadRunResult, type QuickReviewRunResult, type ReviewPaperRow } from './quick-review'
import type { ZoteroLike } from './runtime'
import { mountQuickReview } from './quick-review-ui'
import { initializeUiLocale } from './ui-preferences'

const EVALUATE_PREF_KEY = 'extensions.jadenseInZotero.quickReviewEvaluate'
const SCAN_PREF_KEY = 'extensions.jadenseInZotero.quickReviewScanLinks'

const state = vi.hoisted(() => ({ run: vi.fn(), scan: vi.fn(), deep: vi.fn(), excerpt: vi.fn(), copied: vi.fn() }))
vi.mock('./quick-review', async importActual => ({
  ...(await importActual<typeof import('./quick-review')>()),
  runQuickReview: (input: unknown) => state.run(input),
  runDeepRead: (input: unknown) => state.deep(input),
}))
// 附件扫描要读 pdf.js 与磁盘，jsdom 里两者都不存在：只换掉扫描本身，回执文案沿用真实实现。
vi.mock('./review-links', async importActual => ({
  ...(await importActual<typeof import('./review-links')>()),
  scanRowsForAttachmentLinks: (input: unknown) => state.scan(input),
  readDeepReadExcerpt: (input: unknown) => state.excerpt(input),
}))
// 剪贴板在 jsdom 里不可写：只截下要复制的文本，验证深读也进了复制全文。
vi.mock('./connection-display', async importActual => ({
  ...(await importActual<typeof import('./connection-display')>()),
  copyTextToClipboard: (_host: unknown, text: string) => { state.copied(text); return Promise.resolve(true) },
}))

// jsdom 不给 createElementNS 生成的 <dialog> 提供模态 API；按 Gecko 语义用 open 属性补齐开合与 close 事件。
const dialogShell = HTMLElement.prototype as HTMLElement & { showModal?: () => void; close?: (value?: string) => void }
if (!dialogShell.showModal) {
  dialogShell.showModal = function showModal(this: HTMLElement) { this.setAttribute('open', '') }
  dialogShell.close = function close(this: HTMLElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }
}

const paper = (id: number, title: string) => ({
  id, key: `K${id}`, libraryID: 1,
  isRegularItem: () => true, isAttachment: () => false, isNote: () => false,
  getField: (field: string) => (({ title, abstractNote: 'We report a measured result.', date: "2025-01-02", publicationTitle: "ICML", DOI: "10.1/x" }) as Record<string, string>)[field] ?? "",
  getCreators: () => [{ creatorType: "author", lastName: "Wu", firstName: "Lin" }],
  getTags: () => [],
})

function fixture(count: number) {
  initializeUiLocale({ locale: "zh-CN" })
  const records = Object.fromEntries(Array.from({ length: count }, (_, index) => [index + 1, paper(index + 1, `Paper ${index + 1}`)]))
  const collection = {
    id: 1, key: "ROOT", libraryID: 1, name: "ML", parentID: false,
    getChildItems: () => Object.values(records), getChildCollections: () => [],
  }
  const values = new Map<string, unknown>([
    ["extensions.jadenseInZotero.token", "fixture-token"],
    [QUICK_REVIEW_HISTORY_PREF_KEY, JSON.stringify({ version: 1, records: [] })],
  ])
  const launcher = vi.fn()
  const readerOpen = vi.fn(async (_id: number, _location?: { pageIndex?: number }) => undefined)
  const host = {
    Prefs: { get: (key: string) => values.get(key), set: (key: string, value: unknown) => { values.set(key, value) }, clear: (key: string) => { values.delete(key) } },
    Collections: { get: (id: number) => (id === 1 ? collection : undefined), getByLibrary: () => [collection] },
    getActiveZoteroPane: () => ({ getSelectedCollections: () => [collection] }),
    launchURL: launcher,
    Reader: { open: readerOpen },
  } as unknown as ZoteroLike
  return { host, values, launcher, readerOpen }
}

/** 用真实解析与渲染文本层造结果，只替换网络派发；记录结构与运行器写历史的字段一致。 */
const outcome = (rows: ReviewPaperRow[], evaluate = false): QuickReviewRunResult => {
  const papers = prepareQuickReviewPapers(rows)
  const covered = papers.slice(0, papers.length - 1)
  const response = JSON.stringify({
    overview: '这批文献都在压缩推理成本。',
    papers: covered.map(entry => ({ index: entry.index, hook: '端侧注意力压缩', question: '问题', idea: '思路', method: '方法', experiments: '单款设备对比', finding: '结论', limitation: '局限', tools: 'TFLite', code: 'yes', data: 'unknown', resourceNote: '摘要称代码随论文发布' })),
    comparison: [{ dimension: '优化对象', note: '差异说明' }],
    trends: '脉络说明', gaps: '空白说明',
    ...(evaluate ? { ratings: covered.map(entry => ({ index: entry.index, score: 72, value: '可复用', novelty: '增量', level: 'medium', basis: '仅摘要证据' })), rating_overview: '整体偏工程实用。' } : {}),
  })
  const result = parseQuickReview(response, papers, { evaluate })
  const text = formatQuickReview(result, papers, '快速解析 · ML')
  const record: QuickReviewRecord = {
    id: 'review-record', createdAt: new Date().toISOString(),
    collection: { libraryID: 1, key: 'ROOT', name: 'ML' }, model: '攻玉',
    papers: papers.map(paper => ({
      libraryID: paper.libraryID, itemKey: paper.itemKey, title: paper.title, authors: paper.authors,
      year: paper.year, publication: paper.publication, index: paper.index, abstractState: paper.abstractState,
      ...(paper.links.length ? { links: paper.links } : {}),
    })),
    overview: result.overview, notes: text, warnings: result.warnings,
    review: { notes: result.papers, comparison: result.comparison, trends: result.trends, gaps: result.gaps, ratings: result.ratings, ratingOverview: result.ratingOverview, evaluated: result.evaluated },
  }
  return { record, result, text, papers, historySaved: true }
}

/** 本机切出的有界摘录：只有这一段正文允许离开本机，确认框要照实报出字数与小节。 */
const excerptFixture = (): DeepReadExcerpt => {
  const sections = [{ heading: 'Method', part: 'head' as const, page: 3, text: 'We quantize the attention cache.' }]
  return { sections, readPages: 10, chars: sections.reduce((total, section) => total + section.text.length, 0) }
}
const deepSource = () => ({ excerpt: excerptFixture(), attachmentID: 101, outcome: 'parsed' as const, pages: 10, notice: `本机读了 10 页，切出 ${excerptFixture().chars} 字摘录：Method（节首，第 3 页）。` })
const deepOutcome = (): DeepReadRunResult => ({
  model: '攻玉',
  read: {
    summary: '把注意力缓存量化后跑在端侧。', method: '摘录：量化加融合核，超参未给。', evidence: '摘录：单款移动 NPU 上对比三个基线。',
    reproducibility: '摘录：训练设置缺失。', limitation: '摘录：只测了一款芯片。', basis: '摘录：数据为作者自述。', warnings: [], score: 72,
  },
})

const flush = async () => { for (let step = 0; step < 12; step += 1) await Promise.resolve(); await new Promise(resolve => setTimeout(resolve, 0)) }
const click = async (node: Element | undefined) => { (node as HTMLButtonElement | undefined)?.click(); await flush() }
const statusText = (root: Element) => root.querySelector('.jdx-manager-inline-status')?.textContent ?? ''
/** 扫描概况与勾选预算共用同一个类名：断言时把两段都拼上。 */
const scanLines = (root: Element) => [...root.querySelectorAll('.jdx-review-scan')].map(node => node.textContent).join(' ')
const dialogOf = (root: Element) => root.querySelector<HTMLDialogElement>('dialog.jdx-review-confirm')!
const dialogButton = (root: Element, text: string) => [...dialogOf(root).querySelectorAll('button')].find(button => button.textContent?.includes(text))
const deepButtons = (root: Element) => [...root.querySelectorAll<HTMLButtonElement>('.jdx-review-deep-button')]
/** 深读要写回已存在的那条记录，因此从历史点开，而不是走实盘派发。 */
const openSavedRecord = async (root: Element) => {
  const row = root.querySelector('.jdx-review-history-row')!
  await click([...row.querySelectorAll('button')].find(button => !button.textContent?.includes('删除')))
}

function mount(count: number, options: { evaluatePref?: boolean; scanPref?: boolean } = {}) {
  const { host, values, launcher, readerOpen } = fixture(count)
  if (options.evaluatePref) values.set(EVALUATE_PREF_KEY, true)
  if (options.scanPref === false) values.set(SCAN_PREF_KEY, false)
  state.run.mockImplementation(async (input: { rows: ReviewPaperRow[]; evaluate?: boolean }) => outcome(input.rows, input.evaluate === true))
  // 默认按"扫描没找到链接"返回：行为与原行一致，只有 attachmentScanned 标记被点亮。
  state.scan.mockImplementation(async ({ rows }: { rows: ReviewPaperRow[] }) => ({
    rows: rows.map(row => ({ ...row, attachmentScanned: true, scanPages: 10, scanOutcome: 'parsed' as const })),
    scanned: rows.length, parsed: rows.length, found: 0, withAppendix: 0, noAttachment: 0, pages: 30, oversize: 0, unreadable: 0, unavailable: 0, parserMissing: false, readerMissing: false,
  }))
  // 深读默认能切出摘录：这几条测试要看的是确认门与派发路径，不是取料本身。
  state.excerpt.mockImplementation(async () => deepSource())
  state.deep.mockImplementation(async () => deepOutcome())
  const review = mountQuickReview(document, host, vi.fn())
  const root = document.querySelector<HTMLElement>('#jadense-quick-review-dialog')!
  const labeled = (text: string) => [...root.querySelectorAll('button')].find(button => button.textContent?.includes(text))
  // 组件会把选中项并进可访问名（收藏夹：ML），因此按前缀匹配。
  const hostOf = (label: string) => root.querySelector<HTMLButtonElement>(`button.jdx-select-trigger[aria-label^="${label}"]`)!.closest<HTMLElement>('.jdx-select')!
  const pickText = (label: string) => hostOf(label).querySelector<HTMLElement>('.jdx-select-value')?.textContent ?? ''
  const choose = async (label: string, optionText: string) => {
    const select = hostOf(label)
    select.querySelector<HTMLButtonElement>('.jdx-select-trigger')!.click()
    ;[...select.querySelectorAll<HTMLElement>('[role="option"]')].find(node => node.textContent?.includes(optionText))!.click()
    await flush()
  }
  const evaluateSwitch = () => root.querySelector<HTMLInputElement>('input[aria-label="逐篇评价"]')!
  const scanSwitch = () => root.querySelector<HTMLInputElement>('input[aria-label="扫描附件找开源链接"]')!
  return { host, values, review, root, labeled, pickText, choose, evaluateSwitch, scanSwitch, launcher, readerOpen }
}

afterEach(() => { document.body.replaceChildren(); state.run.mockReset(); state.scan.mockReset(); state.deep.mockReset(); state.excerpt.mockReset(); state.copied.mockReset() })

it('scans the collection, dispatches once and renders each section', async () => {
  const { review, root, labeled, pickText } = mount(3)
  await review.open([1])
  expect(root.querySelectorAll('.jdx-review-papers label')).toHaveLength(3)
  // 收藏夹选择改用自绘列表框：窗口里不得再留原生 select，否则弹出层会透明叠字。
  expect(root.querySelectorAll('select')).toHaveLength(0)
  expect(root.querySelectorAll('.jdx-review-picker .jdx-select-option')).toHaveLength(1)
  expect(pickText('收藏夹')).toBe('ML')
  expect(root.textContent).toContain('扫描 3 个条目')
  expect(labeled('复制全文')?.hidden).toBe(true)
  await click(labeled('生成综述'))
  expect(state.run).toHaveBeenCalledTimes(1)
  const input = state.run.mock.calls[0][0]
  expect(input.rows).toHaveLength(3)
  expect(input.collection.path).toEqual(['ML'])
  expect(input.session.conversationId).toMatch(/^review-/)
  // 附件扫描在派发之前完成，派发拿到的是已经带链接标记的同一批行。
  expect(state.scan).toHaveBeenCalledTimes(1)
  expect(state.scan.mock.calls[0][0].rows).toHaveLength(3)
  expect(input.rows.every((row: ReviewPaperRow) => row.attachmentScanned)).toBe(true)
  expect([...root.querySelectorAll('.jdx-review-result > .jdx-review-block > h3')].map(node => node.textContent)).toEqual(['总览', '逐篇要点', '横向对比', '趋势与脉络', '空白与值得跟进', '提示'])
  expect(root.textContent).toContain('这批文献都在压缩推理成本。')
  expect(root.textContent).toContain('3. Paper 3')
  expect(root.textContent).toContain('模型未覆盖本篇')
  expect(root.textContent).toContain('1 篇未被覆盖')
  expect(labeled('复制全文')?.hidden).toBe(false)
  expect(labeled('停止')?.hidden).toBe(true)
  review.dispose()
})

it('sends six by default and holds a batch above twelve until the user confirms it', async () => {
  const { review, root, labeled, pickText, choose } = mount(13)
  await review.open([1])
  expect(pickText('一次发送篇数')).toBe('前 6 篇')
  expect(root.textContent).toContain('本次发送前 6 篇')
  await click(labeled('生成综述'))
  expect(state.run).toHaveBeenCalledTimes(1)
  expect(state.run.mock.calls[0][0].rows).toHaveLength(6)
  state.run.mockClear()
  await choose('一次发送篇数', '前 20 篇')
  expect(pickText('一次发送篇数')).toBe('前 20 篇')
  expect(root.textContent).toContain('本次发送 13 篇')
  await click(labeled('生成综述'))
  const dialog = root.querySelector<HTMLDialogElement>('dialog.jdx-review-confirm')!
  expect(dialog.hasAttribute('open')).toBe(true)
  expect(dialog.textContent).toContain('确认发送 13 篇摘要')
  await click([...dialog.querySelectorAll('button')].find(button => button.textContent === '取消'))
  expect(state.run).not.toHaveBeenCalled()
  await click(labeled('生成综述'))
  await click([...dialog.querySelectorAll('button')].find(button => button.textContent?.includes('确认发送')))
  expect(state.run).toHaveBeenCalledTimes(1)
  expect(state.run.mock.calls[0][0].rows).toHaveLength(13)
  review.dispose()
})

it('greys out generating while the analysis model is not configured', async () => {
  const { review, root, host, labeled, choose } = mount(2)
  await review.open([1])
  host.Prefs!.clear('extensions.jadenseInZotero.token')
  await choose('一次发送篇数', '前 12 篇')
  expect(labeled('生成综述')?.disabled).toBe(true)
  expect(root.textContent).toContain('模型未配置')
  expect(state.run).not.toHaveBeenCalled()
  review.dispose()
})

it('lists saved reviews and drops one without touching the library', async () => {
  const { review, root, values, labeled } = mount(2)
  values.set(QUICK_REVIEW_HISTORY_PREF_KEY, JSON.stringify({
    version: 1,
    records: [{
      id: 'review-old', createdAt: '2026-10-20T02:00:00.000Z',
      collection: { libraryID: 1, key: 'ROOT', name: 'ML / Edge' }, model: '攻玉',
      papers: [{ libraryID: 1, itemKey: 'K1', title: 'Paper 1', authors: 'Wu Lin', year: '2025', publication: 'ICML' }],
      overview: '旧总览', notes: '旧综述正文',
    }],
  }))
  await review.open([1])
  const row = root.querySelector('.jdx-review-history-row')!
  expect(row.textContent).toContain('ML / Edge')
  await click([...row.querySelectorAll('button')].find(button => !button.textContent?.includes('删除')))
  expect(root.textContent).toContain('旧综述正文')
  // 旧记录没有结构化正文，只能退回整段文字，但不得伪造成逐篇卡片。
  expect(root.querySelector('pre.jdx-review-raw')).not.toBeNull()
  expect(root.querySelectorAll('.jdx-review-card')).toHaveLength(0)
  await click([...row.querySelectorAll('button')].find(button => button.textContent?.includes('删除')))
  expect(JSON.parse(String(values.get(QUICK_REVIEW_HISTORY_PREF_KEY))).records).toEqual([])
  expect(labeled('生成综述')?.disabled).toBe(false)
  review.dispose()
})

it('folds the checked rating switch into the same single dispatch', async () => {
  const { review, root, values, labeled, evaluateSwitch } = mount(3)
  await review.open([1])
  const toggle = evaluateSwitch()
  expect(toggle.checked).toBe(false)
  toggle.checked = true; toggle.dispatchEvent(new Event('change'))
  await flush()
  expect(values.get(EVALUATE_PREF_KEY)).toBe(true)
  expect(root.querySelector('.jdx-review-model')?.textContent).toContain('不额外增加请求次数')
  await click(labeled('生成综述'))
  expect(state.run).toHaveBeenCalledTimes(1)
  expect(state.run.mock.calls[0][0].evaluate).toBe(true)
  toggle.checked = false; toggle.dispatchEvent(new Event('change'))
  await flush()
  expect(values.get(EVALUATE_PREF_KEY)).toBe(false)
  expect(root.querySelector('.jdx-review-model')?.textContent).not.toContain('不额外增加请求次数')
  review.dispose()
})

it('reads attachment links once per batch and shows only the link text', async () => {
  const { review, root, labeled } = mount(3)
  state.scan.mockImplementation(async ({ rows, onProgress }: { rows: ReviewPaperRow[]; onProgress?: (message: string) => void }) => {
    onProgress?.('正在扫描附件里的开源链接 · 1/3')
    return {
      rows: rows.map((row, position) => ({ ...row, links: [...(row.links ?? []), ...(position === 0 ? ['https://github.com/tiny/attn'] : [])], attachmentScanned: true, scanPages: 10, scanOutcome: 'parsed' as const })),
      scanned: rows.length, parsed: rows.length, found: 1, withAppendix: 0, noAttachment: 0, pages: 30, oversize: 0, unreadable: 0, unavailable: 0, parserMissing: false, readerMissing: false,
    }
  })
  await review.open([1])
  await click(labeled('生成综述'))
  expect(state.scan).toHaveBeenCalledTimes(1)
  // 扫描进度用界面回执，派发拿到的是补上链接的同一批行。
  expect(typeof state.scan.mock.calls[0][0].onProgress).toBe('function')
  expect(state.run.mock.calls[0][0].rows[0].links).toEqual(['https://github.com/tiny/attn'])
  expect([...root.querySelectorAll('.jdx-review-link')].map(node => node.textContent)).toContain('https://github.com/tiny/attn')
  // 链接只作为文本展示：界面不生成可点击的外部地址。
  expect(root.querySelector('a.jdx-review-link')).toBeNull()
  // 扫描回填不得抹掉用户取消的勾选：勾掉哪几篇决定下一次发出去什么。
  const boxes = [...root.querySelectorAll<HTMLInputElement>('.jdx-review-papers input[type="checkbox"]')]
  boxes[1].checked = false; boxes[1].dispatchEvent(new Event('change'))
  await click(labeled('生成综述'))
  expect(state.scan).toHaveBeenCalledTimes(1)
  expect(state.run).toHaveBeenCalledTimes(2)
  expect(state.run.mock.calls[1][0].rows.map((row: ReviewPaperRow) => row.itemKey)).toEqual(['K1', 'K3'])
  expect(state.run.mock.calls[1][0].rows[0].links).toEqual(['https://github.com/tiny/attn'])
  review.dispose()
})

it('keeps the tick icons in step with select all and clear selection', async () => {
  const { review, root, labeled } = mount(3)
  await review.open([1])
  const boxes = () => [...root.querySelectorAll<HTMLInputElement>('.jdx-review-papers input[type="checkbox"]')]
  expect(boxes().map(node => node.checked)).toEqual([true, true, true])
  await click(labeled('全不选'))
  // 提示说发 0 篇，图标就必须全空：否则用户会以为勾还在。
  expect(boxes().map(node => node.checked)).toEqual([false, false, false])
  expect(scanLines(root)).toContain('未勾选任何文献')
  expect(labeled('生成综述')?.disabled).toBe(true)
  await click(labeled('全选'))
  expect(boxes().map(node => node.checked)).toEqual([true, true, true])
  expect(scanLines(root)).toContain('本次发送 3 篇')
  expect(labeled('生成综述')?.disabled).toBe(false)
  review.dispose()
})

it('shows appendix titles from the local pages without wiping the user tick marks', async () => {
  const { review, root, labeled } = mount(3)
  state.scan.mockImplementation(async ({ rows }: { rows: ReviewPaperRow[] }) => ({
    rows: rows.map((row, position) => position === 0
      ? { ...row, links: ['https://expressive-humanoid.github.io'], appendix: ['Motion Dataset Selection', 'Additional Training Details'], attachmentScanned: true, scanPages: 13, scanOutcome: 'parsed' as const }
      : { ...row, attachmentScanned: true, scanPages: 0, scanOutcome: 'oversize' as const }),
    scanned: rows.length, parsed: rows.length - 1, found: 1, withAppendix: 1, noAttachment: 0, pages: 26, oversize: 1, unreadable: 0, unavailable: 0, parserMissing: false, readerMissing: false,
  }))
  await review.open([1])
  const boxes = () => [...root.querySelectorAll<HTMLInputElement>('.jdx-review-papers input[type="checkbox"]')]
  boxes()[2].checked = false; boxes()[2].dispatchEvent(new Event('change'))
  await click(labeled('生成综述'))
  // 扫描回填会重画清单：徽章补上附录部分，用户取消的勾选必须原样保留。
  expect([...root.querySelectorAll('.jdx-review-paper-row .jdx-review-badge')].map(node => node.textContent)).toContain('附录 2 部分')
  expect(boxes()[2].checked).toBe(false)
  expect([...root.querySelectorAll('.jdx-review-appendix-item')].map(node => node.textContent))
    .toEqual(['1. Motion Dataset Selection', '2. Additional Training Details'])
  // 扫描回执在结果之后仍然可见：不然"没扫到链接"会被读成"论文没有链接"。取消勾选的那篇不进扫描。
  expect(statusText(root)).toContain('读了 1 篇 PDF 共 26 页')
  expect(statusText(root)).toContain('1 篇超过 60 MB')
  // 每篇卡片都写出扫描账目：0 条也要写，否则沉默会被读成"没扫"。
  expect([...root.querySelectorAll('.jdx-review-evidence')].map(node => node.textContent))
    .toContain('附件：读了 13 页 · 发现链接 1 条 · 附录存在（2 部分）')
  // 标题行按用户要求的口径：只列一级标题并顺序编号。
  expect([...root.querySelectorAll('.jdx-review-links-label')].map(node => node.textContent)).toContain('附录存在，包括以下部分：')
  review.dispose()
})

it('opens local links in the browser and jumps to the appendix page in the reader', async () => {
  const { review, root, labeled, launcher, readerOpen } = mount(2)
  state.scan.mockImplementation(async ({ rows }: { rows: ReviewPaperRow[] }) => ({
    rows: rows.map(row => ({
      ...row,
      links: ['https://expressive-humanoid.github.io'],
      appendix: ['Motion Dataset Selection'],
      appendixRefs: [{ title: 'Motion Dataset Selection', page: 7, attachmentID: 101 }],
      attachmentScanned: true, scanPages: 13, scanOutcome: 'parsed' as const,
    })),
    scanned: rows.length, parsed: rows.length, found: rows.length, withAppendix: rows.length, noAttachment: 0, pages: 26, oversize: 0, unreadable: 0, unavailable: 0, parserMissing: false, readerMissing: false,
  }))
  await review.open([1])
  await click(labeled('生成综述'))
  // 链接是按钮而不是裸文本：点一下交给系统浏览器，插件自己不访问地址。
  const link = root.querySelector<HTMLButtonElement>('button.jdx-review-link')!
  expect(link.textContent).toBe('https://expressive-humanoid.github.io')
  link.click(); await flush()
  expect(launcher).toHaveBeenCalledWith('https://expressive-humanoid.github.io/')
  // 附录小节带页码：点一下让阅读器定位到同一页，pageIndex 从 0 开始。
  const jump = root.querySelector<HTMLButtonElement>('button.jdx-review-jump')!
  expect(jump.textContent).toContain('1. Motion Dataset Selection')
  expect(jump.textContent).toContain('第 7 页')
  jump.click(); await flush()
  expect(readerOpen).toHaveBeenCalledWith(101, { pageIndex: 6 })
  review.dispose()
})

it('collects local evidence into one collapsible box between metadata and the model badges', async () => {
  const { review, root, labeled, readerOpen } = mount(2)
  state.scan.mockImplementation(async ({ rows }: { rows: ReviewPaperRow[] }) => ({
    rows: rows.map(row => ({
      ...row,
      links: ['https://expressive-humanoid.github.io'],
      appendix: ['Motion Dataset Selection'],
      appendixRefs: [{ title: 'Motion Dataset Selection', page: 7, attachmentID: 101 }],
      structure: { headings: ['Method', 'Experiments'], figures: 1, tables: 1, references: null, ablation: 1, baselines: 2, humanEval: 0 },
      sectionRefs: [{ title: 'Method', page: 3, attachmentID: 101 }, { title: 'Experiments', page: 5, attachmentID: 101 }],
      attachmentScanned: true, scanPages: 13, scanOutcome: 'parsed' as const,
    })),
    scanned: rows.length, parsed: rows.length, found: rows.length, withAppendix: rows.length, withStructure: rows.length, noAttachment: 0, pages: 26, oversize: 0, unreadable: 0, unavailable: 0, parserMissing: false, readerMissing: false,
  }))
  await review.open([1])
  await click(labeled('生成综述'))
  const card = root.querySelector<HTMLElement>('.jdx-review-card')!
  const panel = card.querySelector<HTMLElement>('.jdx-review-evidence-panel')!
  // 位置就是用户点出的那一段：作者行之下、代码／数据徽章之上，自己单独成框。
  expect(panel.previousElementSibling?.className).toBe('jdx-review-card-meta')
  expect(panel.nextElementSibling?.className).toBe('jdx-review-flags')
  expect(panel.querySelector<HTMLElement>('.jdx-review-evidence-panel-summary')?.textContent)
    .toBe('附件 13 页 · 链接 1 条 · 附录 1 部分 · 正文小节 2 节')
  const body = panel.querySelector<HTMLElement>('.jdx-review-evidence-panel-body')!
  const toggle = panel.querySelector<HTMLButtonElement>('.jdx-review-evidence-panel-toggle')!
  // 默认展开：第一次看到时不该先把证据藏起来。
  expect(body.hidden).toBe(false)
  expect(toggle.textContent).toBe('收起')
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  await click(toggle)
  expect(body.hidden).toBe(true)
  expect(toggle.textContent).toBe('展开')
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  // 正文一级小节带页码，点了让阅读器翻到标题所在页（pageIndex 从 0 开始）。
  const method = [...panel.querySelectorAll<HTMLButtonElement>('button.jdx-review-jump')]
    .find(node => node.textContent?.includes('Method'))!
  expect(method.textContent).toContain('第 3 页')
  method.click(); await flush()
  expect(readerOpen).toHaveBeenCalledWith(101, { pageIndex: 2 })
  review.dispose()
})

it('says so when the local PDF parser never loads', async () => {
  const { review, root, labeled } = mount(3)
  state.scan.mockImplementation(async ({ rows }: { rows: ReviewPaperRow[] }) => ({
    rows: [...rows], scanned: 0, parsed: 0, found: 0, oversize: 0, unreadable: 0, unavailable: 0, parserMissing: true, readerMissing: false,
  }))
  await review.open([1])
  await click(labeled('生成综述'))
  expect(statusText(root)).toContain('本机未能加载 PDF 解析模块')
  // 解析器没起来时不得把行标记成已扫描：下次生成还要能重试。
  expect(state.run.mock.calls[0][0].rows.every((row: ReviewPaperRow) => !row.attachmentScanned)).toBe(true)
  review.dispose()
})

it('leaves local attachments alone when the scan switch is off', async () => {
  const { review, root, values, labeled, scanSwitch } = mount(3, { scanPref: false })
  await review.open([1])
  expect(scanSwitch().checked).toBe(false)
  expect(root.querySelector('.jdx-review-model')?.textContent).toContain('不读取 PDF')
  await click(labeled('生成综述'))
  expect(state.scan).not.toHaveBeenCalled()
  expect(state.run).toHaveBeenCalledTimes(1)
  expect(state.run.mock.calls[0][0].rows.every((row: ReviewPaperRow) => !row.attachmentScanned)).toBe(true)
  scanSwitch().checked = true; scanSwitch().dispatchEvent(new Event('change'))
  await flush()
  expect(values.get(SCAN_PREF_KEY)).toBe(true)
  expect(root.querySelector('.jdx-review-model')?.textContent).toContain('只送出链接文本、附录一级标题与标题／计数，不送正文')
  review.dispose()
})

it('pairs each digest card with its rating so they scroll together', async () => {
  const { review, root, labeled, evaluateSwitch } = mount(3)
  await review.open([1])
  evaluateSwitch().checked = true; evaluateSwitch().dispatchEvent(new Event('change'))
  await click(labeled('生成综述'))
  expect(root.textContent).toContain('逐篇要点与评价')
  const pairs = [...root.querySelectorAll('.jdx-review-pair')]
  // 一行表头加三篇并排：要点与评价同属一行，因此无需另做滚动同步。
  expect(pairs).toHaveLength(4)
  expect(pairs[0].querySelectorAll('.jdx-review-pair-head')).toHaveLength(2)
  expect(pairs[1].querySelector('.jdx-review-card h4')?.textContent).toContain('1. Paper 1')
  expect(pairs[1].querySelector('.jdx-review-rating')?.textContent).toContain('中等')
  expect(pairs[1].querySelector('.jdx-review-flag-medium')).not.toBeNull()
  // 分数给量程，悬停说明评分口径（只评内容，不评写作与期刊）。
  const score = pairs[1].querySelector<HTMLElement>('.jdx-review-score')
  expect(score?.textContent).toBe('72/100')
  expect(score?.getAttribute('title')).toContain('内容评分 72/100')
  expect(score?.getAttribute('title')).toContain('写作、排版')
  expect(score?.getAttribute('title')).toContain('仅摘要证据')
  expect([...pairs[1].querySelectorAll('.jdx-review-fields dt')].map(node => node.textContent))
    .toEqual(['一句话', '问题', '思路', '方法', '实验流程', '结论', '局限', '工具', '实用价值', '创新性', '依据'])
  expect([...root.querySelectorAll('.jdx-review-flag-yes')].map(node => node.textContent)).toContain('代码：明确给出')
  expect([...root.querySelectorAll('.jdx-review-flag-unknown')].map(node => node.textContent)).toContain('数据：未见说明')
  // 模型没评价的那篇仍占一行，并明确标注未评价，而不是悄悄消失。
  expect(pairs[3].querySelector('.jdx-review-card h4')?.textContent).toContain('3. Paper 3')
  expect(pairs[3].querySelector('.jdx-review-rating')?.textContent).toContain('未评价')
  expect(root.textContent).toContain('总体评价')
  review.dispose()
})

it('reopens a saved review as cards with their ratings instead of a text dump', async () => {
  const { review, root, host } = mount(3)
  const rows = (await collectReviewRows(host, 1)).rows
  appendQuickReviewRecord(host.Prefs!, outcome(rows, true).record)
  await review.open([1])
  const historyRow = root.querySelector('.jdx-review-history-row')!
  await click([...historyRow.querySelectorAll('button')].find(button => !button.textContent?.includes('删除')))
  expect(root.textContent).toContain('历史 · ML')
  expect(root.textContent).toContain('逐篇要点与评价')
  expect(root.querySelectorAll('.jdx-review-card')).toHaveLength(3)
  expect(root.querySelectorAll('.jdx-review-pair')).toHaveLength(4)
  expect(root.querySelectorAll('.jdx-review-flag-medium')).toHaveLength(2)
  expect(root.querySelector('pre.jdx-review-raw')).toBeNull()
  expect([...root.querySelectorAll('.jdx-review-fields dt')].map(node => node.textContent)).toContain('实验流程')
  review.dispose()
})

it('deep reads one paper only after the user confirms the bounded excerpt', async () => {
  const { review, root, host, values, labeled, readerOpen } = mount(2)
  const rows = (await collectReviewRows(host, 1)).rows
  appendQuickReviewRecord(host.Prefs!, outcome(rows, true).record)
  await review.open([1])
  await openSavedRecord(root)
  const excerpt = excerptFixture()
  expect(deepButtons(root).map(button => button.textContent)).toEqual(['深读这篇（单独一次请求）', '深读这篇（单独一次请求）'])
  await click(deepButtons(root)[0])
  // 本机切摘录这一步不发送：确认门出现之前，派发一次都不能发生。
  expect(state.excerpt).toHaveBeenCalledTimes(1)
  expect(state.excerpt.mock.calls[0][0].row).toMatchObject({ libraryID: 1, itemKey: 'K1', title: 'Paper 1' })
  expect(state.deep).not.toHaveBeenCalled()
  expect(dialogOf(root).hasAttribute('open')).toBe(true)
  expect(dialogOf(root).textContent).toContain('送出这一篇的正文摘录？')
  expect(dialogOf(root).textContent).toContain('单独一次请求、单独计费')
  expect(dialogOf(root).textContent).toContain(`送出 ${excerpt.chars} 字正文摘录`)
  expect(dialogOf(root).textContent).toContain('Method（节首，第 3 页）')
  expect(dialogOf(root).textContent).toContain('本机为切取它读了 10 页')
  expect(dialogOf(root).textContent).toContain('摘录之外的正文、图表、公式与附录都不发送')
  expect(dialogOf(root).textContent).toContain('结果未确认时插件不会自动重发')
  await click(dialogButton(root, '取消'))
  expect(state.deep).not.toHaveBeenCalled()
  expect(statusText(root)).toContain('已取消深读；没有发送任何内容。')

  await click(deepButtons(root)[0])
  await click(dialogButton(root, '确认送出摘录'))
  expect(state.deep).toHaveBeenCalledTimes(1)
  expect(state.deep.mock.calls[0][0].session.conversationId).toMatch(/^deep-read-/)
  expect(state.deep.mock.calls[0][0].excerpt.chars).toBe(excerpt.chars)
  expect(state.deep.mock.calls[0][0].allowUnconfirmedRetry).toBeUndefined()
  expect(statusText(root)).toContain('深读已完成并写入本机历史。')
  // 结果写在自己的卡片里：账目在结论之前，小节可以跳页自查。
  const deep = root.querySelectorAll('.jdx-review-deep')[0]
  expect(deep.textContent).toContain('单篇深读（单独一次请求）')
  expect(deep.querySelector('.jdx-review-score')?.textContent).toBe('72/100')
  expect(deep.textContent).toContain(`本机读了 10 页，送出 ${excerpt.chars} 字摘录：`)
  expect([...deep.querySelectorAll('.jdx-review-fields dt')].map(node => node.textContent))
    .toEqual(['一句话', '方法细节', '证据强度', '可复现性', '局限', '评分依据'])
  await click(deep.querySelector<HTMLButtonElement>('.jdx-review-jump'))
  expect(readerOpen).toHaveBeenCalledWith(101, { pageIndex: 2 })
  expect(deepButtons(root)[0].textContent).toBe('重新深读（再发一次请求）')
  // 只有被点开的那一篇带上深读，另一篇仍是原样。
  expect(root.querySelectorAll('.jdx-review-deep')[1].querySelector('.jdx-review-fields')).toBeNull()
  const stored = JSON.parse(String(values.get(QUICK_REVIEW_HISTORY_PREF_KEY))).records[0]
  expect(stored.papers[0].deepRead.summary).toBe('把注意力缓存量化后跑在端侧。')
  expect(stored.papers[0].deepRead.sections).toEqual([{ heading: 'Method', part: 'head', page: 3, attachmentID: 101 }])
  expect(stored.papers[1].deepRead).toBeUndefined()
  // 复制全文要带上深读：那几段是用户另外花一次请求换来的。
  await click(labeled('复制全文'))
  expect(state.copied).toHaveBeenCalledTimes(1)
  expect(state.copied.mock.calls[0][0]).toContain('深读 · Paper 1')
  expect(state.copied.mock.calls[0][0]).toContain(`送出摘录 ${excerpt.chars} 字 · 本机读了 10 页`)
  expect(state.copied.mock.calls[0][0]).toContain('内容评分：72/100（中等）')
  review.dispose()
})

it('stops in the local step and sends nothing when no section could be cut', async () => {
  const { review, root, host } = mount(2)
  appendQuickReviewRecord(host.Prefs!, outcome((await collectReviewRows(host, 1)).rows, true).record)
  state.excerpt.mockImplementation(async () => ({
    excerpt: null, outcome: 'parsed' as const, pages: 10,
    notice: '本机读了 10 页，但没能切出可送的正文摘录：认不出正文一级小节，或这些小节里没有成段正文；这次没有发送任何内容。',
  }))
  await review.open([1])
  await openSavedRecord(root)
  await click(deepButtons(root)[0])
  expect(state.excerpt).toHaveBeenCalledTimes(1)
  expect(state.deep).not.toHaveBeenCalled()
  // 确认门都不该出现：没有摘录可送，问用户"要不要送"是假选择。
  expect(dialogOf(root).hasAttribute('open')).toBe(false)
  expect(statusText(root)).toContain('没能切出可送的正文摘录')
  expect(statusText(root)).toContain('没有发送任何内容')
  expect(root.querySelector('.jdx-review-deep .jdx-review-fields')).toBeNull()
  expect(deepButtons(root)[0].textContent).toBe('深读这篇（单独一次请求）')
  review.dispose()
})

it('never resends an unconfirmed deep read and reuses the same session once authorized', async () => {
  const { review, root, host, values } = mount(2)
  appendQuickReviewRecord(host.Prefs!, outcome((await collectReviewRows(host, 1)).rows, true).record)
  state.deep.mockImplementation(async () => {
    throw Object.assign(new Error('【未知错误】BYOK 上次执行结果未确认。已有内容保留；请先核对提供商，不会自动重发。'), { unconfirmed: true, code: 'BYOK_EXECUTION_UNCONFIRMED' })
  })
  await review.open([1])
  await openSavedRecord(root)
  await click(deepButtons(root)[0])
  await click(dialogButton(root, '确认送出摘录'))
  expect(state.deep).toHaveBeenCalledTimes(1)
  expect(statusText(root)).toContain('不会自动重发')
  // 未确认之后弹出的是授权门；用户不点，插件自己一次都不重发。
  expect(dialogOf(root).hasAttribute('open')).toBe(true)
  expect(dialogOf(root).textContent).toContain('上次执行结果未确认')
  expect(dialogOf(root).textContent).toContain('插件不会自动重发，以免重复计费')
  await click(dialogButton(root, '取消'))
  expect(state.deep).toHaveBeenCalledTimes(1)
  expect(root.querySelector('.jdx-review-deep .jdx-review-fields')).toBeNull()
  expect(JSON.parse(String(values.get(QUICK_REVIEW_HISTORY_PREF_KEY))).records[0].papers.every((paper: { deepRead?: unknown }) => !paper.deepRead)).toBe(true)

  await click(deepButtons(root)[0])
  await click(dialogButton(root, '确认送出摘录'))
  expect(state.deep).toHaveBeenCalledTimes(2)
  expect(state.deep.mock.calls[1][0].allowUnconfirmedRetry).toBeUndefined()
  await click(dialogButton(root, '已核对，授权重发'))
  expect(state.deep).toHaveBeenCalledTimes(3)
  // 授权后的重发沿用同一次会话：不产生第二条未确认记录。
  expect(state.deep.mock.calls[2][0].allowUnconfirmedRetry).toBe(true)
  expect(state.deep.mock.calls[2][0].session).toEqual(state.deep.mock.calls[1][0].session)
  await click(dialogButton(root, '取消'))
  expect(state.deep).toHaveBeenCalledTimes(3)
  review.dispose()
})
