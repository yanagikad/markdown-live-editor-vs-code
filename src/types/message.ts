export type ExtensionToWebviewMessage = 
  | { type: 'INIT_DOCUMENT'; text: string }
  | { type: 'UPDATE_DOCUMENT'; text: string };

export type WebviewToExtensionMessage = 
  | { type: 'DOCUMENT_CHANGED'; text: string }
  | { type: 'READY' };
