var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate
});
module.exports = __toCommonJS(extension_exports);
var vscode2 = __toESM(require("vscode"));

// src/messageHandler.ts
var vscode = __toESM(require("vscode"));
var ExtensionMessageHandler = class {
  constructor(document) {
    this.document = document;
  }
  async handle(message) {
    switch (message.type) {
      case "READY":
        console.log("Webview is ready");
        break;
      case "DOCUMENT_CHANGED":
        if (this.document.getText() === message.text) {
          return;
        }
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
          new vscode.Position(0, 0),
          new vscode.Position(this.document.lineCount, 0)
        );
        edit.replace(this.document.uri, fullRange, message.text);
        await vscode.workspace.applyEdit(edit);
        break;
    }
  }
};

// src/extension.ts
function activate(context) {
  context.subscriptions.push(
    MarkdownLivePreviewProvider.register(context)
  );
}
var MarkdownLivePreviewProvider = class _MarkdownLivePreviewProvider {
  constructor(context) {
    this.context = context;
  }
  static viewType = "markdown-live-preview.editor";
  // エディターを登録するためのファクトリメソッド
  static register(context) {
    const provider = new _MarkdownLivePreviewProvider(context);
    return vscode2.window.registerCustomEditorProvider(_MarkdownLivePreviewProvider.viewType, provider);
  }
  // .md ファイルが開かれたときに呼ばれるコア処理
  async resolveCustomTextEditor(document, webviewPanel, _token) {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);
    const handler = new ExtensionMessageHandler(document);
    webviewPanel.webview.onDidReceiveMessage((message) => {
      if (message.type === "READY") {
        webviewPanel.webview.postMessage({
          type: "INIT_DOCUMENT",
          text: document.getText()
        });
      }
      handler.handle(message);
    });
    const changeDocumentSubscription = vscode2.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        const msg = {
          type: "UPDATE_DOCUMENT",
          text: document.getText()
        };
        webviewPanel.webview.postMessage(msg);
      }
    });
    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });
  }
  // Webviewに表示するベースHTMLを生成
  getHtmlForWebview(webview) {
    const scriptUri = webview.asWebviewUri(
      vscode2.Uri.joinPath(this.context.extensionUri, "media", "js", "webview.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode2.Uri.joinPath(this.context.extensionUri, "media", "css", "style.css")
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
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate
});
