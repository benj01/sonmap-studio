export function Footer() {
  return (
    <footer className="border-t py-6">
      <div className="container flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} Your App. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
