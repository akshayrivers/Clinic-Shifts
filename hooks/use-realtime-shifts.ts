"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

export function useRealtimeShifts(onShiftChange: () => void) {
  const channelsRef = useRef<{ shifts?: RealtimeChannel; debug?: RealtimeChannel } | null>(null);
  const onShiftChangeRef = useRef(onShiftChange);
  const didSubscribeRef = useRef(false);

  useEffect(() => {
    onShiftChangeRef.current = onShiftChange;
  }, [onShiftChange]);

  useEffect(() => {
    // Prevent duplicate subscribe (React Strict Mode can run effects twice in dev)
    if (didSubscribeRef.current) return;
    didSubscribeRef.current = true;

    let last = 0;
    const trigger = () => {
      const now = Date.now();
      if (now - last < 500) return;
      last = now;
      onShiftChangeRef.current();
    };

    const shiftsChannel = supabase
      .channel("public:shifts-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shifts" },
        () => trigger()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shift_claims" },
        () => trigger()
      )
      .subscribe((status) => {
        console.log("[useRealtimeShifts] shifts channel status:", status);
      });

    const debugChannel = supabase
      .channel("public:realtime-postgres-debug")
      .on(
        "postgres_changes",
        { event: "*", schema: "public" },
        () => {
          // keep for debugging; no trigger needed
        }
      )
      .subscribe((status) => {
        console.log("[useRealtimeShifts] debug channel status:", status);
      });

    channelsRef.current = { shifts: shiftsChannel, debug: debugChannel };

    return () => {
      // Allow cleanup but DO NOT resubscribe again in the same mount
      if (channelsRef.current?.shifts) supabase.removeChannel(channelsRef.current.shifts);
      if (channelsRef.current?.debug) supabase.removeChannel(channelsRef.current.debug);
      channelsRef.current = null;
    };
  }, []);
}