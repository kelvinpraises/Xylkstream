import { useState, useRef, useCallback } from "react";
import { Upload, FileText, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/atoms/button";
import { Badge } from "@/components/atoms/badge";
import { Progress } from "@/components/atoms/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/molecules/dialog";
import { toast } from "sonner";
import { useCreateStream } from "@/hooks/use-stream-create";
import { useChain } from "@/providers/chain-provider";
import { getSendableTokens } from "@/config/chains";
import { getPublicClient, erc20Abi } from "@/utils/streams";

const DEFAULT_DURATION_SECONDS = 30 * 24 * 60 * 60; // 30 days

interface ParsedRow {
  recipient: string;
  amount: string;
  token: string;
}

interface SendResult {
  index: number;
  success: boolean;
  txHash?: string;
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

export function CSVBatchDialog() {
  const sendStream = useCreateStream();
  const { chainConfig } = useChain();
  const tokens = getSendableTokens(chainConfig.contracts);

  const resolveTokenAddress = (symbol: string): string => {
    const key = symbol.toLowerCase();
    const match = tokens.find((t) => t.symbol.toLowerCase() === key);
    return match?.address ?? tokens[0]?.address ?? "";
  };
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

    const allResults: SendResult[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const tokenAddress = resolveTokenAddress(row.token) as `0x${string}`;
      const client = getPublicClient(chainConfig.chain);
      const tokenDecimals = await client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "decimals",
      }) as number;

      try {
        const result = await sendStream.mutateAsync({
          recipientAddress: row.recipient as `0x${string}`,
          tokenAddress,
          totalAmount: row.amount,
          tokenDecimals,
          durationSeconds: DEFAULT_DURATION_SECONDS,
          tokenSymbol: row.token,
        });
        allResults.push({ index: i, success: true, txHash: result.txHash });
      } catch (err) {
        allResults.push({
          index: i,
          success: false,
          error: err instanceof Error ? err.message : "unknown error",
        });
      }

      setResults([...allResults]);
      setProgress(Math.round(((i + 1) / rows.length) * 100));
    }

    const successCount = allResults.filter((r) => r.success).length;
    const failCount = allResults.filter((r) => !r.success).length;

    if (failCount === 0) {
      toast.success(`all ${successCount} payments sent successfully`);
    } else {
      toast.warning(`${successCount} succeeded, ${failCount} failed`);
    }

    setSending(false);
  }, [rows, sendStream]);

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
