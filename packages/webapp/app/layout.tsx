import type { Metadata, Viewport } from "next"
import { Poppins } from "next/font/google"

import "./globals.css"
import { PostHogIdentify } from "@/components/posthog-identify"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { siteUrl } from "@/lib/seo"
import { cn } from "@/lib/utils"

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-sans",
})

const SITE_DESCRIPTION =
  "Plan your Monash degree visually: drag units into semesters, check prereqs, and track WAM. Free, open-source unit and course explorer for Monash University students."

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    template: "%s · MonMap",
    default: "MonMap - Monash course planner & unit explorer",
  },
  description: SITE_DESCRIPTION,
  applicationName: "MonMap",
  keywords: [
    "Monash",
    "Monash University",
    "course planner",
    "unit planner",
    "MonPlan",
    "Monash handbook",
    "prerequisites",
    "WAM",
    "Australia",
  ],
  authors: [{ name: "MonMap" }],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "MonMap - Monash course planner & unit explorer",
    description: SITE_DESCRIPTION,
    siteName: "MonMap",
    type: "website",
    url: siteUrl,
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: "MonMap - Monash course planner & unit explorer",
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
}

// Browser chrome follows the page colour in each theme.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#252525" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const orgLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "MonMap",
    alternateName: "MonMap - Monash course planner",
    description: SITE_DESCRIPTION,
    url: siteUrl,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    inLanguage: "en-AU",
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "AUD",
    },
    audience: {
      "@type": "EducationalAudience",
      educationalRole: "student",
    },
    about: {
      "@type": "CollegeOrUniversity",
      name: "Monash University",
      sameAs: "https://www.monash.edu/",
    },
    // No sitewide SearchAction — the workbench at /search has its own
    // course/unit pickers and isn't a query-string search route.
  }
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", "font-sans", poppins.variable)}
    >
      <body>
        <ThemeProvider>
          <PostHogIdentify />
          {children}
          <Toaster position="bottom-right" richColors closeButton />
        </ThemeProvider>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }}
        />
      </body>
    </html>
  )
}
