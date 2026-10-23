import { cn } from "@/lib/utils";

/** Public brand asset paths (must stay in sync with `pos-ui/public/images/`). */
export const ORITHOS_BRAND = {
  icon: "/images/orithos-mark-icon-v4.svg",
  light: "/images/orithos-mark-light-v4.svg",
  dark: "/images/orithos-mark-dark-v4.svg",
  appleTouch: "/images/orithos-apple-touch-v4.png",
} as const;

type MarkProps = {
  className?: string;
  title?: string;
};

/**
 * Inline icon mark — avoids a broken img when the static file is missing
 * from a deploy (the v4 files were previously referenced but not committed).
 */
export function OrithosBrandMarkIcon({ className, title }: MarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      fill="none"
      className={cn("oh-brand-mark-img", className)}
      width={32}
      height={32}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <rect width="512" height="512" rx="112" fill="#FFFFFF" />
      <path
        fill="#1B1D20"
        fillRule="evenodd"
        d="M256 22a234 234 0 1 0 0 468 234 234 0 0 0 0-468Zm0 58a176 176 0 1 1 0 352 176 176 0 0 1 0-352Z"
        clipRule="evenodd"
      />
      <path
        fill="#FB9201"
        d="M294 57C403 74 482 156 482 256C482 386 381 491 256 491C183 491 115 454 73 390C117 428 173 448 233 448C368 448 477 339 477 204C477 144 455 95 407 63Z"
      />
      <circle cx="168" cy="256" r="32" fill="#FB9201" />
      <circle cx="256" cy="256" r="32" fill="#FB9201" />
      <circle cx="344" cy="256" r="32" fill="#FB9201" />
    </svg>
  );
}
