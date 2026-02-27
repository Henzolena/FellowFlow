import Link from "next/link";
import { Shield } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-col items-center gap-4 text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} FellowFlow. All rights reserved.</p>
          <Link 
            href="/admin" 
            className="flex items-center gap-1.5 text-xs opacity-50 hover:opacity-100 transition-opacity"
            title="Admin Portal"
          >
            <Shield className="h-3 w-3" />
            <span>Admin</span>
          </Link>
        </div>
      </div>
    </footer>
  );
}
