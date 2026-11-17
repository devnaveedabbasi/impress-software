import { Router } from "express";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import vendorClaimNoteController from "../controllers/vendor-claim-note.controller.js";
import {
    createVendorClaimNoteSchema,
    updateVendorClaimNoteSchema,
    vendorClaimNoteIdSchema,
} from "../validations/vendor-claim-note.validation.js";

const router = Router();

router.use(authorizeToken);

router
    .route("/")
    .get(checkPermission("vendor_claim_note:view"), vendorClaimNoteController.getAllVendorClaimNotes)
    .post(checkPermission("vendor_claim_note:create"), validate(createVendorClaimNoteSchema), vendorClaimNoteController.createVendorClaimNote);

router
    .route("/next-id")
    .get(checkPermission("vendor_claim_note:view", "vendor_claim_note:create"), vendorClaimNoteController.getNextIdVendorClaimNote);

router
    .route("/received-items")
    .get(
        checkPermission("vendor_claim_note:view", "vendor_claim_note:create", "vendor_claim_note:update"),
        vendorClaimNoteController.getReceivedItems
    );

router
    .route("/:id")
    .get(checkPermission("vendor_claim_note:view"), validate(vendorClaimNoteIdSchema), vendorClaimNoteController.getByIdVendorClaimNote)
    .put(checkPermission("vendor_claim_note:update"), validate(updateVendorClaimNoteSchema), vendorClaimNoteController.updateVendorClaimNote)
    .delete(checkPermission("vendor_claim_note:delete"), validate(vendorClaimNoteIdSchema), vendorClaimNoteController.deleteVendorClaimNote);

export default router;
