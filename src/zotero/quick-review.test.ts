/** 合成宿主覆盖收藏夹遍历、单次派发与 BYOK 未确认边界；不联网、不读取真实密钥。 */
import { describe, expect, it, vi } from "vitest"

import type { TemporaryChatSendInput } from "@/chat/temporary-chat"
import { RequestExecutionError } from "@/chat/request-feedback"
import { QUICK_REVIEW_HISTORY_PREF_KEY, quickReviewRecordView, readQuickReviewHistory } from "@/chat/quick-review-history"
import { saveAutoFollowChatModel, saveByokModel, saveByokProvider, saveFeatureModelSelection } from "./ai-settings"
import {
  collectReviewRows,
  listReviewCollections,
  newQuickReviewSession,
  quickReviewModelState,
  runQuickReview,
  selectedReviewCollectionIDs,
  type QuickReviewError,
  type QuickReviewModelState,
} from "./quick-review"
import { initializeUiLocale } from "./ui-preferences"
import type { ZoteroLike } from "./runtime"

const paper = (id: number, key: string, title: string, abstract: string, sites: { url?: string; extra?: string } = {}) => ({
  id, key, libraryID: 1, deleted: false,
  isRegularItem: () => true, isAttachment: () => false, isNote: () => false,
  getField: (field: string) => (({ title, abstractNote: abstract, date: "2025-01-02", publicationTitle: "ICML", DOI: "10.1/abc", url: sites.url ?? "", extra: sites.extra ?? "" }) as Record<string, string>)[field] ?? "",
  getCreators: () => [{ creatorType: "author", lastName: "Wu", firstName: "Lin" }],
  getTags: () => [{ tag: "edge" }],
})

type Send = (input: TemporaryChatSendInput, model: QuickReviewModelState) => Promise<string>
const sendMock = (handler: Send) => vi.fn(handler)

function fixture() {
  initializeUiLocale({ locale: "zh-CN" })
  const records: Record<number, unknown> = {
    1: paper(1, "PAPER1", "Tiny attention", "We cut inference cost by 40%.", { url: "https://github.com/tiny/attn" }),
    2: paper(2, "PAPER2", "Edge compilers", "Compiler search reduces latency on mobile NPUs.", { extra: "Project page: https://yushi-du.github.io/COLA/" }),
    3: paper(3, "PAPER3", "No abstract here", ""),
    4: { id: 4, key: "ATTACH", libraryID: 1, isRegularItem: () => false, isAttachment: () => true, getField: () => "PDF" },
    5: { id: 5, key: "NOTE", libraryID: 1, isRegularItem: () => false, isNote: () => true, getField: () => "note" },
    6: { id: 6, key: "GONE", libraryID: 1, deleted: true, isRegularItem: () => true, getField: () => "trashed" },
  }
  const byID = new Map<number, unknown>()
  const collections = [
    { id: 1, key: "ROOT", libraryID: 1, name: "ML", parentID: false, childIDs: [1], subIDs: [2] },
    { id: 2, key: "EDGE", libraryID: 1, name: "Edge", parentID: 1, childIDs: [2, 1, 3, 4, 5, 6], subIDs: [1] },
  ].map(definition => {
    const record = {
      ...definition,
      getChildItems: () => definition.childIDs.map(id => records[id]),
      getChildCollections: () => definition.subIDs.map(id => byID.get(id)),
    }
    byID.set(definition.id, record)
    return record
  })
  const values = new Map<string, unknown>([["extensions.jadenseInZotero.token", "fixture-token"]])
  const host = {
    Prefs: { get: (key: string) => values.get(key), set: (key: string, value: unknown) => { values.set(key, value) }, clear: (key: string) => { values.delete(key) } },
    Collections: { get: (id: number) => byID.get(id), getByLibrary: () => collections },
    Items: { get: (id: number) => records[id] },
  } as unknown as ZoteroLike
  return { host, values, collections }
}

/** 由 saveByok* 写出真实偏好结构，验证快速解析确实跟随「文献解析」模型。 */
function byokFixture() {
  const context = fixture()
  // 默认配置下解析槽位跟随对话模型；关掉跟随才能证明快速解析读的是「文献解析」这一槽位。
  saveAutoFollowChatModel(context.host, false)
  saveByokProvider(context.host, { id: "p", name: "P", protocol: "openai-chat-completions", baseUrl: "https://provider.test/v1", apiKey: "fixture-key" })
  saveByokModel(context.host, { id: "m", providerId: "p", name: "M", model: "model" })
  saveFeatureModelSelection(context.host, "analysis", { route: "byok", modelId: "m" })
  return context
}

