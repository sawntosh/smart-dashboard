# Dashboard & Analytics — Implementation, Testing and Evaluation

**Area:** Member 3 (dashboard summary statistics, spending analytics, renewals, charts)
**Stack:** Express 5 + MongoDB (Mongoose) backend, React 19 + Vite frontend

---

## 1. Implementation Overview

### 1.1 Scope

| Requirement | Where it is implemented |
|---|---|
| Dashboard summary statistics | `summarize()` → `GET /api/dashboard/summary` → stat tiles |
| Spending calculations (monthly / yearly) | `monthlyCost()`, `summarize()` |
| Spending by category | `spendByCategory()` → `GET /api/dashboard/spend-by-category` |
| Upcoming renewals | `renewalsOverview()` → `GET /api/dashboard/renewals?days=N` |
| Overdue renewals | `renewalsOverview()` (same endpoint) |
| Dashboard API endpoints | `backend/src/modules/dashboard/` |
| Frontend / API integration | `apiClient.js`, `dashboardService.js`, `useDashboard.js`, `pages/index.jsx` |
| Charts and visualisations | `CategorySpendChart` (bar), `SpendShareDonut` (donut) |
| Calculation testing | `backend/tests/dashboard.*.test.js`, `frontend/src/lib/dashboardStats.test.js` |

### 1.2 Architecture

```
React dashboard page
   └─ useDashboard(windowDays)
        ├─ API mode   (VITE_API_URL set) → dashboardService → apiClient → GET /api/dashboard
        └─ local mode (not set)          → lib/dashboardStats.js over localStorage services

Express  /api/dashboard
   routes → controller (validates ?days) → repository (MongoDB) → dashboard.stats.js (pure)
```

The backend module is split into four layers, each with one job:

- **`dashboard.stats.js`**: pure functions with no Express or database code. All business rules live here, so they can be unit-tested directly.
- **`dashboard.repository.js`**: reads the `services` and `categories` collections and normalises each document (ObjectIds become strings, missing fields get defaults). It reads the collections directly instead of importing the services module's Mongoose models. This keeps the dashboard independent of another team member's code; the only shared contract is the agreed field names.
- **`dashboard.controller.js`**: validates input and calls the calculations. Its data source and clock are passed in as parameters, so tests can supply fake data and a fixed date.
- **`dashboard.routes.js`**: the route table. `createDashboardRouter()` exists so tests can build the router with a fake data source.

### 1.3 Endpoints

| Method & path | Returns |
|---|---|
| `GET /api/dashboard?days=7` | `{ generatedFor, summary, spendByCategory, renewals }` in one request (used by the page) |
| `GET /api/dashboard/summary` | counts, `monthlySpend`, `yearlySpend`, `nextRenewal` |
| `GET /api/dashboard/spend-by-category` | `[{ id, name, color, count, monthly, yearly, share }]`, largest first |
| `GET /api/dashboard/renewals?days=7` | `{ windowDays, upcoming[], overdue[] }` |

Error handling: `?days` must be a whole number from 1 to 365, otherwise the API returns **400** with a message. If MongoDB is not connected, it returns **503** with a message telling the user to check `MONGODB_URI`. Any other error goes to the shared error handler. Once authentication is added, the repository returns only records owned by `req.user`.

### 1.4 Calculation rules

| Rule | Decision and reason |
|---|---|
| Monthly cost | monthly = cost; quarterly = cost ÷ 3; yearly = cost ÷ 12; one-time = 0. A one-off payment is not a recurring cost. |
| Which services count | Only `active` services count towards spend and renewals. An inactive service is not being paid for and cannot be overdue. |
| Yearly estimate | Monthly run-rate × 12, calculated **before** rounding. Rounding first would produce errors such as 3.33 × 12 = 39.96 instead of 40. |
| Rounding | Every money value is rounded to cents only at output time, so floating-point noise such as 19.999999 never reaches the UI. |
| Category spend | Grouped by category id. Services whose category was deleted are grouped under **Unknown** rather than dropped, so category totals always add up to total spend. `share` is a percentage with 1 decimal place. |
| Upcoming window | From today (day 0) to N days ahead, inclusive. N comes from the user's "renewal reminder lead time" setting (1, 3, 7 or 14 days). |
| Overdue | Renewal date before today, most overdue first. |
| Dates | Compared as calendar days (`YYYY-MM-DD`) using UTC arithmetic, which avoids off-by-one errors around daylight-saving changes and time zones. Dates from MongoDB (stored at UTC midnight) and ISO strings both work. Invalid dates such as `2026-02-30` are ignored. |

### 1.5 Frontend integration

- **`services/apiClient.js`** is a shared `fetch` wrapper for the whole team. It reads the base URL from `VITE_API_URL`, adds the `Authorization: Bearer` header once a login token is stored, and turns network failures and non-2xx responses into an `ApiError` with a readable message.
- **`hooks/useDashboard.js`** returns `{ data, loading, error, reload }` from either source, in the same shape as `GET /api/dashboard`. The page doesn't know where its data came from. This lets the team keep using localStorage until the services API is finished, then switch by setting one environment variable. In API mode, requests are cancelled with `AbortController` if the user leaves the page, and **Retry** in the error state refetches.
- **`pages/index.jsx`**: the page no longer does any calculations itself; it only renders. It shows four stat tiles (services, monthly spend, yearly estimate, next renewal), upcoming and overdue lists, and two charts. Loading skeletons and an error state with retry are kept from the previous version.

### 1.6 Charts and visualisations

