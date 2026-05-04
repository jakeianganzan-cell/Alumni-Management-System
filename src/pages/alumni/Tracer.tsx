import AlumniLayout from "@/components/alumni/AlumniLayout";
import TracerForm from "@/components/alumni/TracerForm";

export default function AlumniTracer() {
  return (
    <AlumniLayout
      title="Graduate Tracer Form"
      subtitle="Complete the CHED Graduate Tracer Survey with section-based validation, autosave draft support, and structured employment history."
    >
      <TracerForm />
    </AlumniLayout>
  );
}