const reviewJSON = JSON.stringify({
  overview: "两篇都在压缩模型之外转向端侧编译。",
  papers: [{ index: 1, hook: "成本基线", finding: "推理成本下降 40%" }, { index: 2, hook: "编译搜索", finding: "移动端延迟下降" }],
  comparison: [{ dimension: "优化对象", note: "1 改结构，2 改编译。" }],
  trends: "从算法压缩走向软硬协同。", gaps: "缺少跨芯片复现（AI 推断）。",
})

/** 逐篇评价走同一次派发：模型必须在同一个对象里带回 ratings。 */
const ratingJSON = JSON.stringify({
  overview: "两篇都从端侧推理成本切入。",
  papers: [{ index: 1, hook: "成本基线", idea: "绕开结构改动，压推理链路", experiments: "在单款移动 NPU 上对比基线", tools: "TFLite", code: "yes", data: "unknown", resourceNote: "摘要称代码随论文发布" }],
  comparison: [{ dimension: "代码可得性", note: "1 明确开源，2 未说明。" }],
  ratings: [
    { index: 1, score: 68, value: "可直接复用", novelty: "增量改进", level: "中", basis: "40% 为作者自述，需看正文确认" },
    { index: 9, score: 90, value: "越界的一篇", novelty: "编造", level: "high", basis: "" },
  ],
  rating_overview: "这批文献偏工程实用。",
})

const load = async (host: ZoteroLike, id = 1) => collectReviewRows(host, id)

describe("quick review collection scan", () => {
  it("walks sub-collections, dedupes by library key and skips attachments, notes and trash", async () => {
    const { host } = fixture()
    const collected = await load(host)
    expect(collected.rows.map(row => row.itemKey)).toEqual(["PAPER1", "PAPER2", "PAPER3"])
    expect(collected.scanned).toBe(7)
    expect(collected.truncated).toBe(false)
    expect(collected.collection).toMatchObject({ id: 1, key: "ROOT", path: ["ML"] })
  })

  it("reads only the requested sub-collection and labels it by its own name", async () => {
    const { host } = fixture()
    const collected = await load(host, 2)
    expect(collected.rows.map(row => row.itemKey)).toEqual(["PAPER2", "PAPER1", "PAPER3"])
    expect(collected.collection).toMatchObject({ id: 2, key: "EDGE", path: ["Edge"] })
  })

  it("projects creators, tags and bounded fields without attachment identities", async () => {
    const { host } = fixture()
    const { rows } = await load(host)
    expect(rows[0]).toMatchObject({ libraryID: 1, itemKey: "PAPER1", title: "Tiny attention", publicationTitle: "ICML", doi: "10.1/abc", date: "2025-01-02" })
    expect(rows[0].creators).toEqual([{ creatorType: "author", name: "Wu Lin" }])
    expect(rows[0].tags).toEqual(["edge"])
    // url 与 extra 里的网址被折成 links，原字段本身不外传。
    expect(rows[0].links).toEqual(["https://github.com/tiny/attn"])
    expect(rows[1].links).toEqual(["https://yushi-du.github.io/COLA/"])
    expect(rows[2].links).toEqual([])
    expect(Object.keys(rows[0]).sort()).toEqual(["abstract", "creators", "date", "doi", "itemKey", "libraryID", "links", "publicationTitle", "tags", "title"])
  })

  it("reports truncation instead of scanning an unbounded collection", async () => {
    const items = Array.from({ length: 501 }, (_, index) => paper(100 + index, `K${index}`, `Paper ${index}`, "abstract"))
    const byID = new Map<number, unknown>([[1, {
      id: 1, key: "BIG", libraryID: 1, name: "Big", parentID: false,
      getChildItems: () => items, getChildCollections: () => [],
    }]])
    const host = {
      Prefs: { get: () => undefined, set: () => {}, clear: () => {} },
      Collections: { get: (id: number) => byID.get(id), getByLibrary: () => [...byID.values()] },
    } as unknown as ZoteroLike
    const collected = await collectReviewRows(host, 1)
    expect(collected.truncated).toBe(true)
    expect(collected.scanned).toBe(500)
    expect(collected.rows).toHaveLength(500)
  })

  it("builds collection paths from native parents and survives a parent cycle", async () => {
    const { host } = fixture()
    const collections = await listReviewCollections(host, 1)
    expect(collections.map(collection => collection.path)).toEqual([["ML"], ["ML", "Edge"]])
    expect(collections[1]).toMatchObject({ key: "EDGE", name: "Edge", libraryID: 1 })
    expect(await listReviewCollections(host, 2)).toEqual([])
  })

  it("takes only usable collection ids from the library pane selection", () => {
    const multi = { getActiveZoteroPane: () => ({ getSelectedCollections: () => [{ id: 12 }, { id: "13" }, { id: 0 }, null] }) } as unknown as ZoteroLike
    expect(selectedReviewCollectionIDs(multi)).toEqual([12, 13])
    const single = { getActiveZoteroPane: () => ({ getSelectedCollection: () => ({ id: 3 }) }) } as unknown as ZoteroLike
    expect(selectedReviewCollectionIDs(single)).toEqual([3])
    expect(selectedReviewCollectionIDs({} as unknown as ZoteroLike)).toEqual([])
  })
})

