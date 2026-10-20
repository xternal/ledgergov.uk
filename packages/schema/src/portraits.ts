import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { repoRoot } from "./content-files";

/**
 * UK Parliament's official portraits on actor pages (docs/OPERATIONS.md §18). data/portraits.json holds each MP's
 * credit as Parliament asks for it, keyed by parliament_member_id; `pnpm portraits` saves the images under
 * apps/web/public/portraits/. Read from disk at build time (Node only). The same rule for every MP: a portrait is shown
 * when Parliament publishes one, with its credit, the licence and "cropped".
 */
export const PortraitsFile = z.strictObject({
  about: z.string(),
  licence: z.strictObject({ name: z.string().min(1), url: z.string().url() }),
  checked_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  portraits: z.record(
    z.string().regex(/^\d+$/),
    z.strictObject({
      listed_as: z.string().min(1),
      credit: z.string().startsWith("©"),
      /** Why there is no image, when Parliament publishes none. */
      missing: z.string().optional(),
    }),
  ),
});
export type PortraitsFile = z.infer<typeof PortraitsFile>;

export interface Portrait {
  /** The image's path on the site. */
  src: string;
  /** "©House of Commons/Roger Harris", as Parliament asks. */
  credit: string;
  licence: { name: string; url: string };
  /** Parliament's page for the portrait. */
  source: string;
}

export const PORTRAITS_FILE = join("data", "portraits.json");
export const PORTRAITS_DIR = join("apps", "web", "public", "portraits");

/** The portraits file, validated; a bad file fails the build. */
export function loadPortraitsFile(root = repoRoot()): PortraitsFile {
  return PortraitsFile.parse(JSON.parse(readFileSync(join(root, PORTRAITS_FILE), "utf8")));
}

/** A lookup from parliament_member_id to the portrait the site shows, or null when there is none. */
export function loadPortraits(root = repoRoot()): (memberId: number | undefined | null) => Portrait | null {
  const file = loadPortraitsFile(root);
  return (memberId) => {
    if (memberId == null) return null;
    const p = file.portraits[String(memberId)];
    if (!p || p.missing || !existsSync(join(root, PORTRAITS_DIR, `${memberId}.jpg`))) return null;
    return { src: `/portraits/${memberId}.jpg`, credit: p.credit, licence: file.licence, source: `https://members.parliament.uk/member/${memberId}/portrait` };
  };
}
