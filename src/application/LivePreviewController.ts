import * as vscode from "vscode";

import type { MarkdownRendererPort } from "../domain/ports/MarkdownRendererPort";
import { LivePreviewSession } from "./LivePreviewSession";

// ドキュメント単位でセッションを管理し、プレビュー状態を安定して再利用する。
export class LivePreviewController implements vscode.Disposable {
  private readonly sessions = new Map<string, LivePreviewSession>();

  public constructor(
    private readonly renderer: MarkdownRendererPort,
    private readonly extensionUri: vscode.Uri
  ) {}

  public openPreviewForEditor(editor: vscode.TextEditor | undefined): void {
    if (!editor) {
      // 操作ミス時の離脱を減らすため、次に取るべき行動を明示する。
      void vscode.window.showInformationMessage("Open a markdown file to start live preview.");
      return;
    }

    const document = editor.document;
    if (document.languageId !== "markdown") {
      void vscode.window.showInformationMessage("Live preview currently supports markdown documents only.");
      return;
    }

    const key = document.uri.toString();
    const existingSession = this.sessions.get(key);
    if (existingSession) {
      // 同一ファイルで重複パネルを増やさず、作業コンテキストを保つ。
      existingSession.reveal();
      return;
    }

    const session = new LivePreviewSession(editor, this.renderer, this.extensionUri, () => {
      this.sessions.delete(key);
    });

    this.sessions.set(key, session);
    session.start();
  }

  public dispose(): void {
    // 拡張終了時のリークを防ぐため、全セッションを一括で閉じる。
    for (const session of this.sessions.values()) {
      session.dispose();
    }

    this.sessions.clear();
  }
}
