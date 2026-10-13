"use client";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { parseMarkdown, type Inline, type Line } from "./markdown";

const LINK = "font-bold text-accent-ink underline underline-offset-2";

function renderInline(nodes: Inline[], newTab: string): ReactNode[] {
  return nodes.map((n, i) => {
    if (n.kind === "text") return <Fragment key={i}>{n.text}</Fragment>;
    if (n.kind === "strong") return <strong key={i}>{renderInline(n.children, newTab)}</strong>;
    if (!n.external)
      return (
        <Link key={i} href={n.href} className={LINK}>
          {renderInline(n.children, newTab)}
        </Link>
      );
    return (
      <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className={`${LINK} break-words`}>
        {renderInline(n.children, newTab)}
        <span className="sr-only"> {newTab}</span>
      </a>
    );
  });
}

function renderLine(line: Line, newTab: string) {
  return renderInline(line, newTab);
}

/** Renders an answer (see markdown.ts). Only React text nodes: never raw HTML. */
export function Markdown({ text, newTab }: { text: string; newTab: string }) {
  const origin = typeof window === "undefined" ? undefined : window.location.origin;
  return (
    <div className="grid gap-2 break-words">
      {parseMarkdown(text, origin).map((b, i) => {
        if (b.kind === "p")
          return (
            <p key={i}>
              {b.lines.map((l, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  {renderLine(l, newTab)}
                </Fragment>
              ))}
            </p>
          );
        const List = b.kind === "ul" ? "ul" : "ol";
        return (
          <List key={i} className={b.kind === "ul" ? "grid list-disc gap-1 pl-5" : "grid list-decimal gap-1 pl-5"}>
            {b.items.map((item, j) => (
              <li key={j}>{renderLine(item, newTab)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
