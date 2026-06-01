import * as vscode from "vscode";

const VIEW_TYPE = "markdownLiveEditor.preview";

export type PreviewIncomingMessage = {
  type: "previewScrolled";
  ratio: number;
} | {
  type: "markdownEdited";
  markdown: string;
} | {
  type: "runtimeDiagnostics";
  level: "info" | "error";
  message: string;
  details?: string;
};

// Webview 表示責務を最小構成にして、挙動を追いやすくする。
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
    this.panel.webview.html = this.wrapHtml(renderedHtml, sourceMarkdown);
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
      if (!this.isPreviewIncomingMessage(message)) {
        return;
      }

      listener(message);
    });
  }

  public dispose(): void {
    this.panel.dispose();
  }

  private wrapHtml(renderedHtml: string, sourceMarkdown: string): string {
    const nonce = this.createNonce();
    const encodedMarkdown = encodeURIComponent(sourceMarkdown);
    const encodedRendered = encodeURIComponent(renderedHtml);
    const mermaidScriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.nodeModulesUri, "mermaid", "dist", "mermaid.min.js")
    );
    const katexCssUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.nodeModulesUri, "katex", "dist", "katex.min.css")
    );

    const csp = [
      "default-src 'none'",
      `img-src ${this.panel.webview.cspSource} https: data:`,
      `style-src ${this.panel.webview.cspSource} 'unsafe-inline' data:`,
      `font-src ${this.panel.webview.cspSource}`,
      `script-src 'nonce-${nonce}' ${this.panel.webview.cspSource}`
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <title>Editable Preview</title>
  <link rel="stylesheet" href="${katexCssUri}" />
  <style>
    :root {
      color-scheme: light dark;
      --fg: var(--vscode-editor-foreground);
      --bg: var(--vscode-editor-background);
      --muted: color-mix(in srgb, var(--fg) 14%, transparent);
      --border: color-mix(in srgb, var(--fg) 30%, transparent);
      --link: var(--vscode-textLink-foreground);
    }

    body {
      margin: 0;
      color: var(--fg);
      background: var(--bg);
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      line-height: 1.7;
    }

    .toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--bg) 88%, transparent);
      backdrop-filter: blur(8px);
    }

    .mode-switch {
      display: inline-flex;
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }

    .mode-switch button {
      border: none;
      background: transparent;
      color: var(--fg);
      padding: 6px 10px;
      cursor: pointer;
      font: inherit;
      border-right: 1px solid var(--border);
    }

    .mode-switch button:last-child {
      border-right: none;
    }

    .mode-switch button[data-active="true"] {
      background: var(--muted);
      font-weight: 600;
    }

    main,
    section {
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
    }

    .preview-shell[data-mode="source"],
    .editor-shell[data-mode="live-preview"] {
      display: none;
    }

    #preview-content {
      min-height: calc(100vh - 110px);
    }

    #source-editor {
      width: 100%;
      min-height: calc(100vh - 120px);
      box-sizing: border-box;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: color-mix(in srgb, var(--bg) 94%, transparent);
      color: var(--fg);
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      line-height: 1.6;
      padding: 12px;
      resize: vertical;
      outline: none;
    }

    pre {
      padding: 12px;
      border-radius: 8px;
      overflow-x: auto;
      background: var(--muted);
      border: 1px solid var(--border);
    }

    a { color: var(--link); }
    img { max-width: 100%; height: auto; }

    .mermaid {
      overflow-x: auto;
      min-height: 1rem;
      padding: 8px 0;
    }

    .mermaid-error {
      border: 1px dashed var(--border);
      border-radius: 8px;
      padding: 10px 12px;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <header class="toolbar">
    <div>Live Preview</div>
    <div class="mode-switch">
      <button id="mode-live" data-active="true">Live Preview</button>
      <button id="mode-source" data-active="false">Source Mode</button>
    </div>
  </header>

  <main class="preview-shell" data-mode="live-preview">
    <div id="preview-content"></div>
  </main>

  <section class="editor-shell" data-mode="live-preview">
    <textarea id="source-editor" spellcheck="false"></textarea>
  </section>

  <script nonce="${nonce}" src="${mermaidScriptUri}"></script>
  <script type="module" nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const modeLiveButton = document.getElementById("mode-live");
    const modeSourceButton = document.getElementById("mode-source");
    const previewShell = document.querySelector(".preview-shell");
    const editorShell = document.querySelector(".editor-shell");
    const previewContent = document.getElementById("preview-content");
    const sourceEditor = document.getElementById("source-editor");

    let mode = "live-preview";
    let suppressOutgoingScroll = false;
    let frameScheduled = false;
    let pendingEditTimer = null;
    let lastSyncedMarkdown = decodeURIComponent("${encodedMarkdown}");

    const initialRendered = decodeURIComponent("${encodedRendered}");
    previewContent.innerHTML = initialRendered;
    sourceEditor.value = lastSyncedMarkdown;

    function emitDiagnostics(level, message, details) {
      vscode.postMessage({ type: "runtimeDiagnostics", level, message, details });
    }

    function applyMode(nextMode) {
      mode = nextMode;
      previewShell.dataset.mode = mode;
      editorShell.dataset.mode = mode;

      const sourceMode = mode === "source";
      modeLiveButton.dataset.active = sourceMode ? "false" : "true";
      modeSourceButton.dataset.active = sourceMode ? "true" : "false";

      if (sourceMode) {
        sourceEditor.focus();
      }
    }

    function scheduleRenderMermaid() {
      const mermaid = window.mermaid;
      if (!mermaid) {
        return;
      }

      const blocks = Array.from(previewContent.querySelectorAll(".mermaid"));
      blocks.forEach((container, index) => {
        const source = container.dataset.mermaidSource || (container.textContent || "").trim();
        container.dataset.mermaidSource = source;
        const id = "mermaid-simple-" + index + "-" + Date.now();

        mermaid.render(id, source).then(({ svg, bindFunctions }) => {
          if (!container.isConnected) {
            return;
          }

          container.classList.remove("mermaid-error");
          container.innerHTML = svg;
          if (bindFunctions) {
            bindFunctions(container);
          }
        }).catch((error) => {
          container.classList.add("mermaid-error");
          container.textContent = source;
          emitDiagnostics("error", "Mermaid の描画に失敗しました。", String(error));
        });
      });
    }

    if (window.mermaid) {
      window.mermaid.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        suppressErrorRendering: true,
        theme: "base"
      });
      scheduleRenderMermaid();
    } else {
      emitDiagnostics("error", "Mermaid ランタイムが読み込まれていません。");
    }

    function currentScrollRatio() {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollHeight <= 0) {
        return 0;
      }

      return Math.min(1, Math.max(0, window.scrollY / scrollHeight));
    }

    function applyScrollByRatio(ratio) {
      suppressOutgoingScroll = true;
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.min(1, Math.max(0, ratio)) * Math.max(0, scrollHeight));
      window.setTimeout(() => {
        suppressOutgoingScroll = false;
      }, 60);
    }

    function flushSourceEditor() {
      const markdown = sourceEditor.value;
      if (markdown === lastSyncedMarkdown) {
        return;
      }

      lastSyncedMarkdown = markdown;
      vscode.postMessage({ type: "markdownEdited", markdown });
    }

    modeLiveButton.addEventListener("click", () => applyMode("live-preview"));
    modeSourceButton.addEventListener("click", () => applyMode("source"));

    sourceEditor.addEventListener("input", () => {
      window.clearTimeout(pendingEditTimer);
      pendingEditTimer = window.setTimeout(() => {
        flushSourceEditor();
      }, 160);
    });

    sourceEditor.addEventListener("blur", () => {
      flushSourceEditor();
    });

    document.addEventListener("keydown", (event) => {
      const saveWithShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s";
      if (!saveWithShortcut) {
        return;
      }

      event.preventDefault();
      if (mode === "source") {
        flushSourceEditor();
      }
    }, true);

    window.addEventListener("scroll", () => {
      if (suppressOutgoingScroll || frameScheduled) {
        return;
      }

      frameScheduled = true;
      window.requestAnimationFrame(() => {
        frameScheduled = false;
        if (suppressOutgoingScroll) {
          return;
        }

        vscode.postMessage({
          type: "previewScrolled",
          ratio: currentScrollRatio()
        });
      });
    }, { passive: true });

    window.addEventListener("message", (event) => {
      const message = event.data;

      if (message?.type === "scrollToRatio") {
        applyScrollByRatio(Number(message.ratio));
        return;
      }

      if (message?.type !== "updateContent") {
        return;
      }

      const nextRendered = String(message.renderedHtml || "");
      const nextMarkdown = String(message.sourceMarkdown || "");
      const sourceFocused = document.activeElement === sourceEditor;

      previewContent.innerHTML = nextRendered;
      scheduleRenderMermaid();

      if (!sourceFocused && sourceEditor.value !== nextMarkdown) {
        sourceEditor.value = nextMarkdown;
      }

      lastSyncedMarkdown = nextMarkdown;
    });

    applyMode("live-preview");
    emitDiagnostics("info", "簡易プレビューパネルを初期化しました。");
  </script>
</body>
</html>`;
  }

  private createNonce(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let value = "";

    for (let i = 0; i < 32; i += 1) {
      value += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return value;
  }

  private isPreviewIncomingMessage(message: unknown): message is PreviewIncomingMessage {
    if (typeof message !== "object" || message === null) {
      return false;
    }

    const candidate = message as Record<string, unknown>;
    if (candidate.type === "previewScrolled" && typeof candidate.ratio === "number") {
      return true;
    }

    if (
      candidate.type === "runtimeDiagnostics" &&
      (candidate.level === "info" || candidate.level === "error") &&
      typeof candidate.message === "string"
    ) {
      return true;
    }

    return candidate.type === "markdownEdited" && typeof candidate.markdown === "string";
  }
}
