"use client";

import { useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function MermaidBlock({ code }: { code: string }) {
  const id = useId().replace(/:/g, "");
  const hostRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "strict",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        });
        const { svg: out } = await mermaid.render(`mmd-${id}`, code);
        if (!cancelled) setSvg(out);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Diagram error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (err) {
    return (
      <pre className="overflow-x-auto rounded-lg border border-amber-900/50 bg-amber-950/30 p-3 text-sm text-amber-200">
        {err}
        {"\n\n"}
        {code}
      </pre>
    );
  }

  if (!svg) {
    return (
      <div
        ref={hostRef}
        className="flex min-h-[120px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--muted)]"
      >
        Rendering diagram…
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[#0d1117] p-4 [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const lang = match?.[1];
          const text = String(children).replace(/\n$/, "");
          const isBlock = Boolean(className?.includes("language-"));

          if (isBlock && lang === "mermaid") {
            return <MermaidBlock code={text} />;
          }

          if (isBlock) {
            return (
              <pre className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[#0d1117] p-3 text-sm">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            );
          }

          return (
            <code
              className="rounded bg-[var(--border)]/60 px-1.5 py-0.5 text-[0.9em] text-[var(--accent)]"
              {...props}
            >
              {children}
            </code>
          );
        },
        p({ children }) {
          return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>;
        },
        ul({ children }) {
          return <ul className="mb-3 list-disc pl-5 last:mb-0">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="mb-3 list-decimal pl-5 last:mb-0">{children}</ol>;
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              className="text-[var(--accent)] underline-offset-2 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
