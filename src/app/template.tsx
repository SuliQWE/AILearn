// template.tsx пересоздаётся при каждом переходе между страницами — отсюда плавное появление страниц.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
