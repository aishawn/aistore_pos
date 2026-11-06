import { copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const uiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(uiRoot, "openapi.yaml");

await Promise.all([
  copyFile(source, resolve(uiRoot, "public/openapi.yaml")),
  copyFile(source, resolve(uiRoot, "public/api/pos/v1/openapi.yaml")),
]);
