"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendPushToAll } from "@/lib/push";

export async function createNotice(formData) {
  const supabase = createClient();
  const title = formData.get("title");
  const body = formData.get("body");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("notices").insert({ title, body, created_by: user?.id });
  if (error) throw new Error(error.message);

  revalidatePath("/notices");

  // Best-effort: a push delivery hiccup shouldn't stop the notice from posting.
  try {
    await sendPushToAll({ title, body, url: "/notices" });
  } catch (err) {
    console.error("push send failed", err);
  }
}

export async function deleteNotice(id) {
  const supabase = createClient();
  const { error } = await supabase.from("notices").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/notices");
}

export async function savePushSubscription(subscription) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: "endpoint" }
  );
  if (error) throw new Error(error.message);
}

export async function removePushSubscription(endpoint) {
  const supabase = createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw new Error(error.message);
}
