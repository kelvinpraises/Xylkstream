import { Shield } from "lucide-react";
import { Switch } from "@/components/atoms/switch";
import { cn } from "@/utils";

interface PrivacyToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

export function PrivacyToggle({ enabled, onToggle, disabled }: PrivacyToggleProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <Switch
          id="privacy-toggle"
          checked={enabled}
          onCheckedChange={onToggle}
          disabled={disabled}
          className={cn(
            "transition-all duration-300",
            enabled && "data-[state=checked]:bg-amber-500/80 shadow-[0_0_12px_-2px_rgba(251,191,36,0.5)]",
          )}
        />
        <label
          htmlFor="privacy-toggle"
          className={cn(
            "flex items-center gap-1.5 text-sm cursor-pointer select-none transition-colors duration-300",
            disabled && "cursor-not-allowed opacity-50",
            enabled ? "text-amber-300" : "text-muted-foreground",
          )}
        >
          <Shield
            className={cn(
              "w-3.5 h-3.5 transition-all duration-300",
              enabled ? "text-amber-400 fill-amber-400/20" : "text-muted-foreground",
            )}
          />
          private
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground pl-[52px] leading-relaxed">
        {enabled
          ? "sends from your stealth wallet via privacy pool"
          : "sends from your main wallet"}
      </p>
    </div>
  );
}
