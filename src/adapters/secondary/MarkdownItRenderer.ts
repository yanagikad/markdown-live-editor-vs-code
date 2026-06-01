import MarkdownIt from "markdown-it";

import type { MarkdownRendererPort } from "../../domain/ports/MarkdownRendererPort";
import { mermaidFencePlugin } from "./plugins/mermaidFencePlugin";
import { katexPlugin } from "./plugins/katexPlugin";

// レンダリング実装をここに閉じ込め、ドメイン層の純粋性を守る。
export class MarkdownItRenderer implements MarkdownRendererPort {
  private readonly engine: MarkdownIt;

  public constructor() {
    // 安全性を優先し、任意HTMLの混入を抑えた設定で初期化する。
    this.engine = new MarkdownIt({
      html: false,
      linkify: true,
      typographer: true
    });

    // Mermaid は Webview 側で安定して再描画できるよう、専用コンテナへ変換する。
    this.engine.use(mermaidFencePlugin);
    // 文書作成体験を高めるため、数式記法を標準レンダリングに組み込む。
    this.engine.use(katexPlugin);
  }

  public render(markdown: string): string {
    // ブロック単位でラップし、Webview側でクリック編集できるようにソースを埋め込む。
    return this.splitIntoBlocks(markdown)
      .map((source, idx) => {
        const inner = this.engine.render(source);
        const encoded = encodeURIComponent(source);
        return `<div class="md-block" data-idx="${idx}" data-source="${encoded}">${inner}</div>`;
      })
      .join("\n");
  }

  // 空行区切りでブロックを分割し、フェンスブロックは一塊として扱う。
  private splitIntoBlocks(markdown: string): string[] {
    const lines = markdown.split("\n");
    const blocks: string[] = [];
    let current: string[] = [];
    let inFence = false;
    let fenceMarker = "";

    for (const line of lines) {
      if (!inFence) {
        const m = line.match(/^(`{3,}|~{3,})/);
        if (m) {
          inFence = true;
          fenceMarker = m[1];
          current.push(line);
        } else if (line.trim() === "") {
          if (current.length > 0) {
            blocks.push(current.join("\n"));
            current = [];
          }
        } else {
          current.push(line);
        }
      } else {
        current.push(line);
        if (line.trim() === fenceMarker) {
          inFence = false;
          fenceMarker = "";
          blocks.push(current.join("\n"));
          current = [];
        }
      }
    }

    if (current.length > 0) {
      blocks.push(current.join("\n"));
    }

    return blocks.filter(b => b.trim().length > 0);
  }
}
