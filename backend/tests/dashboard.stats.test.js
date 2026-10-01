import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  roundMoney,
  monthlyCost,
  toDateKey,
  todayKey,
  daysBetween,
  summarize,
  spendByCategory,
  renewalsOverview,
  buildDashboard,
  UNKNOWN_CATEGORY,
} from "../src/modules/dashboard/dashboard.stats.js";

const TODAY = "2026-10-01";

const CATEGORIES = [
  { id: "cat_web", name: "Web Development", color: "#aa3bff" },
  { id: "cat_design", name: "Design", color: "#3b82f6" },
];

function svc(overrides) {
  return {
    id: overrides.name.toLowerCase(),
    category: "cat_web",
    cost: 10,
    billingCycle: "monthly",
    renewalDate: "2026-10-15",
    status: "active",
    ...overrides,
  };
}

describe("roundMoney", () => {
  test("rounds to cents", () => {
    assert.equal(roundMoney(19.999999), 20);
    assert.equal(roundMoney(10 / 3), 3.33);
  });
  test("treats junk as 0", () => {
    assert.equal(roundMoney("abc"), 0);
    assert.equal(roundMoney(undefined), 0);
  });
});

describe("monthlyCost", () => {
  test("normalises each billing cycle to a month", () => {
    assert.equal(monthlyCost({ cost: 30, billingCycle: "monthly" }), 30);
    assert.equal(monthlyCost({ cost: 30, billingCycle: "quarterly" }), 10);
    assert.equal(monthlyCost({ cost: 120, billingCycle: "yearly" }), 10);
  });
  test("one-time and unknown cycles count as 0", () => {
    assert.equal(monthlyCost({ cost: 500, billingCycle: "one_time" }), 0);
    assert.equal(monthlyCost({ cost: 500, billingCycle: "weekly" }), 0);
  });
  test("accepts numeric strings, ignores bad or negative costs", () => {
    assert.equal(monthlyCost({ cost: "12.5", billingCycle: "monthly" }), 12.5);
    assert.equal(monthlyCost({ cost: "x", billingCycle: "monthly" }), 0);
    assert.equal(monthlyCost({ cost: -5, billingCycle: "monthly" }), 0);
  });
});

