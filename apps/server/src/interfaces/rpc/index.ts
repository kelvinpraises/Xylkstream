import { Router } from "express";

import externalRouter from "@/interfaces/rpc/external";
import internalRouter from "@/interfaces/rpc/internal";

const router = Router();

router.use("/internal", internalRouter);
router.use("/external", externalRouter);

export default router;
