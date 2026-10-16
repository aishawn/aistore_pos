import {
  AdminPageLayout,
  AdminPrimaryButton,
  AdminNavyButton,
} from "@/components/admin/AdminPageLayout";
import {
  UploadCloudIcon, FolderPlusIcon, FolderOpenIcon, FolderIcon, ChevronRightIcon,
  RefreshIcon, SortIcon, SelectChevronIcon, FolderUpIcon, FileImageIcon, EditIcon, DeleteIcon,
} from "@/components/icons";
import Link from "next/link";
import { Info } from "lucide-react";

export default function MediaCentrePage() {
  return (
    <AdminPageLayout title="Media Centre" subtitle="Upload and manage product images and files" fullBleed>
      <div role="status" className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <Info size={18} className="mt-0.5 shrink-0 text-amber-700" />
        <p className="leading-6">
          Media storage is not connected in this pilot, so uploads and file changes are disabled. Check <Link href="/settings/integrations" className="font-semibold underline">Integrations</Link> for the current connection status.
        </p>
      </div>
      <div className="flex min-h-[calc(100vh-12rem)] flex-col overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white lg:flex-row">
        {/* Left sidebar */}
        <aside className="flex w-full shrink-0 flex-col border-b border-[var(--oh-border)] bg-[var(--oh-surface)] lg:w-[240px] lg:border-b-0 lg:border-r">
          <AdminPrimaryButton disabled className="rounded-none py-3">
            <UploadCloudIcon size={18} /> Upload
          </AdminPrimaryButton>
          <AdminNavyButton disabled className="rounded-none py-2.5">
            <FolderPlusIcon size={16} /> New Folder
          </AdminNavyButton>
          <nav className="mt-2 flex flex-col gap-1 px-4 py-2 text-[14px]">
            <span className="flex items-center gap-2 font-medium text-[var(--oh-orange)]">
              <FolderOpenIcon size={16} /> Home
            </span>
            <span className="flex items-center gap-1 text-[var(--oh-text-secondary)]">
              <ChevronRightIcon size={14} /> <FolderIcon size={16} /> MDB
            </span>
          </nav>
        </aside>

        {/* Center */}
        <section className="flex min-h-[360px] min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-3 border-b border-[var(--oh-border)] px-4 py-3 sm:px-5">
            <span className="text-[13px] text-[var(--oh-muted)]">/ Home</span>
            <div className="ml-auto flex items-center gap-3">
              <span title="Unavailable until media storage is connected" className="text-[var(--oh-muted)]"><RefreshIcon size={18} /></span>
              <span title="Unavailable until media storage is connected" className="text-[var(--oh-muted)]"><SortIcon size={18} /></span>
              <span className="flex items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 py-1.5 text-[13px] text-[var(--oh-text)]">
                Created At <SelectChevronIcon size={14} />
              </span>
            </div>
          </div>
          <div className="px-4 py-3 sm:px-5">
            <input
              placeholder="Search for file in current directory"
              className="h-10 w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 text-[14px] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-orange)]"
            />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center text-[var(--oh-muted)]">
            <FolderUpIcon size={48} strokeWidth={1.5} />
            <p className="mt-4 text-[18px] font-medium text-[var(--oh-text-secondary)]">No files found</p>
          </div>
        </section>

        {/* Right pane */}
        <aside className="flex min-h-[180px] w-full shrink-0 flex-col border-t border-[var(--oh-border)] bg-[var(--oh-surface)] lg:min-h-0 lg:w-[280px] lg:border-t-0 lg:border-l">
          <div className="flex items-center justify-end gap-4 border-b border-[var(--oh-border)] px-5 py-3 text-[13px] text-[var(--oh-muted)]">
            <span title="Unavailable until media storage is connected" className="flex items-center gap-1 text-[var(--oh-muted)]"><EditIcon size={14} /> Rename</span>
            <span title="Unavailable until media storage is connected" className="flex items-center gap-1 text-[var(--oh-muted)]"><DeleteIcon size={14} /> Delete</span>
          </div>
          <div className="flex flex-1 flex-col items-center pt-10 text-[var(--oh-muted)]">
            <FileImageIcon size={72} strokeWidth={1.25} />
            <p className="mt-3 text-[15px] font-medium text-[var(--oh-text-secondary)]">Select a file</p>
          </div>
        </aside>
      </div>
    </AdminPageLayout>
  );
}
