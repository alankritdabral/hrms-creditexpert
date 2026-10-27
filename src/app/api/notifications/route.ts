import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authFailureResponse } from "@/lib/api-auth";
import {
  getEmployees,
  getLeaveRequests,
  getRequests,
  getOnboardingRecords,
  getPayrollRuns,
  getDocuments,
  getAnnouncements,
  getAttendanceRecords,
  getEmployeeLogins,
  getHolidays,
} from "@/lib/db/db-adapter";

export interface NotificationItem {
  id: string;
  type:
    | "attendance"
    | "leave"
    | "request"
    | "payroll"
    | "document"
    | "onboarding"
    | "announcement"
    | "login"
    | "holiday";
  title: string;
  desc: string;
  time: string;
  href: string;
  urgent?: boolean;
}

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  try {
    const today = new Date().toISOString().split("T")[0];
    const currentMonth = today.slice(0, 7);

    // Fetch live data in parallel
    const [
      employees,
      leaves,
      requests,
      onboarding,
      payrollRuns,
      documents,
      announcements,
      todayAttendance,
      logins,
      holidays,
    ] = await Promise.all([
      getEmployees(),
      getLeaveRequests(),
      getRequests(),
      getOnboardingRecords("All"),
      getPayrollRuns(),
      getDocuments(),
      getAnnouncements(),
      getAttendanceRecords(today),
      getEmployeeLogins(currentMonth),
      getHolidays("All"),
    ]);

    const activeEmployeesCount = employees.filter(
      (e) => !["Exited", "Terminated", "Resigned"].includes(e.employment?.employmentStatus)
    ).length;

    const activeOnboardingCount = onboarding.filter(
      (o) => o.status !== "Completed" && o.status !== "Rejected"
    ).length;

    const pendingLeaves = leaves.filter((l) => l.status === "Pending");
    const pendingRequests = requests.filter((r) => r.status === "Pending");

    const latestPayroll = payrollRuns[0];
    const isPayrollNeedsReview =
      Boolean(latestPayroll) &&
      ["DRAFT", "HR_REVIEW", "CALCULATED", "ATTENDANCE_LOCKED"].includes(latestPayroll.status);

    const now = new Date();
    const expiringDocs = documents.filter((d) => {
      if (!d.expiryDate) return false;
      const exp = new Date(d.expiryDate);
      const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 45;
    });

    const totalLoginsFiles = logins.reduce((acc, l) => acc + (l.loginsCount || 0), 0);
    const totalDisbursals = logins.reduce((acc, l) => acc + (l.totalDisbursal || 0), 0);

    const counts = {
      employees: activeEmployeesCount || employees.length,
      activeOnboarding: activeOnboardingCount,
      pendingLeaves: pendingLeaves.length,
      pendingRequests: pendingRequests.length,
      payrollReview: isPayrollNeedsReview,
      payrollStatus: latestPayroll?.status || null,
      payrollPeriod: latestPayroll?.periodLabel || null,
      expiringDocs: expiringDocs.length,
      announcements: announcements.length,
      loginsCount: totalLoginsFiles,
      totalDisbursals,
    };

    const notifications: NotificationItem[] = [];

    // -------------------------------------------------------------
    // ROLE-SPECIFIC NOTIFICATIONS
    // -------------------------------------------------------------
    if (["admin", "hr"].includes(auth.role)) {
      // 1. Pending Leave Applications
      if (pendingLeaves.length > 0) {
        notifications.push({
          id: `notif-leaves-${pendingLeaves[0].id}`,
          type: "leave",
          title: `${pendingLeaves.length} Pending Leave ${
            pendingLeaves.length === 1 ? "Request" : "Requests"
          }`,
          desc: `${pendingLeaves[0].employeeName} applied for ${pendingLeaves[0].leaveType} (${pendingLeaves[0].days} days)`,
          time: "Action Required",
          href: "/leaves",
          urgent: true,
        });
      }

      // 2. Pending HR Employee Requests
      if (pendingRequests.length > 0) {
        notifications.push({
          id: `notif-req-${pendingRequests[0].id}`,
          type: "request",
          title: `${pendingRequests.length} Pending HR ${
            pendingRequests.length === 1 ? "Request" : "Requests"
          }`,
          desc: `${pendingRequests[0].employeeName}: ${pendingRequests[0].requestType} (${pendingRequests[0].subject})`,
          time: "Review",
          href: "/requests",
          urgent: false,
        });
      }

      // 3. Payroll Review Alert
      if (isPayrollNeedsReview && latestPayroll) {
        notifications.push({
          id: `notif-payroll-${latestPayroll.id}`,
          type: "payroll",
          title: `Payroll ${latestPayroll.periodLabel} is in ${latestPayroll.status}`,
          desc: `Total Net: ₹${(latestPayroll.totalNet / 100000).toFixed(2)}L across ${
            latestPayroll.totalEmployees
          } staff. Pending review & sign-off.`,
          time: "Urgent",
          href: "/payroll",
          urgent: true,
        });
      }

      // 4. Active Onboarding Pipeline
      if (activeOnboardingCount > 0) {
        notifications.push({
          id: `notif-onboard-${onboarding[0].id}`,
          type: "onboarding",
          title: `${activeOnboardingCount} Candidate${
            activeOnboardingCount === 1 ? "" : "s"
          } In Onboarding`,
          desc: `Latest: ${onboarding[0].candidateName} — ${onboarding[0].department} (${onboarding[0].status})`,
          time: "Active",
          href: "/onboarding",
          urgent: false,
        });
      }

      // 5. Expiring Documents or Compliance Alerts
      if (expiringDocs.length > 0) {
        notifications.push({
          id: `notif-doc-${expiringDocs[0].id}`,
          type: "document",
          title: `${expiringDocs.length} Compliance Document Alert`,
          desc: `${expiringDocs[0].employeeName}'s ${expiringDocs[0].title} is expiring soon (${expiringDocs[0].expiryDate}).`,
          time: "Renewal",
          href: "/documents",
          urgent: true,
        });
      }

      // 6. Logins & Loan Disbursals
      if (logins.length > 0) {
        notifications.push({
          id: `notif-logins-${currentMonth}`,
          type: "login",
          title: `${totalLoginsFiles} Loan Files Logged (${currentMonth})`,
          desc: `Total disbursals: ₹${(totalDisbursals / 100000).toFixed(1)} Lakhs tracked across branches.`,
          time: "Sales Hub",
          href: "/logins",
          urgent: false,
        });
      }
    } else {
      // ----------------- EMPLOYEE ROLE NOTIFICATIONS -----------------
      // 1. Clock-In Reminder for today
      const myClockIn = todayAttendance.find((a) => a.employeeId === auth.employeeId);
      if (!myClockIn) {
        notifications.push({
          id: `notif-clockin-${today}`,
          type: "attendance",
          title: "Attendance Clock-In Required",
          desc: "You haven't clocked in yet today. Please mark attendance within your branch boundary.",
          time: "Today",
          href: "/attendance",
          urgent: true,
        });
      }

      // 2. My Leave Status
      const myRecentLeave = leaves.find((l) => l.employeeId === auth.employeeId);
      if (myRecentLeave) {
        notifications.push({
          id: `notif-myleave-${myRecentLeave.id}`,
          type: "leave",
          title: `Leave Application: ${myRecentLeave.status}`,
          desc: `${myRecentLeave.leaveType} (${myRecentLeave.startDate} to ${myRecentLeave.endDate})`,
          time: myRecentLeave.status === "Approved" ? "Approved" : "Notice",
          href: "/leaves",
          urgent: myRecentLeave.status === "Pending",
        });
      }

      // 3. My HR Requests
      const myRecentReq = requests.find((r) => r.employeeId === auth.employeeId);
      if (myRecentReq) {
        notifications.push({
          id: `notif-myreq-${myRecentReq.id}`,
          type: "request",
          title: `Request Status: ${myRecentReq.status}`,
          desc: `${myRecentReq.requestType} — ${myRecentReq.subject}`,
          time: myRecentReq.status,
          href: "/requests",
          urgent: false,
        });
      }

      // 4. Monthly Payslip
      if (latestPayroll && ["FINALIZED", "PAYSLIP_GENERATED", "PAID"].includes(latestPayroll.status)) {
        notifications.push({
          id: `notif-payslip-${latestPayroll.id}`,
          type: "payroll",
          title: `Payslip Available (${latestPayroll.periodLabel})`,
          desc: "Your official monthly payslip is ready for review and download.",
          time: "Recent",
          href: "/payslips",
          urgent: false,
        });
      }
    }

    // ----------------- GENERAL NOTIFICATIONS (ALL USERS) -----------------
    // 1. Latest Announcement
    if (announcements.length > 0) {
      const topAnn = announcements[0];
      notifications.push({
        id: `notif-ann-${topAnn.id}`,
        type: "announcement",
        title: `Notice: ${topAnn.title}`,
        desc: topAnn.description.length > 90 ? `${topAnn.description.slice(0, 90)}...` : topAnn.description,
        time: topAnn.publishDate || "Broadcast",
        href: "/announcements",
        urgent: topAnn.priority === "High",
      });
    }

    // 2. Upcoming Holiday
    const upcomingHolidays = holidays
      .filter((h) => h.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (upcomingHolidays.length > 0) {
      const nextHol = upcomingHolidays[0];
      notifications.push({
        id: `notif-hol-${nextHol.id}`,
        type: "holiday",
        title: `Upcoming Holiday: ${nextHol.name}`,
        desc: `${nextHol.date} (${nextHol.type}) — ${nextHol.description || "Branch holiday"}`,
        time: nextHol.date,
        href: "/holidays",
        urgent: false,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        counts,
        notifications,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
