/**
 * FormAlani — Reusable form alanı (label + input + error + yardım).
 *
 * Inline validation feedback için kullanılır. Toast yerine input altında
 * kırmızı mesaj gösterir. Tooltip ile yardım metni eklenebilir.
 *
 * Tipler:
 *   - <FormAlani.Metin />  → text input
 *   - <FormAlani.Sayi />   → number input
 *   - <FormAlani.Sifre />  → password input
 *   - <FormAlani.Eposta /> → email input
 *   - <FormAlani.Secim />  → select
 *   - <FormAlani.Onay />   → checkbox
 *   - <FormAlani.UzunMetin /> → textarea
 *
 * Kullanım:
 *   <FormAlani.Metin
 *     etiket="Cari Adı"
 *     deger={form.ad}
 *     onChange={(v) => setForm({...form, ad: v})}
 *     zorunlu
 *     hata={hatalar.ad}
 *     yardim="Ürün/firma resmi adı"
 *   />
 */
import { ChevronDown, HelpCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface OrtakProp {
  etiket: string;
  zorunlu?: boolean;
  hata?: string;
  yardim?: string;
  className?: string;
  disabled?: boolean;
}

// ───────────────── Yardımcı ─────────────────

function Etiket({ etiket, zorunlu, yardim }: { etiket: string; zorunlu?: boolean; yardim?: string }) {
  return (
    <label className="flex items-center gap-1.5 text-sm font-medium text-metin">
      <span>{etiket}</span>
      {zorunlu && <span className="text-[color:var(--renk-tehlike)]" aria-label="zorunlu">*</span>}
      {yardim && (
        <span title={yardim} className="cursor-help text-metin-pasif">
          <HelpCircle className="h-3.5 w-3.5" />
        </span>
      )}
    </label>
  );
}

function HataMetni({ hata }: { hata?: string }) {
  if (!hata) return null;
  return (
    <p className="mt-1 text-xs text-[color:var(--renk-tehlike)]" role="alert">
      {hata}
    </p>
  );
}

// ───────────────── Metin ─────────────────

interface MetinProp extends OrtakProp {
  deger: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "url";
  maxLength?: number;
  readOnly?: boolean;
}

function Metin({ etiket, zorunlu, hata, yardim, className, disabled, deger, onChange, placeholder, type = "text", maxLength, readOnly }: MetinProp) {
  return (
    <div className={className}>
      <Etiket etiket={etiket} zorunlu={zorunlu} yardim={yardim} />
      <Input
        type={type}
        value={deger}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={!!hata}
        aria-describedby={hata ? `${etiket}-hata` : undefined}
        className={cn(
          "mt-1",
          readOnly && "bg-yuzey cursor-not-allowed",
          hata && "border-[color:var(--renk-tehlike)] focus:ring-[color:var(--renk-tehlike)]/30",
        )}
      />
      <HataMetni hata={hata} />
    </div>
  );
}

// ───────────────── Sayı ─────────────────

interface SayiProp extends OrtakProp {
  deger: string;
  onChange: (v: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}

function Sayi({ etiket, zorunlu, hata, yardim, className, disabled, deger, onChange, placeholder, min, max, step }: SayiProp) {
  return (
    <div className={className}>
      <Etiket etiket={etiket} zorunlu={zorunlu} yardim={yardim} />
      <Input
        type="number"
        value={deger}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-invalid={!!hata}
        className={cn("mt-1", hata && "border-[color:var(--renk-tehlike)] focus:ring-[color:var(--renk-tehlike)]/30")}
      />
      <HataMetni hata={hata} />
    </div>
  );
}

// ───────────────── Şifre ─────────────────

interface SifreProp extends OrtakProp {
  deger: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}

function Sifre({ etiket, zorunlu, hata, yardim, className, disabled, deger, onChange, placeholder, autoComplete }: SifreProp) {
  return (
    <div className={className}>
      <Etiket etiket={etiket} zorunlu={zorunlu} yardim={yardim} />
      <Input
        type="password"
        value={deger}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={!!hata}
        className={cn("mt-1", hata && "border-[color:var(--renk-tehlike)] focus:ring-[color:var(--renk-tehlike)]/30")}
      />
      <HataMetni hata={hata} />
    </div>
  );
}

// ───────────────── E-posta ─────────────────

function Eposta(props: Omit<MetinProp, "type">) {
  return <Metin {...props} type="email" />;
}

// ───────────────── Seçim (select) ─────────────────

interface SecimSecenek {
  deger: string;
  etiket: string;
}

interface SecimProp extends OrtakProp {
  deger: string;
  onChange: (v: string) => void;
  secenekler: SecimSecenek[];
  placeholder?: string;
}

function Secim({ etiket, zorunlu, hata, yardim, className, disabled, deger, onChange, secenekler, placeholder }: SecimProp) {
  return (
    <div className={className}>
      <Etiket etiket={etiket} zorunlu={zorunlu} yardim={yardim} />
      <div className="relative mt-1">
        <select
          value={deger}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-invalid={!!hata}
          className={cn(
            "w-full appearance-none rounded-md border border-kenarlik bg-arkaplan px-3 py-2 pr-8 text-sm text-metin",
            "focus:outline-none focus:ring-2 focus:ring-birincil/30 focus:border-birincil",
            hata && "border-[color:var(--renk-tehlike)] focus:ring-[color:var(--renk-tehlike)]/30",
            disabled && "opacity-60 cursor-not-allowed",
          )}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {secenekler.map((s) => (
            <option key={s.deger} value={s.deger}>
              {s.etiket}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-metin-pasif" />
      </div>
      <HataMetni hata={hata} />
    </div>
  );
}

// ───────────────── Onay (checkbox) ─────────────────

interface OnayProp extends OrtakProp {
  deger: boolean;
  onChange: (v: boolean) => void;
  aciklama?: string;
}

function Onay({ etiket, hata, className, disabled, deger, onChange, aciklama }: OnayProp) {
  return (
    <div className={className}>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={deger}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="mt-0.5 h-4 w-4 rounded border-kenarlik text-birincil focus:ring-birincil/30"
        />
        <div>
          <div className="text-sm text-metin">{etiket}</div>
          {aciklama && <div className="text-xs text-metin-pasif mt-0.5">{aciklama}</div>}
        </div>
      </label>
      <HataMetni hata={hata} />
    </div>
  );
}

// ───────────────── Uzun Metin (textarea) ─────────────────

interface UzunMetinProp extends OrtakProp {
  deger: string;
  onChange: (v: string) => void;
  placeholder?: string;
  satir?: number;
  maxLength?: number;
}

function UzunMetin({ etiket, zorunlu, hata, yardim, className, disabled, deger, onChange, placeholder, satir = 3, maxLength }: UzunMetinProp) {
  return (
    <div className={className}>
      <Etiket etiket={etiket} zorunlu={zorunlu} yardim={yardim} />
      <textarea
        value={deger}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={satir}
        maxLength={maxLength}
        disabled={disabled}
        aria-invalid={!!hata}
        className={cn(
          "mt-1 w-full rounded-md border border-kenarlik bg-arkaplan px-3 py-2 text-sm text-metin",
          "focus:outline-none focus:ring-2 focus:ring-birincil/30 focus:border-birincil",
          hata && "border-[color:var(--renk-tehlike)] focus:ring-[color:var(--renk-tehlike)]/30",
          disabled && "opacity-60 cursor-not-allowed",
        )}
      />
      <HataMetni hata={hata} />
    </div>
  );
}

// ───────────────── Bölüm (section) ─────────────────

interface BolumProp {
  baslik: string;
  altyazi?: string;
  children: React.ReactNode;
  className?: string;
}

function Bolum({ baslik, altyazi, children, className }: BolumProp) {
  return (
    <div className={cn("space-y-3", className)}>
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-metin-ikinci">
          {baslik}
        </h3>
        {altyazi && <p className="text-xs text-metin-pasif mt-0.5">{altyazi}</p>}
      </div>
      {children}
    </div>
  );
}

// ───────────────── Export Composite ─────────────────

export const FormAlani = {
  Metin,
  Sayi,
  Sifre,
  Eposta,
  Secim,
  Onay,
  UzunMetin,
  Bolum,
};
