export default function Home() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
      <p className="text-fg text-sm font-medium">No conversation selected</p>
      <p className="text-muted text-sm">
        Pick one from the sidebar, or start a new conversation.
      </p>
    </div>
  );
}
