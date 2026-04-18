import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  Heading1,
  Heading2,
  Minus,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minHeight?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  disabled = false,
  className,
  minHeight = "150px",
}: RichTextEditorProps) {
  const { t } = useTranslation();
  const ph = placeholder ?? t("editor.icerik-placeholder");
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: ph }),
    ],
    content: value ?? "",
    editable: !disabled,
    onUpdate: ({ editor: e }) => {
      onChange?.(e.getHTML());
    },
  });

  if (!editor) return null;

  const ToolBtn = ({
    aktif,
    onClick,
    children,
    title,
  }: {
    aktif?: boolean;
    onClick: () => void;
    children: React.ReactNode;
    title: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "p-1.5 rounded transition-colors",
        aktif
          ? "bg-birincil text-white"
          : "text-metin-ikinci hover:bg-yuzey-yukseltilmis hover:text-metin"
      )}
    >
      {children}
    </button>
  );

  const iconSize = "h-4 w-4";

  return (
    <div
      className={cn(
        "rounded-lg border border-kenarlik bg-yuzey overflow-hidden",
        "focus-within:ring-2 focus-within:ring-birincil/30 focus-within:border-birincil",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-kenarlik px-2 py-1.5 bg-yuzey-yukseltilmis">
        <ToolBtn
          aktif={editor.isActive("heading", { level: 1 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          title={t("editor.baslik-1")}
        >
          <Heading1 className={iconSize} />
        </ToolBtn>
        <ToolBtn
          aktif={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          title={t("editor.baslik-2")}
        >
          <Heading2 className={iconSize} />
        </ToolBtn>

        <div className="w-px h-5 bg-kenarlik mx-1" />

        <ToolBtn
          aktif={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title={t("editor.kalin")}
        >
          <Bold className={iconSize} />
        </ToolBtn>
        <ToolBtn
          aktif={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title={t("editor.italik")}
        >
          <Italic className={iconSize} />
        </ToolBtn>
        <ToolBtn
          aktif={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title={t("editor.alti-cizili")}
        >
          <UnderlineIcon className={iconSize} />
        </ToolBtn>
        <ToolBtn
          aktif={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title={t("editor.ustu-cizili")}
        >
          <Strikethrough className={iconSize} />
        </ToolBtn>

        <div className="w-px h-5 bg-kenarlik mx-1" />

        <ToolBtn
          aktif={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title={t("editor.madde-listesi")}
        >
          <List className={iconSize} />
        </ToolBtn>
        <ToolBtn
          aktif={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title={t("editor.numarali-liste")}
        >
          <ListOrdered className={iconSize} />
        </ToolBtn>

        <div className="w-px h-5 bg-kenarlik mx-1" />

        <ToolBtn
          aktif={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          title={t("editor.sola-hizala")}
        >
          <AlignLeft className={iconSize} />
        </ToolBtn>
        <ToolBtn
          aktif={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          title={t("editor.ortala")}
        >
          <AlignCenter className={iconSize} />
        </ToolBtn>
        <ToolBtn
          aktif={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          title={t("editor.saga-hizala")}
        >
          <AlignRight className={iconSize} />
        </ToolBtn>

        <div className="w-px h-5 bg-kenarlik mx-1" />

        <ToolBtn
          aktif={false}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title={t("editor.ayirici-cizgi")}
        >
          <Minus className={iconSize} />
        </ToolBtn>

        <div className="flex-1" />

        <ToolBtn
          aktif={false}
          onClick={() => editor.chain().focus().undo().run()}
          title={t("editor.geri-al")}
        >
          <Undo className={iconSize} />
        </ToolBtn>
        <ToolBtn
          aktif={false}
          onClick={() => editor.chain().focus().redo().run()}
          title={t("editor.ileri-al")}
        >
          <Redo className={iconSize} />
        </ToolBtn>
      </div>

      {/* Editor Content */}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none px-4 py-3 text-metin [&_.tiptap]:outline-none [&_.tiptap]:min-h-[var(--min-h)]"
        style={{ "--min-h": minHeight } as React.CSSProperties}
      />
    </div>
  );
}
