"use client";

import { useAuth } from "@/lib/auth";
import { MessageCircle } from "lucide-react";
import { useAiAssistant } from "@/lib/ai-assistant";
import { OverviewAccountControl } from "@/components/OverviewAccountControl";
import { OverviewLayoutSwitcher } from "@/components/OverviewLayoutSwitcher";

export function OverviewHeader({
  greeting,
  company,
  active,
}: {
  greeting: string;
  company: string;
  active: "radial" | "workspace";
}) {
  const { setExpanded } = useAiAssistant();
  const { hasPermission } = useAuth();
  return (
    <header className="ov-header">
      <div className="min-w-0">
        <p className="ov-eyebrow">{greeting}</p>
        <h1>
          {active === "workspace"
            ? "Your store, at a glance."
            : "Your store. One place."}
        </h1>
        <p className="ov-company">{company}</p>
      </div>
      <div className="ov-toolbar">
        <OverviewLayoutSwitcher active={active} />
        <OverviewAccountControl />
        {hasPermission("ai.assistant") ? (
          <button
            type="button"
            className="ov-ai-trigger"
            aria-label="Open Orithos AI assistant"
            onClick={() => setExpanded(true)}
          >
            <MessageCircle size={21} />
          </button>
        ) : null}
      </div>
    </header>
  );
}
