import {
  NodeViewContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { useState } from "react";
import { lowlight } from "../editor/extensions";

const LANGUAGE_NAMES: Record<string, string> = {
  bash: "Bash",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  css: "CSS",
  diff: "Diff",
  go: "Go",
  graphql: "GraphQL",
  ini: "INI",
  java: "Java",
  javascript: "JavaScript",
  json: "JSON",
  kotlin: "Kotlin",
  latex: "LaTeX",
  less: "Less",
  lua: "Lua",
  makefile: "Makefile",
  markdown: "Markdown",
  objectivec: "Objective-C",
  perl: "Perl",
  php: "PHP",
  "php-template": "PHP template",
  plaintext: "Plain text",
  python: "Python",
  "python-repl": "Python REPL",
  r: "R",
  ruby: "Ruby",
  rust: "Rust",
  scss: "SCSS",
  shell: "Shell",
  sql: "SQL",
  swift: "Swift",
  typescript: "TypeScript",
  vbnet: "VB.NET",
  wasm: "WebAssembly",
  xml: "HTML, XML",
  yaml: "YAML",
};

const LANGUAGES = lowlight
  .listLanguages()
  .map((id) => ({ id, name: LANGUAGE_NAMES[id] ?? id }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** A code block with its language and a Copy button above the code. */
export function CodeBlockView({ node, updateAttributes }: ReactNodeViewProps) {
  const [copied, setCopied] = useState(false);
  const raw = (node.attrs.language as string | null) ?? "";
  // A language from a file that the list doesn't know stays as written.
  const language = lowlight.registered(raw)
    ? (LANGUAGES.find((l) => l.id === raw)?.id ?? raw)
    : raw;
  const known = LANGUAGES.some((l) => l.id === language);

  const copy = () => {
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    };
    navigator.clipboard.writeText(node.textContent).then(done, () => {});
  };

  return (
    <NodeViewWrapper className="code-block">
      <div className="code-bar" contentEditable={false}>
        <select
          aria-label="Language"
          value={language}
          onChange={(event) =>
            updateAttributes({ language: event.target.value || null })
          }
        >
          <option value="">Plain text</option>
          {!known && language && <option value={language}>{language}</option>}
          {LANGUAGES.filter((l) => l.id !== "plaintext").map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre spellCheck={false}>
        <NodeViewContent<"code"> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
