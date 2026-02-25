import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Send, Wallet, ArrowLeftRight, DollarSign, Sparkles } from "lucide-react";
import { useAccount } from "@/hooks";

export const Route = createFileRoute("/studio")({
  component: StudioPage,
});

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

function StudioPage() {
  const { data: account } = useAccount();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hi! I can help you bridge assets, manage wallets, or answer questions. What would you like to do?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    // Mock AI response
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I'm processing your request. This is a placeholder response. AI integration coming soon!",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
    }, 1000);
  };

  const handleQuickAction = (prompt: string) => {
    setInput(prompt);
  };

  return (
    <div className="w-full max-w-7xl mx-auto h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight text-foreground mb-3">
          Studio
        </h1>
        <p className="text-muted-foreground text-lg">
          AI-powered orchestration hub for bridging, wallets, and more
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 h-[calc(100%-120px)]">
        {/* Chat Area */}
        <div className="flex flex-col rounded-2xl bg-card border border-border overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    message.role === "user"
                      ? "bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 border border-cyan-500/20"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm text-foreground">{message.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {message.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="border-t border-border p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Ask me anything..."
                className="flex-1 px-4 py-3 rounded-full bg-muted border border-border focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
              <button
                onClick={handleSend}
                className="px-6 py-3 rounded-full bg-gradient-to-r from-[#0B1221] to-[#0f172a] border border-cyan-500/30 text-white font-medium hover:border-cyan-400/60 transition-all shadow-[0_0_25px_-8px_rgba(6,182,212,0.4)] hover:shadow-[0_0_35px_-5px_rgba(6,182,212,0.6)]"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <div className="rounded-2xl bg-card border border-border p-6">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
              Quick Actions
            </h3>
            <div className="space-y-2">
              <button 
                onClick={() => handleQuickAction("I want to bridge 100 USDC from Arbitrum to Base")}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-left"
              >
                <ArrowLeftRight className="w-4 h-4 text-cyan-400" />
                <span className="text-sm">Bridge Assets</span>
              </button>
              <button 
                onClick={() => handleQuickAction("Show me my wallet balances across all chains")}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-left"
              >
                <Wallet className="w-4 h-4 text-indigo-400" />
                <span className="text-sm">Manage Wallets</span>
              </button>
              <button 
                onClick={() => handleQuickAction("What are my current token balances?")}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-left"
              >
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span className="text-sm">Check Balances</span>
              </button>
            </div>
          </div>

          {/* Connected Wallets */}
          <div className="rounded-2xl bg-card border border-border p-6">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
              Connected Wallets
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-400" />
                  <span className="text-sm">Arbitrum</span>
                </div>
                <span className="text-sm font-mono text-muted-foreground">
                  {account?.walletAddress ? `${account.walletAddress.slice(0, 6)}...` : "Not connected"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-400" />
                  <span className="text-sm">Base</span>
                </div>
                <span className="text-sm font-mono text-muted-foreground">
                  {account?.walletAddress ? `${account.walletAddress.slice(0, 6)}...` : "Not connected"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-violet-400" />
                  <span className="text-sm">Sui</span>
                </div>
                <span className="text-sm font-mono text-muted-foreground">Not connected</span>
              </div>
            </div>
          </div>

          {/* AI Status */}
          <div className="rounded-2xl bg-gradient-to-br from-cyan-500/10 to-indigo-500/10 border border-cyan-500/20 p-6">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-medium">AI Assistant</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Ready to help with bridging, wallet management, and more
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
