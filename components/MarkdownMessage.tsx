"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

const MERMAID_DEBOUNCE_MS = 480;

/** Strip accidental fences and smart quotes so model output parses more reliably. */
function normalizeMermaidInput(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```mermaid\s*\r?\n?/i, "");
  s = s.replace(/^```\s*\r?\n?/m, "");
  s = s.replace(/(?:\r?\n)?```\s*$/m, "");
  s = s.trim();
  s = s.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'");
  return s;
}
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Element as HastElement } from "hast";

function isFencedCodeBlock(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as HastElement & { parent?: HastElement | null };
  if (n.type !== "element" || n.tagName !== "code") return false;
  return n.parent?.tagName === "pre";
}

function getTextFromNode(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getTextFromNode).join("");
  if (isValidElement(node)) {
    const ch = (node.props as { children?: ReactNode }).children;
    return getTextFromNode(ch);
  }
  return "";
}

function MermaidBlock({ code }: { code: string }) {
  const id = useId().replace(/:/g, "");
  const hostRef = useRef<HTMLDivElement>(null);
  const renderSeq = useRef(0);
  const [svg, setSvg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setSvg(null);
    setErr(null);
    let cancelled = false;
    const timer = globalThis.setTimeout(() => {
      void (async () => {
        const normalized = normalizeMermaidInput(code);
        if (!normalized.trim()) return;

        try {
          const mermaid = (await import("mermaid")).default;
          mermaid.initialize({
            startOnLoad: false,
            theme: "dark",
            securityLevel: "strict",
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
          });

          const parseOk = await mermaid.parse(normalized, { suppressErrors: true });
          if (parseOk === false) {
            if (!cancelled) {
              setErr(
                "Mermaid couldn’t parse this diagram (invalid or still incomplete). Copy the source below and fix it at mermaid.live, or wait if the answer is still streaming."
              );
            }
            return;
          }

          renderSeq.current += 1;
          const { svg: out } = await mermaid.render(
            `mmd-${id}-${renderSeq.current}`,
            normalized
          );
          if (!cancelled) {
            setErr(null);
            setSvg(out);
          }
        } catch (e) {
          if (!cancelled) {
            const msg = e instanceof Error ? e.message : "Could not render diagram.";
            setErr(
              msg.includes("Syntax error") || msg.includes("syntax")
                ? `${msg} — check quoting on node labels and use flowchart TB/LR. Source is below.`
                : msg
            );
          }
        }
      })();
    }, MERMAID_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [code, id]);

  if (err) {
    const copySource = normalizeMermaidInput(code);
    return (
      <div className="space-y-2 p-4" data-clipboard-text={copySource}>
        <p className="text-sm text-amber-200/95">{err}</p>
        <pre className="m-0 overflow-x-auto rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 font-mono text-xs leading-relaxed text-amber-100/90">
          {copySource || code}
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div
        ref={hostRef}
        className="flex min-h-[120px] items-center justify-center bg-transparent p-6 text-sm text-[var(--muted)]"
        data-clipboard-text={normalizeMermaidInput(code) || code}
      >
        Rendering diagram…
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto bg-[#0a0d12] p-4 [&_svg]:max-w-full"
      data-clipboard-text={code}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

MermaidBlock.displayName = "MermaidBlock";

/** Shell around every `pre` from markdown: visually breaks out of the chat bubble. */
function CodeBlockShell({ children }: { children: ReactNode }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const arr = Children.toArray(children);
  const only = arr.length === 1 ? arr[0] : null;
  const isMermaid =
    isValidElement(only) &&
    typeof only.type === "function" &&
    (only.type as { displayName?: string }).displayName === "MermaidBlock";

  async function copyCode() {
    const root = shellRef.current;
    const marked = root?.querySelector("[data-clipboard-text]");
    const fromAttr = marked?.getAttribute("data-clipboard-text");
    const text =
      fromAttr !== null && fromAttr !== undefined && fromAttr !== ""
        ? fromAttr
        : getTextFromNode(children).replace(/\n$/, "");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      ref={shellRef}
      className="not-prose my-6 w-[calc(100%+2rem)] max-w-[calc(100%+2rem)] -mx-4 overflow-hidden rounded-xl border-2 border-[var(--accent)]/70 bg-[#05070c] shadow-[0_0_0_1px_rgba(91,141,239,0.25),0_16px_48px_-12px_rgba(0,0,0,0.9)] first:mt-0 last:mb-0"
      role="region"
      aria-label="Code sample"
    >
      <div
        className="pointer-events-none h-1 w-full bg-gradient-to-r from-[var(--accent)] via-[var(--accent)]/40 to-transparent"
        aria-hidden
      />
      <div className="flex items-center justify-end border-b border-[var(--accent)]/25 bg-[#070a10] px-2 py-1.5">
        <button
          type="button"
          onClick={() => void copyCode()}
          className="pointer-events-auto rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--muted)] hover:border-[var(--accent-dim)] hover:text-[var(--text)]"
          aria-label="Copy code to clipboard"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {isMermaid ? (
        <div className="border-t border-[var(--accent)]/25">{children}</div>
      ) : (
        <pre className="m-0 overflow-x-auto border-0 border-t border-[var(--accent)]/25 bg-transparent p-0">
          {children}
        </pre>
      )}
    </div>
  );
}

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown-body text-[var(--text)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            return <CodeBlockShell>{children}</CodeBlockShell>;
          },
          code({ className, children, node, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const lang = match?.[1];
            const text = String(children).replace(/\n$/, "");
            const hasLang = Boolean(className?.includes("language-"));
            const isBlock =
              isFencedCodeBlock(node) ||
              hasLang ||
              (text.includes("\n") && text.trim().length > 0);

            if (isBlock && lang === "mermaid") {
              return <MermaidBlock code={text} />;
            }

            if (isBlock) {
              return (
                <code
                  className={`block w-full whitespace-pre-wrap break-words bg-transparent p-4 font-mono text-[13px] leading-relaxed text-[#e6edf3] [tab-size:2] ${className ?? ""}`}
                  data-clipboard-text={text}
                  {...props}
                >
                  {children}
                </code>
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
    </div>
  );
}
