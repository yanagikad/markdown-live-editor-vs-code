import type { PreviewOutputPort } from "../../../domain/ports/PreviewOutputPort";
import { VsCodePreviewPanel } from "./VsCodePreviewPanel";

// ドメインの出力要求をVS Code UI操作へ橋渡しするための一次アダプター。
export class VsCodePreviewOutputAdapter implements PreviewOutputPort {
  public constructor(private readonly panel: VsCodePreviewPanel) {}

  public show(renderedHtml: string, sourceTitle: string, sourceMarkdown: string): void {
    this.panel.show(renderedHtml, sourceTitle, sourceMarkdown);
  }
}
