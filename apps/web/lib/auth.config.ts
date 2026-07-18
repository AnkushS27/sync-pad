import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
    newUser: "/register",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isApiRoute = nextUrl.pathname.startsWith("/api");
      const isAuthRoute =
        nextUrl.pathname.startsWith("/login") || nextUrl.pathname.startsWith("/register");

      // API routes handle their own authorization internally for defense in depth
      if (isApiRoute) {
        return true;
      }

      // If user is logged in, redirect them away from auth screens to dashboard
      if (isAuthRoute) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/documents", nextUrl));
        }
        return true;
      }

      // Protect all other routes by default
      return isLoggedIn;
    },
  },
  providers: [], // Providers are added in auth.ts (Node.js runtime environment)
} satisfies NextAuthConfig;
