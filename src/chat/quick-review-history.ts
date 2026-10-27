import { uiText } from "@/zotero/ui-preferences"
/**
 * 收藏夹快速解析的本机历史。
 * 与单篇解析历史分开保存：记录归属收藏夹而非某个附件，且只缓存可读文字，不承载任何库内写入输入。
 */
import type { QuickReviewAvailability, QuickReviewDisplayPaper, QuickReviewPaperNote, QuickReviewPaperRating, QuickReviewRatingLevel, QuickReviewResult, QuickReviewScanOutcome, ReviewAppendixRef, ReviewStructure } from "./quick-review"
import { PAPER_FIELD_LIMITS, RATING_FIELD_LIMITS, mergeReviewAppendix, mergeReviewAppendixRefs, normalizeReviewLinks, normalizeReviewStructure, ratingLevelForScore } from "./quick-review"
import { normalizeDeepRead, type StoredDeepRead } from "./review-deep-read"

export const QUICK_REVIEW_HISTORY_PREF_KEY = "extensions.jadenseInZotero.quickReviewHistory"

/** 历史里的扫描结论只认这几种：未知值一律丢弃，避免坏记录把卡片画成别的状态。 */
const SCAN_OUTCOMES: readonly QuickReviewScanOutcome[] = ["parsed", "noAttachment", "oversize", "unreadable", "unavailable"]

