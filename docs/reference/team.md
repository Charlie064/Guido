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

## Creating a branch

Run `scripts/new-branch.sh <feature-name>` instead of typing
`claudev/<name>/<feature-name>` by hand — it reads `git config user.name`,
matches it against the Full name column above, and creates/checks out the
branch. If it can't confidently match you, it asks you to pick from a list.
Pass a name as a second argument (`scripts/new-branch.sh <feature-name>
<name>`) to override detection.
