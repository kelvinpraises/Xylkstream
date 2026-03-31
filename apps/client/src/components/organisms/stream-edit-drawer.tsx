import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/molecules/drawer";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/atoms/select";
import { Separator } from "@/components/atoms/separator";
import type { LocalStream } from "@/store/stream-store";

type TimeUnit = "minutes" | "hours" | "days" | "weeks" | "months";

const TIME_MULTIPLIERS: Record<TimeUnit, number> = {
  minutes: 60,
  hours: 3600,
  days: 86400,
  weeks: 604800,
  months: 2592000, // 30 days
};

function toSeconds(value: number, unit: TimeUnit): number {
  return value * TIME_MULTIPLIERS[unit];
}

function bestTimeUnit(seconds: number): { value: number; unit: TimeUnit } {
  if (seconds >= 2592000 && seconds % 2592000 === 0)
    return { value: seconds / 2592000, unit: "months" };
  if (seconds >= 604800 && seconds % 604800 === 0)
    return { value: seconds / 604800, unit: "weeks" };
  if (seconds >= 86400 && seconds % 86400 === 0)
    return { value: seconds / 86400, unit: "days" };
  if (seconds >= 3600 && seconds % 3600 === 0)
    return { value: seconds / 3600, unit: "hours" };
  if (seconds >= 60) return { value: Math.round(seconds / 60), unit: "minutes" };
  return { value: Math.ceil(seconds / 60), unit: "minutes" };
}

interface StreamEditDrawerProps {
  stream: LocalStream | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (params: { newTotalAmount: string; newDurationSeconds: number }) => void;
  isPending?: boolean;
}

export function StreamEditDrawer({
  stream,
  open,
  onOpenChange,
  onSubmit,
  isPending = false,
}: StreamEditDrawerProps) {
  const [amount, setAmount] = useState("");
  const [durationValue, setDurationValue] = useState(1);
  const [durationUnit, setDurationUnit] = useState<TimeUnit>("months");

  // Initialize form when drawer opens
  useEffect(() => {
    if (!open || !stream) return;

    const nowSecs = Math.floor(Date.now() / 1000);
    const isPaused = stream.status === "PAUSED";

    const remainingAmount = isPaused
      ? (stream.pausedRemainingAmount ?? stream.totalAmount)
      : (
          (Math.max(0, stream.endTimestamp - nowSecs) /
            (stream.endTimestamp - stream.startTimestamp)) *
          parseFloat(stream.totalAmount)
        ).toString();

    const remainingSecs = isPaused
      ? (stream.pausedRemainingDuration ?? 0)
      : Math.max(0, stream.endTimestamp - nowSecs);

    setAmount(parseFloat(remainingAmount).toFixed(2));
    const { value, unit } = bestTimeUnit(remainingSecs);
    setDurationValue(value);
    setDurationUnit(unit);
  }, [open, stream]);

  if (!stream) return null;

  const durationSeconds = toSeconds(durationValue, durationUnit);
  const newRate = durationSeconds > 0 ? parseFloat(amount || "0") / (durationSeconds / (86400 * 30)) : 0;

  const handleSubmit = () => {
    if (!amount || parseFloat(amount) <= 0 || durationValue <= 0) return;
    onSubmit({
      newTotalAmount: amount,
      newDurationSeconds: durationSeconds,
    });
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Edit Stream</DrawerTitle>
          <DrawerDescription>Adjust amount or duration</DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-4">
          <div className="max-w-2xl mx-auto space-y-5">
            {/* Amount */}
            <div>
              <Label className="mb-2">
                New Amount
                <span className="text-muted-foreground font-normal ml-1">
                  ({stream.tokenSymbol})
                </span>
              </Label>
              <Input
                type="number"
                placeholder="e.g., 5000"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isPending}
              />
            </div>

            {/* Duration */}
            <div>
              <Label className="mb-2">New Duration</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  value={durationValue}
                  onChange={(e) => setDurationValue(parseInt(e.target.value) || 1)}
                  className="w-20"
                  disabled={isPending}
                />
                <Select
                  value={durationUnit}
                  onValueChange={(v) => setDurationUnit(v as TimeUnit)}
                  disabled={isPending}
                >
                  <SelectTrigger className="w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["minutes", "hours", "days", "weeks", "months"] as TimeUnit[]).map(
                      (unit) => (
                        <SelectItem key={unit} value={unit}>
                          {unit}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">from now</span>
              </div>
            </div>

            <Separator />

            {/* Summary */}
            <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">New Amount</span>
                <span className="font-mono">
                  {amount || "—"} {stream.tokenSymbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">New Rate</span>
                <span className="font-mono">
                  {newRate.toFixed(2)} {stream.tokenSymbol}/mo
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span>
                  {durationValue} {durationUnit}
                </span>
              </div>
            </div>
          </div>
        </div>

        <DrawerFooter>
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={isPending || !amount || parseFloat(amount) <= 0 || durationValue <= 0}
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
