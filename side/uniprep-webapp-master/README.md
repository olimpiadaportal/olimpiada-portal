# UniPrep Web Application

The ultimate web platform for students and teachers preparing for Azerbaijan university entrance exams.

## 🚀 Tech Stack

- **Framework**: Next.js 15.5.7 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 3.x
- **UI Components**: Shadcn UI
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Forms**: React Hook Form + Zod

## 📋 Prerequisites

- Node.js 18+ installed
- Supabase account with project credentials
- npm or yarn package manager

## 🛠️ Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env.local` file in the root directory with the required environment variables. Contact the development team for the necessary credentials.

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Authentication pages
│   ├── (dashboard)/       # Protected dashboard pages
│   └── page.tsx           # Public landing page
├── components/
│   ├── ui/                # Shadcn UI components
│   ├── landing/           # Landing page components
│   ├── shared/            # Reusable components
│   ├── student/           # Student-specific components
│   └── teacher/           # Teacher-specific components
├── lib/
│   ├── supabase/          # Supabase client configuration
│   ├── utils.ts           # Utility functions
│   └── constants.ts       # App constants
├── hooks/                 # Custom React hooks
├── services/              # Data fetching services
├── store/                 # Zustand state stores
└── types/                 # TypeScript type definitions
```

## 🎯 Features

### Stage 1 (Current) ✅
- ✅ Public landing page showcasing mobile app
- ✅ User authentication (Login/Register)
- ✅ Protected routes with middleware
- ✅ Student and Teacher account types
- ✅ Supabase SSR integration

### Upcoming Stages
- **Stage 2**: Student Dashboard
- **Stage 3**: Practice System
- **Stage 4**: Mock Exam System
- **Stage 5**: Competitive Mode (AI)
- **Stage 6**: Teacher Marketplace
- **Stage 7**: Analytics & Leaderboards
- **Stage 8**: Profile & Settings
- **Stage 9**: Realtime Features & Polish

## � Related Projects

This web application is part of the UniPrep ecosystem, which includes mobile and administrative platforms for a comprehensive educational experience.

## 🤝 Contributing

This is a private project. For questions or issues, contact the development team.

## 📄 License

Proprietary - All rights reserved
