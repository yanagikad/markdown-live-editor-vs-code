.PHONY: install build watch compile package code-install code-uninstall code-reinstall

EXTENSION_ID := local.markdown-live-editor-vs-code
VSIX := markdown-live-editor-vs-code.vsix

install:
	mise run install

compile:
	npm run compile

build:
	mise run build

watch:
	mise run watch

package: compile
	npx @vscode/vsce package -o $(VSIX) --allow-missing-repository --skip-license

code-install: package
	code --install-extension $(VSIX) --force

code-uninstall:
	-code --uninstall-extension $(EXTENSION_ID)

code-reinstall: code-uninstall code-install
