import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { Card } from "@/components/card";
import { Calendar } from "lucide-react";

interface StepScheduleProps {
  startDate: string;
  endDate: string;
  cliffDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onCliffDateChange: (value: string) => void;
  amount: string;
  asset: string;
}

export function StepSchedule({
  startDate,
  endDate,
  cliffDate,
  onStartDateChange,
  onEndDateChange,
  onCliffDateChange,
  amount,
  asset,
}: StepScheduleProps) {
  const calculateRate = () => {
    if (!startDate || !endDate || !amount || parseFloat(amount) === 0) return null;

    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const durationSeconds = (end - start) / 1000;

    if (durationSeconds <= 0) return null;

    const amountNum = parseFloat(amount);
    const perSecond = amountNum / durationSeconds;
    const perMinute = perSecond * 60;
    const perHour = perSecond * 3600;
    const perDay = perSecond * 86400;

    return { perSecond, perMinute, perHour, perDay };
  };

  const rate = calculateRate();
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-2">Schedule</h3>
        <p className="text-sm text-muted-foreground">
          Set the vesting schedule for this stream
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="startDate">
            Start Date <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input
              id="startDate"
              type="datetime-local"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              min={today}
            />
            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="endDate">
            End Date <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input
              id="endDate"
              type="datetime-local"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              min={startDate || today}
            />
            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cliffDate">
            Cliff Date <span className="text-muted-foreground text-xs">(optional)</span>
          </Label>
          <div className="relative">
            <Input
              id="cliffDate"
              type="datetime-local"
              value={cliffDate}
              onChange={(e) => onCliffDateChange(e.target.value)}
              min={startDate || today}
              max={endDate}
            />
            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
          <p className="text-xs text-muted-foreground">
            No tokens will be released until this date
          </p>
        </div>
      </div>

      {rate && (
        <Card className="p-4 bg-muted/50">
          <h4 className="text-sm font-medium mb-3">Stream Rate</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Per Second</span>
              <p className="font-mono">{rate.perSecond.toFixed(6)} {asset}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Per Minute</span>
              <p className="font-mono">{rate.perMinute.toFixed(6)} {asset}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Per Hour</span>
              <p className="font-mono">{rate.perHour.toFixed(4)} {asset}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Per Day</span>
              <p className="font-mono">{rate.perDay.toFixed(2)} {asset}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
