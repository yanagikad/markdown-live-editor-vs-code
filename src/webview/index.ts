import { Editor } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { ListItem } from '@tiptap/extension-list-item';
import { CodeBlock } from '@tiptap/extension-code-block';

import MarkdownIt from 'markdown-it';
// @ts-ignore
import TurndownService from 'turndown';
// @ts-ignore
import { gfm } from 'turndown-plugin-gfm';

import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../types/message';

declare const mermaid: any;

// @ts-ignore
const vscode = acquireVsCodeApi();
let editor: Editor | null = null;
let lastSentMarkdown = '';
let isUpdating = false;

function isSameMarkdown(a: string, b: string) {
    if (!a || !b) return a === b;
    return a.replace(/\r\n/g, '\n').trim() === b.replace(/\r\n/g, '\n').trim();
}

const md = new MarkdownIt({ html: true });

const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-'
});
turndown.use(gfm);

// ★ 初期化のログも残す
try {
    mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
    console.log("[Mermaid] Initialization completed.");
} catch (e) {
    console.error("[Mermaid] Initialization failed:", e);
}

const CustomListItem = ListItem.extend({
    addKeyboardShortcuts() {
        return {
            Backspace: () => {
                const { selection } = this.editor.state;
                const { $from } = selection;
                if (selection.empty && $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0) {
                    return this.editor.commands.liftListItem('listItem');
                }
                return false;
            },
        };
    },
});

const CustomCodeBlock = CodeBlock.extend({
    addNodeView() {
        return ({ node, getPos, editor }) => {
            const dom = document.createElement('div');
            dom.className = 'code-block-wrapper';

            const pre = document.createElement('pre');
            const contentDOM = document.createElement('code');
            if (node.attrs.language) {
                contentDOM.classList.add(`language-${node.attrs.language}`);
            }
            pre.appendChild(contentDOM);
            dom.appendChild(pre);

            let previewDOM: HTMLDivElement | null = null;
            if (node.attrs.language === 'mermaid') {
                previewDOM = document.createElement('div');
                previewDOM.className = 'mermaid-preview';
                previewDOM.contentEditable = 'false'; 
                dom.appendChild(previewDOM);

                setTimeout(() => {
                    renderMermaid(node.textContent, previewDOM!);
                }, 50);
            }

            let timer: any;
            return {
                dom,
                contentDOM, 
                update: (updatedNode) => {
                    if (updatedNode.type !== node.type) return false;
                    if (updatedNode.attrs.language === 'mermaid' && previewDOM) {
                        clearTimeout(timer);
                        timer = setTimeout(() => {
                            renderMermaid(updatedNode.textContent, previewDOM!);
                        }, 300);
                    }
                    return true;
                }
            };
        };
    }
});

// ★ 原因究明のためのエラーダンプ特化レンダリング
function renderMermaid(text: string, element: HTMLDivElement) {
    if (!text.trim()) {
        element.innerHTML = '';
        return;
    }
    
    const id = `mermaid_${Math.floor(Math.random() * 1000000)}`;
    
    // TipTapの管轄外である <body> の直下に、一時的な「隠し部屋」を作る
    const sandbox = document.createElement('div');
    sandbox.style.position = 'absolute';
    sandbox.style.visibility = 'hidden';
    sandbox.style.top = '-9999px';
    document.body.appendChild(sandbox);

    vscode.postMessage({ type: 'LOG', level: 'info', message: `Attempting to render ID: ${id}` });

    try {
        // 白い箱（element）ではなく、安全な隠し部屋（sandbox）を計算用キャンバスとして渡す
        mermaid.render(id, text, (svgCode: string) => {
            // 完成した SVG（ただの文字列）だけを白い箱に流し込む
            element.innerHTML = svgCode;
            
            // 役目を終えた隠し部屋を消去
            sandbox.remove();
            vscode.postMessage({ type: 'LOG', level: 'info', message: `Render success for ID: ${id}` });
        }, sandbox);
    } catch (e: any) {
        // 失敗した場合、VS Code側にエラーの詳細を送信する
        const errorMsg = e?.message || e?.toString() || 'Unknown Error';
        vscode.postMessage({ 
            type: 'LOG', 
            level: 'error', 
            message: errorMsg,
            details: e?.stack || 'No Stack Trace'
        });

        element.innerHTML = `<div class="mermaid-error" style="color: var(--vscode-errorForeground, red); font-family: monospace;">❌ Mermaid Error (See VS Code Notification)</div>`;
        
        sandbox.remove();
        const badElement = document.getElementById(id);
        if (badElement) badElement.remove();
    }
}

function initEditor(initialMarkdown: string) {
    lastSentMarkdown = initialMarkdown;
    const initialHtml = md.render(initialMarkdown);

    editor = new Editor({
        element: document.getElementById('app')!,
        extensions: [
            StarterKit.configure({ 
                listItem: false,
                codeBlock: false 
            }), 
            CustomListItem,
            CustomCodeBlock, 
            Table.configure({ resizable: true }),
            TableRow,
            TableCell,
            TableHeader
        ],
        content: initialHtml,
        onUpdate: ({ editor }: { editor: any }) => {
            if (isUpdating) return;

            const html = editor.getHTML();
            let markdown = turndown.turndown(html);
            markdown = markdown.replace(/^(\s*)\*\s/gm, '$1- ');

            if (isSameMarkdown(markdown, lastSentMarkdown)) return;
            
            lastSentMarkdown = markdown;
            vscode.postMessage({
                type: 'DOCUMENT_CHANGED',
                text: markdown
            });
        },
    });
}

window.addEventListener('message', (event) => {
    const message: ExtensionToWebviewMessage = event.data;
    switch (message.type) {
        case 'INIT_DOCUMENT':
            if (!editor) initEditor(message.text);
            break;
        case 'UPDATE_DOCUMENT':
            if (editor) {
                if (isSameMarkdown(message.text, lastSentMarkdown)) {
                    lastSentMarkdown = message.text;
                    break;
                }
                isUpdating = true;
                const incomingHtml = md.render(message.text);
                editor.commands.setContent(incomingHtml, { emitUpdate: false });
                lastSentMarkdown = message.text;
                setTimeout(() => { isUpdating = false; }, 50);
            }
            break;
    }
});

vscode.postMessage({ type: 'READY' });