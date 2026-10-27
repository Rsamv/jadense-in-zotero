import { uiText } from "@/zotero/ui-preferences"
/**
 * 快速解析的 Zotero 侧：读取收藏夹题录、单次派发生成综述、写入独立历史。
 * 默认只发送题录与摘要；勾选扫描后额外解析附件首尾页文字，且只把抽到的链接文本发出去。
 * BYOK 未确认结果仍遵守不自动重发的契约。
 */
import type { ByokConfig } from "@/chat/byok-chat"
import { ReliableByokChatClient } from "@/chat/reliable-byok-chat"
import { ReliableTemporaryChatClient } from "@/chat/reliable-temporary-chat"
import type { TemporaryChatSendInput } from "@/chat/temporary-chat"
import { executionResult, requestActivityText, requestIssue, type RequestProgress } from "@/chat/request-feedback"
import {
  QUICK_REVIEW_RATING_RESPONSE_FORMAT,
  QUICK_REVIEW_RESPONSE_FORMAT,
  buildQuickReviewPrompt,
  formatQuickReview,
  normalizeReviewLinks,
  parseQuickReview,
  prepareQuickReviewPapers,
  extractReviewLinks,
  type QuickReviewPaperInput,
  type QuickReviewResult,
  type ReviewPaperRow,
} from "@/chat/quick-review"
import { appendQuickReviewRecord, type QuickReviewRecord } from "@/chat/quick-review-history"
import { featureModelState, type PaperAnalysisModelSelection } from "./ai-settings"
import { withErrorType } from "./error-report"
import { readConnection, selectedZoteroCollections, type ZoteroLike } from "./runtime"

const MAX_SCANNED_ITEMS = 500
const MAX_ROW_FIELDS = 4_000

type NativeItem = {
  id: number; key?: string; libraryID: number; deleted?: boolean
  isRegularItem?: () => boolean; isAttachment?: () => boolean; isNote?: () => boolean
  getField?(field: string): unknown; getCreators?(): unknown[]; getTags?(): Array<{ tag: string }>
}
type NativeCollection = {
  id: number; key?: string; libraryID: number; name?: string
  getChildItems?(): unknown[] | Promise<unknown[]>
  getChildCollections?(): unknown[] | Promise<unknown[]>
}

export type ReviewCollection = { id: number; key: string; libraryID: number; name: string; path: string[] }
export type QuickReviewModelState = { selection: PaperAnalysisModelSelection; label: string; ready: boolean; issue: string; config?: ByokConfig }
export type QuickReviewSession = { conversationId: string; clientRequestId: string }
export type QuickReviewRunResult = {
  record: QuickReviewRecord
  result: QuickReviewResult
  text: string
  papers: QuickReviewPaperInput[]
  historySaved: boolean
  historyError?: string
  unconfirmed?: boolean
}

export type QuickReviewError = Error & { unconfirmed?: boolean; code?: string; partialText?: string }

type QuickReviewServices = {
  send(input: TemporaryChatSendInput, model: QuickReviewModelState): Promise<string>
  appendHistory(store: { get(key: string): unknown; set(key: string, value: unknown): void }, record: QuickReviewRecord): QuickReviewRecord
}

function field(item: NativeItem, name: string) {
  const value = item.getField?.(name)
  return typeof value === "string" ? value.slice(0, MAX_ROW_FIELDS) : ""
}

function creatorName(creator: unknown) {
  const row = (creator ?? {}) as { creatorType?: string; firstName?: string; lastName?: string; name?: string }
  const parts = [row.lastName, row.firstName].filter(part => typeof part === "string" && part.trim()).join(" ")
  return parts || (typeof row.name === "string" ? row.name.trim() : "")
}

function isScannable(item: unknown): item is NativeItem {
  const row = item as NativeItem | null | undefined
  if (!row || typeof row !== "object" || row.deleted) return false
  if (row.isRegularItem?.() === false || row.isAttachment?.() === true || row.isNote?.() === true) return false
  return typeof row.id === "number" && Boolean(field(row, "title").trim())
}

