export type ExtensionToWebviewMessage = 
  | { type: 'INIT_DOCUMENT'; text: string }
  | { type: 'UPDATE_DOCUMENT'; text: string };

export type WebviewToExtensionMessage = 
  | { type: 'DOCUMENT_CHANGED'; text: string }
  | { type: 'READY' }
  // ★ これを追加
  | { type: 'LOG'; level: 'info' | 'error'; message: string; details?: any };