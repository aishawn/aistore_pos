import {
  UploadCloudIcon, FolderPlusIcon, FolderOpenIcon, FolderIcon, ChevronRightIcon,
  RefreshIcon, SortIcon, SelectChevronIcon, FolderUpIcon, FileImageIcon, EditIcon, DeleteIcon,
} from "@/components/icons";

export default function MediaCentrePage() {
  return (
    <div className="flex h-full bg-[#f8f8f8] font-sans">
      {/* Left sidebar */}
      <aside className="flex w-[260px] flex-col border-r border-neutral-200">
        <button className="flex items-center justify-center gap-2 bg-[#3cb44b] py-4 text-[20px] font-medium text-white">
          <UploadCloudIcon size={22} /> Upload
        </button>
        <button className="flex items-center justify-center gap-2 bg-[#3aa0e3] py-3 text-[16px] font-medium text-white">
          <FolderPlusIcon size={18} /> New Folder
        </button>
        <nav className="mt-2 flex flex-col gap-1 px-4 text-[18px]">
          <span className="flex items-center gap-2 text-[var(--sf-tab-blue)]">
            <FolderOpenIcon size={18} /> Home
          </span>
          <span className="flex items-center gap-1 text-black">
            <ChevronRightIcon size={16} /> <FolderIcon size={18} /> MDB
          </span>
        </nav>
      </aside>

      {/* Center */}
      <section className="flex flex-1 flex-col">
        <div className="flex items-center px-6 py-3">
          <span className="text-[16px] text-neutral-600">/ Home</span>
          <div className="ml-auto flex items-center gap-4">
            <RefreshIcon size={20} className="text-neutral-600" />
            <SortIcon size={20} className="text-neutral-600" />
            <span className="flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-4 py-2 text-[16px] text-black">
              Created At <SelectChevronIcon size={16} />
            </span>
          </div>
        </div>
        <div className="px-6">
          <input
            placeholder="Search for file in current directory"
            className="h-[52px] w-full rounded-lg bg-neutral-200 px-4 text-[16px] outline-none placeholder:text-neutral-500"
          />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center text-neutral-700">
          <FolderUpIcon size={56} strokeWidth={1.5} />
          <span className="mt-1 text-[20px]">...</span>
          <p className="mt-6 text-[34px] text-neutral-700">No files found</p>
        </div>
      </section>

      {/* Right pane */}
      <aside className="flex w-[320px] flex-col border-l border-neutral-200">
        <div className="flex items-center justify-end gap-6 px-6 py-3 text-[16px] text-neutral-400">
          <span className="flex items-center gap-1"><EditIcon size={16} /> Rename</span>
          <span className="flex items-center gap-1"><DeleteIcon size={16} /> Delete</span>
        </div>
        <div className="flex flex-1 flex-col items-center pt-10 text-neutral-300">
          <FileImageIcon size={90} strokeWidth={1.25} />
          <p className="mt-3 text-[20px] font-semibold">Select a file</p>
        </div>
      </aside>
    </div>
  );
}
