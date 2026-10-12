"use client";

import { useEffect, useState } from "react";
import type { ShareMethod } from "@ledger/schema";

/**
 * Share a link the way the reader's device does it best. On phones (and any
 * browser with the Web Share API) the main button opens the system's share
 * sheet; elsewhere it copies the link. Below it, plain links to the usual
 * apps: no third-party script loads until the reader picks one. `onShare`
 * counts which way was used, never what was shared.
 */
export function ShareBar({
  url,
  title,
  text,
  label = "Share",
  onShare,
}: {
  /** The absolute link to share. */
  url: string;
  title: string;
  /** The words that go with the link. */
  text: string;
  label?: string;
  onShare?: (method: ShareMethod) => void;
}) {
  // Known only in the browser; the server renders the copy-link version.
  const [native, setNative] = useState(false);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => setNative(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // In-app browsers often block the clipboard API: try the older way before giving up.
      if (!legacyCopy(url)) return setState("failed");
    }
    setState("copied");
    onShare?.("copy");
  };

  const share = async () => {
    if (!native) return copy();
    try {
      await navigator.share({ title, text, url });
      onShare?.("native");
    } catch (e) {
      // The reader closed the sheet: nothing to do. Anything else: fall back to copying.
      if ((e as Error).name !== "AbortError") await copy();
    }
  };

  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  const apps: { method: ShareMethod; name: string; href: string }[] = [
    { method: "whatsapp", name: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
    { method: "telegram", name: "Telegram", href: `https://t.me/share/url?url=${u}&text=${t}` },
    { method: "x", name: "X", href: `https://x.com/intent/post?text=${t}&url=${u}` },
    { method: "linkedin", name: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { method: "facebook", name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { method: "email", name: "Email", href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${text}\n\n${url}`)}` },
  ];

  const chip =
    "inline-flex min-h-9 cursor-pointer items-center rounded-full bg-bg px-3 text-label font-medium text-ink no-underline shadow-[inset_0_0_0_1px_var(--line-strong)] hover:shadow-[inset_0_0_0_1px_var(--ink)]";

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={share}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control bg-ink px-5 text-[15px] font-semibold text-bg hover:opacity-90"
        >
          <ShareIcon />
          {native ? label : "Copy link to share"}
        </button>
        <span aria-live="polite" className="text-label text-muted">
          {state === "copied" ? "Link copied. Paste it anywhere, or pick an app below." : state === "failed" ? "Could not copy: select the link below and copy it." : ""}
        </span>
      </div>
      <div className="grid gap-1.5">
        <span className="text-label text-muted">{native ? "Or send it straight to" : "Or share on"}</span>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {native && (
            <li>
              <button type="button" onClick={copy} className={chip}>
                Copy link
              </button>
            </li>
          )}
          {apps.map((a) => (
            <li key={a.method}>
              <a
                href={a.href}
                className={chip}
                onClick={() => onShare?.(a.method)}
                {...(a.method === "email" ? {} : { target: "_blank", rel: "noopener noreferrer" })}
              >
                {a.name}
                {a.method !== "email" && <span className="sr-only"> (opens in a new tab)</span>}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <p className="m-0 break-all text-caption text-muted">
        <span className="sr-only">Link: </span>
        {url}
      </p>
    </div>
  );
}

/** Copy with a hidden text field and execCommand, for browsers without clipboard access. */
function legacyCopy(text: string): boolean {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

function ShareIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13V3M6.5 6.5 10 3l3.5 3.5M5 10H4v7h12v-7h-1" />
    </svg>
  );
}
