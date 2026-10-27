/** 独立窗口契约：收藏夹右键只携带选择快照，复用已开窗口，不触碰工作台；尺寸要容得下并排评价与历史删除键。 */
import { describe, expect, it, vi } from 'vitest'
import { closeQuickReviewWindow, openQuickReviewWindow, QUICK_REVIEW_WINDOW_MIN_WIDTH } from './quick-review-window'
import type { ZoteroManagerWindow } from './manager-window'

const features = (main: ZoteroManagerWindow, host: object = {}) => {
  const openDialog = vi.fn(() => ({ closed: false, focus: vi.fn(), close: vi.fn() }))
  const target = { ...main, openDialog } as unknown as ZoteroManagerWindow
  openQuickReviewWindow(host, target, [1], () => {})
  return String(openDialog.mock.calls[0][2])
}

describe('quick review native window', () => {
  it('opens its own chrome page, reuses it and reopens after closure', () => {
    const host = {}, openSettings = vi.fn(), receiveQuickReviewCollections = vi.fn()
    const opened = { closed: false, focus: vi.fn(), close: vi.fn(), receiveQuickReviewCollections }
    const openDialog = vi.fn(() => opened)
    const main = { openDialog, screen: { availWidth: 1920, availHeight: 1080 } } as unknown as ZoteroManagerWindow
    expect(openQuickReviewWindow(host, main, [7, 8], openSettings)).toBe(true)
    expect(openDialog).toHaveBeenCalledWith('chrome://jadense-in-zotero/content/quick-review.xhtml', 'jadense-in-zotero-quick-review', expect.stringContaining('dialog=no'), { zotero: host, collectionIDs: [7, 8], openSettings })
    expect(openSettings).not.toHaveBeenCalled()
    openQuickReviewWindow(host, main, [9], openSettings)
    expect(openDialog).toHaveBeenCalledTimes(1); expect(receiveQuickReviewCollections).toHaveBeenCalledWith([9])
    opened.closed = true
    openQuickReviewWindow(host, main, [10], openSettings)
    expect(openDialog).toHaveBeenCalledTimes(2)
    closeQuickReviewWindow(host); expect(opened.close).toHaveBeenCalledTimes(1)
  })

  it('stays closed without a main window instead of inventing a host', () => {
    expect(openQuickReviewWindow({}, null, [1], () => {})).toBe(false)
    expect(openQuickReviewWindow({}, { screen: {} } as unknown as ZoteroManagerWindow, [1], () => {})).toBe(false)
  })

  it('opens wide enough for the paired rating column and never past the screen', () => {
    expect(QUICK_REVIEW_WINDOW_MIN_WIDTH).toBeGreaterThan(1420)
    expect(features({ screen: { availWidth: 1920, availHeight: 1080 } } as unknown as ZoteroManagerWindow)).toContain('width=1654,height=860')
    expect(features({ screen: { availWidth: 2560, availHeight: 1440 } } as unknown as ZoteroManagerWindow)).toContain('width=2218,height=1170')
    // 屏幕本身比最小尺寸还窄时退回可用区，绝不请求超出屏幕的宽高。
    expect(features({ screen: { availWidth: 1366, availHeight: 768 } } as unknown as ZoteroManagerWindow)).toContain('width=1326,height=688')
    expect(features({} as unknown as ZoteroManagerWindow)).toContain('width=1240,height=820')
  })
})
