import { cn } from "@/lib/utils";

/** Keep this geometry identical to the public SVG used by the brand site. */
export const ORITHOS_BRAND = {
  icon: "/images/orithos-mark-v5.svg",
  light: "/images/orithos-mark-v5.svg",
  dark: "/images/orithos-mark-v5.svg",
  appleTouch: "/images/orithos-apple-touch-v5.png",
} as const;

type MarkProps = {
  className?: string;
  title?: string;
};

/** Orange O on a transparent canvas, shared across all background variants. */
export function OrithosBrandMarkIcon({ className, title }: MarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      className={cn("oh-brand-mark-img", className)}
      width={32}
      height={32}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="16" cy="16" r="11" stroke="#F05A17" strokeWidth="4" />
    </svg>
  );
}

/** Compatibility exports: the orange mark is identical on light and dark surfaces. */
export const OrithosBrandMarkLight = OrithosBrandMarkIcon;
export const OrithosBrandMarkDark = OrithosBrandMarkIcon;