describe("dates", () => {
  test("toDateKey accepts ISO strings and Date objects", () => {
    assert.equal(toDateKey("2026-11-01"), "2026-11-01");
    assert.equal(toDateKey("2026-11-01T00:00:00.000Z"), "2026-11-01");
    assert.equal(toDateKey(new Date("2026-11-01")), "2026-11-01");
  });
  test("toDateKey rejects invalid values", () => {
    assert.equal(toDateKey("2026-02-30"), null);
    assert.equal(toDateKey("not a date"), null);
    assert.equal(toDateKey(""), null);
    assert.equal(toDateKey(null), null);
    assert.equal(toDateKey(new Date("nope")), null);
  });
  test("todayKey uses the local calendar date", () => {
    assert.equal(todayKey(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
  });
  test("daysBetween counts whole days across months and years", () => {
    assert.equal(daysBetween("2026-10-01", "2026-10-01"), 0);
    assert.equal(daysBetween("2026-10-01", "2026-10-08"), 7);
    assert.equal(daysBetween("2026-10-01", "2026-09-30"), -1);
    assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
    assert.equal(daysBetween("2028-02-28", "2028-03-01"), 2); // leap year
  });
});

describe("summarize", () => {
  test("counts services and sums active spend only", () => {
    const services = [
      svc({ name: "A", cost: 20 }),
      svc({ name: "B", cost: 120, billingCycle: "yearly" }),
      svc({ name: "C", cost: 99, status: "inactive" }),
    ];
    const s = summarize(services, CATEGORIES, TODAY);
    assert.equal(s.totalServices, 3);
    assert.equal(s.activeServices, 2);
    assert.equal(s.inactiveServices, 1);
    assert.equal(s.monthlySpend, 30);
    assert.equal(s.yearlySpend, 360);
  });

  test("yearly estimate is computed before rounding", () => {
    const s = summarize([svc({ name: "Q", cost: 10, billingCycle: "quarterly" })], [], TODAY);
    assert.equal(s.monthlySpend, 3.33);
    assert.equal(s.yearlySpend, 40);
  });

  test("next renewal is the soonest active one from today onwards", () => {
    const services = [
      svc({ name: "Past", renewalDate: "2026-09-20" }),
      svc({ name: "Later", renewalDate: "2026-12-01" }),
      svc({ name: "Soon", renewalDate: "2026-10-03" }),
      svc({ name: "Off", renewalDate: "2026-10-02", status: "inactive" }),
    ];
    const s = summarize(services, CATEGORIES, TODAY);
    assert.equal(s.nextRenewal.name, "Soon");
    assert.equal(s.nextRenewal.daysUntil, 2);
    assert.equal(s.nextRenewal.categoryName, "Web Development");
  });

  test("a renewal due today counts as the next renewal", () => {
    const s = summarize([svc({ name: "Today", renewalDate: TODAY })], CATEGORIES, TODAY);
    assert.equal(s.nextRenewal.daysUntil, 0);
  });

  test("empty input gives zeros and no next renewal", () => {
    const s = summarize([], [], TODAY);
    assert.deepEqual(s, {
      totalServices: 0,
      activeServices: 0,
      inactiveServices: 0,
      monthlySpend: 0,
      yearlySpend: 0,
      nextRenewal: null,
    });
  });
});

describe("spendByCategory", () => {
  test("groups monthly spend by category, biggest first, with share", () => {
    const rows = spendByCategory(
      [
        svc({ name: "A", category: "cat_web", cost: 10 }),
        svc({ name: "B", category: "cat_web", cost: 20 }),
        svc({ name: "C", category: "cat_design", cost: 120, billingCycle: "yearly" }),
      ],
      CATEGORIES,
    );
    assert.deepEqual(
      rows.map((r) => [r.id, r.count, r.monthly, r.yearly, r.share]),
      [
        ["cat_web", 2, 30, 360, 75],
        ["cat_design", 1, 10, 120, 25],
      ],
    );
    assert.equal(rows[0].color, "#aa3bff");
  });

  test("skips inactive, one-time and zero-cost services", () => {
    const rows = spendByCategory(
      [
        svc({ name: "Off", status: "inactive" }),
        svc({ name: "Once", billingCycle: "one_time", cost: 300 }),
        svc({ name: "Free", cost: 0 }),
      ],
      CATEGORIES,
    );
    assert.deepEqual(rows, []);
  });

  test("services with a missing category go under Unknown", () => {
    const rows = spendByCategory([svc({ name: "Lost", category: "cat_deleted" })], CATEGORIES);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, UNKNOWN_CATEGORY.id);
    assert.equal(rows[0].share, 100);
  });

  test("matches ObjectId-like category ids by string value", () => {
    const oid = { toString: () => "665f1c0000000000000000aa" };
    const rows = spendByCategory(
      [svc({ name: "A", category: oid })],
      [{ id: "665f1c0000000000000000aa", name: "Design", color: "#3b82f6" }],
    );
    assert.equal(rows[0].name, "Design");
  });

  test("shares add up to about 100", () => {
    const rows = spendByCategory(
      [
        svc({ name: "A", category: "cat_web", cost: 10 }),
        svc({ name: "B", category: "cat_design", cost: 10 }),
        svc({ name: "C", category: "x", cost: 10 }),
      ],
      CATEGORIES,
    );
    const total = rows.reduce((sum, r) => sum + r.share, 0);
    assert.ok(Math.abs(total - 100) < 0.5, `shares sum to ${total}`);
  });
});

describe("renewalsOverview", () => {
  const services = [
    svc({ name: "Today", renewalDate: "2026-10-01" }),
    svc({ name: "In7", renewalDate: "2026-10-08" }),
    svc({ name: "In8", renewalDate: "2026-10-09" }),
    svc({ name: "Yesterday", renewalDate: "2026-09-30" }),
    svc({ name: "LongAgo", renewalDate: "2026-08-01" }),
    svc({ name: "OffOverdue", renewalDate: "2026-09-01", status: "inactive" }),
    svc({ name: "NoDate", renewalDate: "" }),
  ];

  test("upcoming includes today through the window end, soonest first", () => {
    const r = renewalsOverview(services, CATEGORIES, TODAY, 7);
    assert.deepEqual(r.upcoming.map((x) => [x.name, x.daysUntil]), [
      ["Today", 0],
      ["In7", 7],
    ]);
    assert.equal(r.windowDays, 7);
  });

  test("overdue lists active past renewals, most overdue first", () => {
    const r = renewalsOverview(services, CATEGORIES, TODAY, 7);
    assert.deepEqual(r.overdue.map((x) => x.name), ["LongAgo", "Yesterday"]);
    assert.equal(r.overdue[1].daysUntil, -1);
  });

  test("window size is respected", () => {
    assert.equal(renewalsOverview(services, CATEGORIES, TODAY, 1).upcoming.length, 1);
    assert.equal(renewalsOverview(services, CATEGORIES, TODAY, 14).upcoming.length, 3);
  });

  test("items carry the fields the dashboard renders", () => {
    const [item] = renewalsOverview([svc({ name: "X", cost: 9.999 })], CATEGORIES, TODAY, 30).upcoming;
    assert.deepEqual(item, {
      id: "x",
      name: "X",
      category: "cat_web",
      categoryName: "Web Development",
      categoryColor: "#aa3bff",
      cost: 10,
      billingCycle: "monthly",
      renewalDate: "2026-10-15",
      daysUntil: 14,
    });
  });
});

describe("buildDashboard", () => {
  test("combines all sections for the given day", () => {
    const d = buildDashboard([svc({ name: "A" })], CATEGORIES, { today: TODAY, windowDays: 30 });
    assert.equal(d.generatedFor, TODAY);
    assert.equal(d.summary.totalServices, 1);
    assert.equal(d.spendByCategory.length, 1);
    assert.equal(d.renewals.upcoming.length, 1);
  });

  test("handles missing arrays without throwing", () => {
    const d = buildDashboard(undefined, undefined, { today: TODAY });
    assert.equal(d.summary.totalServices, 0);
    assert.deepEqual(d.spendByCategory, []);
    assert.deepEqual(d.renewals, { windowDays: 7, upcoming: [], overdue: [] });
  });
});
