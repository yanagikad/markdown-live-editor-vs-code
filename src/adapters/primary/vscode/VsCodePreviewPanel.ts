import * as vscode from "vscode";

const VIEW_TYPE = "markdownLiveEditor.preview";

export type PreviewIncomingMessage = {
  type: "previewScrolled";
  ratio: number;
} | {
  type: "markdownEdited";
  markdown: string;
};

// Webview境界を一箇所で管理し、表示ロジックと拡張本体を分離する。
export class VsCodePreviewPanel implements vscode.Disposable {
  private readonly panel: vscode.WebviewPanel;
  private readonly nodeModulesUri: vscode.Uri;
  private readonly targetColumn: vscode.ViewColumn;
  private isInitialized = false;

  public constructor(extensionUri: vscode.Uri, targetColumn: vscode.ViewColumn) {
    // 読み込み可能な資産を限定し、Webviewの攻撃面を最小化する。
    this.targetColumn = targetColumn;
    this.nodeModulesUri = vscode.Uri.joinPath(extensionUri, "node_modules");
    const localResourceRoots = [
      this.nodeModulesUri,
      extensionUri
    ];

    this.panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      "Editable Preview",
      {
        viewColumn: this.targetColumn,
        preserveFocus: false
      },
      {
        enableScripts: true,
        localResourceRoots
      }
    );
  }

  public show(renderedHtml: string, sourceTitle: string, sourceMarkdown: string): void {
    this.panel.title = "Editable Preview";

    if (!this.isInitialized) {
      this.panel.webview.html = this.wrapHtml(renderedHtml, sourceTitle, sourceMarkdown);
      this.isInitialized = true;
      return;
    }

    void this.panel.webview.postMessage({
      type: "updateContent",
      renderedHtml,
      sourceMarkdown
    });
  }

  public syncScrollByRatio(ratio: number): void {
    // 行番号ではなく比率を渡し、文書長の差分に強い同期方式にする。
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

  public onDidReceiveMessage(
    listener: (message: PreviewIncomingMessage) => void
  ): vscode.Disposable {
    return this.panel.webview.onDidReceiveMessage((message: unknown) => {
      if (!this.isPreviewIncomingMessage(message)) {
        // 想定外メッセージを無視し、処理対象を明確化する。
        return;
      }

      listener(message);
    });
  }

  public dispose(): void {
    this.isInitialized = false;
    this.panel.dispose();
  }

  private wrapHtml(renderedHtml: string, sourceTitle: string, sourceMarkdown: string): string {
    const nonce = this.createNonce();
    const encodedSource = encodeURIComponent(sourceMarkdown);
    const encodedRendered = encodeURIComponent(renderedHtml);
    const monacoLoaderUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.nodeModulesUri, "monaco-editor", "min", "vs", "loader.js")
    );
    const monacoBaseUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.nodeModulesUri, "monaco-editor", "min", "vs")
    );
    const monacoEditorCssUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.nodeModulesUri, "monaco-editor", "min", "vs", "editor", "editor.main.css")
    );
    const mermaidScriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.nodeModulesUri, "mermaid", "dist", "mermaid.min.js")
    );
    const katexCssUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.nodeModulesUri, "katex", "dist", "katex.min.css")
    );
    const csp = [
      // 外部スクリプト実行を抑制し、Webview内の実行境界を明示する。
      "default-src 'none'",
      `img-src ${this.panel.webview.cspSource} https: data:`,
      `style-src ${this.panel.webview.cspSource} data: 'unsafe-inline'`,
      `font-src ${this.panel.webview.cspSource}`,
      `script-src 'nonce-${nonce}' 'unsafe-eval' ${this.panel.webview.cspSource}`
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <title>Editable Preview</title>
  <link rel="stylesheet" href="${katexCssUri}" />
  <link rel="stylesheet" href="${monacoEditorCssUri}" />
  <style>
    :root {
      color-scheme: light dark;
      --fg: var(--vscode-editor-foreground);
      --bg: var(--vscode-editor-background);
      --link: var(--vscode-textLink-foreground);
      --border: color-mix(in srgb, var(--fg) 30%, transparent);
      --muted: color-mix(in srgb, var(--fg) 15%, transparent);
    }

    body {
      margin: 0;
      padding: 0;
      color: var(--fg);
      background: radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--vscode-editorInfo-foreground) 10%, transparent), transparent 30%), var(--bg);
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
      gap: 12px;
      padding: 10px 24px;
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--bg) 86%, transparent);
      backdrop-filter: blur(8px);
    }

    .toolbar h1 {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.02em;
      opacity: 0.85;
    }

    .toolbar button {
      border: 1px solid var(--border);
      color: var(--fg);
      background: var(--muted);
      padding: 6px 10px;
      border-radius: 8px;
      cursor: pointer;
      font: inherit;
    }

    .toolbar button:hover {
      background: color-mix(in srgb, var(--muted) 70%, var(--fg) 8%);
    }

    .mode-switch {
      display: inline-flex;
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
    }

    .mode-switch button {
      border: none;
      border-right: 1px solid var(--border);
      border-radius: 0;
      background: transparent;
      padding: 7px 12px;
    }

    .mode-switch button:last-child {
      border-right: none;
    }

    .mode-switch button[data-active="true"] {
      background: var(--muted);
      font-weight: 600;
    }

    main {
      max-width: 860px;
      margin: 0 auto;
      padding: 24px;
    }

    .editor-shell {
      max-width: 960px;
      margin: 0 auto;
      padding: 16px 24px 24px;
      display: none;
    }

    .editor-shell[data-mode="source"] {
      display: block;
    }

    #markdown-editor {
      width: 100%;
      min-height: calc(100vh - 108px);
      box-sizing: border-box;
      border-radius: 10px;
      border: 1px solid var(--border);
      overflow: hidden;
      background: var(--bg);
    }

    #markdown-editor .monaco-editor {
      border-radius: 10px;
    }

    #markdown-editor .monaco-editor .overflow-guard {
      border-radius: 10px;
    }

    .preview-shell[data-mode="source"] {
      display: none;
    }

    pre {
      padding: 12px;
      border-radius: 8px;
      overflow-x: auto;
      background: var(--muted);
      border: 1px solid var(--border);
    }

    code {
      font-family: var(--vscode-editor-font-family);
    }

    blockquote {
      margin-left: 0;
      padding-left: 16px;
      border-left: 4px solid var(--border);
    }

    img {
      max-width: 100%;
      height: auto;
    }

    table {
      border-collapse: collapse;
      width: 100%;
    }

    th,
    td {
      border: 1px solid var(--border);
      padding: 8px;
      text-align: left;
    }

    a {
      color: var(--link);
    }

    .mermaid {
      overflow-x: auto;
      padding: 8px 0;
      min-height: 1rem;
    }

    .mermaid svg {
      display: block;
      max-width: 100%;
      height: auto;
    }

    .mermaid-error {
      padding: 12px 14px;
      border-radius: 8px;
      border: 1px dashed var(--border);
      background: color-mix(in srgb, var(--muted) 65%, transparent);
      color: var(--fg);
      white-space: pre-wrap;
    }

    .katex-display {
      overflow-x: auto;
      overflow-y: hidden;
    }
  </style>
