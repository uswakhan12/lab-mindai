import { Link } from "@tanstack/react-router";
import { Atom } from "lucide-react";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/70 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="relative">
            <Atom className="h-7 w-7 text-primary transition-transform group-hover:rotate-180 duration-700" strokeWidth={1.75} />
            <div className="absolute inset-0 blur-md bg-primary/40 -z-10" />
          </div>
          <span className="font-display text-xl font-semibold tracking-tight">
            Lab<span className="text-primary">Mind</span>
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#how" className="hover:text-foreground transition-colors">How it Works</a>
          <a href="#examples" className="hover:text-foreground transition-colors">Examples</a>
          <a href="#about" className="hover:text-foreground transition-colors">About</a>
        </nav>
      </div>
    </header>
  );
}
