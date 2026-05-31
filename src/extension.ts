import * as vscode from "vscode";

import { MarkdownItRenderer } from "./adapters/secondary/MarkdownItRenderer";
import { LivePreviewController } from "./application/LivePreviewController";

export function activate(context: vscode.ExtensionContext): void {
  // 起動時に依存を一度だけ組み立て、拡張全体の初期化コストを抑える。
  const renderer = new MarkdownItRenderer();
  const livePreviewController = new LivePreviewController(renderer, context.extensionUri);

  // エントリポイントをコマンドに限定し、不要なアクティベーションを避ける。
  const openPreviewCommand = vscode.commands.registerCommand(
    "markdownLiveEditor.openPreview",
    () => {
      livePreviewController.openPreviewForEditor(vscode.window.activeTextEditor);
    }
  );

  // VS Codeのライフサイクルに合わせて確実に破棄されるよう登録する。
  context.subscriptions.push(openPreviewCommand, livePreviewController);
}

export function deactivate(): void {
  // No-op: VS Code disposes subscriptions registered in activate.
}
