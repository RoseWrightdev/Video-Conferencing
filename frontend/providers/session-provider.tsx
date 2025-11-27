"use client";

import { SessionProvider } from "next-auth/react";
import React from "react";

/**
 * NextAuth session provider wrapper for client components.
 * 
 * Provides authentication session context to all child components,
 * enabling access to Auth0 session data via useSession hook.
 * 
 * Usage:
 * - Wrap app root or layout in this provider
 * - Must be a client component ("use client" directive)
 * - Enables useSession hook in all descendants
 * 
 * Session Features:
 * - Access user profile (name, email, image)
 * - Get JWT access token for API calls
 * - Check authentication status (loading, authenticated, unauthenticated)
 * - Automatic session refresh before expiration
 * 
 * @param props - Component props
 * @param props.children - React children to wrap with session context
 * 
 * @example
 * ```tsx
 * // In app/layout.tsx
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <NextAuthSessionProvider>
 *           {children}
 *         </NextAuthSessionProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * 
 * // In any child component
 * import { useSession } from 'next-auth/react';
 * 
 * function MyComponent() {
 *   const { data: session, status } = useSession();
 *   
 *   if (status === 'loading') return <Loading />;
 *   if (status === 'unauthenticated') return <SignIn />;
 *   
 *   return <div>Hello, {session.user.name}!</div>;
 * }
 * ```
 * 
 * @see useSession For consuming session in components
 * @see SessionProvider For NextAuth.js documentation
 */
export default function NextAuthSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}