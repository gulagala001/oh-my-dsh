import type { BrowserWindow, ContextMenuParams, MenuItemConstructorOptions, WebContents } from 'electron'

interface MenuOptions {
  canAttachImage: boolean
  canReload: boolean
  isAnnotationModeEnabled?: boolean
  isDefaultBrowser: boolean
  canOpenWindow?: boolean
  snapshot: { tabType: string; commentModeDisabledReason?: string | null }
  params: ContextMenuParams
  webContents: WebContents
  window: BrowserWindow
  intl: { formatMessage(message: { messageId: string; defaultMessage: string }): string }
  onBack(): void
  onForward(): void
  onReload(): void
  onInspect(point: { x: number; y: number }): void
  onAttachImage(url: string): void
  onComment(point: { x: number; y: number }, flow: string, selectedText: boolean): void
  onOpenInBrowser(url: string, presentation?: string): void
  onOpenExternal(url: string): void
}
export function browserContextMenu(options: MenuOptions): MenuItemConstructorOptions[]
