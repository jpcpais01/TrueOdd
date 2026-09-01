"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import Panel from "@/components/ui/Panel";
import clsx from "@/lib/clsx";
import type { StrategySettingsDTO } from "@/types/api";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface FieldConfig {
  key: keyof StrategySettingsDTO;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const FIELDS: FieldConfig[] = [
  {
    key: "lookbackMarkets",
    label: "Lookback markets",
    hint: "Number of completed 15m markets used for the realized-volatility window.",
    min: 1,
    max: 50,
    step: 1,
    format: (v) => `${v}`,
  },
  {
    key: "mcPaths",
    label: "Monte Carlo paths",
    hint: "Simulated price paths per 5-second model update.",
    min: 1000,
    max: 50_000,
    step: 1000,
    format: (v) => v.toLocaleString(),
  },
  {
    key: "minEdge",
    label: "Minimum edge",
    hint: "Model probability must exceed the best ask by at least this much to paper-enter.",
    min: 0,
    max: 0.2,
    step: 0.005,
    format: (v) => `${(v * 100).toFixed(1)}%`,
  },
  {
    key: "paperStake",
    label: "Paper stake",
    hint: "Dollar amount risked per entry (one entry max per market).",
    min: 1,
    max: 500,
    step: 1,
    format: (v) => `$${v}`,
  },
];

export default function SettingsForm() {
  const { data, mutate } = useSWR<StrategySettingsDTO>("/api/settings", fetcher);
  const [draft, setDraft] = useState<StrategySettingsDTO | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (data && !draft) setDraft(data);
  }, [data, draft]);

  if (!draft) {
    return (
      <div className="animate-pulse space-y-3">
        <Panel className="h-24" />
        <Panel className="h-24" />
      </div>
    );
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (res.ok) {
        const updated = await res.json();
        await mutate(updated, false);
        setSavedAt(Date.now());
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {FIELDS.map((field) => (
        <Panel key={field.key} className="px-4 py-3">
          <div className="flex items-baseline justify-between">
            <label className="text-xs font-medium text-arcade-text">{field.label}</label>
            <span className="tabular font-mono text-sm text-arcade-cyan">
              {field.format(draft[field.key])}
            </span>
          </div>
          <input
            type="range"
            min={field.min}
            max={field.max}
            step={field.step}
            value={draft[field.key]}
            onChange={(e) =>
              setDraft((d) => (d ? { ...d, [field.key]: Number(e.target.value) } : d))
            }
            className="mt-2 w-full accent-arcade-yes"
          />
          <p className="mt-1.5 text-[10px] leading-relaxed text-arcade-dim">{field.hint}</p>
        </Panel>
      ))}

      <button
        onClick={save}
        disabled={saving}
        className={clsx(
          "w-full rounded-xl border border-arcade-yes/40 bg-arcade-yes/10 py-3 font-display text-[10px] tracking-widest text-arcade-yes transition-all",
          "hover:bg-arcade-yes/20 disabled:opacity-50",
        )}
      >
        {saving ? "SAVING…" : "SAVE SETTINGS"}
      </button>

      {savedAt && (
        <p className="text-center text-[10px] text-arcade-dim">
          Saved — takes effect on the next 5s tick.
        </p>
      )}
    </div>
  );
}
