/** 对照译文 PDF 的自动保存：记住上次保存目录，并按标题/原文件名生成安全文件名。 */
import type { ZoteroLike } from './runtime'
import { uiText } from './ui-preferences'

export const AUTO_SAVE_TRANSLATED_PDF_PREF = 'extensions.jadenseInZotero.autoSaveTranslatedPDF'
export const TRANSLATED_PDF_DIRECTORY_PREF = 'extensions.jadenseInZotero.translatedPDFDirectory'
export const REMOVE_ORPHAN_TRANSLATED_PDF_PREF = 'extensions.jadenseInZotero.removeOrphanTranslatedPDF'

/** 未设置时默认开启；显式设为 false 才保留已删除文献的内部成果。 */
export function readRemoveOrphanTranslatedPDF(host: ZoteroLike): boolean {
  return host.Prefs?.get(REMOVE_ORPHAN_TRANSLATED_PDF_PREF, true) !== false
}

/** 未设置时默认开启；显式设为 false 才关闭。 */
export function readAutoSaveTranslatedPDF(host: ZoteroLike): boolean {
  return host.Prefs?.get(AUTO_SAVE_TRANSLATED_PDF_PREF, true) !== false
}
export function saveAutoSaveTranslatedPDF(host: ZoteroLike, enabled: boolean) {
  host.Prefs?.set(AUTO_SAVE_TRANSLATED_PDF_PREF, enabled, true)
}
export function readTranslatedPDFDirectory(host: ZoteroLike): string {
  const value = host.Prefs?.get(TRANSLATED_PDF_DIRECTORY_PREF, true)
  return typeof value === 'string' ? value.trim() : ''
}
export function forgetTranslatedPDFDirectory(host: ZoteroLike) {
  host.Prefs?.set(TRANSLATED_PDF_DIRECTORY_PREF, '', true)
}

/** 只记住目录本身，不保存文件名；兼容 Windows 与 POSIX 分隔符。 */
export function directoryOf(filePath: string): string {
  const normalized = String(filePath ?? '').replace(/[\\/]+$/u, '')
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  if (index <= 0) return ''
  const directory = normalized.slice(0, index)
  // 盘符根目录（C:\）需要保留分隔符，否则拼接会得到 C:name.pdf。
  return /^[A-Za-z]:$/u.test(directory) ? `${directory}\\` : directory
}
export function rememberTranslatedPDFDirectory(host: ZoteroLike, filePath: string) {
  const directory = directoryOf(filePath)
  if (directory) host.Prefs?.set(TRANSLATED_PDF_DIRECTORY_PREF, directory, true)
}

// Windows 保留字符与路径分隔符，以及用户明确要求去掉的冒号和各类破折号。
const UNSAFE = /[<>:"/\\|?*]/gu
const DASHES = /[\u2010-\u2015\u2212-]/gu
/** 控制字符按码点剔除，避免依赖 no-control-regex 允许范围外的正则。 */
function dropControlCharacters(value: string) {
  let result = ''
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    result += code < 0x20 || code === 0x7f ? ' ' : character
  }
  return result
}

/** 生成可安全用于文件名的标题片段；无法得到可用字符时返回空串，由调用方回退。 */
export function sanitizePDFBaseName(value: unknown): string {
  return dropControlCharacters(String(value ?? '').normalize('NFKC').replace(DASHES, ' ').replace(UNSAFE, ' '))
    .replace(/[\s\u3000]+/gu, ' ')
    .replace(/^[.\s]+/u, '')
    .slice(0, 120)
    .replace(/[.\s]+$/u, '')
    .trim()
}

export function stripPDFExtension(fileName: string): string {
  return String(fileName ?? '').replace(/\.pdf$/iu, '')
}

/** Zotero 把 PDF 附件的 title 字段存成类型占位名（通常就是 "PDF"），不能当作文章标题。 */
const PLACEHOLDER_TITLES = new Set(['pdf', 'pdf full text', 'full text pdf', 'pdf 全文', 'attachment', '附件', 'untitled', '无标题'])
/** 归一化后为空或是 Zotero/宿主注入的占位名时返回空串，交由调用方回退到原文件名。 */
export function usablePDFTitle(title: unknown): string {
  const base = sanitizePDFBaseName(title)
  return PLACEHOLDER_TITLES.has(base.toLocaleLowerCase()) ? '' : base
}

/** 优先文章标题，其次原文件名；两者都不可用时回退。文件名附类型后缀以区分原文件与译文。 */
export function translatedPDFFileName(title: string | undefined, originalFileName: string | undefined, kind: 'mono' | 'dual' = 'dual'): string {
  const base = usablePDFTitle(title) || sanitizePDFBaseName(stripPDFExtension(originalFileName ?? '')) || 'translation'
  const suffix = kind === 'dual' ? uiText('对照', 'bilingual') : uiText('译文', 'translated')
  return `${base}-${suffix}.pdf`
}
