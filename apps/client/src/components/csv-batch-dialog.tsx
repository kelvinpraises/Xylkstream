import { useState, useRef, useCallback } from "react";
import { Upload, FileText, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/button";
import { Badge } from "@/components/badge";
import { Progress } from "@/components/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/dialog";
import { usePrivy } from "@privy-io/react-auth";
import { newHttpBatchRpcSession } from "capnweb";
import type { AuthTarget } from "@/lib/rpc-client";
import { API_URL } from "@/config";
import { toast } from "sonner";

const BSC_TOKENS: Record<string, string> = {
  usdt: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
  usdc: "0x64544969ed7EBf5f083679233325356EbE738930",
  busd: "0xaB1a4d4f1D656d2450692D237fdD6C7f9146e814",
  wbnb: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
};

interface ParsedRow {
  recipient: string;
  amount: string;
  token: string;
}

interface SendResult {
  index: number;
  success: boolean;
  streamId?: number;
  error?: string;
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines
    .slice(1)
    .map((line) => {
      const values = line.split(",").map((v) => v.trim());
      return {
        recipient: values[headers.indexOf("recipient")] || "",
        amount: values[headers.indexOf("amount")] || "",
        token: values[headers.indexOf("token")] || "AlphaUSD",
      };
    })
    .filter((row) => row.recipient && row.amount);
}

function resolveTokenAddress(symbol: string): string {
  const key = symbol.toLowerCase();
  return BSC_TOKENS[key] || BSC_TOKENS["alphausd"];
}

export function CSVBatchDialog() {
  const { getAccessToken } = usePrivy();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback((file: File | undefined) => {
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      toast.error("please upload a .csv file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        toast.error("no valid rows found. ensure columns: recipient, amount, token");
        return;
      }
      setRows(parsed);
      setFileName(file.name);
      setResults([]);
      setProgress(0);
    };
    reader.readAsText(file);
  }, []);

  const handleReset = useCallback(() => {
    setRows([]);
    setFileName(null);
    setResults([]);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleSendAll = useCallback(async () => {
    if (rows.length === 0) return;
    setSending(true);
    setResults([]);
    setProgress(0);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("not authenticated");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const session = await batch.authenticate({ accessToken: token });

      const batchPayload = rows.map((row, i) => ({
        recipientAddress: row.recipient,
        amount: row.amount,
        tokenAddress: resolveTokenAddress(row.token),
        name: `batch-${fileName}-${i + 1}`,
      }));

      setProgress(50); // Show indeterminate progress during batch call

      const batchResult = await session.batchCreateStreams({ streams: batchPayload });

      const allResults: SendResult[] = batchResult.results.map((r, i) => ({
        index: i,
        success: r.success,
        streamId: r.streamId,
        error: r.error,
      }));

      setResults(allResults);
      setProgress(100);

      const successCount = allResults.filter((r) => r.success).length;
      const failCount = allResults.filter((r) => !r.success).length;

      if (failCount === 0) {
        toast.success(`all ${successCount} payments sent successfully`);
      } else {
        toast.warning(`${successCount} succeeded, ${failCount} failed`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "sending failed");
    } finally {
      setSending(false);
    }
  }, [rows, fileName, getAccessToken]);

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <button className="px-6 py-4 text-lg rounded-full border border-border text-foreground font-medium hover:border-primary/50 transition-all flex items-center gap-2">
          <Upload className="w-4 h-4" />
          <span className="lowercase">send to many</span>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="lowercase">send to multiple people</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload Zone */}
          {rows.length === 0 && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? "border-primary/60 bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleFile(e.dataTransfer.files[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-foreground lowercase mb-1">
                  drop your csv file here or click to browse
                </p>
                <p className="text-xs text-muted-foreground lowercase">
                  columns: recipient, amount, token
                </p>
              </div>

              {/* Example CSV */}
              <div className="rounded-lg border border-border p-4">
                <div className="text-xs text-muted-foreground lowercase mb-2">example csv format</div>
                <pre className="text-xs font-mono text-muted-foreground">
{`recipient,amount,token
0x031891A6...abcd,1000,AlphaUSD
alice@example.com,2500,BetaUSD
0xAcF8dBD0...ef01,500,pathUSD`}
                </pre>
              </div>
            </>
          )}

          {/* Preview Table */}
          {rows.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground lowercase">{fileName}</span>
                  <Badge variant="secondary" className="lowercase">
                    {rows.length} {rows.length === 1 ? "row" : "rows"}
                  </Badge>
                </div>
                {!sending && results.length === 0 && (
                  <Button variant="ghost" size="sm" onClick={handleReset} className="lowercase">
                    clear
                  </Button>
                )}
              </div>

              <div className="rounded-lg border border-border overflow-hidden max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left p-3 text-xs text-muted-foreground lowercase font-medium">#</th>
                      <th className="text-left p-3 text-xs text-muted-foreground lowercase font-medium">recipient</th>
                      <th className="text-left p-3 text-xs text-muted-foreground lowercase font-medium">amount</th>
                      <th className="text-left p-3 text-xs text-muted-foreground lowercase font-medium">token</th>
                      {results.length > 0 && (
                        <th className="text-left p-3 text-xs text-muted-foreground lowercase font-medium">status</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const result = results.find((r) => r.index === i);
                      return (
                        <tr key={i} className="border-b border-border/50 last:border-0">
                          <td className="p-3 text-muted-foreground text-xs">{i + 1}</td>
                          <td className="p-3 font-mono text-xs truncate max-w-[200px]">{row.recipient}</td>
                          <td className="p-3 font-mono text-xs">{row.amount}</td>
                          <td className="p-3 text-xs lowercase">{row.token}</td>
                          {results.length > 0 && (
                            <td className="p-3">
                              {result ? (
                                result.success ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <XCircle className="w-4 h-4 text-destructive shrink-0" />
                                    <span className="text-xs text-destructive truncate max-w-[100px]">
                                      {result.error}
                                    </span>
                                  </span>
                                )
                              ) : sending ? (
                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                              ) : null}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Progress */}
              {sending && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-xs text-muted-foreground text-center lowercase">
                    sending {Math.round(progress)}% ({results.length}/{rows.length})
                  </p>
                </div>
              )}

              {/* Results Summary */}
              {results.length > 0 && !sending && (
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <div className="text-sm font-medium lowercase">all done!</div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span className="lowercase">{successCount} succeeded</span>
                    </div>
                    {failCount > 0 && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <XCircle className="w-4 h-4 text-destructive" />
                        <span className="lowercase">{failCount} failed</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2">
                {results.length > 0 && !sending ? (
                  <>
                    <Button variant="outline" onClick={handleReset} className="lowercase">
                      new batch
                    </Button>
                    <Button onClick={() => setDialogOpen(false)} className="lowercase">
                      done
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={handleReset} disabled={sending} className="lowercase">
                      cancel
                    </Button>
                    <Button onClick={handleSendAll} disabled={sending} className="lowercase">
                      {sending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          sending...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          send all ({rows.length})
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
