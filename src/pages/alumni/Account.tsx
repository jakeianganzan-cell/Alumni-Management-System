import AlumniLayout from "@/components/alumni/AlumniLayout";
import ManageAccountModule from "@/components/account/ManageAccountModule";

export default function AlumniAccount() {
  return (
    <AlumniLayout title="Manage Account" subtitle="Profile, password, and notification preferences">
      <ManageAccountModule mode="alumni" />
    </AlumniLayout>
  );
}
