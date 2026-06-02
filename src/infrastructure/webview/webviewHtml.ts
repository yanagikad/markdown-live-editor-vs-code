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
    "connect-src https:",
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
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        height: 100%;
        color: var(--vscode-editor-foreground);
        background: var(--vscode-editor-background);
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
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      #workspace {
        min-height: 0;
        display: grid;
        grid-template-columns: 1fr 1fr;
      }
      #editor, #preview { min-height: 0; overflow: auto; }
      #editor { border-right: 1px solid var(--vscode-panel-border); }
      #preview { padding: 18px; }
      #preview :is(h1,h2,h3,h4,h5,h6) { font-family: "Avenir Next","Hiragino Sans",sans-serif; }
      #preview blockquote { margin-left: 0; padding-left: 12px; border-left: 4px solid var(--vscode-textLink-foreground); }
      #preview pre { padding: 10px; border-radius: 8px; overflow-x: auto; background: var(--vscode-textCodeBlock-background); }
      #preview code { font-family: var(--vscode-editor-font-family); }
      #theme-label { opacity: 0.75; font-size: 12px; }
      #edit-hint { opacity: 0.7; font-size: 12px; }
    </style>
  </head>
  <body>
    <div id="root">
      <div id="toolbar">
        <div id="theme-label">Theme: <span id="theme-value">${initialThemeType}</span></div>
        <div id="edit-hint">Edit Markdown on the left — preview updates live on the right.</div>
      </div>
      <div id="workspace">
        <div id="editor"></div>
        <div id="preview">${initialHtml}</div>
      </div>
    </div>

    <script nonce="${scriptNonce}" src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <script nonce="${scriptNonce}" src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
    <script nonce="${scriptNonce}" src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
    <script nonce="${scriptNonce}" type="module">
      import { EditorState } from "https://esm.sh/@codemirror/state@6.5.2";
      import { EditorView, keymap, lineNumbers } from "https://esm.sh/@codemirror/view@6.38.1";
      import { defaultKeymap, history, historyKeymap, indentWithTab } from "https://esm.sh/@codemirror/commands@6.8.0";
      import { markdown, markdownLanguage } from "https://esm.sh/@codemirror/lang-markdown@6.3.2";
      import MarkdownIt from "https://esm.sh/markdown-it@14.1.0";

      let bootstrapState = { markdown: "", html: "", themeType: "dark" };
      try {
        bootstrapState = JSON.parse(decodeURIComponent("${bootstrapStateEncoded}"));
      } catch (e) { console.error(e); }

      const vscode = acquireVsCodeApi();
      const editorHost = document.getElementById("editor");
      const preview = document.getElementById("preview");
      const themeValue = document.getElementById("theme-value");

      const md = new MarkdownIt({ html: true, linkify: true, breaks: true });
      const origFence = md.renderer.rules.fence;
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const info = (token.info || "").trim();
        if (info === "mermaid") {
          const esc = token.content
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
          return '<div class="mermaid">' + esc + "</div>";
        }
        return origFence ? origFence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
      };

      let latestTheme = bootstrapState.themeType || "dark";
      let applyingRemote = false;
      let debounce = 0;

      function mermaidTheme(t) {
        return t === "light" ? "default" : t === "high-contrast" ? "neutral" : "dark";
      }

      function enhance() {
        try {
          mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: mermaidTheme(latestTheme) });
          const nodes = preview.querySelectorAll(".mermaid");
          if (nodes.length) mermaid.run({ nodes });
        } catch (e) { console.error(e); }
        try {
          renderMathInElement(preview, {
            delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }],
            throwOnError: false
          });
        } catch (e) { console.error(e); }
      }

      function renderPreview(markdownText) {
        preview.innerHTML = md.render(markdownText);
        enhance();
      }

      function sendUpdate(markdownText) {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          vscode.postMessage({ type: "updateMarkdown", markdown: markdownText, source: "cm6-editor" });
        }, 50);
      }

      const editorTheme = EditorView.theme({
        "&": { height: "100%", color: "var(--vscode-editor-foreground)", backgroundColor: "var(--vscode-editor-background)" },
        ".cm-scroller": { fontFamily: "var(--vscode-editor-font-family)", lineHeight: "1.6" },
        ".cm-content": { caretColor: "var(--vscode-editorCursor-foreground)", padding: "12px" },
        ".cm-gutters": { backgroundColor: "var(--vscode-editor-background)", color: "var(--vscode-editorLineNumber-foreground)", border: "none" },
        ".cm-focused": { outline: "none" }
      });

      const view = new EditorView({
        state: EditorState.create({
          doc: bootstrapState.markdown || "",
          extensions: [
            lineNumbers(), history(),
            keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
            markdown({ base: markdownLanguage }),
            EditorView.lineWrapping,
            editorTheme,
            EditorView.updateListener.of((u) => {
              if (!u.docChanged || applyingRemote) return;
              const text = u.state.doc.toString();
              renderPreview(text);
              sendUpdate(text);
            })
          ]
        }),
        parent: editorHost
      });

      themeValue.textContent = latestTheme;
      renderPreview(view.state.doc.toString());

      window.addEventListener("message", (event) => {
        const msg = event.data;
        if (msg.type !== "init" && msg.type !== "render") return;

        applyingRemote = true;
        latestTheme = msg.themeType;
        themeValue.textContent = msg.themeType;

        const cur = view.state.doc.toString();
        const next = msg.markdown || "";
        if (cur !== next) {
          view.dispatch({ changes: { from: 0, to: cur.length, insert: next } });
        }

        preview.innerHTML = msg.html || "";
        enhance();
        applyingRemote = false;
      });

      vscode.postMessage({ type: "ready" });
    </script>
  </body>
</html>`;
}
