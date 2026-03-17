import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "lavender" | "aurora" | "system";

export interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

export interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const initialState: ThemeProviderState = {
  theme: "lavender",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "lavender",
  storageKey = "xylkstream-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
  );

  useEffect(() => {
    const root = window.document.documentElement;

    // remove legacy classes if any
    root.classList.remove("light", "dark");

    // remove existing data-theme
    root.removeAttribute("data-theme");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "aurora"
        : "lavender";

      root.setAttribute("data-theme", systemTheme);
      // for legacy tailwind dark mode support if needed
      if (systemTheme === "aurora") root.classList.add("dark");

      // listen for system theme changes
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e: MediaQueryListEvent) => {
        const newSystemTheme = e.matches ? "aurora" : "lavender";
        root.setAttribute("data-theme", newSystemTheme);
        root.classList.remove("light", "dark");
        if (newSystemTheme === "aurora") root.classList.add("dark");
      };
      
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    root.setAttribute("data-theme", theme);
    if (theme === "aurora") root.classList.add("dark");
  }, [theme]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
