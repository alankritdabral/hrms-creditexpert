# Credit Expert HRMS — Enterprise Human Resource Management System

A modern, cloud-native Human Resource Management System (HRMS) built for enterprise workforce management, statutory compliance, multi-branch attendance, multi-tier payroll, and end-to-end employee lifecycles.

[![Next.js](https://img.shields.io/badge/Next.js-16.4.2-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.3.0-blue?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![Firebase Firestore](https://img.shields.io/badge/Firebase-Firestore-FFCA28?style=flat&logo=firebase)](https://firebase.google.com/)
[![Cloudinary](https://img.shields.io/badge/Cloudinary-KYC_Storage-3448C5?style=flat&logo=cloudinary)](https://cloudinary.com/)

---

## 🌟 Key Features & Modules

- **🏢 Employee Directory & Profile Lifecycle**: Complete 360° employee master with personal, statutory (PAN, Aadhaar, UAN, ESIC), and banking details with sensitive data masking.
- **🕒 Attendance & Geofenced Punching**: Clock-in/out engine supporting office geofencing (latitude/longitude + allowed radius) and branch IP restriction safeguards.
- **📅 Leaves & Approvals Workflow**: Multi-type leave allocations (Casual, Sick, Earned, Unpaid), balance tracking, and manager approval queues.
- **💰 Multi-Tier Indian Statutory Payroll Engine**: Automated calculations for Basic Pay, HRA, Special Allowance, PF (12% employee/employer caps), ESIC, Professional Tax (PT), and Tax Deducted at Source (TDS).
- **📄 Digital Payslip Generation**: On-demand printable and downloadable salary slips with breakdown of earnings, deductions, and net pay.
- **📈 Performance & Loan Conversion Incentives**: Volume-based, tiered commission, and percentage-based incentive calculation schemes.
- **🗂️ Mandatory KYC Document Verification**: Multi-file document upload (Aadhaar, PAN, Passbook, Photograph) with strict 2 MB limit verification and Cloudinary cloud storage.
- **🔐 Decoupled RBAC & Single-Session Auth**: Granular role-based access control (`SUPER_ADMIN`, `ADMIN`, `HR_MANAGER`, `MANAGER`, `EMPLOYEE`), single active device session heartbeat, and cryptographic OTP email verification.
- **💻 Asset & Inventory Management**: IT asset assignment, serial number tracking, condition grading, and allocation lifecycle.
- **📢 Company Announcements & Holiday Calendar**: Multi-branch holiday calendars and global broadcast feeds.
- **📑 Audit Trails & System Ledger**: Immutable, chronological audit logging for sensitive actions, payroll runs, and profile edits.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Framework** | [Next.js](https://nextjs.org/) 16 (App Router) with [React 19](https://react.dev/) |
| **Language** | [TypeScript](https://www.typescriptlang.org/) (Strict typing) |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) & [Lucide React](https://lucide.dev/) icons |
| **Database** | [Google Cloud Firestore](https://firebase.google.com/docs/firestore) |
| **Media & KYC Storage** | [Cloudinary](https://cloudinary.com/) with local fallback |
| **Email & OTP Delivery** | [Nodemailer](https://nodemailer.com/) (SMTP / Gmail App Password) |

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: `v20.x` or higher
- **npm**: `v10.x` or higher (or `pnpm` / `yarn` / `bun`)
- **Firebase Project**: A Google Cloud Firebase project with Firestore enabled.
- **Cloudinary Account**: For KYC document uploads.
- **SMTP Account**: For transactional emails (e.g. Gmail App Password).

### 2. Installation

Clone the repository and install the dependencies:

```bash
git clone https://github.com/alankritdabral/hrms-creditexpert.git
cd hrms-creditexpert
npm install
```

### 3. Environment Configuration

Create your `.env.local` file by copying the template:

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in your actual credentials:

```env
# Firebase / Firestore Client Configuration
NEXT_PUBLIC_FIREBASE_API_KEY="AIzaSy..."
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your-app.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="your-app"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your-app.firebasestorage.app"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="1234567890"
NEXT_PUBLIC_FIREBASE_APP_ID="1:1234567890:web:abcdef"

# Cloudinary KYC Storage
CLOUDINARY_CLOUD_NAME="your_cloud_name"
CLOUDINARY_API_KEY="your_api_key"
CLOUDINARY_API_SECRET="your_api_secret"

# SMTP Transactional Mail (Gmail or custom SMTP)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER="your-email@example.com"
SMTP_PASS="your-16-char-app-password"
SMTP_FROM="your-email@example.com"

# App Base URL
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 4. Running the Development Server

Start the Next.js development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Seeding Initial Demo Data (Optional)

To initialize sample branches, departments, policies, and demo users in your Firestore database, visit:

```
http://localhost:3000/api/firestore/seed
```
*(Available in development mode for initial database seeding)*

---

## 📁 Repository Structure

```
hrms/
├── CODEBASE_DOCUMENTATION.md   # Comprehensive architectural and functional documentation
├── README.md                   # Project overview & quickstart guide
├── firestore.rules             # Cloud Firestore security rules
├── firebase.json               # Firebase configuration
├── .firebaserc                 # Firebase project mapping
├── .env.example                # Sanitized environment variable template
├── public/                     # Static assets, branding, and icons
└── src/
    ├── app/                    # Next.js App Router (pages and API routes)
    │   ├── api/                # REST API endpoints (Auth, Payroll, Attendance, etc.)
    │   ├── attendance/         # Attendance punch-in & tracking views
    │   ├── dashboard/          # Role-aware executive & employee dashboards
    │   ├── employees/          # Employee directory & profile views
    │   ├── leaves/             # Leave application & balance tracking
    │   ├── payroll/            # Monthly payroll processing & disbursement
    │   ├── payslips/           # Digital salary slips
    │   ├── register/           # Multi-step self-onboarding wizard with KYC
    │   └── ...
    ├── components/             # Reusable UI & layout components
    │   ├── dashboard/          # Admin and employee dashboard widgets
    │   ├── employees/          # Employee modals and profile forms
    │   ├── layout/             # Header, Sidebar, and AppShell
    │   └── ui/                 # Modals, Badges, Buttons, StatCards
    └── lib/                    # Shared core business logic
        ├── auth-context.tsx    # Client authentication context & session guard
        ├── cloudinary.ts       # KYC upload handler with local fallback
        ├── email.ts            # Nodemailer transactional email delivery
        ├── firebase.ts         # Firebase client initialization
        ├── firestore-service.ts# Firestore data layer & collection operations
        ├── payroll-engine.ts   # Indian statutory payroll calculation logic
        ├── permissions.ts      # RBAC definitions and route guard matrices
        └── types.ts            # Complete TypeScript types and domain entities
```

---

## 🔒 Security Best Practices

1. **Environment Variables**: Never commit `.env` or `.env.local` files to Git. The `.gitignore` is preconfigured to prevent secret leakage.
2. **KYC Documents**: All KYC documents are stored securely in Cloudinary. Local upload fallbacks (`public/uploads`) are ignored from Git.
3. **Data Masking**: Sensitive fields like PAN, Aadhaar, Bank Account Numbers, and UAN are masked client-side for unauthorized roles.
4. **Firestore Security**: Production rules in `firestore.rules` restrict read and write access to authenticated users.

---

## 📖 In-Depth Documentation

For detailed functional specifications, mathematical models for payroll, architectural flowcharts, and complete REST API contracts, consult [`CODEBASE_DOCUMENTATION.md`](./CODEBASE_DOCUMENTATION.md).

---

## 📄 License

Internal proprietary software for Credit Expert India. All rights reserved.
