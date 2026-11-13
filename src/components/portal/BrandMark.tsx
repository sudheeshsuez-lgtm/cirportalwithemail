import emblem from "@/assets/guide-emblem.png";
import { cn } from "@/lib/utils";

export function BrandMark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "grid size-11 place-items-center rounded-xl",
          inverted ? "bg-primary-foreground/10 ring-1 ring-primary-foreground/15" : "bg-card shadow-card ring-1 ring-border",
        )}
      >
        <img src={emblem} alt="" width={816} height={816} className="size-8" />
      </div>
      <div className="leading-tight">
        <div className={cn("font-display text-lg font-semibold", inverted ? "text-primary-foreground" : "text-foreground")}>
          CIR Portal
        </div>
        <div
          className={cn(
            "text-[11px] font-medium uppercase tracking-[0.14em]",
            inverted ? "text-primary-foreground/60" : "text-muted-foreground",
          )}
        >
          International Relations
        </div>
      </div>
    </div>
  );
}
