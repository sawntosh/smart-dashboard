// Member 3 — dashboard & analytics. Mounted at /api/dashboard in src/app.js.
//
//   GET /                   everything below in one response (used by the dashboard page)
//   GET /summary            counts, monthly + yearly spend, next renewal
//   GET /spend-by-category  monthly spend per category, biggest first
//   GET /renewals?days=7    upcoming (within N days) and overdue renewals
//
// When auth is ready, add Member 1's requireAuth here with router.use(requireAuth).
import { Router } from "express";
import { createDashboardController } from "./dashboard.controller.js";
import { getDashboardData } from "./dashboard.repository.js";

export function createDashboardRouter({ getData = getDashboardData, now } = {}) {
  const router = Router();
  const controller = createDashboardController({ getData, now });

  router.get("/", controller.overview);
  router.get("/summary", controller.summary);
  router.get("/spend-by-category", controller.spendByCategory);
  router.get("/renewals", controller.renewals);

  return router;
}

export default createDashboardRouter();
