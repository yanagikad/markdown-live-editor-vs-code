import * as vscode from "vscode";

function nonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let i = 0; i < 32; i += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}

export function createWebviewHtml(
  webview: vscode.Webview,
  initialMarkdown: string,
  initialHtml: string,
  initialThemeType: string
): string {
  const scriptNonce = nonce();

  const csp = [
    "default-src 'none'",
    "img-src https: data:",
    "font-src https:",
    "style-src 'unsafe-inline' https:",
    `script-src 'nonce-${scriptNonce}' https:`
  ].join("; ");

  const bootstrapStateJson = JSON.stringify({
    markdown: initialMarkdown,
    html: initialHtml,
    themeType: initialThemeType
  });
  const bootstrapStateEncoded = encodeURIComponent(bootstrapStateJson);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Markdown Live Editor</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
    <style>
      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        height: 100%;
        color: var(--vscode-editor-foreground);
        background: radial-gradient(circle at top left, color-mix(in srgb, var(--vscode-editor-background) 85%, var(--vscode-textLink-foreground)), var(--vscode-editor-background));
        font-family: var(--vscode-font-family);
      }

      #root {
        height: 100%;
        display: grid;
        grid-template-rows: auto 1fr;
      }

      #toolbar {
        padding: 8px 12px;
        border-bottom: 1px solid var(--vscode-panel-border);
        display: flex;
        align-items: center;
        backdrop-filter: blur(4px);
      }

      #preview {
        height: 100%;
        overflow: auto;
        padding: 18px;
      }

      #preview :is(h1, h2, h3, h4, h5, h6) {
        font-family: "Avenir Next", "Hiragino Sans", sans-serif;
        letter-spacing: 0.02em;
      }

      #preview blockquote {
        margin-left: 0;
        padding-left: 12px;
        border-left: 4px solid var(--vscode-textLink-foreground);
      }

      #preview pre {
        padding: 10px;
        border-radius: 8px;
        overflow-x: auto;
        background: color-mix(in srgb, var(--vscode-editor-background) 70%, var(--vscode-editor-foreground) 8%);
      }

      #preview code {
        font-family: var(--vscode-editor-font-family);
      }

      #theme-label {
        opacity: 0.75;
        font-size: 12px;
      }

      #edit-hint {
        margin-left: 12px;
        opacity: 0.7;
        font-size: 12px;
      }

      #preview:focus {
        outline: 2px solid color-mix(in srgb, var(--vscode-focusBorder) 75%, transparent);
        outline-offset: -2px;
      }
    </style>
  </head>
  <body>
    <div id="root">
      <div id="toolbar">
        <div id="theme-label">Theme: <span id="theme-value">${initialThemeType}</span></div>
        <div id="edit-hint">Edit rendered preview directly.</div>
      </div>
      <div id="preview" contenteditable="true" spellcheck="false" tabindex="0">${initialHtml}</div>
    </div>

    <script nonce="${scriptNonce}" src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <script nonce="${scriptNonce}" src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
    <script nonce="${scriptNonce}" src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
    <script nonce="${scriptNonce}" src="https://cdn.jsdelivr.net/npm/turndown@7.2.0/dist/turndown.js"></script>
    <script nonce="${scriptNonce}">
      let bootstrapState = { markdown: "", html: "", themeType: "dark" };
      try {
        bootstrapState = JSON.parse(decodeURIComponent("${bootstrapStateEncoded}"));
      } catch (error) {
        console.error("failed to parse bootstrap state", error);
      }
      const vscode = acquireVsCodeApi();

      const preview = document.getElementById("preview");
      const themeValue = document.getElementById("theme-value");

      let turndownService = null;
      if (typeof TurndownService !== "undefined") {
        turndownService = new TurndownService({
          headingStyle: "atx",
          codeBlockStyle: "fenced",
          bulletListMarker: "-"
        });
        turndownService.addRule("mermaidFence", {
          filter(node) {
            return node.nodeName === "DIV" && node.classList.contains("mermaid");
          },
          replacement(content) {
            const graph = content.trim();
            return "\n\n~~~mermaid\n" + graph + "\n~~~\n\n";
          }
        });
      }

      let markdown = bootstrapState.markdown || "";
      let latestThemeType = bootstrapState.themeType || "dark";
      let lastRenderedHtml = bootstrapState.html || "";
      let isApplyingRemoteUpdate = false;
      let inputDebounceHandle;

      function mermaidTheme(themeType) {
        if (themeType === "light") {
          return "default";
        }
        if (themeType === "high-contrast") {
          return "neutral";
        }
        return "dark";
      }

      function renderMarkdownHtml(html) {
        preview.innerHTML = html;

        try {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: mermaidTheme(latestThemeType)
          });
          const nodes = preview.querySelectorAll(".mermaid");
          if (nodes.length > 0) {
            mermaid.run({ nodes });
          }
        } catch (error) {
          console.error(error);
        }

        try {
          renderMathInElement(preview, {
            delimiters: [
              { left: "$$", right: "$$", display: true },
              { left: "$", right: "$", display: false }
            ],
            throwOnError: false
          });
        } catch (error) {
          console.error(error);
        }
      }

      function htmlToMarkdown(html) {
        if (!turndownService) {
          const textOnly = new DOMParser().parseFromString(html, "text/html").body.textContent || "";
          return textOnly.trimEnd() + "\n";
        }

        const converted = turndownService.turndown(html);
        return converted.trimEnd() + "\n";
      }

      function postMarkdownUpdate(nextMarkdown) {
        markdown = nextMarkdown;
        vscode.postMessage({
          type: "updateMarkdown",
          markdown: nextMarkdown,
          source: "preview-editor"
        });
      }

      function syncPreviewEdit() {
        const nextMarkdown = htmlToMarkdown(preview.innerHTML);
        postMarkdownUpdate(nextMarkdown);
      }

      themeValue.textContent = latestThemeType;
      renderMarkdownHtml(lastRenderedHtml);

      preview.addEventListener("input", () => {
        if (isApplyingRemoteUpdate) {
          return;
        }

        if (inputDebounceHandle) {
          clearTimeout(inputDebounceHandle);
        }

        inputDebounceHandle = setTimeout(() => {
          syncPreviewEdit();
        }, 80);
      });

      preview.addEventListener("blur", () => {
        if (isApplyingRemoteUpdate) {
          return;
        }

        syncPreviewEdit();
      });

      window.addEventListener("message", (event) => {
        const message = event.data;

        if (message.type === "init" || message.type === "render") {
          isApplyingRemoteUpdate = true;
          markdown = message.markdown;
          lastRenderedHtml = message.html;
          latestThemeType = message.themeType;
          themeValue.textContent = message.themeType;

          const fromPreviewEditor = message.source === "preview-editor";
          if (!(fromPreviewEditor && document.activeElement === preview)) {
            renderMarkdownHtml(lastRenderedHtml);
          }

          isApplyingRemoteUpdate = false;
        }
      });

      vscode.postMessage({ type: "ready" });
    </script>
  </body>
</html>`;
}
