import { QuestionForm } from "@/components/questions/question-form";

export default function NewQuestionPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <QuestionForm mode="create" />
    </main>
  );
}
