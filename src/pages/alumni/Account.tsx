import AlumniLayout from "@/components/alumni/AlumniLayout";
import ManageAccountModule from "@/components/account/ManageAccountModule";

export default function AlumniAccount() {
  return (
    <AlumniLayout title="Manage Account">
      <ManageAccountModule mode="alumni" />
    </AlumniLayout>
  );
}
