import {
  DEFAULT_WINDOW_DAYS,
  buildDashboard,
  renewalsOverview,
  spendByCategory,
  summarize,
  todayKey,
} from "./dashboard.stats.js";

export const MAX_WINDOW_DAYS = 365;

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

/** `?days=` for the upcoming-renewals window: whole number 1–365, default 7. */
export function parseWindowDays(value) {
  if (value === undefined || value === "") return DEFAULT_WINDOW_DAYS;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_WINDOW_DAYS) {
    throw badRequest(`"days" must be a whole number between 1 and ${MAX_WINDOW_DAYS}.`);
  }
  return n;
}

/**
 * Handlers take their data source and clock as arguments so tests can pass
 * fakes instead of a real database and today's date.
 */
export function createDashboardController({ getData, now = () => new Date() }) {
  async function load(req) {
    const { services, categories } = await getData(req.user);
    return { services, categories, today: todayKey(now()) };
  }

  return {
    async overview(req, res) {
      const windowDays = parseWindowDays(req.query.days);
      const { services, categories, today } = await load(req);
      res.json(buildDashboard(services, categories, { today, windowDays }));
    },

    async summary(req, res) {
      const { services, categories, today } = await load(req);
      res.json(summarize(services, categories, today));
    },

    async spendByCategory(req, res) {
      const { services, categories } = await load(req);
      res.json(spendByCategory(services, categories));
    },

    async renewals(req, res) {
      const windowDays = parseWindowDays(req.query.days);
      const { services, categories, today } = await load(req);
      res.json(renewalsOverview(services, categories, today, windowDays));
    },
  };
}
