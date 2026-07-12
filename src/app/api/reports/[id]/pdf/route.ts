import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { renderReportPdf } from "@/lib/reports/generate";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wallet = req.nextUrl.searchParams.get("wallet") ?? "0xe8651e5faf1cfeabd196f3f8998d2da8b8b22bc2";
  const store = getStore();
  const reports = await store.getReports(wallet);
  const report = reports.find((r) => r.id === id);
  if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const pdf = await renderReportPdf(report);
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="taxforge-${report.id}.pdf"`,
    },
  });
}
