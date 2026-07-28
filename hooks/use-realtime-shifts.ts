"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";

export function useRealtimeShifts(onShiftChange: (shiftId?: string) => void) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    // Only attempt Supabase Realtime if configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return;
    }

    const channel = supabase
      .channel("public:shifts-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shifts" },
        (payload) => {
          const shiftId = (payload.new as { id?: string })?.id || (payload.old as { id?: string })?.id;
          onShiftChange(shiftId);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shift_claims" },
        (payload) => {
          const shiftId = (payload.new as { shift_id?: string })?.shift_id || (payload.old as { shift_id?: string })?.shift_id;
          onShiftChange(shiftId);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("⚡ Supabase Realtime subscribed to shifts & shift_claims");
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [onShiftChange]);
}
