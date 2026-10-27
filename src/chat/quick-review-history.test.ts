/** 历史只按收藏夹归档，损坏或不完整的记录一律丢弃而不是改写界面状态；单篇深读写回那一篇，坏页码不凑数。 */
import { describe, expect, it, vi } from "vitest"

import {
  appendQuickReviewRecord,
  clearQuickReviewHistory,
  QUICK_REVIEW_HISTORY_PREF_KEY,
  quickReviewRecordView,
  readQuickReviewHistory,
  removeQuickReviewRecord,
  saveQuickReviewDeepRead,
  type QuickReviewRecord,
} from "./quick-review-history"
import type { StoredDeepRead } from "./review-deep-read"

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
      ],
      structure: { headings: ["Introduction", "Method"], figures: 6, tables: 2, references: 41, ablation: 3, baselines: 5, humanEval: 0 },
      sectionRefs: [
        { title: "Introduction", page: 1, attachmentID: 101 },
        { title: "Method", page: 3, attachmentID: 101 },
        { title: "Method", page: 0, attachmentID: 101 },
        { title: "Conclusion", page: 6, attachmentID: 101 },
        { title: "Introduction", page: 2, attachmentID: 0 },
      ] },
    { libraryID: 1, itemKey: "PAPER2", title: "Edge compilers", authors: "Chen Rui", year: "2024", publication: "MLSys", index: 2, abstractState: "missing",
      // 全空的版面统计等于"没数出来"：不能存成一条 0，否则历史里会显示"图 0 · 表 0"。
      structure: { headings: [], figures: 0, tables: 0, references: null, ablation: 0, baselines: 0, humanEval: 0 } },
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
      { index: 2, score: 55, value: "可复用", novelty: "增量", level: "high", basis: "仅摘要证据" },
      { index: 7, score: 80, value: "越界", novelty: "", level: "high", basis: "" },
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
    expect(restored?.papers[0].appendix).toEqual(["Motion Dataset Selection"])
    // 跳页信息只保留小节列表里确有的标题与合法页码：坏记录不能凭空造出可点小节。
    expect(restored?.papers[0].appendixRefs).toEqual([{ title: "Motion Dataset Selection", page: 7, attachmentID: 101 }])
    expect(restored?.papers[1].appendix).toBeUndefined()
    expect(restored?.papers[1].appendixRefs).toBeUndefined()
    // 版面统计随记录保存，历史点开才能复原"本机数出"的那一行；全空的一条不存。
    expect(restored?.papers[0].structure).toEqual({ headings: ["Introduction", "Method"], figures: 6, tables: 2, references: 41, ablation: 3, baselines: 5, humanEval: 0 })
    expect(restored?.papers[1].structure).toBeUndefined()
    // 正文小节跳页只认版面统计里确有的标题：坏页码、坏附件 ID、列表外的标题都不留。
    expect(restored?.papers[0].sectionRefs).toEqual([
      { title: "Introduction", page: 1, attachmentID: 101 },
      { title: "Method", page: 3, attachmentID: 101 },
    ])
    expect(restored?.papers[1].sectionRefs).toBeUndefined()
    expect(restored?.result.ratings.map(rating => rating.index).sort()).toEqual([1, 2])
    // 分数写入后档位由分数折算；旧记录没有分数时才沿用模型档位。
    expect(restored?.result.ratings.find(rating => rating.index === 2)).toMatchObject({ score: 55, level: "low" })
    expect(restored?.result.ratings.find(rating => rating.index === 1)).toMatchObject({ level: "unclear" })
    expect(restored?.result.ratingOverview).toBe("整体偏工程实用。")
    expect(restored?.result.evaluated).toBe(true)
  })

  it("refuses notes and ratings that point at papers the record never stored", () => {
    const { prefs } = store()
    const saved = appendQuickReviewRecord(prefs, structuredRecord())
    expect(saved.review?.notes.map(note => note.index)).toEqual([1])
    expect(saved.review?.ratings.map(rating => rating.index).sort()).toEqual([1, 2])
    // 未知档位收紧到 unclear；带分数的那条由分数折算，界面才能沿用同一套配色。
    expect(saved.review?.ratings.find(rating => rating.index === 1)?.level).toBe("unclear")
    expect(saved.review?.ratings.find(rating => rating.index === 2)?.level).toBe("low")
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

/** 深读发生在综述落库之后：结果按记录 ID 与序号写回那一篇，不重存整条记录。 */
const deepRead = (overrides: Partial<StoredDeepRead> = {}): StoredDeepRead => ({
  createdAt: "2026-10-27T03:00:00.000Z",
  model: "BYOK · gpt-5",
  sections: [{ heading: "Method", part: "head", page: 2, attachmentID: 101 }],
  chars: 320,
  readPages: 10,
  summary: "把推理链路压到端侧运行。",
  method: "摘录：给出蒸馏与量化两步，超参未给。",
  evidence: "摘录：单款移动 NPU 上对比三个基线。",
  reproducibility: "摘录：训练设置缺失。",
  limitation: "摘录：只测了一款芯片。",
  basis: "摘录：证据来自作者自述。",
  score: 72,
  ...overrides,
})

describe("quick review deep read write-back", () => {
  it("stores the deep read on the existing record without adding or reordering records", () => {
    const { prefs } = store()
    appendQuickReviewRecord(prefs, structuredRecord())
    appendQuickReviewRecord(prefs, { ...structuredRecord(), id: "review-2", createdAt: "2026-10-27T02:00:00.000Z" })
    expect(saveQuickReviewDeepRead(prefs, "review-2", 2, deepRead())).toBe(true)
    const records = readQuickReviewHistory(prefs).records
    expect(records.map(row => row.id)).toEqual(["review-2", structuredRecord().id])
    // 只有被点开的那一篇带上深读：另一篇、另一条记录都不受影响。
    expect(records[0].papers[1].deepRead?.summary).toBe("把推理链路压到端侧运行。")
    expect(records[0].papers[0].deepRead).toBeUndefined()
    expect(records[1].papers.some(paper => paper.deepRead)).toBe(false)
  })

  it("restores deep reads by index and keeps the item locators needed to reopen the attachment", () => {
    const { prefs } = store()
    appendQuickReviewRecord(prefs, structuredRecord())
    const [saved] = readQuickReviewHistory(prefs).records
    saveQuickReviewDeepRead(prefs, saved.id, 1, deepRead())
    const restored = quickReviewRecordView(readQuickReviewHistory(prefs).records[0])
    expect([...restored!.deepReads.keys()]).toEqual([1])
    expect(restored!.deepReads.get(1)).toMatchObject({ score: 72, chars: 320, readPages: 10, sections: [{ heading: "Method", part: "head", page: 2, attachmentID: 101 }] })
    // 跳页要能对着本机附件做：定位信息随展示用的一起给出，但不进任何请求载荷。
    expect(restored!.papers[0]).toMatchObject({ index: 1, libraryID: 1, itemKey: "PAPER1" })
    expect(restored!.deepReads.has(2)).toBe(false)
  })

  it("refuses to write when the record, the paper or the payload is gone", () => {
    const { prefs } = store()
    appendQuickReviewRecord(prefs, structuredRecord())
    expect(saveQuickReviewDeepRead(prefs, "missing-record", 1, deepRead())).toBe(false)
    expect(saveQuickReviewDeepRead(prefs, structuredRecord().id, 9, deepRead())).toBe(false)
    // 全空的返回不算一次深读：写进去只会让历史里多出一张空卡片。
    expect(saveQuickReviewDeepRead(prefs, structuredRecord().id, 1, deepRead({ summary: "", method: "", evidence: "", reproducibility: "", limitation: "", basis: "", score: undefined }))).toBe(false)
    expect(readQuickReviewHistory(prefs).records[0].papers.every(paper => !paper.deepRead)).toBe(true)
  })

  it("salvages a malformed stored deep read instead of inventing sections", () => {
    const { prefs } = store(JSON.stringify({ version: 1, records: [{
      ...structuredRecord(),
      papers: structuredRecord().papers.map((paper, position) => (position === 0 ? {
        ...paper,
        deepRead: {
          ...deepRead(),
          // 坏页码、坏附件 ID、超出三节的部分都要被剔掉，标题却得照实留着。
          sections: [
            { heading: "Method", part: "tail", page: 2, attachmentID: 101 },
            { heading: "", part: "head", page: 3 },
            { heading: "Experiments", part: "sideways", page: 0 },
            { heading: "Conclusion", part: "head", page: 4, attachmentID: -3 },
            { heading: "Discussion", part: "head", page: 5 },
          ],
        },
      } : paper)),
    }] }))
    const restored = quickReviewRecordView(readQuickReviewHistory(prefs).records[0])
    expect(restored!.deepReads.get(1)?.sections).toEqual([
      { heading: "Method", part: "tail", page: 2, attachmentID: 101 },
      { heading: "Conclusion", part: "head", page: 4 },
      { heading: "Discussion", part: "head", page: 5 },
    ])
  })

  it("keeps a deep read whose response could not be parsed so the paid request is not lost", () => {
    const { prefs } = store()
    appendQuickReviewRecord(prefs, structuredRecord())
    const [saved] = readQuickReviewHistory(prefs).records
    saveQuickReviewDeepRead(prefs, saved.id, 1, deepRead({ summary: "", method: "", evidence: "", reproducibility: "", limitation: "", basis: "", score: undefined, rawText: "模型返回的一段说明文字" }))
    expect(quickReviewRecordView(readQuickReviewHistory(prefs).records[0])!.deepReads.get(1)?.rawText).toBe("模型返回的一段说明文字")
  })
})
