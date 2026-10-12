"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Search } from "lucide-react";
import { SommelierShell } from "@/components/sommelier/SommelierShell";
import { formatMoney } from "@/components/sommelier/WineCard";
import {
  apiFailureMessage,
  sommelierIdentify,
  sommelierIdentifyImage,
  type SommelierWine,
} from "@/lib/api";

export function SommelierIdentifyPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SommelierWine[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanHint, setScanHint] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<string | null>(null);

  async function search(term: string) {
    const query = term.trim();
    if (!query) return;
    setLoading(true);
    setBusyLabel("Searching this store…");
    setError(null);
    setExtracted(null);
    try {
      const res = await sommelierIdentify(query);
      setItems(res.items ?? []);
      if (!res.items?.length) setError("No matching product in this store.");
    } catch (e) {
      setError(apiFailureMessage(e, "Search failed.", "Please sign in again."));
    } finally {
      setLoading(false);
      setBusyLabel(null);
    }
  }

  async function onPhoto(file: File) {
    setScanHint(null);
    setError(null);
    setExtracted(null);
    setLoading(true);
    setBusyLabel("Reading the label…");
    try {
      const prepared = await compressLabelPhoto(file);
      const res = await sommelierIdentifyImage(prepared, prepared.name || "label.jpg");
      const label = res.extractedName?.trim() || null;
      setExtracted(label);
      if (label) setQ(label);
      setItems(res.items ?? []);
      if (res.note) setScanHint(res.note);
      else if (!res.items?.length) setError("No matching product in this store.");
    } catch (e) {
      const barcode = await tryLocalBarcode(file);
      if (barcode) {
        setQ(barcode);
        setScanHint("Could not read the label. Searched the barcode instead.");
        await search(barcode);
        return;
      }
      setError(apiFailureMessage(e, "Could not read that photo. Try a closer shot of the label.", "Please sign in again."));
    } finally {
      setLoading(false);
      setBusyLabel(null);
    }
  }

  return (
    <SommelierShell
      title="Identify a wine"
      subtitle="Photograph the bottle label, or type a name / barcode."
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search(q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Penfolds Bin 28 or barcode"
          autoFocus
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-[15px] outline-none placeholder:text-white/35 focus:border-[#f39200]"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#f39200] px-4 text-[13px] font-semibold text-[#1a1020]"
        >
          <Search size={16} />
          Search
        </button>
      </form>

      <div className="mt-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onPhoto(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-[13px] text-white/80"
        >
          <Camera size={16} />
          Photograph label
        </button>
      </div>

      {extracted ? (
        <p className="mt-3 text-[13px] text-sky-200">
          Label read as <span className="font-medium text-white">{extracted}</span>
        </p>
      ) : null}
      {scanHint ? <p className="mt-3 text-[13px] text-amber-200">{scanHint}</p> : null}
      {error ? <p className="mt-3 text-[13px] text-rose-300">{error}</p> : null}
      {loading ? <p className="mt-4 text-[13px] text-white/60">{busyLabel ?? "Working…"}</p> : null}

      <ul className="mt-5 space-y-2">
        {items.map((item) => (
          <li key={item.productId}>
            <button
              type="button"
              onClick={() => router.push(`/sommelier/wine/${item.productId}`)}
              className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-left transition hover:border-white/30"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[16px] font-medium">{item.name}</p>
                <p className="text-[16px] text-[#f39200]">{formatMoney(item.sellPrice)}</p>
              </div>
              <p className="mt-1 text-[12px] text-white/55">
                {[item.varietal, item.drynessLabel, item.bodyLabel].filter(Boolean).join(" · ")}
                {item.stockQuantity != null ? ` · Stock ${item.stockQuantity}` : ""}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </SommelierShell>
  );
}

async function compressLabelPhoto(file: File): Promise<File> {
  if (file.size < 800_000 && (file.type === "image/jpeg" || file.type === "image/jpg")) {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) return file;
    return new File([blob], "label.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

async function tryLocalBarcode(file: File): Promise<string | null> {
  try {
    const Detector = (window as Window & {
      BarcodeDetector?: new (opts: { formats: string[] }) => {
        detect: (source: ImageBitmap) => Promise<{ rawValue: string }[]>;
      };
    }).BarcodeDetector;
    if (!Detector) return null;
    const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
    const bitmap = await createImageBitmap(file);
    const codes = await detector.detect(bitmap);
    const value = codes[0]?.rawValue?.trim();
    return value || null;
  } catch {
    return null;
  }
}
