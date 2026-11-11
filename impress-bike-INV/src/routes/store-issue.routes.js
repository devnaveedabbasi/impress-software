import { Router } from "express";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import storeIssueController from "../controllers/store-issue.controller.js";
import {
    createStoreIssueSchema,
    updateStoreIssueSchema,
    storeIssueIdSchema,
} from "../validations/store-issue.validation.js";

const router = Router();

router.use(authorizeToken);

router
    .route("/")
    .get(checkPermission("issue_from_line:view"), storeIssueController.getAllStoreIssues)
    .post(checkPermission("issue_from_line:create"), validate(createStoreIssueSchema), storeIssueController.createStoreIssue);

router
    .route("/next-id")
    .get(checkPermission("issue_from_line:view", "issue_from_line:create"), storeIssueController.getNextIdStoreIssue);

router
    .route("/:id")
    .get(checkPermission("issue_from_line:view"), validate(storeIssueIdSchema), storeIssueController.getByIdStoreIssue)
    .put(checkPermission("issue_from_line:update"), validate(updateStoreIssueSchema), storeIssueController.updateStoreIssue)
    .delete(checkPermission("issue_from_line:delete"), validate(storeIssueIdSchema), storeIssueController.deleteStoreIssue);

export default router;
