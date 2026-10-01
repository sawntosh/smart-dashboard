// Dashboard data access. With VITE_API_URL set, stats come from the Express API
// (GET /api/dashboard); otherwise useDashboard computes the same shape locally
// with lib/dashboardStats.js from the localStorage services.
import { API_ENABLED, apiGet } from "./apiClient";

export const DASHBOARD_SOURCE = API_ENABLED ? "api" : "local";

export function fetchDashboard({ windowDays = 7, signal } = {}) {
  return apiGet(`/dashboard?days=${encodeURIComponent(windowDays)}`, { signal });
}
