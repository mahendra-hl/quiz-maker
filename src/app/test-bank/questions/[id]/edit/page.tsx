import { QuestionForm } from "@/components/questions/question-form";

export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <QuestionForm mode="edit" questionId={id} />
    </main>
  );
}
