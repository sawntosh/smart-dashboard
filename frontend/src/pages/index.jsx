import { Link } from "react-router-dom";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import Skeleton from "../components/ui/Skeleton";
import ErrorState from "../components/ui/ErrorState";
import StatCard from "../components/StatCard";
import CategorySpendChart from "../components/CategorySpendChart";
import SpendShareDonut from "../components/SpendShareDonut";
import { useSettings } from "../context/SettingsContext";
import { useDashboard } from "../hooks/useDashboard";
import { formatMoney } from "../utils/format";
import { formatDate } from "../utils/date";

function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(name) {
  return (name || "").trim().split(/\s+/)[0] || "there";
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Label from the precomputed daysUntil, so lists match the server's "today". */
function renewalText({ renewalDate, daysUntil }) {
  const base = formatDate(renewalDate);
  if (daysUntil < 0) return `${base} · ${plural(-daysUntil, "day")} overdue`;
  if (daysUntil === 0) return `${base} · due today`;
  return `${base} · in ${plural(daysUntil, "day")}`;
}

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  width: 18,
  height: 18,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const ICONS = {
  services: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  spend: (
    <svg {...ICON_PROPS}>
      <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v3" />
      <path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1h-4a2 2 0 1 0 0 4h5" />
    </svg>
  ),
  yearly: (
    <svg {...ICON_PROPS}>
      <path d="M3 3v18h18" />
      <path d="M7 15l4-4 3 3 5-6" />
    </svg>
  ),
  renewal: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  ),
};

function RenewalRows({ items }) {
  return (
    <ul className="renewal-list">
      {items.map((item) => (
        <li key={item.id} className="renewal-list__item">
          <Link className="auth__link renewal-list__name" to={`/services/${item.id}`}>
            {item.name}
          </Link>
          <span className="renewal-list__meta">
            <span className="chip" style={{ "--chip": item.categoryColor }}>
              {item.categoryName}
            </span>
            <span className={item.daysUntil <= 0 ? "text-warn" : "renewal-list__date"}>
              {renewalText(item)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function LoadingTiles() {
  return (
    <div className="stat-grid">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="stat">
          <Skeleton lines={2} />
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { preferences, profile, notifications } = useSettings();
  const windowDays = notifications.renewalLeadDays;
  const { data, loading, error, reload } = useDashboard(windowDays);
  const currency = preferences.currency;

  const summary = data?.summary;
  const categoryRows = data?.spendByCategory ?? [];
  const { upcoming = [], overdue = [] } = data?.renewals ?? {};
  const next = summary?.nextRenewal;

  return (
    <div className="dashboard">
      <div className="welcome">
        <div>
          <h1 className="welcome__title">
            {greeting()}, {firstName(profile.name)}! <span aria-hidden="true">👋</span>
          </h1>
          <p className="welcome__sub">
            {summary
              ? `Here's what's happening with your services today — ${plural(
                  summary.totalServices,
                  "service",
                )}, ${summary.activeServices} active.`
              : "Here's what's happening with your services today."}
          </p>
        </div>
        <Button as={Link} to="/services/new">
          + Add service
        </Button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading || !data ? (
        <LoadingTiles />
      ) : (
        <>
          <div className="stat-grid">
            <StatCard
              icon={ICONS.services}
              label="Services"
              value={summary.totalServices}
              hint={`${summary.activeServices} active · ${summary.inactiveServices} inactive`}
            />
            <StatCard
              icon={ICONS.spend}
              label="Monthly spend"
              value={formatMoney(summary.monthlySpend, currency)}
              hint={`across ${plural(summary.activeServices, "active service")}`}
            />
            <StatCard
              icon={ICONS.yearly}
              label="Yearly estimate"
              value={formatMoney(summary.yearlySpend, currency)}
              hint="monthly spend × 12"
            />
            <StatCard
              icon={ICONS.renewal}
              label="Next renewal"
              value={next ? formatDate(next.renewalDate) : "—"}
              hint={next ? next.name : "nothing scheduled"}
            />
          </div>

          <div className={overdue.length > 0 ? "dashboard__row" : undefined}>
            <Card
              title={`Upcoming (next ${plural(windowDays, "day")})`}
              action={
                <Link className="auth__link" to="/services">
                  All services →
                </Link>
              }
            >
              {upcoming.length === 0 ? (
                <EmptyState>
                  {summary.totalServices === 0 ? (
                    <>
                      No services yet.{" "}
                      <Link className="auth__link" to="/services/new">
                        Add one
                      </Link>
                      .
                    </>
                  ) : (
                    `Nothing renewing in the next ${plural(windowDays, "day")}.`
                  )}
                </EmptyState>
              ) : (
                <RenewalRows items={upcoming} />
              )}
            </Card>

            {overdue.length > 0 && (
              <Card
                title={
                  <>
                    Overdue
                    <Badge tone="warn">{overdue.length}</Badge>
                  </>
                }
              >
                <RenewalRows items={overdue} />
              </Card>
            )}
          </div>

          {categoryRows.length === 0 ? (
            <Card title="Spend by category">
              <EmptyState>No active spend to chart yet.</EmptyState>
            </Card>
          ) : (
            <div className="dashboard__row">
              <Card title="Spend by category">
                <CategorySpendChart
                  rows={categoryRows.map((r) => ({ ...r, total: r.monthly }))}
                  currency={currency}
                />
                <p className="field__hint">Active services only · costs shown per month</p>
              </Card>
              <Card title="Share of spend">
                <SpendShareDonut rows={categoryRows} total={summary.monthlySpend} currency={currency} />
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
