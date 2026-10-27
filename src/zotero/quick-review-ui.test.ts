/** jsdom 只挂载快速解析界面：验证派发一次、超量确认门、结构化渲染与历史回显；不联网，也不读真实凭据。 */
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'

import { formatQuickReview, parseQuickReview, prepareQuickReviewPapers } from '@/chat/quick-review'
import { appendQuickReviewRecord, QUICK_REVIEW_HISTORY_PREF_KEY, type QuickReviewRecord } from '@/chat/quick-review-history'
import { collectReviewRows, type QuickReviewRunResult, type ReviewPaperRow } from './quick-review'
import type { ZoteroLike } from './runtime'
import { mountQuickReview } from './quick-review-ui'
import { initializeUiLocale } from './ui-preferences'

const EVALUATE_PREF_KEY = 'extensions.jadenseInZotero.quickReviewEvaluate'
const SCAN_PREF_KEY = 'extensions.jadenseInZotero.quickReviewScanLinks'

const state = vi.hoisted(() => ({ run: vi.fn(), scan: vi.fn() }))
vi.mock('./quick-review', async importActual => ({
  ...(await importActual<typeof import('./quick-review')>()),
  runQuickReview: (input: unknown) => state.run(input),
}))
// 附件扫描要读 pdf.js 与磁盘，jsdom 里两者都不存在：只换掉扫描本身，回执文案沿用真实实现。
vi.mock('./review-links', async importActual => ({
  ...(await importActual<typeof import('./review-links')>()),
  scanRowsForAttachmentLinks: (input: unknown) => state.scan(input),
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
  const host = {
    Prefs: { get: (key: string) => values.get(key), set: (key: string, value: unknown) => { values.set(key, value) }, clear: (key: string) => { values.delete(key) } },
    Collections: { get: (id: number) => (id === 1 ? collection : undefined), getByLibrary: () => [collection] },
    getActiveZoteroPane: () => ({ getSelectedCollections: () => [collection] }),
  } as unknown as ZoteroLike
  return { host, values }
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
    ...(evaluate ? { ratings: covered.map(entry => ({ index: entry.index, value: '可复用', novelty: '增量', level: 'medium', basis: '仅摘要证据' })), rating_overview: '整体偏工程实用。' } : {}),
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

const flush = async () => { for (let step = 0; step < 12; step += 1) await Promise.resolve(); await new Promise(resolve => setTimeout(resolve, 0)) }
const click = async (node: Element | undefined) => { (node as HTMLButtonElement | undefined)?.click(); await flush() }
const statusText = (root: Element) => root.querySelector('.jdx-manager-inline-status')?.textContent ?? ''
/** 扫描概况与勾选预算共用同一个类名：断言时把两段都拼上。 */
const scanLines = (root: Element) => [...root.querySelectorAll('.jdx-review-scan')].map(node => node.textContent).join(' ')

function mount(count: number, options: { evaluatePref?: boolean; scanPref?: boolean } = {}) {
  const { host, values } = fixture(count)
  if (options.evaluatePref) values.set(EVALUATE_PREF_KEY, true)
  if (options.scanPref === false) values.set(SCAN_PREF_KEY, false)
  state.run.mockImplementation(async (input: { rows: ReviewPaperRow[]; evaluate?: boolean }) => outcome(input.rows, input.evaluate === true))
  // 默认按"扫描没找到链接"返回：行为与原行一致，只有 attachmentScanned 标记被点亮。
  state.scan.mockImplementation(async ({ rows }: { rows: ReviewPaperRow[] }) => ({
    rows: rows.map(row => ({ ...row, attachmentScanned: true })),
    scanned: rows.length, parsed: rows.length, found: 0, withAppendix: 0, noAttachment: 0, pages: 30, oversize: 0, unreadable: 0, parserMissing: false, readerMissing: false,
  }))
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
  return { host, values, review, root, labeled, pickText, choose, evaluateSwitch, scanSwitch }
}

afterEach(() => { document.body.replaceChildren(); state.run.mockReset(); state.scan.mockReset() })

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
      rows: rows.map((row, position) => ({ ...row, links: [...(row.links ?? []), ...(position === 0 ? ['https://github.com/tiny/attn'] : [])], attachmentScanned: true })),
      scanned: rows.length, parsed: rows.length, found: 1, withAppendix: 0, noAttachment: 0, pages: 30, oversize: 0, unreadable: 0, parserMissing: false, readerMissing: false,
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
      ? { ...row, links: ['https://expressive-humanoid.github.io'], appendix: ['A. Motion Dataset Selection', 'B. Additional Training Details'], attachmentScanned: true, scanPages: 13 }
      : { ...row, attachmentScanned: true, scanPages: 8 }),
    scanned: rows.length, parsed: rows.length - 1, found: 1, withAppendix: 1, noAttachment: 0, pages: 26, oversize: 1, unreadable: 0, parserMissing: false, readerMissing: false,
  }))
  await review.open([1])
  const boxes = () => [...root.querySelectorAll<HTMLInputElement>('.jdx-review-papers input[type="checkbox"]')]
  boxes()[2].checked = false; boxes()[2].dispatchEvent(new Event('change'))
  await click(labeled('生成综述'))
  // 扫描回填会重画清单：徽章补上附录小节，用户取消的勾选必须原样保留。
  expect([...root.querySelectorAll('.jdx-review-paper-row .jdx-review-badge')].map(node => node.textContent)).toContain('附录 2 节')
  expect(boxes()[2].checked).toBe(false)
  expect([...root.querySelectorAll('.jdx-review-appendix-item')].map(node => node.textContent))
    .toEqual(['A. Motion Dataset Selection', 'B. Additional Training Details'])
  // 扫描回执在结果之后仍然可见：不然"没扫到链接"会被读成"论文没有链接"。取消勾选的那篇不进扫描。
  expect(statusText(root)).toContain('读了 1 篇 PDF 共 26 页')
  expect(statusText(root)).toContain('1 篇超过 60 MB')
  // 每篇卡片都写出扫描账目：0 条也要写，否则沉默会被读成"没扫"。
  expect([...root.querySelectorAll('.jdx-review-evidence')].map(node => node.textContent))
    .toContain('附件：读了 13 页 · 发现链接 1 条 · 附录小节 2 节')
  review.dispose()
})

it('says so when the local PDF parser never loads', async () => {
  const { review, root, labeled } = mount(3)
  state.scan.mockImplementation(async ({ rows }: { rows: ReviewPaperRow[] }) => ({
    rows: [...rows], scanned: 0, parsed: 0, found: 0, oversize: 0, unreadable: 0, parserMissing: true, readerMissing: false,
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
  expect(root.querySelector('.jdx-review-model')?.textContent).toContain('只送出链接文本，不送正文')
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
