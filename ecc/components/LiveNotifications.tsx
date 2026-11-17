"use client";
// Subscribes to Supabase Realtime for the signed-in user's notifications.
// Realtime honours RLS, so only the user's own rows are delivered.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export function LiveNotifications({ userId, label }: { userId: string; label: string }) {
  const router = useRouter();
  const [live, setLive] = useState(false);
  useEffect(() => {
    const sb = supabaseBrowser();
    const ch = sb.channel(`notif-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => router.refresh())
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    return () => { sb.removeChannel(ch); };
  }, [userId, router]);
  return <span className="text-xs text-muted" aria-live="polite">{live ? `● ${label}` : "○"}</span>;
}