describe("quick review run", () => {
  it("dispatches exactly once with metadata only and no BYOK response-format contract", async () => {
    const { host, values } = byokFixture()
    const send = sendMock(async () => reviewJSON)
    const { rows, collection } = await load(host)
    const session = newQuickReviewSession()
    const result = await runQuickReview({ zotero: host, collection: collection!, rows, session, signal: new AbortController().signal, services: { send } })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][1].selection.route).toBe("byok")
    const input = send.mock.calls[0][0]
    expect(input.conversationId).toBe(session.conversationId)
    expect(input.clientRequestId).toBe(session.clientRequestId)
    expect(input.responseFormat).toBeUndefined()
    expect(input.messages).toHaveLength(1)
    expect(input.messages[0].text).toContain("Tiny attention")
    expect(input.messages[0].text).toContain("We cut inference cost by 40%.")
    // 只保留这批文献的目录名，不再逐篇给路径：模型没有可“归位”的字段。
    expect(input.messages[0].text).toContain('"collection":"ML"')
    expect(input.messages[0].text).not.toContain('"path"')
    expect(input.messages[0].text).toContain("摘要级综述")
    expect(result.text).toContain("两篇都在压缩模型之外转向端侧编译")
    expect(result.text).toContain("1. Tiny attention")
    expect(result.text).toContain("3. No abstract here")
    expect(result.text).toContain("本地无摘要")
    expect(result.papers).toHaveLength(3)
    const stored = JSON.parse(String(values.get(QUICK_REVIEW_HISTORY_PREF_KEY)))
    expect(stored.records[0].collection.name).toBe("ML")
    expect(stored.records[0].papers).toHaveLength(3)
  })

  it("labels the Jadense route as analysis and keeps the structured contract", async () => {
    const { host } = fixture()
    const send = sendMock(async () => reviewJSON)
    const { rows, collection } = await load(host)
    const result = await runQuickReview({ zotero: host, collection: collection!, rows, session: newQuickReviewSession(), signal: new AbortController().signal, services: { send } })
    const input = send.mock.calls[0][0]
    expect(input.clientFeature).toBe("analysis")
    expect(input.responseFormat?.name).toBe("quick_review")
    expect(result.record.model).toBe("攻玉")
  })

  it("never re-dispatches an unconfirmed BYOK execution and surfaces the authorization need", async () => {
    const { host } = byokFixture()
    const send = sendMock(async () => { throw new RequestExecutionError("BYOK 上次执行结果未确认。已有内容保留；请先核对提供商，不会自动重发。", "unknown", "", { code: "BYOK_EXECUTION_UNCONFIRMED" }) })
    const { rows, collection } = await load(host)
    const session = newQuickReviewSession()
    const caught = await runQuickReview({ zotero: host, collection: collection!, rows, session, signal: new AbortController().signal, services: { send } })
      .catch((error: QuickReviewError) => error)
    expect(caught).toBeInstanceOf(Error)
    expect((caught as QuickReviewError).unconfirmed).toBe(true)
    expect((caught as QuickReviewError).message).toContain("不会自动重发")
    expect(send).toHaveBeenCalledTimes(1)
    expect(readQuickReviewHistory(host.Prefs!).records).toEqual([])
    // 用户显式授权后仍只派发一次，由上层客户端顶掉未确认记录。
    const authorized = sendMock(async () => reviewJSON)
    await runQuickReview({ zotero: host, collection: collection!, rows, session, signal: new AbortController().signal, allowUnconfirmedRetry: true, services: { send: authorized } })
    expect(authorized).toHaveBeenCalledTimes(1)
    expect(authorized.mock.calls[0][0].allowUnconfirmedRetry).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("retains partial output without a second request", async () => {
    const { host } = byokFixture()
    const partial = '{"overview":"总览已经完整","papers":[{"index":1,"finding":"结论"}],"comparison":[]}'
    const send = sendMock(async () => { throw new RequestExecutionError("上游流被截断", "partial", partial, { code: "STREAM_INCOMPLETE" }) })
    const { rows, collection } = await load(host)
    const result = await runQuickReview({ zotero: host, collection: collection!, rows, session: newQuickReviewSession(), signal: new AbortController().signal, services: { send } })
    expect(send).toHaveBeenCalledTimes(1)
    expect(result.text).toContain("总览已经完整")
    expect(result.result.warnings[0]).toContain("综述未完整结束")
    expect(result.result.warnings[0]).toContain("连接中断")
    expect(result.unconfirmed).toBeUndefined()
  })

  it("keeps the digest in the window when history writing fails", async () => {
    const { host } = byokFixture()
    const { rows, collection } = await load(host)
    const result = await runQuickReview({
      zotero: host, collection: collection!, rows, session: newQuickReviewSession(), signal: new AbortController().signal,
      services: { send: sendMock(async () => reviewJSON), appendHistory: () => { throw new Error("locked") } },
    })
    expect(result.historySaved).toBe(false)
    expect(result.historyError).toContain("及时复制")
    expect(result.text).toContain("横向对比")
    expect(readQuickReviewHistory(host.Prefs!).records).toEqual([])
  })

  it("stops before any request when the model target is not configured", async () => {
    const { host } = fixture()
    host.Prefs!.clear("extensions.jadenseInZotero.token")
    saveAutoFollowChatModel(host, false)
    saveFeatureModelSelection(host, "analysis", { route: "byok", modelId: "removed-model" })
    const send = sendMock(async () => reviewJSON)
    const { rows, collection } = await load(host)
    const caught = await runQuickReview({ zotero: host, collection: collection!, rows, session: newQuickReviewSession(), signal: new AbortController().signal, services: { send } })
      .catch((error: QuickReviewError) => error)
    expect((caught as QuickReviewError).code).toBe("AI_NOT_CONFIGURED")
    expect(send).not.toHaveBeenCalled()
    expect(quickReviewModelState(host).ready).toBe(false)
  })

  it("does not send when the collection has no papers and survives a broken progress listener", async () => {
    const { host } = byokFixture()
    const send = sendMock(async () => reviewJSON)
    const empty = await collectReviewRows({ ...host, Collections: { get: () => ({ id: 9, key: "EMPTY", libraryID: 1, name: "Empty", getChildItems: () => [], getChildCollections: () => [] }), getByLibrary: () => [] } } as unknown as ZoteroLike, 9)
    await expect(runQuickReview({ zotero: host, collection: empty.collection!, rows: empty.rows, session: newQuickReviewSession(), signal: new AbortController().signal, services: { send } }))
      .rejects.toThrow("没有可解析的文献条目")
    expect(send).not.toHaveBeenCalled()
    const noisy = await runQuickReview({
      zotero: host, collection: (await load(host)).collection!, rows: (await load(host)).rows,
      session: newQuickReviewSession(), signal: new AbortController().signal,
      onProgress: () => { throw new Error("ui unavailable") },
      services: { send },
    })
    expect(noisy.text).toContain("横向对比")
  })

  it("throttles the received-character progress so a quiet stream still looks alive", async () => {
    const { host } = byokFixture()
    const { rows, collection } = await load(host)
    const messages: string[] = []
    const send = sendMock(async input => {
      // 接收阶段没有阶段文案；字数只在增长且距上次上报足够久时才补一行，避免刷爆状态行。
      input.onProgress?.({ stage: "receiving", receivedCharacters: 120 })
      input.onProgress?.({ stage: "receiving", receivedCharacters: 180 })
      input.onProgress?.({ stage: "reasoning" })
      return reviewJSON
    })
    await runQuickReview({
      zotero: host, collection: collection!, rows, session: newQuickReviewSession(),
      signal: new AbortController().signal, onProgress: message => { messages.push(message) }, services: { send },
    })
    expect(messages.some(message => message.includes("已收到 120 字"))).toBe(true)
    expect(messages.some(message => message.includes("180"))).toBe(false)
    expect(messages.some(message => message.includes("持续收到思考"))).toBe(true)
  })
})

