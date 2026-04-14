# MidClaw — Product Requirements Document

**Version:** 1.0  
**Date:** 2026-04-13  
**Status:** Draft

---

## 1. Vision

### Statement

> MidClaw is the first AI security agent with living associative memory.  
> It learns from every incident, simulates attacks before they happen,  
> and gets smarter with every use. Runs on any hardware.

### Problem

| Tool | Limitation |
|---|---|
| SIEM (Splunk, Elastic) | Sees the past. No contextual intelligence. |
| EDR (CrowdStrike, Sentinel) | Reacts to the present. Doesn't learn your environment. |
| ChatGPT / Claude | Forgets everything after the session. |
| MiroFish | Simulates well, but locked to Zep Cloud and subprocess. |
| Hermes Agent | Powerful, but no simulation and no memory graph. |
| PicoClaw | Excellent runtime, but no persistent real memory. |

**The gap:** No tool today combines persistent contextual memory + predictive simulation + lightweight runtime + continuous learning.

---

## 2. DNA — Source Projects

MidClaw was built by deeply reading the source code of four projects:

### OpenClaw (TypeScript)
- **What it is:** Personal AI assistant, multi-channel gateway. Parent of PicoClaw.
- **What we take:**
  - `context-engine/` — pluggable memory engine with `bootstrap`, `ingest`, `assemble`, `compact`, `afterTurn`
  - `dreaming.ts` — background memory consolidation (like human sleep)
  - `security/audit.ts` — 50+ security audit checks (severity: info/warn/critical)
  - `hooks/internal-hooks.ts` — event hook system (message.received, agent.bootstrap, gateway.startup)
  - `tasks/task-flow-registry.store.sqlite.ts` — Node.js 22 native SQLite task store
  - Architecture philosophy: *"TypeScript was chosen to keep OpenClaw hackable by default."*

### PicoClaw (Go)
- **What it is:** Lightweight Go rewrite of OpenClaw. Runs on $10 boards, <15MB.
- **What we take:**
  - `pkg/agent/eventbus.go` — non-blocking multi-subscriber broadcaster, never stalls the main loop
  - `pkg/agent/hooks.go` — HookManager with 6 actions (continue/modify/respond/deny/abort/hard-abort), timeouts per type
  - `pkg/agent/subturn.go` — concurrent sub-agent system with depth limiting, token budget inheritance, ephemeral sessions
  - `pkg/agent/steering.go` — mid-execution message injection (graceful/hard interrupt)
  - `pkg/tools/registry.go` — TTL-based tool registry, sorted names for KV cache stability, Clone() for sub-agents

### Hermes Agent (Python)
- **What it is:** Full-featured AI agent framework by Nous Research (v0.8.0).
- **What we take:**
  - `run_agent.py` — AIAgent class, multi-turn conversation loop
  - `agent/prompt_builder.py` — prompt injection scanner (detects invisible unicode, exfil patterns, sys-prompt override)
  - `hermes_state.py` — SQLite WAL + FTS5, schema v6, parent session chains, cost tracking
  - `tools/` — 40+ ready-to-use tools (web, shell, files, vision, MCP, TTS, subagents)
  - `agent/skill_system.py` — procedural memory: agent creates and improves skills from experience
  - `agent/context_compressor.py` — auto-summarization for context limits

### MiroFish (Python)
- **What it is:** Swarm intelligence prediction engine (54k GitHub stars).
- **What we take:**
  - `services/graph_builder.py` — architecture (replacing Zep Cloud with local SQLite+wikilinks)
  - `services/oasis_profile_generator.py` — entity-to-persona conversion (adapted for threat actors)
  - `services/simulation_runner.py` — AgentAction/RoundSummary data model (adapted for MITRE ATT&CK)
  - **Replaced:** Zep Cloud → local graph. Subprocess → SubTurn in-process.

---

## 3. Personas

### Persona 1 — SOC Analyst (Enterprise)
- **Pain:** 500 alerts/day, no historical context per asset, no correlation
- **Gain:** Agent that knows every server, remembers past incidents, predicts next attacker move

