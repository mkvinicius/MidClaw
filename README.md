# MidClaw

> The first AI security agent with living associative memory — learns from every incident, simulates attacks before they happen, and gets smarter with every use.

## What is MidClaw?

MidClaw combines the best of four battle-tested open source projects:

| Source | What we take |
|---|---|
| **OpenClaw** (TypeScript) | Hook system, security audit engine, context engine, dreaming (background memory consolidation) |
| **PicoClaw** (Go) | EventBus, HookManager, SubTurn concurrency, Steering, ToolRegistry with TTL |
| **Hermes Agent** (Python) | LLM brain, 40+ tools, skills system, SQLite+FTS5 session store |
| **MiroFish** (Python) | Swarm simulation engine, threat actor persona generation |

## Architecture

```
MidClaw
├── TypeScript Core   (runtime · hooks · security audit · vault · Obsidian plugin)
├── Python Brain      (LLM · tools · simulation · skills)
└── Vault             (Obsidian-compatible Markdown + [[wikilinks]] + SQLite FTS5)
```

## Use Cases

- **Enterprise SOC** — correlates incidents, predicts attacker next moves
- **Pentest / Red Team** — accumulates engagement knowledge, simulates attack paths
- **Home / Family** — learns household habits, alerts only what matters

## Docs

- [PRD](docs/PRD.md) — Product Requirements Document
- [Architecture](docs/ARCHITECTURE.md) — Technical architecture decisions

## License

MIT
