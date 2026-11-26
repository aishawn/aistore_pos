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

export function evaluateStockOracleAnswer(answer, query, products, oracleRequestsOk = true) {
  const parsed = parseStockAnswer(answer);
  const normalize = normalizeProductName;
  const exactProducts = Array.isArray(products)
    ? products.filter((product) => normalize(product?.name) === normalize(query))
    : [];
  const product = exactProducts.length === 1 ? exactProducts[0] : null;
  const noMatchAnswer = /no matching stock found|没有找到匹配库存/i.test(String(answer ?? ""));
  const noMatchConfirmed = noMatchAnswer && exactProducts.length === 0;
  const comparison = compareStockAnswer(answer, product);
  return {
    parsed,
    product,
    matches: Boolean(oracleRequestsOk && (parsed ? comparison.matches : noMatchConfirmed)),
    noMatchAnswer,
    noMatchConfirmed,
    oracleRequestsOk: Boolean(oracleRequestsOk),
    exactProductCount: exactProducts.length,
  };
}
