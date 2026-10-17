export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SurchargingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
