import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import turkeyLocations from "@/data/turkey-locations.json";

interface LocationData {
  id: number;
  bolge: string;
  il: string;
  ilce: string;
  plaka: number;
  nviid: number;
}

interface LocationSelectProps {
  il?: string;
  ilce?: string;
  bolge?: string;
  onIlChange?: (il: string, plaka?: number) => void;
  onIlceChange?: (ilce: string, nviid?: number) => void;
  onBolgeChange?: (bolge: string) => void;
  showBolge?: boolean;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

const locations = turkeyLocations as LocationData[];

const bolgeler = Array.from(new Set(locations.map((l) => l.bolge))).sort();
const iller = Array.from(new Set(locations.map((l) => l.il))).sort();

// Turkce karakter normalizasyonu
const normalizeForSearch = (str: string) => {
  return str
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/İ/g, "i")
    .replace(/Ğ/g, "g")
    .replace(/Ü/g, "u")
    .replace(/Ş/g, "s")
    .replace(/Ö/g, "o")
    .replace(/Ç/g, "c");
};

export function LocationSelect({
  il,
  ilce,
  bolge,
  onIlChange,
  onIlceChange,
  onBolgeChange,
  showBolge = false,
  disabled = false,
  required = false,
  className,
}: LocationSelectProps) {
  const [ilOpen, setIlOpen] = useState(false);
  const [ilceOpen, setIlceOpen] = useState(false);
  const [bolgeOpen, setBolgeOpen] = useState(false);
  const [ilSearch, setIlSearch] = useState("");
  const [ilceSearch, setIlceSearch] = useState("");

  const ilBtnRef = useRef<HTMLButtonElement>(null);
  const ilceBtnRef = useRef<HTMLButtonElement>(null);
  const bolgeBtnRef = useRef<HTMLButtonElement>(null);

  const getDropdownStyle = useCallback(
    (
      btnRef: React.RefObject<HTMLButtonElement | null>
    ): React.CSSProperties => {
      if (!btnRef.current) return {};
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownMaxH = 300;
      const openUpward = spaceBelow < dropdownMaxH && rect.top > spaceBelow;
      return {
        position: "fixed",
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
        ...(openUpward
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
      };
    },
    []
  );

  const ilceler = useMemo(() => {
    if (!il) return [];
    return locations
      .filter((l) => l.il === il)
      .map((l) => ({ ilce: l.ilce, nviid: l.nviid }))
      .sort((a, b) => a.ilce.localeCompare(b.ilce, "tr"));
  }, [il]);

  const filteredIller = useMemo(() => {
    if (!bolge) return iller;
    return Array.from(
      new Set(locations.filter((l) => l.bolge === bolge).map((l) => l.il))
    ).sort();
  }, [bolge]);

  const searchedIller = useMemo(() => {
    if (!ilSearch) return filteredIller;
    const n = normalizeForSearch(ilSearch);
    return filteredIller.filter((i) => normalizeForSearch(i).includes(n));
  }, [filteredIller, ilSearch]);

  const searchedIlceler = useMemo(() => {
    if (!ilceSearch) return ilceler;
    const n = normalizeForSearch(ilceSearch);
    return ilceler.filter((i) => normalizeForSearch(i.ilce).includes(n));
  }, [ilceler, ilceSearch]);

  const getPlaka = (ilName: string) => {
    const loc = locations.find((l) => l.il === ilName);
    return loc?.plaka;
  };

  // Il degisince gecersiz ilce'yi sifirla
  useEffect(() => {
    if (il && ilce) {
      const ilceExists = ilceler.some((i) => i.ilce === ilce);
      if (!ilceExists && onIlceChange) {
        onIlceChange("");
      }
    }
  }, [il, ilce, ilceler, onIlceChange]);

  const btnClass = cn(
    "w-full h-10 px-3 rounded-lg border border-kenarlik bg-yuzey text-sm text-left flex items-center justify-between",
    "focus:outline-none focus:ring-2 focus:ring-birincil/30 focus:border-birincil",
    "disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
  );

  const dropdownClass =
    "bg-yuzey border border-kenarlik rounded-lg shadow-xl";

  const itemClass = (aktif: boolean) =>
    cn(
      "px-3 py-2 cursor-pointer flex items-center gap-2 transition-colors",
      aktif
        ? "bg-birincil-zemin text-birincil"
        : "hover:bg-yuzey-yukseltilmis text-metin"
    );

  return (
    <div className={cn("flex flex-col sm:flex-row gap-3", className)}>
      {/* Bolge */}
      {showBolge && (
        <div className="flex-1 relative">
          <label className="text-sm font-medium text-metin mb-1.5 block">
            Bolge
          </label>
          <button
            ref={bolgeBtnRef}
            type="button"
            onClick={() => !disabled && setBolgeOpen(!bolgeOpen)}
            disabled={disabled}
            className={cn(btnClass, bolgeOpen && "ring-2 ring-birincil/30 border-birincil")}
          >
            <span className={bolge ? "text-metin" : "text-metin-pasif"}>
              {bolge || "Bolge secin"}
            </span>
            <ChevronsUpDown className="h-4 w-4 text-metin-pasif" />
          </button>

          {bolgeOpen &&
            createPortal(
              <div
                style={getDropdownStyle(bolgeBtnRef)}
                className={cn(dropdownClass, "max-h-60 overflow-auto")}
              >
                <div
                  className={itemClass(!bolge)}
                  onClick={() => {
                    onBolgeChange?.("");
                    setBolgeOpen(false);
                  }}
                >
                  <span className="text-sm">Tum Bolgeler</span>
                </div>
                {bolgeler.map((b) => (
                  <div
                    key={b}
                    className={itemClass(b === bolge)}
                    onClick={() => {
                      onBolgeChange?.(b);
                      setBolgeOpen(false);
                    }}
                  >
                    {b === bolge && (
                      <Check className="h-4 w-4 text-birincil" />
                    )}
                    <span className="text-sm">{b}</span>
                  </div>
                ))}
              </div>,
              document.body
            )}
        </div>
      )}

      {/* Il */}
      <div className="flex-1 relative">
        <label className="text-sm font-medium text-metin mb-1.5 block">
          Il {required && <span className="text-tehlike">*</span>}
        </label>
        <button
          ref={ilBtnRef}
          type="button"
          onClick={() => !disabled && setIlOpen(!ilOpen)}
          disabled={disabled}
          className={cn(btnClass, ilOpen && "ring-2 ring-birincil/30 border-birincil")}
        >
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="h-4 w-4 text-metin-pasif shrink-0" />
            <span className={cn("truncate", il ? "text-metin" : "text-metin-pasif")}>
              {il || "Il secin"}
            </span>
            {il && (
              <span className="text-xs text-metin-pasif shrink-0">
                ({getPlaka(il)})
              </span>
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 text-metin-pasif shrink-0" />
        </button>

        {ilOpen &&
          createPortal(
            <div style={getDropdownStyle(ilBtnRef)} className={dropdownClass}>
              <div className="p-2 border-b border-kenarlik">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-metin-pasif" />
                  <input
                    type="text"
                    placeholder="Il ara..."
                    value={ilSearch}
                    onChange={(e) => setIlSearch(e.target.value)}
                    className="w-full h-9 pl-9 pr-3 rounded-md border border-kenarlik bg-yuzey text-sm text-metin placeholder:text-metin-pasif focus:outline-none focus:ring-1 focus:ring-birincil"
                    autoFocus
                  />
                </div>
              </div>
              <div className="max-h-60 overflow-auto">
                {searchedIller.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-metin-pasif">
                    Sonuc bulunamadi
                  </div>
                ) : (
                  searchedIller.map((ilName) => (
                    <div
                      key={ilName}
                      className={cn(itemClass(ilName === il), "justify-between")}
                      onClick={() => {
                        onIlChange?.(ilName, getPlaka(ilName));
                        setIlOpen(false);
                        setIlSearch("");
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {ilName === il && (
                          <Check className="h-4 w-4 text-birincil" />
                        )}
                        <span className="text-sm">{ilName}</span>
                      </div>
                      <span className="text-xs text-metin-pasif">
                        {getPlaka(ilName)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>,
            document.body
          )}
      </div>

      {/* Ilce */}
      <div className="flex-1 relative">
        <label className="text-sm font-medium text-metin mb-1.5 block">
          Ilce {required && <span className="text-tehlike">*</span>}
        </label>
        <button
          ref={ilceBtnRef}
          type="button"
          onClick={() => il && !disabled && setIlceOpen(!ilceOpen)}
          disabled={disabled || !il}
          className={cn(btnClass, ilceOpen && "ring-2 ring-birincil/30 border-birincil")}
        >
          <span
            className={cn(
              "truncate",
              ilce ? "text-metin" : "text-metin-pasif"
            )}
          >
            {ilce || (il ? "Ilce secin" : "Once il secin")}
          </span>
          <ChevronsUpDown className="h-4 w-4 text-metin-pasif shrink-0" />
        </button>

        {ilceOpen &&
          createPortal(
            <div
              style={getDropdownStyle(ilceBtnRef)}
              className={dropdownClass}
            >
              <div className="p-2 border-b border-kenarlik">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-metin-pasif" />
                  <input
                    type="text"
                    placeholder="Ilce ara..."
                    value={ilceSearch}
                    onChange={(e) => setIlceSearch(e.target.value)}
                    className="w-full h-9 pl-9 pr-3 rounded-md border border-kenarlik bg-yuzey text-sm text-metin placeholder:text-metin-pasif focus:outline-none focus:ring-1 focus:ring-birincil"
                    autoFocus
                  />
                </div>
              </div>
              <div className="max-h-60 overflow-auto">
                {searchedIlceler.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-metin-pasif">
                    Sonuc bulunamadi
                  </div>
                ) : (
                  searchedIlceler.map((item) => (
                    <div
                      key={item.ilce}
                      className={itemClass(item.ilce === ilce)}
                      onClick={() => {
                        onIlceChange?.(item.ilce, item.nviid);
                        setIlceOpen(false);
                        setIlceSearch("");
                      }}
                    >
                      {item.ilce === ilce && (
                        <Check className="h-4 w-4 text-birincil" />
                      )}
                      <span className="text-sm">{item.ilce}</span>
                    </div>
                  ))
                )}
              </div>
            </div>,
            document.body
          )}
      </div>

      {/* Click outside handler */}
      {(ilOpen || ilceOpen || bolgeOpen) &&
        createPortal(
          <div
            className="fixed inset-0"
            style={{ zIndex: 9998 }}
            onClick={() => {
              setIlOpen(false);
              setIlceOpen(false);
              setBolgeOpen(false);
              setIlSearch("");
              setIlceSearch("");
            }}
          />,
          document.body
        )}
    </div>
  );
}

// Yardimci fonksiyonlar
export function getIlPlaka(il: string): number | undefined {
  const loc = locations.find((l) => l.il === il);
  return loc?.plaka;
}

export function getIlceler(il: string): string[] {
  return locations
    .filter((l) => l.il === il)
    .map((l) => l.ilce)
    .sort((a, b) => a.localeCompare(b, "tr"));
}

export function getBolgeIller(bolge: string): string[] {
  return Array.from(
    new Set(locations.filter((l) => l.bolge === bolge).map((l) => l.il))
  ).sort();
}

export { iller as TURKEY_ILLER, bolgeler as TURKEY_BOLGELER };
