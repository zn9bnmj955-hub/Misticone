import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@orgasport/db";
import { env } from "@/lib/env";

/** Refreshes the auth session cookie on navigation. */
export async function updateSession(request: NextRequest, response: NextResponse) {
  let res = response;
  const supabase = createServerClient<Database>(env.supabaseUrl, env.supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        res = NextResponse.next({ request });
        for (const { name, value, options } of toSet) res.cookies.set(name, value, options);
      },
    },
  });
  // Do not remove: validates and refreshes the token.
  await supabase.auth.getClaims();
  return res;
}
