import { WhoobeDocumentLayout } from '@pimcore-custom/core'

export type WhoobeHostMessageType =
  | 'SYNC_DOCUMENT'
  | 'UPDATE_DOCUMENT'
  | 'REQUEST_ASSET_PICKER'
  | 'ASSET_SELECTED'
  | 'REQUEST_DATA_OBJECT_PICKER'
  | 'DATA_OBJECT_SELECTED'

export interface WhoobeHostMessage {
  type: WhoobeHostMessageType
  payload?: any
  requestId?: string
}

export interface WhoobeHostBridgeCallbacks {
  onDocumentUpdated?: (layout: WhoobeDocumentLayout) => void
  onRequestAssetPicker?: (currentKey?: string) => Promise<{ url: string; s3Key: string }>
  onRequestDataObjectPicker?: (currentId?: string) => Promise<{ objectId: string; name: string }>
}

export class WhoobeHostBridge {
  private iframeWindow: Window | null = null
  private callbacks: WhoobeHostBridgeCallbacks = {}
  private boundHandler: ((event: MessageEvent) => void) | null = null
  private readonly studioOrigin: string

  /**
   * `studioUrl` is the embedded Whoobe Studio iframe's src - its origin is
   * both the only origin incoming messages are accepted from and the only
   * target outgoing messages are sent to (never "*"), so a compromised or
   * unexpectedly-navigated iframe can't leak document content to, or
   * accept fake document data from, some other origin.
   */
  constructor(iframeElement: HTMLIFrameElement | null, studioUrl: string, callbacks: WhoobeHostBridgeCallbacks = {}) {
    this.studioOrigin = new URL(studioUrl).origin
    if (iframeElement) {
      this.iframeWindow = iframeElement.contentWindow
    }
    this.callbacks = callbacks
    this.attachMessageListener()
  }

  public setIframe(iframeElement: HTMLIFrameElement | null) {
    this.iframeWindow = iframeElement ? iframeElement.contentWindow : null
  }

  public setCallbacks(callbacks: WhoobeHostBridgeCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks }
  }

  private attachMessageListener() {
    if (typeof window === 'undefined') return
    this.detachMessageListener()

    this.boundHandler = this.handleIncomingMessage.bind(this)
    window.addEventListener('message', this.boundHandler)
  }

  public detachMessageListener() {
    if (typeof window !== 'undefined' && this.boundHandler) {
      window.removeEventListener('message', this.boundHandler)
      this.boundHandler = null
    }
  }

  private async handleIncomingMessage(event: MessageEvent) {
    if (event.origin !== this.studioOrigin) return
    if (!event.data || typeof event.data !== 'object') return
    const msg = event.data as WhoobeHostMessage

    switch (msg.type) {
      case 'UPDATE_DOCUMENT':
        if (msg.payload && this.callbacks.onDocumentUpdated) {
          this.callbacks.onDocumentUpdated(msg.payload as WhoobeDocumentLayout)
        }
        break

      case 'REQUEST_ASSET_PICKER':
        if (this.callbacks.onRequestAssetPicker) {
          try {
            const asset = await this.callbacks.onRequestAssetPicker(msg.payload?.currentKey)
            this.sendMessage('ASSET_SELECTED', { asset }, msg.requestId)
          } catch (e) {
            console.warn('Asset picker canceled or failed:', e)
          }
        }
        break

      case 'REQUEST_DATA_OBJECT_PICKER':
        if (this.callbacks.onRequestDataObjectPicker) {
          try {
            const object = await this.callbacks.onRequestDataObjectPicker(msg.payload?.currentId)
            this.sendMessage('DATA_OBJECT_SELECTED', { object }, msg.requestId)
          } catch (e) {
            console.warn('Data object picker canceled or failed:', e)
          }
        }
        break
    }
  }

  public sendMessage(type: WhoobeHostMessageType, payload?: any, requestId?: string) {
    if (!this.iframeWindow) return
    // Callers here typically pass a Vue reactive ref's .value (or a
    // property of one) - the resulting Proxy isn't structured-clone-able
    // as-is (DataCloneError). Payloads are always plain JSON-safe CMS
    // data, so a JSON round-trip both strips reactivity and deep-clones it.
    const safePayload = payload !== undefined ? JSON.parse(JSON.stringify(payload)) : payload
    const msg: WhoobeHostMessage = { type, payload: safePayload, requestId }
    this.iframeWindow.postMessage(msg, this.studioOrigin)
  }

  public syncDocumentToStudio(documentLayout: WhoobeDocumentLayout) {
    this.sendMessage('SYNC_DOCUMENT', documentLayout)
  }
}
