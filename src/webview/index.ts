import { Editor } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { ListItem } from '@tiptap/extension-list-item';
import { CodeBlock } from '@tiptap/extension-code-block';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';

import MarkdownIt from 'markdown-it';
// @ts-ignore
import taskLists from 'markdown-it-task-lists'; 
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
md.use(taskLists, { label: true, labelAfter: true });

const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-'
});
turndown.use(gfm);

turndown.addRule('tiptap-task-list', {
    filter: function(node: any) {
        return node.nodeName === 'LI' && (node.getAttribute('data-type') === 'taskItem' || node.classList.contains('task-list-item'));
    },
    replacement: function(content: string, node: any) {
        const isChecked = node.getAttribute('data-checked') === 'true' || node.querySelector('input[checked]');
        const cleanContent = content.replace(/^\s*\[[ xX]\]\s*/, '').replace(/^\s+/, '').replace(/\n+$/, '');
        return (isChecked ? '- [x] ' : '- [ ] ') + cleanContent + '\n';
    }
});

// Mermaid 初期化（重複を解消）
mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral'
});

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

function renderMermaid(text: string, element: HTMLDivElement) {
    if (!text.trim()) {
        element.innerHTML = '';
        return;
    }
    
    // IDはハイフンを含めない、必ずアルファベット始まりのユニーク値にします
    const id = `mermaid${Math.floor(Math.random() * 1000000)}`;
    
    try {
        // v9のレンダリングAPI
        mermaid.render(id, text, (svgCode: string) => {
            element.innerHTML = svgCode;
        });
    } catch (e: any) {
        element.innerHTML = `<div class="mermaid-error" style="color: var(--vscode-errorForeground, red); font-family: monospace;">❌ Mermaid Error: Syntax Error</div>`;
        
        const badElement = document.getElementById(id);
        if (badElement) badElement.remove();
    }
}

function initEditor(initialMarkdown: string) {
    lastSentMarkdown = initialMarkdown;
    const preprocessedMarkdown = initialMarkdown.replace(/^- \[ \]/gm, '* [ ]').replace(/^- \[x\]/gmi, '* [x]');
    const initialHtml = md.render(preprocessedMarkdown);

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
            TableHeader,
            TaskList,
            TaskItem.configure({ nested: true })
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
                const preprocessedMarkdown = message.text.replace(/^- \[ \]/gm, '* [ ]').replace(/^- \[x\]/gmi, '* [x]');
                const incomingHtml = md.render(preprocessedMarkdown);
                editor.commands.setContent(incomingHtml, { emitUpdate: false });
                lastSentMarkdown = message.text;
                setTimeout(() => { isUpdating = false; }, 50);
            }
            break;
    }
});

vscode.postMessage({ type: 'READY' });