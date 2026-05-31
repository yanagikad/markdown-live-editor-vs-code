// ドメインがレンダラー実装に依存しないよう、描画責務を抽象化するポート。
export interface MarkdownRendererPort {
  render(markdown: string): string;
}
