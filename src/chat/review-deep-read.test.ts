/** 深读的边界：只送有界摘录、切不出来就一段都不送、账目（送了多少字/读了多少页/哪几节）始终写清楚。 */
import { describe, expect, it } from "vitest"

import {
  DEEP_READ_EXCERPT_CHARS_MAX,
  DEEP_READ_FIELD_LIMITS,
  DEEP_READ_SECTION_CHARS,
  buildDeepReadPrompt,
  deepReadSectionText,
  extractDeepReadExcerpt,
  formatDeepRead,
  normalizeDeepRead,
  parseDeepRead,
  type StoredDeepRead,
} from "./review-deep-read"

const LONG = "We sweep the learning rate over eight values and train every configuration for 200k steps on 32 A100 GPUs. "
const RELATED = "Prior work either retargets motion capture clips or trains in simulation without any expressive label. "

const PAGES = [
  {
    page: 1,
    text: [
      "Expressive Whole-Body Control for Humanoid Robots",
      "1 Introduction",
      "Humanoid robots must move expressively. We review prior art at length.",
      `${RELATED.repeat(4)}`,
      "Our contributions are three-fold: a policy, a data-",
      "set, and a real robot test.",
    ].join("\n"),
  },
  {
    page: 2,
    text: [
      "2 Method",
      `We train a transformer with eight layers. ${LONG.repeat(5)}`,
      "The loss combines action regression with a contrastive term.",
    ].join("\n"),
  },
  { page: 3, text: "3 Experiments\nWe compare with three baselines and report an ablation over five seeds.\nFigure 4. Accuracy curves." },
  { page: 4, text: "4 Conclusion\nThe policy transfers to a new robot. Limitations include the sim-to-real gap.\nReferences\n[1] Author, A. A cited title. 2024." },
]

const excerpt = () => extractDeepReadExcerpt(PAGES)!

describe("deep read excerpt", () => {
  it("takes the introduction tail, the method head and the conclusion head", () => {
    const picked = excerpt()
    expect(picked.sections.map(section => [section.heading, section.part, section.page])).toEqual([
      ["Introduction", "tail", 1],
      ["Method", "head", 2],
      ["Conclusion", "head", 4],
    ])
    // 版面断词要拼回来：模型读到 "data- set" 就等于读到残句，用户核对时也对不上原文。
    expect(picked.sections[0].text).toContain("a dataset, and a real robot test.")
    expect(picked.readPages).toBe(4)
    expect(picked.chars).toBe(picked.sections.reduce((total, section) => total + section.text.length, 0))
  })

  it("keeps every section within the per-section and total budgets", () => {
    const picked = excerpt()
    for (const section of picked.sections) {
      expect(section.text.length).toBeLessThanOrEqual(DEEP_READ_SECTION_CHARS)
      expect(section.text.length).toBeGreaterThan(0)
    }
    expect(picked.chars).toBeLessThanOrEqual(DEEP_READ_EXCERPT_CHARS_MAX)
    // 超长小节要显式截断，而不是悄悄送整节。
    const method = picked.sections[1]
    expect(method.text.length).toBeGreaterThan(DEEP_READ_SECTION_CHARS - 40)
    expect(method.text.endsWith("…")).toBe(true)
    expect(picked.sections[0].text.startsWith("…")).toBe(true)
  })

  it("never sends anything past the reference heading", () => {
    const sent = JSON.stringify(excerpt().sections)
    expect(sent).not.toContain("A cited title")
    expect(sent).not.toContain("References")
  })

  it("returns null instead of dumping pages when no section can be located", () => {
    const prose = [1, 2, 3].map(page => ({ page, text: "This paragraph carries no numbered heading at all, only running prose." }))
    expect(extractDeepReadExcerpt(prose)).toBeNull()
    expect(extractDeepReadExcerpt([])).toBeNull()
  })

  it("falls back to document order when the section names are unrecognised", () => {
    const pages = [
      { page: 1, text: "1 System Overview\nThe platform pairs a planner with a tracker." },
      { page: 2, text: "2 Pipeline Details\nEach stage is trained separately." },
      { page: 3, text: "3 Closing Remarks\nOpen problems remain." },
    ]
    const picked = extractDeepReadExcerpt(pages)!
    // 名字认不出来时按文档顺序补满三节：标题照实写，不谎称哪一节是方法。
    expect(picked.sections.map(section => section.heading)).toEqual(["System Overview", "Pipeline Details", "Closing Remarks"])
    expect(picked.sections.every(section => section.part === "head")).toBe(true)
  })

  it("leaves out a section whose whole body is a stub line", () => {
    const pages = [
      { page: 1, text: `1 Introduction\n${RELATED.repeat(4)}` },
      // 这一节整节只有一行残句：送出去模型也读不出东西，不如把槽位留给别的小节。
      { page: 2, text: "2 Method\n见附录。" },
      { page: 3, text: `3 Experiments\n${LONG.repeat(4)}` },
    ]
    const picked = extractDeepReadExcerpt(pages)!
    expect(picked.sections.map(section => section.heading)).toEqual(["Introduction", "Experiments"])
  })
})

