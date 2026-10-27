"use client";

import { useRef, useState } from "react";
import { Barcode, Search } from "lucide-react";
import { browseProducts, type ProductBrowseItem } from "@/lib/api";

export function ProductIdentifyPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ProductBrowseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(value = query) {
    const term = value.trim();
    if (!term) return;
    setLoading(true);
    setError(null);
    try {
      const result = await browseProducts(undefined, term);
      setItems(result.items ?? []);
      if (!result.items?.length) setError("No matching product in this store.");
    } catch {
      setItems([]);
      setError("Could not search the store catalogue. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function scanBarcode() {
    const Detector = (
      window as Window & {
        BarcodeDetector?: new (options: { formats: string[] }) => {
          detect: (source: ImageBitmap) => Promise<{ rawValue: string }[]>;
        };
      }
    ).BarcodeDetector;
    if (!Detector) {
      setError(
        "Barcode scanning is not supported on this device. Search by name instead.",
      );
      return;
    }
    inputRef.current?.click();
  }

  async function readPhoto(file: File) {
    const Detector = (
      window as Window & {
        BarcodeDetector?: new (options: { formats: string[] }) => {
          detect: (source: ImageBitmap) => Promise<{ rawValue: string }[]>;
        };
      }
    ).BarcodeDetector;
    if (!Detector) return;
    try {
      const bitmap = await createImageBitmap(file);
      const detector = new Detector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
      });
      const code = (await detector.detect(bitmap))[0]?.rawValue?.trim();
      if (!code) {
        setError("No barcode found. Try a closer photo or search by name.");
        return;
      }
      setQuery(code);
      await search(code);
    } catch {
      setError("Could not read that barcode. Search by name instead.");
    }
  }

  return (
    <main className="oh-workspace-main min-h-full bg-[var(--oh-surface)] px-4 py-5 text-[var(--oh-text)] sm:px-6 sm:py-7">
      <div className="mx-auto w-full max-w-3xl">
        <header>
          <p className="text-[13px] font-semibold uppercase tracking-[.12em] text-[var(--oh-primary)]">
            Orithos AI
          </p>
          <h1 className="oh-type-title mt-2">Identify a product</h1>
          <p className="mt-2 text-[15px] leading-6 text-[var(--oh-muted)]">
            Search any product by name or barcode. Wine label recognition is
            available in Scan Wine Label.
          </p>
        </header>

        <form
          className="mt-6 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Product name or barcode"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-2.5 text-[15px] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-blue-100"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[var(--oh-primary)] px-3 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:px-4"
          >
            <Search size={16} aria-hidden="true" />
            Search
          </button>
        </form>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readPhoto(file);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => void scanBarcode()}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-2 text-[14px] font-medium hover:bg-slate-50"
        >
          <Barcode size={16} aria-hidden="true" />
          Scan barcode
        </button>

        {loading ? (
          <p role="status" className="mt-4 text-[14px] text-[var(--oh-muted)]">
            Searching this store…
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700"
          >
            {error}
          </p>
        ) : null}

        <ul className="mt-5 space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-3 shadow-[var(--oh-shadow-card)]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 text-[15px] font-semibold">{item.name}</p>
                <p className="shrink-0 text-[15px] font-semibold text-[var(--oh-primary)]">
                  {formatAud(item.price)}
                </p>
              </div>
              <p className="mt-1 text-[13px] text-[var(--oh-muted)]">
                {item.categoryName || "Product"}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

function formatAud(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value || 0);
}
