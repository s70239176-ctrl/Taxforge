import { createHash } from "crypto";
import { nanoid } from "nanoid";
import PDFDocument from "pdfkit";
import type { ClassifiedTransaction, CostBasisMethod, Jurisdiction, TaxReport } from "../tax/types";
import { mockOkxPaymentAdapter } from "../chain/xlayer";

/**
 * Canonical JSON stringify (sorted keys) so the same report data always
 * hashes identically regardless of object key insertion order.
 */
function canonicalJson(value: unknown): string {
  const sortKeys = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, val]) => [k, sortKeys(val)])
      );
    }
    return v;
  };
  return JSON.stringify(sortKeys(value));
}

export function hashReportPayload(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");
}

export function buildReport(params: {
  jurisdiction: Jurisdiction;
  method: CostBasisMethod;
  periodStart: string;
  periodEnd: string;
  walletAddress: string;
  transactions: ClassifiedTransaction[];
  totalRealizedGainUsd: number;
  totalOrdinaryIncomeUsd: number;
  totalEstimatedTaxUsd: number;
}): TaxReport {
  const id = `rpt_${nanoid(10)}`;
  const generatedAt = new Date().toISOString();

  const base = {
    id,
    jurisdiction: params.jurisdiction,
    method: params.method,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    walletAddress: params.walletAddress,
    transactionCount: params.transactions.length,
    totalRealizedGainUsd: round2(params.totalRealizedGainUsd),
    totalOrdinaryIncomeUsd: round2(params.totalOrdinaryIncomeUsd),
    totalEstimatedTaxUsd: round2(params.totalEstimatedTaxUsd),
    transactions: params.transactions,
    generatedAt,
  };

  const attestationHash = hashReportPayload(base);

  return {
    ...base,
    attestationHash,
    status: "DRAFT",
  };
}

/** Anchors a report's attestation hash on X Layer, returning the updated report. */
export async function anchorReport(report: TaxReport): Promise<TaxReport> {
  const { txHash } = await mockOkxPaymentAdapter.anchorHash({
    hashHex: report.attestationHash,
    reportId: report.id,
  });
  return { ...report, anchorTxHash: txHash, status: "ANCHORED" };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Renders a TaxReport to a PDF buffer — one summary page plus a dense
 * transaction ledger, styled to match the product's institutional-dark
 * report aesthetic when printed (monochrome-safe for accountant handoff).
 */
export async function renderReportPdf(report: TaxReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(18).text("TaxForge — Verifiable Tax Report", { continued: false });
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(9).fillColor("#555")
      .text(`Report ID ${report.id}  ·  Generated ${report.generatedAt}`);
    doc.moveDown(1);

    doc.fillColor("#000").fontSize(11).font("Helvetica-Bold").text("Summary");
    doc.font("Helvetica").fontSize(10);
    const rows: [string, string][] = [
      ["Jurisdiction", report.jurisdiction],
      ["Cost-basis method", report.method],
      ["Period", `${report.periodStart.slice(0, 10)} → ${report.periodEnd.slice(0, 10)}`],
      ["Wallet", report.walletAddress],
      ["Transactions covered", String(report.transactionCount)],
      ["Total realized capital gain", `$${report.totalRealizedGainUsd.toLocaleString()}`],
      ["Total ordinary/business income", `$${report.totalOrdinaryIncomeUsd.toLocaleString()}`],
      ["Total estimated tax", `$${report.totalEstimatedTaxUsd.toLocaleString()}`],
      ["Status", report.status],
    ];
    rows.forEach(([k, v]) => doc.text(`${k}:  ${v}`));

    doc.moveDown(1);
    doc.font("Helvetica-Bold").fontSize(11).text("Attestation");
    doc.font("Courier").fontSize(8).fillColor("#333").text(report.attestationHash);
    if (report.anchorTxHash) {
      doc.font("Helvetica").fontSize(9).fillColor("#000").text(`Anchored on X Layer: ${report.anchorTxHash}`);
    }

    doc.moveDown(1.2);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#000").text("Transaction Ledger");
    doc.moveDown(0.4);
    doc.font("Courier").fontSize(7.5);
    report.transactions.slice(0, 500).forEach((tx) => {
      const line = `${tx.timestamp.slice(0, 10)}  ${tx.chain.padEnd(10)}  ${tx.category.padEnd(14)}  ${tx.direction.padEnd(3)}  ${tx.asset.padEnd(6)}  ${tx.amount.toString().padEnd(14)}  $${tx.priceUsdAtTx.toFixed(4)}`;
      doc.text(line);
    });

    doc.end();
  });
}
