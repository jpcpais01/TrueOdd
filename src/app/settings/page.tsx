import SettingsForm from "@/components/settings/SettingsForm";

export default function SettingsPage() {
  return (
    <div>
      <h1 className="mb-3 font-display text-xs text-arcade-text">CONFIG</h1>
      <SettingsForm />
      <p className="mt-4 px-1 text-[10px] leading-relaxed text-arcade-dim">
        TrueOdd is paper-trading only — it never places a real order. This app exists to test,
        not assume, whether Kalshi&apos;s BTC 15-minute markets misprice against a statistically
        estimated fair probability.
      </p>
    </div>
  );
}
