import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"

export const alt = "monmap — Monash course planner"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const MONASH_YELLOW = "#ffe330"
const MONASH_YELLOW_INK = "#1d1300"

async function loadGoogleFont(family: string, weight: number) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
    family
  )}:wght@${weight}`
  const css = await fetch(cssUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  }).then((r) => r.text())
  const fontUrl = css.match(/src: url\((https:[^)]+)\) format/)?.[1]
  if (!fontUrl) throw new Error(`Could not resolve ${family} ${weight}`)
  return fetch(fontUrl).then((r) => r.arrayBuffer())
}

export default async function OpengraphImage() {
  const [logoBytes, poppinsRegular, poppinsBold, poppinsBlack] =
    await Promise.all([
      readFile(join(process.cwd(), "public/brand-logo.png")),
      loadGoogleFont("Poppins", 500),
      loadGoogleFont("Poppins", 700),
      loadGoogleFont("Poppins", 900),
    ])

  const logoDataUrl = `data:image/png;base64,${logoBytes.toString("base64")}`

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#0e0820",
        color: "#ffffff",
        fontFamily: "Poppins",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -260,
          right: -260,
          width: 920,
          height: 920,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(91,45,144,0.55) 0%, rgba(91,45,144,0.18) 35%, rgba(91,45,144,0) 70%)`,
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -240,
          left: -200,
          width: 760,
          height: 760,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(122,63,192,0.45) 0%, rgba(122,63,192,0.15) 35%, rgba(122,63,192,0) 70%)`,
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          padding: "64px 72px",
          gap: 36,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <img
            src={logoDataUrl}
            width={72}
            height={72}
            style={{ borderRadius: 18 }}
            alt=""
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontWeight: 500,
            }}
          >
            <div style={{ fontSize: 22, color: "rgba(255,255,255,0.65)" }}>
              Monash Association of Coding
            </div>
            <div
              style={{
                fontSize: 20,
                color: MONASH_YELLOW,
                fontWeight: 700,
                marginTop: 2,
              }}
            >
              monmap.monashcoding.com
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 156,
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1,
            }}
          >
            <span>mon</span>
            <span style={{ color: MONASH_YELLOW }}>map</span>
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 500,
              color: "rgba(255,255,255,0.78)",
              marginTop: 22,
              maxWidth: 900,
              lineHeight: 1.3,
            }}
          >
            Plan your Monash degree visually — drag units into semesters, check
            prereqs, track your WAM.
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Chip filled label="Course planner" />
          <Chip label="Unit tree" />
          <Chip label="WAM tracker" />
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: "Poppins",
          data: poppinsRegular,
          weight: 500,
          style: "normal",
        },
        { name: "Poppins", data: poppinsBold, weight: 700, style: "normal" },
        { name: "Poppins", data: poppinsBlack, weight: 900, style: "normal" },
      ],
    }
  )
}

function Chip({ label, filled }: { label: string; filled?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "10px 22px",
        borderRadius: 999,
        fontSize: 22,
        fontWeight: 700,
        background: filled ? MONASH_YELLOW : "rgba(255,255,255,0.08)",
        color: filled ? MONASH_YELLOW_INK : "rgba(255,255,255,0.92)",
        border: filled
          ? `2px solid ${MONASH_YELLOW}`
          : "2px solid rgba(255,255,255,0.18)",
      }}
    >
      {label}
    </div>
  )
}
