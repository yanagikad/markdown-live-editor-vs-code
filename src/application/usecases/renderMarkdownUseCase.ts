import { MarkdownRenderer } from "../../domain/ports/markdownRenderer";

export class RenderMarkdownUseCase {
  constructor(private readonly renderer: MarkdownRenderer) {}

  execute(markdown: string): string {
    return this.renderer.render(markdown);
  }
}
