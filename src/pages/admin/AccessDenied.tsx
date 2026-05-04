import AdminLayout from "@/components/admin/AdminLayout";
import { ShieldOff, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getRoleLabel, type OfficerRole } from "@/lib/rbac";

function isOfficerRole(role: string | null): role is OfficerRole {
  if (!role) return false;
  return role !== "alumni";
}

export default function AccessDenied() {
  const navigate = useNavigate();
  const { role } = useAuth();

  return (
    <AdminLayout title="Access Denied" subtitle="You do not have permission to view this page">
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
          <ShieldOff className="w-10 h-10 text-destructive" />
        </div>
        <h2 className="text-2xl font-display font-bold text-navy-dark mb-2">Access Denied</h2>
        <p className="text-muted-foreground mb-1 max-w-md">
          Your current role <span className="font-semibold text-navy">({isOfficerRole(role) ? getRoleLabel(role) : role ?? "Unknown"})</span> does not have permission to access this module.
        </p>
        <p className="text-sm text-muted-foreground mb-8 max-w-sm">
          If you believe this is a mistake, please contact the Alumni President or System Administrator.
        </p>
        <button onClick={() => navigate("/admin")}
          className="flex items-center gap-2 px-5 py-2.5 bg-navy text-white rounded-lg font-semibold text-sm hover:bg-navy-light transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
      </div>
    </AdminLayout>
  );
}
