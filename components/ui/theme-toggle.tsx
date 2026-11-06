"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Segmented } from "@/components/ui/tabs";

export type ThemeChoice = "light" | "dark" | "system";
const KEY = "wendapply-theme";

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  const dark = choice === "dark" || (choice === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.add("theme-switching");
  if (dark) root.setAttribute("data-theme", "dark"); else root.removeAttribute("data-theme");
  window.setTimeout(() => root.classList.remove("theme-switching"), 300);
}

/** Persisted light / dark / system switch (localStorage, applied before paint by the script in app/layout.tsx). */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "light" || saved === "dark" || saved === "system") setChoice(saved);
  }, []);

  useEffect(() => {
    if (choice !== "system") return;
    const query = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [choice]);

  function change(next: ThemeChoice) {
    setChoice(next);
    localStorage.setItem(KEY, next);
    apply(next);
  }

  return (
    <Segmented<ThemeChoice>
      label="Darstellung"
      value={choice}
      onChange={change}
      options={[
        { value: "light", label: "Hell", icon: <span className="hidden min-[400px]:inline-flex"><Sun size={14} /></span> },
        { value: "dark", label: "Dunkel", icon: <span className="hidden min-[400px]:inline-flex"><Moon size={14} /></span> },
        { value: "system", label: "Automatisch", icon: <span className="hidden min-[400px]:inline-flex"><Monitor size={14} /></span> },
      ]}
    />
  );
}
