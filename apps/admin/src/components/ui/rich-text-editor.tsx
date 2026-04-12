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
  placeholder = "Icerik yazin...",
  disabled = false,
  className,
  minHeight = "150px",
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder }),
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
          title="Baslik 1"
        >
          <Heading1 className={iconSize} />
        </ToolBtn>
        <ToolBtn
          aktif={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          title="Baslik 2"
        >
          <Heading2 className={iconSize} />
        </ToolBtn>

        <div className="w-px h-5 bg-kenarlik mx-1" />

        <ToolBtn
          aktif={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Kalin"
        >
          <Bold className={iconSize} />
        </ToolBtn>
        <ToolBtn
          aktif={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italik"
        >
          <Italic className={iconSize} />
        </ToolBtn>
        <ToolBtn
          aktif={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Alti cizili"
        >
          <UnderlineIcon className={iconSize} />
        </ToolBtn>
        <ToolBtn
          aktif={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Ustu cizili"
        >
          <Strikethrough className={iconSize} />
        </ToolBtn>

        <div className="w-px h-5 bg-kenarlik mx-1" />

        <ToolBtn
          aktif={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Madde listesi"
        >
          <List className={iconSize} />
        </ToolBtn>
        <ToolBtn
          aktif={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numarali liste"
        >
          <ListOrdered className={iconSize} />
        </ToolBtn>

        <div className="w-px h-5 bg-kenarlik mx-1" />

        <ToolBtn
          aktif={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          title="Sola hizala"
        >
          <AlignLeft className={iconSize} />
        </ToolBtn>
        <ToolBtn
          aktif={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          title="Ortala"
        >
          <AlignCenter className={iconSize} />
        </ToolBtn>
        <ToolBtn
          aktif={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          title="Saga hizala"
        >
          <AlignRight className={iconSize} />
        </ToolBtn>

        <div className="w-px h-5 bg-kenarlik mx-1" />

        <ToolBtn
          aktif={false}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Ayirici cizgi"
        >
          <Minus className={iconSize} />
        </ToolBtn>

        <div className="flex-1" />

        <ToolBtn
          aktif={false}
          onClick={() => editor.chain().focus().undo().run()}
          title="Geri al"
        >
          <Undo className={iconSize} />
        </ToolBtn>
        <ToolBtn
          aktif={false}
          onClick={() => editor.chain().focus().redo().run()}
          title="Ileri al"
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
