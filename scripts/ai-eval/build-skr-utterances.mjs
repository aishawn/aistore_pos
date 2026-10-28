import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const snapshotPath = process.argv[2] || "data/ai-eval/skr-snapshot.json";
const outputPath = process.argv[3] || "data/ai-eval/skr-utterances.jsonl";
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
const products = (snapshot.products || []).filter((product) => product.name);
const selected = products.slice(0, 50);
const cases = [];
for (const [index, product] of selected.entries()) {
  const safeId = String(product.id).replace(/[^A-Za-z0-9_-]/g, "_");
  cases.push({
    id: `skr-stock-${safeId}`,
    category: "stock",
    locale: "en-AU",
    question: `How much ${product.name} is in stock?`,
    expected: {
      intent: "report_stock",
      route: null,
      entities: { product: product.name },
      data: product.stock === null ? {} : { stock: product.stock },
      negative: ["writeRequests empty", "do not invent zero stock"],
    },
    dataRefs: [{ type: "product", id: product.id }],
  });
  cases.push({
    id: `skr-search-${safeId}`,
    category: "product-search",
    locale: index % 2 ? "zh-CN" : "en-AU",
    question: index % 2 ? `帮我查一下 ${product.name}` : `Find ${product.name}`,
    expected: {
      intent: "search_product",
      route: "/products",
      entities: { product: product.name },
      negative: ["writeRequests empty"],
    },
    dataRefs: [{ type: "product", id: product.id }],
  });
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${cases.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
console.log(JSON.stringify({ outputPath, cases: cases.length, products: selected.length }, null, 2));
