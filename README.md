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

## 🚀 Step-by-Step Setup Guide

Follow this guide to fork, set up Firebase, deploy to Vercel, and run the project locally.

---

### 1. Fork & Clone Repository

1. **Fork the Repository**:
   Click the **Fork** button at the top-right of this GitHub repository to create a copy under your GitHub account.

2. **Clone your Forked Repository**:
   ```bash
   git clone https://github.com/<YOUR_GITHUB_USERNAME>/personal-planner.git
   cd personal-planner
   ```

3. **Install Dependencies**:
   ```bash
   npm install
   ```

---

### 2. Firebase Setup & Security Rules

1. **Create a Firebase Project**:
   - Go to [Firebase Console](https://console.firebase.google.com/).
   - Click **Add Project** and follow the instructions to create a new project.

2. **Register Web App**:
   - In Project Overview, click the **Web icon (`</>`)** to register a web app.
   - Note down your **Firebase SDK Configuration** keys (`apiKey`, `projectId`, `authDomain`, etc.).

3. **Enable Firestore Database**:
   - In the left sidebar, navigate to **Build > Firestore Database**.
   - Click **Create Database**.
   - Choose a region close to your users (e.g., `asia-southeast1`).
   - Start in **Production Mode** or **Test Mode**.

4. **Set Firestore Security Rules**:
   - In Firestore Database, navigate to the **Rules** tab.
   - Replace the rules with the following configuration and click **Publish**:

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

> 💡 *Note: You can refine security rules later based on user authentication requirements.*

---

### 3. Environment Variables Configuration

Create a `.env.local` file in the root directory of your project:

```env
# -------------------------------------------------------------
# FIREBASE CONFIGURATION
# -------------------------------------------------------------
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

# -------------------------------------------------------------
# APPLICATION AUTHENTICATION
# -------------------------------------------------------------
SITE_PASSWORD=your_admin_password_here
GUESS_PASSWORD=your_guest_password_here
```

---

### 4. Deploying to Vercel

1. **Import Project to Vercel**:
   - Log in to [Vercel Dashboard](https://vercel.com/new).
   - Click **Add New > Project** and import your forked `personal-planner` repository.
   - Vercel will automatically detect **Next.js** as the Framework Preset.

2. **Configure Environment Variables in Vercel**:
   - Expand the **Environment Variables** section on the Vercel deployment page.
   - Add all key-value pairs from your `.env.local` file:
     - `NEXT_PUBLIC_FIREBASE_API_KEY`
     - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
     - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
     - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
     - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
     - `NEXT_PUBLIC_FIREBASE_APP_ID`
     - `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`
     - `SITE_PASSWORD`
     - `GUESS_PASSWORD`

3. **Deploy**:
   - Click **Deploy**. Vercel will build and deploy your project automatically.

---

### 5. Running Locally

Start the development server locally:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### 6. Pushing Changes to Your Own Repository

To save updates or new features to your forked repository on GitHub:

```bash
git add .
git commit -m "feat: add new feature"
git push origin main
```

---

## 🛠️ Built With

- **Framework**: [Next.js 16 (App Router)](https://nextjs.org/)
- **Styling**: [TailwindCSS 4](https://tailwindcss.com/)
- **UI Components**: [Shadcn UI](https://ui.shadcn.com/), [Base UI](https://base-ui.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Database & Sync**: [Firebase Firestore](https://firebase.google.com/)
- **Drag & Drop**: [@dnd-kit](https://dndkit.com/)
- **Deployment**: [Vercel](https://vercel.com/)
