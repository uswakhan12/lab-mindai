import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Atom, Moon, Sun, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyTheme, getStoredTheme, setTheme, type ThemeMode } from "@/lib/theme";
import { getStoredSfx, setStoredSfx, type SfxMode } from "@/lib/sfx";

export function Navbar() {
  const [theme, setThemeState] = useState<ThemeMode>("dark");
  const [sfx, setSfx] = useState<SfxMode>("on");

  useEffect(() => {
    const current = getStoredTheme();
    setThemeState(current);
    applyTheme(current);
    setSfx(getStoredSfx());
  }, []);

  const toggleTheme = () => {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setThemeState(next);
    setTheme(next);
  };
  const toggleSfx = () => {
    const next: SfxMode = sfx === "on" ? "off" : "on";
    setSfx(next);
    setStoredSfx(next);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/90">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="relative">
            <Atom
              className="h-7 w-7 text-primary transition-transform group-hover:rotate-180 duration-700"
              strokeWidth={1.75}
            />
            <div className="absolute inset-0 blur-md bg-primary/40 -z-10" />
          </div>
          <span className="font-display text-xl font-semibold tracking-tight">
            Lab<span className="text-primary">Mind</span>
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#how" className="hover:text-foreground transition-colors">
            How it Works
          </a>
          <a href="#examples" className="hover:text-foreground transition-colors">
            Examples
          </a>
          <a href="#about" className="hover:text-foreground transition-colors">
            About
          </a>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleSfx}
            className="h-8 px-2.5"
            title={sfx === "on" ? "Mute click sound" : "Enable click sound"}
          >
            {sfx === "on" ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={toggleTheme} className="h-8 px-2.5">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </nav>
        <div className="md:hidden flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleSfx}
            className="h-8 px-2.5"
            title={sfx === "on" ? "Mute click sound" : "Enable click sound"}
          >
            {sfx === "on" ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={toggleTheme} className="h-8 px-2.5">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}
