**Contract**
- Name → branch prefix → role table, used for branch naming (see
  `CLAUDE.md` workflow rules: `claudev/<name>/<feature>`).
- Fixed table, not derived from `git config` — each person uses their own
  row's prefix regardless of local git setup.

## Team

| Full name          | Branch prefix | GitHub      | Role         |
| ------------------ | -------------- | ----------- | ------------ |
| Charlie Sandvall   | `charlie`      | `Charlie064` | Technical / backend |
| Pauline Mophou     | `pauline`      | `pmophou` | Website |
| Elanore de Garidel | `elanore`      | `eleadega` | Outreach |
| Quentin Feinäugle  | `quentin`      | `quentinbuilds` | Outreach, website (secondary) |

Update the Role column as each person's area is decided — this table is the
one place that fact lives; don't restate roles elsewhere.

## Cloudflare account

Charlie Sandvall created and administers the Guido Cloudflare account
(billing, DNS, member invites) — see
[ADR 0004](../decisions/0004-cloudflare-infrastructure-proposal.md).
Account ID `06e757ca8ed84a9c592f859886811b41`, `workers.dev` subdomain
`guidotutor`. Other team members are added as account **members** by
email invite (Manage Account → Members in the dashboard), not via a
shared login.

| Full name          | Cloudflare email                  | Role                              |
| ------------------ | ---------------------------------- | ---------------------------------- |
| Charlie Sandvall   | `charlie.sandvall@gmail.com`       | Super Administrator (billing/DNS/member management) |
| Pauline Mophou     | `pauline.mophou@protonmail.com`    | Administrator (no billing/membership access) |
| Elanore de Garidel | `eleanore4444@icloud.com`          | Administrator (no billing/membership access) |
| Quentin Feinäugle  | `quentinfeinaeugle@gmail.com`      | Administrator (no billing/membership access) |

Non-billing teammates get the built-in **Administrator** role, not **Super
Administrator** — full Workers/Pages/D1 access for development, but no
billing profile or membership management. Invites sent 2026-08-29.

## Creating a branch

Run `scripts/new-branch.sh <feature-name>` instead of typing
`claudev/<name>/<feature-name>` by hand — it reads `git config user.name`,
matches it against the Full name column above, and creates/checks out the
branch. If it can't confidently match you, it asks you to pick from a list.
Pass a name as a second argument (`scripts/new-branch.sh <feature-name>
<name>`) to override detection.
