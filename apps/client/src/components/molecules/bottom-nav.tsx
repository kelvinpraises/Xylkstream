import { Link, useLocation } from "@tanstack/react-router";
import { Activity, Target, TrendingUp, Sparkles } from "lucide-react";

export function BottomNav() {
  const location = useLocation();
  const currentPath = location.pathname;

  const isActive = (path: string) => {
    if (path === "/dashboard") {
      return currentPath === "/dashboard";
    }
    return currentPath.startsWith(path);
  };

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-black/80 backdrop-blur-xl border-t border-white/10 px-4 py-3 z-50">
      <div className="flex items-center justify-around">
        <Link
          to="/dashboard"
          className={`flex flex-col items-center gap-1 transition-colors ${
            isActive("/dashboard") ? "text-cyan-400" : "text-slate-400 hover:text-white"
          }`}
        >
          <Activity className="w-5 h-5" />
          <span className="text-xs">Dashboard</span>
        </Link>
        <Link
          to="/studio"
          className={`flex flex-col items-center gap-1 transition-colors ${
            isActive("/studio") ? "text-cyan-400" : "text-slate-400 hover:text-white"
          }`}
        >
          <Sparkles className="w-5 h-5" />
          <span className="text-xs">Studio</span>
        </Link>
        <Link
          to="/leaderboard"
          className={`flex flex-col items-center gap-1 transition-colors ${
            isActive("/leaderboard") ? "text-cyan-400" : "text-slate-400 hover:text-white"
          }`}
        >
          <TrendingUp className="w-5 h-5" />
          <span className="text-xs">Leaderboard</span>
        </Link>
        <Link
          to="/settings"
          className={`flex flex-col items-center gap-1 transition-colors ${
            isActive("/settings") ? "text-cyan-400" : "text-slate-400 hover:text-white"
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-xs">Settings</span>
        </Link>
      </div>
    </nav>
  );
}
