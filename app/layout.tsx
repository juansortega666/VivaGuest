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
  // Las variables de fuente van en <html>, NO en <body>, y no es cosmetico.
  // `globals.css` aplica `html { @apply font-sans }`, que resuelve a
  // `var(--font-geist-sans)`. `next/font` define esa variable mediante la clase
  // que genera, asi que si la clase vive en <body> la variable NO existe en
  // <html>: la declaracion es invalida, <html> cae a Times y <body> hereda
  // Times. Medido en el navegador con next start. Arreglar la circularidad de
  // `--font-sans` en globals.css es necesario pero NO suficiente.
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="antialiased">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
