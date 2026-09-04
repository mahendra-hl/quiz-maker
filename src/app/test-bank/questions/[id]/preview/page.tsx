import { QuestionPreview } from "@/components/questions/question-preview";

export default async function PreviewQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8 sm:px-8">
      <QuestionPreview questionId={id} />
    </main>
  );
}
