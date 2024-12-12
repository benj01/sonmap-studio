export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="flex flex-col flex-1 bg-background p-4">
      {children}
    </main>
  )
}
