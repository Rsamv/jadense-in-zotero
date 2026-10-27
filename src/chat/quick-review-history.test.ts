/** 历史只按收藏夹归档，损坏或不完整的记录一律丢弃而不是改写界面状态。 */
import { describe, expect, it, vi } from "vitest"

import {
  appendQuickReviewRecord,
  clearQuickReviewHistory,
  QUICK_REVIEW_HISTORY_PREF_KEY,
  quickReviewRecordView,
  readQuickReviewHistory,
  removeQuickReviewRecord,
  type QuickReviewRecord,
} from "./quick-review-history"

const record = (overrides: Partial<QuickReviewRecord> = {}): QuickReviewRecord => ({
  id: "review-00000000-0000-4000-8000-000000000001",
  createdAt: "2026-10-26T02:00:00.000Z",
  collection: { libraryID: 1, key: "COLLA", name: "ML / Edge" },
  model: "BYOK · gpt-5",
  papers: [{ libraryID: 1, itemKey: "PAPER1", title: "Attention for tiny models", authors: "Wu Lin", year: "2025", publication: "ICML" }],
  overview: "两篇都关注端侧推理成本。",
  notes: "快速解析 · ML / Edge\n\n总览\n…",
  ...overrides,
})

function store(initial?: string) {
  let value = initial
  const prefs = { get: vi.fn(() => value), set: vi.fn((key: string, next: unknown) => { value = String(next) }) }
  return { prefs, read: () => value }
}

describe("quick review history", () => {
  it("appends newest first and round-trips through the preference", () => {
    const { prefs } = store()
    appendQuickReviewRecord(prefs, record())
    appendQuickReviewRecord(prefs, record({ id: "review-2", createdAt: "2026-10-27T02:00:00.000Z" }))
    const history = readQuickReviewHistory(prefs)
    expect(history.records.map(row => row.id)).toEqual(["review-2", record().id])
    expect(history.records[0].papers[0].title).toBe("Attention for tiny models")
    expect(prefs.set).toHaveBeenCalledWith(QUICK_REVIEW_HISTORY_PREF_KEY, expect.any(String))
  })

  it("drops records without a collection, a paper list or a valid timestamp", () => {
    const { prefs } = store(JSON.stringify({ version: 1, records: [
      record(),
      { ...record({ id: "no-collection" }), collection: { libraryID: 1, key: "", name: "" } },
      { ...record({ id: "no-papers" }), papers: [] },
      { ...record({ id: "bad-date" }), createdAt: "not-a-date" },
      { ...record({ id: "long-id" }), id: "x".repeat(200) },
    ] }))
    expect(readQuickReviewHistory(prefs).records.map(row => row.id)).toEqual([record().id])
  })

  it("returns an empty history for unreadable or foreign payloads", () => {
    expect(readQuickReviewHistory(store("{").prefs).records).toEqual([])
    expect(readQuickReviewHistory(store(JSON.stringify({ version: 2, records: [record()] })).prefs).records).toEqual([])
    expect(readQuickReviewHistory(store(JSON.stringify("plain string")).prefs).records).toEqual([])
  })

  it("ignores unknown fields, extra papers and overlong notes", () => {
    const longNotes = "长".repeat(70_000)
    const { prefs } = store()
    const saved = appendQuickReviewRecord(prefs, { ...record({ notes: longNotes }), unexpected: true } as never)
    expect(saved.notes.length).toBeLessThanOrEqual(60_000)
    expect(saved.notes).toContain("内容过长，后续已截断")
    const many = appendQuickReviewRecord(prefs, record({ id: "review-many", papers: Array.from({ length: 40 }, (_, index) => ({ ...record().papers[0], itemKey: `K${index}` })) }))
    expect(many.papers).toHaveLength(30)
  })

  it("removes one record and clears the rest", () => {
    const { prefs } = store()
    appendQuickReviewRecord(prefs, record())
    appendQuickReviewRecord(prefs, record({ id: "review-2" }))
    expect(removeQuickReviewRecord(prefs, "review-2")).toBe(true)
    expect(removeQuickReviewRecord(prefs, "missing")).toBe(false)
    expect(readQuickReviewHistory(prefs).records.map(row => row.id)).toEqual([record().id])
    clearQuickReviewHistory(prefs)
    expect(readQuickReviewHistory(prefs).records).toEqual([])
  })

  it("bounds the stored size by the oldest records", () => {
    const { prefs } = store()
    for (let index = 0; index < 60; index += 1) {
      appendQuickReviewRecord(prefs, record({
        id: `review-${index}`,
        createdAt: new Date(Date.UTC(2026, 9, 26, 0, index)).toISOString(),
        notes: "n".repeat(9_000),
      }))
    }
    const history = readQuickReviewHistory(prefs)
    expect(history.records.length).toBeLessThanOrEqual(40)
    expect(history.records[0].id).toBe("review-59")
    expect(JSON.stringify(history).length).toBeLessThanOrEqual(800_000)
  })
})

