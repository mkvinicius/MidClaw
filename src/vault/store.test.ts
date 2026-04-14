/**
 * MidClaw Vault Store — integration tests
 * Tests: write, get, search (FTS5), backlinks, forward links, dreaming
 */

import { VaultStore } from "./store.js";
import { WikiRAG } from "./rag.js";
import { VaultWriter } from "./writer.js";
import { DreamingEngine } from "./dreaming.js";
import { EventBus } from "../core/eventbus.js";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Use temp dir for test vault
const testDir = path.join(os.tmpdir(), `midclaw-test-${Date.now()}`);
fs.mkdirSync(testDir, { recursive: true });
process.env.MIDCLAW_VAULT_PATH = testDir;

let pass = 0;
let fail = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    pass++;
  } else {
    console.error(`  ✗ ${message}`);
    fail++;
  }
}

function section(name: string): void {
  console.log(`\n[${name}]`);
}

async function runTests() {
  section("VaultStore — basic operations");

  const vault = new VaultStore();

  // Write a note
  const note1 = vault.write({
    path: "incidents/test-001",
    title: "Test Incident Alpha",
    content: "# Test Incident Alpha\n\nThis links to [[threat-actors/apt29]] and [[techniques/T1021.001]].\n\nDetails about RDP lateral movement.",
    type: "incident",
    severity: "high",
    tags: ["rdp", "lateral-movement", "test"],
    related: ["threat-actors/apt29", "techniques/T1021.001"],
  });
  assert(note1.path === "incidents/test-001", "write note returns correct path");
  assert(note1.title === "Test Incident Alpha", "write note returns correct title");

  // Get by path
  const retrieved = vault.get("incidents/test-001");
  assert(retrieved !== null, "get by path returns note");
  assert(retrieved?.type === "incident", "note type is correct");

  // Write a second note
  vault.write({
    path: "threat-actors/apt29",
    title: "APT29",
    content: "# APT29\n\nRussian state-sponsored threat actor using [[techniques/T1021.001]].",
    type: "threat-actor",
    tags: ["apt29", "russia", "espionage"],
    related: ["techniques/T1021.001"],
  });

  vault.write({
    path: "techniques/T1021.001",
    title: "Remote Desktop Protocol",
    content: "# Remote Desktop Protocol\n\nAdversaries use RDP for lateral movement.",
    type: "technique",
    tags: ["rdp", "lateral-movement", "mitre-attack"],
    related: [],
  });

  section("VaultStore — FTS5 search");

  const results = vault.search("rdp lateral movement");
  assert(results.length > 0, "FTS5 search returns results");
  assert(results.some(r => r.note.path === "incidents/test-001"), "FTS5 finds incident note");

  const noResults = vault.search("xyzzy_nonexistent_term_42");
  assert(noResults.length === 0, "FTS5 returns empty for no match");

  section("VaultStore — wikilink graph");

  const backlinks = vault.getBacklinks("threat-actors/apt29");
  assert(backlinks.length > 0, "backlinks resolves correctly");
  assert(backlinks.some(n => n.path === "incidents/test-001"), "incident appears in apt29 backlinks");

  const forwardLinks = vault.getForwardLinks("incidents/test-001");
  assert(forwardLinks.includes("threat-actors/apt29"), "forward links includes apt29");
  assert(forwardLinks.includes("techniques/T1021.001"), "forward links includes technique");

  section("VaultStore — list");

  const allNotes = vault.list();
  assert(allNotes.length >= 3, "list returns all notes");

  const incidents = vault.list("incident");
  assert(incidents.length >= 1, "list filtered by type works");

  section("WikiRAG — context building");

  const rag = new WikiRAG(vault);
  const ctx = await rag.buildContext("rdp lateral movement apt29");
  assert(ctx.notes.length > 0, "WikiRAG finds relevant notes");
  assert(ctx.context_block.includes("<vault_context"), "context block is properly formatted");
  assert(ctx.tokens_estimate > 0, "token estimate is positive");

  section("VaultWriter — structured notes");

  const writer = new VaultWriter(vault);

  const incidentNote = writer.writeIncident({
    title: "Ransomware Attack Simulation",
    description: "Simulated ransomware deployment by APT41",
    severity: "critical",
    affectedSystems: ["fileserver01", "dc01"],
    techniques: ["T1486", "T1059.001"],
    threatActors: ["APT41"],
    iocs: ["192.168.1.100", "malware.exe"],
    recommendations: ["Deploy EDR", "Enable backup immutability"],
  });
  assert(incidentNote.type === "incident", "VaultWriter creates incident note");
  assert(incidentNote.tags.includes("critical"), "incident note has severity tag");

  const techNote = writer.writeTechnique("T1486", "Data Encrypted for Impact",
    "Ransomware encrypts data to extort payment.",
    ["Offline backups", "EDR"]
  );
  assert(techNote.path === "techniques/T1486", "technique note has correct path");

  section("DreamingEngine — consolidation");

  const bus = new EventBus();
  const dreaming = new DreamingEngine(vault, { hotNodeThreshold: 2 }, bus);
  const result = await dreaming.consolidate();
  assert(result.runDurationMs >= 0, "consolidation completes");
  assert(typeof result.hotNodes === "object", "consolidation returns hotNodes");

  section("EventBus");

  const events: string[] = [];
  const subId = bus.subscribe((evt) => { events.push(evt.kind); });
  bus.emit("tool.before", { tool: "test" });
  await new Promise(r => setTimeout(r, 50));
  assert(events.includes("tool.before"), "EventBus delivers events");
  bus.unsubscribe(subId);

  // Cleanup
  vault.close();
  bus.close();

  // Summary
  console.log(`\n${"─".repeat(40)}`);
  console.log(`Tests: ${pass + fail} | Pass: ${pass} | Fail: ${fail}`);

  if (fail > 0) {
    process.exit(1);
  } else {
    console.log("\nAll tests passed.");
  }
}

runTests().catch(err => {
  console.error("Test runner error:", err);
  process.exit(1);
});
