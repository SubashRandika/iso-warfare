import type { Metadata, Viewport } from 'next';
import { Big_Shoulders_Stencil } from 'next/font/google';
import './globals.css';

// stencil face for designations only (F-22, M17): the marking language of crates, hulls and airframes
const stencil = Big_Shoulders_Stencil({ weight: ['600', '800'], subsets: ['latin'], variable: '--stencil', display: 'swap', fallback: ['Impact', 'Arial Narrow', 'sans-serif'] });

export const metadata: Metadata = {
  title: 'Iso Warfare',
  description: 'An armory of interactive isometric 3D military hardware (fighter jets, small arms and more) in the iso-glow hairline style.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

// set the theme before first paint so a stored light theme never flashes dark
const themeScript = `try{var t=localStorage.getItem('iso-warfare-theme')||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={stencil.variable} suppressHydrationWarning>
      <head suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* browser extensions (Grammarly, LocatorJS…) add attributes to <head> and <body> before hydration */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
