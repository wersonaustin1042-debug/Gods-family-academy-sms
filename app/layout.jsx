import "./globals.css";

export const metadata = {
  title: "Barima Duah Memorial School — Management System",
  description: "Enrollment, attendance, and fees for Barima Duah Memorial School",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
