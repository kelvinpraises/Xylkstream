import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/dialog";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { Textarea } from "@/components/textarea";
import type { ClaimPage } from "@/hooks/use-claim-pages";

interface ClaimPageEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page?: ClaimPage | null;
  onSave: (data: { title: string; subtitle: string; logo?: string }) => void;
}

export function ClaimPageEditor({ open, onOpenChange, page, onSave }: ClaimPageEditorProps) {
  const [title, setTitle] = useState(page?.title || "");
  const [subtitle, setSubtitle] = useState(page?.subtitle || "");
  const [logo, setLogo] = useState(page?.logo || "");

  const handleSave = () => {
    if (!title.trim()) return;
    
    onSave({
      title: title.trim(),
      subtitle: subtitle.trim(),
      logo: logo.trim() || undefined,
    });

    // Reset form
    setTitle("");
    setSubtitle("");
    setLogo("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{page ? "Edit Claim Page" : "Create Claim Page"}</DialogTitle>
          <DialogDescription>
            Set up a custom page where recipients can view and claim their streams
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">
              Page Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              placeholder="e.g., Acme Corp Salary Streams"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subtitle">
              Subtitle <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Textarea
              id="subtitle"
              placeholder="e.g., Monthly salary streams for team members"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo">
              Logo URL <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="logo"
              type="url"
              placeholder="https://..."
              value={logo}
              onChange={(e) => setLogo(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!title.trim()} className="flex-1">
            {page ? "Save Changes" : "Create Page"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
