## 概要

VS CodeのカスタムエディタAPI（CustomTextEditorProvider）を使った、Markdownの1画面ライブプレビュー（WYSIWYG）拡張機能。

## 採用技術

-   **環境管理:** `mise`
    
-   **ビルド・タスクランナー:** `makefile`
    
-   **エディタ基盤:** VS Code Extension API & TipTap (WYSIWYG) (合わなければその他も可能)
    

## アーキテクチャ方針：イベント駆動（Message-Driven）

Extension（Node.js）とWebview（ブラウザ）間で発生する双方向通信を主軸に据えた、シンプルなイベント駆動構成とする。

## 実装要件

レンダリングおよび出力はGitHub Flavored Markdown (GFM) の形式を採用する。

### 必須対応機能

-   Markdownの双方向パース
    
-   **表（Table）のWYSIWYGによる直感的な編集**（行・列の追加削除、セル内編集）
    
-   \[ \]
    

```mermaid
graph TD
        A --> B
```