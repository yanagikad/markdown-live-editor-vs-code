import * as vscode from 'vscode';
import { WebviewToExtensionMessage } from './types/message';

export class ExtensionMessageHandler {
    constructor(private document: vscode.TextDocument) {}

    public handle(message: WebviewToExtensionMessage) {
        switch (message.type) {
            case 'READY':
                console.log('Webview is ready');
                break;
            case 'DOCUMENT_CHANGED':
                // ここで VS Code のバッファに書き込む（自動保存など）
                console.log('Document changed:', message.text);
                break;
        }
    }
}
