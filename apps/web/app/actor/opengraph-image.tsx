import { getSeed } from "@/lib/data";
import { OG } from "@/lib/og";
import { figuresImage } from "@/lib/method-og";

export const alt = "LedgerGov.UK: the people, parties and public bodies whose promises it tracks";
export const size = OG.size;
export const contentType = "image/png";

export default async function Image() {
  const { actors, cards } = getSeed();
  const count = (kind: string) => actors.filter((a) => a.kind === kind).length;
  return figuresImage({
    kicker: "People, parties and public bodies",
    title: "Whose promises the ledger tracks, and where they stand",
    figures: [
      { value: String(count("person")), label: "people" },
      { value: String(count("party")), label: "parties" },
      { value: String(cards.length), label: "promises tracked" },
    ],
    foot: "One standard for everyone, every status change backed by evidence",
  });
}
