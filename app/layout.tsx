import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Interview Assist",
  description: "Multi-profile interview preparation with verbal, coding, and system design modes",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
