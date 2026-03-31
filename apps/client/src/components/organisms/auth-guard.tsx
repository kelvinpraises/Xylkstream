import { usePrivy } from "@privy-io/react-auth";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Skeleton } from "@/components/atoms/skeleton";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !authenticated) {
      navigate({ to: "/" });
    }
  }, [ready, authenticated, navigate]);

  if (!ready) {
    return (
      <div className="w-full max-w-7xl mx-auto space-y-6">
        <Skeleton className="w-48 h-10" />
        <Skeleton className="w-full h-64 rounded-2xl" />
      </div>
    );
  }

  if (!authenticated) return null;

  return <>{children}</>;
}
