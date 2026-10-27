/** 收藏夹右键入口的独立原生窗口：一次派发综述整个子分类，不创建工作台，也不写入条目。 */
import type { ZoteroLike } from './runtime'
import type { ZoteroManagerWindow } from './manager-window'
import { chromeContentUrl } from './chrome-registration'

export type QuickReviewContext = { zotero: ZoteroLike; collectionIDs: number[]; openSettings: () => void }
export type QuickReviewWindow = Window & {
  arguments?: [QuickReviewContext]
  JadenseQuickReview?: QuickReviewContext
  receiveQuickReviewCollections?: (ids: number[]) => void
}
const windows = new WeakMap<ZoteroLike, QuickReviewWindow>()
/** 综述要并排显示逐篇要点与评价，窄于 1440 时历史行的删除键会被挤到下一行。 */
export const QUICK_REVIEW_WINDOW_MIN_WIDTH = 1440
export const QUICK_REVIEW_WINDOW_MIN_HEIGHT = 820

/** 目标取可用面积的 88%，但保证最小宽高；屏幕不够大时退到可用范围，绝不超出屏幕。 */
const reviewWindowSize = (availableWidth: number, availableHeight: number) => ({
  width: Math.min(availableWidth, Math.max(QUICK_REVIEW_WINDOW_MIN_WIDTH, Math.round(availableWidth * 0.88))),
  height: Math.min(availableHeight, Math.max(QUICK_REVIEW_WINDOW_MIN_HEIGHT, Math.round(availableHeight * 0.86))),
})

export function openQuickReviewWindow(host: ZoteroLike, main: ZoteroManagerWindow | null, collectionIDs: number[], openSettings: () => void) {
  if (!main?.openDialog) return false
  const context = { zotero: host, collectionIDs: [...collectionIDs], openSettings }
  const existing = windows.get(host)
  if (existing && !existing.closed) {
    existing.JadenseQuickReview = context
    existing.receiveQuickReviewCollections?.(context.collectionIDs)
    existing.focus(); return true
  }
  const { width, height } = reviewWindowSize((main.screen?.availWidth || 1280) - 40, (main.screen?.availHeight || 900) - 80)
  const opened = main.openDialog(chromeContentUrl('quick-review.xhtml'), 'jadense-in-zotero-quick-review', `chrome,dialog=no,titlebar,centerscreen,resizable,width=${width},height=${height}`, context) as QuickReviewWindow | null
  if (!opened) return false
  opened.JadenseQuickReview = context
  windows.set(host, opened); opened.focus?.(); return true
}

export function closeQuickReviewWindow(host: ZoteroLike) {
  windows.get(host)?.close(); windows.delete(host)
}
