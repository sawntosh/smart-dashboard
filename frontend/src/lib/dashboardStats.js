// Pure dashboard calculations for the frontend's local (no-API) mode. Mirrors
// backend/src/modules/dashboard/dashboard.stats.js and returns the same shape
// as GET /api/dashboard, so the dashboard page renders either source unchanged.
// No React, no DOM. See dashboardStats.test.js.

export const DEFAULT_WINDOW_DAYS = 7;
export const UNKNOWN_CATEGORY = { id: "_unknown", name: "Unknown", color: "#8b8b8b" };

const MS_PER_DAY = 86_400_000;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})/;

export function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** A service's cost normalised to a per-month figure (one-time counts as 0). */
export function monthlyCost({ cost, billingCycle }) {
  const n = Number(cost) || 0;
  if (n <= 0) return 0;
  if (billingCycle === "monthly") return n;
  if (billingCycle === "quarterly") return n / 3;
  if (billingCycle === "yearly") return n / 12;
  return 0;
}

/** "YYYY-MM-DD" for a valid date string, otherwise null. */
export function toDateKey(value) {
  if (typeof value !== "string") return null;
  const m = value.match(DATE_KEY);
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return m[0];
}

/** Today's local calendar date as "YYYY-MM-DD". */
export function todayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function daysBetween(fromKey, toKey) {
  const utc = (key) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(toKey) - utc(fromKey)) / MS_PER_DAY);
}

const isActive = (s) => s?.status === "active";

function categoryLookup(categories) {
  return new Map((categories ?? []).map((c) => [String(c.id), c]));
}

function datedActive(services, today) {
  return (services ?? [])
    .filter(isActive)
    .map((service) => ({ service, dateKey: toDateKey(service.renewalDate) }))
    .filter((x) => x.dateKey !== null)
    .map((x) => ({ ...x, days: daysBetween(today, x.dateKey) }))
    .sort((a, b) => a.days - b.days || a.service.name.localeCompare(b.service.name));
}

function renewalItem({ service, dateKey, days }, lookup) {
  const cat = lookup.get(String(service.category)) ?? UNKNOWN_CATEGORY;
  return {
    id: String(service.id),
    name: service.name,
    category: service.category == null ? null : String(service.category),
    categoryName: cat.name,
    categoryColor: cat.color,
    cost: roundMoney(service.cost),
    billingCycle: service.billingCycle,
    renewalDate: dateKey,
    daysUntil: days,
  };
}

export function summarize(services, categories, today = todayKey()) {
  const list = services ?? [];
  const active = list.filter(isActive);
  const monthly = active.reduce((sum, s) => sum + monthlyCost(s), 0);
  const next = datedActive(list, today).find((x) => x.days >= 0);
  return {
    totalServices: list.length,
    activeServices: active.length,
    inactiveServices: list.length - active.length,
    monthlySpend: roundMoney(monthly),
    yearlySpend: roundMoney(monthly * 12),
    nextRenewal: next ? renewalItem(next, categoryLookup(categories)) : null,
  };
}

export function spendByCategory(services, categories) {
  const lookup = categoryLookup(categories);
  const groups = new Map();
  for (const s of (services ?? []).filter(isActive)) {
    const amount = monthlyCost(s);
    if (amount <= 0) continue;
    const cat = lookup.get(String(s.category)) ?? UNKNOWN_CATEGORY;
    const key = String(cat.id);
    const row = groups.get(key) ?? { id: key, name: cat.name, color: cat.color, count: 0, monthly: 0 };
    row.count += 1;
    row.monthly += amount;
    groups.set(key, row);
  }
  const total = [...groups.values()].reduce((sum, r) => sum + r.monthly, 0);
  return [...groups.values()]
    .map((r) => ({
      ...r,
      monthly: roundMoney(r.monthly),
      yearly: roundMoney(r.monthly * 12),
      share: total > 0 ? Math.round((r.monthly / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.monthly - a.monthly || a.name.localeCompare(b.name));
}

export function renewalsOverview(services, categories, today = todayKey(), windowDays = DEFAULT_WINDOW_DAYS) {
  const lookup = categoryLookup(categories);
  const dated = datedActive(services, today);
  return {
    windowDays,
    upcoming: dated.filter((x) => x.days >= 0 && x.days <= windowDays).map((x) => renewalItem(x, lookup)),
    overdue: dated.filter((x) => x.days < 0).map((x) => renewalItem(x, lookup)),
  };
}

export function buildDashboard(services, categories, { today = todayKey(), windowDays = DEFAULT_WINDOW_DAYS } = {}) {
  return {
    generatedFor: today,
    summary: summarize(services, categories, today),
    spendByCategory: spendByCategory(services, categories),
    renewals: renewalsOverview(services, categories, today, windowDays),
  };
}
