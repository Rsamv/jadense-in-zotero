/** 错误类型投影：类型、技术标识、敏感内容隔离与本地化。 */
import { expect, it } from 'vitest'
import { classifyError, errorDetail, errorTypePrefix, withErrorType } from './error-report'
import { TranslationRateLimitError } from '@/chat/translation-queue'
import { initializeUiLocale } from './ui-preferences'

it.each([
  [new TypeError('NetworkError'), 'network'],
  [Object.assign(new Error('rejected'), { status: 401 }), 'auth'],
  [Object.assign(new Error('rejected'), { status: 402 }), 'points'],
  [Object.assign(new Error('rejected'), { status: 429 }), 'rate-limit'],
  [Object.assign(new Error('rejected'), { status: 503 }), 'server'],
  [Object.assign(new Error('bad request'), { status: 400 }), 'config'],
  [{ code: 'POINTS_INSUFFICIENT' }, 'points'],
  [{ code: 'STREAM_EARLY_EOF' }, 'stream'],
  [{ code: 'OUTPUT_EMPTY' }, 'output'],
  [{ code: 'CONFIG_CHANGED' }, 'config'],
  [{ code: 'OCR_NOT_READY' }, 'ocr'],
  [{ code: 'STORAGE_UNAVAILABLE' }, 'storage'],
  [{ code: 'PROVIDER_FAILED' }, 'server'],
  [{ code: 'NETWORK_ERROR' }, 'network'],
  [{ code: 'BYOK_STREAM_ERROR' }, 'server'],
  [{ code: 'STREAM_PARSE_FAILED' }, 'stream'],
  [{ code: 'EMPTY_OUTPUT' }, 'output'],
  [{ code: 'REASONING_ONLY' }, 'output'],
] as const)('classifies %j as %s', (error, kind) => {
  expect(classifyError(error)).toBe(kind)
})

it('classifies cancellation and rate-limit classes by name', () => {
  const aborted = new Error('cancelled'); aborted.name = 'AbortError'
  expect(classifyError(aborted)).toBe('cancelled')
  expect(classifyError(new TranslationRateLimitError(Date.now() + 1000))).toBe('rate-limit')
})

it('prefixes a human-readable type with a non-sensitive technical detail', () => {
  expect(withErrorType(Object.assign(new Error('连接失败'), { status: 503 }), '任务未能完成。')).toBe('【上游服务错误 · 503】任务未能完成。')
  expect(withErrorType(new TypeError('NetworkError'), '任务未能完成。')).toBe('【网络错误 · TypeError】任务未能完成。')
  expect(errorTypePrefix({ code: 'POINTS_INSUFFICIENT' })).toBe('【积分不足 · POINTS_INSUFFICIENT】')
})

it('adds no noise for an unclassifiable message without a technical identifier', () => {
  const message = 'bad data:image/jpeg;base64,AAAA response'
  expect(withErrorType(new Error(message), message)).toBe(message)
  expect(errorTypePrefix(new Error('something odd'))).toBe('')
})

it('never copies message text or credentials into the reported type', () => {
  const error = Object.assign(new Error('Bearer secret-token'), { code: 'OUTPUT_EMPTY' })
  expect(errorTypePrefix(error)).toContain('输出不完整')
  expect(errorTypePrefix(error)).not.toMatch(/Bearer|secret-token/u)
  expect(errorDetail(error)).toBe('OUTPUT_EMPTY')
})

it('localizes the reported type', () => {
  initializeUiLocale({ locale: 'en-US' })
  expect(errorTypePrefix({ code: 'OUTPUT_EMPTY' })).toBe('[Incomplete output · OUTPUT_EMPTY]')
  initializeUiLocale({ locale: 'zh-CN' })
  expect(errorTypePrefix({ code: 'OUTPUT_EMPTY' })).toBe('【输出不完整 · OUTPUT_EMPTY】')
})
