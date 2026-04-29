# ai-coding-skills

A collection of Claude Code skills for software engineering workflows, published on the Claude Code marketplace.

## Skills

| Skill | Description |
|-------|-------------|
| [db-engineer](./skills/db-engineer/) | Acts as a senior database engineer — audits indexes, query patterns, N+1 issues, transactions, and config for SQLite, PostgreSQL, MySQL, and MongoDB. Reports by severity and waits for approval before applying fixes. |

## Installation

```bash
claude plugin install https://github.com/atifh/ai-coding-skills
```

Or find it on the [Claude Code Marketplace](https://mcpmarket.com).

## Repo Structure

```
.claude-plugin/
├── plugin.json         # Plugin manifest (name, version, author, skills list)
└── marketplace.json    # Marketplace listing metadata (description, tags)

skills/
└── <skill-name>/
    └── SKILL.md        # Skill instructions + YAML frontmatter (name, description)

evals/
└── <skill-name>/
    ├── evals.json        # Eval prompts and assertions
    ├── test-fixtures/    # Synthetic codebases used as test inputs
    └── iteration-N/      # Graded results per eval iteration
```

## Adding a new skill

1. Create `skills/<your-skill-name>/SKILL.md` with valid YAML frontmatter (`name` and `description`)
2. Add an entry to `.claude-plugin/plugin.json` under `skills`
3. Add an entry to `.claude-plugin/marketplace.json` under `skills`
4. Optionally add an eval suite under `evals/<your-skill-name>/`

## Author

**Atif Haider** — [atifhaider.com](https://atifhaider.com)
