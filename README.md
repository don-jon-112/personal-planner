# 📅 Personal Planner & Timeline

A modern, fast, and feature-rich **Work Planner & Project Timeline Management Application** built with **Next.js (App Router)**, **Tailwind CSS**, and **Firebase Cloud Firestore**.

---

## ✨ Features

- 🏢 **Multi-Project Management Workspace**: Manage multiple projects within a single app. Seamlessly switch between projects using the header selector; each project maintains its own tasks, epics, timeline, PICs, and bug reports.
- 📋 **Todo & Epic Planner**: Manage tasks grouped by Epics with drag-and-drop ordering, status tracking, mandays estimation, and bulk Excel (`.xlsx`) import.
- 📊 **Interactive Timeline & Gantt View**: Visual project schedule with zoom levels (Day, Week, Month), progress indicators, weekend/holiday toggles, and custom date ranges.
- 🔗 **Per-Project Share Link (Passwordless View-Only)**: Generate secure, secret shareable URLs (`/guest-timeline?token=shr_...`) per project. Recipients can instantly view the timeline without logging in or entering a password, strictly isolated to that specific project.
- 🖼️ / 📄 **High-Res Roadmap Export (PNG & PDF)**: Export the entire timeline at high resolution (2x/3x ratio, no clipping) or as a print-ready landscape PDF document featuring an Executive Summary Header (Project Key, Status, Epics & Tasks metrics, timestamp).
- 👥 **Project-Scoped PIC & Workload Allocation**: Assign tasks to team members with customizable color badges and workload analytics, uniquely scoped to each individual project.
- 📝 **Weekly Report Generator**: Generate structured weekly summaries ready to copy or export based on the active project.
- 🐛 **Bug Tracker**: Log, prioritize, and track issue resolutions alongside sprint tasks for the active project.
- 📝 **Personal Scratchpad Notes**: Global notes system that acts as your personal "second brain" across all projects.
- ⚡ **Offline-First Persistence with Cloud Sync**: Powered by IndexedDB cache to minimize Firebase quota usage, complete with 1-click cloud sync buttons.
- 📱 **Progressive Web App (PWA)**: Installable as an app on Windows, macOS, Android, and iOS.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 16 (App Router)](https://nextjs.org/)
- **UI & Styling**: [Tailwind CSS v4](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/), Lucide Icons
- **Database & Sync**: [Firebase Cloud Firestore](https://firebase.google.com/) (with offline persistence & online sync)
- **Document & Image Export**: [html2canvas-pro](https://github.com/niklasvh/html2canvas), [jsPDF](https://github.com/parallax/jsPDF)
- **Drag & Drop**: [@dnd-kit](https://dndkit.com/)
- **Spreadsheet Processing**: [SheetJS (xlsx)](https://sheetjs.com/)
- **Deployment**: [Vercel](https://vercel.com/)

---

## 🚀 Quick Deployment Guide

You can deploy your own instance in a few simple steps:

### Step 1: Fork or Save to Your GitHub
1. Click the **Fork** button at the top right of this repository to copy it into your own GitHub account.
2. (Optional) You can make your forked repository **Public** or **Private**.

---

### Step 2: Setup Firebase

The application uses **Firebase Cloud Firestore** as its database.

#### 1. Create a Firebase Project
1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** (or **Create a project**).
3. Enter a project name (e.g. `my-work-planner`) and complete the creation steps.

#### 2. Register a Web App
1. In your Firebase Project Overview, click the **Web icon (`</>`)** to add a new web app.
2. Give it a nickname (e.g. `Work Planner Web`) and click **Register app**.
3. You will see your `firebaseConfig` keys:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`
   - `measurementId` (optional)
   *(Keep this tab open or copy these values for Vercel Environment Variables).*

#### 3. Enable Cloud Firestore
1. In the Firebase left sidebar, go to **Build** -> **Firestore Database**.
2. Click **Create database**.
3. Select your preferred server location (e.g. `asia-southeast2` for Jakarta / `asia-east1` for Singapore/Tokyo).
4. Start in **Production mode** (or Test mode).

#### 4. Configure Firestore Security Rules
Go to the **Rules** tab in Cloud Firestore and paste the following rules:

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
Click **Publish**.

> 💡 **Note**: The app automatically creates all necessary Firestore collections (`timelineEpics`, `timelineTasks`, `timelinePics`, `bugs`, `notes`, `settings`) on first use.

---

### Step 3: Deploy to Vercel

1. Log in to [Vercel](https://vercel.com/).
2. Click **Add New...** -> **Project**.
3. Select and **Import** your forked `personal-planner` repository from GitHub.
4. **Framework Preset**: `Next.js` (detected automatically).
5. Open the **Environment Variables** section and add the variables listed below.

---

## 🔑 Environment Variables Reference

Add the following environment variables in your **Vercel Project Settings** (or `.env.local` if running locally):

| Variable Name | Required | Description | Example / Source |
| :--- | :---: | :--- | :--- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | **Yes** | Firebase Web API Key | `AIzaSy...` (from Firebase Config) |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | **Yes** | Firebase Auth Domain | `your-project-id.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | **Yes** | Firebase Project ID | `your-project-id` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | **Yes** | Firebase Storage Bucket URL | `your-project-id.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | **Yes** | Firebase Messaging Sender ID | `1234567890` (numeric) |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | **Yes** | Firebase Web App ID | `1:1234567890:web:abcdef...` |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | No | Google Analytics Measurement ID | `G-XXXXXXXXXX` (optional) |
| `SITE_PASSWORD` | **Yes** | Master Admin access password | Any secret password (e.g. `AdminPassword2026!`) |
| `GUESS_PASSWORD` | **Yes** | Guest / Client access password | Any password (e.g. `ClientView2026!`) |
| `NEXT_PUBLIC_JIRA_BASE_URL` | No | JIRA Instance Base URL for bug ticket links | e.g. `https://your-company.atlassian.net/browse/` |

### 🔒 Access & Sharing Roles Explained
- **`SITE_PASSWORD`**: Provides full administrative access to all workspaces and features (Projects management, Todo, Epics, Gantt Timeline, PICs, Bugs, Notes, Settings, Import, and Export).
- **Per-Project Share Links (`/guest-timeline?token=shr_...`)**: Instant, passwordless read-only access for team members, clients, or stakeholders to view a single project's roadmap without authentication.
- **`GUESS_PASSWORD`**: Optional legacy fallback password granting general access to `/guest-timeline`.

---

### Step 4: Launch!
1. Click **Deploy** in Vercel.
2. Once the build completes, open your production URL (e.g., `https://your-planner.vercel.app`).
3. Enter your `SITE_PASSWORD` to log in and start planning!

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
