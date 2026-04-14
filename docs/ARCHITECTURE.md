# MidClaw — Architecture

## Source DNA

```
OpenClaw (TypeScript) ──→ Context engine, hooks, security audit, dreaming
PicoClaw (Go)         ──→ EventBus, HookManager, SubTurn, Steering, ToolRegistry TTL
Hermes Agent (Python) ──→ LLM brain, 40+ tools, skills, SQLite+FTS5
MiroFish (Python)     ──→ Swarm simulation, threat actor personas
```

## Layer Map

```
┌─────────────────────────────────────────────────────────┐
│                       MidClaw                           │
│                                                         │
│  core/ (TypeScript)                                     │
│  ├── eventbus.ts      Non-blocking event broadcaster    │
│  ├── hooks.ts         HookManager (6 actions, timeouts) │
│  ├── subturn.ts       Concurrent sub-agents             │
│  └── steering.ts      Mid-execution control             │
│                                                         │
│  vault/ (TypeScript)                                    │
│  ├── store.ts         SQLite WAL + FTS5                 │
│  ├── wikilink.ts      [[backlink]] parser + index       │
│  ├── rag.ts           WikiRAG: search + traversal       │
│  ├── writer.ts        Auto-note generation              │
│  └── dreaming.ts      Background memory consolidation   │
│                                                         │
│  security/ (TypeScript)                                 │
│  ├── audit.ts         50+ security checks               │
│  └── hooks/           Approval, logging, watching       │
│                                                         │
│  brain/ (Python)      ←── HTTP bridge ──→ core/         │
│  ├── agent.py         Multi-provider LLM                │
│  ├── tools/           40+ tools (Hermes)                │
│  └── skills/          Procedural memory                 │
│                                                         │
│  sim/ (Python)                                          │
│  ├── profiles.py      Threat actor personas             │
│  ├── runner.py        In-process SubTurn simulation     │
│  └── mitre.py         MITRE ATT&CK taxonomy             │
│                                                         │
│  obsidian-plugin/ (TypeScript)                          │
│  └── main.ts          Vault UI + agent query            │
└─────────────────────────────────────────────────────────┘
```

## Hook Pipeline

```
Tool call
   │
[BeforeTool]  whitelist/blacklist → scope → human approval (60s)
   │
Execute
   │
[AfterTool]   entity extract → vault write → anomaly check
   │
[BeforeLLM]   WikiRAG → inject relevant vault notes
   │
LLM call
   │
[AfterLLM]    parse new knowledge → update vault
```

## WikiRAG Flow

```
Query: "apt29 lateral movement"
   │
FTS5 search → top-K notes ranked by relevance
   │
For each note: traverse [[backlinks]] depth=2
   │
Deduplicate + rank
   │
Format as LLM context block
```

## Simulation Flow

```
"Simulate APT29 on our network"
   │
Read vault/threat-actors/apt29.md + traverse links
   │
Generate N personas (LLM-enriched, MITRE TTPs)
   │
Spawn N SubTurns (max 5, shared token budget)
Each SubTurn: persona system prompt + TTL-limited tools + vault env
   │
Collect ThreatAgentActions (MITRE tactic + technique + target + success)
   │
RoundSummary → ReportAgent → vault note
   │
Vault grows → next simulation is more accurate
```
