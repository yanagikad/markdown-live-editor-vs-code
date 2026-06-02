# markdown-live-editor-vs-code

VS Code拡張として動く、Markdownライブプレビューエディターです。

## 特徴

### 設計等として
- VS Code拡張として動作
- Markdownのプレビュー画
面から直接書き込みができる。
- ヘキサゴナルアーキテクチャで責務分離
- `mise`でNode.jsバージョンとタスクを管理
- エディタとプレビューの双方向スクロール同期

### Markdownエディターとして

- Markdownのプレビュー画面から直接書き込みができる。
- プレビュー上でMarkdown本文を直接編集できるインプレース編集モード
- `mermaid`コードブロックの図レンダリング
- `$...$` / `$$...$$` の数式レンダリング（KaTeX）
- VS Codeテーマ（色・フォント）への追従
- VS Codeテーマ種別（light/dark/high contrast）に応じたMermaid配色

## 技術スタック

- TypeScript
- VS Code Extension API
- markdown-it
- mise

## セットアップ

### 1. mise関連

```bash
mise trust mise.toml
mise install
```

### 2. 依存関係のインストール

```bash
mise run install
```

`npm install` を直接実行してもOKです。

### 3. ビルド

```bash
mise run build
```

または:

```bash
make build
```


## 実行方法（拡張のデバッグ）

1. VS Codeでこのフォルダを開く
2. `F5`を押して拡張開発ホストを起動
3. Markdownファイルを開く
4. コマンドパレットから `Markdown Live Editor: Open Live Preview` を実行

## ヘキサゴナルアーキテクチャ構成

### レイヤーの役割

- `src/domain`
	- 純粋なポート（interface）を配置
	- 例: `MarkdownRenderer`
- `src/application`
	- ユースケースを配置
	- 例: `RenderMarkdownUseCase`
- `src/infrastructure`
	- 外部依存を扱う実装を配置
	- `markdown`: `markdown-it` を使ったレンダラー
	- `webview`: プレビューUIとメッセージング
	- `vscode`: VS Codeテーマ種別判定
- `src/extension.ts`
	- エントリポイント
	- VS Codeコマンド登録と依存注入

## 主要コマンド

Makefileから実行できます。

```bash
make install   # 依存関係のインストール
make build     # TypeScriptコンパイル
make watch     # 監視コンパイル
```

`mise`経由で直接実行する場合:

```bash
mise run install
mise run build
mise run watch
```
