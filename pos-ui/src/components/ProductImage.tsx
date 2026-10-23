"use client";

import { useEffect, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES: Array<{ words: string[]; icon: string; tone: string }> = [
  { words: ["wine", "shiraz", "cabernet", "pinot", "chardonnay", "riesling"], icon: "🍷", tone: "bg-rose-50 text-rose-700" },
  { words: ["beer", "lager", "ale", "stout", "peroni", "brew"], icon: "🍺", tone: "bg-amber-50 text-amber-800" },
  { words: ["spirit", "vodka", "whisky", "whiskey", "gin", "rum", "bourbon"], icon: "🥃", tone: "bg-orange-50 text-orange-800" },
  { words: ["bread", "loaf", "bakery"], icon: "🍞", tone: "bg-yellow-50 text-yellow-800" },
  { words: ["banana", "apple", "fruit", "produce"], icon: "🍎", tone: "bg-green-50 text-green-800" },
  { words: ["milk", "cheese", "yoghurt", "yogurt", "dairy"], icon: "🧀", tone: "bg-sky-50 text-sky-800" },
  { words: ["detergent", "clean", "soap", "shampoo"], icon: "🧴", tone: "bg-blue-50 text-blue-800" },
  { words: ["coffee", "tea"], icon: "☕", tone: "bg-stone-100 text-stone-700" },
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
  const src = id ? `/api/odoo/products/${id}/image${refreshToken === undefined ? "" : `?v=${refreshToken}`}` : "";
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
        <span aria-hidden="true" className={cn("flex h-full w-full items-center justify-center text-2xl", category.tone, fallbackClassName)}>{category.icon}</span>
      ) : (
        <ImageIcon aria-hidden="true" className="h-5 w-5 text-[var(--oh-muted)]" />
      )}
    </span>
  );
}
