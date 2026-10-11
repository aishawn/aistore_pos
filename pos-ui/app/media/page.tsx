import {
  AdminPageLayout,
  AdminPrimaryButton,
  AdminNavyButton,
} from "@/components/admin/AdminPageLayout";
import {
  UploadCloudIcon, FolderPlusIcon, FolderOpenIcon, FolderIcon, ChevronRightIcon,
  RefreshIcon, SortIcon, SelectChevronIcon, FolderUpIcon, FileImageIcon, EditIcon, DeleteIcon,
} from "@/components/icons";

export default function MediaCentrePage() {
  return (
    <AdminPageLayout title="Media Centre" subtitle="Upload and manage product images and files" fullBleed>
      <div className="flex min-h-[calc(100vh-12rem)] overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white">
        {/* Left sidebar */}
        <aside className="flex w-[240px] flex-col border-r border-[var(--oh-border)] bg-[var(--oh-surface)]">
          <AdminPrimaryButton className="rounded-none py-3">
            <UploadCloudIcon size={18} /> Upload
          </AdminPrimaryButton>
          <AdminNavyButton className="rounded-none py-2.5">
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
        <section className="flex flex-1 flex-col">
          <div className="flex items-center border-b border-[var(--oh-border)] px-5 py-3">
            <span className="text-[13px] text-[var(--oh-muted)]">/ Home</span>
            <div className="ml-auto flex items-center gap-3">
              <RefreshIcon size={18} className="cursor-pointer text-[var(--oh-muted)]" />
              <SortIcon size={18} className="cursor-pointer text-[var(--oh-muted)]" />
              <span className="flex items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 py-1.5 text-[13px] text-[var(--oh-text)]">
                Created At <SelectChevronIcon size={14} />
              </span>
            </div>
          </div>
          <div className="px-5 py-3">
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
        <aside className="flex w-[280px] flex-col border-l border-[var(--oh-border)] bg-[var(--oh-surface)]">
          <div className="flex items-center justify-end gap-4 border-b border-[var(--oh-border)] px-5 py-3 text-[13px] text-[var(--oh-muted)]">
            <span className="flex items-center gap-1"><EditIcon size={14} /> Rename</span>
            <span className="flex items-center gap-1"><DeleteIcon size={14} /> Delete</span>
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
