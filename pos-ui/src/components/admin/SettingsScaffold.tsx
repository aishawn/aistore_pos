import Link from "next/link";
import { EditIcon, HelpIcon, SelectChevronIcon, SaveIcon, SettingsGearIcon } from "@/components/icons";

const STAMP = "Updated 18/06/2026 22:27:25";
const FIELD_WIDTH = "w-full max-w-md";
const FIELD_WIDTH_NARROW = "w-full max-w-[220px]";

export interface SettingsTab {
  label: string;
  href?: string;
  active?: boolean;
}

function SettingLabel({
  label,
  description,
  showHelp = true,
}: {
  label: string;
  description?: string;
  showHelp?: boolean;
}) {
  return (
    <div>
      <span className="flex items-center gap-2 text-[16px] font-semibold text-black">
        {label}
        {showHelp && <HelpIcon size={16} className="text-neutral-400" />}
      </span>
      {description && <p className="mt-1 max-w-3xl text-[14px] leading-snug text-neutral-500">{description}</p>}
    </div>
  );
}

function ToggleSwitch({ on }: { on: boolean }) {
  return (
    <span
      className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 ${on ? "justify-end bg-[#3aa0e3]" : "bg-neutral-300"}`}
    >
      <span className="h-5 w-5 rounded-full bg-white" />
    </span>
  );
}

/** A toggle setting row with label, help icon, and an "Updated" timestamp. */
export function ToggleRow({
  label,
  on = false,
  description,
  statusLabel,
}: {
  label: string;
  on?: boolean;
  description?: string;
  statusLabel?: string;
}) {
  if (description) {
    return (
      <div className="border-b border-neutral-100 py-4 last:border-b-0">
        <SettingLabel label={label} description={description} />
        <div className="mt-3 flex items-center gap-3">
          <ToggleSwitch on={on} />
          {statusLabel && <span className="text-[14px] text-neutral-600">{statusLabel}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-3">
      <span className="flex items-center gap-3 text-[18px] text-black">
        <ToggleSwitch on={on} />
        {label} <HelpIcon size={16} className="text-neutral-400" />
      </span>
      <span className="text-[14px] text-neutral-400">{STAMP}</span>
    </div>
  );
}

/** A select setting row with label, help icon, timestamp and a value box. */
export function SelectRow({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  if (description) {
    return (
      <div className="border-b border-neutral-100 py-4 last:border-b-0">
        <SettingLabel label={label} description={description} />
        <span
          className={`mt-3 flex h-[52px] items-center justify-between rounded-lg border border-neutral-300 px-4 text-[16px] text-black ${FIELD_WIDTH}`}
        >
          {value} <SelectChevronIcon size={18} className="text-neutral-500" />
        </span>
      </div>
    );
  }

  return (
    <div className="py-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[16px] text-black">{label} <HelpIcon size={16} className="text-neutral-400" /></span>
        <span className="text-[14px] text-neutral-400">{STAMP}</span>
      </div>
      <span className={`mt-1 flex h-[52px] items-center justify-between rounded-lg border border-neutral-300 px-4 text-[16px] text-black ${FIELD_WIDTH}`}>
        {value} <SelectChevronIcon size={18} className="text-neutral-500" />
      </span>
    </div>
  );
}

/** A text input setting row. */
export function TextRow({
  label,
  value = "",
  description,
}: {
  label: string;
  value?: string;
  description?: string;
}) {
  if (description) {
    return (
      <div className="border-b border-neutral-100 py-4 last:border-b-0">
        <SettingLabel label={label} description={description} />
        <input
          defaultValue={value}
          className={`mt-3 h-[52px] rounded-lg border border-neutral-300 px-4 text-[16px] text-black outline-none focus:border-[#5cb3e0] ${FIELD_WIDTH}`}
        />
      </div>
    );
  }

  return (
    <div className="py-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[16px] text-black">{label} <HelpIcon size={16} className="text-neutral-400" /></span>
        <span className="text-[14px] text-neutral-400">{STAMP}</span>
      </div>
      <input
        defaultValue={value}
        className={`mt-1 h-[52px] rounded-lg border border-neutral-300 px-4 text-[16px] text-black outline-none focus:border-[#5cb3e0] ${FIELD_WIDTH}`}
      />
    </div>
  );
}

