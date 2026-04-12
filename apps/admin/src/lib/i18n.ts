import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import tr from "@/locales/tr.json";
import en from "@/locales/en.json";

const VARSAYILAN_DIL = (import.meta.env.VITE_VARSAYILAN_DIL as string | undefined) ?? "tr";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      tr: { translation: tr },
      en: { translation: en },
    },
    fallbackLng: VARSAYILAN_DIL,
    supportedLngs: ["tr", "en"],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "kuvvem-dil",
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
