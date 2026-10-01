import { useCallback, useEffect, useMemo, useState } from "react";
import { useServices } from "../context/ServicesContext";
import { useSettings } from "../context/SettingsContext";
import { buildDashboard } from "../lib/dashboardStats";
import { DASHBOARD_SOURCE, fetchDashboard } from "../services/dashboardService";

/**
 * Dashboard stats in the shape of GET /api/dashboard, from the API when
 * VITE_API_URL is set, otherwise calculated from the local services.
 * Returns { data, loading, error, reload, source }.
 */
export function useDashboard(windowDays) {
  const local = useLocalDashboard(windowDays);
  const remote = useApiDashboard(windowDays, DASHBOARD_SOURCE === "api");
  return DASHBOARD_SOURCE === "api" ? remote : local;
}

function useLocalDashboard(windowDays) {
  const { services, loading, error, reload } = useServices();
  const { categories } = useSettings();

  const data = useMemo(
    () => (loading || error ? null : buildDashboard(services, categories, { windowDays })),
    [services, categories, loading, error, windowDays],
  );

  return { data, loading, error, reload, source: "local" };
}

function useApiDashboard(windowDays, enabled) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchDashboard({ windowDays, signal: controller.signal })
      .then((result) => setData(result))
      .catch((e) => {
        if (e?.name !== "AbortError") setError(e?.message || "Failed to load dashboard.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, windowDays, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { data, loading, error, reload, source: "api" };
}
