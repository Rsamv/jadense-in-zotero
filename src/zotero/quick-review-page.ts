/** 独立 chrome 页面只加载收藏夹快速解析，不引入工作台、账号或对话功能。 */
import { diagnostics } from './diagnostics'
import { mountQuickReview } from './quick-review-ui'
import type { QuickReviewWindow } from './quick-review-window'
import { initializeUiLocale, observeTheme, uiText } from './ui-preferences'

const page = window as QuickReviewWindow
function initialize() {
  const context = page.JadenseQuickReview ?? page.arguments?.[0]
  if (context) {
    initializeUiLocale(context.zotero)
    // 附件扫描失败要留下本地证据；共用宿主上的同一个实例，避免与工作台各自覆盖同一份记录。
    try { diagnostics(context.zotero) } catch { /* 诊断不可用不影响窗口。 */ }
    document.title = uiText('快速解析', 'Quick review')
    const stopTheme = observeTheme(context.zotero, document.documentElement)
    const review = mountQuickReview(document, context.zotero, context.openSettings)
    page.receiveQuickReviewCollections = ids => { void review.open(ids) }
    void review.open(context.collectionIDs)
    window.addEventListener('unload', () => { review.dispose(); stopTheme(); page.receiveQuickReviewCollections = undefined }, { once: true })
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true })
else initialize()