### Persona 2 — Pentester / Red Team
- **Pain:** Manual recon, repetitive reports, rework between engagements
- **Gain:** Vault that accumulates knowledge from each engagement, parallel attack path simulation

### Persona 3 — Home / Family
- **Pain:** Phishing, compromised devices, children exposed — no visibility
- **Gain:** Guardian that learns family habits, alerts only what truly matters

---

## 4. Architecture

### Language Decision

| Layer | Language | Reason |
|---|---|---|
| Runtime, hooks, vault, Obsidian plugin | **TypeScript** | OpenClaw pattern. Hackable, widely known, Node 22 native SQLite. |
| LLM, tools, simulation, skills | **Python** | Hermes (40+ tools) + MiroFish (simulation) already built. AI ecosystem native. |
| Embedded hardware (v2 only) | **Go** | PicoClaw runtime for $10 boards. Optional, not v1. |

### Stack

```
MidClaw
├── core/               TypeScript — runtime orchestration
│   ├── eventbus.ts     Non-blocking broadcaster (PicoClaw pattern)
│   ├── hooks.ts        HookManager: BeforeTool/AfterTool/BeforeLLM/AfterLLM
│   ├── steering.ts     Mid-execution message injection
│   └── subturn.ts      Concurrent sub-agent spawning with token budget
│
├── vault/              TypeScript — memory engine
│   ├── store.ts        SQLite WAL + FTS5 (Node 22 native)
│   ├── wikilink.ts     [[backlink]] parser and index
│   ├── rag.ts          WikiRAG: FTS5 search + graph traversal
│   ├── writer.ts       Auto-generate notes from incidents/conversations
│   └── dreaming.ts     Background memory consolidation (OpenClaw pattern)
│
├── security/           TypeScript — audit engine
│   ├── audit.ts        SecurityAuditReport {findings, severity, remediation}
│   ├── hooks/          BeforeTool approval, scope enforcement, threat watching
│   └── scanner.ts      Prompt injection detection (Hermes pattern)
│
├── brain/              Python — AI intelligence
│   ├── agent.py        Multi-provider LLM (Anthropic, OpenRouter, Ollama)
│   ├── tools/          40+ tools (reused from Hermes Agent)
│   ├── skills/         Procedural memory (reused from Hermes Agent)
│   └── compressor.py   Context compression for long sessions
│
├── sim/                Python — simulation engine
│   ├── profiles.py     ThreatActorProfile generator (MiroFish pattern, no Zep)
│   ├── runner.py       In-process simulation via SubTurn (not subprocess)
│   ├── mitre.py        MITRE ATT&CK taxonomy (replaces Twitter/Reddit actions)
│   └── report.py       SimulationResult → vault note
│
└── obsidian-plugin/    TypeScript — vault UI
    └── main.ts         Obsidian plugin: sync vault, query agent, view graph
```

### The Vault Structure

```
vault/
├── conversations/      Episodic memory — each session becomes a note
├── incidents/          Security incidents with [[backlinks]]
├── threat-actors/      Actor profiles with TTPs
├── assets/             Infrastructure map
├── skills/             Procedural memory (agent learns these)
├── playbooks/          Response procedures that evolve
├── simulations/        Simulation results
└── reflections/        Agent self-analysis and learning
```

### Example Vault Note (auto-generated)

```markdown
---
date: 2026-04-13T14:23:00
type: incident
severity: high
confidence: 0.87
tags: [lateral-movement, rdp, apt29]
related: [[threat-actors/apt29]], [[assets/srv-web-01]], [[techniques/T1021.001]]
---

# Suspicious RDP Access Detected

IP 185.220.101.x attempted RDP on [[assets/srv-web-01]].
Same /24 as [[incidents/2023-09-15]] — same time window.

Technique: [[techniques/T1021.001]]
Probable actor: [[threat-actors/apt29]] (confidence 0.73)

## Actions taken
- Blocked via [[playbooks/block-ip]]
- Notified [[personas/soc-team]]
```

---

## 5. Key Innovations

### 5.1 WikiRAG (no cloud, no vectors)

```
Traditional: text → embeddings → vector DB → semantic search (expensive, cloud-dependent)
WikiRAG:     text → [[wikilinks]] → SQLite FTS5 → graph traversal (free, offline, deterministic)
```

