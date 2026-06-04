import * as vscode from 'vscode';
import { WebviewToExtensionMessage } from './types/message';

export class ExtensionMessageHandler {
    constructor(private document: vscode.TextDocument) {}

    public async handle(message: WebviewToExtensionMessage) {
        switch (message.type) {
            case 'READY':
                console.log('Webview is ready');
                break;
                
            case 'DOCUMENT_CHANGED':
                // 1. すでにドキュメントが同じ内容なら何もしない（無限ループ防止）
                if (this.document.getText() === message.text) {
                    return;
                }

                // 2. VS Code のドキュメントを書き換えるためのエディットを作成
                const edit = new vscode.WorkspaceEdit();
                
                // ファイルの最初から最後まで（全範囲）を指定
                const fullRange = new vscode.Range(
                    new vscode.Position(0, 0),
                    new vscode.Position(this.document.lineCount, 0)
                );

                // 全範囲を新しいマークダウンテキストに置換
                edit.replace(this.document.uri, fullRange, message.text);

                // 3. エディットを適用（これでVS Code側に変更が通知され、保存できるようになります）
                await vscode.workspace.applyEdit(edit);
                break;
        }
    }
}