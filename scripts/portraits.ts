/**
 * pnpm portraits [--refresh]: UK Parliament's official portrait of every MP in data/portraits.json, saved for the actor
 * pages as apps/web/public/portraits/<member id>.jpg (docs/OPERATIONS.md §18).
 *
 * Each portrait is Parliament's 3:4 crop from the Members API, resized to 560x747 so it stays sharp at the page's
 * 280px width on a high-density screen and small to send. The site serves the copies itself, so a reader's browser
 * never asks Parliament for them. The credits are copied by hand into data/portraits.json from Parliament's list
 * (its web pages refuse scripts); this script only fetches and resizes, and says which MPs on the ledger have no
 * entry yet. Resizing uses macOS `sips`. Without --refresh, a portrait already saved is kept.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readYamlDir, repoRoot } from "../packages/schema/src/content-files";

const root = repoRoot();
const refresh = process.argv.includes("--refresh");
const data = JSON.parse(readFileSync(join(root, "data/portraits.json"), "utf8")) as { portraits: Record<string, { listed_as: string; credit: string; missing?: string }> };
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
    const res = await fetch(`https://members-api.parliament.uk/api/Members/${id}/Portrait?cropType=ThreeFour&webVersion=false`);
    if (!res.ok || !res.headers.get("content-type")?.startsWith("image/jpeg")) {
      console.log(`member ${id}: no portrait (${res.status})`);
      continue;
    }
    const full = join(out, `${id}.full.jpg`);
    writeFileSync(full, Buffer.from(await res.arrayBuffer()));
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "78", "-z", "747", "560", full, "--out", file], { stdio: "ignore" });
    execFileSync("rm", [full]);
    console.log(`member ${id}: saved ${file}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
