import { createFileRoute } from "@tanstack/react-router";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/button";
import { Badge } from "@/components/badge";
import { useClaimPage } from "@/hooks/use-claim";
import { ClaimStreamCard } from "@/components/claim-stream-card";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/alert";

export const Route = createFileRoute("/claim/$pageId")({
  component: ClaimPage,
});

function ClaimPage() {
  const { pageId } = Route.useParams();
  const { login, authenticated, user } = usePrivy();
  const { data: page, isLoading, error } = useClaimPage(pageId);

  const streams = page?.streams || [];

  // Loading state
  if (isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4" />
          <p className="text-muted-foreground">Loading claim page...</p>
        </div>
      </div>
    );
  }

  // Error or not found state
  if (error || !page) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Claim Page Not Found</h1>
          <p className="text-muted-foreground">
            {error ? "Failed to load claim page. Please try again." : "This claim page doesn't exist or has been removed."}
          </p>
          {!authenticated && (
            <Button onClick={login} className="mt-4">
              Connect Wallet to View
            </Button>
          )}
        </div>
      </div>
    );
  }

  const userStreams = authenticated && user
    ? streams.filter((s) => s.recipient.toLowerCase() === user.wallet?.address?.toLowerCase())
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto p-6 max-w-4xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {page.logo && (
                <img src={page.logo} alt={page.title} className="w-12 h-12 rounded-lg" />
              )}
              <div>
                <h1 className="text-2xl font-bold">{page.title}</h1>
                {page.subtitle && (
                  <p className="text-sm text-muted-foreground mt-1">{page.subtitle}</p>
                )}
              </div>
            </div>
            {!authenticated && (
              <Button onClick={login}>Connect Wallet</Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto p-6 max-w-4xl">
        {!authenticated ? (
          <Alert className="mb-6">
            <AlertDescription>
              Connect your wallet to view and claim your streams
            </AlertDescription>
          </Alert>
        ) : userStreams.length === 0 ? (
          <Alert className="mb-6">
            <AlertDescription>
              No streams found for your wallet address. Make sure you're connected with the correct wallet.
            </AlertDescription>
          </Alert>
        ) : null}

        {streams.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[300px] text-center">
            <h3 className="text-lg font-medium mb-2">No Streams Yet</h3>
            <p className="text-sm text-muted-foreground">
              Streams will appear here once they're created
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold">
                  {authenticated && userStreams.length > 0 ? "Your Streams" : "All Streams"}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {authenticated && userStreams.length > 0
                    ? `${userStreams.length} stream${userStreams.length !== 1 ? "s" : ""} available`
                    : `${streams.length} total stream${streams.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <Badge variant="secondary">
                {streams.filter((s) => s.status === "ACTIVE").length} Active
              </Badge>
            </div>

            <div className="grid gap-4">
              {(authenticated && userStreams.length > 0 ? userStreams : streams).map((stream) => (
                <ClaimStreamCard key={stream.id} stream={stream} />
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t text-center">
          <p className="text-sm text-muted-foreground">
            Powered by{" "}
            <a href="/" className="font-medium text-foreground hover:underline">
              Xylkstream
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
