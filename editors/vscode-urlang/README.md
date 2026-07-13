# UrLang for VS Code

Full language support for UrLang (`.ur`):

- Syntax highlighting, bracket matching, comment toggling
- **Live type errors** as you type (with `URxxxx` codes)
- **Hover** to see inferred/declared types
- **Autocomplete** for variables, keywords, and object properties after `.`
- **Go to definition**

## Requirements

The extension launches the language server via the `urlang` CLI:

```sh
npm install -g ur-lang    # provides `urlang lsp`
```

If `urlang` isn't on PATH, set `urlang.lspPath` in settings to its full path.

## Install (local)

```sh
cd editors/vscode-urlang
npm install
npx @vscode/vsce package
code --install-extension urlang-vscode-1.0.0.vsix
```
