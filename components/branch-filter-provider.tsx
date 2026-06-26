"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

interface BranchFilterContextValue {
  activeBranches: string[];
  setActiveBranches: (branches: string[]) => Promise<void>;
  allBranches: string[];
  isLoaded: boolean;
}

const BranchFilterContext = createContext<BranchFilterContextValue>({
  activeBranches: [],
  setActiveBranches: async () => {},
  allBranches: [],
  isLoaded: false,
});

export function BranchFilterProvider({ children }: { children: React.ReactNode }) {
  const [activeBranches, setActiveBranchesState] = useState<string[]>([]);
  const [allBranches, setAllBranches] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/app-settings").then(r => r.json()),
      fetch("/api/transactions/filter-options").then(r => r.json()),
    ]).then(([settings, opts]) => {
      setActiveBranchesState(settings.active_branches ?? []);
      setAllBranches(opts.branch ?? []);
      setIsLoaded(true);
    }).catch(console.error);
  }, []);

  const setActiveBranches = useCallback(async (branches: string[]) => {
    setActiveBranchesState(branches);
    await fetch("/api/app-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active_branches: branches }),
    });
  }, []);

  return (
    <BranchFilterContext.Provider value={{ activeBranches, setActiveBranches, allBranches, isLoaded }}>
      {children}
    </BranchFilterContext.Provider>
  );
}

export function useActiveBranches() {
  return useContext(BranchFilterContext);
}

// Merges the global active-branch restriction with a local branch selection.
//   global=[]  → no restriction   → return local as-is
//   local=[]   → no local filter  → return global (the global restriction applies)
//   both set   → intersection     → only branches present in BOTH
export function mergeWithGlobal(global: string[], local: string[]): string[] {
  if (global.length === 0) return local;
  if (local.length === 0) return global;
  const g = new Set(global);
  return local.filter(b => g.has(b));
}
