import { Router } from "express";
import { TaskController } from "../controllers/task.controller";

const router = Router();

router.get("/", TaskController.getTasks);
router.post("/", TaskController.createTask);
router.patch("/by-number/:taskNumber", TaskController.updateTaskByNumber);
router.delete("/by-number/:taskNumber", TaskController.deleteTaskByNumber);

export default router;
