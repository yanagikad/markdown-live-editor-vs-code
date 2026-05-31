import MarkdownIt from "markdown-it";

import type { MarkdownRendererPort } from "../../domain/ports/MarkdownRendererPort";
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

    // 文書作成体験を高めるため、数式記法を標準レンダリングに組み込む。
    this.engine.use(katexPlugin);
  }

  public render(markdown: string): string {
    return this.engine.render(markdown);
  }
}
