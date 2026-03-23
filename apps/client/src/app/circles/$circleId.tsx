import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft,
  Users,
  Link2,
  Copy,
  Trash2,
  Shield,
  Loader2,
  Send,
  Pencil,
  Check,
  CheckCircle2,
  Share2,
  X,
} from "lucide-react";
import { Card } from "@/components/molecules/card";
import { Button } from "@/components/atoms/button";
import { Badge } from "@/components/atoms/badge";
import { Separator } from "@/components/atoms/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/molecules/dialog";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/atoms/tabs";
import { useCircle, useRemoveMember, useUpdateCircleName, useUpdateMemberStatus } from "@/hooks/use-circles";
import { useCircleCrypto } from "@/hooks/use-circle-crypto";
import { decryptStealthAddress } from "@/utils/circle-crypto";

export const Route = createFileRoute("/circles/$circleId")({
  component: CircleDetailPage,
});

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function CircleDetailPage() {
  const navigate = useNavigate();
  const { circleId } = Route.useParams();
  const circleIdNum = Number(circleId);

  const { data, isLoading, error } = useCircle(circleIdNum);
  const removeMember = useRemoveMember();
  const updateName = useUpdateCircleName();
  const updateMemberStatus = useUpdateMemberStatus();
  const circleCrypto = useCircleCrypto();

  const pendingCount = data?.members?.filter((m) => m.status === "pending").length ?? 0;
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const resolvedFilter = statusFilter ?? (pendingCount > 0 ? "pending" : "approved");

  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [decryptedAddresses, setDecryptedAddresses] = useState<
    Record<number, string>
  >({});
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!inviteDialogOpen) setCopied(false);
  }, [inviteDialogOpen]);

  // Derive keypair and decrypt member addresses once data is loaded
  useEffect(() => {
    if (!data?.members?.length) return;
    const members = data.members;

    async function decryptAll() {
      setIsDecrypting(true);
      try {
        if (!circleCrypto.isReady) {
          await circleCrypto.deriveKeypair();
        }

        const secretKey = circleCrypto.getSecretKey();
        const result: Record<number, string> = {};

        for (const member of members) {
          try {
            const addr = decryptStealthAddress(
              member.encrypted_stealth_address,
              member.ephemeral_pubkey,
              secretKey,
            );
            result[member.id] = addr;
          } catch {
            result[member.id] = "decryption failed";
          }
        }

        setDecryptedAddresses(result);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to decrypt member addresses",
        );
      } finally {
        setIsDecrypting(false);
      }
    }

    decryptAll();
    // run when members data arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.members]);

  const handleStartEditName = useCallback(() => {
    if (!data?.circle) return;
    setEditName(data.circle.name);
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }, [data?.circle]);

  const handleSaveName = useCallback(async () => {
    const trimmed = editName.trim();
    if (!trimmed || !data?.circle || trimmed === data.circle.name) {
      setIsEditingName(false);
      return;
    }
    try {
      await updateName.mutateAsync({ circleId: circleIdNum, name: trimmed });
      toast.success("Circle renamed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename");
    }
    setIsEditingName(false);
  }, [editName, data?.circle, circleIdNum, updateName]);

  const handleShareInvite = useCallback(async () => {
    if (!data?.circle) return;
    let pubKey = circleCrypto.publicKeyHex;
    if (!circleCrypto.isReady || !pubKey) {
      try {
        pubKey = await circleCrypto.deriveKeypair();
      } catch {
        toast.error("Failed to derive encryption key");
        return;
      }
    }
    const link = `${window.location.origin}/circles/join?code=${data.circle.invite_code}&key=${pubKey}`;
    setInviteLink(link);
    setInviteDialogOpen(true);
  }, [data?.circle, circleCrypto]);

  const handleCopyInviteLink = useCallback(() => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast.success("Invite link copied to clipboard");
  }, [inviteLink]);

  const handleNativeShare = useCallback(async () => {
    if (!navigator.share || !data?.circle) return;
    try {
      await navigator.share({
        title: `Join ${data.circle.name} on Xylkstream`,
        text: "You've been invited to a private circle",
        url: inviteLink,
      });
    } catch {}
  }, [inviteLink, data?.circle]);

  const handleCopyAddress = useCallback((addr: string) => {
    navigator.clipboard.writeText(addr);
    toast.success("Address copied");
  }, []);

  const handleRemoveMember = useCallback(
    async (memberId: number) => {
      try {
        await removeMember.mutateAsync({ circleId: circleIdNum, memberId });
        toast.success("Member removed");
        setDecryptedAddresses((prev) => {
          const next = { ...prev };
          delete next[memberId];
          return next;
        });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to remove member",
        );
      }
    },
    [circleIdNum, removeMember],
  );

  const handleMemberStatus = useCallback(
    async (memberId: number, status: "approved" | "rejected") => {
      try {
        await updateMemberStatus.mutateAsync({ circleId: circleIdNum, memberId, status });
        toast.success(`Member ${status}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update status");
      }
    },
    [circleIdNum, updateMemberStatus],
  );

  const handleStreamToAll = useCallback(() => {
    const addresses = Object.values(decryptedAddresses).filter(
      (a) => a.startsWith("0x") && a !== "decryption failed",
    );
    if (addresses.length === 0) {
      toast.error("No member addresses available yet");
      return;
    }
    toast.info(`${addresses.length} addresses ready — wire to stream creation`);
  }, [decryptedAddresses]);

  if (isLoading) {
    return (
      <div className="w-full max-w-4xl mx-auto">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading circle...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="w-full max-w-4xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate({ to: "/circles" })}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to circles
        </Button>
        <Card className="p-8 text-center border border-border">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Circle not found"}
          </p>
        </Card>
      </div>
    );
  }

  const { circle, members } = data;

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Back */}
      <Button
        variant="ghost"
        onClick={() => navigate({ to: "/circles" })}
        className="mb-6 -ml-2"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back
      </Button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="group/name flex items-center gap-2 mb-3">
            {isEditingName ? (
              <input
                ref={nameInputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") setIsEditingName(false);
                }}
                className="text-4xl md:text-5xl font-serif font-light tracking-tight text-foreground bg-transparent border-b border-primary/40 outline-none w-full"
              />
            ) : (
              <>
                <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight text-foreground">
                  {circle.name}
                </h1>
                <button
                  onClick={handleStartEditName}
                  className="opacity-0 group-hover/name:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="w-4 h-4" />
              <span className="text-sm">
                {members.length} {members.length === 1 ? "member" : "members"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-amber-400/70">
              <Shield className="w-3.5 h-3.5" />
              <span className="text-xs">Encrypted addresses</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={handleShareInvite}
            disabled={circleCrypto.isDeriving}
          >
            <Link2 className="w-4 h-4 mr-2" />
            Share Invite
          </Button>
          <Button
            onClick={handleStreamToAll}
            disabled={members.length === 0 || isDecrypting}
          >
            <Send className="w-4 h-4 mr-2" />
            Stream to All
          </Button>
        </div>
      </div>

      <Separator className="mb-8" />

      {/* Member List */}
      {isDecrypting && (
        <div className="flex items-center gap-2 text-muted-foreground mb-6 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Decrypting member addresses...
        </div>
      )}

      {members.length === 0 ? (
        <Card className="p-12 text-center border border-border">
          <div className="max-w-md mx-auto">
            <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No members yet</h3>
            <p className="text-sm text-muted-foreground">
              Share the invite link so people can join this circle
            </p>
            <Button
              variant="outline"
              onClick={handleShareInvite}
              className="mt-4"
              disabled={circleCrypto.isDeriving}
            >
              <Link2 className="w-4 h-4 mr-2" />
              Get Invite Link
            </Button>
          </div>
        </Card>
      ) : (() => {
        const filteredMembers = resolvedFilter === "all"
          ? members
          : members.filter((m) => m.status === resolvedFilter);

        const approvedCount = members.filter((m) => m.status === "approved").length;
        const rejectedCount = members.filter((m) => m.status === "rejected").length;

        return (
          <div className="space-y-3">
            <Tabs value={resolvedFilter} onValueChange={setStatusFilter} className="mb-4">
              <TabsList>
                <TabsTrigger value="approved">
                  Approved{approvedCount > 0 && ` (${approvedCount})`}
                </TabsTrigger>
                <TabsTrigger value="pending">
                  Pending{pendingCount > 0 && ` (${pendingCount})`}
                </TabsTrigger>
                <TabsTrigger value="rejected">
                  Rejected{rejectedCount > 0 && ` (${rejectedCount})`}
                </TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>

            {filteredMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No {resolvedFilter === "all" ? "" : resolvedFilter} members
              </p>
            ) : (
              filteredMembers.map((member, index) => {
                const addr = decryptedAddresses[member.id];
                return (
                  <Card
                    key={member.id}
                    className="group p-4 border border-border hover:border-primary/20 transition-all"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center shrink-0 text-xs font-mono text-muted-foreground">
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          {addr ? (
                            <div className="flex items-center gap-2">
                              {addr === "decryption failed" ? (
                                <Badge variant="destructive" className="text-xs">
                                  Decryption failed
                                </Badge>
                              ) : (
                                <button
                                  onClick={() => handleCopyAddress(addr)}
                                  className="flex items-center gap-1.5 font-mono text-sm text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <span>{truncateAddress(addr)}</span>
                                  <Copy className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Shield className="w-3.5 h-3.5 text-amber-400/60 shrink-0" />
                              <span className="text-xs text-muted-foreground/60">
                                Encrypted
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground/50">
                              Joined {new Date(member.joined_at).toLocaleDateString()}
                            </span>
                            <Badge
                              variant={
                                member.status === "approved" ? "secondary"
                                  : member.status === "rejected" ? "destructive"
                                  : "outline"
                              }
                              className="text-[10px]"
                            >
                              {member.status}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {member.status !== "approved" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMemberStatus(member.id, "approved")}
                            disabled={updateMemberStatus.isPending}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-emerald-500"
                            title="Approve"
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                        )}
                        {member.status !== "rejected" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMemberStatus(member.id, "rejected")}
                            disabled={updateMemberStatus.isPending}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            title="Reject"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMember(member.id)}
                          disabled={removeMember.isPending}
                          className="shrink-0 h-8 w-8 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        );
      })()}

      {/* Invite link dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Invite to {circle.name}</DialogTitle>
          </DialogHeader>

          <div className="px-6 pt-7 pb-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <Link2 className="w-5 h-5 text-amber-400" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-serif font-light truncate">{circle.name}</h2>
                <p className="text-xs text-muted-foreground/60">share this link to invite people</p>
              </div>
            </div>

            {/* Invite link — tap to copy */}
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
    </div>
  );
}
