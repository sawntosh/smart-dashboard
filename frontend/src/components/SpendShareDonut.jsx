import { formatMoney } from "../utils/format";

// r = 100 / (2π) makes the circumference exactly 100, so dash lengths are percentages.
const RADIUS = 15.9155;
const GAP = 0.6;

/**
 * SVG donut showing each category's share of monthly spend, with a legend.
 * `rows` are spend-by-category rows: { id, name, color, monthly, share }.
 */
export default function SpendShareDonut({ rows, total, currency }) {
  const withGap = rows.length > 1;
  let offset = 0;
  const segments = rows.map((row) => {
    const length = Math.max(0, row.share - (withGap ? GAP : 0));
    const seg = { ...row, length, offset };
    offset += row.share;
    return seg;
  });

  const summary = rows.map((r) => `${r.name} ${r.share}%`).join(", ");

  return (
    <div className="donut">
      <figure className="donut__figure">
        <svg
          className="donut__svg"
          viewBox="0 0 42 42"
          role="img"
          aria-label={`Share of monthly spend: ${summary}`}
        >
          <circle className="donut__track" cx="21" cy="21" r={RADIUS} />
          {segments.map((seg) => (
            <circle
              key={seg.id}
              className="donut__segment"
              cx="21"
              cy="21"
              r={RADIUS}
              stroke={seg.color}
              strokeDasharray={`${seg.length} ${100 - seg.length}`}
              // Start at 12 o'clock and run clockwise.
              strokeDashoffset={25 - seg.offset}
            >
              <title>{`${seg.name}: ${seg.share}%`}</title>
            </circle>
          ))}
        </svg>
        <figcaption className="donut__center" aria-hidden="true">
          <span className="donut__total">{formatMoney(total, currency)}</span>
          <span className="donut__label">per month</span>
        </figcaption>
      </figure>

      <ul className="donut__legend">
        {rows.map((row) => (
          <li key={row.id} className="donut__legend-item">
            <span className="donut__swatch" style={{ background: row.color }} aria-hidden="true" />
            <span className="donut__legend-name">{row.name}</span>
            <span className="donut__legend-value">{row.share}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
