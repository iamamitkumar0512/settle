export function Message({ title, text }: { title: string; text: string }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="display text-2xl">{title}</h1>
      <p className="text-muted">{text}</p>
    </main>
  );
}
