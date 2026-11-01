import assert from "node:assert/strict";
import test from "node:test";
import { groupCategories, type CategoryIdentity } from "./category-groups.ts";

const category = (id: number, name: string, parent = 0): CategoryIdentity => ({ id, name, parent_id: parent ? [parent, "Parent"] : false });

test("unifies matching local/shared ancestry while retaining every filter identity", () => {
  const groups = groupCategories([category(1, " Bakery "), category(2, "BAKERY"), category(3, "Bread", 1), category(4, "bread", 2)]);
  assert.deepEqual(groups.map((group) => group.map((item) => item.id)), [[1, 2], [3, 4]]);
});

test("keeps identical leaf names under different full paths distinct", () => {
  const groups = groupCategories([category(1, "Food"), category(2, "Drink"), category(3, "Specials", 1), category(4, "Specials", 2), category(5, "Seasonal", 3), category(6, "Seasonal", 4)]);
  assert.equal(groups.length, 6);
});

test("does not merge unknown parents or recurse forever on cyclic data", () => {
  assert.equal(groupCategories([category(1, "Bread", 90), category(2, "Bread", 91)]).length, 2);
  assert.equal(groupCategories([category(1, "A", 2), category(2, "B", 1)]).length, 2);
  assert.deepEqual(groupCategories([]), []);
});
