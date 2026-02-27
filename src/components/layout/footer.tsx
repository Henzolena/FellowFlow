export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} FellowFlow. All rights reserved.</p>
      </div>
    </footer>
  );
}