/** 右键入口只取当前选中的收藏夹 ID；没有选中就交给界面提示，不回退到别的目录。 */
export function selectedReviewCollectionIDs(host: ZoteroLike): number[] {
  return selectedZoteroCollections(host)
    .map(collection => Number((collection as { id?: unknown } | null)?.id))
    .filter(id => Number.isInteger(id) && id > 0)
}

/** 收藏夹名 → 层级路径，供界面与提示词标注文献来源。 */
export async function listReviewCollections(host: ZoteroLike, libraryID: number): Promise<ReviewCollection[]> {
  const entries = await host.Collections?.getByLibrary?.(libraryID, true) as NativeCollection[] | undefined
  const byID = new Map((entries ?? []).filter(entry => entry && typeof entry.id === "number" && entry.libraryID === libraryID).map(entry => [entry.id, entry]))
  return [...byID.values()].map(entry => {
    const path = [String(entry.name ?? "").trim() || uiText("未命名收藏夹", "Untitled collection")]
    const visited = new Set([entry.id])
    let parentID = Number((entry as { parentID?: number | false }).parentID ?? 0)
    while (parentID && byID.has(parentID) && !visited.has(parentID)) {
      visited.add(parentID)
      const parent = byID.get(parentID)!
      path.unshift(String(parent.name ?? "").trim() || uiText("未命名收藏夹", "Untitled collection"))
      parentID = Number((parent as { parentID?: number | false }).parentID ?? 0)
    }
    return { id: entry.id, key: String(entry.key ?? ""), libraryID: entry.libraryID, name: path[path.length - 1], path }
  }).sort((left, right) => left.path.join("\u0000").localeCompare(right.path.join("\u0000")))
}

