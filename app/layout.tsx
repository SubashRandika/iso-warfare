import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'F-22 Raptor · Iso Warfare',
  description: 'An interactive isometric 3D F-22 Raptor in the iso-glow hairline style.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

// set the theme before first paint so a stored light theme never flashes dark
const themeScript = `try{var t=localStorage.getItem('iso-warfare-theme')||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* browser extensions (Grammarly, LocatorJS…) add attributes to <head> and <body> before hydration */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
