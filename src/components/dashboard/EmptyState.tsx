import Panel from "@/components/ui/Panel";

export default function EmptyState({ message }: { message: string }) {
  return (
    <Panel className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="font-display text-2xl text-arcade-dim">◌</span>
      <p className="max-w-[24ch] text-xs text-arcade-dim">{message}</p>
    </Panel>
  );
}
