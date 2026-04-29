# ai-coding-skills

A collection of Claude Code skills for software engineering workflows.

## Skills

| Skill | Description |
|-------|-------------|
| [database-engineer](./skills/database-engineer/) | Audits and optimizes the DB layer — indexes, query patterns, schema design, and config — for SQLite, PostgreSQL, MySQL, and MongoDB |

## Installing a skill

```bash
claude plugin install https://github.com/atifhaider/ai-coding-skills
```

Or install individual skills via [mcpmarket.com](https://mcpmarket.com).

## Structure

```
skills/
└── <skill-name>/
    ├── SKILL.md          # Required — skill instructions + frontmatter
    ├── scripts/          # Optional — reusable scripts bundled with the skill
    ├── references/       # Optional — reference docs loaded on demand
    └── assets/           # Optional — templates, icons, other static files
```

## Contributing

Each skill lives in its own directory under `skills/`. The only required file is `SKILL.md` with valid YAML frontmatter (`name` and `description` fields).
