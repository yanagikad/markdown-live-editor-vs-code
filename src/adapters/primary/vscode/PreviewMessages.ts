export interface PreviewIncomingMessage {
  type: string;
  ratio?: number;
  markdown?: string;
  level?: string;
  message?: string;
  details?: string;
}

export interface PreviewScrolledMessage extends PreviewIncomingMessage {
  type: "previewScrolled";
  ratio: number;
}

export interface MarkdownEditedMessage extends PreviewIncomingMessage {
  type: "markdownEdited";
  markdown: string;
}

export interface RuntimeDiagnosticsMessage extends PreviewIncomingMessage {
  type: "runtimeDiagnostics";
  level: "info" | "error";
  message: string;
}

export function isPreviewScrolledMessage(message: PreviewIncomingMessage): message is PreviewScrolledMessage {
  return message.type === "previewScrolled" && typeof message.ratio === "number";
}

export function isMarkdownEditedMessage(message: PreviewIncomingMessage): message is MarkdownEditedMessage {
  return message.type === "markdownEdited" && typeof message.markdown === "string";
}

export function isRuntimeDiagnosticsMessage(message: PreviewIncomingMessage): message is RuntimeDiagnosticsMessage {
  const hasValidLevel = message.level === "info" || message.level === "error";
  return message.type === "runtimeDiagnostics" && hasValidLevel && typeof message.message === "string";
}
