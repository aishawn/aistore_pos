"use client";

import { useEffect, useState } from "react";
import { Apple, Beer, Coffee, GlassWater, Image as ImageIcon, Package, SprayCan, Wine } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES: Array<{ words: string[]; icon: LucideIcon; tone: string }> = [
  { words: ["wine", "shiraz", "cabernet", "pinot", "chardonnay", "riesling"], icon: Wine, tone: "bg-rose-50 text-rose-700" },
  { words: ["beer", "lager", "ale", "stout", "peroni", "brew", "ipa", "pilsner"], icon: Beer, tone: "bg-amber-50 text-amber-800" },
  { words: ["cider", "perry", "banana", "apple", "fruit", "produce"], icon: Apple, tone: "bg-lime-50 text-lime-800" },
  { words: ["spirit", "vodka", "whisky", "whiskey", "gin", "rum", "bourbon"], icon: GlassWater, tone: "bg-orange-50 text-orange-800" },
  { words: ["bread", "loaf", "bakery", "milk", "cheese", "yoghurt", "yogurt", "dairy"], icon: Package, tone: "bg-sky-50 text-sky-800" },
  { words: ["detergent", "clean", "soap", "shampoo"], icon: SprayCan, tone: "bg-blue-50 text-blue-800" },
  { words: ["coffee", "tea"], icon: Coffee, tone: "bg-stone-100 text-stone-700" },
];

export function ProductImage({
  productId,
  name,
  className,
  fallbackClassName,
  refreshToken,
}: {
  productId?: number | string | null;
  name: string;
  className?: string;
  fallbackClassName?: string;
  refreshToken?: number;
}) {
  const id = typeof productId === "number" || /^\d+$/.test(String(productId ?? "")) ? String(productId) : "";
  // Orithos catalogue images are not served via the retired Odoo image BFF.
  const src = id ? "" : "";
  void refreshToken;
  const [failedSrc, setFailedSrc] = useState("");
  const [loadedSrc, setLoadedSrc] = useState("");
  const category = CATEGORIES.find((item) => item.words.some((word) => name.toLocaleLowerCase().includes(word)));
  const showImage = Boolean(src && failedSrc !== src);
  const imageReady = Boolean(src && loadedSrc === src && failedSrc !== src);

  useEffect(() => {
    setFailedSrc("");
    setLoadedSrc("");
  }, [src]);

  return (
    <span className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--oh-surface)]", className)}>
      {showImage ? (
        <>
          {!imageReady && <span aria-hidden="true" className="absolute inset-0 animate-pulse bg-slate-100" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={`${name} product`}
            loading="lazy"
            className={cn("h-full w-full object-contain transition-opacity", imageReady ? "opacity-100" : "opacity-0")}
            onLoad={() => setLoadedSrc(src)}
            onError={() => setFailedSrc(src)}
          />
        </>
      ) : category ? (
        <span aria-hidden="true" className={cn("flex h-full w-full items-center justify-center", category.tone, fallbackClassName)}><category.icon size={24} strokeWidth={1.7} /></span>
      ) : (
        <ImageIcon aria-hidden="true" className="h-5 w-5 text-[var(--oh-muted)]" />
      )}
    </span>
  );
}
