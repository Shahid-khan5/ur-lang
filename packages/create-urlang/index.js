#!/usr/bin/env node
// create-urlang: npm create urlang my-app -- --template vite|tauri|electron
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const templatesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "templates");

function usage() {
  const available = fs.readdirSync(templatesRoot).join(" | ");
  process.stdout.write(`Usage: npm create urlang <naam> -- --template <${available}>\n`);
}

const args = process.argv.slice(2);
let target = null;
let template = "vite";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--template" || args[i] === "-t") {
    template = args[++i];
  } else if (args[i] === "--help" || args[i] === "-h") {
    usage();
    process.exit(0);
  } else if (!args[i].startsWith("-")) {
    target = args[i];
  }
}

if (target === null) {
  usage();
  process.exit(1);
}

const templateDir = path.join(templatesRoot, template);
if (!fs.existsSync(templateDir)) {
  process.stderr.write(`Arre yaar, '${template}' naam ka template nahi hai.\n`);
  usage();
  process.exit(1);
}

const targetDir = path.resolve(process.cwd(), target);
if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
  process.stderr.write(`Arre yaar, '${target}' pehle se maujood hai aur khaali nahi hai.\n`);
  process.exit(1);
}

fs.cpSync(templateDir, targetDir, { recursive: true });

// npm strips .gitignore from published packages; templates ship _gitignore.
const gi = path.join(targetDir, "_gitignore");
if (fs.existsSync(gi)) fs.renameSync(gi, path.join(targetDir, ".gitignore"));

// Stamp the project name into package.json.
const pkgPath = path.join(targetDir, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.name = path.basename(targetDir).toLowerCase().replace(/[^a-z0-9-]/g, "-");
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

process.stdout.write(`Shandaar! '${target}' tayyar hai (template: ${template}).

Aage:
  cd ${target}
  npm install
  npm run dev
`);
