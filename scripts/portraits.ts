/**
 * pnpm portraits [--refresh]: UK Parliament's official portrait of every MP in data/portraits.json, saved for the actor
 * pages as apps/web/public/portraits/<member id>.jpg (docs/OPERATIONS.md §18).
 *
 * Each portrait is Parliament's 3:4 crop from the Members API, resized to 560x747 so it stays sharp at the page's
 * 280px width on a high-density screen and small to send. The site serves the copies itself, so a reader's browser
 * never asks Parliament for them. The credits are copied by hand into data/portraits.json from Parliament's list
 * (its web pages refuse scripts); this script only fetches and resizes, and says which MPs on the ledger have no
 * entry yet. Resizing uses macOS `sips`. Without --refresh, a portrait already saved is kept.
 *
 * An entry with `from` is an official portrait Parliament published under the same licence that the Members API no
 * longer serves (Rishi Sunak's of 2017): its copy is fetched from `from.image`, cropped to 3:4 about the centre and
 * resized the same way.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readYamlDir, repoRoot } from "../packages/schema/src/content-files";

const root = repoRoot();
const refresh = process.argv.includes("--refresh");
const data = JSON.parse(readFileSync(join(root, "data/portraits.json"), "utf8")) as {
  portraits: Record<string, { listed_as: string; credit: string; missing?: string; from?: { image: string } }>;
};
const out = join(root, "apps/web/public/portraits");
mkdirSync(out, { recursive: true });

const mps = readYamlDir(join(root, "content/actors"))
  .map((f) => f.data as { id: string; kind: string; identifiers?: { parliament_member_id?: number } })
  .filter((a) => a.kind === "person" && a.identifiers?.parliament_member_id);
for (const a of mps) {
  if (!data.portraits[String(a.identifiers!.parliament_member_id)]) console.log(`no credit yet for ${a.id} (member ${a.identifiers!.parliament_member_id}): add it to data/portraits.json`);
}

async function main() {
  for (const [id, p] of Object.entries(data.portraits)) {
    if (p.missing) continue;
    const file = join(out, `${id}.jpg`);
    if (existsSync(file) && !refresh) continue;
    const url = p.from?.image ?? `https://members-api.parliament.uk/api/Members/${id}/Portrait?cropType=ThreeFour&webVersion=false`;
    // Wikimedia asks every script to name itself and give a contact.
    const res = await fetch(url, { headers: { "user-agent": "LedgerGovUK-portraits/1.0 (https://ledgergov.uk; privacy@ledgergov.uk)" } });
    if (!res.ok || !res.headers.get("content-type")?.startsWith("image/jpeg")) {
      console.log(`member ${id}: no portrait (${res.status})`);
      continue;
    }
    const full = join(out, `${id}.full.jpg`);
    writeFileSync(full, Buffer.from(await res.arrayBuffer()));
    if (p.from) {
      // Parliament's own crop is already 3:4; a copy is cut to 3:4 about its centre first.
      const size = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", full], { encoding: "utf8" });
      const w = Number(/pixelWidth: (\d+)/.exec(size)![1]);
      const h = Number(/pixelHeight: (\d+)/.exec(size)![1]);
      const [cw, ch] = w * 4 > h * 3 ? [Math.round((h * 3) / 4), h] : [w, Math.round((w * 4) / 3)];
      execFileSync("sips", ["-c", String(ch), String(cw), full], { stdio: "ignore" });
    }
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "78", "-z", "747", "560", full, "--out", file], { stdio: "ignore" });
    execFileSync("rm", [full]);
    console.log(`member ${id}: saved ${file}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
