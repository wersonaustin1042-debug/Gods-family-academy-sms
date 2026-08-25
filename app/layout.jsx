import "./globals.css";

export const metadata = {
  title: "God's Family Academy — Management System",
  description: "Enrollment, attendance, and fees for God's Family Academy",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