/** 历史点开要复原逐篇卡片，因此结构化正文必须与题录同一序号对齐保存。 */
const structuredRecord = (): QuickReviewRecord => ({
  ...record(),
  papers: [
    { libraryID: 1, itemKey: "PAPER1", title: "Attention for tiny models", authors: "Wu Lin", year: "2025", publication: "ICML", index: 1, abstractState: "full", links: ["https://expressive-humanoid.github.io", "https://arxiv.org/abs/2402.19099"], appendix: ["A. Motion Dataset Selection", "a. 不合标题形状的一行", "A. Motion Dataset Selection"],
      appendixRefs: [
        { title: "A. Motion Dataset Selection", page: 7, attachmentID: 101 },
        { title: "B. 没存进小节的标题", page: 9, attachmentID: 101 },
        { title: "A. Motion Dataset Selection", page: 0, attachmentID: 101 },
      ] },
    { libraryID: 1, itemKey: "PAPER2", title: "Edge compilers", authors: "Chen Rui", year: "2024", publication: "MLSys", index: 2, abstractState: "missing" },
  ],
  review: {
    notes: [
      { index: 1, hook: "成本基线", question: "", idea: "绕开结构改动", method: "", experiments: "单款移动 NPU 对比", finding: "延迟下降 40%", limitation: "", tools: "TFLite", code: "yes", data: "unknown", resourceNote: "摘要称代码随论文发布" },
      { index: 3, hook: "不存在的一篇", question: "", idea: "", method: "", experiments: "", finding: "", limitation: "", tools: "", code: "yes", data: "yes", resourceNote: "" },
      { index: 1, hook: "重复序号", question: "", idea: "", method: "", experiments: "", finding: "", limitation: "", tools: "", code: "no", data: "no", resourceNote: "" },
    ],
    comparison: Array.from({ length: 10 }, (_, position) => ({ dimension: `维度${position}`, note: "差异" })),
    trends: "脉络", gaps: "",
    ratings: [
      { index: 2, value: "可复用", novelty: "增量", level: "medium", basis: "仅摘要证据" },
      { index: 7, value: "越界", novelty: "", level: "high", basis: "" },
      { index: 1, value: "偏工程", novelty: "", level: "没有这一档", basis: "" },
    ],
    ratingOverview: "整体偏工程实用。",
    evaluated: true,
  },
})

describe("quick review history restore", () => {
  it("round-trips the structured review and keeps the per-paper index", () => {
    const { prefs } = store()
    appendQuickReviewRecord(prefs, structuredRecord())
    const [saved] = readQuickReviewHistory(prefs).records
    expect(saved.papers.map(paper => [paper.index, paper.abstractState])).toEqual([[1, "full"], [2, "missing"]])
    const restored = quickReviewRecordView(saved)
    expect(restored?.papers.map(paper => paper.title)).toEqual(["Attention for tiny models", "Edge compilers"])
    expect(restored?.result.papers.map(note => note.index)).toEqual([1])
    expect(restored?.result.papers[0].experiments).toBe("单款移动 NPU 对比")
    expect(restored?.result.papers[0].resourceNote).toBe("摘要称代码随论文发布")
    // 链接与附录标题随记录保存：写入时已剔掉论文落地页和不合标题形状的行。
    expect(restored?.papers[0].links).toEqual(["https://expressive-humanoid.github.io"])
    expect(restored?.papers[0].appendix).toEqual(["A. Motion Dataset Selection"])
    // 跳页信息只保留小节列表里确有的标题与合法页码：坏记录不能凭空造出可点小节。
    expect(restored?.papers[0].appendixRefs).toEqual([{ title: "A. Motion Dataset Selection", page: 7, attachmentID: 101 }])
    expect(restored?.papers[1].appendix).toBeUndefined()
    expect(restored?.papers[1].appendixRefs).toBeUndefined()
    expect(restored?.result.ratings.map(rating => rating.index).sort()).toEqual([1, 2])
    expect(restored?.result.ratingOverview).toBe("整体偏工程实用。")
    expect(restored?.result.evaluated).toBe(true)
  })

  it("refuses notes and ratings that point at papers the record never stored", () => {
    const { prefs } = store()
    const saved = appendQuickReviewRecord(prefs, structuredRecord())
    expect(saved.review?.notes.map(note => note.index)).toEqual([1])
    expect(saved.review?.ratings.map(rating => rating.index).sort()).toEqual([1, 2])
    // 未知档位收紧到 unclear，界面才能沿用同一套配色。
    expect(saved.review?.ratings.find(rating => rating.index === 1)?.level).toBe("unclear")
    expect(saved.review?.ratings.find(rating => rating.index === 2)?.level).toBe("medium")
    expect(saved.review?.comparison).toHaveLength(8)
  })

  it("falls back to the stored text for records written before the structured review", () => {
    const { prefs } = store()
    appendQuickReviewRecord(prefs, record())
    const [legacy] = readQuickReviewHistory(prefs).records
    expect(legacy.review).toBeUndefined()
    expect(quickReviewRecordView(legacy)).toBeNull()
  })

  it("treats a record whose structure ended up empty as text-only", () => {
    const { prefs } = store()
    const saved = appendQuickReviewRecord(prefs, { ...structuredRecord(), review: { notes: [{ index: 4, hook: "x", question: "", idea: "", method: "", experiments: "", finding: "", limitation: "", tools: "", code: "unknown", data: "unknown", resourceNote: "" }], comparison: [], trends: "", gaps: "", ratings: [], ratingOverview: "", evaluated: false } })
    expect(saved.review).toBeUndefined()
    expect(quickReviewRecordView(saved)).toBeNull()
  })
})
