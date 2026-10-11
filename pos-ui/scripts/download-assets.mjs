// Downloads all assets for the Orithos "Sell" screen clone.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const ROOT = process.cwd();

const S3 = "https://sasonline-cloudpos.s3.ap-southeast-2.amazonaws.com/media/_mdb/Sales%20Keys/Version%202";

const assets = [
  // Brand
  { url: "https://cdn.onorithos.com/imgs/cloud.png?cache=true", out: "public/images/cloud.png" },
  { url: "https://sea.onorithos.com/imgs/square-cloud.png", out: "public/seo/square-cloud.png" },
  // Sale key button faces (icon + label baked into each PNG)
  { url: `${S3}/EFTPOS%20Alt.png?1572235724429&cache=media`, out: "public/images/keys/eftpos.png" },
  { url: `${S3}/Plus%20Quantity.png?1572235652256&cache=media`, out: "public/images/keys/plus-quantity.png" },
  { url: `${S3}/Exact%20Cash.png?1572235706110&cache=media`, out: "public/images/keys/exact-cash.png" },
  { url: `${S3}/Minus%20Quantity.png?1572235632288&cache=media`, out: "public/images/keys/minus-quantity.png" },
  { url: `${S3}/Cash%20Out.png?1572235690462&cache=media`, out: "public/images/keys/cash-out.png" },
  { url: `${S3}/Clear%20Sale.png?1572235573189&cache=media`, out: "public/images/keys/clear-sale.png" },
  { url: `${S3}/Case%20Quantity.png?1572235596495&cache=media`, out: "public/images/keys/case-quantity.png" },
  { url: `${S3}/More%20Functions.png?1572235669317&cache=media`, out: "public/images/keys/more-functions.png" },
];

async function download({ url, out }) {
  const dest = join(ROOT, out);
  await mkdir(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  console.log(`✓ ${out} (${(buf.length / 1024).toFixed(1)} KB)`);
}

// Batched parallel downloads (4 at a time)
const BATCH = 4;
for (let i = 0; i < assets.length; i += BATCH) {
  const batch = assets.slice(i, i + BATCH);
  await Promise.all(
    batch.map((a) => download(a).catch((e) => console.error(`✗ ${a.out}: ${e.message}`)))
  );
}
console.log("Done.");
