import katex from "katex";
import type MarkdownIt from "markdown-it";

type InlineTokenState = {
  src: string;
  pos: number;
  posMax: number;
  push: (type: string, tag: string, nesting: number) => { content: string };
};

type BlockTokenState = {
  src: string;
  bMarks: number[];
  eMarks: number[];
  tShift: number[];
  line: number;
  push: (type: string, tag: string, nesting: number) => {
    block: boolean;
    content: string;
    map?: [number, number];
  };
};

// 通貨表記などの誤検知を減らし、数式記法だけを確実に拾うための判定。
function canOpenMath(state: InlineTokenState, pos: number): boolean {
  if (state.src.charCodeAt(pos) !== 0x24) {
    return false;
  }

  if (pos > 0 && state.src.charCodeAt(pos - 1) === 0x5c) {
    return false;
  }

  return true;
}

// エスケープ済み終端を除外して、意図しない早期クローズを防ぐ。
function findMathClose(state: InlineTokenState, start: number): number {
  for (let pos = start; pos < state.posMax; pos += 1) {
    if (state.src.charCodeAt(pos) !== 0x24) {
      continue;
    }

    if (state.src.charCodeAt(pos - 1) === 0x5c) {
      continue;
    }

    return pos;
  }

  return -1;
}

// インライン記法を独立ルール化し、既存Markdown記法との干渉を最小化する。
function mathInlineRule(state: InlineTokenState, silent: boolean): boolean {
  const start = state.pos;
  if (!canOpenMath(state, start)) {
    return false;
  }

  const end = findMathClose(state, start + 1);
  if (end < 0 || end === start + 1) {
    return false;
  }

  if (!silent) {
    const token = state.push("math_inline", "math", 0);
    token.content = state.src.slice(start + 1, end);
  }

  state.pos = end + 1;
  return true;
}

// ブロック数式は複数行を許容し、技術文書の表現力を確保する。
function mathBlockRule(
  state: BlockTokenState,
  startLine: number,
  endLine: number,
  silent: boolean
): boolean {
  const firstLineStart = state.bMarks[startLine] + state.tShift[startLine];
  const firstLineEnd = state.eMarks[startLine];
  const firstLine = state.src.slice(firstLineStart, firstLineEnd).trim();

  if (!firstLine.startsWith("$$")) {
    return false;
  }

  let nextLine = startLine;
  let found = false;
  let content = "";

  if (firstLine.endsWith("$$") && firstLine.length > 4) {
    content = firstLine.slice(2, -2).trim();
    found = true;
  } else {
    for (nextLine = startLine + 1; nextLine < endLine; nextLine += 1) {
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
      const lineEnd = state.eMarks[nextLine];
      const lineText = state.src.slice(lineStart, lineEnd);

      if (lineText.trim() === "$$") {
        found = true;
        break;
      }

      content += `${lineText}\n`;
    }

    content = content.trimEnd();
  }

  if (!found) {
    return false;
  }

  if (silent) {
    return true;
  }

  const token = state.push("math_block", "math", 0);
  token.block = true;
  token.content = content;
  token.map = [startLine, nextLine + 1];

  state.line = nextLine + 1;
  return true;
}

function renderMath(content: string, displayMode: boolean): string {
  try {
    return katex.renderToString(content, {
      displayMode,
      throwOnError: false,
      // 入力エラーでプレビュー全体を壊さず、閲覧を継続可能にする。
      strict: "ignore"
    });
  } catch {
    // 失敗時も内容は失わず、編集者が問題箇所を把握できるようにする。
    return `<code>${content}</code>`;
  }
}

export function katexPlugin(md: MarkdownIt): void {
  // 既存ルールの後ろに差し込み、標準Markdownの解釈を優先させる。
  md.inline.ruler.after("escape", "math_inline", mathInlineRule as never);
  md.block.ruler.after("blockquote", "math_block", mathBlockRule as never, {
    alt: ["paragraph", "reference", "blockquote", "list"]
  });

  md.renderer.rules.math_inline = (tokens, idx) => renderMath(tokens[idx].content, false);
  md.renderer.rules.math_block = (tokens, idx) => `<p>${renderMath(tokens[idx].content, true)}</p>`;
}