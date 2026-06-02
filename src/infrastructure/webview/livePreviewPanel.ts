import * as vscode from "vscode";
import { RenderMarkdownUseCase } from "../../application/usecases/renderMarkdownUseCase";
import { createWebviewHtml } from "./webviewHtml";
import { detectThemeType } from "../vscode/themeType";

type IncomingMessage =
  | { type: "ready" }
  | { type: "updateMarkdown"; markdown: string; source: "preview-editor" };

type RenderSource = "preview-editor" | "vscode";

export class LivePreviewPanel {
  private static currentPanel: LivePreviewPanel | undefined;

  static createOrReveal(
    context: vscode.ExtensionContext,
    document: vscode.TextDocument,
    renderMarkdownUseCase: RenderMarkdownUseCase
  ): LivePreviewPanel {
    if (LivePreviewPanel.currentPanel) {
      LivePreviewPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside, false);
      LivePreviewPanel.currentPanel.bindDocument(document);
      return LivePreviewPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      "markdownLiveEditor.preview",
      `Live Preview: ${document.fileName.split("/").pop() ?? "Untitled"}`,
      {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false
      },
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    LivePreviewPanel.currentPanel = new LivePreviewPanel(context, panel, document, renderMarkdownUseCase);
    return LivePreviewPanel.currentPanel;
  }

  private readonly disposables: vscode.Disposable[] = [];
  private document: vscode.TextDocument;
  private isApplyingWebviewEdit = false;
  private messageQueue: Promise<void> = Promise.resolve();

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly panel: vscode.WebviewPanel,
    document: vscode.TextDocument,
    private readonly renderMarkdownUseCase: RenderMarkdownUseCase
  ) {
    this.document = document;
    const initialMarkdown = this.document.getText();
    const initialHtml = this.renderMarkdownUseCase.execute(initialMarkdown);
    const initialThemeType = detectThemeType(vscode.window.activeColorTheme.kind);

    this.disposables.push(
      this.panel.onDidDispose(() => {
        this.dispose();
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!editor) {
          return;
        }

        if (editor.document.languageId !== "markdown") {
          return;
        }

        if (editor.document.uri.toString() === this.document.uri.toString()) {
          return;
        }

        this.bindDocument(editor.document);
      }),
      this.panel.webview.onDidReceiveMessage((message: IncomingMessage) => {
        this.messageQueue = this.messageQueue
          .then(() => this.handleMessage(message))
          .catch((error) => {
            console.error("markdown-live-editor: message handling failed", error);
          });
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() !== this.document.uri.toString()) {
          return;
        }

        if (this.isApplyingWebviewEdit) {
          return;
        }

        this.document = event.document;
        this.pushRender("render", event.document.getText(), "vscode");
      }),
      vscode.window.onDidChangeActiveColorTheme(() => {
        this.pushRender("render", this.document.getText(), "vscode");
      })
    );

    this.panel.webview.html = createWebviewHtml(
      this.panel.webview,
      initialMarkdown,
      initialHtml,
      initialThemeType
    );
  }

  bindDocument(document: vscode.TextDocument): void {
    this.document = document;
    this.panel.title = `Live Preview: ${document.fileName.split("/").pop() ?? "Untitled"}`;
    this.pushRender("render", this.document.getText(), "vscode");
  }

  private async handleMessage(message: IncomingMessage): Promise<void> {
    if (message.type === "ready") {
      this.pushRender("init", this.document.getText(), "vscode");
      return;
    }

    if (message.type === "updateMarkdown") {
      await this.applyDocumentText(message.markdown);
      this.pushRender("render", message.markdown, message.source);
    }
  }

  private async applyDocumentText(markdown: string): Promise<void> {
    if (markdown === this.document.getText()) {
      return;
    }

    this.isApplyingWebviewEdit = true;

    try {
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        this.document.positionAt(0),
        this.document.positionAt(this.document.getText().length)
      );
      edit.replace(this.document.uri, fullRange, markdown);
      await vscode.workspace.applyEdit(edit);
      this.document = await vscode.workspace.openTextDocument(this.document.uri);
    } finally {
      this.isApplyingWebviewEdit = false;
    }
  }

  private pushRender(type: "init" | "render", markdown: string, source?: RenderSource): void {
    const html = this.renderMarkdownUseCase.execute(markdown);
    const themeType = detectThemeType(vscode.window.activeColorTheme.kind);

    void this.panel.webview.postMessage({
      type,
      markdown,
      html,
      themeType,
      source
    });
  }

  private dispose(): void {
    LivePreviewPanel.currentPanel = undefined;

    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }
}
