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
    greeting,
    user,
    navigation,
    destinations,
  } = useOverview();
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
  // The radial command centre is a curated view of the same permission-filtered
  // sidebar. Purchasing is a Stock child, so expose it as a direct command
  // while preserving its existing permission gate.
  const radialDestinations = (() => {
    const byId = new Map(destinations.map((item) => [item.id, item]));
    const stock = byId.get("stock");
    const purchasingChild = stock?.children?.find((child) => /purchase/i.test(child.label));
    const direct = ["sell", "stock", "customers", "reports", "setup"]
      .map((id) => byId.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (purchasingChild) {
      direct.splice(Math.min(2, direct.length), 0, {
        ...(stock as NonNullable<typeof stock>),
        id: "purchasing",
        label: "Purchasing",
        href: purchasingChild.href,
        children: undefined,
        icon: "sales",
        tone: { iconBg: "#ede8ff", iconFg: "#7042d5", accent: "#7042d5" },
        hint: purchasingChild.hint || "Orders and suppliers",
        description: "Orders and suppliers",
      });
    }
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
          description: data?.revenue === 0 ? "No sales in the last 7 days." : "Review your latest store activity.",
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
          greeting={`${greeting}${user ? `, ${user.name || user.username}` : ""}`}
          company={data?.company || "Your store"}
        />
        {loading && !data ? (
          <div
            role="status"
            aria-label="Loading dashboard"
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
            <button onClick={() => void load()} disabled={loading}>
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
        {data && active === "workspace" ? (
          <>
            <section className="ov-summary" aria-label="Last 7 days">
              <span className="ov-summary-art" aria-hidden="true" />
              <div className="ov-summary-intro">
                <span className="ov-summary-icon" aria-hidden="true"><BadgeCheck size={27} strokeWidth={1.8} /></span>
                <div>
                  <span className="ov-eyebrow">LAST 7 DAYS</span>
                  <h2>Your store in focus.</h2>
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
                  <dt>Open registers</dt>
                  <dd>{data.openRegisters ?? "—"}</dd>
                </div>
              </dl>
              {canReport ? (
                <Link className="ov-report-link" href="/reports/dashboard">
                  View insights <ArrowRight size={16} aria-hidden="true" />
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
        {data && active === "radial" ? (
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
                <section className="ov-pulse-panel">
                  <div className="ov-panel-heading">
                    <span className="ov-panel-icon"><BarChart3 size={18} /></span>
                    <h2>Store pulse</h2>
                    <span className="ov-panel-period">Last 7 days</span>
                  </div>
                  <dl className="ov-pulse-stats">
                    <div><dt>Sales</dt><dd>{money(data.revenue, data.currency)}</dd></div>
                    <div><dt>Transactions</dt><dd>{data.transactions ?? "—"}</dd></div>
                    <div><dt>Opportunities</dt><dd>{data.opportunities ?? "—"}</dd><span className="ov-stat-note">Needs your attention</span></div>
                  </dl>
                  {canReport ? <Link className="ov-panel-action ov-pulse-banner" href="/reports/dashboard"><Sparkles size={28} /><span><strong>Your next insight starts here</strong><small>Explore your store’s sales and performance.</small></span><ArrowRight size={18} /></Link> : null}
                </section>
                <section className="ov-insights-panel">
                  <div className="ov-panel-heading">
                    <span className="ov-panel-icon ov-panel-icon-green"><Lightbulb size={18} /></span>
                    <h2>Quick insights</h2>
                    {insights.length ? <span className="ov-panel-period">{insights.length} ready</span> : null}
                  </div>
                  {insights.length ? <ul>{insights.map((insight) => <li key={insight.href} className={`ov-insight-${insight.tone}`}><Link href={insight.href}><span className="ov-insight-bullet"><ArrowUpRight size={15} /></span><span><strong>{insight.title}</strong><small>{insight.description}</small></span><ArrowRight size={16} /></Link></li>)}</ul> : <div className="ov-insights-empty"><CheckCircle2 size={18} /><span>No new insights yet.</span></div>}
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
