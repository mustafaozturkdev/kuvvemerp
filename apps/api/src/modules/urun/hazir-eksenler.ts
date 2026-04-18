/**
 * Hazır Varyant Eksen Kütüphanesi
 *
 * Kullanıcının manuel eksen/seçenek yazmasına gerek kalmadan, tek tıkla
 * kullanabileceği standart eksenler + seçenekler. Trendyol/PHP parity.
 *
 * Frontend'e GET /api/v1/urun-hazir-eksenler ile sunulur.
 * Kullanıcı seçtiği eksen + seçenekleri tek istekle ekler.
 */

export interface HazirSecenek {
  kod: string;
  ad: string;
  hexRenk?: string | null;
}

export interface HazirEksen {
  kod: string;
  ad: string;
  ikon: string;        // Lucide ikon ad — frontend render eder
  aciklama: string;    // kisa tanitim
  secenekler: HazirSecenek[];
}

// ─────────────────────────────────────────────────────────────
// RENK (Türkiye'de yaygın kullanılan 24 renk + hex)
// ─────────────────────────────────────────────────────────────
const HAZIR_RENKLER: HazirSecenek[] = [
  { kod: 'siyah',      ad: 'Siyah',      hexRenk: '#000000' },
  { kod: 'beyaz',      ad: 'Beyaz',      hexRenk: '#FFFFFF' },
  { kod: 'kirmizi',    ad: 'Kırmızı',    hexRenk: '#EF4444' },
  { kod: 'mavi',       ad: 'Mavi',       hexRenk: '#3B82F6' },
  { kod: 'lacivert',   ad: 'Lacivert',   hexRenk: '#1E3A8A' },
  { kod: 'yesil',      ad: 'Yeşil',      hexRenk: '#22C55E' },
  { kod: 'sari',       ad: 'Sarı',       hexRenk: '#EAB308' },
  { kod: 'turuncu',    ad: 'Turuncu',    hexRenk: '#F97316' },
  { kod: 'pembe',      ad: 'Pembe',      hexRenk: '#EC4899' },
  { kod: 'mor',        ad: 'Mor',        hexRenk: '#A855F7' },
  { kod: 'gri',        ad: 'Gri',        hexRenk: '#6B7280' },
  { kod: 'kahverengi', ad: 'Kahverengi', hexRenk: '#78350F' },
  { kod: 'bej',        ad: 'Bej',        hexRenk: '#D4B896' },
  { kod: 'bordo',      ad: 'Bordo',      hexRenk: '#7F1D1D' },
  { kod: 'turkuaz',    ad: 'Turkuaz',    hexRenk: '#06B6D4' },
  { kod: 'haki',       ad: 'Haki',       hexRenk: '#4D7C0F' },
  { kod: 'fistik',     ad: 'Fıstık',     hexRenk: '#A3E635' },
  { kod: 'altin',      ad: 'Altın',      hexRenk: '#D4AF37' },
  { kod: 'gumus',      ad: 'Gümüş',      hexRenk: '#C0C0C0' },
  { kod: 'krem',       ad: 'Krem',       hexRenk: '#FEF3C7' },
  { kod: 'somon',      ad: 'Somon',      hexRenk: '#FCA5A5' },
  { kod: 'indigo',     ad: 'İndigo',     hexRenk: '#4F46E5' },
  { kod: 'antrasit',   ad: 'Antrasit',   hexRenk: '#374151' },
  { kod: 'fume',       ad: 'Füme',       hexRenk: '#4B5563' },
];

// ─────────────────────────────────────────────────────────────
// BEDEN (Harf bedenler — giyim)
// ─────────────────────────────────────────────────────────────
const HAZIR_BEDENLER: HazirSecenek[] = [
  { kod: 'xxs', ad: 'XXS' },
  { kod: 'xs',  ad: 'XS'  },
  { kod: 's',   ad: 'S'   },
  { kod: 'm',   ad: 'M'   },
  { kod: 'l',   ad: 'L'   },
  { kod: 'xl',  ad: 'XL'  },
  { kod: 'xxl', ad: 'XXL' },
  { kod: '3xl', ad: '3XL' },
  { kod: '4xl', ad: '4XL' },
  { kod: '5xl', ad: '5XL' },
];

// ─────────────────────────────────────────────────────────────
// AYAKKABI NUMARASI (TR 35-46 + bazı kadın yarım numaraları)
// ─────────────────────────────────────────────────────────────
const HAZIR_AYAKKABI_NUMARALARI: HazirSecenek[] = [
  { kod: '34', ad: '34' }, { kod: '35', ad: '35' }, { kod: '36', ad: '36' },
  { kod: '37', ad: '37' }, { kod: '38', ad: '38' }, { kod: '39', ad: '39' },
  { kod: '40', ad: '40' }, { kod: '41', ad: '41' }, { kod: '42', ad: '42' },
  { kod: '43', ad: '43' }, { kod: '44', ad: '44' }, { kod: '45', ad: '45' },
  { kod: '46', ad: '46' }, { kod: '47', ad: '47' }, { kod: '48', ad: '48' },
];

