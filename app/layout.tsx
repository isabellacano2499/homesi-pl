import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { BranchFilterProvider } from "@/components/branch-filter-provider";

export const metadata: Metadata = {
  title: "Homesí P&L",
  description: "Cost center review and P&L category assignment for Supreme Lending",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="h-screen overflow-hidden bg-gray-100">
        <BranchFilterProvider>
          <Sidebar />
          <main style={{ marginLeft: "68px" }} className="h-screen overflow-y-auto p-6">{children}</main>
        </BranchFilterProvider>
      </body>
    </html>
  );
}
