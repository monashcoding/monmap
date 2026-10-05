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
  // 800 is the 404 and error headings (font-extrabold). Nothing uses
  // 900, and each weight is another preloaded font file.
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
})

const SITE_DESCRIPTION =
  "Plan your Monash degree: drag units into semesters, check prerequisites and track your WAM. Read student reviews and see requisite maps for every Monash unit and course."

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    template: "%s - MonMap",
    default: "MonMap: Monash Course Planner, Unit Reviews & Prerequisite Maps",
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
    "unit reviews",
    "Monash unit reviews",
    "WAM",
    "Australia",
  ],
  authors: [{ name: "MonMap" }],
  openGraph: {
    title: "MonMap: Monash Course Planner, Unit Reviews & Prerequisite Maps",
    description: SITE_DESCRIPTION,
    siteName: "MonMap",
    type: "website",
    url: siteUrl,
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: "MonMap: Monash Course Planner, Unit Reviews & Prerequisite Maps",
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

// Browser chrome follows the page colour in each theme. ThemeColorSync
// (components/theme-provider.tsx) switches these tags to the theme the
// student picked when it differs from the OS scheme.
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
    // The SearchAction for /search?q= is declared on the search page.
  }
  return (
    <html
      lang="en-AU"
      suppressHydrationWarning
      className={cn("antialiased", "font-sans", poppins.variable)}
    >
      <body>
        <ThemeProvider>
          <PostHogIdentify />
          {children}
          {/* Below 601px sonner uses mobileOffset; the toasts then clear the
              48px Progress button. globals.css covers 601-767px. */}
          <Toaster
            position="bottom-right"
            richColors
            closeButton
            mobileOffset={{ bottom: 80 }}
          />
        </ThemeProvider>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }}
        />
      </body>
    </html>
  )
}
