import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Contrôle optimiste uniquement : sans cookie de session, on renvoie vers la connexion.
// L'autorisation réelle (session valide, rôle) est appliquée par l'API sur chaque requête.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();
  if (!request.cookies.has("eld_admin_session")) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
