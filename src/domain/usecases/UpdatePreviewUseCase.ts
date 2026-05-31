import type { MarkdownRendererPort } from "../ports/MarkdownRendererPort";
import type { PreviewOutputPort } from "../ports/PreviewOutputPort";

// プレビュー更新の手続きを単一点に集約し、入出力の結合をドメインで管理する。
export class UpdatePreviewUseCase {
  public constructor(
    private readonly renderer: MarkdownRendererPort,
    private readonly output: PreviewOutputPort
  ) {}

  public execute(markdown: string, sourceTitle: string): void {
    // UI層に文字列変換の詳細を漏らさないため、ここでレンダリングを完結させる。
    const renderedHtml = this.renderer.render(markdown);
    // 出力先を差し替え可能にして、Webview以外への拡張余地を残す。
    this.output.show(renderedHtml, sourceTitle, markdown);
  }
}
