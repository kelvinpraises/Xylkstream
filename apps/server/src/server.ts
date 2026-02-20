import cors from "cors";
import dotenv from "dotenv";
import express from "express";

import eventRecoveryCron from "@/infrastructure/cron/system/event-recovery";
import pluginCleanupCron from "@/infrastructure/cron/system/plugin-cleanup";
import pluginDiscoveryCron from "@/infrastructure/cron/system/plugin-discovery";
import "@/infrastructure/queue/scheduled-events/worker";
import { errorHandler } from "@/interfaces/api/middleware/errorHandler";
import streamsRoutes from "@/interfaces/api/routes/streams";
import rpcRouter from "@/interfaces/rpc";
import { validateEnvironment } from "@/utils/validate-env";

dotenv.config();

// Validate environment variables on startup
validateEnvironment();

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

// Use routes
app.use("/events/streams", streamsRoutes);
app.use("/rpc", rpcRouter);

app.use(errorHandler);

const BACKEND_PORT = process.env.BACKEND_PORT || 4848;

if (!process.env.BACKEND_PORT) {
  console.warn(
    `[xylkstream-server]: BACKEND_PORT is not set, using default port ${BACKEND_PORT}`,
  );
}

app.listen(BACKEND_PORT, async () => {
  console.log(`[xylkstream-server]: running at http://localhost:${BACKEND_PORT}`);

  // Start crons
  eventRecoveryCron.start();
  pluginCleanupCron.start();
  pluginDiscoveryCron.start();
});
