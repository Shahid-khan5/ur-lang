// UrLang VS Code extension: launches `urlang lsp` and wires it to the editor.
const { LanguageClient, TransportKind } = require("vscode-languageclient/node");

let client;

function activate(context) {
  const config = require("vscode").workspace.getConfiguration("urlang");
  const command = config.get("lspPath") || "urlang";

  client = new LanguageClient(
    "urlang",
    "UrLang Language Server",
    {
      command,
      args: ["lsp"],
      transport: TransportKind.stdio,
    },
    {
      documentSelector: [{ scheme: "file", language: "urlang" }],
    }
  );
  client.start();
  context.subscriptions.push(client);
}

function deactivate() {
  return client ? client.stop() : undefined;
}

module.exports = { activate, deactivate };
