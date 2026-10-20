import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSeed } from "../src/seed";
import { PORTRAITS_DIR, loadPortraits, loadPortraitsFile } from "../src/portraits";
import { repoRoot } from "../src/content-files";

/**
 * Official portraits on actor pages (docs/OPERATIONS.md §18): every MP on the ledger has Parliament's credit recorded,
 * every credited portrait is on the site, and each is shown with its credit and licence. The same rule for every MP.
 */
const root = repoRoot();
const file = loadPortraitsFile(root);
const portraitOf = loadPortraits(root);
const mps = loadSeed().actors.filter((a) => a.kind === "person" && a.parliament_member_id);

describe("official portraits", () => {
  it("record Parliament's credit for every MP on the ledger", () => {
    for (const a of mps) expect(file.portraits[String(a.parliament_member_id)], `${a.id}: add Parliament's credit to data/portraits.json`).toBeDefined();
  });

  it("are on the site, small enough to send, for every credited MP with a portrait", () => {
    for (const [id, p] of Object.entries(file.portraits)) {
      const path = join(root, PORTRAITS_DIR, `${id}.jpg`);
      if (p.missing) {
        expect(existsSync(path), `member ${id} is marked missing but has an image`).toBe(false);
        continue;
      }
      expect(existsSync(path), `member ${id}: run pnpm portraits`).toBe(true);
      expect(statSync(path).size, `member ${id}: resize to 560x747`).toBeLessThan(200_000);
    }
  });

  it("carry the credit, the licence and Parliament's page", () => {
    const burnham = portraitOf(1427)!;
    expect(burnham).toEqual({
      src: "/portraits/1427.jpg",
      credit: "©House of Commons",
      licence: { name: "CC BY 3.0", url: "https://creativecommons.org/licenses/by/3.0/" },
      source: "https://members.parliament.uk/member/1427/portrait",
    });
    expect(portraitOf(undefined)).toBeNull();
    expect(portraitOf(999_999)).toBeNull();
  });

  it("show an older official portrait Parliament no longer serves with its year and the page of its copy", () => {
    expect(portraitOf(4483)).toEqual({
      src: "/portraits/4483.jpg",
      credit: "©House of Commons",
      licence: { name: "CC BY 3.0", url: "https://creativecommons.org/licenses/by/3.0/" },
      source: "https://commons.wikimedia.org/wiki/File:Rishi_Sunak_official_portrait,_2017.jpg",
      taken: "2017",
    });
  });
});
