import type { Config } from "tailwindcss";
import animatePlugin from "tailwindcss-animate";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,html}"],
  darkMode: ["selector", '[data-tema="koyu"]'],
  plugins: [animatePlugin],
} satisfies Config;
