export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function PlatformStoresLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
