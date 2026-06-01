import type MarkdownIt from "markdown-it";

export function mermaidFencePlugin(markdownIt: MarkdownIt): void {
  const originalFence = markdownIt.renderer.rules.fence;

  markdownIt.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const info = token.info.trim().toLowerCase();

    if (!info.startsWith("mermaid")) {
      if (originalFence) {
        return originalFence(tokens, index, options, env, self);
      }

      return self.renderToken(tokens, index, options);
    }

    const source = token.content.trim();
    const escapedSource = markdownIt.utils.escapeHtml(source);
    return `<div class="mermaid" data-mermaid-source="${escapedSource}">${escapedSource}</div>\n`;
  };
}