// ─────────────────────────────────────────────────────────────
// CİNSİYET / YAŞ GRUBU
// ─────────────────────────────────────────────────────────────
const HAZIR_CINSIYETLER: HazirSecenek[] = [
  { kod: 'kadin',         ad: 'Kadın'         },
  { kod: 'erkek',         ad: 'Erkek'         },
  { kod: 'unisex',        ad: 'Unisex'        },
  { kod: 'kiz-cocuk',     ad: 'Kız Çocuk'     },
  { kod: 'erkek-cocuk',   ad: 'Erkek Çocuk'   },
  { kod: 'bebek',         ad: 'Bebek'         },
];

// ─────────────────────────────────────────────────────────────
// BOYUT (Genel boyut — ev eşyası, kutu vb.)
// ─────────────────────────────────────────────────────────────
const HAZIR_BOYUTLAR: HazirSecenek[] = [
  { kod: 'mini',   ad: 'Mini'   },
  { kod: 'kucuk',  ad: 'Küçük'  },
  { kod: 'orta',   ad: 'Orta'   },
  { kod: 'buyuk',  ad: 'Büyük'  },
  { kod: 'xl',     ad: 'X-Büyük' },
];

// ─────────────────────────────────────────────────────────────
// KALIP (Giyim kalıbı)
// ─────────────────────────────────────────────────────────────
const HAZIR_KALIPLAR: HazirSecenek[] = [
  { kod: 'slim',     ad: 'Slim Fit'    },
  { kod: 'regular',  ad: 'Regular Fit' },
  { kod: 'loose',    ad: 'Bol Kesim'   },
  { kod: 'oversize', ad: 'Oversize'    },
  { kod: 'skinny',   ad: 'Skinny'      },
];

// ─────────────────────────────────────────────────────────────
// MALZEME / KUMAŞ
// ─────────────────────────────────────────────────────────────
const HAZIR_MALZEMELER: HazirSecenek[] = [
  { kod: 'pamuk',     ad: 'Pamuk'     },
  { kod: 'polyester', ad: 'Polyester' },
  { kod: 'yun',       ad: 'Yün'       },
  { kod: 'keten',     ad: 'Keten'     },
  { kod: 'ipek',      ad: 'İpek'      },
  { kod: 'deri',      ad: 'Deri'      },
  { kod: 'suni-deri', ad: 'Suni Deri' },
  { kod: 'kot',       ad: 'Kot/Denim' },
  { kod: 'kadife',    ad: 'Kadife'    },
  { kod: 'orme',      ad: 'Örme'      },
  { kod: 'dokuma',    ad: 'Dokuma'    },
  { kod: 'naylon',    ad: 'Naylon'    },
];

// ─────────────────────────────────────────────────────────────
// Ana katalog
// ─────────────────────────────────────────────────────────────
export const HAZIR_EKSENLER: HazirEksen[] = [
  {
    kod: 'renk',
    ad: 'Renk',
    ikon: 'Palette',
    aciklama: 'Ürünün rengi (24 yaygın renk, hex kodlu)',
    secenekler: HAZIR_RENKLER,
  },
  {
    kod: 'beden',
    ad: 'Beden',
    ikon: 'Shirt',
    aciklama: 'Giyim ölçüsü (XXS - 5XL)',
    secenekler: HAZIR_BEDENLER,
  },
  {
    kod: 'numara',
    ad: 'Numara',
    ikon: 'Footprints',
    aciklama: 'Ayakkabı numarası (34-48)',
    secenekler: HAZIR_AYAKKABI_NUMARALARI,
  },
  {
    kod: 'cinsiyet',
    ad: 'Cinsiyet / Yaş Grubu',
    ikon: 'Users',
    aciklama: 'Hedef kitle (Kadın, Erkek, Çocuk...)',
    secenekler: HAZIR_CINSIYETLER,
  },
  {
    kod: 'boyut',
    ad: 'Boyut',
    ikon: 'Box',
    aciklama: 'Genel boyut (Küçük - X-Büyük)',
    secenekler: HAZIR_BOYUTLAR,
  },
  {
    kod: 'kalip',
    ad: 'Kalıp',
    ikon: 'Ruler',
    aciklama: 'Giyim kalıbı (Slim, Regular, Oversize...)',
    secenekler: HAZIR_KALIPLAR,
  },
  {
    kod: 'malzeme',
    ad: 'Malzeme',
    ikon: 'Layers',
    aciklama: 'Kumaş/malzeme türü (Pamuk, Yün, Deri...)',
    secenekler: HAZIR_MALZEMELER,
  },
];
