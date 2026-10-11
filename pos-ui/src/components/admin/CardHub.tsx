import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export interface HubCard {
  title: string;
  description: string;
  Icon: LucideIcon;
  href?: string;
}

/** Grid of bordered icon cards (the "More" hub pattern). */
export function CardHub({ cards }: { cards: HubCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 p-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((c) => {
        const inner = (
          <>
            <c.Icon size={48} strokeWidth={1.5} className="text-neutral-800" />
            <h2 className="mt-6 text-[26px] text-neutral-800">{c.title}</h2>
            <p className="mt-3 text-[16px] text-neutral-600">{c.description}</p>
          </>
        );

        const className =
          "flex flex-col items-center border border-neutral-300 bg-white px-8 py-12 text-center shadow-sm transition-colors hover:border-neutral-400 hover:bg-neutral-50";

        return c.href ? (
          <Link key={c.title} href={c.href} className={className}>
            {inner}
          </Link>
        ) : (
          <div key={c.title} className={className}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