</head>
<body>
  <header class="toolbar">
    <h1>Live Preview</h1>
    <div class="mode-switch" role="tablist" aria-label="Preview mode switch">
      <button id="mode-live" type="button" role="tab" aria-selected="true">Live Preview</button>
      <button id="mode-source" type="button" role="tab" aria-selected="false">Source Mode</button>
    </div>
  </header>
  <main class="preview-shell" data-mode="live-preview">
    <div id="preview-content"></div>
  </main>
  <section class="editor-shell" data-mode="live-preview">
    <div id="markdown-editor" aria-label="Markdown source"></div>
  </section>
  <script nonce="${nonce}" src="${mermaidScriptUri}"></script>
  <script nonce="${nonce}" src="${monacoLoaderUri}"></script>
  <script type="module" nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const modeLiveButton = document.getElementById("mode-live");
    const modeSourceButton = document.getElementById("mode-source");
    const previewShell = document.querySelector(".preview-shell");
    const editorShell = document.querySelector(".editor-shell");
    const previewContent = document.getElementById("preview-content");
    const monacoEditorHost = document.getElementById("markdown-editor");
    const initialMarkdown = decodeURIComponent("${encodedSource}");
    const initialRenderedHtml = decodeURIComponent("${encodedRendered}");

    let mode = "live-preview";
    let mermaidRenderGeneration = 0;
    let mermaidRenderScheduled = false;
    let suppressOutgoingScroll = false;
    let frameScheduled = false;
    let pendingEditTimer;
    let lastSyncedMarkdown = initialMarkdown;
    let monacoModule = null;
    let monacoEditor = null;
    let fallbackEditor = null;
    let monacoBootPromise = null;
    let pendingInitialInsert = "";

    previewContent.innerHTML = initialRenderedHtml;

    function resolveTheme() {
      // VS Codeのテーマ種別に追従し、図とエディタの見た目を統一する。
      if (document.body.classList.contains("vscode-high-contrast") || document.body.classList.contains("vscode-high-contrast-light")) {
        return "high-contrast";
      }

      if (document.body.classList.contains("vscode-light")) {
        return "light";
      }

      return "dark";
    }

    function resolveMonacoTheme() {
      const theme = resolveTheme();
      if (theme === "high-contrast") {
        return "hc-black";
      }

      if (theme === "light") {
        return "vs";
      }

      return "vs-dark";
    }

    function applyMode() {
      const sourceMode = mode === "source";
      previewShell.dataset.mode = mode;
      editorShell.dataset.mode = mode;
      modeLiveButton.dataset.active = sourceMode ? "false" : "true";
      modeSourceButton.dataset.active = sourceMode ? "true" : "false";
      modeLiveButton.setAttribute("aria-selected", sourceMode ? "false" : "true");
      modeSourceButton.setAttribute("aria-selected", sourceMode ? "true" : "false");

      if (sourceMode && monacoEditor) {
        monacoEditor.focus();
        window.requestAnimationFrame(() => {
          monacoEditor.layout();
        });
        return;
      }

      if (sourceMode && fallbackEditor) {
        fallbackEditor.focus();
      }
    }

    function switchMode(nextMode) {
      mode = nextMode;
      applyMode();
    }

    modeLiveButton.addEventListener("click", () => {
      switchMode("live-preview");
    });

    modeSourceButton.addEventListener("click", () => {
      switchMode("source");
    });

    function mermaidThemeVariables(theme) {
      const styles = getComputedStyle(document.body);
      const fg = styles.getPropertyValue("--fg").trim();
      const bg = styles.getPropertyValue("--bg").trim();

      if (theme === "high-contrast") {
        return {
          primaryColor: bg,
          primaryTextColor: fg,
          lineColor: fg,
          secondaryColor: bg,
          tertiaryColor: bg,
          mainBkg: bg,
          clusterBkg: bg,
          edgeLabelBackground: bg,
          fontFamily: styles.getPropertyValue("--vscode-editor-font-family").trim()
        };
      }

      if (theme === "light") {
        return {
          primaryColor: "#ffffff",
          primaryTextColor: fg,
          lineColor: fg,
          secondaryColor: "#f4f6f8",
          tertiaryColor: "#f4f6f8",
          mainBkg: "#ffffff",
          clusterBkg: "#f4f6f8",
          edgeLabelBackground: "#ffffff",
          fontFamily: styles.getPropertyValue("--vscode-editor-font-family").trim()
        };
      }

      return {
        primaryColor: "#1e1e1e",
        primaryTextColor: fg,
        lineColor: fg,
        secondaryColor: "#252526",
        tertiaryColor: "#252526",
        mainBkg: "#1e1e1e",
        clusterBkg: "#252526",
        edgeLabelBackground: "#1e1e1e",
        fontFamily: styles.getPropertyValue("--vscode-editor-font-family").trim()
      };
    }

    function currentMermaidSource(container) {
      const storedSource = container.dataset.mermaidSource;
      if (storedSource && storedSource.trim().length > 0) {
        return storedSource;
      }

      const fallbackSource = (container.textContent ?? "").trim();
      container.dataset.mermaidSource = fallbackSource;
      return fallbackSource;
    }

    function renderMermaidBlocks() {
      if (!hasMermaid) {
        return;
      }

      const generation = ++mermaidRenderGeneration;
      const blocks = Array.from(previewContent.querySelectorAll(".mermaid"));

      blocks.forEach((container, index) => {
        const source = currentMermaidSource(container);
        if (!source) {
          return;
        }

        const id = "mermaid-" + generation + "-" + index;

        mermaid.render(id, source).then(({ svg, bindFunctions }) => {
          if (generation !== mermaidRenderGeneration || !container.isConnected) {
            return;
          }

          container.classList.remove("mermaid-error");
          container.innerHTML = svg;

          if (bindFunctions) {
            bindFunctions(container);
          }
        }).catch((error) => {
          if (generation !== mermaidRenderGeneration || !container.isConnected) {
            return;
          }

          console.error("Mermaid rendering failed:", error);
          container.classList.add("mermaid-error");
          container.textContent = source;
        });
      });
    }

    function scheduleMermaidRender() {
      if (mermaidRenderScheduled) {
        return;
      }

      mermaidRenderScheduled = true;
      window.requestAnimationFrame(() => {
        mermaidRenderScheduled = false;
        renderMermaidBlocks();
      });
    }

    const mermaid = window.mermaid;
    const hasMermaid = Boolean(mermaid);

    if (!hasMermaid) {
      console.error("Mermaid runtime is not available in the preview.");
    } else {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        suppressErrorRendering: true,
        theme: "base",
        themeVariables: mermaidThemeVariables(resolveTheme())
      });
    }

    function clampRatio(value) {
      if (Number.isNaN(value)) {
        return 0;
      }

      return Math.min(1, Math.max(0, value));
    }

    function applyScrollByRatio(ratio) {
      suppressOutgoingScroll = true;
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollHeight <= 0) {
        window.scrollTo(0, 0);
        window.setTimeout(() => {
          suppressOutgoingScroll = false;
        }, 60);
        return;
      }

      window.scrollTo(0, clampRatio(ratio) * scrollHeight);
      window.setTimeout(() => {
        suppressOutgoingScroll = false;
      }, 60);
    }

    function currentScrollRatio() {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollHeight <= 0) {
        return 0;
      }

      return clampRatio(window.scrollY / scrollHeight);
    }

    function isSourceEditorFocused() {
      if (monacoEditor) {
        return monacoEditor.hasTextFocus();
      }

      return Boolean(fallbackEditor && document.activeElement === fallbackEditor);
    }

    function enableFallbackEditor() {
      if (fallbackEditor) {
        return;
      }

      const textarea = document.createElement("textarea");
      textarea.spellcheck = false;
      textarea.value = lastSyncedMarkdown;
      textarea.style.width = "100%";
      textarea.style.minHeight = "calc(100vh - 108px)";
      textarea.style.boxSizing = "border-box";
      textarea.style.border = "1px solid var(--border)";
      textarea.style.borderRadius = "10px";
      textarea.style.background = "color-mix(in srgb, var(--bg) 92%, transparent)";
      textarea.style.color = "var(--fg)";
      textarea.style.fontFamily = "var(--vscode-editor-font-family)";
      textarea.style.fontSize = "var(--vscode-editor-font-size)";
      textarea.style.lineHeight = "1.6";
      textarea.style.padding = "14px";

      textarea.addEventListener("input", () => {
        window.clearTimeout(pendingEditTimer);
        pendingEditTimer = window.setTimeout(() => {
          sendEditedMarkdown();
        }, 180);
      });

      textarea.addEventListener("blur", () => {
        sendEditedMarkdown();
      });

      monacoEditorHost.replaceChildren(textarea);
      fallbackEditor = textarea;

      if (mode === "source") {
        fallbackEditor.focus();
      }
    }

    function getEditorValue() {
      if (monacoEditor) {
        return monacoEditor.getValue();
      }

      if (fallbackEditor) {
        return fallbackEditor.value;
      }

      return lastSyncedMarkdown;
    }

    function setEditorValue(markdown) {
      if (monacoEditor) {
        if (monacoEditor.getValue() === markdown) {
          return;
        }

        monacoEditor.setValue(markdown);
        return;
      }

      if (!fallbackEditor) {
        return;
      }

      if (fallbackEditor.value === markdown) {
        return;
      }

      fallbackEditor.value = markdown;
    }

    function sendEditedMarkdown() {
      const currentMarkdown = getEditorValue();
      if (currentMarkdown === lastSyncedMarkdown) {
        return;
      }

      lastSyncedMarkdown = currentMarkdown;
      vscode.postMessage({
        type: "markdownEdited",
        markdown: currentMarkdown
      });
    }

    function insertTextAtCursor(text) {
      if (fallbackEditor) {
        const start = fallbackEditor.selectionStart;
        const end = fallbackEditor.selectionEnd;
        fallbackEditor.setRangeText(text, start, end, "end");
        fallbackEditor.dispatchEvent(new Event("input", { bubbles: true }));
        fallbackEditor.focus();
        return;
      }

      if (!monacoEditor || !monacoModule) {
        pendingInitialInsert += text;
        return;
      }

      const position = monacoEditor.getPosition();
      if (!position) {
        return;
      }

      const selection = monacoEditor.getSelection();
      const range = selection || new monacoModule.Range(position.lineNumber, position.column, position.lineNumber, position.column);
      monacoEditor.executeEdits("preview-insert", [
        {
          range: range,
          text: text,
          forceMoveMarkers: true
        }
      ]);
      monacoEditor.focus();
    }

    function moveToSourceFromPreview(initialText) {
      if (mode !== "live-preview") {
        return;
      }

      switchMode("source");
      if (initialText) {
        insertTextAtCursor(initialText);
      }
    }

    function applyIncomingContent(renderedHtml, sourceMarkdown) {
      const hadSourceFocus = mode === "source" && isSourceEditorFocused();
      previewContent.innerHTML = renderedHtml;
      scheduleMermaidRender();

      if (!hadSourceFocus) {
        setEditorValue(sourceMarkdown);
      }

      lastSyncedMarkdown = sourceMarkdown;
    }

    function syncMonacoTheme() {
      if (!monacoModule || !monacoModule.editor) {
        return;
      }

      monacoModule.editor.setTheme(resolveMonacoTheme());
    }

    async function bootMonaco() {
      if (monacoBootPromise) {
        return monacoBootPromise;
      }

      monacoBootPromise = (async () => {
        await new Promise((resolve, reject) => {
          const amdRequire = globalThis.require;
          if (typeof amdRequire !== "function") {
            reject(new Error("Monaco AMD loader is not available in webview."));
            return;
          }

          amdRequire.config({ paths: { vs: "${monacoBaseUri}" } });
          amdRequire(["vs/editor/editor.main", "vs/basic-languages/markdown/markdown.contribution"], () => {
            resolve(undefined);
          }, (error) => {
            reject(error);
          });
        });

        const monaco = globalThis.monaco;
        if (!monaco) {
          throw new Error("Monaco global was not initialized.");
        }

        monacoModule = monaco;
        monaco.editor.setTheme(resolveMonacoTheme());
        monacoEditor = monaco.editor.create(monacoEditorHost, {
          value: initialMarkdown,
          language: "markdown",
          automaticLayout: true,
          minimap: {
            enabled: false
          },
          fontSize: 13,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          tabSize: 2,
          wordWrap: "on",
          renderWhitespace: "selection",
          fixedOverflowWidgets: true,
          padding: {
            top: 14,
            bottom: 14
          }
        });

        setEditorValue(lastSyncedMarkdown);

        monacoEditor.onDidChangeModelContent(() => {
          window.clearTimeout(pendingEditTimer);
          pendingEditTimer = window.setTimeout(() => {
            sendEditedMarkdown();
          }, 180);
        });

        monacoEditor.onDidBlurEditorText(() => {
          sendEditedMarkdown();
        });

        if (pendingInitialInsert) {
          const queuedInsert = pendingInitialInsert;
          pendingInitialInsert = "";
          insertTextAtCursor(queuedInsert);
        }

        if (mode === "source") {
          window.requestAnimationFrame(() => {
            monacoEditor.layout();
          });
        }
      })();

      monacoBootPromise.catch((error) => {
        console.error("Failed to initialize Monaco editor.", error);
        enableFallbackEditor();
      });

      return monacoBootPromise;
    }

    previewContent.addEventListener("click", (event) => {
      if (mode !== "live-preview") {
        return;
      }

      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      moveToSourceFromPreview("");
    });

    previewContent.addEventListener("dblclick", () => {
      moveToSourceFromPreview("");
    });

    document.addEventListener("keydown", (event) => {
      const saveWithShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s";
      if (saveWithShortcut) {
        event.preventDefault();
        sendEditedMarkdown();
        return;
      }

      if (mode !== "live-preview") {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key.length === 1) {
        event.preventDefault();
        moveToSourceFromPreview(event.key);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        moveToSourceFromPreview("\n");
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

      if (message?.type === "updateContent") {
        applyIncomingContent(String(message.renderedHtml ?? ""), String(message.sourceMarkdown ?? ""));
      }
    });

    const mermaidThemeObserver = new MutationObserver(() => {
      if (hasMermaid) {
        scheduleMermaidRender();
      }

      syncMonacoTheme();
    });
    mermaidThemeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });

    enableFallbackEditor();
    void bootMonaco();
    renderMermaidBlocks();
    applyMode();
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

    return candidate.type === "markdownEdited" && typeof candidate.markdown === "string";
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
}
