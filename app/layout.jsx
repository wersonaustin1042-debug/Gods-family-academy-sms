import "./globals.css";
import PushManager from "@/components/PushManager";

export const metadata = {
  title: "God's Family Academy — Management System",
  description: "Enrollment, attendance, and fees for God's Family Academy",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PushManager />
      </body>
    </html>
  );
}
