/** 自动保存偏好与文件名清洗：只保留可用字符，并记住上次目录。 */
import { expect, it } from 'vitest'
import type { ZoteroLike } from './runtime'
import {
  AUTO_SAVE_TRANSLATED_PDF_PREF,
  TRANSLATED_PDF_DIRECTORY_PREF,
  directoryOf,
  forgetTranslatedPDFDirectory,
  readAutoSaveTranslatedPDF,
  readTranslatedPDFDirectory,
  rememberTranslatedPDFDirectory,
  sanitizePDFBaseName,
  saveAutoSaveTranslatedPDF,
  translatedPDFFileName,
} from './pdf-translation-autosave'

function fakeHost(store = new Map<string, unknown>()) {
  return {
    host: { Prefs: {
      get: (key: string, global?: boolean) => store.get(global ? key : `extensions.zotero.${key}`),
      set: (key: string, value: unknown, global?: boolean) => { store.set(global ? key : `extensions.zotero.${key}`, value) },
    } } as unknown as ZoteroLike,
    store,
  }
}

it.each([
  ['Deep Learning: A Survey — Part 2', 'Deep Learning A Survey Part 2'],
  ['a-b–c—d−e', 'a b c d e'],
  ['A/B\\C?D*E"F<G>H|I', 'A B C D E F G H I'],
  ['  spaced  name  ', 'spaced name'],
  ['trailing dots...', 'trailing dots'],
  ['tab\tand\nnewline', 'tab and newline'],
  ['', ''],
  [null, ''],
  ['x'.repeat(300), 'x'.repeat(120)],
] as const)('sanitizes %j', (value, expected) => {
  expect(sanitizePDFBaseName(value)).toBe(expected)
})

it('builds a title-based filename with a type suffix, falling back to the original filename', () => {
  expect(translatedPDFFileName('Paper: A/B Study', 'orig.pdf')).toBe('Paper A B Study-对照.pdf')
  expect(translatedPDFFileName(undefined, 'My-Paper.pdf')).toBe('My Paper-对照.pdf')
  expect(translatedPDFFileName('', '')).toBe('translation-对照.pdf')
  expect(translatedPDFFileName('Title', 'x.pdf', 'mono')).toBe('Title-译文.pdf')
})

it('ignores Zotero placeholder attachment titles and falls back to the original filename', () => {
  expect(translatedPDFFileName('PDF', 'Real Paper.pdf')).toBe('Real Paper-对照.pdf')
  expect(translatedPDFFileName('pdf', 'Real Paper.pdf')).toBe('Real Paper-对照.pdf')
  expect(translatedPDFFileName('无标题', 'Real Paper.pdf')).toBe('Real Paper-对照.pdf')
  expect(translatedPDFFileName('PDF', '')).toBe('translation-对照.pdf')
})

it.each([
  ['C:\\Users\\me\\out.pdf', 'C:\\Users\\me'],
  ['/home/me/out.pdf', '/home/me'],
  ['C:\\out.pdf', 'C:\\'],
  ['out.pdf', ''],
  ['', ''],
] as const)('extracts the directory from %j', (filePath, expected) => {
  expect(directoryOf(filePath)).toBe(expected)
})

it('defaults auto-save on, remembers a folder, and can forget it', () => {
  const { host, store } = fakeHost()
  expect(readAutoSaveTranslatedPDF(host)).toBe(true)
  saveAutoSaveTranslatedPDF(host, false)
  expect(store.get(AUTO_SAVE_TRANSLATED_PDF_PREF)).toBe(false)
  expect(readAutoSaveTranslatedPDF(host)).toBe(false)
  saveAutoSaveTranslatedPDF(host, true)

  expect(readTranslatedPDFDirectory(host)).toBe('')
  rememberTranslatedPDFDirectory(host, '/out/bilingual.pdf')
  expect(readTranslatedPDFDirectory(host)).toBe('/out')
  expect(store.get(TRANSLATED_PDF_DIRECTORY_PREF)).toBe('/out')
  forgetTranslatedPDFDirectory(host)
  expect(readTranslatedPDFDirectory(host)).toBe('')
})
