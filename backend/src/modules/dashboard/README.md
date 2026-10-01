# Dashboard module (Member 3)

Read-only analytics over the user's services. Mounted at `/api/dashboard`.

| File | Purpose |
|---|---|
| `dashboard.stats.js` | Pure calculations (no Express, no DB), unit-tested in `tests/dashboard.stats.test.js` |
| `dashboard.repository.js` | Loads services + categories from MongoDB |
| `dashboard.controller.js` | Request handlers, `?days=` validation |
| `dashboard.routes.js` | Route table; `createDashboardRouter()` lets tests inject fake data |
| `seed.js` | `npm run seed` loads sample data from `frontend/src/data/services.json` |

## Endpoints

All return JSON. Money values are rounded to cents. Dates are `YYYY-MM-DD`.

### `GET /api/dashboard?days=7`
Everything the dashboard page needs in one request:
```json
{
  "generatedFor": "2026-10-01",
  "summary": { ... },
  "spendByCategory": [ ... ],
  "renewals": { ... }
}
```

Examples below are for the seeded sample data on 2026-10-01.

### `GET /api/dashboard/summary`
```json
{
  "totalServices": 8,
  "activeServices": 7,
  "inactiveServices": 1,
  "monthlySpend": 1045.28,
  "yearlySpend": 12543.38,
  "nextRenewal": { "id": "...", "name": "GitHub Team", "renewalDate": "2026-10-12", "daysUntil": 11, "...": "..." }
}
```

### `GET /api/dashboard/spend-by-category`
```json
[
  { "id": "...", "name": "Consulting", "color": "#16a34a", "count": 1, "monthly": 800, "yearly": 9600, "share": 76.5 },
  { "id": "...", "name": "Design", "color": "#3b82f6", "count": 2, "monthly": 99.99, "yearly": 1199.88, "share": 9.6 }
]
```

### `GET /api/dashboard/renewals?days=7`
`days` is optional, a whole number from 1 to 365 (default 7). Anything else returns `400`.
```json
{
  "windowDays": 7,
  "upcoming": [ { "id": "...", "name": "...", "categoryName": "...", "categoryColor": "...", "cost": 20, "billingCycle": "monthly", "renewalDate": "2026-10-03", "daysUntil": 2 } ],
  "overdue":  [ ... ]
}
```

## Calculation rules
- **Spend** counts `active` services only. Cost is normalised per month: quarterly ÷ 3, yearly ÷ 12, one-time = 0.
- **Yearly estimate** = monthly run-rate × 12 (one-time costs excluded).
- **Spend by category**: services whose category was deleted are grouped under `Unknown` instead of being dropped. `share` is the percentage of total monthly spend.
- **Upcoming**: active services renewing from today (day 0) to `days` ahead, soonest first.
- **Overdue**: active services whose renewal date has passed, most overdue first. Inactive services are never overdue.
- **Next renewal**: the soonest active renewal from today onwards.
- "Today" is the server's local calendar date.

## Data contract with the services module
The repository reads the `services` and `categories` collections directly, so it doesn't import Member 2's model files. It relies on these fields:
- services: `name`, `category` (category id), `cost`, `billingCycle`, `renewalDate` (Date or `YYYY-MM-DD`), `status`, `owner`
- categories: `name`, `color`, `owner`

When `req.user` is set (by Member 1's `requireAuth`), only records with `owner` equal to that user's id are used.

If the database isn't connected, every endpoint returns `503`.