- **Spend by category (bar chart)**: the existing `CategorySpendChart`, now fed by `spendByCategory`. Bars are scaled to the largest category.
- **Share of spend (donut chart)**: new in `SpendShareDonut.jsx`. It is plain SVG with no chart library, which keeps the bundle small. The circle's radius is chosen so its circumference is exactly 100 units, so each segment's dash length equals its percentage. Segments use the category colours chosen in Settings, and the total monthly spend is shown in the centre.
- **Accessibility**: each chart has `role="img"` and an `aria-label` that reads out the values, for example "Share of monthly spend: Consulting 76.5%, Design 9.6% …". The donut has a text legend, so the information doesn't depend on colour alone, and each segment shows a tooltip on hover. Colours come from the theme variables, so both light and dark mode work. On screens narrower than 1000px the two chart cards stack vertically.

### 1.7 Seed data

`npm run seed` (in `backend/`) loads the frontend's sample services and the default categories into MongoDB with real ObjectIds. That way the dashboard API has data before the services CRUD API exists. It refuses to run if data already exists unless `--reset` is passed.

---

## 2. Testing

### 2.1 Approach

| Level | Tool | File | Tests |
|---|---|---|---|
| Unit: backend calculations | Node test runner | `backend/tests/dashboard.stats.test.js` | 25 |
| API: endpoints (HTTP) | Node test runner + supertest | `backend/tests/dashboard.routes.test.js` | 14 |
| Unit: frontend calculations | Vitest | `frontend/src/lib/dashboardStats.test.js` | 11 |
| **Total for dashboard** | | | **50** |

Commands: `cd backend && npm test` and `cd frontend && npm test`.

The calculations are pure functions, so most tests need no server or database. The API tests build an Express app with a **fake data source and a fixed date** (1 Oct 2026), so results are repeatable on any day and any machine.

### 2.2 What is tested

- **Billing cycle normalisation**: monthly, quarterly, yearly and one-time, plus unknown cycles, numeric strings, non-numeric and negative costs.
- **Rounding**: no float noise, and the yearly figure is calculated before rounding (quarterly $10 gives $3.33/month and $40/year, not $39.96).
- **Dates**: invalid dates such as `2026-02-30`, empty strings and `null`; Date objects and ISO strings; crossing a month end, a year end and a leap day.
- **Boundaries**: a renewal due today counts as upcoming and as the next renewal; a renewal exactly N days away is inside the window and N + 1 is outside; yesterday is overdue (−1).
- **Business rules**: inactive services are excluded from spend and from overdue; deleted categories go to "Unknown"; ObjectId-style category ids match category records; shares add up to 100%.
- **Empty or missing data**: no services, and `undefined` arrays, return zeros instead of throwing.
- **API behaviour**: response shape for all four endpoints; the logged-in user is passed to the data source; `?days` defaults to 7 and accepts a custom window; `0`, `-3`, `2.5`, `abc` and `366` return **400**; a database error keeps its **503** status; the real app returns **503** while MongoDB is offline.
- **Real sample data** (frontend): category totals add up to total monthly spend, and every upcoming item has `daysUntil ≥ 0` and every overdue item `< 0`.

### 2.3 Results

All tests pass: backend 41/41 (25 + 14 dashboard, 2 health check) and frontend 75/75 (11 dashboard, 64 existing validation tests). The frontend production build succeeds.

**Hand check against the sample data** (today = 1 Oct 2026). Active monthly spend = 45 + 20 + 54.99 + 44 + 74 + 2400/3 + 87.50/12 = **$1,045.28**. Yearly estimate = **$12,543.38**. Consulting accounts for 76.5% of spend. The API calculation gives the same figures.

---

## 3. Evaluation

### 3.1 Strengths

- **Correctness is tested at the right level.** The business rules are pure functions with 36 unit tests, including edge cases (timezone-safe date arithmetic, rounding order, deleted categories), and the HTTP layer is tested separately.
- **Low coupling with teammates.** The dashboard doesn't import the services module's code, and the frontend works with or without the backend. Each member can work and merge independently.
- **One response for the page.** `GET /api/dashboard` returns everything in a single request instead of three, while the separate endpoints are still available for other uses.
- **Same results from both sources.** The frontend fallback returns exactly the same data shape as the API, and the page renders either without changes.
- **Accessible, dependency-free charts** that follow the app's light and dark themes.

### 3.2 Limitations

- **The calculation logic exists twice**, in `backend/.../dashboard.stats.js` and `frontend/src/lib/dashboardStats.js`, so a rule change must be made in both places. This was accepted so the frontend keeps working before the API is complete. Once the services API is live, the frontend copy can be removed.
- **The repository has not been tested against a live MongoDB.** The tests use a fake data source, and the real app was only tested with the database offline (the 503 path).
- **Totals mix currencies naively.** All costs are assumed to be in the user's single currency.
- **"Today" is the server's local date.** A user in a very different time zone could see a renewal labelled "due today" a few hours early or late.
- **Calculated on every request.** That's fine for one user's few dozen services, but it would need a MongoDB aggregation pipeline or caching at large scale.

### 3.3 Future improvements

1. Remove the duplicated frontend calculations once the services API is integrated, or move them to a shared package.
2. Add integration tests against an in-memory MongoDB (`mongodb-memory-server`) covering the repository and the seed script.
3. Accept the user's time zone (from settings or a request header) when deciding what "today" is.
4. Add a spending-over-time chart using renewal history once payment history is stored.
5. Move the grouping into a MongoDB aggregation if data volume grows.
