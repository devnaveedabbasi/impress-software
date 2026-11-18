import type { ReactNode } from "react";
import { PrintButton } from "@/components/print/PrintButton";

// Every print page (lists, slips and reports) goes through here, so all of them look like the Inventory print:
//   on the screen: a grey background, a Print button, and the white sheet of the page;
//   on the paper: the sheet only.
//
// A browser prints a small line at the top (date and page title) and at the bottom (the web address and
// "page 1/2") of every paper. A page cannot switch that off, except by having no paper margin at all. So the paper
// margin is 0 and the space around the text is made here instead: an empty row at the top and at the bottom of a
// table, which a browser repeats on every paper, and some space at the sides. The result is a clean paper with no
// date, title or address on it, and the same margins on every page.
export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-100 px-4 py-8 print:min-h-0 print:bg-white print:p-0">
      <style>{`@media print { @page { size: A4; margin: 0; } }`}</style>
      <PrintButton />
      <table className="w-full border-collapse border-0">
        <thead>
          <tr>
            <td className="h-0 border-0 p-0 print:h-[12mm]" />
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border-0 p-0 align-top print:px-[12mm]">{children}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td className="h-0 border-0 p-0 print:h-[12mm]" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
