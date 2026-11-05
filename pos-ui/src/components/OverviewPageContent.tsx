"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  BarChart3,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  Flag,
  Lightbulb,
  Link2,
  ListChecks,
  Package,
  ShoppingBag,
  Settings,
  Sparkles,
  Users,
  RefreshCw,
} from "lucide-react";
import { AssistantComposer } from "./AssistantComposer";
import { fetchAiClientConfig } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { OverviewHeader } from "./OverviewHeader";
import { OverviewStorePulse } from "./OverviewStorePulse";
import { RadialPie } from "./RadialPie";
import { money, useOverview } from "./useOverview";
import { useAiAssistant } from "@/lib/ai-assistant";
import type { SidebarGroupItem, SidebarSubGroup } from "@/lib/sidebar-navigation";
import { DashboardIntroAnimation } from "./AiTransitionOverlay";

const modules = [
  {
    label: "Sell",
    href: "/",
    icon: ShoppingBag,
    description: "Ready for your next customer.",
    color: "orange",
    artwork: "sell",
  },
  {
    label: "Stock",
    href: "/products",
    icon: Package,
    description: "Everything on your shelves.",
    color: "green",
    artwork: "stock",
  },
  {
    label: "Customers",
    href: "/customers",
    icon: Users,
    description: "Make every visit more personal.",
    color: "teal",
    artwork: "customers",
  },
  {
    label: "Orithos AI",
    href: "/assistant",
    icon: Sparkles,
    description: "A little help. More possibilities.",
    color: "pink",
    artwork: "ai",
  },
  {
    label: "Reports",
    href: "/reports/dashboard",
    icon: BarChart3,
    description: "A clearer view of your business.",
    color: "blue",
    artwork: "insights",
  },
  {
    label: "Setup",
    href: "/settings/company/general",
    icon: Settings,
    description: "Configure your store and team.",
    color: "purple",
    artwork: "purchasing",
  },
];

