const normalizeProductName = (name) => String(name ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();

export function parseStockAnswer(answer) {
  const text = String(answer ?? "").trim();
  const match = text.match(/^(.+?)(?::\s*|库存：\s*)(-?\d+(?:\.\d+)?)(?:\s*件)?(?:\s*[（(].*)?$/);
  if (!match) return null;
  return { name: match[1].trim(), quantity: Number(match[2]) };
}

export function compareStockAnswer(answer, product) {
  const parsed = parseStockAnswer(answer);
  if (!parsed || !product) return { parsed, matches: false };
  const expected = Number(product.stockQuantity);
  return {
    parsed,
    matches: normalizeProductName(parsed.name) === normalizeProductName(product.name)
      && Number.isFinite(expected)
      && Math.abs(parsed.quantity - expected) < 0.000001,
  };
}
