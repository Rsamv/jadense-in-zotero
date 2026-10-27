/** pdf.js 模块注入：Reader 代码运行在 bootstrap 沙箱，没有 ScriptLoader，模块必须由真实窗口加载。 */
import { uiText } from './ui-preferences'

export type PdfModule = typeof import('pdfjs-dist')
const pdfModules = new WeakMap<Document, Promise<PdfModule>>()

/** 预览脚本用 http 提供同一套资源，Zotero 内是插件自己的 chrome 包。 */
export function pdfModuleBase(doc: Document): string {
  return /^https?:$/.test(doc.location.protocol) ? new URL('/pdfjs/', doc.location.href).href : 'chrome://jadense-in-zotero/content/pdfjs/'
}

export function loadPdfModule(doc: Document, base: string = pdfModuleBase(doc)): Promise<PdfModule> {
  const cached = pdfModules.get(doc)
  if (cached) return cached
  const loading = new Promise<PdfModule>((resolve, reject) => {
    const script = doc.createElementNS('http://www.w3.org/1999/xhtml', 'script') as HTMLScriptElement
    script.type = 'module'; script.src = `${base}loader.mjs`
    script.onload = () => {
      script.remove()
      const module = (doc.defaultView as Window & { __jadenseChatPdfJS?: PdfModule }).__jadenseChatPdfJS
      if (module) resolve(module); else reject(new Error(uiText('PDF 解析组件未加载，请重试。', 'PDF parser did not load. Try again.')))
    }
    script.onerror = () => { script.remove(); reject(new Error(uiText('无法加载本机 PDF 解析组件。', 'Cannot load the local PDF parser.'))) }
    doc.documentElement.append(script)
  }).catch(error => { pdfModules.delete(doc); throw error })
  pdfModules.set(doc, loading)
  return loading
}

export type PdfDocument = Awaited<ReturnType<PdfModule['getDocument']>['promise']>

/** 只取指定页的文字；调用方负责 destroy。 */
export async function readPdfPagesText(pdf: PdfDocument, pages: readonly number[]): Promise<string> {
  const chunks: string[] = []
  for (const page of pages) {
    const content = await (await pdf.getPage(page)).getTextContent()
    chunks.push(content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim())
  }
  return chunks.join('\n')
}

/** 首尾若干页：开源与数据链接通常在第一页页脚或文末的 Code/Data availability。 */
export function edgePageNumbers(total: number, leading = 1, trailing = 3): number[] {
  if (!Number.isFinite(total) || total <= 0) return []
  const pages = new Set<number>()
  for (let page = 1; page <= Math.min(leading, total); page += 1) pages.add(page)
  for (let page = Math.max(1, total - trailing + 1); page <= total; page += 1) pages.add(page)
  return [...pages].sort((left, right) => left - right)
}
