export default function Map3DLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-full">
      {children}
    </div>
  );
}

export const metadata = {
  title: '3D Map Example - SonMap Studio',
  description: 'Example of 3D map functionality using CesiumJS in SonMap Studio',
}; 