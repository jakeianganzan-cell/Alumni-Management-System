import AdminLayout from "@/components/admin/AdminLayout";
import ReportExportsPanel from "@/components/account/ReportExportsPanel";

export default function AdminReports() {
  return (
    <AdminLayout title="Reports" subtitle="Generate and download alumni data reports">
      <ReportExportsPanel />
    </AdminLayout>
  );
}
