import "./globals.css"

export const metadata = {
    title: 'Voice Tech',
    description: 'Turn any document into an audiobook',
}

import { ThemeProvider } from "./theme-provider"

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=Lora:ital,wght@0,400..700;1,400..700&display=swap" rel="stylesheet" />
                <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
                <style dangerouslySetInnerHTML={{
                    __html: `
                    .material-symbols-outlined {
                        font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
                    }
                ` }} />
            </head>
            <body suppressHydrationWarning className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 min-h-screen flex flex-col selection:bg-gray-300 dark:selection:bg-gray-700">
                <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                    {children}
                </ThemeProvider>
            </body>
        </html>
    )
}
