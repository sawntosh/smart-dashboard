import { describe, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { createDashboardRouter } from "../src/modules/dashboard/dashboard.routes.js";
import { parseWindowDays } from "../src/modules/dashboard/dashboard.controller.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import app from "../src/app.js";

const CATEGORIES = [
  { id: "cat_web", name: "Web Development", color: "#aa3bff" },
  { id: "cat_design", name: "Design", color: "#3b82f6" },
];

const SERVICES = [
  { id: "a", name: "Hosting", category: "cat_web", cost: 20, billingCycle: "monthly", renewalDate: "2026-10-03", status: "active" },
  { id: "b", name: "Figma", category: "cat_design", cost: 120, billingCycle: "yearly", renewalDate: "2026-09-25", status: "active" },
  { id: "c", name: "Old tool", category: "cat_web", cost: 50, billingCycle: "monthly", renewalDate: "2026-10-02", status: "inactive" },
  { id: "d", name: "Domain", category: "cat_web", cost: 30, billingCycle: "quarterly", renewalDate: "2026-11-20", status: "active" },
];

// 1 Oct 2026, midday local time.
const now = () => new Date(2026, 9, 1, 12);

function makeApp(getData = async () => ({ services: SERVICES, categories: CATEGORIES })) {
  const testApp = express();
  testApp.use("/api/dashboard", createDashboardRouter({ getData, now }));
  testApp.use(errorHandler);
  return testApp;
}

describe("GET /api/dashboard", () => {
  test("returns summary, category spend and renewals together", async () => {
    const res = await request(makeApp()).get("/api/dashboard");
    assert.equal(res.status, 200);
    assert.equal(res.body.generatedFor, "2026-10-01");
    assert.equal(res.body.summary.totalServices, 4);
    assert.equal(res.body.summary.monthlySpend, 40); // 20 + 120/12 + 30/3
    assert.equal(res.body.summary.yearlySpend, 480);
    assert.equal(res.body.summary.nextRenewal.name, "Hosting");
    assert.equal(res.body.spendByCategory[0].id, "cat_web");
    assert.deepEqual(res.body.renewals.overdue.map((r) => r.name), ["Figma"]);
  });

  test("passes the logged-in user to the data source", async () => {
    let seenUser = "not called";
    const testApp = express();
    testApp.use((req, res, next) => {
      req.user = { _id: "user1" };
      next();
    });
    testApp.use(
      "/api/dashboard",
      createDashboardRouter({
        now,
        getData: async (user) => {
          seenUser = user;
          return { services: [], categories: [] };
        },
      }),
    );
    await request(testApp).get("/api/dashboard/summary");
    assert.deepEqual(seenUser, { _id: "user1" });
  });
});

describe("GET /api/dashboard/summary", () => {
  test("returns counts and spend", async () => {
    const res = await request(makeApp()).get("/api/dashboard/summary");
    assert.equal(res.status, 200);
    assert.equal(res.body.activeServices, 3);
    assert.equal(res.body.inactiveServices, 1);
    assert.equal(res.body.monthlySpend, 40);
  });
});

describe("GET /api/dashboard/spend-by-category", () => {
  test("returns categories ordered by monthly spend", async () => {
    const res = await request(makeApp()).get("/api/dashboard/spend-by-category");
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.map((r) => [r.name, r.monthly, r.share]),
      [
        ["Web Development", 30, 75],
        ["Design", 10, 25],
      ],
    );
  });
});

describe("GET /api/dashboard/renewals", () => {
  test("defaults to a 7-day window", async () => {
    const res = await request(makeApp()).get("/api/dashboard/renewals");
    assert.equal(res.status, 200);
    assert.equal(res.body.windowDays, 7);
    assert.deepEqual(res.body.upcoming.map((r) => r.name), ["Hosting"]);
  });

  test("accepts a custom window", async () => {
    const res = await request(makeApp()).get("/api/dashboard/renewals?days=60");
    assert.deepEqual(res.body.upcoming.map((r) => r.name), ["Hosting", "Domain"]);
  });

  for (const bad of ["0", "-3", "2.5", "abc", "366"]) {
    test(`rejects days=${bad} with 400`, async () => {
      const res = await request(makeApp()).get(`/api/dashboard/renewals?days=${bad}`);
      assert.equal(res.status, 400);
      assert.match(res.body.message, /days/);
    });
  }
});

describe("errors", () => {
  test("data source errors keep their status code", async () => {
    const failing = async () => {
      throw Object.assign(new Error("Database not connected."), { status: 503 });
    };
    const res = await request(makeApp(failing)).get("/api/dashboard");
    assert.equal(res.status, 503);
    assert.equal(res.body.message, "Database not connected.");
  });

  test("the real app answers 503 while MongoDB is not connected", async () => {
    const res = await request(app).get("/api/dashboard");
    assert.equal(res.status, 503);
  });
});

describe("parseWindowDays", () => {
  test("defaults and accepts the allowed range", () => {
    assert.equal(parseWindowDays(undefined), 7);
    assert.equal(parseWindowDays(""), 7);
    assert.equal(parseWindowDays("1"), 1);
    assert.equal(parseWindowDays("365"), 365);
  });
});
