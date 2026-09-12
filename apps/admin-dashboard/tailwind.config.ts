import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        hero: ['"Plus Jakarta Sans"', '"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        kpi: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        nav: ['"DM Sans"', '"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        badge: ['"Space Grotesk"', '"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
