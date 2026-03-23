import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/atoms/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/molecules/card";
import { Bot, ShieldCheck, X } from "lucide-react";
import { config } from "@/config";

export const Route = createFileRoute("/oauth/authorize")({
  validateSearch: (search: Record<string, unknown>) => ({
    request_id: (search.request_id as string) || "",
  }),
  component: OAuthAuthorizePage,
});

function OAuthAuthorizePage() {
  const { request_id } = useSearch({ from: "/oauth/authorize" });
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleDecision = async (approved: boolean) => {
    if (!request_id) {
      setError("Missing request_id");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const privyAccessToken = await getAccessToken();
      if (!privyAccessToken) {
        setError("Not authenticated. Please sign in first.");
        setSubmitting(false);
        return;
      }

      const res = await fetch(`${config.API_URL}/oauth/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: request_id,
          privyAccessToken,
          approved,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to process authorization");
      }

      const { redirectUrl } = await res.json();

      if (redirectUrl) {
        // Redirect agent's callback with the authorization code
        window.location.href = redirectUrl;
      } else {
        setDone(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  if (!request_id) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md border border-destructive/30">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive text-center">
              Invalid authorization request. Missing request ID.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <ShieldCheck className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">
              Authorization complete. You can close this window.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md border border-border">
        <CardHeader className="text-center pb-2">
          <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
            <Bot className="w-8 h-8 text-purple-400" />
          </div>
          <CardTitle className="text-xl">Agent Authorization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground text-center leading-relaxed">
            An external agent is requesting access to your Xylkstream account.
            It will be able to read your data and propose actions for your approval.
          </p>

          <div className="bg-muted/30 rounded-lg p-4 space-y-3 flex flex-col items-center">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider text-center">
              Permissions requested
            </p>
            <ul className="text-sm space-y-2 inline-flex flex-col items-start mx-auto">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Read circles, streams, and balances
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Create proposals (require your approval to execute)
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Submit and test yield strategies
              </li>
            </ul>
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          {!authenticated ? (
            <Button onClick={login} className="w-full" size="lg" disabled={!ready}>
              {!ready ? "Loading..." : "Sign in to authorize"}
            </Button>
          ) : (
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                size="lg"
                disabled={submitting}
                onClick={() => handleDecision(false)}
              >
                <X className="w-4 h-4 mr-2" />
                Deny
              </Button>
              <Button
                className="flex-1"
                size="lg"
                disabled={submitting}
                onClick={() => handleDecision(true)}
              >
                <ShieldCheck className="w-4 h-4 mr-2" />
                {submitting ? "Authorizing..." : "Approve"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
