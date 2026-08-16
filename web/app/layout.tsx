import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3100"),
  title: {
    default: "Ridgeline",
    template: "%s / Ridgeline",
  },
  description:
    "Ridgeline watches public mountain cameras for the first vertical break in the horizon line, and holds its alert until three consecutive frames agree.",
  openGraph: {
    title: "Ridgeline",
    description:
      "Wildfire smoke detection from public camera networks. Three consecutive frames, or no alert.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
