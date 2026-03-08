import type { Config } from "tailwindcss"

const config: Config = {
    darkMode: "class",
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                "primary": "#195de6",
                "background-light": "#f6f6f8",
                "background-dark": "#111621",
            },
            fontFamily: {
                "display": ["Manrope", "sans-serif"],
                "serif": ["Lora", "serif"]
            },
            borderRadius: {
                "DEFAULT": "0.25rem",
                "lg": "0.5rem",
                "xl": "0.75rem",
                "full": "9999px"
            },
        },
    },
    plugins: [
        require('@tailwindcss/forms'),
        require('@tailwindcss/container-queries')
    ],
}
export default config
