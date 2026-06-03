import ChairmanLayout from "@/components/chairman/ChairmanLayout";
import ManageAccountModule from "@/components/account/ManageAccountModule";

export default function ChairmanAccount() {
  return (
    <ChairmanLayout title="Manage Account">
      <ManageAccountModule mode="alumni" />
    </ChairmanLayout>
  );
}
