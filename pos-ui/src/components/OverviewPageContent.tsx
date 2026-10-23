"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  Package,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Users,
  RefreshCw,
} from "lucide-react";
import { OverviewHeader } from "./OverviewHeader";
import { RadialPie } from "./RadialPie";
import { money, useOverview } from "./useOverview";

const modules = [
  {
    label: "Sell",
    href: "/",
    icon: ShoppingBag,
    description: "Ready for your next customer.",
    color: "blue",
  },
  {
    label: "Business insights",
    href: "/reports/dashboard",
    icon: BarChart3,
    description: "A clearer view of your business.",
    color: "orange",
  },
  {
    label: "Products & stock",
    href: "/products/odoo",
    icon: Package,
    description: "Everything on your shelves.",
    color: "green",
  },
  {
    label: "Purchasing",
    href: "/purchases/odoo",
    icon: ShoppingCart,
    description: "Keep your store well stocked.",
    color: "purple",
  },
  {
    label: "Customers",
    href: "/customers/odoo",
    icon: Users,
    description: "Make every visit more personal.",
    color: "teal",
  },
  {
    label: "Permissions",
    href: "/settings/roles",
    icon: Shield,
    description: "The right access for your team.",
    color: "gray",
  },
  {
    label: "Orithos AI",
    href: "/assistant",
    icon: Sparkles,
    description: "A little help. More possibilities.",
    color: "pink",
  },
];

export function OverviewPageContent({
  active,
}: {
  active: "radial" | "workspace";
}) {
  const {
    data,
    loading,
    error,
    connection,
    parked,
    load,
    greeting,
    user,
    navigation,
    destinations,
  } = useOverview();
  const allowed = new Set(
    navigation.flatMap((entry) =>
      "items" in entry ? entry.items.map((child) => child.href) : [entry.href],
    ),
  );
  const canReport = allowed.has("/reports/dashboard");
  const visible = modules.filter((item) => allowed.has(item.href));
  const actions = [
    ...(allowed.has("/")
      ? [
          {
            title: parked
              ? `Continue ${parked} parked sale${parked === 1 ? "" : "s"}`
              : "Open point of sale",
            description: parked
              ? "Saved on this device"
              : "Ready for your next customer",
            href: "/",
          },
        ]
      : []),
    ...(allowed.has("/settings/integrations")
      ? [
          {
            title: "Manage connections",
            description: "Your store integrations",
            href: "/settings/integrations",
          },
        ]
      : []),
  ];
  return (
    <div className={`ov-page ov-${active}`}>
      <div className="ov-container">
        <OverviewHeader
          active={active}
          greeting={`${greeting}${user ? `, ${user.name || user.username}` : ""}`}
          company={data?.company || "Your store"}
        />
        {loading && !data ? (
          <div
            role="status"
            aria-label="Loading overview"
            aria-busy="true"
            className="ov-skeleton"
          >
            <div />
            <div />
            <div />
            <span className="sr-only">Preparing your workspace…</span>
          </div>
        ) : null}
        {error ? (
          <section role="alert" className="ov-error">
            <div>
              <h2>
                {connection
                  ? "Connect your store"
                  : "Overview could not refresh"}
              </h2>
              <p>
                {error}
                {data ? " Showing your last loaded summary." : ""}
              </p>
            </div>
            <button onClick={() => void load()} disabled={loading}>
              <RefreshCw size={16} /> Retry
            </button>
            {connection && allowed.has("/settings/integrations") ? (
              <Link href="/settings/integrations">Connect Odoo</Link>
            ) : null}
          </section>
        ) : null}
        {data && active === "workspace" ? (
          <>
            <section className="ov-summary" aria-label="Last 24 hours">
              <div>
                <span className="ov-eyebrow">LAST 24 HOURS</span>
                <h2>Your store in focus.</h2>
              </div>
              <dl>
                <div>
                  <dt>Net sales</dt>
                  <dd>{money(data.revenue, data.currency)}</dd>
                </div>
                <div>
                  <dt>Transactions</dt>
                  <dd>{data.transactions ?? "—"}</dd>
                </div>
                <div>
                  <dt>Open registers</dt>
                  <dd>{data.openRegisters ?? "—"}</dd>
                </div>
              </dl>
              {canReport ? (
                <Link className="ov-report-link" href="/reports/dashboard">
                  View insights <ArrowUpRight size={16} />
                </Link>
              ) : null}
            </section>
            <div className="ov-section-label">
              <h2>Your workspace</h2>
              <span>Everything you need, within reach.</span>
            </div>
            <ul className="ov-modules">
              {visible.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`ov-module ov-tone-${item.color}`}
                  >
                    <div className="ov-module-top">
                      <span className="ov-icon">
                        <item.icon size={24} strokeWidth={1.7} />
                      </span>
                      <ArrowUpRight size={18} className="ov-card-arrow" />
                    </div>
                    <div>
                      <h3>{item.label}</h3>
                      <p>{item.description}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {actions.length ? (
              <section className="ov-briefing" aria-label="Next steps">
                <div className="ov-briefing-title">
                  <Sparkles size={19} />
                  <h2>Next steps</h2>
                </div>
                <div className="ov-actions">
                  {actions.map((action) => (
                    <Link key={action.href} href={action.href}>
                      <div>
                        <h3>{action.title}</h3>
                        <p>{action.description}</p>
                      </div>
                      <ArrowUpRight size={18} />
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
        {data && active === "radial" ? (
          <div className="ov-radial-area">
            <RadialPie
              destinations={destinations}
              centerTitle="Last 24 hours"
              centerCaption={
                data.revenue === 0
                  ? "No sales yet"
                  : money(data.revenue, data.currency)
              }
              centerHint={
                canReport ? "View business insights" : "Store summary"
              }
              centerHref={canReport ? "/reports/dashboard" : undefined}
              variant="page"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
