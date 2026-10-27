import { uiText } from "@/zotero/ui-preferences"
/**
 * 收藏夹快速解析的本机历史。
 * 与单篇解析历史分开保存：记录归属收藏夹而非某个附件，且只缓存可读文字，不承载任何库内写入输入。
 */
import type { QuickReviewAvailability, QuickReviewDisplayPaper, QuickReviewPaperNote, QuickReviewPaperRating, QuickReviewRatingLevel, QuickReviewResult } from "./quick-review"
import { PAPER_FIELD_LIMITS, RATING_FIELD_LIMITS, mergeReviewAppendix, normalizeReviewLinks } from "./quick-review"

export const QUICK_REVIEW_HISTORY_PREF_KEY = "extensions.jadenseInZotero.quickReviewHistory"

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
  /** 0.6.13.8 起保存附录标记：标题排不出编号时，"有附录"这件事仍然要在历史里成立。 */
  appendixMarked?: boolean
  /** 0.6.13.8 起保存扫描账目：历史点开时能看出当时读过多少页、是否压根没扫。 */
  attachmentScanned?: boolean
  scanPages?: number
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

function normalizePaper(value: unknown): QuickReviewRecordPaper | null {
  const row = object(value)
  const libraryID = libraryNumber(row?.libraryID)
  const itemKey = identity(row?.itemKey, 80)
  const title = text(row?.title, 400)
  if (libraryID === undefined || !itemKey || !title) return null
  const index = indexNumber(row?.index)
  const state = row?.abstractState
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
    ...(Array.isArray(row?.appendix) && row.appendix.length ? { appendix: mergeReviewAppendix(row.appendix.filter((line): line is string => typeof line === "string")) } : {}),
    ...(row?.appendixMarked === true ? { appendixMarked: true } : {}),
    ...(typeof row?.attachmentScanned === "boolean" ? { attachmentScanned: row.attachmentScanned } : {}),
    ...(typeof row?.scanPages === "number" && Number.isFinite(row.scanPages) && row.scanPages >= 0 ? { scanPages: Math.round(row.scanPages) } : {}),
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
    ratings.push({
      index,
      value: text(item?.value, RATING_FIELD_LIMITS.value),
      novelty: text(item?.novelty, RATING_FIELD_LIMITS.novelty),
      level: (LEVELS.includes(String(item?.level)) ? item?.level : "unclear") as QuickReviewRatingLevel,
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
export function quickReviewRecordView(record: QuickReviewRecord): { result: QuickReviewResult; papers: QuickReviewDisplayPaper[] } | null {
  const structure = record.review
  if (!structure) return null
  const papers = record.papers.map((paper, position) => ({
    index: paper.index ?? position + 1,
    title: paper.title,
    authors: paper.authors,
    year: paper.year,
    publication: paper.publication,
    abstractState: paper.abstractState ?? "full",
    ...(paper.links?.length ? { links: paper.links } : {}),
    ...(paper.appendix?.length ? { appendix: paper.appendix } : {}),
    ...(paper.appendixMarked === true ? { appendixMarked: true } : {}),
    ...(typeof paper.attachmentScanned === "boolean" ? { attachmentScanned: paper.attachmentScanned } : {}),
    ...(typeof paper.scanPages === "number" ? { scanPages: paper.scanPages } : {}),
  }))
  return {
    papers,
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
