"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ListFilter, X } from "lucide-react";

// ─── Prop shapes ──────────────────────────────────────────────────────────────

type CategoricalProps = {
  type: "categorical";
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
};
type NumericProps = {
  type: "numeric";
  min: string;
  max: string;
  onChange: (min: string, max: string) => void;
};
type TextProps = {
  type: "text";
  value: string;
  onChange: (value: string) => void;
};

export type ColumnFilterProps = (CategoricalProps | NumericProps | TextProps) & {
  label: string;
};

function checkActive(props: CategoricalProps | NumericProps | TextProps): boolean {
  if (props.type === "categorical") return props.selected.length > 0;
  if (props.type === "numeric") return !!props.min || !!props.max;
  return !!props.value;
}

// ─── Dropdown content ─────────────────────────────────────────────────────────

function CategoricalDropdown({ opts, selected, onChange }: {
  opts: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const visible = opts.filter((v) => v.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="border-b border-gray-100 px-2 py-1.5">
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
          autoFocus
        />
      </div>
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-1">
        <button
          onClick={() => onChange(opts)}
          className="text-xs text-blue-600 hover:underline"
        >
          Select all
        </button>
        <button
          onClick={() => onChange([])}
          className="text-xs text-gray-400 hover:text-gray-600 hover:underline"
        >
          Deselect all
        </button>
      </div>
      <div className="max-h-52 overflow-y-auto py-1">
        {visible.map((v) => (
          <label key={v} className="flex cursor-pointer items-center gap-2 px-3 py-1 hover:bg-gray-50">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={selected.includes(v)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...selected, v]
                  : selected.filter((s) => s !== v);
                onChange(next);
              }}
            />
            <span className="truncate text-xs text-gray-700">{v}</span>
          </label>
        ))}
        {visible.length === 0 && (
          <p className="px-3 py-2 text-xs text-gray-400">No options</p>
        )}
      </div>
      {selected.length > 0 && (
        <div className="border-t border-gray-100 px-3 py-1.5">
          <button onClick={() => onChange([])} className="text-xs text-blue-600 hover:underline">
            Clear ({selected.length} selected)
          </button>
        </div>
      )}
    </>
  );
}

function NumericDropdown({ min, max, onChange }: {
  min: string; max: string;
  onChange: (min: string, max: string) => void;
}) {
  return (
    <div className="space-y-2 px-3 py-3">
      <div>
        <label className="mb-0.5 block text-xs text-gray-500">Min</label>
        <input
          type="number"
          placeholder="0"
          value={min}
          onChange={(e) => onChange(e.target.value, max)}
          className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
          autoFocus
        />
      </div>
      <div>
        <label className="mb-0.5 block text-xs text-gray-500">Max</label>
        <input
          type="number"
          placeholder="∞"
          value={max}
          onChange={(e) => onChange(min, e.target.value)}
          className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
        />
      </div>
      {(min || max) && (
        <button onClick={() => onChange("", "")} className="text-xs text-blue-600 hover:underline">
          Clear
        </button>
      )}
    </div>
  );
}

function TextDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="px-3 py-3">
      <label className="mb-1 block text-xs text-gray-500">Contains</label>
      <input
        type="text"
        placeholder="Type to filter…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
        autoFocus
      />
      {value && (
        <button onClick={() => onChange("")} className="mt-1.5 text-xs text-blue-600 hover:underline">
          Clear
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ColumnFilter(props: ColumnFilterProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const active = checkActive(props);

  function openDrop() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Prevent dropdown from overflowing right edge
    const dropW = 256;
    const left = Math.min(rect.left, window.innerWidth - dropW - 8);
    setPos({ top: rect.bottom + 4, left });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (
        dropRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const dropdown = (
    <div
      ref={dropRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, width: 256 }}
      className="rounded-lg border border-gray-200 bg-white shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <span className="text-xs font-semibold text-gray-700">{props.label}</span>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
          <X size={13} />
        </button>
      </div>

      {props.type === "categorical" && (
        <CategoricalDropdown
          opts={props.options}
          selected={props.selected}
          onChange={props.onChange}
        />
      )}
      {props.type === "numeric" && (
        <NumericDropdown min={props.min} max={props.max} onChange={props.onChange} />
      )}
      {props.type === "text" && (
        <TextDropdown value={props.value} onChange={props.onChange} />
      )}
    </div>
  );

  return (
    <span className="ml-1 inline-flex shrink-0 items-center">
      <button
        ref={triggerRef}
        onClick={openDrop}
        title={`Filter by ${props.label}`}
        className={`rounded p-0.5 transition-colors hover:bg-gray-200 ${
          active ? "text-blue-600" : "text-gray-400"
        }`}
      >
        <ListFilter
          size={11}
          className={active ? "fill-blue-100 stroke-blue-600" : ""}
        />
      </button>
      {mounted && open && createPortal(dropdown, document.body)}
    </span>
  );
}
