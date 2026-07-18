import { auth } from "@/lib/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth?.user;
  const isDashboard =
    req.nextUrl.pathname.startsWith("/documents") ||
    req.nextUrl.pathname.startsWith("/dashboard-test");

  if (isDashboard && !isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return Response.redirect(loginUrl);
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
