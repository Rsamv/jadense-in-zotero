/** 快速解析窗口：收藏夹选择、逐篇勾选、一次派发综述与本机历史；模型文字只用 textContent 呈现。 */
import { copyTextToClipboard } from './connection-display'
import { uiText } from './ui-preferences'
import { createJdxSelect } from './ui/select'
import type { ZoteroLike } from './runtime'
import {
  QUICK_REVIEW_CONFIRM_LIMIT,
  QUICK_REVIEW_DEFAULT_LIMIT,
  QUICK_REVIEW_MAX_LIMIT,
  ratingLevelForScore,
  reviewAvailabilityText,
  reviewRatingText,
  reviewScanState,
  reviewStructureText,
  type QuickReviewAvailability,
  type QuickReviewDisplayPaper,
  type QuickReviewRatingLevel,
  type QuickReviewResult,
  type ReviewAppendixRef,
  type ReviewPaperRow,
} from '@/chat/quick-review'
import { deepReadSectionText, formatDeepRead, type DeepReadExcerpt, type StoredDeepRead } from '@/chat/review-deep-read'
import {
  clearQuickReviewHistory,
  quickReviewRecordView,
  readQuickReviewHistory,
  removeQuickReviewRecord,
  saveQuickReviewDeepRead,
  type QuickReviewRecord,
} from '@/chat/quick-review-history'
import {
  collectReviewRows,
  listReviewCollections,
  newDeepReadSession,
  newQuickReviewSession,
  quickReviewModelState,
  runDeepRead,
  runQuickReview,
  type DeepReadRunResult,
  type DeepReadSession,
  type QuickReviewError,
  type QuickReviewRunResult,
  type QuickReviewSession,
  type ReviewCollection,
} from './quick-review'
import { quickReviewScanNotice, readDeepReadExcerpt, scanRowsForAttachmentLinks } from './review-links'

const MAX_VISIBLE_ROWS = 200
const EVALUATE_PREF_KEY = 'extensions.jadenseInZotero.quickReviewEvaluate'
const SCAN_PREF_KEY = 'extensions.jadenseInZotero.quickReviewScanLinks'
const rowKey = (row: { libraryID: number; itemKey: string }) => `${row.libraryID}:${row.itemKey}`
const AVAILABILITY_CLASS: Record<QuickReviewAvailability, string> = {
  yes: 'jdx-review-flag-yes', no: 'jdx-review-flag-no', unknown: 'jdx-review-flag-unknown',
}
const RATING_CLASS: Record<QuickReviewRatingLevel, string> = {
  high: 'jdx-review-flag-high', medium: 'jdx-review-flag-medium', low: 'jdx-review-flag-low', unclear: 'jdx-review-flag-unclear',
}
/** 代码/数据的判定口径直接写在悬停提示里：同屏能解释为什么是"未见说明"。 */
const RESOURCE_RULE: Record<'code' | 'data', string> = {
  code: uiText(
    '代码的判定：只有带仓库路径的代码地址（如 github.com/账号/仓库、gitlab.com/账号/仓库、huggingface.co/spaces/…），或正文明确写“代码已开源/开放”才算明确给出。项目主页、数据集网站、论文落地页，以及“将开源”“审稿后开源”的承诺都不算。',
    'Code counts only with a repository URL (e.g. github.com/user/repo, gitlab.com/user/repo, huggingface.co/spaces/…) or text stating the code is released/open. Project homepages, dataset sites, paper landing pages, and promises ("will be released", "upon acceptance") do not count.'),
  data: uiText(
    '数据的判定：只有带数据集路径的地址（如 huggingface.co/datasets/…、zenodo.org/record/…），或正文明确写“数据集已公开/已发布”才算明确给出。数据由作者提供、可向作者索取、承诺后续发布都不算。',
    'Data counts only with a dataset URL (e.g. huggingface.co/datasets/…, zenodo.org/record/…) or text stating the dataset is public/released. Data "available from the authors", on request, or promised later does not count.'),
}
/** 评分口径：悬停分数时复述量程与档位，评分依据放在最后一行。 */
const ratingHoverText = (rating: { level: QuickReviewRatingLevel; basis: string; score?: number }) => [
  uiText(
    `内容评分 ${rating.score ?? '—'}/100（五个维度各 20 分：问题价值、方法创新、证据强度、可复现性、应用潜力；写作、排版、图表、期刊档次与引用量不计分）。`,
    `Content score ${rating.score ?? '—'}/100 (five 20-point dimensions: problem value, methodological novelty, strength of evidence, reproducibility, applicability; writing, layout, figures, venue, and citations are excluded).`),
  uiText('档位：80 及以上＝高；65–79＝中；50–64＝低；低于 50＝无法判断。', 'Levels: 80+ high; 65–79 medium; 50–64 low; below 50 unclear.'),
  ...(rating.basis ? [uiText(`评分依据：${rating.basis}`, `Basis: ${rating.basis}`)] : []),
].join('\n')

