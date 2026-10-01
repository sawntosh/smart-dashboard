// Pure dashboard calculations: no Express, no database. Every function takes
// plain service/category objects so it can be unit-tested on its own
// (see tests/dashboard.stats.test.js).
//
// Service shape used here (same as the frontend's locked shape):
//   { id, name, category, cost, billingCycle, renewalDate, status }
// Category shape: { id, name, color }

export const DEFAULT_WINDOW_DAYS = 7;
export const UNKNOWN_CATEGORY = { id: "_unknown", name: "Unknown", color: "#8b8b8b" };

const MS_PER_DAY = 86_400_000;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})/;

/** Round to whole cents so totals never show float noise like 19.999999. */
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

export function isActive(service) {
  return service?.status === "active";
}

/**
 * Normalise a renewal date to "YYYY-MM-DD", or null if it isn't a valid date.
 * Accepts the frontend's ISO date strings and Date objects from MongoDB
 * (stored at UTC midnight, so the UTC calendar day is the intended day).
 */
export function toDateKey(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return null;
  const m = value.match(DATE_KEY);
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const check = new Date(Date.UTC(y, mo - 1, d));
  // Rejects impossible dates such as 2026-02-30.
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return m[0];
}

/** Today's calendar date ("YYYY-MM-DD") in the server's local time zone. */
export function todayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole days from one date key to another. Negative = `to` is in the past. */
export function daysBetween(fromKey, toKey) {
  const utc = (key) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(toKey) - utc(fromKey)) / MS_PER_DAY);
}

function categoryLookup(categories) {
  const map = new Map();
  for (const c of categories ?? []) map.set(String(c.id), c);
  return map;
}

/** Active services that have a valid renewal date, with days-until attached. */
function datedActive(services, today) {
  return (services ?? [])
    .filter(isActive)
    .map((s) => ({ service: s, dateKey: toDateKey(s.renewalDate) }))
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

/**
 * Headline numbers for the stat tiles. Spend counts active services only;
 * the yearly figure is the monthly run-rate x 12 (one-time costs excluded).
 */
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

/**
 * Monthly spend grouped by category, biggest first. Services whose category
 * no longer exists are grouped under "Unknown" instead of being dropped.
 * `share` is the percentage of total monthly spend (1 decimal place).
 */
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

/**
 * Active services renewing within `windowDays` (today counts as upcoming) and
 * those whose renewal date has already passed (most overdue first).
 */
export function renewalsOverview(services, categories, today = todayKey(), windowDays = DEFAULT_WINDOW_DAYS) {
  const lookup = categoryLookup(categories);
  const dated = datedActive(services, today);
  return {
    windowDays,
    upcoming: dated.filter((x) => x.days >= 0 && x.days <= windowDays).map((x) => renewalItem(x, lookup)),
    overdue: dated.filter((x) => x.days < 0).map((x) => renewalItem(x, lookup)),
  };
}

/** Everything the dashboard page needs, in one object. */
export function buildDashboard(services, categories, { today = todayKey(), windowDays = DEFAULT_WINDOW_DAYS } = {}) {
  return {
    generatedFor: today,
    summary: summarize(services, categories, today),
    spendByCategory: spendByCategory(services, categories),
    renewals: renewalsOverview(services, categories, today, windowDays),
  };
}
