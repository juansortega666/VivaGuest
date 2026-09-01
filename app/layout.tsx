import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VivaGuest",
  description:
    "Administracion de apartamentos y coordinacion de aseos para renta corta.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // `lang="es"` no es cosmetico: es lo que hace que un lector de pantalla
  // pronuncie el contenido en espanol (02-UI-SPEC.md §13). Venia en "en"
  // desde create-next-app y `shadcn init` no toca este archivo.
  //
  // Sin ThemeProvider, sin clase `dark` y sin toggle: la fase es solo clara
  // (§4.5). El bloque `.dark` de globals.css existe pero no se usa.
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
