#!/bin/bash

# エラーが発生したら停止
set -e

echo "🚀 Creating Minimal Event-Driven Extension Workspace..."

# 1. 必要なディレクトリの作成
mkdir -p src/webview
mkdir -p src/types
mkdir -p media/css
mkdir -p media/js

# 2. 型定義ファイルの作成（双方向通信のプロトコルをここに集約）
cat << 'EOF' > src/types/message.ts
export type ExtensionToWebviewMessage = 
  | { type: 'INIT_DOCUMENT'; text: string }
  | { type: 'UPDATE_DOCUMENT'; text: string };

export type WebviewToExtensionMessage = 
  | { type: 'DOCUMENT_CHANGED'; text: string }
  | { type: 'READY' };
EOF

# 3. Extension側（VS Code API環境）のメッセージハンドラー
cat << 'EOF' > src/messageHandler.ts
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
EOF

# 4. Extension本体のエントリーポイント（カスタムエディタの登録）
cat << 'EOF' > src/extension.ts
import * as vscode from 'vscode';
import { ExtensionMessageHandler } from './messageHandler';

export function activate(context: vscode.ExtensionContext) {
    // CustomTextEditorProviderの最低限の登録ロジックをここに書く
    console.log('Markdown Live Preview Extension is active');
}
EOF

# 5. Webview側（ブラウザ環境 / TipTap用）のエントリファイル
cat << 'EOF' > src/webview/index.ts
// ここに Webview 側のメッセージ受信ロジックや TipTap の初期化を書く
console.log('Webview script loaded');
EOF

# 6. 実行権限の付与（自分自身や他のスクリプト用）
chmod +x "$0"

echo "✨ Done! Architecture scaffolding has been generated."