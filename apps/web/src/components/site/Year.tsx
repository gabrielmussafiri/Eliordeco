"use client";

// Streamé dans <Suspense> : la date courante n'est pas figée dans le HTML prérendu.
export function Year() {
  return <>{new Date().getFullYear()}</>;
}
