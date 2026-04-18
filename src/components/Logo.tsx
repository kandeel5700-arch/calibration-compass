import logoUrl from "@/assets/uecc-logo.png";
import { cn } from "@/lib/utils";

export function Logo({ className, size = 44 }: { className?: string; size?: number }) {
  return (
    <div
      className={cn("rounded-xl bg-white/95 flex items-center justify-center shadow-luxe ring-1 ring-primary/30 overflow-hidden", className)}
      style={{ width: size, height: size }}
    >
      <img src={logoUrl} alt="UECC" className="w-[85%] h-[85%] object-contain" />
    </div>
  );
}
