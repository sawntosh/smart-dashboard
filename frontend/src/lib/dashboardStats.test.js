import { describe, it, expect } from "vitest";
import {
  buildDashboard,
  daysBetween,
  monthlyCost,
  renewalsOverview,
  spendByCategory,
  summarize,
  toDateKey,
  todayKey,
} from "./dashboardStats";
import SEED from "../data/services.json";
import { DEFAULTS } from "../services/settingsService";

const TODAY = "2026-10-01";
const CATEGORIES = [
  { id: "cat_web", name: "Web Development", color: "#aa3bff" },
  { id: "cat_design", name: "Design", color: "#3b82f6" },
];

const svc = (o) => ({
  id: o.name,
  category: "cat_web",
  cost: 10,
  billingCycle: "monthly",
  renewalDate: "2026-10-15",
  status: "active",
  ...o,
});

describe("monthlyCost", () => {
  it("normalises billing cycles to a month", () => {
    expect(monthlyCost({ cost: 30, billingCycle: "monthly" })).toBe(30);
    expect(monthlyCost({ cost: 30, billingCycle: "quarterly" })).toBe(10);
    expect(monthlyCost({ cost: 120, billingCycle: "yearly" })).toBe(10);
    expect(monthlyCost({ cost: 120, billingCycle: "one_time" })).toBe(0);
  });

  it("ignores invalid and negative costs", () => {
    expect(monthlyCost({ cost: "abc", billingCycle: "monthly" })).toBe(0);
    expect(monthlyCost({ cost: -1, billingCycle: "monthly" })).toBe(0);
  });
});

describe("dates", () => {
  it("validates date keys", () => {
    expect(toDateKey("2026-10-01")).toBe("2026-10-01");
    expect(toDateKey("2026-02-30")).toBeNull();
    expect(toDateKey("")).toBeNull();
    expect(toDateKey(undefined)).toBeNull();
  });

  it("uses the local calendar day for today", () => {
    expect(todayKey(new Date(2026, 9, 1, 23, 59))).toBe("2026-10-01");
  });

  it("counts days across month and year ends", () => {
    expect(daysBetween("2026-10-01", "2026-10-08")).toBe(7);
    expect(daysBetween("2026-10-01", "2026-09-30")).toBe(-1);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });
});

describe("summarize", () => {
  it("sums active spend and finds the next renewal", () => {
    const s = summarize(
      [
        svc({ name: "A", cost: 20, renewalDate: "2026-10-20" }),
        svc({ name: "B", cost: 120, billingCycle: "yearly", renewalDate: "2026-10-05" }),
        svc({ name: "C", cost: 99, status: "inactive", renewalDate: "2026-10-02" }),
      ],
      CATEGORIES,
      TODAY,
    );
    expect(s).toMatchObject({
      totalServices: 3,
      activeServices: 2,
      inactiveServices: 1,
      monthlySpend: 30,
      yearlySpend: 360,
    });
    expect(s.nextRenewal).toMatchObject({ name: "B", daysUntil: 4 });
  });

  it("returns zeros for no services", () => {
    expect(summarize([], [], TODAY)).toMatchObject({ totalServices: 0, monthlySpend: 0, nextRenewal: null });
  });
});

describe("spendByCategory", () => {
  it("groups, sorts and computes share", () => {
    const rows = spendByCategory(
      [
        svc({ name: "A", category: "cat_design", cost: 10 }),
        svc({ name: "B", category: "cat_web", cost: 30 }),
        svc({ name: "C", category: "gone", cost: 10 }),
      ],
      CATEGORIES,
    );
    expect(rows.map((r) => [r.name, r.monthly, r.share])).toEqual([
      ["Web Development", 30, 60],
      ["Design", 10, 20],
      ["Unknown", 10, 20],
    ]);
  });
});

describe("renewalsOverview", () => {
  it("splits upcoming (inclusive window) and overdue", () => {
    const r = renewalsOverview(
      [
        svc({ name: "Today", renewalDate: "2026-10-01" }),
        svc({ name: "Edge", renewalDate: "2026-10-04" }),
        svc({ name: "Out", renewalDate: "2026-10-05" }),
        svc({ name: "Late", renewalDate: "2026-09-29" }),
        svc({ name: "Off", renewalDate: "2026-09-01", status: "inactive" }),
      ],
      CATEGORIES,
      TODAY,
      3,
    );
    expect(r.upcoming.map((x) => x.name)).toEqual(["Today", "Edge"]);
    expect(r.overdue.map((x) => [x.name, x.daysUntil])).toEqual([["Late", -2]]);
    expect(r.upcoming[0]).toMatchObject({ categoryName: "Web Development", categoryColor: "#aa3bff" });
  });
});

describe("buildDashboard with the app's sample data", () => {
  const d = buildDashboard(SEED, DEFAULTS.categories, { today: TODAY, windowDays: 30 });

  it("category totals add up to the monthly spend", () => {
    const sum = d.spendByCategory.reduce((acc, r) => acc + r.monthly, 0);
    expect(sum).toBeCloseTo(d.summary.monthlySpend, 1);
  });

  it("every active dated service is either upcoming, overdue or further out", () => {
    const listed = d.renewals.upcoming.length + d.renewals.overdue.length;
    const activeDated = SEED.filter((s) => s.status === "active" && toDateKey(s.renewalDate)).length;
    expect(listed).toBeLessThanOrEqual(activeDated);
    for (const item of d.renewals.upcoming) expect(item.daysUntil).toBeGreaterThanOrEqual(0);
    for (const item of d.renewals.overdue) expect(item.daysUntil).toBeLessThan(0);
  });
});
