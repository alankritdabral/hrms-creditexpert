import { describe, expect, it } from "vitest";
import { buildDailyLoginReport, loanTypeName, renderDailyLoginReport, type ReportRow } from "./daily-login-report";

const row = (o: Partial<ReportRow>): ReportRow => ({
  customerName: "AMIT",
  phone: "9999999999",
  date: "2026-11-06",
  time: "10:00",
  bankName: "HDFC BANK",
  product: "PL",
  amount: 100000,
  status: "SENT",
  ...o,
});

const rows: ReportRow[] = [
  row({ date: "2026-11-02", customerName: "RAVI", phone: "9111111111", bankName: "AXIS BANK", status: "LOGIN" }),
  row({ date: "2026-11-04", customerName: "RAVI", phone: "9111111111", bankName: "HDFC BANK", status: "DISBURSED", amount: 200000, amount2: 150000 }),
  row({ date: "2026-11-06", time: "12:00", customerName: "SITA", phone: "9222222222", bankName: "HDFC BANK", status: "SENT", product: "HL" }),
  row({ date: "2026-11-06", time: "09:00", customerName: "SITA", phone: "9222222222", bankName: "ICICI BANK", status: "SENT" }),
  row({ date: "2026-11-06", time: "11:00", customerName: "GITA", phone: "9333333333", bankName: "HDFC BANK", status: "REJECT" }),
  row({ date: "2026-10-30", customerName: "OLD", bankName: "HDFC BANK", status: "DISBURSED" }), // last month
  row({ date: "2026-11-07", customerName: "FUTURE", bankName: "HDFC BANK" }), // after today
];

describe("buildDailyLoginReport", () => {
  const r = buildDailyLoginReport("Shourya", rows, "2026-11-06");

  it("counts only this month up to today", () => {
    expect(r.files).toBe(5);
    expect(r.customers).toBe(3);
    expect(r.totalAmount).toBe(100000 * 4 + 200000);
  });
  it("counts customers once and logged-in customers past SENT", () => {
    expect(r.loggedInCustomers).toBe(2); // RAVI (LOGIN, DISBURSED) and GITA (REJECT); SITA is only SENT
  });
  it("uses Amount 2 for disbursed files", () => expect(r.disbursedAmount).toBe(150000));
  it("last login date is the latest file past SENT", () => expect(r.lastLoginDate).toBe("2026-11-06"));
  it("summarises each bank with its statuses, busiest first", () => {
    expect(r.banks[0]).toMatchObject({ bank: "HDFC BANK", files: 3, statuses: { DISBURSED: 1, SENT: 1, REJECT: 1 } });
    expect(r.banks.map((b) => b.bank)).toEqual(["HDFC BANK", "AXIS BANK", "ICICI BANK"]);
  });
  it("CIBIL count is today's distinct customers, and today's rows are in time order", () => {
    expect(r.cibilToday).toBe(2);
    expect(r.todayRows.map((x) => x.time)).toEqual(["09:00", "11:00", "12:00"]);
  });
  it("has no last login date when everything is still SENT", () => {
    expect(buildDailyLoginReport("X", [row({})], "2026-11-06").lastLoginDate).toBeNull();
  });
});

describe("loanTypeName", () => {
  it("expands loan codes and keeps unknown ones", () => {
    expect(loanTypeName("PL")).toBe("Personal Loan");
    expect(loanTypeName("car loan")).toBe("Car Loan");
    expect(loanTypeName("GOLD")).toBe("GOLD");
  });
});

describe("renderDailyLoginReport", () => {
  const report = buildDailyLoginReport("Shourya", rows, "2026-11-06");

  it("includes the requested columns and figures", () => {
    const { subject, html, text } = renderDailyLoginReport(report);
    expect(subject).toBe("Login progress for Shourya: 6 Nov 2026");
    for (const h of ["Customer name", "Number", "Date", "Bank", "Login ID", "Product", "Amount", "Status", "Remarks", "Insurance", "Amount 2"]) {
      expect(html).toContain(h);
    }
    expect(html).toContain("CIBILs pulled today");
    expect(html).toContain("Last login date");
    expect(html).toContain("Home Loan");
    expect(html).toContain("06-11-2026");
    expect(text).toContain("CIBILs pulled today: 2");
  });
  it("marks a test email", () => {
    const mail = renderDailyLoginReport(report, { isTest: true });
    expect(mail.subject.startsWith("[TEST] ")).toBe(true);
    expect(mail.html).toContain("TEST EMAIL");
  });
  it("escapes names and remarks", () => {
    const evil = buildDailyLoginReport("<b>Sho</b>", [row({ customerName: "<script>x</script>", remarks: '"><img src=x>' })], "2026-11-06");
    const { html } = renderDailyLoginReport(evil);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x>");
    expect(html).not.toContain("<b>Sho</b>");
  });
  it("says so when there is nothing today", () => {
    const quiet = buildDailyLoginReport("Shourya", [row({ date: "2026-11-02", status: "LOGIN" })], "2026-11-06");
    expect(renderDailyLoginReport(quiet).html).toContain("did not add any logins today");
  });
});
