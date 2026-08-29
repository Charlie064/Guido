/**
 * Internal waitlist admin (GET /internal/waitlist and /internal/waitlist/export).
 *
 * This Worker does NOT implement auth. These routes are expected to be
 * protected by Cloudflare Access (Zero Trust) in production. Local
 * `wrangler dev` has no Access in front — anyone who can reach the
 * dev port can load the page.
 */

export type WaitlistColumn = {
  key: string;
  label: string;
  sort: "number" | "string";
};

type ColumnInfo = { name: string };

const COLUMN_LABELS: Record<string, string> = {
  id: "ID",
  email: "Email",
  created_at: "Signup date",
  name: "Name",
  phone: "Phone",
  persona: "Persona",
  role: "Role",
  apps: "Apps",
  apps_other: "Apps (other)",
  referral_code: "Referral code",
  referred_by: "Referred by",
};

const COLUMN_ORDER = [
  "id",
  "email",
  "created_at",
  "name",
  "phone",
  "persona",
  "role",
  "apps",
  "apps_other",
  "referral_code",
  "referred_by",
];

export type WaitlistSnapshot = {
  columns: WaitlistColumn[];
  rows: Record<string, unknown>[];
};

export function accessEmailLabel(request: Request): string {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email");
  return email && email.trim() ? email.trim() : "(no Access header)";
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function labelFor(name: string): string {
  return COLUMN_LABELS[name] ?? name.replace(/_/g, " ");
}

function sortType(name: string): "number" | "string" {
  return name === "id" ? "number" : "string";
}

function orderBySql(names: string[]): string {
  if (names.includes("created_at") && names.includes("id")) {
    return `${quoteIdent("created_at")} DESC, ${quoteIdent("id")} DESC`;
  }
  if (names.includes("created_at")) return `${quoteIdent("created_at")} DESC`;
  if (names.includes("id")) return `${quoteIdent("id")} DESC`;
  return "1";
}

export async function fetchWaitlist(db: D1Database): Promise<WaitlistSnapshot> {
  const info = await db.prepare("PRAGMA table_info(waitlist)").all<ColumnInfo>();
  const names = (info.results ?? []).map((col) => col.name);
  const ordered = [
    ...COLUMN_ORDER.filter((name) => names.includes(name)),
    ...names.filter((name) => !COLUMN_ORDER.includes(name)),
  ];
  if (ordered.length === 0) {
    return { columns: [], rows: [] };
  }

  const result = await db
    .prepare(`SELECT ${ordered.map(quoteIdent).join(", ")} FROM waitlist ORDER BY ${orderBySql(names)}`)
    .all<Record<string, unknown>>();

  return {
    columns: ordered.map((key) => ({ key, label: labelFor(key), sort: sortType(key) })),
    rows: result.results ?? [],
  };
}

export function cellDisplay(key: string, value: unknown): string {
  if (value == null || value === "") return "";
  if (key === "apps") {
    try {
      const parsed = JSON.parse(String(value));
      if (Array.isArray(parsed)) return parsed.join(", ");
    } catch {
      // stored as plain text
    }
  }
  return String(value);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeCsv(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function waitlistCsv(snapshot: WaitlistSnapshot): string {
  const header = snapshot.columns.map((col) => escapeCsv(col.label)).join(",");
  const lines = snapshot.rows.map((row) =>
    snapshot.columns.map((col) => escapeCsv(cellDisplay(col.key, row[col.key]))).join(","),
  );
  return `${[header, ...lines].join("\r\n")}\r\n`;
}

export function csvResponse(csv: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="waitlist.csv"',
      "Cache-Control": "no-store",
    },
  });
}

