export interface PreviewWebviewHtmlInput {
  nonce: string;
  csp: string;
  mermaidScriptUri: string;
  katexCssUri: string;
  encodedMarkdown: string;
  encodedRendered: string;
}

// 副作用を持たない純粋関数として Webview HTML を組み立てる。
export function buildPreviewWebviewHtml(input: PreviewWebviewHtmlInput): string {
  const {
    nonce,
    csp,
    mermaidScriptUri,
    katexCssUri,
    encodedMarkdown,
    encodedRendered
  } = input;

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
