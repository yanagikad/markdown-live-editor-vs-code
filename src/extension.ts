import * as vscode from "vscode";
import { RenderMarkdownUseCase } from "./application/usecases/renderMarkdownUseCase";
import { MarkdownItRenderer } from "./infrastructure/markdown/markdownItRenderer";
import { LivePreviewPanel } from "./infrastructure/webview/livePreviewPanel";

export function activate(context: vscode.ExtensionContext): void {
  const renderer = new MarkdownItRenderer();
  const renderMarkdownUseCase = new RenderMarkdownUseCase(renderer);

  const openPreviewCommand = vscode.commands.registerCommand("markdownLiveEditor.openPreview", async () => {
    const activeEditor = vscode.window.activeTextEditor;

    if (!activeEditor || activeEditor.document.languageId !== "markdown") {
      vscode.window.showInformationMessage("Open a Markdown file first.");
      return;
    }

    LivePreviewPanel.createOrReveal(context, activeEditor.document, renderMarkdownUseCase);
  });

  context.subscriptions.push(openPreviewCommand);
}

export function deactivate(): void {
  // no-op
}
