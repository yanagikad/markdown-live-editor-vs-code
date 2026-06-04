# 変数定義
EXTENSION_NAME = vscode-markdown-live-preview
VSIX_FILE = $(EXTENSION_NAME)-0.0.1.vsix

.PHONY: all build install uninstall reinstall clean watch

all: build

# 1. ビルド
build:
	@echo "📦 Building extension..."
	npm install
	npm run build
	npx vsce package -o $(VSIX_FILE)

# 3. 拡張機能のインストール
install: build
	@echo "🔌 Installing extension to VS Code..."
	code --install-extension $(VSIX_FILE)

# 4. 拡張機能のアンインストール（publisher名をlocalにしたのでここも確定します）
uninstall:
	@echo "🗑️ Uninstalling extension from VS Code..."
	-code --uninstall-extension local.$(EXTENSION_NAME)

# 5. 再インストール
reinstall:
	@echo "🔄 Reinstalling extension..."
	-$(MAKE) uninstall
	$(MAKE) install

clean:
	@echo "🧹 Cleaning up generated files..."
	rm -f *.vsix
	rm -rf dist/
	rm -rf media/js/webview.js