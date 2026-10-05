import { jsonLdHtml } from "@/lib/handbook/json-ld"

/** Structured data for search engines. See jsonLdHtml for the escaping. */
export function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdHtml(data) }}
    />
  )
}
