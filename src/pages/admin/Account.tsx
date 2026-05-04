import AdminLayout from "@/components/admin/AdminLayout";
import ManageAccountModule from "@/components/account/ManageAccountModule";

export default function AdminAccount() {
  return (
    <AdminLayout title="Manage Account" subtitle="Profile, password, and notification preferences">
      <ManageAccountModule mode="admin" />
    </AdminLayout>
  );
}
