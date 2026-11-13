import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthLayout } from "@/components/portal/AuthLayout";
import { AuthPanel } from "@/components/portal/AuthPanel";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Student sign in — CIR Portal" },
      { name: "description", content: "Sign in to track your international programme interest and talk to CIR Guide." },
      { property: "og:title", content: "Student sign in — CIR Portal" },
      { property: "og:description", content: "Track your interest status and next steps with the Centre for International Relations." },
    ],
  }),
  component: StudentAuth,
});

function StudentAuth() {
  return (
    <AuthLayout
      eyebrow="Students"
      title="Welcome back"
      subtitle="Sign in with the same email you used on the interest form to see your progress."
      footer={
        <>
          Are you a teacher?{" "}
          <Link to="/teacher-login" className="font-medium text-primary underline-offset-4 hover:underline">
            Teacher sign in
          </Link>
        </>
      }
    >
      <AuthPanel audience="student" />
    </AuthLayout>
  );
}
