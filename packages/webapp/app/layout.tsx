import type { Metadata } from "next"
import { Poppins } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-sans",
})

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.BETTER_AUTH_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
  "http://localhost:3000"

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    template: "%s · monmap",
    default: "monmap — Monash course planner",
  },
  description:
    "Plan your Monash degree visually: drag units into semesters, check prereqs, and track WAM.",
  openGraph: {
    title: "monmap — Monash course planner",
    description:
      "Plan your Monash degree visually: drag units into semesters, check prereqs, and track WAM.",
    siteName: "monmap",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "monmap — Monash course planner",
    description:
      "Plan your Monash degree visually: drag units into semesters, check prereqs, and track WAM.",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", "font-sans", poppins.variable)}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
