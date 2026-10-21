import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { MAKER, OPEN_GRAPH, SITE_DESCRIPTION, SITE_NAME, siteUrl, SOURCE_CODE } from "@/lib/site";
import { AlsoBy } from "@/components/AlsoBy";
import { FooterLink } from "@/components/FooterLink";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "LedgerGov.UK: where UK public money comes from and goes",
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // No canonical here: each public page names its own, and a page without one (a 404, a private link) must not claim to be the home page.
  alternates: { types: { "application/atom+xml": [{ url: "/feeds/all.xml", title: "LedgerGov.UK: every change" }] } },
  openGraph: { ...OPEN_GRAPH, type: "website" },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
  authors: [{ name: MAKER.name, url: MAKER.url }],
  creator: MAKER.name,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#241f1a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={GeistSans.variable}>
      <body>
        {children}
        <footer className="mx-auto max-w-[1200px] px-4 pb-8 pt-6 text-caption text-muted sm:px-6">
          <AlsoBy />
          {/* Items are set apart by space alone: no middle-dot separators (docs/DESIGN_HANDOFF.md, Visual direction). */}
          <p className="m-0 flex flex-wrap gap-x-6 gap-y-1">
            <span>
              Made by{" "}
              <a href={MAKER.url} rel="author">
                {MAKER.name}
              </a>
            </span>
            <a href={MAKER.coffee} rel="noopener noreferrer" target="_blank">
              Buy me a coffee
            </a>
            <FooterLink href="/editors">Become an editor</FooterLink>
            <FooterLink href="/privacy">Privacy</FooterLink>
            <a href="/method#licence">Our text: CC BY 4.0, data: Open Government Licence</a>
            <a href={SOURCE_CODE.url}>Source code</a>
          </p>
        </footer>
      </body>
    </html>
  );
}
