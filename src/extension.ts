import * as vscode from 'vscode';
import { ExtensionMessageHandler } from './messageHandler';

export function activate(context: vscode.ExtensionContext) {
    // CustomTextEditorProviderの最低限の登録ロジックをここに書く
    console.log('Markdown Live Preview Extension is active');
}
