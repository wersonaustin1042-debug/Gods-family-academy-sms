import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

// IMPORTANT: this uses the service role key (via createAdminClient) and must
// only ever be imported from server-only files (server actions, route
// handlers). Never import this into a "use client" component.

webpush.setVapidDetails(
  "mailto:wersonaustin1042@gmail.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Sends a push notification to every stored subscription. Uses the admin
// client so it isn't limited by the "users manage own subscriptions" RLS
// policy. Any subscription the push service reports as gone (410/404) is
// deleted so the table doesn't accumulate dead endpoints.
export async function sendPushToAll({ title, body, url }) {
  const supabaseAdmin = createAdminClient();
  const { data: subs } = await supabaseAdmin.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  if (!subs || subs.length === 0) return;

  const payload = JSON.stringify({ title, body, url });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("push send failed for one subscription", err.statusCode || err.message);
        }
      }
    })
  );
}
