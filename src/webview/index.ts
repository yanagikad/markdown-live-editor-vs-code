import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';

import MarkdownIt from 'markdown-it';
// @ts-ignore (turndownの型定義が見つからないエラーを回避)
import TurndownService from 'turndown';
// @ts-ignore (型定義がないための回避)
import { gfm } from 'turndown-plugin-gfm';

import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../types/message';

// @ts-ignore
const vscode = acquireVsCodeApi();
let editor: Editor | null = null;

// パーサーの初期化
const md = new MarkdownIt({ html: true });
const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
});
turndown.use(gfm); // GitHub Flavored Markdown (テーブル等) を有効化

// 1. TipTapエディターの初期化
function initEditor(initialMarkdown: string) {
    // Markdown を HTML に変換して TipTap に渡す
    const initialHtml = md.render(initialMarkdown);

    editor = new Editor({
        element: document.getElementById('app')!,
        extensions: [
            StarterKit,
            Table.configure({ resizable: true }),
            TableRow,
            TableCell,
            TableHeader,
        ],
        content: initialHtml,
        onUpdate: ({ editor }) => {
            // エディタのHTMLを取得し、GitHub形式のMarkdownに逆変換
            const html = editor.getHTML();
            const markdown = turndown.turndown(html);
            
            const message: WebviewToExtensionMessage = {
                type: 'DOCUMENT_CHANGED',
                text: markdown
            };
            vscode.postMessage(message);
        },
    });
}

// 2. Extensionからのメッセージ受信
window.addEventListener('message', (event) => {
    const message: ExtensionToWebviewMessage = event.data;

    switch (message.type) {
        case 'INIT_DOCUMENT':
            if (!editor) {
                initEditor(message.text);
            }
            break;
        case 'UPDATE_DOCUMENT':
            if (editor) {
                // 外部（VS Code側）での変更をHTMLに変換してTipTapに反映
                const incomingHtml = md.render(message.text);
                const currentHtml = editor.getHTML();
                
                if (incomingHtml !== currentHtml) {
                    editor.commands.setContent(incomingHtml, false);
                }
            }
            break;
    }
});

// 3. 起動完了を通知
const readyMessage: WebviewToExtensionMessage = { type: 'READY' };
vscode.postMessage(readyMessage);