// Sends ONE test copy of the evening login-progress email, built from made-up sample data (no real
// customers or employees). Usage:
//   node --env-file=.env.local --experimental-strip-types scripts/send-test-login-report.mjs you@example.com [--preview]
// --preview writes the HTML to scripts/test-login-report.preview.html instead of sending.
import nodemailer from "nodemailer";
import { writeFileSync } from "node:fs";
import { buildDailyLoginReport, renderDailyLoginReport } from "../src/lib/daily-login-report.ts";

const to = process.argv[2];
const preview = process.argv.includes("--preview");
if (!to && !preview) {
  console.error("Give the address to send to.");
  process.exit(1);
}

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const month = today.slice(0, 7);
const day = (n) => `${month}-${String(Math.max(1, Math.min(Number(today.slice(8)), n))).padStart(2, "0")}`;
const base = { phone: "9999999999", product: "PL", amount: 500000 };
const sample = [
  { ...base, customerName: "SAMPLE CUSTOMER ONE", date: day(2), time: "11:10", bankName: "AXIS BANK", loginId: "AX1001", status: "DISBURSED", amount2: 450000, remarks: "ROI - 11% PF 9000", insuranceDetails: "5000 - 5 YEARS" },
  { ...base, customerName: "SAMPLE CUSTOMER TWO", date: day(3), time: "15:30", bankName: "HDFC BANK", loginId: "HD2002", product: "BL", status: "APPROVED", remarks: "Sanction letter awaited" },
  { ...base, customerName: "SAMPLE CUSTOMER THREE", date: day(5), time: "12:00", bankName: "ICICI BANK", loginId: "IC3003", product: "HL", amount: 2500000, status: "REJECT", remarks: "Low CIBIL" },
  { ...base, customerName: "SAMPLE CUSTOMER FOUR", date: today, time: "10:15", bankName: "AXIS BANK", loginId: "AX4004", status: "LOGIN", remarks: "Docs pending" },
  { ...base, customerName: "SAMPLE CUSTOMER FOUR", date: today, time: "10:20", bankName: "HDFC BANK", loginId: "HD4005", status: "SENT", remarks: "Link sent" },
  { ...base, customerName: "SAMPLE CUSTOMER FIVE", date: today, time: "14:05", bankName: "BAJAJ FINANCE", loginId: "BF5006", product: "LAP", amount: 3000000, status: "LOGIN", remarks: "ROI - 9.5%", insuranceDetails: "12000 - 3 YEARS", amount2: 2800000 },
];
const mail = renderDailyLoginReport(buildDailyLoginReport("Sample Employee", sample, today), { isTest: true });

if (preview) {
  writeFileSync(new URL("./test-login-report.preview.html", import.meta.url), mail.html);
  console.log("Wrote scripts/test-login-report.preview.html");
} else {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT, SMTP_SECURE, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.error("SMTP_HOST, SMTP_USER and SMTP_PASS must be set (run with --env-file=.env.local).");
    process.exit(1);
  }
  const transporter = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT) || 587, secure: SMTP_SECURE === "true", auth: { user: SMTP_USER, pass: SMTP_PASS } });
  const info = await transporter.sendMail({ from: SMTP_FROM || SMTP_USER, to, subject: mail.subject, html: mail.html, text: mail.text });
  console.log("Sent:", info.messageId, "accepted:", info.accepted.join(", "), "rejected:", info.rejected.join(", ") || "none");
}
