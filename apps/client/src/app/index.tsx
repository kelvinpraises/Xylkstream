import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { usePrivy } from "@privy-io/react-auth";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: LoginPage,
});

function LoginPage() {
  const { ready, authenticated, login } = usePrivy();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && authenticated) {
      navigate({ to: "/dashboard" });
    }
  }, [ready, authenticated, navigate]);

  // Don't flash the login page if already authenticated
  if (!ready || authenticated) {
    return (
      <div className="min-h-screen w-full bg-[#030305] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full bg-[#030305] text-white overflow-hidden selection:bg-amber-500/30 font-sans overscroll-none">
      {/* Background Effects - Liquid Aurora */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden w-full h-full">
        {/* Deep Void Base */}
        <div className="absolute inset-0 bg-[#020204] w-full h-full" />
        
        {/* Liquid Mesh Gradients - The "Aurora" */}
        <div className="absolute top-[-10%] left-[-10%] w-[120vw] h-[120vw] md:w-[50vw] md:h-[50vw] bg-amber-500/15 blur-[120px] rounded-full mix-blend-screen animate-aurora" />
        <div className="absolute top-[10%] right-[-10%] w-[140vw] h-[140vw] md:w-[60vw] md:h-[60vw] bg-rose-500/12 blur-[120px] rounded-full mix-blend-screen animate-aurora delay-[2000ms]" />
        <div className="absolute bottom-[-10%] left-[20%] w-[150vw] h-[150vw] md:w-[70vw] md:h-[50vw] bg-violet-400/10 blur-[140px] rounded-full mix-blend-screen animate-aurora delay-[4000ms]" />
      </div>

      {/* Hero Section */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 text-center">
        {/* Logo/Title */}
        <div className="mb-8 text-center animate-fade-in-up delay-200">
          <h1 className="text-7xl md:text-8xl lg:text-9xl font-serif font-light tracking-tight mb-6 italic text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-white to-rose-200 leading-tight">
            Xylkstream
          </h1>
          <p className="text-xl md:text-2xl text-amber-100/60 font-light">
            Send money that grows while it travels
          </p>
        </div>

        {/* Login Button */}
        <div className="animate-fade-in-up delay-500 mb-6">
          <button
            onClick={login}
            disabled={!ready}
            className="px-8 py-4 text-lg rounded-full bg-gradient-to-r from-[#0B1221] to-[#0f172a] border border-amber-500/30 text-white font-medium hover:border-amber-400/60 transition-all shadow-[0_0_25px_-8px_rgba(251,191,36,0.3)] hover:shadow-[0_0_35px_-5px_rgba(251,191,36,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {!ready ? "Loading..." : "Get Started"}
          </button>
          <p className="text-sm text-slate-400 mt-3">Already have a wallet? Connect it</p>
        </div>

        {/* Info Text */}
        <p className="text-sm text-slate-400 text-center max-w-md px-4 animate-fade-in-up delay-300 mb-12">
          Set up recurring payments to anyone — your money earns a little extra while it's on the way
        </p>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full px-4 animate-fade-in-up delay-500">
          <div className="text-center">
            <div className="text-3xl mb-2">💰</div>
            <h3 className="text-white font-medium mb-1">Money That Grows</h3>
            <p className="text-slate-400 text-sm">
              Funds waiting to be sent earn rewards automatically
            </p>
          </div>
          <div className="text-center">
            <div className="text-3xl mb-2">⚡</div>
            <h3 className="text-white font-medium mb-1">Always Working For You</h3>
            <p className="text-slate-400 text-sm">
              Smart agents find the best rates so you don't have to
            </p>
          </div>
          <div className="text-center">
            <div className="text-3xl mb-2">🔌</div>
            <h3 className="text-white font-medium mb-1">Flexible & Hands-Off</h3>
            <p className="text-slate-400 text-sm">
              Adjust your settings anytime without stopping payments
            </p>
          </div>
        </div>
      </main>

      <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(30px); filter: blur(10px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0; 
        }
        .delay-200 { animation-delay: 200ms; }
        .delay-300 { animation-delay: 400ms; }
        .delay-500 { animation-delay: 600ms; }
        
        @keyframes aurora {
          0% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0, 0) scale(1); }
        }
        .animate-aurora {
          animation: aurora 20s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