export function mountQuickReview(doc: Document, host: ZoteroLike, openSettings: () => void) {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => {
    const node = doc.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElementTagNameMap[K]
    node.textContent = text; node.className = className; return node
  }
  const button = (text: string, action: () => void, className = '') => {
    const node = make('button', text, className); node.type = 'button'; node.addEventListener('click', action); return node
  }
  const sectionTitle = (text: string) => make('h3', text, 'jdx-review-section-title')

  const dialog = make('main', '', 'jdx-review-dialog'); dialog.id = 'jadense-quick-review-dialog'
  const heading = make('h2', uiText('收藏夹快速解析', 'Collection quick review')); heading.id = 'jadense-quick-review-title'
  dialog.setAttribute('aria-labelledby', heading.id)
  const modelLine = make('p', '', 'jdx-review-model')
  const body = make('div', '', 'jdx-review-body')
  const side = make('div', '', 'jdx-review-side')
  const main = make('div', '', 'jdx-review-main')

  // chrome 文档里原生 select 的弹出层是文档内 XUL menupopup，会透明叠字；两处选择都用自绘列表框。
  const collectionPick = createJdxSelect(make('div', '', 'jdx-review-pick'), { ariaLabel: uiText('收藏夹', 'Collection'), searchPlaceholder: uiText('搜索收藏夹', 'Search collections') })
  const scanSummary = make('p', '', 'jdx-review-scan')
  const listTools = make('div', '', 'jdx-review-tools')
  const paperList = make('div', '', 'jdx-review-papers')
  const limitPick = createJdxSelect(make('div', '', 'jdx-review-pick'), { ariaLabel: uiText('一次发送篇数', 'Papers per request'), compact: true })
  const limitSizes = [...new Set([QUICK_REVIEW_DEFAULT_LIMIT, QUICK_REVIEW_CONFIRM_LIMIT, 20, QUICK_REVIEW_MAX_LIMIT])]
  limitPick.setOptions(limitSizes.map(size => ({ value: String(size), label: uiText(`前 ${size} 篇`, `First ${size}`) })), String(QUICK_REVIEW_DEFAULT_LIMIT))
  const evaluatePick = make('input'); evaluatePick.type = 'checkbox'
  evaluatePick.setAttribute('aria-label', uiText('逐篇评价', 'Rate each paper'))
  try { evaluatePick.checked = host.Prefs?.get(EVALUATE_PREF_KEY, true) === true } catch { evaluatePick.checked = false }
  const evaluateRow = make('label', '', 'jdx-review-switch')
  evaluateRow.append(evaluatePick, make('span', uiText('逐篇评价（实用价值、创新性）', 'Rate each paper (practical value, novelty)')))
  evaluatePick.addEventListener('change', () => {
    // 记住勾选只是便利：写偏好失败也照常按当前状态生成。
    try { host.Prefs?.set(EVALUATE_PREF_KEY, evaluatePick.checked, true) } catch { /* 可选设置。 */ }
    updateActions()
  })
  // 开源链接常在附件首页页脚或文末的 Code/Data availability，题录里没有时要本机扫一遍。
  const scanPick = make('input'); scanPick.type = 'checkbox'
  scanPick.setAttribute('aria-label', uiText('扫描附件找开源链接', 'Scan attachments for code links'))
  try { scanPick.checked = host.Prefs?.get(SCAN_PREF_KEY, true) !== false } catch { scanPick.checked = true }
  const scanRow = make('label', '', 'jdx-review-switch')
  scanRow.append(scanPick, make('span', uiText('扫描附件找开源链接与版面统计（只送出链接文本与标题／计数）', 'Scan attachments for code links and layout counts (only link text and titles/counts are sent)')))
  scanPick.addEventListener('change', () => {
    try { host.Prefs?.set(SCAN_PREF_KEY, scanPick.checked, true) } catch { /* 可选设置。 */ }
    updateActions()
  })
  const budgetLine = make('p', '', 'jdx-review-scan')
  const historyList = make('div', '', 'jdx-review-history')
  const resultBox = make('article', '', 'jdx-review-result')
  const status = make('p', '', 'jdx-manager-inline-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite')
  const actions = make('div', '', 'jdx-review-actions')

  let collections: ReviewCollection[] = []
  let rows: ReviewPaperRow[] = []
  let scanned = 0, truncated = false, busy = false, generation = 0
  let view: QuickReviewRunResult | QuickReviewRecord | null = null
  let session = newQuickReviewSession()
  let controller: AbortController | undefined
  const included = new Set<string>()
  /** 序号 → 这一篇的深读结果：卡片与复制文本都从这里取，换一批综述就清空。 */
  let deepReads = new Map<number, StoredDeepRead>()
  /** 被收起证据框的篇目序号：换一批综述时一并清空，新结果默认展开。 */
  const collapsedEvidence = new Set<number>()

  const currentCollection = () => collections.find(entry => String(entry.id) === collectionPick.getValue()) ?? null
  const chosenRows = () => rows.filter(row => included.has(rowKey(row))).slice(0, Number(limitPick.getValue()) || QUICK_REVIEW_DEFAULT_LIMIT)
  const isRecord = (value: QuickReviewRunResult | QuickReviewRecord): value is QuickReviewRecord => !('result' in value)
  /** 深读写回哪条记录：实时结果与历史记录都带 id，没有结果就没有可写的地方。 */
  const currentRecordID = () => (!view ? '' : isRecord(view) ? view.id : view.record.id)
  const titleOf = (index: number) => {
    const papers = !view ? [] : view.papers as readonly { index?: number; title: string }[]
    return papers.find((paper, position) => (paper.index ?? position + 1) === index)?.title ?? `#${index}`
  }
  // 复制文本要带上深读：否则用户拿走的综述里没有他刚花了一次请求换来的那几段。
  const copySource = () => {
    const base = !view ? '' : isRecord(view) ? view.notes : view.text
    if (!base) return ''
    const extra = [...deepReads.entries()].sort((left, right) => left[0] - right[0]).map(([index, read]) => formatDeepRead(read, titleOf(index)))
    return extra.length ? `${base}\n\n${extra.join('\n\n')}` : base
  }

  const updateActions = () => {
    const model = quickReviewModelState(host)
    modelLine.textContent = model.ready
      ? uiText(
        `使用「${model.label}」汇总整个子收藏夹；发送题录与摘要${scanPick.checked ? '，并解析本机附件以提取开源链接与版面统计（只送出链接文本、附录一级标题与标题／计数，不送正文）' : '，不读取 PDF'}。一次调用可能消耗额度。${evaluatePick.checked ? ' 同一次调用会附带逐篇评价，不额外增加请求次数。' : ''} 单篇「深读」要逐篇确认，是单独一次请求、单独计费。`,
        `Summarises the sub-collection with ${model.label}. Bibliographic metadata and abstracts are sent${scanPick.checked ? ', and local attachments are parsed for code links and layout counts (only link text, appendix titles and titles/counts leave the machine)' : ', never PDFs'}. One request that may use credits.${evaluatePick.checked ? ' The same request also returns per-paper ratings, without adding a call.' : ''} A per-paper deep read needs its own confirmation and is a separate, separately billed request.`,
      )
      : `${uiText('模型未配置：', 'Model not configured: ')}${model.issue}`
    generate.disabled = busy || !model.ready || !chosenRows().length
    copyButton.hidden = !view
    stop.hidden = !busy
    listTools.hidden = !rows.length
    paperList.hidden = !rows.length
    limitPick.setDisabled(busy)
    collectionPick.setDisabled(busy)
    evaluatePick.disabled = busy
    scanPick.disabled = busy
    status.hidden = !status.textContent
  }

  const renderScan = () => {
    scanSummary.textContent = rows.length
      ? uiText(`扫描 ${scanned} 个条目，得到 ${rows.length} 篇可解析文献${truncated ? '（超出扫描上限，已停止）' : ''}。`, `${scanned} entries scanned, ${rows.length} papers reviewable${truncated ? ' (scan limit reached)' : ''}.`)
      : uiText('这个收藏夹及其子收藏夹里没有可解析的文献条目。', 'This collection and its sub-collections contain no reviewable papers.')
  }
  const renderBudget = () => {
    const picked = rows.filter(row => included.has(rowKey(row))).length
    const send = chosenRows().length
    budgetLine.textContent = !picked
      ? uiText('未勾选任何文献。', 'No papers selected.')
      : picked > send
        ? uiText(`已勾选 ${picked} 篇，本次发送前 ${send} 篇；摘要过长时会自动压缩。`, `${picked} checked; the first ${send} are sent. Long abstracts are compressed automatically.`)
        : uiText(`本次发送 ${send} 篇；摘要过长时会自动压缩。`, `${send} papers will be sent. Long abstracts are compressed automatically.`)
  }

  /** 勾选状态只认 included：批量选择时重画图标，否则提示说发 0 篇而清单仍全是勾。 */
  const syncChecks = () => {
    for (const label of Array.from(paperList.querySelectorAll<HTMLElement>('label[data-key]'))) {
      const input = label.querySelector<HTMLInputElement>('input[type="checkbox"]')
      if (input) input.checked = included.has(label.dataset.key ?? '')
    }
  }

  /** keepSelection 用于扫描回填：清单要补上徽章，但用户在计费前取消的勾选不能被抹掉。 */
  const renderRows = (keepSelection = false) => {
    paperList.replaceChildren()
    const visible = rows.slice(0, MAX_VISIBLE_ROWS)
    if (!keepSelection) {
      included.clear()
      visible.forEach(row => included.add(rowKey(row)))
    }
    for (const row of visible) {
      const label = make('label', '', 'jdx-review-paper-row'); label.dataset.key = rowKey(row)
      const input = make('input'); input.type = 'checkbox'; input.checked = included.has(rowKey(row))
      input.setAttribute('aria-label', row.title)
      input.addEventListener('change', () => { if (input.checked) included.add(rowKey(row)); else included.delete(rowKey(row)); renderBudget(); updateActions() })
      const text = make('span', '', 'jdx-review-paper-text')
      text.append(make('strong', row.title))
      const meta = [row.creators.map(creator => creator.name).filter(Boolean).join('、'), row.date?.slice(0, 4), row.publicationTitle].filter(Boolean).join(' · ')
      if (meta) text.append(make('small', meta))
      if (!String(row.abstract ?? '').trim()) text.append(make('em', uiText('无摘要', 'no abstract'), 'jdx-review-badge'))
      if (row.links?.length) text.append(make('em', uiText(`本机发现 ${row.links.length} 条链接`, `${row.links.length} link(s) found locally`), 'jdx-review-badge'))
      // 扫过但一无所获也要标记：否则清单上看不出"扫了"和"没扫"的差别；没读到附件则必须单独说。
      else {
        const scan = reviewScanState(row)
        if (scan === 'parsed') text.append(make('em', uiText(`附件已扫 ${row.scanPages ?? 0} 页，未见链接`, `Attachment scanned (${row.scanPages ?? 0} pages), no link`), 'jdx-review-badge'))
        else if (scan === 'noAttachment') text.append(make('em', uiText('未找到 PDF 附件', 'no PDF attachment'), 'jdx-review-badge'))
        else if (scan === 'unavailable') text.append(make('em', uiText('附件未读取', 'attachment unread'), 'jdx-review-badge'))
        else if (scan === 'oversize') text.append(make('em', uiText('PDF 超 60 MB', 'PDF over 60 MB'), 'jdx-review-badge'))
        else if (scan === 'unreadable') text.append(make('em', uiText('PDF 读取失败', 'PDF unreadable'), 'jdx-review-badge'))
      }
      if (row.appendix?.length) text.append(make('em', uiText(`附录 ${row.appendix.length} 部分`, `${row.appendix.length} appendix section(s)`), 'jdx-review-badge'))
      // 读到标记但排不出编号也算"有附录"：不写这一条，用户会以为附录检测没做。
      else if (row.appendixMarked) text.append(make('em', uiText('有附录（未列出部分）', 'appendix present (sections unnumbered)'), 'jdx-review-badge'))
      label.append(input, text); paperList.append(label)
    }
    if (rows.length > visible.length) paperList.append(make('p', uiText(`收藏夹内还有 ${rows.length - visible.length} 篇未列出；请先在 Zotero 中拆分收藏夹。`, `${rows.length - visible.length} further papers are hidden. Split the collection in Zotero first.`)))
    renderScan(); renderBudget(); updateActions()
  }

  const notice = (lines: string[]) => {
    const block = make('section', '', 'jdx-review-block jdx-review-caution')
    const list = make('ul')
    for (const line of lines) list.append(make('li', line))
    block.append(sectionTitle(uiText('提示', 'Notes')), list)
    return block
  }
  const rawBlock = (text: string) => {
    const block = make('section', '', 'jdx-review-block')
    block.append(sectionTitle(uiText('原始返回', 'Raw response')), make('pre', text, 'jdx-review-raw'))
    return block
  }
  const proseBlock = (title: string, value: string) => {
    if (!value.trim()) return null
    const block = make('section', '', 'jdx-review-block')
    block.append(sectionTitle(title), make('p', value))
    return block
  }

  const fieldsBlock = (pairs: [string, string][], fallback?: [string, string]) => {
    const fields = make('dl', '', 'jdx-review-fields')
    for (const [label, value] of pairs) {
      if (!value.trim()) continue
      fields.append(make('dt', label), make('dd', value))
    }
    if (fallback) fields.append(make('dt', fallback[0]), make('dd', fallback[1]))
    return fields
  }
  const resourceBadges = (note: QuickReviewResult['papers'][number]) => {
    const row = make('div', '', 'jdx-review-flags')
    for (const [resource, kind, value] of [['code', uiText('代码', 'Code'), note.code], ['data', uiText('数据', 'Data'), note.data]] as const) {
      const flag = make('span', `${kind}：${reviewAvailabilityText(value)}`, `jdx-review-flag ${AVAILABILITY_CLASS[value]}`)
      // 判定口径就在徽章上，用户不必猜"明确给出"是按什么算的。
      flag.title = RESOURCE_RULE[resource]
      row.append(flag)
    }
    if (note.resourceNote) row.append(make('span', note.resourceNote, 'jdx-review-flag-note'))
    return row
  }
  /** 只认 http/https：历史记录或旧题录里混进的 javascript: 之类不能变成可执行动作。 */
  const externalHref = (link: string) => {
    try {
      const url = new URL(link)
      return /^https?:$/u.test(url.protocol) ? url.href : ''
    } catch { return '' }
  }
  /** 用户点链接才交给系统浏览器；插件自身不访问任何地址，失败只报一句、不覆盖扫描回执之外的内容。 */
  const visitLink = (link: string) => {
    const href = externalHref(link)
    if (!href) { status.textContent = uiText('只打开 http/https 链接。', 'Only http and https links are opened.'); return }
    const launcher = host.launchURL
    if (typeof launcher !== 'function') { status.textContent = uiText('当前 Zotero 版本无法打开外部链接。', 'This Zotero build cannot open external links.'); return }
    try { launcher.call(host, href) } catch { status.textContent = uiText('无法打开该链接。', 'The link could not be opened.') }
  }
  /** 小节跳页：阅读器按 PDF 物理页定位，pageIndex 从 0 开始。附录与正文小节共用这一个入口。 */
  const openReaderPage = async (ref: ReviewAppendixRef) => {
    // Reader 的签名在各子系统里各不相同，这里只认"能带页码打开附件"这一种用法。
    const reader = (host as ZoteroLike & { Reader?: { open?(itemID: number, location?: { pageIndex?: number }): unknown | Promise<unknown> } }).Reader
    if (typeof reader?.open !== 'function') { status.textContent = uiText('当前 Zotero 版本无法在阅读器中定位页码。', 'This Zotero build cannot jump to a page in the reader.'); return }
    try {
      await Promise.resolve(reader.open.call(reader, ref.attachmentID, { pageIndex: Math.max(0, ref.page - 1) }))
    } catch {
      status.textContent = uiText('无法定位到这一页；附件可能已被删除或移动。', 'Could not jump to that page; the attachment may have been deleted or moved.')
    }
  }
  /** 链接是本地发现的证据：点一下交给系统浏览器。 */
  const linksRow = (links: string[]) => {
    const row = make('div', '', 'jdx-review-links')
    row.append(make('span', uiText('本地链接（点击在浏览器打开）', 'Local links (click to open)'), 'jdx-review-links-label'))
    for (const link of links) {
      if (!externalHref(link)) { row.append(make('code', link, 'jdx-review-link')); continue }
      const open = button(link, () => visitLink(link), 'jdx-review-link')
      open.title = uiText(`在浏览器中打开 ${link}`, `Open ${link} in the browser`)
      row.append(open)
    }
    return row
  }
  /**
   * 附录标题同样只是本机证据：只说明这篇有附录、大致分几部分，不代表读过附录内容。
   * 只列顶层标题并顺序编号，不把大小标题混在一起；扫描记下页码的点一下就能翻到那一页。
   */
  const appendixRow = (titles: string[], refs: ReviewAppendixRef[] | undefined) => {
    const row = make('div', '', 'jdx-review-links')
    const refOf = (title: string) => refs?.find(entry => entry.title.toLowerCase() === title.toLowerCase())
    const label = make('span', uiText('附录存在，包括以下部分：', 'Appendix present, with these sections:'), 'jdx-review-links-label')
    if (titles.some(title => refOf(title))) label.title = uiText('点击小节可在 Zotero 阅读器中跳到该页', 'Click a section to jump to its page in the Zotero reader')
    row.append(label)
    titles.forEach((title, position) => {
      const numbered = `${position + 1}. ${title}`
      const ref = refOf(title)
      if (!ref) { row.append(make('span', numbered, 'jdx-review-appendix-item')); return }
      const jump = button(numbered, () => { void openReaderPage(ref) }, 'jdx-review-appendix-item jdx-review-jump')
      jump.title = uiText(`在 Zotero 阅读器中打开第 ${ref.page} 页`, `Open page ${ref.page} in the Zotero reader`)
      jump.append(make('small', uiText(`第 ${ref.page} 页`, `p. ${ref.page}`), 'jdx-review-jump-page'))
      row.append(jump)
    })
    return row
  }
  /**
   * 扫描账目：0 条链接、0 节附录也要写出来。上一版只在有结果时才画这一行，
   * 于是"扫过但确实没有"与"根本没扫"在界面上完全一样，用户只能看到沉默。
   */
  const evidenceRow = (paper: QuickReviewDisplayPaper) => {
    // 旧历史记录没有扫描字段：那时的情况已经不可知，画"未扫描"是编造，干脆不画。
    if (paper.attachmentScanned === undefined) return null
    const scan = reviewScanState(paper)
    if (!scan) return null
    const row = make('div', '', 'jdx-review-evidence')
    const links = paper.links?.length ?? 0
    const sections = paper.appendix?.length ?? 0
    const appendix = sections ? uiText(`附录存在（${sections} 部分）`, `appendix present (${sections} section(s))`) : paper.appendixMarked ? uiText('有附录（未列出部分）', 'appendix present (unnumbered)') : uiText('未见附录', 'no appendix')
    // 没读成附件时说"读了 0 页"会被读成"这篇确实什么都没有"：每种失败各说各的。
    row.textContent = scan === 'parsed'
      ? uiText(`附件：读了 ${paper.scanPages ?? 0} 页 · 发现链接 ${links} 条 · ${appendix}`, `Attachment: ${paper.scanPages ?? 0} page(s) read · ${links} link(s) · ${appendix}`)
      : scan === 'noAttachment' ? uiText('附件：未找到 PDF 附件（题录与摘要仍已发送）', 'Attachment: no PDF attachment found (metadata and abstract were still sent)')
        : scan === 'oversize' ? uiText('附件：PDF 超过 60 MB，未读取', 'Attachment: PDF over 60 MB, not read')
          : scan === 'unreadable' ? uiText('附件：PDF 读取或解析失败', 'Attachment: PDF could not be read or parsed')
            : scan === 'unavailable' ? uiText('附件：未能读取附件（重新生成会重试）', 'Attachment: attachment unavailable (retried on the next run)')
              : uiText('附件：本次未扫描（可勾选「扫描附件找开源链接」后重新生成）', 'Attachment: not scanned (enable "Scan attachments for code links" and generate again)')
    return row
  }
  /**
   * 版面统计是本机数出来的，不是模型判断：单独一行并写明这点，
   * 否则用户会把"消融 3 次"读成模型认定这篇做了三次消融。
   */
  const structureRow = (paper: QuickReviewDisplayPaper) => {
    const summary = reviewStructureText(paper.structure)
    if (!summary) return null
    const row = make('div', '', 'jdx-review-evidence')
    row.textContent = `${uiText('版面统计（本机数出）', 'Layout counts (measured locally)')}：${summary}`
    row.title = uiText(
      '客户端在本机解析 PDF 时数出的：正文一级小节标题数、图注与表注的去重编号数、参考文献条目数，以及「消融」「基线／对比」「人工评测／用户研究」这些措辞在全文里出现的次数。只有标题与计数会随请求发送，正文一句不出机器。「参考文献 未数出」表示版式没认出来，不是 0 条。',
      'Counted locally while parsing the PDF: top-level section titles, distinct figure/table caption numbers, reference entries, and how often the words "ablation", "baseline/comparison" and "user study/human evaluation" appear. Only titles and counts are sent; no body text leaves the machine. "reference count unavailable" means the layout was not recognised, not zero.',
    )
    if (paper.structure?.headings.length) {
      const titles = make('div', '', 'jdx-review-links')
      const label = make('span', uiText('正文一级小节', 'Top-level sections'), 'jdx-review-links-label')
      const refs = paper.sectionRefs
      const refOf = (title: string) => refs?.find(entry => entry.title.toLowerCase() === title.toLowerCase())
      if (paper.structure.headings.some(title => refOf(title))) {
        label.title = uiText('点击小节可在 Zotero 阅读器中跳到该页', 'Click a section to jump to its page in the Zotero reader')
      }
      titles.append(label)
      for (const title of paper.structure.headings) {
        const ref = refOf(title)
        if (!ref) { titles.append(make('span', title, 'jdx-review-appendix-item')); continue }
        const jump = button(title, () => { void openReaderPage(ref) }, 'jdx-review-appendix-item jdx-review-jump')
        jump.title = uiText(`在 Zotero 阅读器中打开第 ${ref.page} 页`, `Open page ${ref.page} in the Zotero reader`)
        jump.append(make('small', uiText(`第 ${ref.page} 页`, `p. ${ref.page}`), 'jdx-review-jump-page'))
        titles.append(jump)
      }
      const wrap = make('div', '', 'jdx-review-structure')
      wrap.append(row, titles)
      return wrap
    }
    return row
  }
  /**
   * 折叠栏上的账目：不展开也要能看出这篇扫到了什么。
   * 只写有内容的项——没扫附件就写"未扫描"，而不是三个 0 排成一行。
   */
  const evidenceSummary = (paper: QuickReviewDisplayPaper) => {
    const parts: string[] = []
    const scan = reviewScanState(paper)
    if (scan === 'parsed') parts.push(uiText(`附件 ${paper.scanPages ?? 0} 页`, `${paper.scanPages ?? 0} page(s)`))
    else if (scan === 'noAttachment') parts.push(uiText('无 PDF 附件', 'no PDF attachment'))
    else if (scan === 'oversize') parts.push(uiText('附件超 60 MB', 'attachment over 60 MB'))
    else if (scan === 'unreadable') parts.push(uiText('附件读取失败', 'attachment unreadable'))
    else if (scan === 'unavailable') parts.push(uiText('附件未能读取', 'attachment unavailable'))
    else if (scan === 'notScanned') parts.push(uiText('附件未扫描', 'attachment not scanned'))
    if (paper.links?.length) parts.push(uiText(`链接 ${paper.links.length} 条`, `${paper.links.length} link(s)`))
    if (paper.appendix?.length) parts.push(uiText(`附录 ${paper.appendix.length} 部分`, `${paper.appendix.length} appendix section(s)`))
    else if (paper.appendixMarked) parts.push(uiText('有附录', 'appendix present'))
    if (paper.structure?.headings.length) parts.push(uiText(`正文小节 ${paper.structure.headings.length} 节`, `${paper.structure.headings.length} body section(s)`))
    return parts.join(' · ')
  }
  /**
   * 本机证据单独成框：附件账目、版面统计、正文小节、本地链接与附录都收在这里，
   * 与下面的模型评价分开——这些是客户端读出来的，不是模型说的。
   * 默认展开（第一次看到时不该先藏起来）；折叠状态只在本窗口内记住。
   */
  const evidencePanel = (paper: QuickReviewDisplayPaper) => {
    const rows: HTMLElement[] = []
    const scan = evidenceRow(paper); if (scan) rows.push(scan)
    const structure = structureRow(paper); if (structure) rows.push(structure)
    if (paper.links?.length) rows.push(linksRow(paper.links))
    if (paper.appendix?.length) rows.push(appendixRow(paper.appendix, paper.appendixRefs))
    if (!rows.length) return null
    const collapsed = collapsedEvidence.has(paper.index)
    const panel = make('section', '', 'jdx-review-evidence-panel')
    const head = make('div', '', 'jdx-review-evidence-panel-head')
    head.append(make('span', uiText('本机证据', 'Local evidence'), 'jdx-review-evidence-panel-title'))
    head.append(make('span', evidenceSummary(paper), 'jdx-review-evidence-panel-summary'))
    const panelBody = make('div', '', 'jdx-review-evidence-panel-body')
    for (const row of rows) panelBody.append(row)
    panelBody.hidden = collapsed
    const toggle = button(collapsed ? uiText('展开', 'Show') : uiText('收起', 'Hide'), () => {
      const next = !panelBody.hidden
      panelBody.hidden = next
      if (next) collapsedEvidence.add(paper.index); else collapsedEvidence.delete(paper.index)
      toggle.textContent = next ? uiText('展开', 'Show') : uiText('收起', 'Hide')
      toggle.setAttribute('aria-expanded', String(!next))
    }, 'jdx-review-evidence-panel-toggle')
    toggle.setAttribute('aria-expanded', String(!collapsed))
    head.append(toggle)
    panel.append(head, panelBody)
    return panel
  }
  /**
   * 深读账目与结果：先写清"本机读了多少页、送出去哪几节多少字"，再给结论，
   * 否则用户会把"读了三节摘录"当成"读了整篇"。小节带附件 ID 时可以跳页自查。
   */
  const deepReadBlock = (paper: QuickReviewDisplayPaper, onDeepRead: () => void) => {
    const read = deepReads.get(paper.index)
    const wrap = make('div', '', 'jdx-review-deep')
    if (read) {
      const title = make('h4', uiText('单篇深读（单独一次请求）', 'Deep read (a separate request)'), 'jdx-review-rating-title')
      if (read.score !== undefined) {
        const level = ratingLevelForScore(read.score)
        title.append(make('span', reviewRatingText(level), `jdx-review-flag ${RATING_CLASS[level]}`))
        const score = make('span', `${read.score}/100`, 'jdx-review-score')
        score.title = ratingHoverText({ level, basis: read.basis, score: read.score })
        title.append(score)
      }
      const account = make('div', '', 'jdx-review-links')
      const label = make('span', uiText(`本机读了 ${read.readPages} 页，送出 ${read.chars} 字摘录：`, `${read.readPages} page(s) read locally, ${read.chars} characters sent:`), 'jdx-review-links-label')
      label.title = uiText(
        '深读是单独一次请求、单独计费：客户端在本机读这篇的 PDF，只切出至多三节、合计不超过 1200 字的正文摘录送出去，摘录之外的正文、图表、公式与附录都不发送。切不出小节时一段都不送。',
        'A deep read is a separate, separately billed request: the client reads this PDF locally and sends at most three sections, no more than 1200 characters of body text. Nothing else in the body, figures, formulas or the appendix is sent. If no section can be located, nothing is sent at all.',
      )
      account.append(label)
      for (const section of read.sections) {
        const text = uiText(`${section.heading}（${section.part === 'tail' ? '节尾' : '节首'}，第 ${section.page} 页）`, `${section.heading} (${section.part === 'tail' ? 'tail' : 'head'}, p. ${section.page})`)
        if (!section.attachmentID) { account.append(make('span', text, 'jdx-review-appendix-item')); continue }
        const jump = button(text, () => { void openReaderPage({ title: section.heading, page: section.page, attachmentID: section.attachmentID! }) }, 'jdx-review-appendix-item jdx-review-jump')
        jump.title = uiText(`在 Zotero 阅读器中打开第 ${section.page} 页`, `Open page ${section.page} in the Zotero reader`)
        account.append(jump)
      }
      wrap.append(title, account)
      wrap.append(fieldsBlock([
        [uiText('一句话', 'In brief'), read.summary],
        [uiText('方法细节', 'Method detail'), read.method],
        [uiText('证据强度', 'Evidence'), read.evidence],
        [uiText('可复现性', 'Reproducibility'), read.reproducibility],
        [uiText('局限', 'Limitation'), read.limitation],
        [uiText('评分依据', 'Basis'), read.basis],
      ]))
      // 结构化失败也要把模型原文留住：这次请求已经计费，不能只剩一句"解析失败"。
      if (read.rawText?.trim()) wrap.append(make('pre', read.rawText, 'jdx-review-raw'))
      wrap.append(make('p', uiText(`${new Date(read.createdAt).toLocaleString()} · ${read.model} · 与批量综述同一评分量程。`, `${new Date(read.createdAt).toLocaleString()} · ${read.model} · scored on the same scale as the batch review.`), 'jdx-review-rating-note'))
    }
    wrap.append(button(
      read ? uiText('重新深读（再发一次请求）', 'Read again (another request)') : uiText('深读这篇（单独一次请求）', 'Deep read this paper (a separate request)'),
      onDeepRead,
      'jdx-review-deep-button',
    ))
    return wrap
  }
  const paperCard = (paper: QuickReviewDisplayPaper, note: QuickReviewResult['papers'][number] | undefined, onDeepRead: () => void) => {
    const card = make('div', '', 'jdx-review-card')
    card.append(make('h4', `${paper.index}. ${paper.title}`))
    const meta = [paper.authors, paper.year, paper.publication].filter(Boolean).join(' · ')
    if (meta) card.append(make('p', meta, 'jdx-review-card-meta'))
    // 作者行之下、代码／数据徽章之上：本机读出来的证据整块收在一个可折叠框里。
    const panel = evidencePanel(paper)
    if (panel) card.append(panel)
    if (!note) {
      card.append(fieldsBlock([], [uiText('状态', 'Status'), uiText('模型未覆盖本篇。', 'The model did not cover this paper.')]))
    } else {
      card.append(resourceBadges(note))
      const pairs: [string, string][] = [
        [uiText('一句话', 'In brief'), note.hook],
        [uiText('问题', 'Question'), note.question],
        [uiText('思路', 'Idea'), note.idea],
        [uiText('方法', 'Method'), note.method],
        [uiText('实验流程', 'Experiments'), note.experiments],
        [uiText('结论', 'Finding'), note.finding],
        [uiText('局限', 'Limitation'), note.limitation],
        [uiText('工具', 'Tools'), note.tools],
      ]
      if (paper.abstractState !== 'full') pairs.push([uiText('摘要', 'Abstract'), paper.abstractState === 'missing'
        ? uiText('本地无摘要，结论仅依据题录。', 'No local abstract; conclusions rest on the bibliography only.')
        : uiText('摘要未完整发送，结论仅限已发送部分。', 'The abstract was not sent in full; findings cover the sent part only.')])
      card.append(fieldsBlock(pairs))
    }
    // 深读与批量综述分开摆：它是用户另外花一次请求换来的，边界要看得见。
    card.append(deepReadBlock(paper, onDeepRead))
    return card
  }
  const ratingCard = (rating: QuickReviewResult['ratings'][number] | undefined) => {
    const card = make('aside', '', 'jdx-review-rating')
    const title = make('h4', uiText('模型评价', 'Model rating'), 'jdx-review-rating-title')
    title.append(make('span', rating ? reviewRatingText(rating.level) : uiText('未评价', 'Not rated'), `jdx-review-flag ${RATING_CLASS[rating?.level ?? 'unclear']}`))
    // 分数给出量程，档位只是分数的文字说明；悬停复述评分口径与依据。
    if (rating?.score !== undefined) {
      const score = make('span', `${rating.score}/100`, 'jdx-review-score')
      score.title = ratingHoverText(rating)
      title.append(score)
    }
    card.append(title)
    card.append(fieldsBlock(rating
      ? [
        [uiText('实用价值', 'Practical value'), rating.value],
        [uiText('创新性', 'Novelty'), rating.novelty],
        [uiText('依据', 'Basis'), rating.basis],
      ]
      : [], !rating ? [uiText('状态', 'Status'), uiText('模型未评价本篇。', 'The model did not rate this paper.')] : undefined))
    if (rating?.score !== undefined) card.append(make('p', uiText('内容评分（不含写作与期刊因素）；悬停分数可看评分口径。', 'Content score (writing and venue excluded); hover the score for the rubric.'), 'jdx-review-rating-note'))
    return card
  }

  const paintResult = (result: QuickReviewResult, papers: readonly QuickReviewDisplayPaper[], intro?: string) => {
    resultBox.replaceChildren()
    if (intro) resultBox.append(make('p', intro, 'jdx-review-result-note'))
    if (result.rawText && !result.overview && !result.papers.length) {
      resultBox.append(rawBlock(result.rawText))
    } else {
      const overview = proseBlock(uiText('总览', 'Overview'), result.overview)
      if (overview) resultBox.append(overview)
      const rated = result.evaluated && result.ratings.length > 0
      if (papers.length) {
        const block = make('section', '', 'jdx-review-block')
        block.append(sectionTitle(rated
          ? uiText('逐篇要点与评价', 'Per paper, with ratings')
          : uiText('逐篇要点', 'Per paper')))
        const notes = new Map(result.papers.map(note => [note.index, note]))
        const ratings = new Map(result.ratings.map(rating => [rating.index, rating]))
        if (rated) {
          const header = make('div', '', 'jdx-review-pair')
          header.append(make('p', uiText('综述要点', 'Review notes'), 'jdx-review-pair-head'))
          header.append(make('p', uiText('模型评价', 'Model rating'), 'jdx-review-pair-head'))
          block.append(header)
        }
        for (const paper of papers) {
          const card = paperCard(paper, notes.get(paper.index), () => { void startDeepRead(paper) })
          if (!rated) { block.append(card); continue }
          // 要点与评价放在同一行：随结果区一起滚动，不需要另做滚动同步。
          const pair = make('div', '', 'jdx-review-pair'); pair.append(card, ratingCard(ratings.get(paper.index)))
          block.append(pair)
        }
        resultBox.append(block)
      }
      if (result.ratingOverview) {
        const ratingOverview = proseBlock(uiText('总体评价', 'Overall rating'), result.ratingOverview)
        if (ratingOverview) resultBox.append(ratingOverview)
      }
      if (result.comparison.length) {
        const block = make('section', '', 'jdx-review-block')
        const table = make('table')
        const head = make('tr')
        for (const label of [uiText('维度', 'Dimension'), uiText('差异', 'Difference')]) { const cell = make('th', label); cell.scope = 'col'; head.append(cell) }
        const thead = make('thead'); thead.append(head)
        const tbody = make('tbody')
        for (const entry of result.comparison) {
          const tr = make('tr'); tr.append(make('td', entry.dimension), make('td', entry.note)); tbody.append(tr)
        }
        table.append(thead, tbody)
        const scroll = make('div', '', 'jdx-review-table-scroll'); scroll.append(table)
        block.append(sectionTitle(uiText('横向对比', 'Comparison')), scroll)
        resultBox.append(block)
      }
      const trends = proseBlock(uiText('趋势与脉络', 'Trends'), result.trends)
      const gaps = proseBlock(uiText('空白与值得跟进', 'Gaps'), result.gaps)
      if (trends) resultBox.append(trends)
      if (gaps) resultBox.append(gaps)
    }
    if (result.warnings.length) resultBox.append(notice(result.warnings))
    resultBox.scrollTop = 0
  }

  const paintRecord = (record: QuickReviewRecord) => {
    const restored = quickReviewRecordView(record)
    const intro = `${uiText('历史 · ', 'History · ')}${record.collection.name} · ${new Date(record.createdAt).toLocaleString()} · ${record.model}`
    if (restored) { paintResult(restored.result, restored.papers, intro); return }
    // 0.6.13.3 之前的记录只存了整段文字，没有结构化正文，原样显示。
    resultBox.replaceChildren()
    const block = make('section', '', 'jdx-review-block')
    block.append(sectionTitle(intro), make('pre', record.notes, 'jdx-review-raw'))
    resultBox.append(block)
    if (record.warnings?.length) resultBox.append(notice(record.warnings))
    resultBox.scrollTop = 0
  }

  /** 点开历史才换深读账目；深读写回后重画沿用当前这份，不能被旧记录覆盖掉。 */
  const showRecord = (record: QuickReviewRecord) => {
    deepReads = quickReviewRecordView(record)?.deepReads ?? new Map()
    paintRecord(record)
  }

  /** 深读完成后按当前视图重画：结果要落回它自己那张卡片，而不是另开一块。 */
  const repaint = () => {
    if (!view) return
    if (isRecord(view)) paintRecord(view)
    else paintResult(view.result, view.papers)
  }

  const renderHistory = () => {
    historyList.replaceChildren()
    const records = host.Prefs ? readQuickReviewHistory(host.Prefs).records : []
    if (!records.length) { historyList.append(make('p', uiText('暂无历史。', 'No saved reviews yet.'))); return }
    for (const record of records) {
      const line = make('div', '', 'jdx-review-history-row')
      line.append(button(record.collection.name, () => { view = record; renderHistory(); showRecord(record) }))
      line.append(make('span', `${new Date(record.createdAt).toLocaleString()} · ${record.papers.length} ${uiText('篇', 'papers')} · ${record.model}`, 'jdx-review-history-meta'))
      line.append(button(uiText('删除', 'Remove'), () => {
        if (host.Prefs) removeQuickReviewRecord(host.Prefs, record.id)
        if (view === record) view = null
        renderHistory(); updateActions()
      }))
      historyList.append(line)
    }
  }

  const confirmDialog = make('dialog', '', 'jdx-review-confirm')
  const confirmTitle = make('h3'); confirmTitle.id = 'jadense-review-confirm-title'; confirmDialog.setAttribute('aria-labelledby', confirmTitle.id)
  const confirmBody = make('p')
  const confirmActions = make('div', '', 'jdx-review-actions')
  let confirmed = false
  let pendingResolve: ((value: boolean) => void) | undefined
  const ask = (title: string, message: string, yes: string) => new Promise<boolean>(resolve => {
    confirmTitle.textContent = title; confirmBody.textContent = message
    confirmActions.replaceChildren(button(uiText('取消', 'Cancel'), () => confirmDialog.close()), button(yes, () => { confirmed = true; confirmDialog.close() }, 'jdx-manager-primary'))
    confirmed = false; pendingResolve = resolve; confirmDialog.showModal()
  })
  confirmDialog.addEventListener('close', () => { const resolve = pendingResolve; pendingResolve = undefined; resolve?.(confirmed) })
  confirmDialog.append(confirmTitle, confirmBody, confirmActions)

  /**
   * 深读派发与未确认处理：沿用同一会话，只有用户核对提供商后授权才重发。
   * 返回 null 表示这次没有结果，界面不再往下写历史。
   */
  const sendDeepRead = async (title: string, excerpt: DeepReadExcerpt, session: DeepReadSession, signal: AbortSignal, allowUnconfirmedRetry: boolean): Promise<DeepReadRunResult | null> => {
    try {
      return await runDeepRead({
        zotero: host,
        title,
        excerpt,
        session,
        signal,
        ...(allowUnconfirmedRetry ? { allowUnconfirmedRetry: true } : {}),
        onProgress: message => { status.textContent = message },
      })
    } catch (error) {
      const caught = error as QuickReviewError
      status.textContent = caught.message
      if (!caught.unconfirmed) return null
      // 未确认执行不得自动重发：这次深读是单独计费的，重发就是再收一次钱。
      const retry = await ask(uiText('上次执行结果未确认', 'The previous execution is unconfirmed'),
        uiText('插件不会自动重发，以免重复计费。请先在提供商后台核对这次深读请求；确认未计费后再授权重发。', 'Nothing is resent automatically, to avoid duplicate charges. Check this deep read request with your provider, then authorise a resend only if it was not billed.'),
        uiText('已核对，授权重发', 'Checked, resend'))
      if (!retry) return null
      status.textContent = uiText('正在按授权重发…', 'Resending as authorised…')
      return sendDeepRead(title, excerpt, session, signal, true)
    }
  }

  /**
   * 单篇深读：先在本机切摘录（这一步不发送、不计费），把要送的内容逐条报给用户，
   * 确认后才派发单独一次请求；切不出摘录就停在本机，并说明"没有发送任何内容"。
   */
  const startDeepRead = async (paper: QuickReviewDisplayPaper) => {
    if (busy) return
    if (typeof paper.libraryID !== 'number' || !paper.itemKey) {
      status.textContent = uiText('这条记录没有条目定位信息，无法重新读取附件。', 'This record carries no item reference, so the attachment cannot be read again.')
      return
    }
    const row: ReviewPaperRow = { libraryID: paper.libraryID, itemKey: paper.itemKey, title: paper.title, creators: [] }
    busy = true
    controller = new AbortController()
    updateActions()
    const signal = controller.signal
    try {
      status.textContent = uiText('正在本机切取正文摘录（还没有发送任何内容）…', 'Cutting a local body excerpt (nothing has been sent yet)…')
      const source = await readDeepReadExcerpt({ doc, host, row, signal })
      if (signal.aborted) { status.textContent = uiText('已停止；没有发送任何内容。', 'Stopped; nothing was sent.'); return }
      if (!source.excerpt) { status.textContent = source.notice; return }
      const excerpt = source.excerpt
      const go = await ask(
        uiText('送出这一篇的正文摘录？', 'Send this body excerpt?'),
        uiText(
          `这是单独一次请求、单独计费：送出 ${excerpt.chars} 字正文摘录（${deepReadSectionText(excerpt.sections)}），本机为切取它读了 ${source.pages} 页。摘录之外的正文、图表、公式与附录都不发送。结果未确认时插件不会自动重发。`,
          `This is a separate, separately billed request: ${excerpt.chars} characters of body text (${deepReadSectionText(excerpt.sections)}); ${source.pages} page(s) were read locally to cut it. The rest of the body, figures, formulas and the appendix are never sent. Nothing is resent automatically while the result is unconfirmed.`,
        ),
        uiText('确认送出摘录', 'Send the excerpt'),
      )
      if (!go) { status.textContent = uiText('已取消深读；没有发送任何内容。', 'Deep read cancelled; nothing was sent.'); return }
      const outcome = await sendDeepRead(paper.title, excerpt, newDeepReadSession(), signal, false)
      if (!outcome) return
      const read: StoredDeepRead = {
        createdAt: new Date().toISOString(),
        model: outcome.model,
        // 附件 ID 只写进本机历史：跳页用得上，它不随请求外发。
        sections: excerpt.sections.map(section => ({ heading: section.heading, part: section.part, page: section.page, ...(source.attachmentID ? { attachmentID: source.attachmentID } : {}) })),
        chars: excerpt.chars,
        readPages: source.pages,
        summary: outcome.read.summary,
        method: outcome.read.method,
        evidence: outcome.read.evidence,
        reproducibility: outcome.read.reproducibility,
        limitation: outcome.read.limitation,
        basis: outcome.read.basis,
        ...(outcome.read.score === undefined ? {} : { score: outcome.read.score }),
        ...(outcome.read.rawText ? { rawText: outcome.read.rawText } : {}),
      }
      deepReads.set(paper.index, read)
      const recordID = currentRecordID()
      const saved = recordID && host.Prefs ? saveQuickReviewDeepRead(host.Prefs, recordID, paper.index, read) : false
      repaint()
      status.textContent = [
        ...outcome.read.warnings,
        saved
          ? uiText('深读已完成并写入本机历史。', 'The deep read finished and was saved in local history.')
          : uiText('深读已完成，但没能写入本机历史；结果仍在本窗口，请及时复制。', 'The deep read finished but could not be saved in local history. It stays in this window; copy it before closing.'),
      ].filter(Boolean).join(' ')
    } finally {
      busy = false; controller = undefined; updateActions()
    }
  }

  const loadCollection = async (id: number) => {
    const token = ++generation
    status.textContent = uiText('正在读取收藏夹…', 'Reading the collection…')
    try {
      const collected = await collectReviewRows(host, id)
      const entries = await listReviewCollections(host, collected.collection?.libraryID ?? 0)
      if (token !== generation) return
      collections = entries
      collectionPick.setOptions(collections.map(entry => ({ value: String(entry.id), label: entry.path.join(' ▸ ') })), String(id))
      rows = collected.rows; scanned = collected.scanned; truncated = collected.truncated
      view = null
      deepReads = new Map()
      collapsedEvidence.clear()
      resultBox.replaceChildren(make('p', uiText('尚未生成综述。选择收藏夹后点击「生成综述」，一次调用汇总整个子分类。', 'No review yet. Pick a collection and generate one summary for the whole sub-collection.')))
      status.textContent = ''
      renderRows(); renderHistory()
    } catch { if (token === generation) status.textContent = uiText('无法读取收藏夹，请重新打开窗口。', 'Could not read the collection. Reopen this window.') }
  }

  const dispatch = async (collection: ReviewCollection, papers: ReviewPaperRow[], localSession: QuickReviewSession, allowUnconfirmedRetry: boolean, evaluate: boolean) => {
    controller = new AbortController()
    busy = true; updateActions()
    let reviewed = papers
    let scanNotice = ''
    try {
      // 扫描每批只做一次：授权重发沿用同一批已带链接的行，既不重复读盘也不重复计费。
      if (scanPick.checked && papers.some(row => !row.attachmentScanned)) {
        const report = await scanRowsForAttachmentLinks({ doc, host, rows: papers, signal: controller.signal, onProgress: message => { status.textContent = message } })
        reviewed = report.rows
        // 发现的链接与附录按行合并回清单：再点一次「生成综述」不必重读附件。
        if (reviewed !== papers) {
          const byKey = new Map(reviewed.map(row => [rowKey(row), row]))
          rows = rows.map(row => byKey.get(rowKey(row)) ?? row)
          // 保留勾选重画：只补徽章，用户在计费前取消的勾不能被抹掉。
          renderRows(true)
        }
        scanNotice = quickReviewScanNotice(report)
      }
      const outcome = await runQuickReview({ zotero: host, collection, rows: reviewed, session: localSession, signal: controller.signal, ...(allowUnconfirmedRetry ? { allowUnconfirmedRetry: true } : {}), ...(evaluate ? { evaluate: true } : {}), onProgress: message => { status.textContent = message } })
      view = outcome
      // 新的一批综述＝新的一条记录：上一批的深读不属于它，留着会挂到别的文献上。
      deepReads = new Map()
      collapsedEvidence.clear()
      paintResult(outcome.result, outcome.papers)
      const finished = outcome.historySaved
        ? uiText('综述已完成并写入本机历史。', 'Review finished and saved in local history.')
        : outcome.historyError ?? ''
      // 扫描跳过要在结果之后仍看得见：否则用户会把"没扫到链接"读成"论文没有链接"。
      status.textContent = scanNotice ? `${finished} ${scanNotice}`.trim() : finished
      renderHistory()
      return outcome
    } catch (error) {
      const caught = error as QuickReviewError
      if (caught.code === 'AI_NOT_CONFIGURED') status.textContent = caught.message
      else if (caught.unconfirmed) {
        // 未确认执行不得自动重发：沿用同一会话，只有用户核对提供商后显式授权才顶掉未确认记录。
        status.textContent = caught.message
        const retry = await ask(uiText('上次执行结果未确认', 'The previous execution is unconfirmed'),
          uiText('插件不会自动重发，以免重复计费。请先在提供商后台核对这次请求；确认未计费后再授权重发。', 'Nothing is resent automatically, to avoid duplicate charges. Check this request with your provider, then authorise a resend only if it was not billed.'),
          uiText('已核对，授权重发', 'Checked, resend'))
        if (retry) {
          status.textContent = uiText('正在按授权重发…', 'Resending as authorised…')
          return dispatch(collection, reviewed, localSession, true, evaluate)
        }
      } else status.textContent = caught.message
      return null
    } finally {
      busy = false; controller = undefined; updateActions()
    }
  }

  const generate = button(uiText('生成综述', 'Generate review'), () => { void (async () => {
    const collection = currentCollection()
    const papers = chosenRows()
    if (!collection || busy || !papers.length) return
    // 派发时锁定勾选状态：中途改勾选不会改变已经在跑的这次请求。
    const evaluate = evaluatePick.checked
    if (papers.length > QUICK_REVIEW_CONFIRM_LIMIT) {
      const go = await ask(uiText(`确认发送 ${papers.length} 篇摘要？`, `Send ${papers.length} abstracts?`),
        uiText(`一次发送越多，摘要预算越紧，费用与耗时也越高；默认只解析 ${QUICK_REVIEW_DEFAULT_LIMIT} 篇。`, `More papers per request means a tighter abstract budget and higher cost and latency. The default is ${QUICK_REVIEW_DEFAULT_LIMIT} papers.`),
        uiText('确认发送', 'Send them'))
      if (!go) return
    }
    const localSession = session
    session = newQuickReviewSession()
    await dispatch(collection, papers, localSession, false, evaluate)
  })() }, 'jdx-manager-primary')
  const stop = button(uiText('停止', 'Stop'), () => controller?.abort()); stop.hidden = true
  const copyButton = button(uiText('复制全文', 'Copy full text'), () => { void (async () => {
    const text = copySource()
    if (!text) return
    status.textContent = await copyTextToClipboard(host, text) ? uiText('已复制全文。', 'Full text copied.') : uiText('复制失败，请检查剪贴板权限。', 'Copy failed. Check clipboard permission.')
  })() })
  copyButton.hidden = true
  const settings = button(uiText('配置模型', 'Configure model'), () => openSettings())
  const clearHistory = button(uiText('清空历史', 'Clear history'), () => {
    if (host.Prefs) clearQuickReviewHistory(host.Prefs)
    if (view && isRecord(view)) view = null
    renderHistory(); updateActions()
  })

  actions.append(generate, stop, copyButton, settings, clearHistory)

  const picker = make('section', '', 'jdx-review-picker')
  picker.append(sectionTitle(uiText('收藏夹（含子收藏夹）', 'Collection with sub-collections')), collectionPick.element, scanSummary)
  const listSection = make('section', '', 'jdx-review-list')
  listTools.append(
    button(uiText('全选', 'Select all'), () => { for (const row of rows.slice(0, MAX_VISIBLE_ROWS)) included.add(rowKey(row)); syncChecks(); renderBudget(); updateActions() }),
    button(uiText('全不选', 'Clear selection'), () => { rows.slice(0, MAX_VISIBLE_ROWS).forEach(row => included.delete(rowKey(row))); syncChecks(); renderBudget(); updateActions() }),
  )
  const limitRow = make('div', '', 'jdx-review-limit-row')
  const limitLabel = make('span', uiText('一次发送', 'Papers per request'), 'jdx-review-limit-label')
  limitRow.append(limitLabel, limitPick.element)
  listSection.append(sectionTitle(uiText('参与解析的文献', 'Papers in this review')), listTools, paperList, limitRow, evaluateRow, scanRow, budgetLine)
  const historySection = make('section', '', 'jdx-review-block')
  historySection.append(sectionTitle(uiText('本机历史', 'Local history')), historyList)

  side.append(picker, listSection, historySection)
  main.append(sectionTitle(uiText('综述结果', 'Review result')), resultBox)
  body.append(side, main)
  dialog.append(heading, modelLine, body, status, actions, confirmDialog)
  doc.body.append(dialog)

  collectionPick.onChange(value => { const id = Number(value); if (id) void loadCollection(id) })
  limitPick.onChange(() => { renderBudget(); updateActions() })
  // 自绘列表框展开时 Escape 只该收起弹层；组件不拦截冒泡，这里挡住关窗逻辑。
  const pickerOpen = () => [collectionPick, limitPick].some(select => select.element.dataset.open === 'true')
  doc.addEventListener('keydown', event => { if (event.key === 'Escape' && !confirmDialog.open && !pickerOpen()) { controller?.abort(); doc.defaultView?.close() } })
  updateActions(); renderHistory()

  return {
    async open(collectionIDs: number[]) {
      const first = collectionIDs.find(id => Number.isInteger(id) && id > 0)
      if (!first) { status.textContent = uiText('请先在 Zotero 中右键一个收藏夹。', 'Right-click a collection in Zotero first.'); updateActions(); return }
      session = newQuickReviewSession()
      await loadCollection(first)
    },
    dispose() { generation++; controller?.abort(); collectionPick.destroy(); limitPick.destroy(); dialog.remove() },
  }
}
