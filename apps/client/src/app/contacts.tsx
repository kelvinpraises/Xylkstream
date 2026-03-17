import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { UserPlus, Trash2, Copy, Mail } from "lucide-react";
import { Card } from "@/components/molecules/card";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { Badge } from "@/components/atoms/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/molecules/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/contacts")({
  component: ContactsPage,
});

interface Contact {
  id: string;
  name: string;
  email: string;
  walletAddress: string;
  addedAt: string;
}

const STORAGE_KEY = "xylkstream_contacts";

function loadContacts(): Contact[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveContacts(contacts: Contact[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
}

function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>(() => loadContacts());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newWallet, setNewWallet] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isResolving] = useState(false);

  const handleAddContact = useCallback(async () => {
    if (!newName.trim()) {
      toast.error("please enter a name");
      return;
    }
    if (!newEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      toast.error("please enter a valid email address");
      return;
    }

    const walletAddress = newWallet.trim();

    const contact: Contact = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      email: newEmail.trim(),
      walletAddress: walletAddress || "looking up address...",
      addedAt: new Date().toISOString(),
    };

    const updated = [...contacts, contact];
    setContacts(updated);
    saveContacts(updated);
    setNewName("");
    setNewEmail("");
    setNewWallet("");
    setDialogOpen(false);
    toast.success(`${contact.name} added to contacts`);
  }, [contacts, newName, newEmail, newWallet]);

  const handleDeleteContact = useCallback(
    (id: string) => {
      const updated = contacts.filter((c) => c.id !== id);
      setContacts(updated);
      saveContacts(updated);
      toast.success("contact removed");
    },
    [contacts]
  );

  const handleCopy = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  }, []);

  const filtered = searchQuery
    ? contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.walletAddress.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : contacts;

  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight text-foreground mb-3">
              People
            </h1>
            <p className="text-muted-foreground text-lg lowercase">
              the people you send money to
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <button className="px-8 py-4 text-lg rounded-full bg-gradient-to-r from-[#0B1221] to-[#0f172a] border border-amber-500/30 text-white font-medium hover:border-amber-400/60 transition-all shadow-[0_0_25px_-8px_rgba(251,191,36,0.3)] hover:shadow-[0_0_35px_-5px_rgba(251,191,36,0.5)] flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                <span className="lowercase">add contact</span>
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="lowercase">add new contact</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label className="lowercase mb-2">name</Label>
                  <Input
                    placeholder="e.g., alice johnson"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddContact()}
                  />
                </div>
                <div>
                  <Label className="lowercase mb-2">email</Label>
                  <Input
                    type="email"
                    placeholder="alice@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddContact()}
                  />
                </div>
                <div>
                  <Label className="lowercase mb-2">
                    account address
                    <span className="text-muted-foreground font-normal ml-1">(optional)</span>
                  </Label>
                  <Input
                    placeholder="0x..."
                    value={newWallet}
                    onChange={(e) => setNewWallet(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddContact()}
                  />
                  <p className="text-xs text-muted-foreground mt-1 lowercase">
                    leave blank to resolve from email later
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="lowercase">
                  cancel
                </Button>
                <Button onClick={handleAddContact} disabled={isResolving} className="lowercase">
                  {isResolving ? (
                    <>resolving email...</>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4 mr-2" />
                      add contact
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        {contacts.length > 0 && (
          <div className="max-w-md">
            <Input
              placeholder="search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="lowercase"
            />
          </div>
        )}
      </div>

      {/* Contact List */}
      {contacts.length === 0 ? (
        <Card className="p-12 text-center border border-border">
          <div className="max-w-md mx-auto">
            <UserPlus className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2 lowercase">no contacts yet</h3>
            <p className="text-sm text-muted-foreground lowercase">
              add someone to quickly send payments
            </p>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center border border-border">
          <div className="max-w-md mx-auto">
            <h3 className="text-lg font-medium mb-2 lowercase">no matches found</h3>
            <p className="text-sm text-muted-foreground lowercase">
              try a different search term
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((contact) => (
            <Card
              key={contact.id}
              className="group relative p-5 border border-border hover:border-primary/30 transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-medium text-foreground lowercase truncate">
                    {contact.name}
                  </h3>
                  <button
                    onClick={() => handleCopy(contact.email, "email")}
                    className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Mail className="w-3 h-3 shrink-0" />
                    <span className="truncate">{contact.email}</span>
                  </button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteContact(contact.id)}
                  className="shrink-0 h-8 w-8 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex items-center gap-2">
                {contact.walletAddress === "looking up address..." ? (
                  <Badge variant="secondary" className="lowercase text-xs">
                    looking up address...
                  </Badge>
                ) : (
                  <button
                    onClick={() => handleCopy(contact.walletAddress, "address")}
                    className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span>
                      {contact.walletAddress.slice(0, 6)}...{contact.walletAddress.slice(-4)}
                    </span>
                    <Copy className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="mt-3 text-xs text-muted-foreground/60 lowercase">
                added {new Date(contact.addedAt).toLocaleDateString()}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
