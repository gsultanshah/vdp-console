import { Inter } from "next/font/google";
import "./globals.css";
import { systemConfig } from "@/config/system";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata = {
  title: "VDP Console",
  description: "Voter Data Processing Console",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!systemConfig.isSystemAvailable) {
    return (
      <html lang="en">
        <head>
          <link rel="icon" href="/favicon.ico" sizes="any" />
        </head>
        <body className={inter.className}>
          <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="text-center p-8 bg-white rounded-lg shadow-lg">
              <h1 className="text-2xl font-bold text-red-600 mb-4">
                {systemConfig.maintenanceMessage}
              </h1>
            </div>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
} 