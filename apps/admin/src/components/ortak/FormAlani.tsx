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
    <label className="flex items-center gap-1.5 text-[15px] sm:text-sm font-medium text-metin mb-1.5">
      <span>{etiket}</span>
      {zorunlu && <span className="text-[color:var(--renk-tehlike)]" aria-label="zorunlu">*</span>}
      {yardim && (
        <span title={yardim} className="cursor-help text-metin-pasif">
          <HelpCircle className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
        </span>
      )}
    </label>
  );
}

function HataMetni({ hata }: { hata?: string }) {
  if (!hata) return null;
  return (
    <p className="mt-1.5 text-sm sm:text-xs text-[color:var(--renk-tehlike)]" role="alert">
      {hata}
    </p>
  );
}

// Ortak input/select/textarea className'i (mobile-first: iOS zoom icin 16px, 44px touch)
const MOBILE_INPUT = "text-base sm:text-sm min-h-[44px] sm:min-h-[36px] px-3.5 sm:px-3 py-2.5 sm:py-2";

// ───────────────── Metin ─────────────────

interface MetinProp extends OrtakProp {
  deger: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "url" | "date";
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
          MOBILE_INPUT,
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
        inputMode="decimal"
        value={deger}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-invalid={!!hata}
        className={cn(MOBILE_INPUT, hata && "border-[color:var(--renk-tehlike)] focus:ring-[color:var(--renk-tehlike)]/30")}
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
        className={cn(MOBILE_INPUT, hata && "border-[color:var(--renk-tehlike)] focus:ring-[color:var(--renk-tehlike)]/30")}
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
      <div className="relative">
        <select
          value={deger}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-invalid={!!hata}
          className={cn(
            "w-full appearance-none rounded-md border border-kenarlik bg-arkaplan text-metin pr-10 sm:pr-8",
            MOBILE_INPUT,
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
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 sm:h-4 sm:w-4 -translate-y-1/2 text-metin-pasif" />
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
      <label className="flex items-start gap-3 cursor-pointer py-1.5 sm:py-0.5 -mx-1 sm:mx-0 px-1 sm:px-0 rounded hover:bg-yuzey/50 sm:hover:bg-transparent transition-colors">
        <input
          type="checkbox"
          checked={deger}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="mt-1 sm:mt-0.5 h-5 w-5 sm:h-4 sm:w-4 rounded border-kenarlik text-birincil focus:ring-birincil/30 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] sm:text-sm text-metin leading-snug">{etiket}</div>
          {aciklama && <div className="text-sm sm:text-xs text-metin-pasif mt-0.5 leading-snug">{aciklama}</div>}
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
          "w-full rounded-md border border-kenarlik bg-arkaplan text-metin",
          "px-3.5 sm:px-3 py-2.5 sm:py-2 text-base sm:text-sm",
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
    <div className={cn("space-y-4 sm:space-y-3", className)}>
      <div>
        <h3 className="text-[15px] sm:text-sm font-semibold uppercase tracking-wider text-metin-ikinci">
          {baslik}
        </h3>
        {altyazi && <p className="text-sm sm:text-xs text-metin-pasif mt-1 sm:mt-0.5 leading-snug">{altyazi}</p>}
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
