"use client";

import { useEffect, useId, useLayoutEffect, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { AI_TRANSITION_TIMING, useAiAssistant } from "@/lib/ai-assistant";
import "./ai-transition.css";

/** Shared visual bridge between the Dashboard radial and the full AI page. */
export function AiTransitionOverlay() {
  const pathname = usePathname();
  const { transitionState, transitionSource, transitionOrigin, transitionPhase, transitionError, startAssistantTransition, finishAssistantTransition } = useAiAssistant();

  useEffect(() => {
    if (transitionState === "leaving" && pathname !== "/assistant") {
      finishAssistantTransition();
    }
  }, [finishAssistantTransition, pathname, transitionState]);

  useLayoutEffect(() => {
    if (transitionState !== "entering") return;
    const page = document.querySelector<HTMLElement>(".ov-page");
    page?.classList.add("ov-ai-departing");
    return () => page?.classList.remove("ov-ai-departing");
  }, [transitionState]);

  if (transitionState === "idle") return transitionError ? (
    <div className="ai-transition-error" role="alert">
      <span>{transitionError}</span>
      <button type="button" onClick={() => startAssistantTransition("center")}>Try again</button>
    </div>
  ) : null;
  return (
    <AiTransitionVisual
      className={`ai-transition-${transitionState} ai-transition-source-${transitionSource ?? "center"} ai-transition-phase-${transitionPhase}`}
      style={{
        "--ai-transition-x": transitionOrigin ? `${transitionOrigin.x}px` : undefined,
        "--ai-transition-y": transitionOrigin ? `${transitionOrigin.y}px` : undefined,
        "--ai-transition-core-size": transitionOrigin?.size ? `${transitionOrigin.size}px` : undefined,
        "--ai-transition-duration": `${AI_TRANSITION_TIMING.navigate}ms`,
        "--ai-transition-reveal": `${AI_TRANSITION_TIMING.reveal}ms`,
      } as CSSProperties}
      label={transitionState === "entering" ? "Opening Orithos AI" : "Returning to dashboard"}
    />
  );
}

/** Plays on each Radial mount, including refresh, without navigating away. */
export function DashboardIntroAnimation() {
  useLayoutEffect(() => {
    const container = document.querySelector(".ov-radial .ov-container");
    if (!container || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    container.classList.add("ov-dashboard-reveal");
    const timer = window.setTimeout(() => container.classList.remove("ov-dashboard-reveal"), 1100);
    return () => {
      window.clearTimeout(timer);
      container.classList.remove("ov-dashboard-reveal");
    };
  }, []);
  return null;
}

function AiTransitionVisual({ className, style, label }: { className: string; style?: CSSProperties; label: string }) {
  const glowId = useId();
  const ringId = useId();
  return (
    <div
      className={`ai-transition ${className}`}
      style={style}
      role="status"
      aria-live="polite"
      aria-label={label}
      aria-busy="true"
    >
      <div className="ai-transition-wash" />
      <div className="ai-transition-core" aria-hidden="true">
        <span className="ai-transition-spark">✧</span>
        <div className="ai-transition-caption"><strong>Orithos AI</strong><span>Real-time insights for your store</span></div>
      </div>
      <div className="ai-transition-flare" aria-hidden="true" />
      <div className="ai-transition-light-field" aria-hidden="true" />
      <svg className="ai-transition-orbits" viewBox="0 0 600 600" aria-hidden="true">
        <defs>
          <linearGradient id={ringId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".15" />
            <stop offset=".35" stopColor="#fff7e8" />
            <stop offset=".56" stopColor="#ffba73" />
            <stop offset=".78" stopColor="#fff" />
            <stop offset="1" stopColor="#d3e7fa" stopOpacity=".3" />
          </linearGradient>
          <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle className="ai-transition-orbit ai-transition-orbit-one" cx="300" cy="300" r="118" />
        <circle className="ai-transition-orbit ai-transition-orbit-two" cx="300" cy="300" r="166" />
        <circle className="ai-transition-orbit ai-transition-orbit-three" cx="300" cy="300" r="218" />
        <circle className="ai-transition-orbit ai-transition-orbit-arc" cx="300" cy="300" r="166" stroke={`url(#${ringId})`} filter={`url(#${glowId})`} />
        <g className="ai-transition-particles" filter={`url(#${glowId})`}>
          {["76,215", "180,93", "409,116", "518,280", "436,486", "188,506", "75,373", "315,48", "552,414", "260,550", "140,160", "455,180", "350,490", "110,445", "490,360", "260,120"].map((point, index) => {
            const [cx, cy] = point.split(",");
            return <circle key={point} cx={cx} cy={cy} r={index % 3 === 0 ? "2.8" : "1.5"} />;
          })}
        </g>
      </svg>
    </div>
  );
}