export function OverviewPageContent({
  active,
}: {
  active: "radial" | "workspace";
}) {
  const { transitionState, startAssistantTransition, finishAssistantTransition, transitionSource } = useAiAssistant();
  const {
    data,
    loading,
    error,
    connection,
    authExpired,
    parked,
    load,
    navigation,
    destinations,
  } = useOverview();
  const [demoSandbox, setDemoSandbox] = useState(false);
  useEffect(() => {
    setDemoSandbox(window.location.hostname === "demo.orithos.com.au");
  }, []);
  const { hasPermission } = useAuth();
  const openAssistant = (source: "center" | "ai-bar", element?: HTMLElement, question?: string) => {
    if (transitionState !== "idle") return;
    const rect = element?.getBoundingClientRect();
    startAssistantTransition(source, rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined, question);
  };
  useEffect(() => {
    if (active !== "radial" || transitionState !== "leaving") return;
    const timer = window.setTimeout(() => {
      const selector = transitionSource === "ai-bar" ? '.ov-ai-bar input[aria-label="Ask Orithos AI"]' : ".ov-ring-center";
      document.querySelector<HTMLElement>(selector)?.focus();
      finishAssistantTransition();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [active, finishAssistantTransition, transitionSource, transitionState]);
  const allowed = new Set<string>(
    navigation.flatMap<string>((entry) => {
      if (!("items" in entry)) return [entry.href];
      return entry.items.flatMap<string>((child: SidebarGroupItem | SidebarSubGroup) =>
        "items" in child ? child.items.map<string>((item) => item.href) : [child.href],
      );
    }),
  );
  const canReport = allowed.has("/reports/dashboard");
  const visible = modules.filter((item) => allowed.has(item.href));
  // Keep the radial command centre to five permission-filtered primary
  // destinations. Secondary Stock workflows remain inside the Stock module.
  const radialDestinations = (() => {
    const byId = new Map(destinations.map((item) => [item.id, item]));
    const direct = ["sell", "stock", "customers", "reports", "setup"]
      .map((id) => byId.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    return direct.map((item) => ({
      ...item,
      children: undefined,
      description: undefined,
      tone: item.id === "sell" || item.id === "reports" ? { ...item.tone, iconFg: "#f76b19", accent: "#f76b19" } : item.tone,
    }));
  })();
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
  const insights = [
    ...(hasPermission("stock.replenishment") && allowed.has("/purchases") ? [{ title: "Low stock items", description: data?.lowStockCount !== undefined ? `${data.lowStockCount} products are running low.` : "Review products that need restocking.", href: "/purchases?tab=replenishment", tone: "orange" }] : []),
    ...(parked
      ? [{
          title: `${parked} parked sale${parked === 1 ? "" : "s"}`,
          description: "Saved on this device and ready to continue.",
          href: "/",
          tone: "orange",
        }]
      : []),
    ...(canReport
      ? [{
          title: "Sales trend",
          description: data?.revenue === 0 ? "No sales today." : "Review your latest store activity.",
          href: "/reports/dashboard",
          tone: "blue",
        }]
      : []),
    ...(allowed.has("/customers") ? [{ title: "New customers", description: data?.newCustomers ? `${data.newCustomers} new customers this period.` : "Be ready when customers arrive.", href: "/customers", tone: "green" }] : []),
    ...(!parked && !canReport && allowed.has("/settings/integrations")
      ? [{
          title: "Connect your store",
          description: "Keep your dashboard data up to date.",
          href: "/settings/integrations",
          tone: "green",
        }]
      : []),
  ];
  return (
    <div className={`ov-page ov-${active}`}>
      <div className="ov-container">
        <OverviewHeader
          active={active}
          company={data?.company || "Your store"}
        />
        {error ? (
          <section role="alert" className="ov-error">
            <div>
              <h2>
                {authExpired
                  ? "Your session needs attention"
                  : connection
                  ? "Connect your store"
                  : "Dashboard could not refresh"}
              </h2>
              <p>
                {error}
                {data ? " Showing your last loaded summary." : ""}
              </p>
            </div>
            <button onClick={() => void load(true)} disabled={loading}>
              <RefreshCw size={16} /> Retry
            </button>
            {authExpired ? (
              <Link href={`/login?next=${encodeURIComponent(typeof window === "undefined" ? "/overview" : `${window.location.pathname}${window.location.search}`)}`}>
                Sign in again
              </Link>
            ) : connection && allowed.has("/settings/integrations") ? (
              <Link href="/settings/integrations">Connect Orithos</Link>
            ) : null}
          </section>
        ) : null}
        {active === "workspace" ? (
          <>
            {data ? <section className="ov-summary" aria-label="Today">
              <span className="ov-summary-art" aria-hidden="true" />
              <div className="ov-summary-intro">
                <span className="ov-summary-icon" aria-hidden="true"><BadgeCheck size={27} strokeWidth={1.8} /></span>
                <div>
                  <span className="ov-eyebrow">TODAY</span>
                    {data.cacheStatus === "STALE" && <p role="status">Updating your summary. Showing the last prepared data.</p>}
                  <h2>Your store in focus.</h2>
                  {data.queryThrough && <p className="text-xs text-[var(--oh-muted)]">As of {new Intl.DateTimeFormat("en-AU", { timeZone: data.timezone, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(data.queryThrough.includes("T") ? data.queryThrough : data.queryThrough.replace(" ", "T") + "Z"))}</p>}
                </div>
              </div>
              <dl>
                <div>
                  <dt>Sales</dt>
                  <dd>{money(data.revenue, data.currency)}</dd>
                </div>
                <div>
                  <dt>Transactions</dt>
                  <dd>{data.transactions ?? "—"}</dd>
                </div>
                <div>
                  <dt>Open registers · Orithos</dt>
                  <dd>{data.openRegisters ?? "—"}</dd>
                </div>
              </dl>
              {data.shopfrontReportsMode === "source" && <p role="status" className="mt-2 text-xs text-[var(--oh-muted)]">
                {data.todayShopfrontSalesAvailable
                  ? `Sales and transactions from Shopfront · ${data.todaySalesReconciliation === "matched" ? "matches Orithos" : data.todaySalesReconciliation === "mismatch" ? "differs from Orithos" : "Orithos comparison unavailable"}${data.todaySourceFetchedAt ? ` · ${new Intl.DateTimeFormat("en-AU", { timeZone: data.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(data.todaySourceFetchedAt))}` : ""}`
                  : "Shopfront sales report unavailable · showing Orithos totals"}
              </p>}
              {canReport ? (
                <Link className="ov-report-link" href="/reports/dashboard">
                  View insights <ArrowRight size={16} aria-hidden="true" />
                </Link>
              ) : null}
            </section> : (
              <section className="ov-summary" aria-busy="true" aria-label="Loading store summary">
                <div className="ov-summary-intro">
                  <span className="ov-eyebrow">TODAY</span>
                  <h2>Loading your store summary.</h2>
                </div>
              </section>
            )}
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
                    <span className="ov-module-art" style={{ backgroundImage: `url(/images/workspace/${item.artwork}.webp)` }} aria-hidden="true" />
                    <div className="ov-module-top">
                      <span className="ov-icon">
                        <item.icon size={24} strokeWidth={1.7} />
                      </span>
                      <span className="ov-card-arrow" aria-hidden="true"><ArrowRight size={19} /></span>
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
                  <ListChecks size={20} aria-hidden="true" />
                  <h2>Next steps</h2>
                </div>
                <div className="ov-actions">
                  {actions.map((action) => (
                    <Link key={action.href} href={action.href}>
                      <span className={`ov-action-icon ${action.href === "/" ? "ov-action-sell" : "ov-action-connections"}`} aria-hidden="true">
                        {action.href === "/" ? <Flag size={25} strokeWidth={1.7} /> : <Link2 size={25} strokeWidth={1.7} />}
                      </span>
                      <div>
                        <h3>{action.title}</h3>
                        <p>{action.description}</p>
                      </div>
                      <ChevronRight size={18} aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
        {active === "radial" ? (
          <>
            <DashboardIntroAnimation />
            <div className="ov-radial-dashboard">
              <div className="ov-radial-main">
                <div className="ov-radial-area">
                  <RadialPie
                    destinations={radialDestinations}
                    centerTitle="Orithos AI"
                    centerCaption="Orithos AI"
                    centerHref={allowed.has("/assistant") ? "/assistant" : undefined}
                    onCenterClick={(event) => {
                      event.preventDefault();
                      openAssistant("center", event.currentTarget);
                    }}
                    variant="page"
                  />
                </div>
              </div>
              <aside className="ov-radial-side" aria-label="Store summary">
                {data ? <OverviewStorePulse data={data} loading={loading} canReport={canReport} onRefresh={() => void load(true)} sandboxNote={demoSandbox} /> : loading ? (
                  <section className="ov-pulse-panel ov-pulse-loading" aria-busy="true" aria-label="Loading store pulse">
                    <div className="ov-pulse-heading">
                      <div>
                        <div className="ov-pulse-title"><BarChart3 size={18} aria-hidden="true" /><h2>Store pulse</h2></div>
                        <p className="ov-pulse-updated" role="status">Preparing your latest store numbers</p>
                      </div>
                      <span className="ov-skeleton ov-pulse-refresh-skeleton" aria-hidden="true" />
                    </div>
                    <div className="ov-pulse-loading-stats" aria-hidden="true">
                      {[0, 1, 2].map((item) => <div key={item}><span className="ov-skeleton" /><span className="ov-skeleton" /><span className="ov-skeleton" /></div>)}
                    </div>
                  </section>
                ) : <section className="ov-pulse-panel" aria-label="Store pulse unavailable"><div className="ov-pulse-title"><BarChart3 size={18} aria-hidden="true" /><h2>Store pulse</h2></div><p className="ov-pulse-pending" role="status">Store numbers are unavailable. Retry loading the dashboard.</p></section>}
                <section className="ov-insights-panel">
                  <div className="ov-panel-heading">
                    <span className="ov-panel-icon ov-panel-icon-green"><Lightbulb size={18} /></span>
                    <h2>Quick insights</h2>
                    {insights.length ? <span className="ov-panel-period">{insights.length} ready</span> : null}
                  </div>
                  {loading && !data ? <div className="ov-insights-loading" aria-busy="true" aria-label="Loading quick insights">{[0, 1].map((item) => <div key={item}><span className="ov-skeleton" /><span><i className="ov-skeleton" /><i className="ov-skeleton" /></span></div>)}</div> : !data && error ? <p className="ov-pulse-pending" role="status">Insights will appear when store data is available.</p> : insights.length ? <ul>{insights.map((insight) => <li key={insight.href} className={`ov-insight-${insight.tone}`}><Link href={insight.href}><span className="ov-insight-bullet"><ArrowUpRight size={15} /></span><span><strong>{insight.title}</strong><small>{insight.description}</small></span><ArrowRight size={16} /></Link></li>)}</ul> : <div className="ov-insights-empty"><CheckCircle2 size={18} /><span>No new insights yet.</span></div>}
                </section>
              </aside>
            </div>
            <DashboardAiBar disabled={transitionState !== "idle"} onSend={(question, element) => openAssistant("ai-bar", element, question)} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function DashboardAiBar({ onSend, disabled }: { onSend: (question: string, element?: HTMLElement) => void; disabled: boolean }) {
  const [input, setInput] = useState("");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [voiceAvailable, setVoiceAvailable] = useState<boolean | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const { hasPermission } = useAuth();
  useEffect(() => {
    let cancelled = false;
    void fetchAiClientConfig().then(config => {
      if (cancelled) return;
      setAvailable(config.assistantAvailable ?? config.enabled);
      setVoiceAvailable(config.transcriptionAvailable === true);
    }).catch(() => { if (!cancelled) setVoiceAvailable(false); });
    return () => { cancelled = true; };
  }, []);
  if (!hasPermission("ai.assistant")) return null;
  return (
    <div ref={bar} className="ov-ai-bar ov-ai-composer ov-ai-mobile-dock">
      <AssistantComposer value={input} onChange={setInput} disabled={disabled || available === false} voiceAvailable={voiceAvailable} placeholder={available === false ? "AI chat is off for this store" : "Ask Orithos anything about your store..."} onSend={question => onSend(question, bar.current ?? undefined)} />
    </div>
  );
}
