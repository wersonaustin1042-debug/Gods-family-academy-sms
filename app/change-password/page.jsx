import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import ChangePasswordForm from "./ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const forced = user?.app_metadata?.must_change_password === true;

  // While a password change is forced there is nothing else to navigate to, so no menu.
  if (forced) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <ChangePasswordForm forced />
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-5 sm:p-8 flex justify-center">
        <ChangePasswordForm forced={false} />
      </main>
    </div>
  );
}
