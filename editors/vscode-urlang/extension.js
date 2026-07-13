// UrLang VS Code extension: starts the language server and wires it to the editor.
//
// Finding the server is the fiddly part on Windows. npm installs `urlang` as a
// `.cmd` shim, and Node refuses to spawn `.cmd` files directly (EINVAL), while
// the extensionless `urlang` only exists on POSIX (ENOENT on Windows). So:
//
//   1. If we can resolve ur-lang's own server module, run it with this process's
//      Node — no shims, no PATH, no shell. This is the reliable path.
//   2. Otherwise fall back to the `urlang` command, through a shell on Windows
//      so the shim is actually executable.
const path = require("path");
const vscode = require("vscode");
const { LanguageClient, TransportKind } = require("vscode-languageclient/node");

let client;

/** Resolves ur-lang's compiled LSP server from the workspace, if it is installed there. */
function findServerModule() {
  const roots = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  for (const root of roots) {
    try {
      // Resolve as the workspace would: node_modules/ur-lang, hoisted or not.
      return require.resolve("ur-lang/dist/lsp/server.js", {
        paths: [root, path.join(root, "node_modules")],
      });
    } catch {
      // Not installed in this folder — try the next one.
    }
  }
  return null;
}

function serverOptions() {
  const configured = vscode.workspace.getConfiguration("urlang").get("lspPath");

  // An explicit .js path is run with Node directly.
  if (typeof configured === "string" && configured.endsWith(".js")) {
    return { module: configured, transport: TransportKind.stdio };
  }
  if (!configured) {
    const resolved = findServerModule();
    if (resolved !== null) {
      return { module: resolved, transport: TransportKind.stdio };
    }
  }

  // Fall back to the CLI on PATH. On Windows that is a .cmd shim, which only
  // spawns through a shell.
  return {
    command: configured || "urlang",
    args: ["lsp"],
    transport: TransportKind.stdio,
    options: { shell: process.platform === "win32" },
  };
}

async function activate(context) {
  client = new LanguageClient("urlang", "UrLang Language Server", serverOptions(), {
    documentSelector: [
      { scheme: "file", language: "urlang" },
    ],
    outputChannelName: "UrLang",
  });

  try {
    await client.start();
  } catch (err) {
    // Say what to do about it, rather than just that it failed.
    vscode.window.showErrorMessage(
      `UrLang: language server could not start (${err && err.message ? err.message : err}). ` +
        "Install it with `npm i -D ur-lang` in this project, or `npm i -g ur-lang`, " +
        "or point the `urlang.lspPath` setting at the CLI."
    );
    return;
  }
  context.subscriptions.push(client);
}

function deactivate() {
  return client ? client.stop() : undefined;
}

module.exports = { activate, deactivate };
