import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-[15px] leading-relaxed text-foreground/90">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h2 className="mt-8 mb-3 font-serif text-2xl text-foreground first:mt-0" {...p} />,
          h2: (p) => <h2 className="mt-8 mb-3 font-serif text-2xl text-foreground first:mt-0" {...p} />,
          h3: (p) => <h3 className="mt-6 mb-2 font-semibold text-foreground" {...p} />,
          p: (p) => <p className="my-3" {...p} />,
          ul: (p) => <ul className="my-3 list-disc space-y-1.5 pl-5 marker:text-muted-foreground/60" {...p} />,
          ol: (p) => <ol className="my-3 list-decimal space-y-1.5 pl-5 marker:text-muted-foreground" {...p} />,
          strong: (p) => <strong className="font-semibold text-foreground" {...p} />,
          a: (p) => (
            <a
              className="text-foreground underline decoration-muted-foreground/40 underline-offset-3 hover:decoration-foreground"
              target="_blank"
              rel="noreferrer"
              {...p}
            />
          ),
          blockquote: (p) => <blockquote className="my-3 border-l-2 pl-4 text-muted-foreground" {...p} />,
          code: (p) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[13px]" {...p} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
