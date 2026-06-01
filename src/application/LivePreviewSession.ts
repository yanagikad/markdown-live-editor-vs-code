import * as path from "node:path";
import * as vscode from "vscode";

import { VsCodePreviewOutputAdapter } from "../adapters/primary/vscode/VsCodePreviewOutputAdapter";
import { VsCodePreviewPanel } from "../adapters/primary/vscode/VsCodePreviewPanel";
import { UpdatePreviewUseCase } from "../domain/usecases/UpdatePreviewUseCase";
import type { MarkdownRendererPort } from "../domain/ports/MarkdownRendererPort";

// 1つのMarkdownドキュメントに対する同期処理を閉じ込め、責務を局所化する。
export class LivePreviewSession implements vscode.Disposable {
  private readonly sourceUri: string;
  private readonly previewPanel: VsCodePreviewPanel;
  private readonly updatePreviewUseCase: UpdatePreviewUseCase;
  private readonly disposables: vscode.Disposable[] = [];
  private isDisposed = false;
  // 双方向同期で発生する反復イベントを抑え、スクロール振動を防ぐ。
  private suppressEditorToPreviewUntil = 0;
  // 編集反映を直列化し、競合更新で内容が前後しないようにする。
  private markdownEditQueue: Promise<void> = Promise.resolve();

  public constructor(
    private readonly editor: vscode.TextEditor,
    renderer: MarkdownRendererPort,
    extensionUri: vscode.Uri,
    private readonly onDisposeSession: () => void
  ) {
    this.sourceUri = editor.document.uri.toString();

    const sourceName = path.basename(editor.document.fileName);
    const targetColumn = editor.viewColumn ?? vscode.ViewColumn.Active;
    this.previewPanel = new VsCodePreviewPanel(`Preview: ${sourceName}`, extensionUri, targetColumn);
    const outputAdapter = new VsCodePreviewOutputAdapter(this.previewPanel);
    this.updatePreviewUseCase = new UpdatePreviewUseCase(renderer, outputAdapter);
  }

  public start(): void {
    // 初回表示で空白時間を作らないため、開始時に即レンダリングする。
    this.renderCurrentDocument();
    this.syncScrollFromLine(this.editor.visibleRanges[0]?.start.line ?? 0, this.editor.document.lineCount);

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() !== this.sourceUri || this.isDisposed) {
          return;
        }

        this.renderCurrentDocument(event.document);
      })
    );

    this.disposables.push(
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        if (event.textEditor.document.uri.toString() !== this.sourceUri || this.isDisposed) {
          return;
        }

        if (Date.now() < this.suppressEditorToPreviewUntil) {
          // 逆方向同期直後は抑制し、イベント往復によるジッターを避ける。
          return;
        }

        this.syncScrollFromLine(
          event.visibleRanges[0]?.start.line ?? 0,
          event.textEditor.document.lineCount
        );
      })
    );

    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((event) => {
        if (event.textEditor.document.uri.toString() !== this.sourceUri || this.isDisposed) {
          return;
        }

        if (Date.now() < this.suppressEditorToPreviewUntil) {
          // カーソル移動起点でも同じ抑制を適用し、挙動を一貫させる。
          return;
        }

        this.syncScrollFromLine(event.selections[0]?.active.line ?? 0, event.textEditor.document.lineCount);
      })
    );

    this.disposables.push(
      this.previewPanel.onDidReceiveMessage((message) => {
        if (this.isDisposed) {
          return;
        }

        if (message.type === "previewScrolled") {
          this.syncEditorByRatio(message.ratio);
          return;
        }

        this.enqueueMarkdownUpdate(message.markdown);
      })
    );

    this.disposables.push(
      this.previewPanel.onDidDispose(() => {
        this.dispose();
      })
    );
  }

  public reveal(): void {
    this.previewPanel.reveal();
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.onDisposeSession();

    // 登録順に依存せず安全に終了できるよう、全購読を明示的に破棄する。
    for (const disposable of this.disposables) {
      disposable.dispose();
    }

    this.previewPanel.dispose();
  }

  private renderCurrentDocument(document: vscode.TextDocument = this.editor.document): void {
    const sourceTitle = path.basename(document.fileName);
    this.updatePreviewUseCase.execute(document.getText(), sourceTitle);
  }

  private syncScrollFromLine(line: number, totalLines: number): void {
    // 文書サイズ差があっても同期感を保てるよう、行番号を比率へ正規化する。
    const maxLine = Math.max(1, totalLines - 1);
    const normalizedLine = Math.min(Math.max(0, line), maxLine);
    const ratio = normalizedLine / maxLine;
    this.previewPanel.syncScrollByRatio(ratio);
  }

  private syncEditorByRatio(ratio: number): void {
    // Webview由来の比率をエディタ位置へ戻し、双方向ナビゲーションを成立させる。
    const normalizedRatio = Math.max(0, Math.min(1, ratio));
    const lineCount = this.editor.document.lineCount;
    const targetLine = Math.floor((lineCount - 1) * normalizedRatio);
    const targetPosition = new vscode.Position(targetLine, 0);

    // revealRange自体がイベントを発火するため、短時間だけ再同期を抑制する。
    this.suppressEditorToPreviewUntil = Date.now() + 140;
    this.editor.revealRange(
      new vscode.Range(targetPosition, targetPosition),
      vscode.TextEditorRevealType.AtTop
    );
  }

  private enqueueMarkdownUpdate(markdown: string): void {
    this.markdownEditQueue = this.markdownEditQueue
      .then(async () => {
        const document = this.editor.document;
        if (document.getText() === markdown) {
          return;
        }

        const fullRange = this.createFullDocumentRange(document);
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, fullRange, markdown);
        const applied = await vscode.workspace.applyEdit(edit);
        if (!applied) {
          throw new Error("Failed to apply markdown edits from preview.");
        }
      })
      .catch((error) => {
        console.error("Failed to apply markdown edits from preview.", error);
        void vscode.window.showErrorMessage("Preview edits could not be applied. Check if the document is writable.");
      });
  }

  private createFullDocumentRange(document: vscode.TextDocument): vscode.Range {
    const lastLine = Math.max(0, document.lineCount - 1);
    const lastCharacter = document.lineAt(lastLine).text.length;
    return new vscode.Range(0, 0, lastLine, lastCharacter);
  }
}
