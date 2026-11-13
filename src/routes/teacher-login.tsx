import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthLayout } from "@/components/portal/AuthLayout";
import { AuthPanel } from "@/components/portal/AuthPanel";

export const Route = createFileRoute("/teacher-login")({
  head: () => ({
    meta: [
      { title: "Teacher sign in — CIR Portal" },
      { name: "description", content: "Teachers sign in to review and approve student interest for international programmes." },
      { property: "og:title", content: "Teacher sign in — CIR Portal" },
      { property: "og:description", content: "Review and approve student expressions of interest." },
    ],
  }),
  component: TeacherAuth,
});

function TeacherAuth() {
  return (
    <AuthLayout
      eyebrow="Faculty access"
      title="Teacher sign in"
      subtitle="Review student interest forms and approve who moves on to the final application. New teachers are approved by an existing teacher."
      footer={
        <>
          Are you a student?{" "}
          <Link to="/auth" className="font-medium text-primary underline-offset-4 hover:underline">
            Student sign in
          </Link>
        </>
      }
    >
      <AuthPanel audience="teacher" />
    </AuthLayout>
  );
}
