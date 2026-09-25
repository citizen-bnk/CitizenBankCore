export const metadata = { title: "Citizen Bank Core API", robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body style={{ fontFamily: "system-ui", background: "#0b0718", color: "#eee" }}>{children}</body></html>);
}
