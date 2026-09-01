import AdminLayout from "@/components/admin/AdminLayout";
import ManageAccountModule from "@/components/account/ManageAccountModule";
import { useSearchParams } from "react-router-dom";

export default function AdminAccount() {
  const [searchParams] = useSearchParams();
  const section = searchParams.get("section") || "";
  const isSettingsView = ["settings", "branding", "sessions", "email"].includes(section);
  const title = isSettingsView ? "Settings" : section === "reports" ? "Concern Inbox" : "Manage Account";

  return (
    <AdminLayout title={title}>
      <ManageAccountModule mode="admin" />
    </AdminLayout>
  );
}
