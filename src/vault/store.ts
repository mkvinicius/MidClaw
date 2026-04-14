/**
 * MidClaw Vault Store
 * SQLite WAL + FTS5 — persistent associative memory
 * Pattern from Hermes Agent hermes_state.py, adapted to TypeScript with Node 22 native SQLite
 */

import Database from "better-sqlite3";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

export interface VaultNote {
  id?: number;
  path: string;
  title: string;
  content: string;
  type: string;
  severity?: string;
  tags: string[];
  related: string[];   // [[wikilinks]]
  createdAt: number;
  updatedAt: number;
}

export interface SearchResult {
  note: VaultNote;
  rank: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  path        TEXT    NOT NULL UNIQUE,
  title       TEXT    NOT NULL,
  content     TEXT    NOT NULL,
  type        TEXT    NOT NULL DEFAULT 'note',
  severity    TEXT,
  tags        TEXT    NOT NULL DEFAULT '[]',
  related     TEXT    NOT NULL DEFAULT '[]',
  created_at  REAL    NOT NULL,
  updated_at  REAL    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_path ON notes(path);
CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(type);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title,
  content,
  tags,
  content=notes,
  content_rowid=id
);

CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, content, tags)
  VALUES (new.id, new.title, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content, tags)
  VALUES ('delete', old.id, old.title, old.content, old.tags);
  INSERT INTO notes_fts(rowid, title, content, tags)
  VALUES (new.id, new.title, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content, tags)
  VALUES ('delete', old.id, old.title, old.content, old.tags);
END;

CREATE TABLE IF NOT EXISTS wikilinks (
  source_path TEXT NOT NULL,
  target_path TEXT NOT NULL,
  PRIMARY KEY (source_path, target_path)
);

CREATE INDEX IF NOT EXISTS idx_wikilinks_source ON wikilinks(source_path);
CREATE INDEX IF NOT EXISTS idx_wikilinks_target ON wikilinks(target_path);
`;

export class VaultStore {
  private db: Database.Database;

  constructor(vaultPath?: string) {
    const dir = vaultPath ?? path.join(os.homedir(), ".midclaw", "vault");
    fs.mkdirSync(dir, { recursive: true });

    const dbPath = path.join(dir, "vault.db");
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA);
  }

  write(note: Omit<VaultNote, "id" | "createdAt" | "updatedAt">): VaultNote {
    const now = Date.now() / 1000;
    const tags = JSON.stringify(note.tags);
    const related = JSON.stringify(note.related);

    const existing = this.db
      .prepare("SELECT id FROM notes WHERE path = ?")
      .get(note.path) as { id: number } | undefined;

    if (existing) {
      this.db.prepare(`
        UPDATE notes SET title=?, content=?, type=?, severity=?, tags=?, related=?, updated_at=?
        WHERE path=?
      `).run(note.title, note.content, note.type, note.severity ?? null, tags, related, now, note.path);
    } else {
      this.db.prepare(`
        INSERT INTO notes (path, title, content, type, severity, tags, related, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(note.path, note.title, note.content, note.type, note.severity ?? null, tags, related, now, now);
    }

    // Update wikilink index
    this.db.prepare("DELETE FROM wikilinks WHERE source_path = ?").run(note.path);
    for (const target of note.related) {
      this.db.prepare("INSERT OR IGNORE INTO wikilinks (source_path, target_path) VALUES (?, ?)")
        .run(note.path, target);
    }

    return this.get(note.path)!;
  }

  get(notePath: string): VaultNote | null {
    const row = this.db
      .prepare("SELECT * FROM notes WHERE path = ?")
      .get(notePath) as any;
    return row ? this.rowToNote(row) : null;
  }

  search(query: string, limit = 10): SearchResult[] {
    const rows = this.db.prepare(`
      SELECT n.*, notes_fts.rank
      FROM notes_fts
      JOIN notes n ON n.id = notes_fts.rowid
      WHERE notes_fts MATCH ?
      ORDER BY notes_fts.rank
      LIMIT ?
    `).all(query, limit) as any[];

    return rows.map(row => ({
      note: this.rowToNote(row),
      rank: row.rank,
    }));
  }

  getBacklinks(notePath: string): VaultNote[] {
    const rows = this.db.prepare(`
      SELECT n.* FROM notes n
      JOIN wikilinks w ON w.source_path = n.path
      WHERE w.target_path = ?
    `).all(notePath) as any[];
    return rows.map(r => this.rowToNote(r));
  }

  getForwardLinks(notePath: string): string[] {
    const rows = this.db.prepare(
      "SELECT target_path FROM wikilinks WHERE source_path = ?"
    ).all(notePath) as any[];
    return rows.map(r => r.target_path);
  }

  list(type?: string, limit = 50): VaultNote[] {
    const rows = type
      ? this.db.prepare("SELECT * FROM notes WHERE type = ? ORDER BY updated_at DESC LIMIT ?").all(type, limit)
      : this.db.prepare("SELECT * FROM notes ORDER BY updated_at DESC LIMIT ?").all(limit);
    return (rows as any[]).map(r => this.rowToNote(r));
  }

  close(): void {
    this.db.close();
  }

  private rowToNote(row: any): VaultNote {
    return {
      id: row.id,
      path: row.path,
      title: row.title,
      content: row.content,
      type: row.type,
      severity: row.severity ?? undefined,
      tags: JSON.parse(row.tags),
      related: JSON.parse(row.related),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
