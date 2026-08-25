"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ADMIN_LIKE = ["admin", "director", "headmaster", "assistant_headmaster"];

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    setLoading(false);

    let destination = "/dashboard";
    if (profile?.role === "parent") destination = "/parent";
    else if (profile?.role === "accountant") destination = "/fees";
    else if (profile?.role === "teacher") destination = "/attendance";
    else if (ADMIN_LIKE.includes(profile?.role)) destination = "/dashboard";

    router.push(destination);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="Barima Duah Memorial School"
            className="h-16 w-16 mx-auto mb-3 object-contain"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <h1 className="font-display text-2xl font-semibold text-pine">Barima Duah Memorial School</h1>
          <p className="text-sm text-stone-500 mt-1">Management System</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-xl border border-stone-200 p-6 space-y-4">
          {error && (
            <p className="text-sm text-clay bg-clay/10 border border-clay/30 rounded-lg px-3 py-2">{error}</p>
          )}
          <div>
            <label className="text-xs font-medium text-stone-500">Email</label>
            <input
              type="email"
              required
              className="w-full mt-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pine/40"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@barimadua.edu.gh"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500">Password</label>
            <input
              type="password"
              required
              className="w-full mt-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pine/40"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-pine text-paper text-sm font-medium py-2.5 rounded-lg hover:bg-pine/90 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="text-xs text-stone-400 text-center mt-4">
          Accounts are created by the school admin — contact your administrator for access.
        </p>
      </div>
    </div>
  );
}
