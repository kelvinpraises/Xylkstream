import * as accountTools from "@/interfaces/neural/tools/account";
import * as journalTools from "@/interfaces/neural/tools/journal";
import * as streamTools from "@/interfaces/neural/tools/stream";

export const allTools = {
  ...accountTools,
  ...journalTools,
  ...streamTools,
};
