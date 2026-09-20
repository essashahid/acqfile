import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { customerBanned, labels, instructions } from "../src/lib/portal/copy";
const failures: string[] = [];
function check(text: string, file: string) {
  if (customerBanned.test(text)) failures.push(`${file}: ${text.trim()}`);
}
function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith(".tsx")) {
      const source = fs.readFileSync(file, "utf8");
      const ast = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      function visit(node: ts.Node) {
        if (ts.isJsxText(node)) check(node.text, file);
        if (
          ts.isJsxAttribute(node) &&
          /^(aria-label|placeholder|title|label)$/.test(node.name.getText(ast)) &&
          node.initializer &&
          ts.isStringLiteral(node.initializer)
        )
          check(node.initializer.text, file);
        ts.forEachChild(node, visit);
      }
      visit(ast);
    }
  }
}
for (const dir of ["src/app/p", "src/app/(app)/deals", "src/components/portal", "src/app/login"])
  walk(dir);
for (const [key, label] of Object.entries(labels)) {
  check(label, key);
  check(Object.values(instructions(key)).join(" "), key);
}
if (failures.length) throw Error(failures.join("\n"));
console.log(
  "Customer copy: static labels and JSX pass; rendered dynamic pages are covered by the browser proof.",
);
