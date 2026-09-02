# 📋 Personal Planner App

A modern, responsive, offline-first personal management and timeline planner built with **Next.js (App Router)**, **TailwindCSS**, **Shadcn UI**, and **Firebase (Firestore)**.

---

## ✨ Features

- 📊 **Dashboard**: Summary metrics for tasks, notes, active bugs, and recent activity log.
- 📅 **Weekly Report**: Structured weekly activity logging and report generation.
- ✅ **Todo Plan**: Priority task lists with status tracking.
- 📝 **Notes**: Personal note-taking system.
- 🗓️ **Timeline (Gantt View)**:
  - Interactive Gantt chart view with drag-and-drop support.
  - PIC color customization.
  - Export schedule to Excel (`.xls`) complete with full Gantt date grid, colors, and weekend/holiday highlighting.
- 🐛 **Bug & Report**:
  - Dual view: **Kanban Board** & **Table View**.
  - Direct integration with **JIRA Ticket Numbers**.
- 🔒 **Authentication & Guest Mode**: Admin full access & Guest timeline read-only access.
- ⚡ **Offline-First Sync**: Powered by Firestore IndexedDB persistence to minimize Firebase quota usage. Manual and online sync toggles available in Settings.

---

## ⚡ Quick Deployment Guide (No Local Setup / Cloning Needed!)

You can deploy your own instance of Personal Planner in under 5 minutes without cloning or coding locally.

---

### Step 1: Fork the Repository

1. Click the **Fork** button at the top-right of this GitHub repository.
2. Click **Create Fork** to copy this project into your own GitHub account.

---

### Step 2: Firebase Setup & Firestore Rules

1. **Create a Firebase Project**:
   - Go to [Firebase Console](https://console.firebase.google.com/).
   - Click **Add Project** and follow the prompts to create your project.

2. **Add a Web App**:
   - In Project Overview, click the **Web icon (`</>`)** to register a web app.
   - Copy your **Firebase Configuration** keys (`apiKey`, `projectId`, `authDomain`, etc.).

3. **Enable Firestore Database**:
   - Go to **Build > Firestore Database** in the left sidebar.
   - Click **Create Database** and choose your preferred location (e.g., `asia-southeast1`).
   - Start in **Production Mode** or **Test Mode**.

4. **Set Firestore Security Rules**:
   - In Firestore Database, click the **Rules** tab.
   - Paste the following rule and click **Publish**:

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

---

### Step 3: Deploy to Vercel & Setup Environment Variables

1. **Import to Vercel**:
   - Log in to [Vercel](https://vercel.com/new).
   - Click **Add New > Project** and select your forked `personal-planner` repository.
   - Vercel will automatically detect **Next.js** as the Framework Preset.

2. **Add Environment Variables in Vercel**:
   - Expand the **Environment Variables** section before clicking Deploy.
   - Add the following keys with values from your Firebase Console & your desired app passwords:

| Environment Variable | Description | Where to Obtain / How to Get |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase API Key | **Firebase Console** &rarr; Project Settings &rarr; General &rarr; *Your apps* &rarr; `apiKey` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain | **Firebase Console** &rarr; Project Settings &rarr; General &rarr; *Your apps* &rarr; `authDomain` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Project ID | **Firebase Console** &rarr; Project Settings &rarr; General &rarr; *Your apps* &rarr; `projectId` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Storage Bucket | **Firebase Console** &rarr; Project Settings &rarr; General &rarr; *Your apps* &rarr; `storageBucket` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase App ID | **Firebase Console** &rarr; Project Settings &rarr; General &rarr; *Your apps* &rarr; `appId` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | *(Optional)* Firebase Messaging Sender ID | **Firebase Console** &rarr; Project Settings &rarr; General &rarr; *Your apps* &rarr; `messagingSenderId` |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | *(Optional)* Firebase Analytics Measurement ID | **Firebase Console** &rarr; Project Settings &rarr; General &rarr; *Your apps* &rarr; `measurementId` |
| `SITE_PASSWORD` | Admin Full Access Password | **Custom Choice**: Set any strong password you want to use for Admin login. |
| `GUESS_PASSWORD` | Guest Read-Only Password | **Custom Choice**: Set any password you want to share with guests for read-only timeline access. |
| `NEXT_PUBLIC_JIRA_BASE_URL` | *(Optional)* JIRA Instance Base URL | **Your Company JIRA URL**: e.g., `https://your-company.atlassian.net/browse/` *(Defaults to `https://astraapps.astra.co.id/jira-software/browse/` if omitted)* |

3. **Click Deploy**:
   - Vercel will build and host your application. You will get a live URL (e.g. `https://your-planner.vercel.app`).

---

## 💻 (Optional) Local Development

If you want to edit code or test locally on your computer:

1. **Clone your forked repository**:
   ```bash
   git clone https://github.com/<YOUR_USERNAME>/personal-planner.git
   cd personal-planner
   npm install
   ```

2. **Create `.env.local` file**:
   Add the environment variables listed in the table above into a `.env.local` file.

3. **Run local dev server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

---

## 🛠️ Built With

- **Framework**: [Next.js 16 (App Router)](https://nextjs.org/)
- **Styling**: [TailwindCSS 4](https://tailwindcss.com/)
- **UI Components**: [Shadcn UI](https://ui.shadcn.com/), [Base UI](https://base-ui.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Database & Sync**: [Firebase Firestore](https://firebase.google.com/)
- **Drag & Drop**: [@dnd-kit](https://dndkit.com/)
- **Deployment**: [Vercel](https://vercel.com/)