When agent needs context:
1. FTS5 full-text search across vault → top-K relevant notes
2. Traverse [[backlinks]] of each note (depth=2)
3. Deduplicate + rank by relevance
4. Inject into LLM context

### 5.2 Hook-as-Security-Layer

Every tool call passes through the HookManager pipeline:

```
Tool call requested
      ↓
[BeforeTool]  → ApprovalHook (whitelist/blacklist/scope check, 60s human approval)
      ↓
Tool executes
      ↓
[AfterTool]   → VaultLogger (extract entities → write note → update [[links]])
               → AnomalyDetector (was result expected?)
      ↓
[BeforeLLM]   → VaultContextInjector (WikiRAG → inject relevant notes)
      ↓
LLM processes with rich vault context
```

### 5.3 In-Process Simulation

MiroFish runs simulation in a subprocess (IPC overhead, no budget control).  
MidClaw runs simulation as SubTurns inside the same process:

```
"Simulate APT29 attack on our environment"
      ↓
1. Read vault/threat-actors/apt29.md + traverse [[links]]
2. Generate N attacker personas with MITRE TTPs
3. Spawn N SubTurns (max 5 concurrent, shared token budget)
4. Each SubTurn: attacker persona + limited tool TTL + vault environment context
5. Collect ThreatAgentActions per round
6. ReportAgent consolidates → writes note to vault
7. Next simulation is more accurate (vault grew)
```

### 5.4 Dreaming (Background Memory Consolidation)

Inspired by `dreaming.ts` in OpenClaw's context-engine:

```
While agent is idle:
  → Scan vault for unlinked notes
  → Detect implicit connections (same entity, same time window, same technique)
  → Create [[backlinks]] between related notes
  → Summarize old conversations into condensed knowledge notes
  → Update confidence scores on threat actor profiles
```

This runs silently in the background — the vault gets smarter even when the agent is not active.

---

## 6. Features

### F1 — Living Vault Memory
- Auto-generate Markdown notes from every incident, conversation, simulation
- FTS5 full-text search across all notes
- `[[wikilink]]` graph traversal for associative context
- Human-editable via Obsidian app
- Git-versionable (plain text files)

### F2 — Security Hook Pipeline
- `BeforeTool`: whitelist/blacklist + scope check + human approval (configurable timeout)
- `AfterTool`: entity extraction + vault write + anomaly detection
- `BeforeLLM`: WikiRAG context injection
- `EventObserver`: threat correlation across events

### F3 — Threat Simulation Engine
- Generate threat actor personas from vault (no Zep, no cloud)
- Run N concurrent attacker agents (SubTurn in-process)
- MITRE ATT&CK as action taxonomy
- Shared token budget across all simulation agents
- Results → vault note automatically

### F4 — Multi-Provider Brain
- Anthropic, OpenAI, OpenRouter, Ollama (local)
- Automatic failover between providers
- Cost tracking per session (input/output/cache tokens)
- 40+ ready tools (shell, web, files, vision, MCP, TTS, subagents)

### F5 — Continuous Learning (Skills)
- Agent creates skills from repeated patterns
- Skills stored in vault as Markdown
- Skills improve after each use
- ClawHub-compatible skill sharing

### F6 — Deployment Profiles
```bash
midclaw chat                        # Interactive TUI
midclaw guard --profile enterprise  # Continuous SOC monitoring
midclaw sim --actor apt29           # Threat simulation
midclaw pentest --scope scope.txt   # Red team mode
midclaw home                        # Family protection mode
```

### F7 — Messaging Gateways
- Telegram (alerts + human approval)
- Slack (SOC integration)
- Discord (community/home)
- Webhook (SIEM integration)

---

## 7. Roadmap

### Phase 0 — Foundation (Weeks 1–2)
- [ ] Repository structure
- [ ] TypeScript project setup (Node 22, native SQLite)
- [ ] Python project setup (uv, pyproject.toml)
- [ ] Core interfaces defined (ContextEngine, Hook, VaultStore)
- [ ] CI/CD pipeline

