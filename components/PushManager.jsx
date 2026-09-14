"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { savePushSubscription } from "@/app/notices/actions";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Renders nothing until there's actually something useful to offer: a
// signed-in user, on a supported browser, who hasn't subscribed yet and
// hasn't blocked notifications.
export default function PushManager() {
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    let active = true;
    async function check() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const reg = await navigator.serviceWorker.register("/sw.js");
      const existing = await reg.pushManager.getSubscription();
      if (existing || Notification.permission === "denied") return;

      if (active) setStatus("ready");
    }
    check();
    return () => {
      active = false;
    };
  }, []);

  async function subscribe() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("idle");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
      });
      await savePushSubscription(sub.toJSON());
      setStatus("idle");
    } catch (err) {
      console.error("push subscribe failed", err);
      setStatus("idle");
    }
  }

  if (status !== "ready") return null;

  return (
    <button
      onClick={subscribe}
      className="fixed bottom-4 right-4 z-40 bg-pine text-paper text-sm font-medium px-4 py-2.5 rounded-full shadow-lg print:hidden"
    >
      🔔 Enable notifications
    </button>
  );
}
