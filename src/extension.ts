import * as vscode from 'vscode';
import { ExtensionMessageHandler } from './messageHandler';
import { ExtensionToWebviewMessage } from './types/message';

export function activate(context: vscode.ExtensionContext) {
    // カスタムエディターの登録
    context.subscriptions.push(
        MarkdownLivePreviewProvider.register(context)
    );
}

class MarkdownLivePreviewProvider implements vscode.CustomTextEditorProvider {
    private static readonly viewType = 'markdown-live-preview.editor';

    constructor(private readonly context: vscode.ExtensionContext) {}

    // エディターを登録するためのファクトリメソッド
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new MarkdownLivePreviewProvider(context);
        return vscode.window.registerCustomEditorProvider(MarkdownLivePreviewProvider.viewType, provider);
    }

    // .md ファイルが開かれたときに呼ばれるコア処理
    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // Webview内でJavaScriptを実行できるように許可
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        // UI（HTML）の注入
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

        // メッセージハンドラーの初期化
        const handler = new ExtensionMessageHandler(document);

        // Webview（フロント）からのメッセージを受信
        webviewPanel.webview.onDidReceiveMessage((message) => {
            // READY を検知したら、初期データを送り返す
            if (message.type === 'READY') {
                webviewPanel.webview.postMessage({
                    type: 'INIT_DOCUMENT',
                    text: document.getText()
                });
            }
            handler.handle(message);
        });

        // Webview側からの「準備完了（READY）」を受けて初期データを送信する、
        // またはドキュメントがVS Code側で変更されたらWebviewへ通知するロジックをここに集約していく
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                const msg: ExtensionToWebviewMessage = {
                    type: 'UPDATE_DOCUMENT',
                    text: document.getText()
                };
                webviewPanel.webview.postMessage(msg);
            }
        });

        // タブが閉じられたらイベントリスナーを解放
        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });
    }

    // Webviewに表示するベースHTMLを生成
    private getHtmlForWebview(webview: vscode.Webview): string {
        // ビルドされたJSファイルへのパスをVS Code用に変換
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'js', 'webview.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'css', 'style.css')
        );

        return `
            <!DOCTYPE html>
            <html lang="ja">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-webview-resource: https: data:; script-src 'unsafe-inline' 'unsafe-eval' https:; style-src 'unsafe-inline' https:; worker-src blob:;">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link rel="stylesheet" href="${styleUri}">
                <title>Markdown Live Preview</title>
            </head>
            <body>
                <div id="app"></div>
                
                <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
                
                <script src="${scriptUri}"></script>
            </body>
            </html>
        `;
    }
}