### Phase 1 — Vault Engine (Weeks 3–5)
- [ ] `vault/store.ts` — SQLite WAL + FTS5
- [ ] `vault/wikilink.ts` — parser + index
- [ ] `vault/rag.ts` — WikiRAG search + traversal
- [ ] `vault/writer.ts` — auto-generate notes
- [ ] Obsidian compatibility verified
- [ ] Target: 1000 notes, query < 100ms

### Phase 2 — Hook Pipeline (Weeks 6–8)
- [ ] `core/eventbus.ts` — non-blocking broadcaster
- [ ] `core/hooks.ts` — HookManager with 6 actions
- [ ] `security/hooks/approval.ts` — whitelist/blacklist/scope
- [ ] `security/hooks/vault-logger.ts` — AfterTool → vault
- [ ] `security/hooks/context-injector.ts` — BeforeLLM → WikiRAG
- [ ] Telegram approval notification

### Phase 3 — Python Brain Bridge (Weeks 9–11)
- [ ] `brain/agent.py` — multi-provider LLM (Hermes fork)
- [ ] `brain/vault_bridge.py` — Python ↔ TypeScript via HTTP
- [ ] 40+ tools imported from Hermes Agent
- [ ] Skills system active
- [ ] Context compressor active

### Phase 4 — Simulation Engine (Weeks 12–15)
- [ ] `sim/profiles.py` — ThreatActorProfile from vault (no Zep)
- [ ] `sim/runner.py` — SubTurn-based in-process simulation
- [ ] `sim/mitre.py` — MITRE ATT&CK local dataset
- [ ] `sim/report.py` — simulation results → vault note
- [ ] Test: 5 concurrent threat actors, 50k token budget

### Phase 5 — Complete Product (Weeks 16–20)
- [ ] Deployment profiles (enterprise/pentest/home)
- [ ] Messaging gateways (Telegram, Slack, Discord)
- [ ] Obsidian plugin (vault UI + agent query)
- [ ] `dreaming.ts` — background memory consolidation
- [ ] Security audit engine (50+ checks from OpenClaw)
- [ ] Docker image + install script
- [ ] Documentation

---

## 8. Technical Decisions

| Decision | Choice | Reason |
|---|---|---|
| Primary runtime language | TypeScript | OpenClaw origin, hackable, Node 22 native SQLite |
| AI/LLM language | Python | Hermes + MiroFish already built, AI ecosystem |
| Memory graph | SQLite + wikilinks | No Zep, no Neo4j, offline, free |
| Search | FTS5 + graph traversal | Deterministic, zero cost, no embeddings needed |
| Simulation execution | In-process SubTurns | No subprocess IPC, shared token budget |
| Vault format | Obsidian Markdown | Human-readable, git-versionable, editable |
| Go runtime | v2 only | Only if embedded hardware ($10 board) becomes hard requirement |
| MITRE ATT&CK data | Local STIX JSON | Offline, ~50MB, no API dependency |
| Vault encryption | AES-256 on sensitive dirs | `loot/`, `credentials/` encrypted at rest |

---

## 9. Success Metrics

### Technical
| Metric | Target |
|---|---|
| Vault query latency | < 100ms (1k notes) |
| Hook pipeline overhead | < 10ms per tool call |
| Simulation (5 actors) | < 3 min (50k token budget) |
| Memory usage (idle) | < 150MB |
| Install size | < 500MB (including Python) |

### Product (6 months)
| Metric | Target |
|---|---|
| Alert false positive rate | < 5% (vs 30%+ in SIEM) |
| Incident recall (top-10) | > 90% |
| Simulation attack prediction accuracy | > 70% |
| Time to onboard | < 30 minutes |

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| TypeScript ↔ Python bridge latency | HTTP/WebSocket local, msgpack encoding |
| WikiRAG imprecise at scale | Hybrid: FTS5 + local embeddings (fastembed) added in v1.1 |
| Simulation token cost explosion | Mandatory token budget, hard limit per simulation |
| Obsidian vault conflicts | Vault is append-only for agent; user edits are read-only to agent |
| Security hook bypass | Hooks run in separate goroutine with timeout; bypass = hard abort |
