import { useState, useRef } from "react";
import { Upload, X, Loader2, Image as ImageIcon } from "lucide-react";
import { apiIstemci } from "@/lib/api-client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  endpoint: string; // '/upload/logo', '/upload/imza' vb.
  label?: string;
  placeholder?: string;
  maxWidth?: number;
  maxHeight?: number;
  className?: string;
  disabled?: boolean;
}

export function ImageUpload({
  value,
  onChange,
  endpoint,
  label,
  placeholder = "Resim yukleyin veya URL girin",
  maxWidth,
  maxHeight,
  className,
  disabled = false,
}: ImageUploadProps) {
  const [yukleniyor, setYukleniyor] = useState(false);
  const [urlModu, setUrlModu] = useState(false);
  const [urlGirdi, setUrlGirdi] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  const dosyaSec = () => {
    if (disabled || yukleniyor) return;
    inputRef.current?.click();
  };

  const dosyaYukle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const dosya = e.target.files?.[0];
    if (!dosya) return;

    // Client-side kontrol
    if (!dosya.type.startsWith("image/")) {
      toast.hata("Sadece resim dosyalari yuklenebilir");
      return;
    }
    if (dosya.size > 5 * 1024 * 1024) {
      toast.hata("Maksimum dosya boyutu: 5MB");
      return;
    }

    setYukleniyor(true);
    try {
      const formData = new FormData();
      formData.append("file", dosya);
      const res = await apiIstemci.post<{ url: string; genislik: number; yukseklik: number }>(
        endpoint,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      onChange(res.data.url);
      toast.basarili("Resim yuklendi");
    } catch (err: any) {
      const mesaj = err?.response?.data?.hata?.mesaj ?? "Yukleme basarisiz";
      toast.hata(mesaj);
    }
    setYukleniyor(false);
    // Input'u resetle (ayni dosya tekrar secilince tetiklenmesi icin)
    if (inputRef.current) inputRef.current.value = "";
  };

  const sil = () => {
    onChange(null);
    setUrlGirdi("");
  };

  const urlKaydet = () => {
    onChange(urlGirdi || null);
    setUrlModu(false);
  };

  // Vite proxy /uploads/ -> API'ye yonlendirir, relative URL yeterli
  const previewUrl = value;

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className="text-sm font-medium text-metin block">{label}</label>
      )}

      {/* Onizleme + aksiyonlar */}
      {value ? (
        <div className="relative group inline-block">
          <img
            src={previewUrl!}
            alt={label ?? "Yuklenen resim"}
            className="rounded-lg border border-kenarlik object-contain bg-yuzey-yukseltilmis"
            style={{
              maxWidth: maxWidth ?? 200,
              maxHeight: maxHeight ?? 120,
            }}
          />
          <div className="absolute inset-0 bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={dosyaSec}
              disabled={disabled}
              className="p-2 bg-white/90 rounded-lg hover:bg-white transition-colors"
              title="Degistir"
            >
              <Upload className="h-4 w-4 text-metin" />
            </button>
            <button
              type="button"
              onClick={sil}
              disabled={disabled}
              className="p-2 bg-white/90 rounded-lg hover:bg-white transition-colors"
              title="Kaldir"
            >
              <X className="h-4 w-4 text-tehlike" />
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={dosyaSec}
          className={cn(
            "border-2 border-dashed border-kenarlik rounded-lg p-6 text-center cursor-pointer transition-colors",
            "hover:border-birincil/50 hover:bg-birincil-zemin/30",
            disabled && "opacity-50 cursor-not-allowed",
            yukleniyor && "pointer-events-none"
          )}
        >
          {yukleniyor ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-birincil" />
              <p className="text-sm text-metin-ikinci">Yukleniyor...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <ImageIcon className="h-8 w-8 text-metin-pasif" />
              <p className="text-sm text-metin-ikinci">{placeholder}</p>
              <p className="text-xs text-metin-pasif">JPG, PNG, GIF, WebP — Max 5MB</p>
            </div>
          )}
        </div>
      )}

      {/* Gizli file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={dosyaYukle}
        disabled={disabled}
      />

      {/* URL modu toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setUrlModu(!urlModu)}
          className="text-xs text-metin-pasif hover:text-birincil transition-colors"
        >
          {urlModu ? "Kapat" : "URL ile ekle"}
        </button>
        {urlModu && (
          <div className="flex flex-1 gap-2">
            <input
              type="url"
              value={urlGirdi}
              onChange={(e) => setUrlGirdi(e.target.value)}
              placeholder="https://..."
              className="flex-1 h-8 px-2 rounded border border-kenarlik bg-yuzey text-xs text-metin focus:outline-none focus:ring-1 focus:ring-birincil"
            />
            <button
              type="button"
              onClick={urlKaydet}
              className="h-8 px-3 rounded bg-birincil text-white text-xs hover:bg-birincil/90 transition-colors"
            >
              Kaydet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
