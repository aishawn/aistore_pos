import { cn } from "@/lib/utils";

/** Primary navy action button. */
export function AdminPrimaryButton({
  children,
  onClick,
  className,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-[var(--oh-radius)] bg-[var(--oh-primary)] px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Dark navy primary button (Scan Customer style). */
export function AdminNavyButton({
  children,
  onClick,
  className,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-[var(--oh-radius)] bg-[var(--oh-primary)] px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Secondary/outline button. */
export function AdminSecondaryButton({
  children,
  onClick,
  className,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white px-4 py-2.5 text-[14px] font-medium text-[var(--oh-text-secondary)] transition-colors hover:border-[var(--oh-border-strong)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Fixed form actions with space reserved for the floating assistant button. */
export function AdminActionFooter({ children }: { children: React.ReactNode }) {
  return (
    <footer className="flex shrink-0 justify-end border-t border-[var(--oh-border)] bg-white px-4 py-3 sm:px-6">
      <div className="mr-20 flex gap-2">{children}</div>
    </footer>
  );
}

/** Pill action button for toolbars (Manage Cash, Orders). */
export function AdminPillButton({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-full bg-[var(--oh-primary)] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Outline toolbar button (Export, Print). */
export function AdminOutlineButton({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-[var(--oh-radius)] border border-[var(--oh-orange)] px-4 py-2 text-[13px] font-semibold text-[var(--oh-orange)] transition-colors hover:bg-[var(--oh-orange-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Standard Orithos admin page shell.
 */
export function AdminPageLayout({
  title,
  subtitle,
  count,
  countLabel = "Results",
  actions,
  search,
  filters,
  toolbar,
  children,
  fullBleed,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  count?: number;
  countLabel?: string;
  actions?: React.ReactNode;
  search?: React.ReactNode;
  filters?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  fullBleed?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn("h-full overflow-auto bg-[var(--oh-surface)] font-sans print:overflow-visible print:bg-white print:p-0", compact ? "p-4 md:p-5" : "p-5 md:p-6")}>
      <div className={cn("flex flex-wrap items-start justify-between gap-4 print:hidden", compact ? "mb-3" : "mb-5")}>
        <div>
          <h1 className="oh-type-title text-[var(--oh-text)]">{title}</h1>
          {subtitle && <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {count !== undefined && (
            <div className="ml-1 rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white px-4 py-2 text-center shadow-[var(--oh-shadow-card)]">
              <div className="oh-type-kpi leading-none text-[var(--oh-text)]">{count}</div>
              <div className="oh-type-meta font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
                {countLabel}
              </div>
            </div>
          )}
        </div>
      </div>

      {toolbar && (
        <div className="mb-4 flex flex-wrap gap-2">{toolbar}</div>
      )}

      {search && (
        <div className={cn("rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white px-3 shadow-[var(--oh-shadow-card)]", compact ? "mb-2 py-2" : "mb-3 py-2.5")}>
          {search}
        </div>
      )}

      {filters && (
        <div className={cn("rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white px-3 shadow-[var(--oh-shadow-card)]", compact ? "mb-2 py-2" : "mb-3 py-2.5")}>
          {filters}
        </div>
      )}

      {fullBleed ? (
        children
      ) : (
        <div className={cn("rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)] print:border-0 print:p-0 print:shadow-none", compact ? "p-2 md:p-3" : "p-3 md:p-4")}>
          {children}
        </div>
      )}
    </div>
  );
}

/** Standard search input. */
export function AdminSearchInput({
  label = "Search",
  value,
  onChange,
  placeholder,
  onKeyDown,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-[var(--oh-text-secondary)]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] px-2.5 text-[13px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]"
      />
    </label>
  );
}

function AdminRowActionItem({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick?: () => void;
  className: string;
}) {
  return (
    <button type="button" onClick={onClick} className={className}>
      {label}
    </button>
  );
}

/** Standard row action links. */
export function AdminRowActions({
  onView,
  onEdit,
  onDelete,
  view = true,
}: {
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  view?: boolean;
} = {}) {
  return (
    <div className="flex items-center justify-center gap-3 text-[13px] font-medium">
      {view && onView && (
        <AdminRowActionItem
          label="View"
          onClick={onView}
          className="inline-flex min-h-11 items-center cursor-pointer text-[var(--oh-orange)] hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
        />
      )}
      {onEdit && (
        <AdminRowActionItem
          label="Edit"
          onClick={onEdit}
          className="inline-flex min-h-11 items-center cursor-pointer text-[var(--oh-success)] hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
        />
      )}
      {onDelete && (
        <AdminRowActionItem
          label="Delete"
          onClick={onDelete}
          className="inline-flex min-h-11 items-center cursor-pointer text-[var(--oh-danger)] hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
        />
      )}
    </div>
  );
}

/** Large empty-state hero with icon and optional next-step action. */
export function AdminEmptyHero({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="text-[var(--oh-muted)]">{icon}</div>
      <div>
        <h2 className="text-[18px] font-semibold text-[var(--oh-text)]">{title}</h2>
        <p className="mt-1 max-w-md text-[14px] text-[var(--oh-muted)]">{description}</p>
        {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

/** Stat card for dashboards. */
export function AdminStatCard({
  title,
  value,
  children,
}: {
  title: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-[var(--oh-text)]">{title}</h3>
        {children}
      </div>
      <div className="flex justify-between rounded-lg bg-[var(--oh-surface)] px-3 py-2 text-[14px] text-[var(--oh-text-secondary)]">
        <span>—</span>
        <span className="font-semibold text-[var(--oh-text)]">{value}</span>
      </div>
    </div>
  );
}
