import type { Metadata } from "next";
import { KitDemo } from "./KitDemo";

export const metadata: Metadata = {
  title: "Design kit · Pickle",
  robots: { index: false, follow: false },
};

// A page that shows every design-kit piece, for checking the look on a phone.
export default function KitPage() {
  return <KitDemo />;
}
