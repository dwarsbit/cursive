import type { AnyExtension, Node as TiptapNode } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { File, FileArchive, FileImage, FileSpreadsheet, FileText, ImageOff } from "lucide-react";
import { useState } from "react";
import { useFile, useWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/cn";
import { PageLinkView } from "./PageLinks";

/** The name of the file at the end of an address. */
export function fileName(href: string): string {
  const name = href.replace(/[?#].*$/, "").split("/").pop() ?? href;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/**
 * An image on a line of its own. Selected in a page you edit, it shows
 * the field for its description: what the image shows, for readers
 * who can't see it.
 */
export function ImageView({ node, selected, editor, updateAttributes }: ReactNodeViewProps) {
  const src = node.attrs.src as string;
  const alt = node.attrs.alt as string;
  const { url } = useFile(src);
  const [broken, setBroken] = useState<string | null>(null);
  const failed = url === null || (url !== undefined && broken === url);
  return (
    <NodeViewWrapper
      as="figure"
      className={cn("image-block", selected && "is-selected")}
    >
      {url === undefined ? (
        <div className="image-missing media-loading" aria-label="Loading the image">
          <FileImage aria-hidden />
        </div>
      ) : failed ? (
        <div className="image-missing">
          <ImageOff aria-hidden />
          <span>
            This image can't be shown: <code>{fileName(src) || src}</code> is not in the
            project.
          </span>
        </div>
      ) : (
        <img
          src={url}
          alt={alt}
          title={(node.attrs.title as string) || undefined}
          draggable={false}
          onError={() => setBroken(url)}
        />
      )}
      {editor.isEditable && selected && (
        <input
          className="image-alt"
          value={alt}
          aria-label="Image description"
          placeholder="A chart of the scores per week"
          onChange={(event) => updateAttributes({ alt: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") {
              event.preventDefault();
              editor.commands.focus();
            }
          }}
        />
      )}
    </NodeViewWrapper>
  );
}

/** An image in a line of text. */
export function InlineImageView({ node, selected }: ReactNodeViewProps) {
  const src = node.attrs.src as string;
  const { url } = useFile(src);
  return (
    <NodeViewWrapper as="span" className={cn("inline-image", selected && "is-selected")}>
      {url ? (
        <img src={url} alt={node.attrs.alt as string} draggable={false} />
      ) : (
        <span className="attachment attachment-missing">
          <ImageOff aria-hidden />
          {(node.attrs.alt as string) || fileName(src)}
        </span>
      )}
    </NodeViewWrapper>
  );
}

const ICONS: Array<[RegExp, typeof File]> = [
  [/\.(?:png|jpe?g|gif|webp|svg|avif|bmp|heic)$/i, FileImage],
  [/\.(?:csv|tsv|xlsx?|ods|numbers)$/i, FileSpreadsheet],
  [/\.(?:zip|gz|tgz|7z|rar)$/i, FileArchive],
  [/\.(?:pdf|docx?|odt|rtf|txt|pptx?|key|tex|bib)$/i, FileText],
];

/** A file in the text: its name, and a click opens it. */
export function AttachmentView({ node, selected }: ReactNodeViewProps) {
  const href = node.attrs.href as string;
  const name = (node.attrs.name as string) || fileName(href);
  const { path, url } = useFile(href);
  const { openFile } = useWorkspace();
  const missing = url === null;
  const Icon = ICONS.find(([test]) => test.test(fileName(href)))?.[1] ?? File;
  return (
    <NodeViewWrapper
      as="span"
      className={cn("attachment", missing && "attachment-missing", selected && "is-selected")}
      title={missing ? `${fileName(href)} is not in the project` : `Open ${fileName(href)}`}
      onClick={(event: React.MouseEvent) => {
        event.preventDefault();
        if (path && !missing) openFile(path);
      }}
    >
      <Icon aria-hidden />
      {name}
    </NodeViewWrapper>
  );
}

const VIEWS: Record<string, React.ComponentType<ReactNodeViewProps>> = {
  image: ImageView,
  inlineImage: InlineImageView,
  attachment: AttachmentView,
  pageLink: PageLinkView,
};

/** The document's images, files and page links, drawn from the project around the page. */
export const withPageViews = (extensions: AnyExtension[]): AnyExtension[] =>
  extensions.map((extension) => {
    const view = VIEWS[extension.name];
    if (!view || extension.type !== "node") return extension;
    return (extension as TiptapNode).extend({
      addNodeView() {
        return ReactNodeViewRenderer(view);
      },
    });
  });
