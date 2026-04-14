/**
 * MidClaw VaultWriter — auto-generate notes from incidents/conversations/simulations
 */

import { VaultStore } from "./store.js";
import { buildNoteMarkdown, extractTags } from "./wikilink.js";
import type { VaultNote } from "./store.js";

export interface IncidentData {
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  affectedSystems: string[];
  techniques: string[];      // MITRE ATT&CK IDs
  threatActors?: string[];
  iocs?: string[];
  timeline?: Array<{ time: string; event: string }>;
  recommendations?: string[];
}

export interface ConversationData {
  sessionKey: string;
  title: string;
  summary: string;
  keyFindings: string[];
  toolsUsed: string[];
}

export interface SimulationData {
  title: string;
  scenario: string;
  threatActor: string;
  techniques: string[];
  outcome: string;
  findings: string[];
  mitigations: string[];
}

export class VaultWriter {
  private vault: VaultStore;

  constructor(vault: VaultStore) {
    this.vault = vault;
  }

  writeIncident(data: IncidentData): VaultNote {
    const slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
    const path = `incidents/${slug}-${Date.now()}`;

    const techniqueLinks = data.techniques.map(t => `[[techniques/${t}]]`).join(", ");
    const actorLinks = (data.threatActors ?? []).map(a => `[[threat-actors/${a}]]`).join(", ");

    let body = `## Description\n\n${data.description}\n\n`;
    body += `## Affected Systems\n\n${data.affectedSystems.map(s => `- ${s}`).join("\n")}\n\n`;
    body += `## Techniques\n\n${data.techniques.map(t => `- [[techniques/${t}]]`).join("\n")}\n\n`;

    if (data.threatActors?.length) {
      body += `## Threat Actors\n\n${data.threatActors.map(a => `- [[threat-actors/${a}]]`).join("\n")}\n\n`;
    }

    if (data.iocs?.length) {
      body += `## Indicators of Compromise\n\n\`\`\`\n${data.iocs.join("\n")}\n\`\`\`\n\n`;
    }

    if (data.timeline?.length) {
      body += `## Timeline\n\n`;
      for (const entry of data.timeline) {
        body += `- **${entry.time}** — ${entry.event}\n`;
      }
      body += "\n";
    }

    if (data.recommendations?.length) {
      body += `## Recommendations\n\n${data.recommendations.map(r => `- ${r}`).join("\n")}\n`;
    }

    const related = [
      ...data.techniques.map(t => `techniques/${t}`),
      ...(data.threatActors ?? []).map(a => `threat-actors/${a}`),
    ];

    const tags = ["incident", data.severity, ...data.techniques.map(t => t.toLowerCase())];

    const content = buildNoteMarkdown({ title: data.title, type: "incident", tags, body, related });

    return this.vault.write({ path, title: data.title, content, type: "incident", severity: data.severity, tags, related });
  }

  writeConversation(data: ConversationData): VaultNote {
    const path = `conversations/${data.sessionKey}`;

    let body = `## Summary\n\n${data.summary}\n\n`;

    if (data.keyFindings.length) {
      body += `## Key Findings\n\n${data.keyFindings.map(f => `- ${f}`).join("\n")}\n\n`;
    }

    if (data.toolsUsed.length) {
      body += `## Tools Used\n\n${data.toolsUsed.map(t => `- \`${t}\``).join("\n")}\n`;
    }

    const content = buildNoteMarkdown({
      title: data.title, type: "conversation",
      tags: ["conversation", data.sessionKey],
      body, related: [],
    });

    return this.vault.write({
      path, title: data.title, content,
      type: "conversation", tags: ["conversation"],
      related: [],
    });
  }

  writeSimulation(data: SimulationData): VaultNote {
    const slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
    const path = `simulations/${slug}-${Date.now()}`;

    let body = `## Scenario\n\n${data.scenario}\n\n`;
    body += `## Threat Actor\n\n[[threat-actors/${data.threatActor}]]\n\n`;
    body += `## Techniques Used\n\n${data.techniques.map(t => `- [[techniques/${t}]]`).join("\n")}\n\n`;
    body += `## Outcome\n\n${data.outcome}\n\n`;
    body += `## Findings\n\n${data.findings.map(f => `- ${f}`).join("\n")}\n\n`;
    body += `## Mitigations\n\n${data.mitigations.map(m => `- ${m}`).join("\n")}\n`;

    const related = [
      `threat-actors/${data.threatActor}`,
      ...data.techniques.map(t => `techniques/${t}`),
    ];

    const content = buildNoteMarkdown({
      title: data.title, type: "simulation",
      tags: ["simulation", data.threatActor, ...data.techniques],
      body, related,
    });

    return this.vault.write({
      path, title: data.title, content,
      type: "simulation", tags: ["simulation"],
      related,
    });
  }

  writeThreatActor(name: string, description: string, techniques: string[], aliases: string[] = []): VaultNote {
    const path = `threat-actors/${name}`;

    let body = `## Description\n\n${description}\n\n`;
    body += `## Techniques\n\n${techniques.map(t => `- [[techniques/${t}]]`).join("\n")}\n`;
    if (aliases.length) {
      body += `\n## Aliases\n\n${aliases.map(a => `- ${a}`).join("\n")}\n`;
    }

    const related = techniques.map(t => `techniques/${t}`);
    const content = buildNoteMarkdown({
      title: name, type: "threat-actor",
      tags: ["threat-actor", ...techniques],
      body, related,
    });

    return this.vault.write({
      path, title: name, content,
      type: "threat-actor", tags: ["threat-actor"],
      related,
    });
  }

  writeTechnique(id: string, name: string, description: string, mitigations: string[] = []): VaultNote {
    const path = `techniques/${id}`;

    let body = `**ID:** ${id}\n\n## Description\n\n${description}\n`;
    if (mitigations.length) {
      body += `\n## Mitigations\n\n${mitigations.map(m => `- ${m}`).join("\n")}\n`;
    }

    const content = buildNoteMarkdown({
      title: `${id}: ${name}`, type: "technique",
      tags: ["technique", "mitre-attack", id.toLowerCase()],
      body, related: [],
    });

    return this.vault.write({
      path, title: `${id}: ${name}`, content,
      type: "technique", tags: ["technique", "mitre-attack"],
      related: [],
    });
  }
}
