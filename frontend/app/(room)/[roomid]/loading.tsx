import { Loader2 } from 'lucide-react';

/**
 * Next.js App Router loading UI for room pages.
 * 
 * Automatically displayed by Next.js during:
 * - Server-side rendering (SSR) of the page
 * - Client-side navigation to the page
 * - Suspense boundaries
 * 
 * This prevents the flash of waiting room content during:
 * - Initial page load
 * - Page refresh
 * - Navigation from other pages
 * 
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/loading
 */
export default function Loading() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-xl font-semibold">Loading room...</h2>
        </div>
      </div>
    </div>
  );
}
