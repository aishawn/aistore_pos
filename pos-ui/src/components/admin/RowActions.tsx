import { ViewIcon, EditIcon, DeleteIcon, CloneIcon } from "@/components/icons";

function RowActionItem({ onClick, className, children }: { onClick?: () => void; className: string; children: React.ReactNode }) {
  if (!onClick) return null;
  return (
    <button type="button" onClick={onClick} className={`${className} min-h-11 rounded-md px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]`}>
      {children}
    </button>
  );
}

/**
 * Inline Edit / Delete (and optional View) action links used in list rows.
 * An action is rendered only when its handler is provided, so stale visual
 * controls cannot suggest an operation that the page does not support.
 */
export function RowActions({
  view = false,
  clone = false,
  justify = "end",
  onView,
  onEdit,
  onClone,
  onDelete,
}: {
  view?: boolean;
  clone?: boolean;
  justify?: "end" | "center";
  onView?: () => void;
  onEdit?: () => void;
  onClone?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className={`flex items-center gap-6 text-[16px] font-semibold ${justify === "center" ? "justify-center" : "justify-end"}`}>
      {view && onView && (
        <RowActionItem onClick={onView} className="flex items-center gap-1.5 text-[var(--sf-tab-blue)]">
          <ViewIcon size={18} /> View
        </RowActionItem>
      )}
      <RowActionItem onClick={onEdit} className="flex items-center gap-1.5 text-[#3cb44b]">
        <EditIcon size={18} /> Edit
      </RowActionItem>
      {clone && (
        <RowActionItem onClick={onClone} className="flex items-center gap-1.5 text-[var(--sf-tab-blue)]">
          <CloneIcon size={18} /> Clone
        </RowActionItem>
      )}
      <RowActionItem onClick={onDelete} className="flex items-center gap-1.5 text-[#e2231a]">
        <DeleteIcon size={18} /> Delete
      </RowActionItem>
    </div>
  );
}