describe("deep read prompt", () => {
  it("states exactly what was sent and refuses to invent the rest", () => {
    const prompt = buildDeepReadPrompt({ title: "Expressive Whole-Body Control", excerpt: excerpt() })
    expect(prompt).toContain("这次只有一篇")
    expect(prompt).toContain(`一共 ${excerpt().chars} 字`)
    expect(prompt).toContain("读了 4 页")
    expect(prompt).toContain("不得假装读过未送来的部分")
    expect(prompt).toContain("摘录未给出")
    expect(prompt).toContain("score 锚点（与批量综述同一把尺子）")
    expect(prompt).toContain("写作、排版、图表美观、期刊档次、引用量与作者名气一律不计分")
    expect(prompt).toContain("「AI 推断，需核对」")
    expect(prompt).toContain("只返回一个 JSON 对象")
    expect(prompt).toContain(JSON.stringify({ heading: "Method", part: "head", page: 2, text: excerpt().sections[1].text }))
    // 提示词里不能出现没被切进摘录的正文。
    expect(prompt).not.toContain("A cited title")
  })
})

describe("deep read parsing", () => {
  const payload = {
    summary: "这篇用真实机验证了全身控制策略。",
    method: "八层 transformer，动作回归加对比损失。",
    evidence: "三个基线与一次消融，五个随机种子。",
    reproducibility: "摘录未给出训练超参的完整清单。",
    limitation: "作者承认 sim-to-real 差距。",
    basis: "摘录：五种子消融；知识：同类工作多为仿真验证（AI 推断，需核对）",
    score: 78,
  }

  it("reads the structured fields and keeps the score in range", () => {
    const parsed = parseDeepRead(JSON.stringify(payload))
    expect(parsed).toMatchObject({ summary: payload.summary, method: payload.method, evidence: payload.evidence, reproducibility: payload.reproducibility, limitation: payload.limitation, basis: payload.basis, score: 78 })
    expect(parsed.warnings).toEqual([])
    expect(parseDeepRead(JSON.stringify({ ...payload, score: 250 })).score).toBe(100)
    expect(parseDeepRead(JSON.stringify({ ...payload, score: "82" })).score).toBe(82)
    expect(parseDeepRead(JSON.stringify({ ...payload, score: null })).score).toBeUndefined()
  })

  it("accepts a fenced response and clips over-long fields", () => {
    const fenced = parseDeepRead(`\`\`\`json\n${JSON.stringify({ ...payload, summary: "长".repeat(400) })}\n\`\`\``)
    expect(fenced.summary.length).toBeLessThanOrEqual(DEEP_READ_FIELD_LIMITS.summary)
    expect(fenced.summary.endsWith("…")).toBe(true)
  })

  it("keeps the prose and shows no score when the model gave none", () => {
    const parsed = parseDeepRead(JSON.stringify({ ...payload, score: undefined }))
    expect(parsed.score).toBeUndefined()
    expect(parsed.summary).toBe(payload.summary)
  })

  it("retains the raw text when nothing can be parsed", () => {
    const parsed = parseDeepRead("模型这次只回了一段散文，没有 JSON。")
    expect(parsed.rawText).toContain("散文")
    expect(parsed.summary).toBe("")
    expect(parsed.warnings[0]).toContain("未能解析为结构化深读")
  })

  it("flags a missing summary instead of showing an empty card", () => {
    const parsed = parseDeepRead(JSON.stringify({ method: "只有方法一段。" }))
    expect(parsed.warnings[0]).toContain("深读未返回概述段落")
  })
})

describe("deep read history", () => {
  const stored: StoredDeepRead = {
    createdAt: "2026-10-27T09:00:00.000Z",
    model: "test-model",
    sections: [{ heading: "Method", part: "head", page: 2, attachmentID: 101 }],
    chars: 380,
    readPages: 12,
    summary: "这篇做了什么",
    method: "方法细节",
    evidence: "证据强度",
    reproducibility: "可复现性",
    limitation: "局限",
    basis: "摘录：五种子消融",
    score: 78,
  }

  it("round-trips a stored deep read", () => {
    expect(normalizeDeepRead(JSON.parse(JSON.stringify(stored)))).toEqual(stored)
  })

  it("drops records that are empty, undated or malformed", () => {
    expect(normalizeDeepRead({ ...stored, createdAt: "" })).toBeNull()
    expect(normalizeDeepRead({ ...stored, summary: "", method: "", evidence: "", reproducibility: "", limitation: "", score: undefined })).toBeNull()
    expect(normalizeDeepRead("深读")).toBeNull()
    expect(normalizeDeepRead(null)).toBeNull()
    // 坏掉的小节账目要单独丢掉，不能连整条深读一起消失。
    expect(normalizeDeepRead({ ...stored, sections: [{ heading: "", page: 0 }, { heading: "Method", part: "sideways", page: 2 }] }))
      .toMatchObject({ sections: [{ heading: "Method", part: "head", page: 2 }] })
  })

  it("formats the account line together with the findings", () => {
    const text = formatDeepRead(stored, "Expressive Whole-Body Control")
    expect(text).toContain("深读 · Expressive Whole-Body Control")
    expect(text).toContain("送出摘录 380 字 · 本机读了 12 页")
    expect(text).toContain("Method（节首，第 2 页）")
    expect(text).toContain("内容评分：78/100")
    expect(text).toContain("摘录：五种子消融")
    expect(deepReadSectionText([{ heading: "Introduction", part: "tail", page: 1 }])).toBe("Introduction（节尾，第 1 页）")
  })
})
