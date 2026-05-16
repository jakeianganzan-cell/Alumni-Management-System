import express from "express";
import { authenticateToken } from "../middleware/auth";
import {
  assertTracerAdminAccess,
  exportMyTracerRecord,
  exportTracerArchive,
  exportTracerRecord,
  exportTracerReports,
  getMyTracer,
  getTracerAnalytics,
  listTracerRecords,
  previewMyTracerRecord,
  reopenTracerSubmission,
  saveTracerDraft,
  submitTracer,
} from "../controllers/tracer.controller";

const router = express.Router();

router.get("/", authenticateToken, getMyTracer);
router.put("/draft", authenticateToken, saveTracerDraft);
router.post("/save-draft", authenticateToken, saveTracerDraft);
router.post("/submit", authenticateToken, submitTracer);
router.post("/", authenticateToken, submitTracer);
router.get("/my-form", authenticateToken, getMyTracer);
router.get("/my-pdf/preview", authenticateToken, previewMyTracerRecord);
router.get("/my-pdf/download", authenticateToken, exportMyTracerRecord);
router.get("/export/me", authenticateToken, exportMyTracerRecord);
router.get("/export/me/preview", authenticateToken, previewMyTracerRecord);

router.get("/admin/records", authenticateToken, assertTracerAdminAccess, listTracerRecords);
router.get("/admin/analytics", authenticateToken, assertTracerAdminAccess, getTracerAnalytics);
router.post("/admin/:userId/reopen", authenticateToken, assertTracerAdminAccess, reopenTracerSubmission);
router.get("/admin/export/all", authenticateToken, assertTracerAdminAccess, exportTracerArchive);
router.get("/admin/export/:userId", authenticateToken, assertTracerAdminAccess, exportTracerRecord);
router.get("/admin/reports/export", authenticateToken, assertTracerAdminAccess, exportTracerReports);

export default router;