export function waitlistHtml(snapshot: WaitlistSnapshot, loggedInAs: string): string {
  const total = snapshot.rows.length;
  const emailKey = snapshot.columns.some((col) => col.key === "email") ? "email" : snapshot.columns[0]?.key ?? "";
  const defaultSort = Math.max(
    0,
    snapshot.columns.findIndex((col) => col.key === "created_at"),
  );

  const body = snapshot.rows
    .map((row) => {
      const email = cellDisplay(emailKey, row[emailKey]);
      const cells = snapshot.columns
        .map((col) => {
          const display = cellDisplay(col.key, row[col.key]);
          return `<td data-sort="${escapeHtml(display)}">${escapeHtml(display)}</td>`;
        })
        .join("");
      return `<tr data-email="${escapeHtml(email.toLowerCase())}">${cells}</tr>`;
    })
    .join("");

  const heads = snapshot.columns
    .map(
      (col, i) =>
        `<th scope="col" data-col="${i}" data-type="${col.sort}" tabindex="0">${escapeHtml(col.label)}</th>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Waitlist</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      padding: 24px;
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #111;
      background: #f4f4f5;
    }
    header { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: baseline; margin-bottom: 16px; }
    h1 { font-size: 20px; font-weight: 600; margin: 0; }
    .meta { color: #444; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 16px; }
    input[type="search"] {
      width: min(28rem, 100%);
      padding: 6px 8px;
      font: inherit;
      border: 1px solid #bbb;
      border-radius: 4px;
      background: #fff;
    }
    a.btn {
      display: inline-block;
      padding: 6px 10px;
      font: inherit;
      color: #111;
      background: #fff;
      border: 1px solid #888;
      border-radius: 4px;
      text-decoration: none;
    }
    a.btn:hover { background: #eee; }
    .wrap { overflow: auto; background: #fff; border: 1px solid #ddd; }
    table { border-collapse: collapse; width: 100%; min-width: 64rem; }
    th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
    th {
      position: sticky; top: 0;
      background: #eee;
      font-weight: 600;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }
    th:hover { background: #e2e2e2; }
    th.sort-asc::after { content: " \\25b2"; }
    th.sort-desc::after { content: " \\25bc"; }
    td { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
    tr.hidden { display: none; }
    .empty { padding: 24px; color: #555; }
  </style>
</head>
<body>
  <header>
    <h1>Waitlist</h1>
    <div class="meta" id="count">${total} signup${total === 1 ? "" : "s"}</div>
    <div class="meta">Logged in as: ${escapeHtml(loggedInAs)}</div>
  </header>
  <div class="toolbar">
    <input type="search" id="filter" placeholder="Filter by email" autocomplete="off">
    <a class="btn" href="/internal/waitlist/export">Download CSV</a>
  </div>
  <div class="wrap">
    ${
      total === 0
        ? `<p class="empty">No signups yet.</p>`
        : `<table>
      <thead><tr>${heads}</tr></thead>
      <tbody id="rows">${body}</tbody>
    </table>`
    }
  </div>
  <script>
    (function () {
      var filter = document.getElementById("filter");
      var tbody = document.getElementById("rows");
      var count = document.getElementById("count");
      var total = ${total};
      if (!tbody) return;

      function visibleCount() {
        var n = 0;
        var rows = tbody.rows;
        for (var i = 0; i < rows.length; i++) {
          if (!rows[i].classList.contains("hidden")) n++;
        }
        return n;
      }

      function updateCount() {
        var shown = visibleCount();
        var q = filter.value.trim();
        if (!q) {
          count.textContent = total + (total === 1 ? " signup" : " signups");
        } else {
          count.textContent = "Showing " + shown + " of " + total;
        }
      }

      filter.addEventListener("input", function () {
        var q = filter.value.trim().toLowerCase();
        var rows = tbody.rows;
        for (var i = 0; i < rows.length; i++) {
          var email = rows[i].getAttribute("data-email") || "";
          rows[i].classList.toggle("hidden", q !== "" && email.indexOf(q) === -1);
        }
        updateCount();
      });

      var sortCol = ${defaultSort};
      var sortDir = -1;
      var headers = document.querySelectorAll("th");
      if (headers[sortCol]) headers[sortCol].classList.add("sort-desc");

      function sortBy(col, dir) {
        var type = headers[col].getAttribute("data-type");
        var rows = Array.prototype.slice.call(tbody.rows);
        rows.sort(function (a, b) {
          var av = a.children[col].getAttribute("data-sort") || "";
          var bv = b.children[col].getAttribute("data-sort") || "";
          if (type === "number") {
            var an = av === "" ? NaN : Number(av);
            var bn = bv === "" ? NaN : Number(bv);
            if (isNaN(an) && isNaN(bn)) return 0;
            if (isNaN(an)) return 1;
            if (isNaN(bn)) return -1;
            return (an - bn) * dir;
          }
          return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" }) * dir;
        });
        for (var i = 0; i < rows.length; i++) tbody.appendChild(rows[i]);
      }

      function onSort(col) {
        if (sortCol === col) sortDir = -sortDir;
        else { sortCol = col; sortDir = 1; }
        for (var i = 0; i < headers.length; i++) {
          headers[i].classList.remove("sort-asc", "sort-desc");
        }
        headers[col].classList.add(sortDir === 1 ? "sort-asc" : "sort-desc");
        sortBy(col, sortDir);
      }

      for (var i = 0; i < headers.length; i++) {
        (function (col) {
          headers[col].addEventListener("click", function () { onSort(col); });
          headers[col].addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSort(col); }
          });
        })(i);
      }
    })();
  </script>
</body>
</html>
`;
}

export function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export function loadErrorResponse(): Response {
  return new Response("Could not load waitlist.", {
    status: 500,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
