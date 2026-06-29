import type { Metadata, Viewport } from 'next';
import { Share_Tech_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { ToastProvider } from '@/lib/toast-context';
import { Toaster } from '@/components/toaster';

const mono = Share_Tech_Mono({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-share-tech',
  display: 'swap',
});

// Render dynamically so the per-request CSP nonce is stamped onto the scripts.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  metadataBase: new URL('https://chat.lucek.ai'),
  title: 'Chat Łucek',
  description: "Adam Łucek's fullstack multi-user LLM chatbot",
  openGraph: {
    title: 'Chat Łucek',
    url: '/',
    siteName: 'Chat Łucek',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Chat Łucek',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
          <Toaster />
        </ToastProvider>
      </body>
    </html>
  );
}
