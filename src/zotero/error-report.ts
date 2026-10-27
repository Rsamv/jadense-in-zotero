/** 错误类型投影：把技术性失败归类成用户可理解的类型，并附可核对但不含敏感内容的技术标识。 */
import { TranslationRateLimitError } from '@/chat/translation-queue'
import { uiText } from './ui-preferences'

export type ErrorKind = 'network' | 'timeout' | 'cancelled' | 'auth' | 'points' | 'rate-limit' | 'server' | 'stream' | 'output' | 'config' | 'ocr' | 'storage' | 'unknown'

const OUTPUT_CODES = ['OUTPUT_EMPTY', 'OUTPUT_TRUNCATED', 'OUTPUT_PARTIAL', 'OUTPUT_FAILED', 'OUTPUT_RESOURCES_CHANGED', 'EMPTY_TRANSLATION', 'EMPTY_OUTPUT', 'REASONING_ONLY', 'PLACEHOLDER_MISMATCH', 'MISSING_ID', 'INVALID_OUTPUT', 'INVALID_JSON', 'LAYOUT_MAPPING']
const STREAM_CODES = ['STREAM_EARLY_EOF', 'STREAM_INCOMPLETE', 'STREAM_FAILED', 'STREAM_PARSE_FAILED', 'RECOVERY_PENDING']
const AUTH_CODES = ['AUTH', 'INVALID_TOKEN', 'UNAUTHORIZED', 'FORBIDDEN', 'INSUFFICIENT_SCOPE', 'AI_NOT_CONFIGURED']
const CONFIG_CODES = ['CONFIG_CHANGED', 'MODEL_CHANGED']

/** 只读取类型/状态/名称，不读取正文，避免把 Provider 或凭据内容带入用户提示。 */
export function classifyError(error: unknown): ErrorKind {
  const value = error as { code?: unknown; status?: unknown; name?: unknown; message?: unknown } | null | undefined
  const code = typeof value?.code === 'string' ? value.code.toUpperCase() : ''
  const status = typeof value?.status === 'number' ? value.status : undefined
  const name = typeof value?.name === 'string' ? value.name : ''
  const message = typeof value?.message === 'string' ? value.message : error instanceof Error ? error.message : ''
  if (name === 'AbortError' || /abort|cancel/i.test(message)) return 'cancelled'
  if (code === 'NETWORK_ERROR') return 'network'
  if (code.startsWith('OCR_')) return 'ocr'
  if (code === 'STORAGE_UNAVAILABLE') return 'storage'
  if (code === 'POINTS_INSUFFICIENT' || status === 402) return 'points'
  if (status === 401 || status === 403 || AUTH_CODES.includes(code)) return 'auth'
  if (error instanceof TranslationRateLimitError || status === 429 || ['RATE_LIMITED', 'RATE_LIMIT'].includes(code)) return 'rate-limit'
  if (status !== undefined && status >= 500) return 'server'
  if (code === 'PROVIDER_FAILED' || code === 'BYOK_STREAM_ERROR') return 'server'
  if (STREAM_CODES.includes(code)) return 'stream'
  if (OUTPUT_CODES.includes(code)) return 'output'
  if (CONFIG_CODES.includes(code) || status === 400 || status === 422) return 'config'
  // Gecko 的网络失败以 TypeError 抛出，且异常来自窗口 compartment，不能依赖 instanceof。
  if (name === 'TypeError' || /network|fetch|dns|tls|连接|网络/i.test(message)) return 'network'
  if (name === 'TimeoutError' || /timeout|timed out|超时/i.test(message)) return 'timeout'
  return 'unknown'
}

export function errorKindLabel(kind: ErrorKind): string {
  switch (kind) {
    case 'network': return uiText('网络错误', 'Network error')
    case 'timeout': return uiText('请求超时', 'Request timeout')
    case 'cancelled': return uiText('已取消', 'Cancelled')
    case 'auth': return uiText('连接或权限问题', 'Connection or permission')
    case 'points': return uiText('积分不足', 'Insufficient points')
    case 'rate-limit': return uiText('请求限流', 'Rate limited')
    case 'server': return uiText('上游服务错误', 'Upstream service error')
    case 'stream': return uiText('连接中断', 'Connection interrupted')
    case 'output': return uiText('输出不完整', 'Incomplete output')
    case 'config': return uiText('配置已变更', 'Configuration changed')
    case 'ocr': return uiText('OCR 未就绪', 'OCR not ready')
    case 'storage': return uiText('本地存储问题', 'Local storage issue')
    default: return uiText('未知错误', 'Unknown error')
  }
}

/** 技术标识只包含错误码、HTTP 状态与具体错误类名，便于用户核对与反馈。 */
export function errorDetail(error: unknown): string {
  const value = error as { code?: unknown; status?: unknown; name?: unknown } | null | undefined
  const code = typeof value?.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/u.test(value.code) ? value.code : ''
  const status = typeof value?.status === 'number' ? String(value.status) : ''
  const name = typeof value?.name === 'string' && value.name !== 'Error' && /^[A-Za-z][A-Za-z0-9]*Error$/u.test(value.name) ? value.name : ''
  return [...new Set([code, status, name].filter(Boolean))].join(' · ')
}

/** 形如「【网络错误 · TypeError】」；无法判定类型且无技术标识时返回空串，不给清晰消息添加噪声。 */
export function errorTypePrefix(error: unknown): string {
  const kind = classifyError(error)
  const detail = errorDetail(error)
  if (kind === 'unknown' && !detail) return ''
  const label = errorKindLabel(kind)
  return detail ? uiText(`【${label} · ${detail}】`, `[${label} · ${detail}]`) : uiText(`【${label}】`, `[${label}]`)
}

/** 在用户消息前统一告知错误类型，而不只是原始错误文本。 */
export function withErrorType(error: unknown, message: string): string {
  return `${errorTypePrefix(error)}${message}`
}
