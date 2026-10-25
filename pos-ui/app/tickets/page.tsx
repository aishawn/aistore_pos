import { CardHub } from "@/components/admin/CardHub";
import { TagIcon, AwardIcon } from "@/components/icons";

export default function ShelfTicketsPage() {
  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-[var(--oh-surface)] font-sans">
      <div className="w-full max-w-4xl">
        <CardHub
          cards={[
            { title: "Everyday Tickets", description: "Print your everyday price tickets for products", Icon: TagIcon },
            { title: "Promotional Tickets", description: "Print your promotional tickets", Icon: AwardIcon },
          ]}
        />
      </div>
    </div>
  );
}
