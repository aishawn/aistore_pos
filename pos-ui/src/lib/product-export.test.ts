import assert from "node:assert/strict";
import test from "node:test";
import { buildStoreProductsCsv } from "./product-export-csv.ts";

test("product CSV escapes quotes and keeps commas in text cells", () => {
  const csv = buildStoreProductsCsv([{
    id: 7,
    name: 'Malt "Best", 1',
    categoryName: "Beer, Wine",
    price: 4.25,
    stockQuantity: 3,
  }]);

  assert.equal(csv, 'id,name,category,price,stock\r\n7,"Malt ""Best"", 1","Beer, Wine",4.25,3');
});

test("product CSV writes empty optional values as empty fields", () => {
  assert.equal(
    buildStoreProductsCsv([{ id: 8, name: "Water" }]),
    'id,name,category,price,stock\r\n8,"Water","",,',
  );
});
