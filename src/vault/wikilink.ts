/**
 * MidClaw Wikilink Parser
 * Extracts [[backlinks]] from Markdown content
 */

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

export function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = WIKILINK_RE.exec(content)) !== null) {
    const raw = match[1].trim();
    // Support [[path|alias]] — take only the path part
    const linkPath = raw.split("|")[0].trim();
    if (linkPath) links.push(linkPath);
  }
  return [...new Set(links)];
}

export function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : "Untitled";
}

export function extractTags(content: string): string[] {
  const frontmatter = parseFrontmatter(content);
  if (frontmatter.tags) {
    if (Array.isArray(frontmatter.tags)) return frontmatter.tags;
    if (typeof frontmatter.tags === "string") return [frontmatter.tags];
  }
  // Also extract inline #tags
  const inlineTags = [...content.matchAll(/#([\w/-]+)/g)].map(m => m[1]);
  return [...new Set(inlineTags)];
}

export function parseFrontmatter(content: string): Record<string, any> {
  const match = content.match(/^---\n([\s\S]+?)\n---/);
  if (!match) return {};
  try {
    // Simple YAML-like parser for common types
    const result: Record<string, any> = {};
    for (const line of match[1].split("\n")) {
      const sep = line.indexOf(":");
      if (sep === -1) continue;
      const key = line.slice(0, sep).trim();
      const raw = line.slice(sep + 1).trim();
      if (raw.startsWith("[")) {
        result[key] = raw.slice(1, -1).split(",").map(s => s.trim().replace(/['"]/g, ""));
      } else {
        result[key] = raw.replace(/['"]/g, "");
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function buildNoteMarkdown(params: {
  title: string;
  type: string;
  severity?: string;
  tags: string[];
  related: string[];
  body: string;
  date?: Date;
}): string {
  const date = (params.date ?? new Date()).toISOString();
  const frontmatter = [
    "---",
    `date: ${date}`,
    `type: ${params.type}`,
    params.severity ? `severity: ${params.severity}` : null,
    `tags: [${params.tags.join(", ")}]`,
    `related: [${params.related.map(r => `"${r}"`).join(", ")}]`,
    "---",
  ].filter(Boolean).join("\n");

  return `${frontmatter}\n\n# ${params.title}\n\n${params.body}`;
}
