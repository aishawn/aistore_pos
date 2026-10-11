import { ViewIcon, EditIcon, DeleteIcon, CloneIcon } from "@/components/icons";

/**
 * Inline Edit / Delete (and optional View) action links used in list rows.
 * Pass onEdit/onDelete/onView to make them functional buttons; without handlers
 * they render as plain (visual) spans.
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
  const Item = ({ onClick, className, children }: { onClick?: () => void; className: string; children: React.ReactNode }) =>
    onClick ? (
      <button type="button" onClick={onClick} className={className}>
        {children}
      </button>
    ) : (
      <span className={className}>{children}</span>
    );

  return (
    <div className={`flex items-center gap-6 text-[16px] font-semibold ${justify === "center" ? "justify-center" : "justify-end"}`}>
      {view && (
        <Item onClick={onView} className="flex items-center gap-1.5 text-[var(--sf-tab-blue)]">
          <ViewIcon size={18} /> View
        </Item>
      )}
      <Item onClick={onEdit} className="flex items-center gap-1.5 text-[#3cb44b]">
        <EditIcon size={18} /> Edit
      </Item>
      {clone && (
        <Item onClick={onClone} className="flex items-center gap-1.5 text-[var(--sf-tab-blue)]">
          <CloneIcon size={18} /> Clone
        </Item>
      )}
      <Item onClick={onDelete} className="flex items-center gap-1.5 text-[#e2231a]">
        <DeleteIcon size={18} /> Delete
      </Item>
    </div>
  );
}
