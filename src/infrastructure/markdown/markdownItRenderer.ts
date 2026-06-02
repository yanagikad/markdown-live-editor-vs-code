import MarkdownIt from "markdown-it";
import { MarkdownRenderer } from "../../domain/ports/markdownRenderer";

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export class MarkdownItRenderer implements MarkdownRenderer {
  private readonly md: MarkdownIt;

  constructor() {
    this.md = new MarkdownIt({
      html: true,
      linkify: true,
      breaks: true
    });

    const originalFence = this.md.renderer.rules.fence;
    this.md.renderer.rules.fence = (
      tokens: any,
      idx: any,
      options: any,
      env: any,
      self: any
    ): string => {
      const token = tokens[idx];
      const info = token.info.trim();

      if (info === "mermaid") {
        return `<div class="mermaid">${escapeHtml(token.content)}</div>`;
      }

      if (originalFence) {
        return originalFence(tokens, idx, options, env, self);
      }

      return self.renderToken(tokens, idx, options);
    };
  }

  render(markdown: string): string {
    return this.md.render(markdown);
  }
}
