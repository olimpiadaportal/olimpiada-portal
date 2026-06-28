# UniPrep Admin Panel

**Status:** 🚧 Stage 1 In Progress  
**Tech Stack:** Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui + Supabase  
**Version:** 1.0.0

---

## 📋 Overview

UniPrep Admin Panel is a web-based dashboard for managing the UniPrep mobile application. It provides comprehensive tools for user management, content management, analytics, and system configuration.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Supabase project (shared with mobile app)
- Admin account in the database

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Update .env.local with your Supabase credentials

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📁 Project Structure

```
UniPrep-Admin/
├── src/
│   ├── app/                    # Next.js 14 App Router
│   │   ├── (dashboard)/        # Dashboard routes
│   │   ├── api/                # API routes
│   │   ├── layout.tsx          # Root layout
│   │   └── globals.css         # Global styles
│   ├── components/             # React components
│   │   ├── dashboard/          # Dashboard-specific components
│   │   ├── ui/                 # shadcn/ui components
│   │   └── layout/             # Layout components
│   ├── lib/                    # Shared utilities
│   │   ├── supabase.ts         # Supabase client
│   │   └── utils.ts            # Utility functions
│   ├── services/               # API services
│   │   └── dashboardService.ts # Dashboard API calls
│   └── types/                  # TypeScript types
│       └── index.ts            # Shared types
├── scripts/                    # Database scripts
│   └── sql_STAGE_1/            # Stage 1 SQL files
├── markdowns/                  # Documentation
│   ├── stage_1/                # Stage 1 docs
│   └── ADMIN_CONTEXT.md        # Admin panel context
├── public/                     # Static assets
├── package.json                # Dependencies
├── tsconfig.json               # TypeScript config
├── tailwind.config.ts          # Tailwind config
└── next.config.js              # Next.js config
```

---

## 🎯 Features

### Stage 1: Dashboard (Home) ✅ In Progress
- **Key Metrics Cards**
  - Total students
  - Active students (30d)
  - Total exams taken
  - Average ELO rating
  - System uptime

- **Charts**
  - Student growth (line chart)
  - Activity heatmap (calendar)
  - ELO distribution (histogram)
  - Exam completion rate (area chart)

- **Recent Activity Feed**
  - New user registrations
  - Exam completions
  - Score changes
  - System events

- **Quick Actions**
  - Reset leaderboard
  - Archive season
  - Export data
  - Send notifications

### Stage 2: User Management (Planned)
- Student management
- Teacher management
- Admin management
- Bulk operations

### Stage 3: Leaderboard Management (Planned)
- Reset options
- Season management
- Manual adjustments
- Scoring configuration

### Stage 4: Content Management (Planned)
- Question bank
- Exam builder
- Subject management

### Stage 5: Analytics & Reports (Planned)
- Student analytics
- Content analytics
- System analytics
- Scheduled reports

### Stage 6: System Settings (Planned)
- General settings
- Notification settings
- Payment settings
- Security settings

### Stage 7: Notifications (Planned)
- Send notifications
- Message composer
- Target selection
- Notification history

---

## 🗄️ Database

### Shared Database
This admin panel shares the same Supabase database with the UniPrep mobile app. All database migrations are coordinated between both projects.

### Stage 1 Database Setup

```sql
-- Run Stage 1 SQL script
\i scripts/sql_STAGE_1/01_admin_dashboard_schema.sql
```

**Creates:**
- `admin_audit_log` table
- Dashboard statistics functions
- RLS policies
- Indexes

**See:** `scripts/sql_STAGE_1/README.md` for details

---

## 🔐 Security

### Authentication
- Admin-only authentication via Supabase Auth
- Session-based with automatic refresh
- Middleware checks for admin role

### Authorization
- **Super Admin:** Full access
- **Moderator:** Read-only dashboard
- **Analyst:** Analytics only

### RLS Policies
- All tables have Row Level Security enabled
- Admin functions verify user role
- Audit logging for all actions

### Best Practices
- Environment variables for secrets
- IP whitelisting (optional)
- 2FA support (optional)
- Regular security audits

---

## 🎨 UI/UX

### Design System
- **Framework:** Tailwind CSS
- **Components:** shadcn/ui
- **Icons:** Lucide React
- **Charts:** Recharts
- **Tables:** TanStack Table

### Responsive Design
- **Mobile:** < 768px
- **Tablet:** 768px - 1024px
- **Desktop:** > 1024px

### Theme
- Light/Dark mode support
- Consistent color palette
- Accessible components

---

## 🧪 Testing

### Unit Tests
```bash
npm run test
```

### Integration Tests
```bash
npm run test:integration
```

### E2E Tests
```bash
npm run test:e2e
```

---

## 📊 Performance

### Optimization Strategies
- Server Components for data fetching
- Caching (5-minute cache for stats)
- Lazy loading for charts
- Pagination for large lists
- Indexed database queries

### Performance Targets
- Initial page load: < 2 seconds
- Chart render: < 500ms
- Activity feed update: < 200ms
- API response: < 100ms

---

## 🚀 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Environment Variables
Set these in Vercel dashboard:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

### Custom Domain
- Configure DNS: `admin.uniprep.az`
- Add domain in Vercel
- Enable HTTPS

---

## 📚 Documentation

### Markdown Documentation
- `markdowns/ADMIN_CONTEXT.md` - Complete admin panel context
- `markdowns/stage_1/STAGE_1_PLAN.md` - Stage 1 implementation plan
- `scripts/sql_STAGE_1/README.md` - Database documentation

### API Documentation
- Coming soon: OpenAPI/Swagger docs

---

## 🤝 Contributing

### Development Workflow
1. Create feature branch
2. Make changes
3. Test thoroughly
4. Submit pull request
5. Code review
6. Merge to main

### Code Style
- TypeScript strict mode
- ESLint + Prettier
- Conventional commits
- Component documentation

---

## 📝 License

Proprietary - UniPrep Development Team

---

## 🔗 Related Projects

- **UniPrep Mobile App:** `../UniPrep/`
- **Shared Database:** Supabase (same instance)

---

## 📞 Support

For questions or issues:
- Check documentation first
- Review troubleshooting guides
- Contact development team

---

**Current Stage:** Stage 1 - Dashboard (Home)  
**Next Stage:** Stage 2 - User Management  
**Timeline:** 7 days per stage

**Last Updated:** November 10, 2025  
**Maintained By:** UniPrep Development Team
