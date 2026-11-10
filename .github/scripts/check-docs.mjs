/** README 发布摘要检查；不限制工作分支名，不参与插件运行。 */
import assert from 'node:assert/strict'
import process from 'node:process'
import { readFileSync } from 'node:fs'

/** README 摘要只列正式版本；语言之间一致，完整历史由 CHANGELOG 保存。 */
export function summaryVersions(markdown) {
  const block = markdown.match(/<!-- release-summary:start -->([\s\S]*?)<!-- release-summary:end -->/)
  assert.ok(block, 'README must contain a release-summary block')
  const versions = [...block[1].matchAll(/^- \[(v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))\]\(https:\/\/github\.com\/jadense-ai\/jadense-in-zotero\/releases\/tag\/([^\s)]+)\)/gm)]
  assert.ok(versions.length > 0 && versions.length <= 5, 'README must show 1–5 releases')
  assert.equal(block[1].split('\n').filter(line => line.startsWith('- ')).length, versions.length, 'Every summary must link its exact release')
  versions.forEach(([ , version, tag]) => assert.equal(version, tag))
  const tags = versions.map(match => match[1])
  const ordered = [...new Set(tags)].sort((a, b) => {
    const left = a.slice(1).split('.').map(Number), right = b.slice(1).split('.').map(Number)
    return right[0] - left[0] || right[1] - left[1] || right[2] - left[2]
  })
  assert.deepEqual(tags, ordered, 'Releases must be unique and newest first')
  return tags
}

assert.deepEqual(summaryVersions(readFileSync('README.md', 'utf8')), summaryVersions(readFileSync('README.en.md', 'utf8')))
process.stdout.write('README summaries verified\n')
