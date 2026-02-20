import { Router } from "express";
import streamController from "@/interfaces/api/controllers/stream-controller";

const router = Router();

router.get("/:streamId", streamController.streamVestingLogs);

export default router;
