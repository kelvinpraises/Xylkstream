import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/card";

export const Route = createFileRoute("/contacts")({
  component: ContactsPage,
});

function ContactsPage() {
  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="mb-12">
        <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight text-foreground mb-3">
          Contacts
        </h1>
        <p className="text-muted-foreground text-lg">
          Manage your frequent recipients
        </p>
      </div>

      <Card className="p-12 text-center border border-border">
        <div className="max-w-md mx-auto">
          <h3 className="text-lg font-medium mb-2">Coming Soon</h3>
          <p className="text-sm text-muted-foreground">
            Contact management will be available here
          </p>
        </div>
      </Card>
    </div>
  );
}
