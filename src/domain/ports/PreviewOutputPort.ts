// ユースケースがUI技術に触れずに結果を出力できるようにする出力ポート。
export interface PreviewOutputPort {
  show(renderedHtml: string, sourceTitle: string, sourceMarkdown: string): void;
}
