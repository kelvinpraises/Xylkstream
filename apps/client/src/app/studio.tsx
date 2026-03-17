import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, Loader2, Shield, Radio, StopCircle, Clock, Download, Copy, Check, Monitor, Cloud } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "sonner";
import { config } from "@/config";
const API_URL = config.API_URL;

type AgentProvider = "eigencompute" | "local";

interface LaunchResult {
  appId: string;
  ipAddress: string | null;
  gatewayPort: number;
  gatewayToken: string;
  mcpUrl?: string;
  provider: AgentProvider;
}
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";

export const Route = createFileRoute("/studio")({
  component: StudioPage,
});

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// ===== Component =====

function StudioPage() {
  const { authenticated } = usePrivy();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content:
        "Hey there! Pick a provider and launch the agent to get started. I can help you send money, check your balance, or manage your payments.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [provider, setProvider] = useState<AgentProvider>("eigencompute");
  const [agentSession, setAgentSession] = useState<(LaunchResult & { status: string }) | null>(null);
  const [isLaunching] = useState(false);
  const [verifiableLogs] = useState<{
    logContent: string | null;
    logHash: string | null;
  } | null>(null);
  const [sessionTimer] = useState(0);
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Local provider stepper state
  const [localStep, setLocalStep] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [isDownloading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Connect WebSocket when agent session starts
  useEffect(() => {
    if (!agentSession) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const connectWs = async () => {
      let wsUrl: string;

      if (agentSession.provider === "local") {
        // Connect directly to local OpenClaw gateway
        wsUrl = `ws://localhost:18789/ws`;
      } else {
        // Connect via server proxy to TEE
        wsUrl = `${API_URL.replace(/^http/, "ws")}/ws/agent?token=${agentSession.gatewayToken}`;
      }

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log(`[Studio] WebSocket connected (${agentSession.provider})`);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const content = data.content || data.message || event.data;

          const msg: Message = {
            id: Date.now().toString(),
            role: "assistant",
            content: typeof content === "string" ? content : JSON.stringify(content),
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, msg]);
          setIsProcessing(false);
        } catch {
          const msg: Message = {
            id: Date.now().toString(),
            role: "assistant",
            content: event.data,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, msg]);
          setIsProcessing(false);
        }
      };

      ws.onerror = () => {
        console.error("[Studio] WebSocket error");
        setIsProcessing(false);
      };

      ws.onclose = () => {
        console.log("[Studio] WebSocket closed");
        wsRef.current = null;
      };

      wsRef.current = ws;
    };

    connectWs();
  }, [agentSession]);

  const handleLaunchAgent = async (_selectedProvider: AgentProvider) => {
    if (!authenticated || isLaunching) return;
    toast.info("Agent integration coming soon");
  };

  const handleTerminateAgent = () => {
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
    setAgentSession(null);
    setLocalStep(0);
  };

  const handleDownloadSkills = () => {
    toast.info("Skills download coming soon");
  };

  const handleLocalConnect = async () => {
    setIsConnecting(true);
    try {
      await handleLaunchAgent("local");
      setLocalStep(3);
    } catch {
      // Error handled in handleLaunchAgent
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const userText = input.trim();
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    if (!agentSession || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      const noAgentMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Please launch an agent first to start chatting. Use the panel on the right to select a provider and get started.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, noAgentMsg]);
      return;
    }

    setIsProcessing(true);

    try {
      wsRef.current.send(JSON.stringify({ content: userText }));
    } catch (err) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Failed to send message: ${err instanceof Error ? err.message : "Connection error"}. Try again.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsProcessing(false);
    }
  };

  const CopyButton = ({ text, id }: { text: string; id: string }) => (
    <button
      onClick={() => handleCopy(text, id)}
      className="p-1 rounded hover:bg-white/10 transition-colors"
      title="Copy"
    >
      {copied === id ? (
        <Check className="w-3 h-3 text-emerald-400" />
      ) : (
        <Copy className="w-3 h-3 text-muted-foreground" />
      )}
    </button>
  );

  return (
    <div className="w-full max-w-7xl mx-auto h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight text-foreground mb-3">
          Assistant
        </h1>
        <p className="text-muted-foreground text-lg">
          Your personal payment helper
        </p>
        {agentSession && (
          <div className="flex items-center gap-2 mt-1">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span className="text-sm text-emerald-400">
              {agentSession.provider === "eigencompute" ? "Verified" : "Local"} agent active — Session {agentSession.appId.slice(0, 8)}
            </span>
          </div>
        )}
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
                      ? "bg-gradient-to-r from-amber-500/10 to-rose-500/10 border border-amber-500/20"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm text-foreground whitespace-pre-wrap">{message.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {message.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span className="text-sm text-muted-foreground">Processing...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={
                  !agentSession
                    ? "Launch the agent to start chatting..."
                    : isProcessing
                      ? "Processing..."
                      : "Ask me anything..."
                }
                disabled={isProcessing}
                className="flex-1 px-4 py-3 rounded-full bg-muted border border-border focus:outline-none focus:border-amber-500/50 transition-colors disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={isProcessing || !input.trim()}
                className="px-6 py-3 rounded-full bg-gradient-to-r from-[#0B1221] to-[#0f172a] border border-amber-500/30 text-white font-medium hover:border-amber-400/60 transition-all shadow-[0_0_25px_-8px_rgba(251,191,36,0.3)] hover:shadow-[0_0_35px_-5px_rgba(251,191,36,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4 overflow-y-auto">
          {/* Provider Card */}
          <div className={`rounded-2xl border p-6 ${
            provider === "eigencompute"
              ? "bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border-emerald-500/20"
              : "bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/20"
          }`}>
            {/* Provider Selector */}
            <div className="mb-4">
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
                Provider
              </label>
              <Select
                value={provider}
                onValueChange={(v) => {
                  if (!agentSession) {
                    setProvider(v as AgentProvider);
                    setLocalStep(0);
                  }
                }}
                disabled={!!agentSession}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="eigencompute">
                    <div className="flex items-center gap-2">
                      <Cloud className="w-3 h-3" />
                      Verified (TEE)
                    </div>
                  </SelectItem>
                  <SelectItem value="local">
                    <div className="flex items-center gap-2">
                      <Monitor className="w-3 h-3" />
                      Local (OpenClaw)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* EigenCompute Provider */}
            {provider === "eigencompute" && (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-medium">Verified Agent</h3>
                </div>

                {!agentSession ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Launch an AI agent in a secure TEE with full attestation.
                    </p>
                    <p className="text-xs text-amber-400/80 mb-3">
                      Free 15-min session, auto-provisioned
                    </p>
                    <button
                      onClick={() => handleLaunchAgent("eigencompute")}
                      disabled={isLaunching || !authenticated}
                      className="w-full px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-sm hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                    >
                      {isLaunching ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Deploying to TEE...
                        </span>
                      ) : (
                        "Launch Verified Agent"
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                      <span className="text-xs text-emerald-300">Running in TEE</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{Math.floor(sessionTimer / 60)}:{(sessionTimer % 60).toString().padStart(2, "0")}</span>
                    </div>
                    <button
                      onClick={handleTerminateAgent}
                      className="w-full px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-sm hover:bg-red-500/30 transition-colors flex items-center justify-center gap-2"
                    >
                      <StopCircle className="w-3 h-3" />
                      End Session
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Local OpenClaw Provider */}
            {provider === "local" && (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <Monitor className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-medium">Local Agent</h3>
                </div>

                {agentSession ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Radio className="w-3 h-3 text-amber-400 animate-pulse" />
                      <span className="text-xs text-amber-300">Local session active</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{Math.floor(sessionTimer / 60)}:{(sessionTimer % 60).toString().padStart(2, "0")}</span>
                    </div>
                    <button
                      onClick={handleTerminateAgent}
                      className="w-full px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-sm hover:bg-red-500/30 transition-colors flex items-center justify-center gap-2"
                    >
                      <StopCircle className="w-3 h-3" />
                      End Session
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground mb-1">
                      Run OpenClaw on your machine. Unlimited time, your own API key.
                    </p>

                    {/* Step 1: Install */}
                    <div className={`rounded-lg border p-3 ${localStep >= 0 ? "border-amber-500/30 bg-amber-500/5" : "border-border opacity-50"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">1. Install OpenClaw</span>
                        {localStep > 0 && <Check className="w-3 h-3 text-emerald-400" />}
                      </div>
                      <div className="flex items-center gap-1 bg-black/30 rounded px-2 py-1.5">
                        <code className="text-xs text-amber-300 flex-1 font-mono">npm i -g openclaw@latest</code>
                        <CopyButton text="npm install -g openclaw@latest" id="install" />
                      </div>
                      {localStep === 0 && (
                        <button
                          onClick={() => setLocalStep(1)}
                          className="mt-2 text-xs text-amber-400 hover:text-amber-300"
                        >
                          Done, next step
                        </button>
                      )}
                    </div>

                    {/* Step 2: Download Skills */}
                    <div className={`rounded-lg border p-3 ${localStep >= 1 ? "border-amber-500/30 bg-amber-500/5" : "border-border opacity-50"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">2. Download Skills</span>
                        {localStep > 1 && <Check className="w-3 h-3 text-emerald-400" />}
                      </div>
                      {localStep >= 1 && (
                        <button
                          onClick={handleDownloadSkills}
                          disabled={isDownloading}
                          className="w-full mt-1 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs hover:bg-amber-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isDownloading ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Download className="w-3 h-3" />
                          )}
                          Download Workspace
                        </button>
                      )}
                    </div>

                    {/* Step 3: Connect Account */}
                    <div className={`rounded-lg border p-3 ${localStep >= 2 ? "border-amber-500/30 bg-amber-500/5" : "border-border opacity-50"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">3. Connect Account</span>
                        {localStep > 2 && <Check className="w-3 h-3 text-emerald-400" />}
                      </div>
                      {localStep >= 2 && (
                        <button
                          onClick={handleLocalConnect}
                          disabled={isConnecting || !authenticated}
                          className="w-full mt-1 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs hover:bg-amber-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isConnecting ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            "Connect Account"
                          )}
                        </button>
                      )}
                    </div>

                    {/* Step 4: Start Agent */}
                    <div className={`rounded-lg border p-3 ${localStep >= 3 ? "border-amber-500/30 bg-amber-500/5" : "border-border opacity-50"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">4. Start Agent</span>
                      </div>
                      {localStep >= 3 && (
                        <>
                          <div className="flex items-center gap-1 bg-black/30 rounded px-2 py-1.5 mt-1">
                            <code className="text-xs text-amber-300 flex-1 font-mono">openclaw gateway run</code>
                            <CopyButton text="openclaw gateway run" id="gateway" />
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            Run the command above, then chat will auto-connect.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {verifiableLogs && (
            <div className="rounded-2xl bg-card border border-border p-6">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-medium">Session Proof</h3>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Attestation Hash</p>
                <p className="text-xs font-mono text-emerald-300 break-all bg-muted rounded-lg p-2">
                  {verifiableLogs.logHash || "No hash available"}
                </p>
                <p className="text-xs text-emerald-400 flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  Verified in TEE
                </p>
              </div>
            </div>
          )}

          {/* AI Status */}
          <div className="rounded-2xl bg-gradient-to-br from-amber-500/10 to-rose-500/10 border border-amber-500/20 p-6">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-medium">AI Assistant</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {agentSession
                ? `Connected via MCP (${agentSession.provider === "eigencompute" ? "TEE" : "local"}) -- the agent can manage streams, check balances, and optimize yield`
                : authenticated
                  ? "Select a provider and launch the agent to enable AI capabilities"
                  : "Sign in to get started"}
            </p>
          </div>

          {/* Supported Tokens */}
          <div className="rounded-2xl bg-card border border-border p-6">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Supported Tokens
            </h3>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div>AlphaUSD</div>
              <div>BetaUSD</div>
              <div>pathUSD</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
