#!/usr/bin/env node
/**
 * MidClaw — Entry Point
 */

import { Command } from "commander";
import chalk from "chalk";
import { VaultStore } from "./vault/index.js";
import { WikiRAG } from "./vault/rag.js";

const program = new Command();

program
  .name("midclaw")
  .description("AI security agent with living associative memory")
  .version("0.1.0");

program
  .command("vault:search <query>")
  .description("Search the vault")
  .option("-n, --limit <n>", "max results", "5")
  .action(async (query: string, opts) => {
    const vault = new VaultStore();
    const results = vault.search(query, parseInt(opts.limit));
    if (results.length === 0) {
      console.log(chalk.yellow("No results found."));
    } else {
      for (const r of results) {
        console.log(chalk.green(`[${r.note.type}]`), chalk.bold(r.note.title));
        console.log(chalk.dim(`  ${r.note.path}`));
        console.log(chalk.dim(`  Tags: ${r.note.tags.join(", ")}`));
        console.log();
      }
    }
    vault.close();
  });

program
  .command("vault:write")
  .description("Write a test note to the vault")
  .action(async () => {
    const vault = new VaultStore();
    const note = vault.write({
      path: "incidents/test-001",
      title: "Test Incident",
      content: "# Test Incident\n\nThis is a test note with [[threat-actors/apt29]] link.\n\nTechnique: [[techniques/T1021.001]]",
      type: "incident",
      severity: "high",
      tags: ["test", "rdp", "lateral-movement"],
      related: ["threat-actors/apt29", "techniques/T1021.001"],
    });
    console.log(chalk.green("✓ Note written:"), note.path);
    vault.close();
  });

program
  .command("vault:list")
  .description("List vault notes")
  .option("-t, --type <type>", "filter by type")
  .action(async (opts) => {
    const vault = new VaultStore();
    const notes = vault.list(opts.type);
    if (notes.length === 0) {
      console.log(chalk.yellow("Vault is empty. Run: midclaw vault:write"));
    } else {
      for (const n of notes) {
        console.log(chalk.green(`[${n.type}]`), chalk.bold(n.title), chalk.dim(n.path));
      }
    }
    vault.close();
  });

program
  .command("vault:context <query>")
  .description("Build WikiRAG context for a query")
  .action(async (query: string) => {
    const vault = new VaultStore();
    const rag = new WikiRAG(vault);
    const ctx = await rag.buildContext(query);
    console.log(chalk.cyan(`Found ${ctx.notes.length} notes (~${ctx.tokens_estimate} tokens)`));
    console.log();
    console.log(ctx.context_block);
    vault.close();
  });

program.parse();
