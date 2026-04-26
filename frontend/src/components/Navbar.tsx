import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Atom, Moon, Sun, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyTheme, getStoredTheme, setTheme, type ThemeMode } from "@/lib/theme";
import { getStoredSfx, setStoredSfx, type SfxMode } from "@/lib/sfx";

type HomeSectionId = "how" | "examples" | "about";

function HomeSectionLink({
  sectionId,
  className,
  children,
}: {
  sectionId: HomeSectionId;
  className: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <a
      href={`/#${sectionId}`}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        // On `/` with no hash, TanStack's same-route <Link hash> can no-op, so the hash never
        // updates. Setting `location.hash` first click fixes the URL; other routes use navigate.
        if (pathname === "/") {
          if (window.location.hash !== `#${sectionId}`) {
            window.location.hash = sectionId;
          }
        } else {
          void navigate({ to: "/", hash: sectionId });
        }
        requestAnimationFrame(() => {
          document
            .getElementById(sectionId)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }}
    >
      {children}
    </a>
  );
}

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
    <header className="sticky top-0 z-50 w-full border-b-2 border-cyan-500/35 bg-gradient-to-r from-cyan-950/30 via-slate-900/25 to-violet-950/30 backdrop-blur-xl dark:from-cyan-950/30 dark:via-slate-950/30 dark:to-violet-950/30 light:from-sky-100/8 light:via-white light:to-fuchsia-100/8 light:border-cyan-400/35 light:bg-white/9">
      <div
        className="h-0.5 w-full bg-gradient-to-r from-cyan-500 via-sky-400 to-fuchsia-500"
        aria-hidden
      />
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="relative">
            <Atom
              className="h-7 w-7 text-cyan-400 dark:text-cyan-300 light:text-cyan-700 group-hover:text-fuchsia-400 dark:group-hover:text-fuchsia-300 light:group-hover:text-fuchsia-700 transition-transform group-hover:rotate-180 duration-700"
              strokeWidth={1.75}
            />
            <div className="absolute inset-0 blur-md bg-cyan-500/30 -z-10" />
          </div>
          <span className="font-display text-xl font-semibold tracking-tight text-gradient-wordmark">
            LabMind
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <HomeSectionLink
            sectionId="how"
            className="hover:text-cyan-400 light:hover:text-cyan-700 transition-colors"
          >
            How it Works
          </HomeSectionLink>
          <HomeSectionLink
            sectionId="examples"
            className="hover:text-fuchsia-400 light:hover:text-fuchsia-800 transition-colors"
          >
            Examples
          </HomeSectionLink>
          <HomeSectionLink
            sectionId="about"
            className="hover:text-violet-300 light:hover:text-violet-800 transition-colors"
          >
            About
          </HomeSectionLink>
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
