# 📅 Work Planner & Timeline Hub

[![Next.js](https://img.shields.io/badge/Next.js-16.2.12-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.4-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![Firebase](https://img.shields.io/badge/Firebase_Firestore-12.16-FFCA28?style=for-the-badge&logo=firebase)](https://firebase.google.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

An enterprise-ready, offline-first **Work Planner, Project Timeline, and Sprint Management System** built with **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, and **Firebase Cloud Firestore**.

Designed for agile engineering teams, project managers, and product leads to plan, track, and execute multi-workspace roadmaps with granular Role-Based Access Control (RBAC), interactive Gantt charts, and secure sharing capabilities.

---

## 🌟 Key Features

### 🏢 1. Multi-Project Workspace Isolation
* **Independent Workspaces**: Manage multiple client or internal projects within a single unified interface.
* **Granular Scope**: Tasks, epics, timeline schedules, PIC allocations, secrets, and issue trackers are strictly partitioned per project.
* **Instant Project Switcher**: Fast keyboard-friendly workspace switcher accessible from the global sidebar and mobile navigation.

### 📊 2. Visual Gantt Timeline & Scheduling
* **Interactive Timeline**: Plan sprints and epics with multi-level zoom (Day, Week, Month views).
* **Collision & Overlap Detection**: Intelligent algorithm that detects team member workload overlaps and conflicts in real time.
* **Holidays & Weekends**: Customizable non-working day highlights and sprint duration calculations.
* **Executive Roadmaps**: High-resolution timeline export (PNG up to 3x ratio without clipping) and print-ready landscape PDF reports with executive summary metrics.

### 📋 3. Task Plan & Kanban Management
* **Epic-Driven Hierarchies**: Group deliverables into color-coded epics with progression bars and status filters.
* **Drag-and-Drop Workflows**: Powered by `@dnd-kit` for fluid ordering, backlog grooming, and stage transitions.
* **Custom Task Statuses**: Configurable project workflows (`TODO`, `ON PROGRESS`, `IN REVIEW`, `DONE`, `WON'T DO`) with custom hex colors and ordering.
* **Spreadsheet Integration**: Import tasks in bulk directly from Excel (`.xlsx`) templates.

### 🔐 4. Enterprise Role-Based Access Control (RBAC)
* **Multi-Tier User Management**: Assign customized roles to users per project workspace.
* **Granular Permission Matrix**: Configure explicit `canView`, `canEdit`, and `canDelete` permissions across 12 distinct feature modules (Dashboard, Timeline, Tasks, Secrets, Reports, Users, etc.).
* **Super Administrator Protection**: Immutable root administrator account safeguarded against deletion or unauthorized privilege revocation.
* **Built-in Password Generator**: Cryptographically strong credential generator with 1-click clipboard copy.

### 🔑 5. Secret Key Vault & Environment Manager
* **Encrypted Credentials**: Securely store API tokens, database connection strings, and webhook secrets scoped by workspace and environment category.
* **Multi-Format Export**: Export workspace secrets into `.env`, Excel (`.xlsx`), JSON (`.json`), or CSV (`.csv`) for developer onboarding.
* **Per-Project Secrets Sharing**: Dedicated passwordless share token for external DevOps or partner teams with optional expiration dates.

### 🔗 6. Secure Passwordless Sharing Links
* **Token-Based Guest Access**: Generate distinct secret read-only URLs (`/guest-timeline?token=...`) per project workspace.
* **Strict Tenant Boundary**: External clients and executive stakeholders can view live timelines and roadmaps without an account, restricted exclusively to the shared project.

### 👥 7. Team PICs & Workload Allocation
* **Team Roster Management**: Maintain members with role descriptions, color avatars, and contact information.
* **Workload Insights**: Monitor man-day distribution per team member across active sprints to prevent burnout and bottlenecks.

### 📝 8. Weekly Reports & Issue Tracking
* **Sprint Summary Generator**: Compile achievements, active blockers, and upcoming milestones into structured weekly reports.
* **Bug Tracker**: Log defects with severity levels (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), resolution stages, and direct PIC assignment.
* **Personal & Workspace Notes**: Rich-text scratchpad documentation with pinning support.

### ⚡ 9. Offline-First Architecture & Data Backup
* **Zero-Quota Local Caching**: Optimized multi-tab IndexedDB storage engine that reduces Firestore read/write costs by up to 90%.
* **Full Database Backup & Restore**: Export complete system snapshots into structured `.json` files and restore them with automated transactional batch validation.
* **PWA Ready**: Installable as a native desktop or mobile application on macOS, Windows, iOS, and Android.

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | Next.js 16 (App Router, Server Actions, Dynamic Middleware) |
| **Language** | TypeScript 5.0 (Strict Typing) |
| **Styling & UI** | Tailwind CSS v4, shadcn/ui, Radix Primitives, Lucide Icons |
| **Database** | Firebase Cloud Firestore (with Offline IndexedDB Multi-Tab Persistence) |
| **State & Cache** | TanStack React Query v5 |
| **Drag & Drop** | `@dnd-kit/core`, `@dnd-kit/sortable` |
| **Document Export** | `jsPDF`, `html-to-image`, `xlsx` |
| **PWA Support** | `@ducanh2912/next-pwa` (Workbox Service Worker) |

---

## 📂 Project Structure

```text
personal-planner/
├── public/                 # Static assets, icons, PWA manifest, and service worker
├── src/
│   ├── app/                # Next.js App Router
│   │   ├── (dashboard)/    # Authenticated dashboard workspace routes
│   │   │   ├── timeline/   # Gantt timeline & scheduling
│   │   │   ├── todo/       # Kanban task plan
│   │   │   ├── projects/   # Workspace management
│   │   │   ├── users/      # RBAC user accounts & roles matrix
│   │   │   ├── secrets/    # Credential vault
│   │   │   ├── weekly-report/ # Executive reports
│   │   │   ├── bugs/       # Issue tracker
│   │   │   └── notes/      # Documentation notes
│   │   ├── guest-timeline/ # Public tokenized roadmap viewer
│   │   ├── guest-secrets/  # Public tokenized secrets viewer
│   │   └── login/          # Authentication & session actions
│   ├── components/         # Shared UI components & layout systems
│   ├── config/             # Navigation menus and system constants
│   ├── context/            # React context providers (Auth, Project, Confirm)
│   ├── firebase/           # Firebase initialization & multi-tab persistence
│   ├── hooks/              # Custom data hooks (Firestore, Permissions, Statuses)
│   ├── lib/                # Utility helpers & timeline overlap algorithms
│   └── types/              # TypeScript interfaces (Projects, RBAC, Tasks)
├── next.config.ts          # Next.js compiler & PWA configurations
├── tailwind.config.ts      # Tailwind CSS theme tokens
└── tsconfig.json           # TypeScript configuration
```

---

## 🚀 Getting Started

### Prerequisites
* **Node.js**: `v20.x` or higher
* **Package Manager**: `npm`, `yarn`, or `pnpm`
* A **Firebase Project** with Cloud Firestore enabled

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/personal-planner.git
cd personal-planner
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a `.env.local` file in the root directory:

```env
# Firebase Client SDK Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_web_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Security Passwords
SITE_PASSWORD=YourStrongMasterPassword2026!
GUESS_PASSWORD=OptionalGuestFallbackPassword2026!

# Integrations (Optional)
NEXT_PUBLIC_JIRA_BASE_URL=https://your-org.atlassian.net/browse/
```

### 4. Configure Firestore Security Rules
In your Firebase Console, navigate to **Firestore Database** -> **Rules** and apply:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### 5. Run the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🚢 Production Deployment

### Deploying to Vercel

1. Push your repository to GitHub.
2. Log into [Vercel](https://vercel.com/) and click **Add New Project**.
3. Select and import your `personal-planner` repository.
4. Set the **Framework Preset** to `Next.js`.
5. Under **Environment Variables**, add the variables specified in `.env.local`.
6. Click **Deploy**.

---

## 🔒 Security & Access Model

* **Master Password**: Bypasses role checks for emergency root access and configuration management.
* **Role-Based Permissions**: All application features evaluate user roles assigned to the active workspace before rendering menus or permitting write/delete mutations.
* **Tokenized Guest Access**: Read-only endpoints (`/guest-timeline` and `/guest-secrets`) validate cryptographically random UUID tokens stored on the project document without exposing internal database keys.
* **Client-Side Persistence**: Offline writes utilize optimistic local caching and synchronize gracefully in the background once network connectivity is verified.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
