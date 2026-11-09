import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSeed } from "../src/seed";
import { PORTRAITS_DIR, loadPortraits, loadPortraitsFile } from "../src/portraits";
import { repoRoot } from "../src/content-files";

/**
 * Official portraits on actor pages (docs/OPERATIONS.md §18): an MP's photo is shown only with Parliament's credit
 * recorded (an MP still waiting for one is listed, and shows none), every credited portrait is on the site, and each is shown with its credit and licence. The same rule for every MP.
 */
const root = repoRoot();
const file = loadPortraitsFile(root);
const portraitOf = loadPortraits(root);
const mps = loadSeed().actors.filter((a) => a.kind === "person" && a.parliament_member_id);

describe("official portraits", () => {
  it("show no photo for an MP whose credit is not recorded yet, and name them", () => {
    // A new MP actor must not hold a card back: in October 2026 the desk dropped 14 quotes by ministers, and credited 3
    // cards to a department's release instead of the minister, because this test failed until the credit was added by
    // hand (AI Journalist backtest, 1 Nov 2026). The page lays out without the photo, as for anyone who is not an MP.
    const waiting = mps.filter((a) => !file.portraits[String(a.parliament_member_id)]);
    for (const a of waiting) expect(portraitOf(a.parliament_member_id), `${a.id}: no credit, so no photo`).toBeNull();
    if (waiting.length) console.warn(`MPs waiting for Parliament's credit in data/portraits.json: ${waiting.map((a) => a.id).join(", ")}`);
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
