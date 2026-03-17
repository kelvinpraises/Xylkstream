import { createFileRoute, Link } from "@tanstack/react-router";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/atoms/button";
import { Card } from "@/components/molecules/card";
import { Wallet } from "lucide-react";
import { motion } from "framer-motion";

export const Route = createFileRoute("/claim/$pageId")({
  component: ClaimPage,
});

function ClaimPage() {
  const { pageId } = Route.useParams();
  const { login, authenticated } = usePrivy();

  // Not authenticated — show sign-in prompt
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-amber-950/20">
        <div className="container mx-auto px-6 py-16 max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6">
                <Wallet className="w-4 h-4 text-amber-400" />
                <span className="text-sm text-amber-400">Stream #{pageId}</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight text-foreground mb-4">
                You've Got Money!
              </h1>
              <p className="text-lg text-muted-foreground max-w-md mx-auto">
                Sign in to see what's waiting for you.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Card className="p-8 border border-amber-500/20 bg-gradient-to-b from-card to-amber-950/5">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-6">
                  <Wallet className="w-8 h-8 text-amber-400" />
                </div>
                <h3 className="text-xl font-medium mb-2">Sign In to Collect</h3>
                <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
                  Sign in to collect your payment.
                </p>
                <Button
                  onClick={login}
                  className="px-8 py-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-full text-lg font-medium shadow-[0_0_25px_-8px_rgba(251,191,36,0.3)] hover:shadow-[0_0_35px_-5px_rgba(251,191,36,0.5)] transition-all"
                >
                  Sign In to Collect
                </Button>
              </div>
            </Card>
          </motion.div>

          <div className="mt-12 text-center">
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

  // Authenticated — show rebuild notice
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-amber-950/20">
      <div className="container mx-auto px-6 py-16 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6">
              <Wallet className="w-4 h-4 text-amber-400" />
              <span className="text-sm text-amber-400">Stream #{pageId}</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight text-foreground mb-4">
              Claim pages are being rebuilt.
            </h1>
            <p className="text-lg text-muted-foreground max-w-md mx-auto">
              Please use the dashboard to collect your payments.
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <Card className="p-8 border border-amber-500/20 bg-gradient-to-b from-card to-amber-950/5">
            <div className="text-center">
              <Link to="/dashboard">
                <Button className="px-8 py-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-full text-lg font-medium shadow-[0_0_25px_-8px_rgba(251,191,36,0.3)] hover:shadow-[0_0_35px_-5px_rgba(251,191,36,0.5)] transition-all">
                  Go to Dashboard
                </Button>
              </Link>
            </div>
          </Card>
        </motion.div>

        <div className="mt-12 text-center">
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
