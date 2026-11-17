import { Router } from "express";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import vendorBillController from "../controllers/vendor-bill.controller.js";
import {
    createVendorBillSchema,
    updateVendorBillSchema,
    vendorBillIdSchema,
    previewVendorBillSchema,
} from "../validations/vendor-bill.validation.js";

const router = Router();

router.use(authorizeToken);

router
    .route("/")
    .get(checkPermission("vendor_bill_posting:view"), vendorBillController.getAllVendorBills)
    .post(checkPermission("vendor_bill_posting:create"), validate(createVendorBillSchema), vendorBillController.createVendorBill);

router.get("/next-id", checkPermission("vendor_bill_posting:view", "vendor_bill_posting:create"), vendorBillController.getNextIdVendorBill);
router.get("/billable-inwards", checkPermission("vendor_bill_posting:view", "vendor_bill_posting:create"), vendorBillController.getBillableInwards);
router.get(
    "/preview",
    checkPermission("vendor_bill_posting:view", "vendor_bill_posting:create"),
    validate(previewVendorBillSchema),
    vendorBillController.previewVendorBill
);
router.get("/pending-report", checkPermission("vendor_bill_pending_report:view"), vendorBillController.getPendingReport);

// Approve = post the bill (it is locked afterwards)
router.post("/:id/approve", checkPermission("vendor_bill_posting:update"), validate(vendorBillIdSchema), vendorBillController.approveVendorBill);

router
    .route("/:id")
    .get(checkPermission("vendor_bill_posting:view"), validate(vendorBillIdSchema), vendorBillController.getByIdVendorBill)
    .put(checkPermission("vendor_bill_posting:update"), validate(updateVendorBillSchema), vendorBillController.updateVendorBill)
    .delete(checkPermission("vendor_bill_posting:delete"), validate(vendorBillIdSchema), vendorBillController.deleteVendorBill);

export default router;
