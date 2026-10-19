"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Search } from "lucide-react";
import { SommelierShell } from "@/components/sommelier/SommelierShell";
import { formatMoney } from "@/components/sommelier/WineCard";
import {
  apiFailureMessage,
  fetchAiClientConfig,
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
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [assistantAvailable, setAssistantAvailable] = useState<boolean | null>(null);
  const [labelVisionAvailable, setLabelVisionAvailable] = useState<boolean | null>(null);
  const [capabilityError, setCapabilityError] = useState(false);
  const lastQueryRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    void fetchAiClientConfig()
      .then((config) => {
        if (!cancelled) {
          setAiEnabled(config.enabled);
          setAssistantAvailable(config.assistantAvailable ?? config.enabled);
          setLabelVisionAvailable(config.labelVisionAvailable ?? config.enabled);
          setCapabilityError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setCapabilityError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function search(term: string) {
    const query = term.trim();
    if (!query) return;
    lastQueryRef.current = query;
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
          aria-busy={loading}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--oh-border)] bg-white px-3 py-2.5 text-[15px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-blue-100"
        />
        <button
          type="button"
          onClick={() => void search(q)}
          disabled={loading || !q.trim()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[var(--oh-primary)] px-3 text-[14px] font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60 sm:px-4"
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
          disabled={loading || capabilityError || aiEnabled === null || labelVisionAvailable === null || aiEnabled === false || labelVisionAvailable === false}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 py-2 text-[14px] font-medium text-[var(--oh-text)] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Camera size={16} />
          Photograph label
        </button>
        {capabilityError ? (
          <p className="mt-2 text-[13px] leading-5 text-[var(--oh-muted)]">
            Could not check label photo availability. Refresh and try again; name and barcode search still work.
          </p>
        ) : aiEnabled === null || labelVisionAvailable === null ? (
          <p role="status" className="mt-2 text-[13px] leading-5 text-[var(--oh-muted)]">
            Checking label photo availability…
          </p>
        ) : aiEnabled === false ? (
          <p className="mt-2 text-[13px] leading-5 text-[var(--oh-muted)]">
            Label photos need AI turned on. Name and barcode search still work.
          </p>
        ) : labelVisionAvailable === false ? (
          <p className="mt-2 text-[13px] leading-5 text-[var(--oh-muted)]">
            Label photo recognition is unavailable for this store. {assistantAvailable ? "Orithos AI assistant, name and barcode search still work." : "Name and barcode search still work."}
          </p>
        ) : null}
      </div>

      {extracted ? (
        <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-[13px] text-blue-800">
          Label read as <span className="font-semibold">{extracted}</span>
        </p>
      ) : null}
      {scanHint ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{scanHint}</p> : null}
      {error ? (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
          <span className="min-w-0 flex-1">{error}</span>
          {lastQueryRef.current ? (
            <button
              type="button"
              onClick={() => void search(lastQueryRef.current)}
              disabled={loading}
              className="shrink-0 font-semibold underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Retry search
            </button>
          ) : null}
        </div>
      ) : null}
      {loading ? <p role="status" className="mt-4 text-[14px] text-[var(--oh-muted)]">{busyLabel ?? "Working…"}</p> : null}

      <ul className="mt-5 space-y-2">
        {items.map((item) => (
          <li key={item.productId}>
            <button
              type="button"
              onClick={() => router.push(`/sommelier/wine/${item.productId}`)}
              className="w-full rounded-xl border border-[var(--oh-border)] bg-white px-4 py-3 text-left shadow-[var(--oh-shadow-card)] transition hover:border-blue-300"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[15px] font-semibold text-[var(--oh-text)] sm:text-[16px]">{item.name}</p>
                <p className="shrink-0 text-[15px] font-semibold text-[var(--oh-primary)] sm:text-[16px]">{formatMoney(item.sellPrice)}</p>
              </div>
              <p className="mt-1 text-[13px] leading-5 text-[var(--oh-muted)]">
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
