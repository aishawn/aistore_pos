/**
 * Temporary admin-page scaffold used by routes that are not yet fully cloned.
 * Renders inside the AppShell content region with a standard page title bar so
 * navigation from the drawer lands on a consistent, styled page. Each of these
 * is progressively replaced by its pixel-perfect clone.
 */
export function PageScaffold({ title }: { title: string }) {
  return (
    <div className="h-full overflow-auto bg-[var(--oh-surface)] font-sans">
      <div className="flex h-[60px] items-center border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-6">
        <h1 className="text-[22px] font-medium text-[var(--oh-text)]">{title}</h1>
      </div>
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <p className="text-[16px] text-[var(--sf-placeholder)]">
          The <span className="font-semibold text-[var(--oh-text)]">{title}</span> page is part of the
          Orithos clone and is being built.
        </p>
      </div>
    </div>
  );
}
