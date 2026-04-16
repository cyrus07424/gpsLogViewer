import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GPS Log Viewer — GPS履歴マップ表示・分析ツール",
  description: "NMEAファイルをアップロードしてGPS履歴を地図上に表示・分析するツール",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