describe("quick review with ratings", () => {
  it("folds the rating request into the same single dispatch", async () => {
    const { host } = fixture()
    const send = sendMock(async () => ratingJSON)
    const { rows, collection } = await load(host)
    const result = await runQuickReview({ zotero: host, collection: collection!, rows, session: newQuickReviewSession(), signal: new AbortController().signal, evaluate: true, services: { send } })
    expect(send).toHaveBeenCalledTimes(1)
    const input = send.mock.calls[0][0]
    expect(input.responseFormat?.name).toBe("quick_review_with_rating")
    expect(input.messages[0].text).toContain("ratings 与 papers 同一次返回")
    expect(input.messages[0].text).toContain("不得根据常识、期刊或“这类论文通常会开源”推断")
    // 题录里发现的链接随数据一起外发，模型才能引用真实网址。
    expect(input.messages[0].text).toContain("https://github.com/tiny/attn")
    expect(result.result.ratings).toEqual([expect.objectContaining({ index: 1, score: 68, level: "medium" })])
    expect(result.result.skipped).toBe(1)
    expect(result.text).toContain("内容评分（中等 · 68/100）：实用价值：可直接复用")
    expect(result.text).toContain("开源代码：明确给出")
    expect(result.text).toContain("总体评价")
  })

  it("keeps the BYOK rating request prompt-only with no response-format contract", async () => {
    const { host } = byokFixture()
    const send = sendMock(async () => ratingJSON)
    const { rows, collection } = await load(host)
    await runQuickReview({ zotero: host, collection: collection!, rows, session: newQuickReviewSession(), signal: new AbortController().signal, evaluate: true, services: { send } })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].responseFormat).toBeUndefined()
    expect(send.mock.calls[0][0].messages[0].text).toContain("score 锚点（同一批文献用同一把尺子")
    // BYOK 也只改提示词：请求参数里没有采样旋钮，分数靠锚点而不是靠调温度稳定。
    expect(Object.keys(send.mock.calls[0][0]).filter(key => /temperature|top_p|seed|sampling/iu.test(key))).toEqual([])
  })

  it("rewrites an unconfirmed rating run once, with the same single dispatch", async () => {
    const { host } = byokFixture()
    const send = sendMock(async () => { throw new RequestExecutionError("BYOK 上次执行结果未确认。已有内容保留；请先核对提供商，不会自动重发。", "unknown", "", { code: "BYOK_EXECUTION_UNCONFIRMED" }) })
    const { rows, collection } = await load(host)
    const session = newQuickReviewSession()
    const caught = await runQuickReview({ zotero: host, collection: collection!, rows, session, signal: new AbortController().signal, evaluate: true, services: { send } })
      .catch((error: QuickReviewError) => error)
    expect((caught as QuickReviewError).unconfirmed).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
    const authorized = sendMock(async () => ratingJSON)
    const done = await runQuickReview({ zotero: host, collection: collection!, rows, session, signal: new AbortController().signal, allowUnconfirmedRetry: true, evaluate: true, services: { send: authorized } })
    expect(authorized).toHaveBeenCalledTimes(1)
    expect(authorized.mock.calls[0][0].allowUnconfirmedRetry).toBe(true)
    expect(done.result.ratings).toHaveLength(1)
  })

  it("persists the structured review so reopening the record restores the cards", async () => {
    const { host, values } = fixture()
    const { rows, collection } = await load(host)
    const { record } = await runQuickReview({ zotero: host, collection: collection!, rows, session: newQuickReviewSession(), signal: new AbortController().signal, evaluate: true, services: { send: sendMock(async () => ratingJSON) } })
    const stored = JSON.parse(String(values.get(QUICK_REVIEW_HISTORY_PREF_KEY))).records[0]
    expect(stored.papers.map((paper: Record<string, unknown>) => [paper.index, paper.abstractState])).toEqual([[1, "full"], [2, "full"], [3, "missing"]])
    // 历史里也要留住当时发现的链接，重新打开时卡片仍能看到开源地址。
    expect(stored.papers[0].links).toEqual(["https://github.com/tiny/attn"])
    expect(stored.review.evaluated).toBe(true)
    expect(stored.review.ratings[0].level).toBe("medium")
    const restored = quickReviewRecordView(stored)
    expect(restored?.papers.map(paper => paper.title)).toEqual(["Tiny attention", "Edge compilers", "No abstract here"])
    expect(restored?.papers[2].abstractState).toBe("missing")
    expect(restored?.papers[0].links).toEqual(["https://github.com/tiny/attn"])
    expect(restored?.result.papers[0].experiments).toContain("单款移动 NPU")
    expect(restored?.result.ratings[0].novelty).toBe("增量改进")
    expect(restored?.result.ratingOverview).toBe("这批文献偏工程实用。")
    // 序号越界的评价不会在重新打开时凭空多出一篇。
    expect(stored.review.ratings).toHaveLength(1)
    expect(record.review?.evaluated).toBe(true)
  })
})
