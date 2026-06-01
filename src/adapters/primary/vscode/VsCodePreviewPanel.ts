import * as vscode from "vscode";

import {
  isMarkdownEditedMessage,
  isPreviewScrolledMessage,
  isRuntimeDiagnosticsMessage,
  type PreviewIncomingMessage
} from "./PreviewMessages";
import { buildPreviewWebviewHtml } from "./PreviewWebviewHtml";

const VIEW_TYPE = "markdownLiveEditor.preview";

// 一次アダプターは I/O のみ担当し、HTML構築ロジックは純粋関数へ委譲する。
export class VsCodePreviewPanel implements vscode.Disposable {
  private readonly panel: vscode.WebviewPanel;
  private readonly nodeModulesUri: vscode.Uri;
  private readonly targetColumn: vscode.ViewColumn;

  public constructor(extensionUri: vscode.Uri, targetColumn: vscode.ViewColumn) {
    this.targetColumn = targetColumn;
    this.nodeModulesUri = vscode.Uri.joinPath(extensionUri, "node_modules");

    this.panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      "Editable Preview",
      {
        viewColumn: this.targetColumn,
        preserveFocus: false
      },
      {
        enableScripts: true,
        localResourceRoots: [this.nodeModulesUri, extensionUri]
      }
    );
  }

  public show(renderedHtml: string, sourceTitle: string, sourceMarkdown: string): void {
    this.panel.title = `Editable Preview - ${sourceTitle}`;

    const nonce = this.createNonce();
    const csp = this.createCsp(nonce);
    const mermaidScriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.nodeModulesUri, "mermaid", "dist", "mermaid.min.js")
    ).toString();
    const katexCssUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.nodeModulesUri, "katex", "dist", "katex.min.css")
    ).toString();

    this.panel.webview.html = buildPreviewWebviewHtml({
      nonce,
      csp,
      mermaidScriptUri,
      katexCssUri,
      encodedMarkdown: encodeURIComponent(sourceMarkdown),
      encodedRendered: encodeURIComponent(renderedHtml)
    });
  }

  public syncScrollByRatio(ratio: number): void {
    void this.panel.webview.postMessage({
      type: "scrollToRatio",
      ratio
    });
  }

  public reveal(): void {
    this.panel.reveal(this.targetColumn, false);
  }

  public onDidDispose(listener: () => void): vscode.Disposable {
    return this.panel.onDidDispose(listener);
  }

  public onDidReceiveMessage(listener: (message: PreviewIncomingMessage) => void): vscode.Disposable {
    return this.panel.webview.onDidReceiveMessage((message: unknown) => {
      const parsed = this.parseIncomingMessage(message);
      if (!parsed) {
        return;
      }

      listener(parsed);
    });
  }

  public dispose(): void {
    this.panel.dispose();
  }

  private parseIncomingMessage(message: unknown): PreviewIncomingMessage | null {
    if (typeof message !== "object" || message === null) {
      return null;
    }

    const candidate = message as PreviewIncomingMessage;
    if (isPreviewScrolledMessage(candidate)) {
      return candidate;
    }

    if (isMarkdownEditedMessage(candidate)) {
      return candidate;
    }

    if (isRuntimeDiagnosticsMessage(candidate)) {
      return candidate;
    }

    return null;
  }

  private createCsp(nonce: string): string {
    return [
      "default-src 'none'",
      `img-src ${this.panel.webview.cspSource} https: data:`,
      `style-src ${this.panel.webview.cspSource} 'unsafe-inline' data:`,
      `font-src ${this.panel.webview.cspSource}`,
      `script-src 'nonce-${nonce}' ${this.panel.webview.cspSource}`
    ].join("; ");
  }

  private createNonce(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let value = "";

    for (let i = 0; i < 32; i += 1) {
      value += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return value;
  }
}

export type { PreviewIncomingMessage } from "./PreviewMessages";
