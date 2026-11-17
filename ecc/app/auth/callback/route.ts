import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// E-mail confirmation / magic-link callback: exchanges the one-time code for a session.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (code) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.redirect(new URL("/login?error=" + encodeURIComponent("The confirmation link is invalid or expired."), req.url));
}