/** 递归含子收藏夹，按 libraryID:itemKey 去重；附件、笔记与回收站条目不参与。 */
export async function collectReviewRows(host: ZoteroLike, collectionID: number): Promise<{ rows: ReviewPaperRow[]; collection: ReviewCollection | null; scanned: number; truncated: boolean }> {
  const collection = await host.Collections?.get?.(collectionID) as NativeCollection | undefined
  if (!collection || typeof collection.id !== "number") return { rows: [], collection: null, scanned: 0, truncated: false }
  const path = [String(collection.name ?? "").trim() || uiText("未命名收藏夹", "Untitled collection")]
  const rows: ReviewPaperRow[] = []
  const seen = new Set<string>()
  const visitedCollections = new Set<number>()
  let scanned = 0
  let truncated = false
  const walk = async (record: NativeCollection) => {
    if (visitedCollections.has(record.id)) return
    visitedCollections.add(record.id)
    if (scanned >= MAX_SCANNED_ITEMS) { truncated = true; return }
    const children = await Promise.resolve(record.getChildItems?.() ?? []).catch(() => []) as NativeItem[]
    for (const item of children) {
      if (scanned >= MAX_SCANNED_ITEMS) { truncated = true; break }
      scanned += 1
      if (!isScannable(item)) continue
      const key = `${item.libraryID}:${item.key ?? item.id}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        libraryID: item.libraryID,
        itemKey: String(item.key ?? item.id),
        title: field(item, "title").trim(),
        creators: (item.getCreators?.() ?? []).map(creatorName).filter(Boolean).map(name => ({ creatorType: "author", name })),
        date: field(item, "date"),
        publicationTitle: field(item, "publicationTitle"),
        doi: field(item, "DOI"),
        abstract: field(item, "abstractNote"),
        tags: (item.getTags?.() ?? []).map(tag => String(tag.tag ?? "")).filter(Boolean),
        // url 与 extra 常放项目主页和代码仓库；这里只取链接文本，不送整段字段。
        links: normalizeReviewLinks([...extractReviewLinks(field(item, "url")), ...extractReviewLinks(field(item, "extra"))]),
      })
    }
    const subcollections = await Promise.resolve(record.getChildCollections?.() ?? []).catch(() => []) as NativeCollection[]
    for (const child of subcollections) {
      if (!child || typeof child.id !== "number") continue
      await walk(child)
    }
  }
  await walk(collection)
  const current: ReviewCollection = { id: collection.id, key: String(collection.key ?? ""), libraryID: collection.libraryID, name: path[0], path }
  return { rows, collection: current, scanned, truncated }
}

/** 与单篇解析共用功能模型：同一模型选择，避免出现第二个未审计的计费目的地。 */
export function quickReviewModelState(host: ZoteroLike, invalidJadenseToken: string | null = null): QuickReviewModelState {
  return featureModelState(host, "analysis", invalidJadenseToken)
}

function defaultServices(host: ZoteroLike, fetchImpl: typeof fetch): QuickReviewServices {
  return {
    appendHistory: appendQuickReviewRecord,
    async send(input, model) {
      if (model.selection.route === "byok") return new ReliableByokChatClient({ config: model.config!, fetchImpl }).send(input)
      const connection = readConnection(host)
      return new ReliableTemporaryChatClient({ baseUrl: connection.baseUrl, token: connection.token, selection: model.selection.selection, fetchImpl }).send(input)
    },
  }
}

function reviewID(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.()
  return random ? `${prefix}-${random}` : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`
}

/**
 * 一次派发生成整份综述：不换 conversation，因此未确认的 BYOK 执行仍能被本地日志拦住。
 * 只有用户显式授权（allowUnconfirmedRetry）才会顶掉未确认记录重新计费。
 */
export async function runQuickReview(input: {
  zotero: ZoteroLike
  collection: ReviewCollection
  rows: ReviewPaperRow[]
  session: QuickReviewSession
  signal: AbortSignal
  invalidJadenseToken?: string | null
  allowUnconfirmedRetry?: boolean
  /** 在同一次请求里追加逐篇评价；不新增派发次数，因此计费目的地与篇数都不变。 */
  evaluate?: boolean
  onProgress?: (message: string) => void
  fetchImpl?: typeof fetch
  services?: Partial<QuickReviewServices>
}): Promise<QuickReviewRunResult> {
  const host = input.zotero
  const fetchImpl = input.fetchImpl ?? ((request: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(request, init))
  const model = quickReviewModelState(host, input.invalidJadenseToken ?? null)
  if (!model.ready) throw Object.assign(new Error(model.issue), { code: "AI_NOT_CONFIGURED" } as Partial<QuickReviewError>)
  const services = { ...defaultServices(host, fetchImpl), ...input.services }
  const papers = prepareQuickReviewPapers(input.rows)
  if (!papers.length) throw new Error(uiText("这个收藏夹里没有可解析的文献条目。", "This collection has no papers to review."))
  const note = papers.some(paper => paper.abstractState !== "full")
    ? uiText("部分文献缺少摘要或摘要已被长度预算压缩", "some papers lack an abstract or were compressed by the input budget")
    : ""
  const prompt = buildQuickReviewPrompt({
    collectionName: input.collection.path.join(" / "),
    papers,
    ...(note ? { note } : {}),
    ...(input.evaluate ? { evaluate: true } : {}),
  })
  const responseFormat = input.evaluate ? QUICK_REVIEW_RATING_RESPONSE_FORMAT : QUICK_REVIEW_RESPONSE_FORMAT
  /** 接收阶段没有阶段文案，状态行会整段不动；按字数增长补一条自节流的进度，避免看起来像卡死。 */
  let receiptAt = 0
  let receiptChars = 0
  const streamProgress = (state: RequestProgress) => {
    const activity = requestActivityText(state)
    if (activity) return activity
    const chars = state.receivedCharacters ?? 0
    const now = Date.now()
    if (state.stage !== "receiving" || chars <= receiptChars || now - receiptAt < 2_000) return ""
    receiptAt = now
    receiptChars = chars
    return uiText(`正在接收综述 · 已收到 ${chars.toLocaleString("en-US")} 字`, `Receiving the review · ${chars.toLocaleString("en-US")} characters so far`)
  }
  const request = (signal: AbortSignal): TemporaryChatSendInput => ({
    clientRequestId: input.session.clientRequestId,
    conversationId: input.session.conversationId,
    // 与单篇解析同一功能标识：快速解析沿用其计费与配额语义，不新增未审计的目的地。
    clientFeature: "analysis",
    messages: [{ id: reviewID("review-prompt"), role: "user", text: prompt }],
    sources: [],
    signal,
    requireComplete: true,
    ...(input.allowUnconfirmedRetry ? { allowUnconfirmedRetry: true } : {}),
    ...(model.selection.route === "byok" ? {} : { responseFormat }),
    onProgress: state => {
      const message = streamProgress(state)
      if (message && !signal.aborted) { try { input.onProgress?.(message) } catch { /* 进度界面不得影响结果。 */ } }
    },
  })

  const notify = (message: string) => { try { input.onProgress?.(message) } catch { /* 同上。 */ } }
  notify(uiText(
    `正在使用${model.label}汇总 ${papers.length} 篇文献${input.evaluate ? "（含逐篇评价）" : ""}…`,
    `Reviewing ${papers.length} papers with ${model.label}${input.evaluate ? " and ratings" : ""}…`,
  ))
  let response = ""
  let warning: string | undefined
  let unconfirmed: boolean | undefined
  try {
    response = await services.send(request(input.signal), model)
    input.signal.throwIfAborted()
  } catch (error) {
    const recovered = executionResult(error).text
    const issue = requestIssue(error)
    unconfirmed = issue.code === "BYOK_EXECUTION_UNCONFIRMED"
    if (!recovered.trim()) {
      const wrapped: QuickReviewError = Object.assign(new Error(withErrorType(error, error instanceof Error ? error.message : String(error))), {
        unconfirmed,
        ...(unconfirmed ? { code: "BYOK_EXECUTION_UNCONFIRMED" } : {}),
      })
      throw wrapped
    }
    // 已收到部分内容时不再派发：保留可读者并说明边界，与单篇解析同一处理。
    response = recovered.slice(0, 256_000)
    warning = withErrorType(error, input.signal.aborted
      ? uiText("生成已停止；以下为已收到的部分综述。", "Generation stopped. The following is the partial review received.")
      : uiText("综述未完整结束；以下为已收到的部分。", "The review did not finish. The following is the partial response."))
  }

  const header = uiText(
    `快速解析 · ${input.collection.path.join(" / ")}（${papers.length} 篇 · ${new Date().toLocaleString()}）`,
    `Quick review · ${input.collection.path.join(" / ")} (${papers.length} papers · ${new Date().toLocaleString()})`,
  )
  const result = parseQuickReview(response, papers, { evaluate: input.evaluate === true })
  if (warning) result.warnings = [warning, ...result.warnings]
  const text = formatQuickReview(result, papers, header)
  const record: QuickReviewRecord = {
    id: input.session.conversationId,
    createdAt: new Date().toISOString(),
    collection: { libraryID: input.collection.libraryID, key: input.collection.key || String(input.collection.id), name: input.collection.path.join(" / ") },
    model: model.label,
    papers: papers.map(paper => ({
      libraryID: paper.libraryID, itemKey: paper.itemKey, title: paper.title, authors: paper.authors, year: paper.year, publication: paper.publication,
      index: paper.index, abstractState: paper.abstractState, links: paper.links, appendix: paper.appendix,
      attachmentScanned: paper.attachmentScanned === true, scanPages: paper.scanPages ?? 0,
      appendixMarked: paper.appendixMarked === true,
    })),
    overview: result.overview,
    notes: text,
    warnings: result.warnings,
    review: {
      notes: result.papers,
      comparison: result.comparison,
      trends: result.trends,
      gaps: result.gaps,
      ratings: result.ratings,
      ratingOverview: result.ratingOverview,
      evaluated: result.evaluated,
    },
  }
  let historySaved = true
  let historyError: string | undefined
  notify(uiText("正在保存快速解析历史…", "Saving the quick review history…"))
  try {
    if (!host.Prefs) throw new Error("missing preferences")
    services.appendHistory(host.Prefs, record)
  } catch {
    historySaved = false
    historyError = uiText("历史保存失败；结果仍在窗口中，请及时复制。", "History could not be saved. The result stays in this window; copy it before closing.")
  }
  return { record, result, text, papers, historySaved, ...(historyError ? { historyError } : {}), ...(unconfirmed ? { unconfirmed } : {}) }
}

export const newQuickReviewSession = (): QuickReviewSession => ({ conversationId: reviewID("review"), clientRequestId: reviewID("review-request") })
