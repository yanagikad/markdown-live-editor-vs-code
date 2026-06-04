# 変数定義
EXTENSION_NAME = vscode-markdown-live-preview
VSIX_FILE = $(EXTENSION_NAME)-0.0.1.vsix

.PHONY: all build install uninstall reinstall clean watch

# デフォルトタスク
all: build

# 1. ビルド
build:
	@echo "📦 Building extension..."
	npm install
	# フロントエンド(media/)とExtension(src/)のコンパイル処理をここに挟む
	# 例: npx esbuild src/extension.ts --bundle --outfile=dist/extension.js --platform=node
	npx vsce package -o $(VSIX_FILE)

# 2. 開発中の自動監視ビルド
watch:
	@echo "👀 Watching for changes..."
	# 必要に応じて esbuild --watch などを実行するコマンドを記述

# 3. 拡張機能のインストール
install: build
	@echo "🔌 Installing extension to VS Code..."
	code --install-extension $(VSIX_FILE)

# 4. 拡張機能のアンインストール
uninstall:
	@echo "🗑️ Uninstalling extension from VS Code..."
	# package.json の publisher.name を定義した後に、以下のように指定します
	# code --uninstall-extension publisher.$(EXTENSION_NAME)
	@echo "Please ensure the identifier matches your package.json"

# 5. 再インストール（一発でクリーンアップして最新にする）
reinstall:
	@echo "🔄 Reinstalling extension..."
	-$(MAKE) uninstall
	$(MAKE) install

# クリーンアップ
clean:
	@echo "🧹 Cleaning up generated files..."
	rm -f *.vsix
	rm -rf distout/