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

const ICON_TITLE = { role: "img" as const, "aria-hidden": undefined };
const ICON_DECOR = { role: "presentation" as const, "aria-hidden": true as const };

/**
 * Square app icon — inline SVG so the Overview header stays crisp at ~28px
 * and never depends on a missing/raster favicon deploy.
 * Geometry matches the official oh mark: ring + orange crescent + dots + H stem.
 */
export function OrithosBrandMarkIcon({ className, title }: MarkProps) {
  const a11y = title ? ICON_TITLE : ICON_DECOR;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      fill="none"
      className={cn("oh-brand-mark-img", className)}
      width={32}
      height={32}
      role={a11y.role}
      aria-hidden={a11y["aria-hidden"]}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <rect width="512" height="512" rx="96" fill="#FFFFFF" />
      {/* O ring — shifted left so the H stem fits in the square */}
      <path
        fill="#1B1D20"
        fillRule="evenodd"
        d="M214 56a200 200 0 1 0 0 400 200 200 0 0 0 0-400Zm0 50a150 150 0 1 1 0 300 150 150 0 0 1 0-300Z"
        clipRule="evenodd"
      />
      <path
        fill="#FB9201"
        d="M248 86C340 102 406 172 406 256C406 366 320 456 214 456C152 456 96 426 60 374C96 406 142 424 192 424C306 424 398 332 398 218C398 168 380 126 340 96Z"
      />
      <circle cx="140" cy="256" r="28" fill="#FB9201" />
      <circle cx="214" cy="256" r="28" fill="#FB9201" />
      <circle cx="288" cy="256" r="28" fill="#FB9201" />
      {/* H stem */}
      <rect x="392" y="148" width="52" height="216" rx="26" fill="#1B1D20" />
    </svg>
  );
}

/** Wide OH mark for light backgrounds (transparent). */
export function OrithosBrandMarkLight({ className, title }: MarkProps) {
  const a11y = title ? ICON_TITLE : ICON_DECOR;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1557 1044"
      fill="none"
      className={cn("oh-brand-mark-img", className)}
      width={48}
      height={32}
      role={a11y.role}
      aria-hidden={a11y["aria-hidden"]}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="#1B1D20"
        fillRule="evenodd"
        d="M507 80a436 436 0 1 0 0 872 436 436 0 0 0 0-872Zm0 108a328 328 0 1 1 0 656 328 328 0 0 1 0-656Z"
        clipRule="evenodd"
      />
      <path
        fill="#FB9201"
        d="M579 158C782 185 933 338 933 516C933 757 744 952 511 952C374 952 246 884 169 767C251 837 386 871 507 871C688 871 835 712 835 516C835 352 738 214 579 158Z"
      />
      <circle cx="332" cy="515" r="60" fill="#FB9201" />
      <circle cx="515" cy="515" r="60" fill="#FB9201" />
      <circle cx="698" cy="515" r="60" fill="#FB9201" />
      <path fill="#1B1D20" d="M949 194h144v250h241V194h144v850h-144V576h-241v468H949V194Z" />
    </svg>
  );
}

/** Wide OH mark for dark backgrounds (transparent). */
export function OrithosBrandMarkDark({ className, title }: MarkProps) {
  const a11y = title ? ICON_TITLE : ICON_DECOR;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1557 1044"
      fill="none"
      className={cn("oh-brand-mark-img", className)}
      width={48}
      height={32}
      role={a11y.role}
      aria-hidden={a11y["aria-hidden"]}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="#FFFFFF"
        fillRule="evenodd"
        d="M507 80a436 436 0 1 0 0 872 436 436 0 0 0 0-872Zm0 108a328 328 0 1 1 0 656 328 328 0 0 1 0-656Z"
        clipRule="evenodd"
      />
      <path
        fill="#FB9201"
        d="M579 158C782 185 933 338 933 516C933 757 744 952 511 952C374 952 246 884 169 767C251 837 386 871 507 871C688 871 835 712 835 516C835 352 738 214 579 158Z"
      />
      <circle cx="332" cy="515" r="60" fill="#FB9201" />
      <circle cx="515" cy="515" r="60" fill="#FB9201" />
      <circle cx="698" cy="515" r="60" fill="#FB9201" />
      <path fill="#FFFFFF" d="M949 194h144v250h241V194h144v850h-144V576h-241v468H949V194Z" />
    </svg>
  );
}