/** A numeric input setting row. */
export function NumberRow({
  label,
  value,
  description,
}: {
  label: string;
  value: number | string;
  description?: string;
}) {
  if (description) {
    return (
      <div className="border-b border-neutral-100 py-4 last:border-b-0">
        <SettingLabel label={label} description={description} />
        <input
          type="number"
          defaultValue={value}
          className={`mt-3 h-[52px] rounded-lg border border-neutral-300 px-4 text-[16px] text-black outline-none focus:border-[#5cb3e0] ${FIELD_WIDTH_NARROW}`}
        />
      </div>
    );
  }

  return (
    <div className="py-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[16px] text-black">{label} <HelpIcon size={16} className="text-neutral-400" /></span>
        <span className="text-[14px] text-neutral-400">{STAMP}</span>
      </div>
      <input
        type="number"
        defaultValue={value}
        className={`mt-1 h-[52px] rounded-lg border border-neutral-300 px-4 text-[16px] text-black outline-none focus:border-[#5cb3e0] ${FIELD_WIDTH_NARROW}`}
      />
    </div>
  );
}

/** An action row for editing predefined reason lists. */
export function EditReasonsRow({ label }: { label: string }) {
  return (
    <div className="py-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[16px] text-black">{label} <HelpIcon size={16} className="text-neutral-400" /></span>
        <span className="text-[14px] text-neutral-400">{STAMP}</span>
      </div>
      <button
        type="button"
        className={`mt-1 flex h-[52px] items-center justify-center gap-2 rounded-lg border border-[#5cb3e0] text-[16px] font-semibold text-[var(--sf-tab-blue)] ${FIELD_WIDTH}`}
      >
        <EditIcon size={18} /> Edit Reasons
      </button>
    </div>
  );
}

/**
 * Full-width settings card with title, search, optional tabs, content rows, and a
 * blue Save bar. Mirrors the General Settings layout used across Setup.
 */
export function SettingsScaffold({
  title,
  sectionTitle,
  sectionIcon,
  subSectionTitle = "General",
  showSubSectionTitle = true,
  showSave = true,
  tabs,
  subTabs,
  children,
}: {
  title: string;
  sectionTitle?: string;
  sectionIcon?: React.ReactNode;
  subSectionTitle?: string;
  showSubSectionTitle?: boolean;
  showSave?: boolean;
  tabs?: SettingsTab[];
  subTabs?: SettingsTab[];
  children: React.ReactNode;
}) {
  const resolvedSection =
    sectionTitle && sectionTitle.trim().toLowerCase() !== title.trim().toLowerCase()
      ? sectionTitle
      : undefined;

  return (
    <div className="h-full overflow-auto bg-[var(--oh-surface)] p-6 font-sans">
      <div className="w-full">
        <h1 className="mb-4 text-[34px] font-bold text-[var(--oh-text)]">{title}</h1>
        <div className="flex flex-col overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white">
          <div className="p-4">
            <input
              placeholder="Search settings..."
              className="h-[48px] w-full max-w-md rounded-lg border border-[var(--oh-border)] px-4 text-[16px] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/20"
            />
          </div>
          {tabs && tabs.length > 0 && (
            <div className="flex border-b border-[var(--oh-border)]">
              {tabs.map((t) => {
                const className = `flex flex-1 items-center justify-center gap-2 py-3 text-[16px] ${
                  t.active ? "border-b-2 border-[var(--oh-primary)] text-[var(--oh-primary)]" : "text-[var(--oh-text)]"
                }`;
                return t.href ? (
                  <Link key={t.label} href={t.href} className={className}>
                    {t.label}
                  </Link>
                ) : (
                  <span key={t.label} className={className}>
                    {t.label}
                  </span>
                );
              })}
            </div>
          )}
          {subTabs && subTabs.length > 0 && (
            <div className="flex flex-wrap gap-1 border-b border-[var(--oh-border)] px-4 py-2">
              {subTabs.map((t) => {
                const className = `rounded-md px-3 py-1.5 text-[14px] ${
                  t.active
                    ? "bg-[var(--oh-tile-blue-bg)] font-medium text-[var(--oh-primary)]"
                    : "text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)]"
                }`;
                return t.href ? (
                  <Link key={t.label} href={t.href} className={className}>
                    {t.label}
                  </Link>
                ) : (
                  <span key={t.label} className={className}>
                    {t.label}
                  </span>
                );
              })}
            </div>
          )}
          <div className="px-6 py-5">
            {resolvedSection && (
              <h2 className="mb-3 flex items-center gap-2 text-[24px] font-bold text-[var(--oh-text)]">
                {sectionIcon}
                {resolvedSection}
              </h2>
            )}
            {showSubSectionTitle && subSectionTitle && (
              <h3 className="mb-1 flex items-center gap-2 text-[18px] font-bold text-[var(--oh-text)]">
                <SettingsGearIcon size={18} /> {subSectionTitle}
              </h3>
            )}
            {children}
          </div>
          {showSave && (
            <div className="flex justify-end border-t border-[var(--oh-border)] px-6 py-4">
              <button
                type="button"
                className="inline-flex min-h-11 min-w-[160px] items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-8 py-3 text-[18px] font-medium text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
              >
                <SaveIcon size={20} /> Save
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