export type QuickReviewPreferenceStore = {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

export type QuickReviewRecordPaper = {
  libraryID: number
  itemKey: string
  title: string
  authors: string
  year: string
  publication: string
  /** 0.6.13.3 起随记录保存，历史回显才能与综述共用同一序号。 */
  index?: number
  abstractState?: QuickReviewDisplayPaper["abstractState"]
  /** 0.6.13.5 起保存本机发现的链接，历史点开才能复原徽章旁的链接行。 */
  links?: string[]
  /** 0.6.13.6 起保存附录小节标题，历史点开才能复原"有附录"这条本机证据。 */
  appendix?: string[]
  /** 0.6.13.10 起保存小节的附件与页码：重开旧综述时也能点标题跳到那一页。 */
  appendixRefs?: ReviewAppendixRef[]
  /** 0.6.13.8 起保存附录标记：标题排不出编号时，"有附录"这件事仍然要在历史里成立。 */
  appendixMarked?: boolean
  /** 0.6.13.8 起保存扫描账目：历史点开时能看出当时读过多少页、是否压根没扫。 */
  attachmentScanned?: boolean
  scanPages?: number
  /** 0.6.13.9 起保存扫描结论：历史里也要分清"没有 PDF"与"没读到附件"。 */
  scanOutcome?: QuickReviewScanOutcome
  /** 0.6.13.11 起保存本机版面统计：历史点开时结构行与当时一致。 */
  structure?: ReviewStructure
  /**
   * 0.6.13.12 起保存单篇深读结果：深读发生在综述落库之后，因此单独写回这一篇，不重存整条记录。
   */
  deepRead?: StoredDeepRead
}

/** 结构化正文：历史点开时能复原逐篇卡片，而不只有一段纯文本。 */
export type QuickReviewRecordStructure = {
  notes: QuickReviewPaperNote[]
  comparison: { dimension: string; note: string }[]
  trends: string
  gaps: string
  ratings: QuickReviewPaperRating[]
  ratingOverview: string
  evaluated: boolean
}

export type QuickReviewRecord = {
  id: string
  createdAt: string
  collection: { libraryID: number; key: string; name: string }
  model: string
  papers: QuickReviewRecordPaper[]
  overview: string
  notes: string
  warnings?: string[]
  review?: QuickReviewRecordStructure
}

export type QuickReviewHistory = { version: 1; records: QuickReviewRecord[] }

const MAX_RECORDS = 40
const MAX_SERIALIZED_LENGTH = 1_500_000
const MAX_NOTES_LENGTH = 60_000
const MAX_PAPERS = 30
const MAX_RATINGS = 30

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

function identity(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return ""
  const normalized = value.trim()
  return normalized.length <= maxLength ? normalized : ""
}

function libraryNumber(value: unknown): number | undefined {
  const parsed = typeof value === "string" ? Number(value) : value
  return Number.isSafeInteger(parsed) && Number(parsed) >= 0 ? Number(parsed) : undefined
}

function indexNumber(value: unknown): number | undefined {
  const parsed = typeof value === "string" ? Number(value) : value
  return Number.isSafeInteger(parsed) && Number(parsed) > 0 ? Number(parsed) : undefined
}

const AVAILABILITY: readonly string[] = ["yes", "no", "unknown"]
const LEVELS: readonly string[] = ["high", "medium", "low", "unclear"]

/**
 * 跳页信息只认整数页码与附件 ID，且标题必须真的是已保存小节（剥掉编号后比对）：
 * 坏记录不能借这一栏凭空造出一个可点小节，也不能指到不存在的页。
 */
function normalizeAppendixRefs(value: unknown, titles: readonly string[]): ReviewAppendixRef[] {
  if (!titles.length || !Array.isArray(value)) return []
  const refs: ReviewAppendixRef[] = []
  for (const entry of value) {
    const row = object(entry)
    const rawTitle = text(row?.title, 120)
    const page = libraryNumber(row?.page)
    const attachmentID = libraryNumber(row?.attachmentID)
    if (!rawTitle || page === undefined || page < 1 || attachmentID === undefined || attachmentID < 1) continue
    const title = mergeReviewAppendix([rawTitle])[0]
    const match = title ? titles.find(saved => saved.toLowerCase() === title.toLowerCase()) : undefined
    if (!match) continue
    refs.push({ title: match, page, attachmentID })
  }
  return mergeReviewAppendixRefs(refs)
}

function normalizePaper(value: unknown): QuickReviewRecordPaper | null {
  const row = object(value)
  const libraryID = libraryNumber(row?.libraryID)
  const itemKey = identity(row?.itemKey, 80)
  const title = text(row?.title, 400)
  if (libraryID === undefined || !itemKey || !title) return null
  const index = indexNumber(row?.index)
  const state = row?.abstractState
  const appendix = Array.isArray(row?.appendix) && row.appendix.length
    ? mergeReviewAppendix(row.appendix.filter((line): line is string => typeof line === "string"))
    : []
  const appendixRefs = normalizeAppendixRefs(row?.appendixRefs, appendix)
  const structure = normalizeReviewStructure(row?.structure)
  const deepRead = normalizeDeepRead(row?.deepRead)
  return {
    libraryID,
    itemKey,
    title,
    authors: text(row?.authors, 200),
    year: text(row?.year, 20),
    publication: text(row?.publication, 200),
    ...(index !== undefined ? { index } : {}),
    ...(state === "full" || state === "truncated" || state === "omitted" || state === "missing" ? { abstractState: state } : {}),
    ...(Array.isArray(row?.links) && row.links.length ? { links: normalizeReviewLinks(row.links.filter((link): link is string => typeof link === "string")) } : {}),
    ...(appendix.length ? { appendix } : {}),
    ...(appendixRefs.length ? { appendixRefs } : {}),
    ...(row?.appendixMarked === true ? { appendixMarked: true } : {}),
    ...(typeof row?.attachmentScanned === "boolean" ? { attachmentScanned: row.attachmentScanned } : {}),
    ...(typeof row?.scanPages === "number" && Number.isFinite(row.scanPages) && row.scanPages >= 0 ? { scanPages: Math.round(row.scanPages) } : {}),
    ...(SCAN_OUTCOMES.includes(row?.scanOutcome as QuickReviewScanOutcome) ? { scanOutcome: row!.scanOutcome as QuickReviewScanOutcome } : {}),
    ...(structure ? { structure } : {}),
    ...(deepRead ? { deepRead } : {}),
  }
}

/** 结构化正文按已知序号收紧：序号对不上题录的内容一律丢弃，历史回显不会凭空多出某篇。 */
function normalizeStructure(value: unknown, indexes: ReadonlySet<number>, papers: number): QuickReviewRecordStructure | undefined {
  const row = object(value)
  if (!row) return undefined
  const notes: QuickReviewPaperNote[] = []
  for (const entry of Array.isArray(row.notes) ? row.notes : []) {
    const note = object(entry)
    const index = indexNumber(note?.index)
    if (index === undefined || !indexes.has(index) || notes.some(existing => existing.index === index)) continue
    notes.push({
      index,
      hook: text(note?.hook, PAPER_FIELD_LIMITS.hook),
      question: text(note?.question, PAPER_FIELD_LIMITS.question),
      idea: text(note?.idea, PAPER_FIELD_LIMITS.idea),
      method: text(note?.method, PAPER_FIELD_LIMITS.method),
      experiments: text(note?.experiments, PAPER_FIELD_LIMITS.experiments),
      finding: text(note?.finding, PAPER_FIELD_LIMITS.finding),
      limitation: text(note?.limitation, PAPER_FIELD_LIMITS.limitation),
      tools: text(note?.tools, PAPER_FIELD_LIMITS.tools),
      code: (AVAILABILITY.includes(String(note?.code)) ? note?.code : "unknown") as QuickReviewAvailability,
      data: (AVAILABILITY.includes(String(note?.data)) ? note?.data : "unknown") as QuickReviewAvailability,
      resourceNote: text(note?.resourceNote, PAPER_FIELD_LIMITS.resourceNote),
    })
  }
  const ratings: QuickReviewPaperRating[] = []
  for (const entry of Array.isArray(row.ratings) ? row.ratings : []) {
    const item = object(entry)
    const index = indexNumber(item?.index)
    if (index === undefined || !indexes.has(index) || ratings.some(existing => existing.index === index)) continue
    const rawScore = typeof item?.score === "string" ? Number(item.score.trim()) : item?.score
    const score = typeof rawScore === "number" && Number.isFinite(rawScore) ? Math.min(100, Math.max(0, Math.round(rawScore))) : undefined
    ratings.push({
      index,
      ...(score !== undefined ? { score } : {}),
      value: text(item?.value, RATING_FIELD_LIMITS.value),
      novelty: text(item?.novelty, RATING_FIELD_LIMITS.novelty),
      // 有分数时档位由分数折算，历史回显不会出现"中等 85/100"这种矛盾。
      level: score !== undefined ? ratingLevelForScore(score) : (LEVELS.includes(String(item?.level)) ? item?.level : "unclear") as QuickReviewRatingLevel,
      basis: text(item?.basis, RATING_FIELD_LIMITS.basis),
    })
    if (ratings.length >= MAX_RATINGS) break
  }
  const comparison: { dimension: string; note: string }[] = []
  for (const entry of Array.isArray(row.comparison) ? row.comparison : []) {
    const item = object(entry)
    const dimension = text(item?.dimension, 80)
    const note = text(item?.note, 900)
    if (!dimension && !note) continue
    comparison.push({ dimension: dimension || uiText("对比维度", "Comparison"), note })
    if (comparison.length >= 8) break
  }
  if (!notes.length && !comparison.length && !ratings.length) return undefined
  return {
    notes,
    comparison,
    trends: text(row.trends, 900),
    gaps: text(row.gaps, 900),
    ratings,
    ratingOverview: text(row.ratingOverview, RATING_FIELD_LIMITS.overview),
    evaluated: row.evaluated === true || (papers > 0 && ratings.length > 0),
  }
}

function normalizeRecord(value: unknown): QuickReviewRecord | null {
  const row = object(value)
  const collection = object(row?.collection)
  const id = identity(row?.id, 120)
  const createdAt = identity(row?.createdAt, 64)
  const libraryID = libraryNumber(collection?.libraryID)
  const key = identity(collection?.key, 80)
  const name = text(collection?.name, 200)
  const notes = text(row?.notes, MAX_NOTES_LENGTH)
  const papers = (Array.isArray(row?.papers) ? row.papers : []).slice(0, MAX_PAPERS).map(normalizePaper).filter((paper): paper is QuickReviewRecordPaper => Boolean(paper))
  const warnings = (Array.isArray(row?.warnings) ? row.warnings : []).map(entry => text(entry, 800)).filter(Boolean).slice(0, 24)
  if (!id || !createdAt || !Number.isFinite(Date.parse(createdAt)) || libraryID === undefined || !key || !name || !papers.length) return null
  const indexes = new Set(papers.map((paper, position) => paper.index ?? position + 1))
  const review = normalizeStructure(row?.review, indexes, papers.length)
  return {
    id,
    createdAt,
    collection: { libraryID, key, name },
    model: text(row?.model, 120),
    papers,
    overview: text(row?.overview, 1200),
    notes: notes.length === MAX_NOTES_LENGTH ? `${notes.slice(0, -20)}\n…（内容过长，后续已截断）` : notes,
    ...(warnings.length ? { warnings } : {}),
    ...(review ? { review } : {}),
  }
}

/** 历史记录还原成与实时结果同构的数据，供界面复用逐篇卡片渲染；旧记录没有结构化字段时返回 null。 */
export function quickReviewRecordView(record: QuickReviewRecord): { result: QuickReviewResult; papers: QuickReviewDisplayPaper[]; deepReads: Map<number, StoredDeepRead> } | null {
  const structure = record.review
  if (!structure) return null
  const deepReads = new Map<number, StoredDeepRead>()
  const papers = record.papers.map((paper, position) => {
    const index = paper.index ?? position + 1
    if (paper.deepRead) deepReads.set(index, paper.deepRead)
    return {
      index,
      title: paper.title,
      authors: paper.authors,
      year: paper.year,
      publication: paper.publication,
      abstractState: paper.abstractState ?? "full",
      libraryID: paper.libraryID,
      itemKey: paper.itemKey,
      ...(paper.links?.length ? { links: paper.links } : {}),
      ...(paper.appendix?.length ? { appendix: paper.appendix } : {}),
      ...(paper.appendixRefs?.length ? { appendixRefs: paper.appendixRefs } : {}),
      ...(paper.appendixMarked === true ? { appendixMarked: true } : {}),
      ...(typeof paper.attachmentScanned === "boolean" ? { attachmentScanned: paper.attachmentScanned } : {}),
      ...(typeof paper.scanPages === "number" ? { scanPages: paper.scanPages } : {}),
      ...(SCAN_OUTCOMES.includes(paper.scanOutcome as QuickReviewScanOutcome) ? { scanOutcome: paper.scanOutcome } : {}),
      ...(paper.structure ? { structure: paper.structure } : {}),
    }
  })
  return {
    papers,
    deepReads,
    result: {
      overview: record.overview,
      papers: structure.notes.filter(note => papers.some(paper => paper.index === note.index)),
      comparison: structure.comparison,
      trends: structure.trends,
      gaps: structure.gaps,
      ratings: structure.ratings.filter(rating => papers.some(paper => paper.index === rating.index)),
      ratingOverview: structure.ratingOverview,
      evaluated: structure.evaluated,
      skipped: 0,
      warnings: record.warnings ?? [],
    },
  }
}


function fitHistory(records: QuickReviewRecord[]): QuickReviewHistory {
  const ids = new Set<string>()
  const fitted = [...records]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .filter(record => {
      if (ids.has(record.id)) return false
      ids.add(record.id)
      return true
    })
    .slice(0, MAX_RECORDS)
  while (fitted.length && JSON.stringify({ version: 1, records: fitted }).length > MAX_SERIALIZED_LENGTH) fitted.pop()
  return { version: 1, records: fitted }
}

export function readQuickReviewHistory(preferences: QuickReviewPreferenceStore): QuickReviewHistory {
  try {
    const raw = preferences.get(QUICK_REVIEW_HISTORY_PREF_KEY)
    if (typeof raw !== "string" || !raw.trim()) return { version: 1, records: [] }
    const value = object(JSON.parse(raw))
    if (value?.version !== 1) return { version: 1, records: [] }
    return fitHistory((Array.isArray(value?.records) ? value.records : []).map(normalizeRecord).filter((record): record is QuickReviewRecord => Boolean(record)))
  } catch {
    return { version: 1, records: [] }
  }
}

export function appendQuickReviewRecord(preferences: QuickReviewPreferenceStore, input: QuickReviewRecord): QuickReviewRecord {
  const record = normalizeRecord(input)
  if (!record) throw new Error(uiText("快速解析记录缺少有效的收藏夹、文献或内容。", "The quick review record is missing a valid collection, paper list, or content."))
  preferences.set(QUICK_REVIEW_HISTORY_PREF_KEY, JSON.stringify(fitHistory([record, ...readQuickReviewHistory(preferences).records])))
  return record
}

/**
 * 深读结果写回已存在的那条记录：综述落库在前，深读发生在后，
 * 因此按记录 ID 与序号定位到具体一篇再改，不重排也不新增记录。
 * 记录或那一篇已经不在了（被清空、被挤出上限）就返回 false，界面据此只提示没保存。
 */
export function saveQuickReviewDeepRead(preferences: QuickReviewPreferenceStore, recordID: string, index: number, deepRead: StoredDeepRead): boolean {
  const stored = normalizeDeepRead(deepRead)
  if (!stored) return false
  const records = readQuickReviewHistory(preferences).records
  const record = records.find(entry => entry.id === recordID)
  if (!record) return false
  const paper = record.papers.find((entry, position) => (entry.index ?? position + 1) === index)
  if (!paper) return false
  paper.deepRead = stored
  preferences.set(QUICK_REVIEW_HISTORY_PREF_KEY, JSON.stringify(fitHistory(records)))
  return true
}

export function removeQuickReviewRecord(preferences: QuickReviewPreferenceStore, id: string): boolean {
  const records = readQuickReviewHistory(preferences).records
  const next = records.filter(record => record.id !== id)
  if (next.length === records.length) return false
  preferences.set(QUICK_REVIEW_HISTORY_PREF_KEY, JSON.stringify(fitHistory(next)))
  return true
}

export function clearQuickReviewHistory(preferences: QuickReviewPreferenceStore) {
  preferences.set(QUICK_REVIEW_HISTORY_PREF_KEY, JSON.stringify({ version: 1, records: [] }))
}
