/** 快速解析窗口：收藏夹选择、逐篇勾选、一次派发综述与本机历史；模型文字只用 textContent 呈现。 */
import { copyTextToClipboard } from './connection-display'
import { uiText } from './ui-preferences'
import { createJdxSelect } from './ui/select'
import type { ZoteroLike } from './runtime'
import {
  QUICK_REVIEW_CONFIRM_LIMIT,
  QUICK_REVIEW_DEFAULT_LIMIT,
  QUICK_REVIEW_MAX_LIMIT,
  reviewAvailabilityText,
  reviewRatingText,
  reviewScanState,
  type QuickReviewAvailability,
  type QuickReviewDisplayPaper,
  type QuickReviewRatingLevel,
  type QuickReviewResult,
  type ReviewAppendixRef,
  type ReviewPaperRow,
} from '@/chat/quick-review'
import {
  clearQuickReviewHistory,
  quickReviewRecordView,
  readQuickReviewHistory,
  removeQuickReviewRecord,
  type QuickReviewRecord,
} from '@/chat/quick-review-history'
import {
  collectReviewRows,
  listReviewCollections,
  newQuickReviewSession,
  quickReviewModelState,
  runQuickReview,
  type QuickReviewError,
  type QuickReviewRunResult,
  type QuickReviewSession,
  type ReviewCollection,
} from './quick-review'
import { quickReviewScanNotice, scanRowsForAttachmentLinks } from './review-links'

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
  scanRow.append(scanPick, make('span', uiText('扫描附件找开源链接（只送出发现的链接文本）', 'Scan attachments for code links (only the links found are sent)')))
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

  const currentCollection = () => collections.find(entry => String(entry.id) === collectionPick.getValue()) ?? null
  const chosenRows = () => rows.filter(row => included.has(rowKey(row))).slice(0, Number(limitPick.getValue()) || QUICK_REVIEW_DEFAULT_LIMIT)
  const isRecord = (value: QuickReviewRunResult | QuickReviewRecord): value is QuickReviewRecord => !('result' in value)
  const copySource = () => (!view ? '' : isRecord(view) ? view.notes : view.text)

  const updateActions = () => {
    const model = quickReviewModelState(host)
    modelLine.textContent = model.ready
      ? uiText(
        `使用「${model.label}」汇总整个子收藏夹；发送题录与摘要${scanPick.checked ? '，并解析本机附件首尾页以提取开源链接（只送出链接文本，不送正文）' : '，不读取 PDF'}。一次调用可能消耗额度。${evaluatePick.checked ? ' 同一次调用会附带逐篇评价，不额外增加请求次数。' : ''}`,
        `Summarises the sub-collection with ${model.label}. Bibliographic metadata and abstracts are sent${scanPick.checked ? ', and local attachment first/last pages are parsed for code links (only the link text leaves the machine)' : ', never PDFs'}. One request that may use credits.${evaluatePick.checked ? ' The same request also returns per-paper ratings, without adding a call.' : ''}`,
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
  /** 附录小节跳页：阅读器按 PDF 物理页定位，pageIndex 从 0 开始。 */
  const openAppendixPage = async (ref: ReviewAppendixRef) => {
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
      const jump = button(numbered, () => { void openAppendixPage(ref) }, 'jdx-review-appendix-item jdx-review-jump')
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
  const paperCard = (paper: QuickReviewDisplayPaper, note: QuickReviewResult['papers'][number] | undefined) => {
    const card = make('div', '', 'jdx-review-card')
    card.append(make('h4', `${paper.index}. ${paper.title}`))
    const meta = [paper.authors, paper.year, paper.publication].filter(Boolean).join(' · ')
    if (meta) card.append(make('p', meta, 'jdx-review-card-meta'))
    const evidence = evidenceRow(paper)
    if (evidence) card.append(evidence)
    if (paper.links?.length) card.append(linksRow(paper.links))
    if (paper.appendix?.length) card.append(appendixRow(paper.appendix, paper.appendixRefs))
    if (!note) {
      card.append(fieldsBlock([], [uiText('状态', 'Status'), uiText('模型未覆盖本篇。', 'The model did not cover this paper.')]))
      return card
    }
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
          const card = paperCard(paper, notes.get(paper.index))
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

  const showRecord = (record: QuickReviewRecord) => {
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
