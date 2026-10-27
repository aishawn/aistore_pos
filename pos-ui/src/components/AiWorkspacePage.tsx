"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Camera,
  MessageCircle,
  PackageSearch,
  ScanLine,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

type AiTask = {
  href: string;
  icon: typeof MessageCircle;
  title: string;
  description: string;
  permission: string;
};

const customerTasks: AiTask[] = [
  {
    href: "/assistant",
    icon: MessageCircle,
    title: "Ask Orithos AI",
    description:
      "Ask about a sale, stock, customers, reports, or how to use the POS.",
    permission: "ai.assistant",
  },
  {
    href: "/recommend",
    icon: Sparkles,
    title: "Recommend a product",
    description:
      "Match a customer with in-stock wine, grocery, beer, snacks, or soft drinks.",
    permission: "ai.recommend",
  },
  {
    href: "/ai/identify",
    icon: ScanLine,
    title: "Identify a product",
    description:
      "Search any wine, grocery, drink, or household product by name or barcode.",
    permission: "ai.recommend",
  },
  {
    href: "/sommelier/identify",
    icon: Camera,
    title: "Scan a wine label",
    description:
      "Photograph a wine label and match it to this store's catalogue.",
    permission: "ai.sommelier",
  },
];

const storeTasks: AiTask[] = [
  {
    href: "/stock/price-suggestions",
    icon: BarChart3,
    title: "Review price suggestions",
    description:
      "Review data-backed price candidates before applying any change.",
    permission: "ai.price_suggestions",
  },
  {
    href: "/purchases?tab=invoices",
    icon: ScanLine,
    title: "Process supplier invoices",
    description:
      "Capture an invoice, match products, and continue to a purchase or receiving draft.",
    permission: "stock.invoices",
  },
  {
    href: "/stock/replenishment",
    icon: PackageSearch,
    title: "Plan replenishment",
    description:
      "Find low-stock products and prepare the next purchasing decision.",
    permission: "stock.replenishment",
  },
];

export function AiWorkspacePage() {
  const { ready, hasPermission } = useAuth();
  if (!ready)
    return (
      <p role="status" className="p-6 text-sm text-[var(--oh-muted)]">
        Loading AI workspace…
      </p>
    );
  const visibleCustomerTasks = customerTasks.filter((task) =>
    hasPermission(task.permission),
  );
  const visibleStoreTasks = storeTasks.filter((task) =>
    hasPermission(task.permission),
  );

  return (
    <main className="oh-workspace-main min-h-full bg-[var(--oh-surface)] px-4 py-5 text-[var(--oh-text)] sm:px-6 sm:py-7">
      <div className="mx-auto w-full max-w-5xl">
        <header className="max-w-2xl">
          <p className="text-[13px] font-semibold uppercase tracking-[.12em] text-[var(--oh-primary)]">
            Orithos AI
          </p>
          <h1 className="oh-type-title mt-2">Choose a task</h1>
          <p className="mt-2 text-[15px] leading-6 text-[var(--oh-muted)]">
            Start with the customer or store task you need to finish. AI
            suggestions always use this store&apos;s catalogue, stock, and
            permissions.
          </p>
        </header>

        <section aria-labelledby="customer-tasks" className="mt-7">
          <div className="flex items-center gap-2">
            <ShoppingCart
              size={18}
              className="text-[var(--oh-primary)]"
              aria-hidden="true"
            />
            <h2 id="customer-tasks" className="text-[16px] font-semibold">
              Help a customer
            </h2>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {visibleCustomerTasks.map((task) => (
              <TaskCard key={task.href} {...task} />
            ))}
          </div>
        </section>

        <section aria-labelledby="store-tasks" className="mt-8">
          <div className="flex items-center gap-2">
            <PackageSearch
              size={18}
              className="text-[var(--oh-primary)]"
              aria-hidden="true"
            />
            <h2 id="store-tasks" className="text-[16px] font-semibold">
              Run the store
            </h2>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {visibleStoreTasks.map((task) => (
              <TaskCard key={task.href} {...task} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function TaskCard({ href, icon: Icon, title, description }: AiTask) {
  return (
    <Link
      href={href}
      className="group flex min-h-40 flex-col rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 shadow-[var(--oh-shadow-card)] transition hover:-translate-y-0.5 hover:border-[var(--oh-primary)] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--oh-orange-light)] text-[var(--oh-primary)]">
        <Icon size={19} aria-hidden="true" />
      </span>
      <span className="mt-3 text-[15px] font-semibold">{title}</span>
      <span className="mt-1 flex-1 text-[13px] leading-5 text-[var(--oh-muted)]">
        {description}
      </span>
      <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--oh-primary)]">
        Open <ArrowRight size={14} aria-hidden="true" />
      </span>
    </Link>
  );
}
