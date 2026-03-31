import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import { Plus, Users, Copy, Link2, Loader2, CheckCircle2, Share2 } from "lucide-react";
import { Card } from "@/components/molecules/card";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { Badge } from "@/components/atoms/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/molecules/dialog";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { useCircles, useJoinedCircles, useCreateCircle, ApiError } from "@/hooks/use-circles";
import { useCircleCrypto } from "@/hooks/use-circle-crypto";

export const Route = createFileRoute("/circles/")({
  component: CirclesPage,
});

function CirclesPage() {
  const { data: circles, isLoading, error } = useCircles();
  const { data: joinedCircles, isLoading: isLoadingJoined } = useJoinedCircles();
  const createCircle = useCreateCircle();
  const circleCrypto = useCircleCrypto();

  const [createOpen, setCreateOpen] = useState(false);
  const [circleName, setCircleName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [createdCircleName, setCreatedCircleName] = useState("");
  const [copied, setCopied] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!circleName.trim()) {
      toast.error("please enter a circle name");
      return;
    }

    setIsCreating(true);

    try {
      let publicKeyHex = circleCrypto.publicKeyHex;
      if (!circleCrypto.isReady || !publicKeyHex) {
        publicKeyHex = await circleCrypto.deriveKeypair();
      }

      const inviteCode = nanoid(12);

      await createCircle.mutateAsync({
        name: circleName.trim(),
        inviteCode,
        encryptionPubKey: publicKeyHex,
      });

      const link = `${window.location.origin}/circles/join?code=${inviteCode}&key=${publicKeyHex}`;
      setInviteLink(link);
      setCreatedCircleName(circleName.trim());
      setCircleName("");
      setCreateOpen(false);
      setInviteDialogOpen(true);
      toast.success("circle created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed to create circle");
    } finally {
      setIsCreating(false);
    }
  }, [circleName, circleCrypto, createCircle]);

  const handleCopyInviteLink = useCallback(() => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast.success("invite link copied to clipboard");
  }, [inviteLink]);

  // Reset copied state when dialog closes
  useEffect(() => {
    if (!inviteDialogOpen) setCopied(false);
  }, [inviteDialogOpen]);

  const handleNativeShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${createdCircleName} on Xylkstream`,
          text: "You've been invited to a private circle",
          url: inviteLink,
        });
      } catch {}
    }
  }, [inviteLink, createdCircleName]);

  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight text-foreground mb-3">
              People
            </h1>
            <p className="text-muted-foreground text-lg">
              Private groups for sending to multiple people at once
            </p>
          </div>

          {/* Create circle button */}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <button className="px-6 py-3 text-base rounded-full bg-gradient-to-r from-[#0B1221] to-[#0f172a] border border-amber-500/30 text-white font-medium hover:border-amber-400/60 transition-all shadow-[0_0_25px_-8px_rgba(251,191,36,0.3)] hover:shadow-[0_0_35px_-5px_rgba(251,191,36,0.5)] flex items-center gap-2 shrink-0 w-fit">
                <Plus className="w-4 h-4" />
                <span>New Circle</span>
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a New Circle</DialogTitle>
                <DialogDescription>
                  A circle is a private group. Members join via invite link and their addresses stay encrypted.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5">
                <div>
                  <Label className="mb-2">Circle Name</Label>
                  <Input
                    placeholder="e.g., family, close friends, team"
                    value={circleName}
                    onChange={(e) => setCircleName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  />
                </div>
                {circleCrypto.error && (
                  <p className="text-sm text-destructive">{circleCrypto.error}</p>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                  disabled={isCreating}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={isCreating || circleCrypto.isDeriving}
                >
                  {isCreating || circleCrypto.isDeriving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Circle
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Invite link dialog shown after creation */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>{createdCircleName} created</DialogTitle>
          </DialogHeader>

          <div className="px-6 pt-7 pb-6">
            {/* Header — icon, name, subtitle in one balanced block */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-serif font-light truncate">{createdCircleName}</h2>
                <p className="text-xs text-muted-foreground/60">circle created — share to invite people</p>
              </div>
            </div>

            {/* Invite link — tap to copy, single interaction surface */}
            <button
              onClick={handleCopyInviteLink}
              className="w-full group bg-muted/20 hover:bg-muted/40 border border-border/60 hover:border-amber-500/30 rounded-xl px-4 py-3.5 transition-all text-left mb-4"
            >
              <p className="text-xs font-mono text-muted-foreground/70 break-all leading-relaxed">
                {inviteLink}
              </p>
              <div className="flex items-center gap-1.5 mt-2.5 text-xs">
                {copied ? (
                  <span className="text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    copied to clipboard
                  </span>
                ) : (
                  <span className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors flex items-center gap-1.5">
                    <Copy className="w-3.5 h-3.5" />
                    tap to copy
                  </span>
                )}
              </div>
            </button>

            {/* Share button — only on supported devices */}
            {typeof navigator !== "undefined" && !!navigator.share && (
              <Button variant="outline" onClick={handleNativeShare} className="w-full h-10 mb-4">
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
            )}

            <p className="text-[11px] text-center text-muted-foreground/30">
              end-to-end encrypted — only you can see who joins
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* My Circles (owned) */}
      <section className="mb-10">
        <h2 className="text-lg font-medium text-foreground mb-4">My Circles</h2>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading circles...
          </div>
        ) : error && !(error instanceof ApiError && error.status === 401) ? (
          <Card className="p-8 text-center border border-border">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : "Failed to load circles"}
            </p>
          </Card>
        ) : !circles || circles.length === 0 ? (
          <Card className="p-12 text-center border border-border">
            <div className="max-w-md mx-auto">
              <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No circles yet</h3>
              <p className="text-sm text-muted-foreground">
                Create a circle to send payments to a private group of people at once
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {circles.map((circle) => (
              <Link key={circle.id} to="/circles/$circleId" params={{ circleId: String(circle.id) }}>
                <Card className="group relative p-5 border border-border hover:border-primary/30 transition-all cursor-pointer h-full">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-medium text-foreground truncate">
                        {circle.name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm text-muted-foreground">
                          {circle.member_count} {circle.member_count === 1 ? "member" : "members"}
                        </span>
                      </div>
                    </div>
                    <Badge variant="secondary" className="lowercase text-xs shrink-0 ml-2">
                      <Link2 className="w-3 h-3 mr-1" />
                      invite
                    </Badge>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground/60">
                    created {new Date(circle.created_at).toLocaleDateString()}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Circles I've Joined */}
      <section>
        <h2 className="text-lg font-medium text-foreground mb-4">Circles I've Joined</h2>
        {isLoadingJoined ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading joined circles...
          </div>
        ) : !joinedCircles || joinedCircles.length === 0 ? (
          <Card className="p-12 text-center border border-border">
            <div className="max-w-md mx-auto">
              <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No joined circles</h3>
              <p className="text-sm text-muted-foreground">
                Join a circle via an invite link to see it here
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {joinedCircles.map((jc) => (
              <Card
                key={jc.circleId}
                className="group relative p-5 border border-border hover:border-primary/20 transition-all h-full"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-medium text-foreground truncate">
                      {jc.circleName}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground">
                        {jc.memberCount} {jc.memberCount === 1 ? "member" : "members"}
                      </span>
                    </div>
                  </div>
                  <Badge
                    variant={
                      jc.status === "approved" ? "secondary"
                        : jc.status === "rejected" ? "destructive"
                        : "outline"
                    }
                    className="text-xs shrink-0 ml-2"
                  >
                    {jc.status}
                  </Badge>
                </div>
                <div className="mt-3 text-xs text-muted-foreground/60">
                  joined {new Date(jc.joinedAt).toLocaleDateString()}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
