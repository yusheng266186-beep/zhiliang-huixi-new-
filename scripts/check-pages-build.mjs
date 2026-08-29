// 构建产物冒烟检查：确认 pages-dist/index.html 存在，且其中引用的本地资源都真实存在。
// 用于在 CI 中拦截“Vite 输出结构变化导致 sed 失配 → 线上白屏”一类问题。
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const dist = resolve("pages-dist");
const htmlPath = resolve(dist, "index.html");
if (!existsSync(htmlPath)) {
  console.error(`[smoke] FAIL: ${htmlPath} 不存在——构建产物布局不符合预期。`);
  process.exit(1);
}
const html = readFileSync(htmlPath, "utf8");
const refs = [...html.matchAll(/(?:src|href)="([^"#?]+)"/g)]
  .map((match) => match[1])
  .filter((url) => !/^(https?:)?\/\//.test(url) && !url.startsWith("data:") && !url.startsWith("mailto:"));
const missing = [];
for (const ref of refs) {
  const target = resolve(dist, isAbsolute(ref) ? `.${ref}` : ref);
  if (!existsSync(target)) missing.push(ref);
}
if (missing.length) {
  console.error(`[smoke] FAIL: index.html 引用了 ${missing.length} 个不存在的本地资源：\n  ${missing.join("\n  ")}`);
  process.exit(1);
}
console.log(`[smoke] OK: index.html 存在，${refs.length} 个本地资源引用全部可解析。`);
