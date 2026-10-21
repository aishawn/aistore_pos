import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(fs.readFileSync(path.join(root, "docs/capability-status.json"), "utf8"));
const check = process.argv.includes("--check");
const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
function verified(file) {
  if (!file || !fs.existsSync(path.join(root, file))) return false;
  const evidence = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  return evidence.status === "PASS" && (!Array.isArray(evidence.checks) || evidence.checks.every((item) => item.status !== "FAIL"));
}
const rows = source.capabilities.map((item) => ({ ...item, local: verified(item.localEvidence), online: verified(item.onlineEvidence) }));
const yes = (value) => value ? "是" : "待验证";
const markdown = `<!-- capability-summary:start -->\n## 当前能力摘要（自动生成 · ${source.updatedAt}）\n\n来源：\`docs/capability-status.json\`。以下摘要优先于本文件后续历史记录；线上只读通过不等于部署身份已核验或真实业务验收。\n\n| 能力 | 已实现 | 本地验证 | 线上只读验证 | 真实业务验收 | 边界 |\n|---|---|---|---|---|---|\n${rows.map((item) => `| ${item.name} | ${yes(item.implemented)} | ${yes(item.local)} | ${yes(item.online)} | ${yes(item.businessAccepted)} | ${item.boundary} |`).join("\n")}\n\n试点决策：**${source.pilotDecision}**。阻塞：${source.blockers.join("；")}。\n<!-- capability-summary:end -->`;
const html = `<!-- capability-summary:start -->\n<section class="section" id="current-capability-summary"><h2>当前能力摘要 · ${escape(source.updatedAt)}</h2><p>由统一状态清单生成；本摘要优先于后续历史记录。线上只读通过不代表真实业务验收。</p><div class="table-wrap"><table><thead><tr><th>能力</th><th>已实现</th><th>本地验证</th><th>线上只读验证</th><th>真实业务验收</th><th>边界</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${escape(item.name)}</td><td>${yes(item.implemented)}</td><td>${yes(item.local)}</td><td>${yes(item.online)}</td><td>${yes(item.businessAccepted)}</td><td>${escape(item.boundary)}</td></tr>`).join("")}</tbody></table></div><p>试点决策：<strong>${escape(source.pilotDecision)}</strong>。${escape(source.blockers.join("；"))}。</p></section>\n<!-- capability-summary:end -->`;
const marker = /<!-- capability-summary:start -->[\s\S]*?<!-- capability-summary:end -->/;
const files = ["docs/CAPABILITY_STATUS.md", "docs/PILOT_RELEASE_READINESS.md", "docs/HANDOFF_2026-10-19_CURRENT.md"];
let changed = false;
function update(file, content) {
  const original = fs.readFileSync(file, "utf8");
  if (original === content) return;
  changed = true;
  if (!check) fs.writeFileSync(file, content, "utf8");
}
for (const relative of files) {
  const file = path.join(root, relative);
  const original = fs.readFileSync(file, "utf8");
  update(file, marker.test(original) ? original.replace(marker, markdown) : `${markdown}\n\n${original}`);
}
const guide = path.resolve(root, "../docs/功能说明.html");
if (fs.existsSync(guide)) {
  const original = fs.readFileSync(guide, "utf8");
  update(guide, marker.test(original) ? original.replace(marker, html) : original.replace("</header>", `</header>\n${html}`));
}
if (check && changed) { console.error("Capability summaries are stale. Run node scripts/generate-capability-summary.mjs."); process.exitCode = 1; }
else console.log(check ? "Capability summaries are current." : "Capability summaries generated; historical evidence preserved.");
