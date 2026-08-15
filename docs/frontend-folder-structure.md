# LogPulse — Frontend Folder Structure

> **Stack**: React 19 · TypeScript · Vite · React Router DOM v7 · MUI v9 · Axios · Zod v4

---

## Design Principles Applied

| Principle | How it manifests |
|---|---|
| **Separation of Concerns** | UI, data-fetching, business logic, and types live in dedicated layers |
| **DRY** | Shared schemas, hooks, components, and API clients are centralised |
| **Feature-first** | Domain logic (auth, logs, dashboard) is co-located under `features/` |
| **Protected Routes** | A `ProtectedRoute` guard component sits at the router level |
| **Zod-first Validation** | Every form and API response is validated through a Zod schema |

---

## Full Tree

```
frontend/
├── public/                          # Static assets served as-is
│
└── src/
    │
    ├── main.tsx                     # React root — mounts <App />
    ├── App.tsx                      # Router setup only (no business logic)
    │
    ├── router/
    │   ├── index.tsx                # createBrowserRouter — all routes defined here
    │   ├── ProtectedRoute.tsx       # Checks auth token; redirects to /login if absent
    │   └── routes.ts                # Route path constants  e.g. ROUTES.DASHBOARD
    │
    ├── features/                    # Domain-sliced feature modules
    │   │
    │   ├── auth/                    # Login & Register  (tenancy module)
    │   │   ├── api/
    │   │   │   └── auth.api.ts      # login(), register(), refreshToken() via Axios
    │   │   ├── hooks/
    │   │   │   ├── useLogin.ts      # Wraps auth.api + Zod validation + token storage
    │   │   │   └── useRegister.ts
    │   │   ├── schemas/
    │   │   │   ├── login.schema.ts      # z.object({ email, password })
    │   │   │   └── register.schema.ts   # z.object({ name, email, password, ... })
    │   │   ├── types/
    │   │   │   └── auth.types.ts    # LoginPayload, RegisterPayload, AuthResponse
    │   │   └── pages/
    │   │       ├── LoginPage.tsx
    │   │       └── RegisterPage.tsx
    │   │
    │   ├── dashboard/               # Tenant dashboard — aggregated overview
    │   │   ├── api/
    │   │   │   └── dashboard.api.ts # Thin wrappers: getLogSummary(), etc.
    │   │   ├── hooks/
    │   │   │   └── useDashboard.ts  # Fetches & transforms data for the dashboard
    │   │   ├── components/
    │   │   │   ├── StatsCard.tsx
    │   │   │   ├── LogLevelChart.tsx
    │   │   │   └── ServiceBreakdown.tsx
    │   │   └── pages/
    │   │       └── DashboardPage.tsx
    │   │
    │   └── logs/                    # Log explorer — query + aggregate
    │       ├── api/
    │       │   └── logs.api.ts      # queryLogs(), aggregateLogs()
    │       ├── hooks/
    │       │   ├── useQueryLogs.ts
    │       │   └── useAggregateLogs.ts
    │       ├── schemas/
    │       │   ├── query-logs.schema.ts      # mirrors QueryLogsDto
    │       │   └── aggregate-logs.schema.ts  # mirrors AggregateLogsDto (bucket, group_by …)
    │       ├── types/
    │       │   ├── log.types.ts     # LogEntry, LogLevel, AggregationBucket, AggregationGroup
    │       │   └── log-response.types.ts
    │       ├── components/
    │       │   ├── LogTable.tsx
    │       │   ├── LogFilters.tsx   # service, level, since/until, q, cursor
    │       │   └── AggregationChart.tsx
    │       └── pages/
    │           └── LogsPage.tsx
    │
    ├── shared/                      # Pure cross-feature, zero domain knowledge
    │   ├── api/
    │   │   └── http.ts              # Axios instance — baseURL, interceptors, token header
    │   ├── components/
    │   │   ├── layout/
    │   │   │   ├── AppShell.tsx     # Sidebar + Topbar wrapper for authenticated pages
    │   │   │   ├── Sidebar.tsx
    │   │   │   └── Topbar.tsx
    │   │   └── ui/
    │   │       ├── LoadingSpinner.tsx
    │   │       ├── ErrorAlert.tsx
    │   │       └── PageTitle.tsx
    │   ├── hooks/
    │   │   └── useAuth.ts           # Reads token from store; exposes isAuthenticated
    │   └── types/
    │       └── api.types.ts         # Generic ApiError, PaginatedResponse<T>, etc.
    │
    ├── store/                       # Global client state (no external lib needed yet)
    │   └── auth.store.ts            # useState/useReducer or Context — token + tenant info
    │
    ├── styles/
    │   ├── index.css                # CSS reset / global tokens
    │   └── theme.ts                 # MUI createTheme — palette, typography, etc.
    │
    └── lib/
        └── zod.ts                   # Re-exports z + shared helpers (e.g. zodResolver)
```

---

## Router Sketch (`src/router/index.tsx`)

```tsx
const router = createBrowserRouter([
  // Public routes
  { path: ROUTES.LOGIN,    element: <LoginPage /> },
  { path: ROUTES.REGISTER, element: <RegisterPage /> },

  // Protected routes — wrapped in AppShell
  {
    element: <ProtectedRoute />,          // redirects to /login if no token
    children: [
      {
        element: <AppShell />,            // sidebar + topbar layout
        children: [
          { path: ROUTES.DASHBOARD, element: <DashboardPage /> },
          { path: ROUTES.LOGS,      element: <LogsPage /> },
        ],
      },
    ],
  },

  // Fallback
  { path: '*', element: <Navigate to={ROUTES.DASHBOARD} replace /> },
]);
```

---

## Auth / API Flow

```
LoginPage
  └── useLogin() hook
        ├── validate form with login.schema.ts (Zod)
        ├── call auth.api.ts → POST /tenancy/login
        ├── store token in auth.store.ts
        └── navigate to ROUTES.DASHBOARD

ProtectedRoute
  └── reads auth.store.ts → isAuthenticated
        ├── true  → render <Outlet />
        └── false → <Navigate to="/login" />

http.ts (Axios instance)
  └── request interceptor → injects Authorization: ApiKey <token>
  └── response interceptor → catches 401 → clears store → redirects
```

---

## Zod Schema Convention

Each schema file exports:
1. The **schema** itself (`loginSchema`)
2. The inferred **TypeScript type** (`type LoginFormData = z.infer<typeof loginSchema>`)

```ts
// features/auth/schemas/login.schema.ts
import { z } from 'zod';

export const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
});

export type LoginFormData = z.infer<typeof loginSchema>;
```

---

## Key Conventions

| What | Convention |
|---|---|
| Page components | `<Feature>Page.tsx` — route entry point only, no logic |
| Data hooks | `use<Action><Resource>.ts` — one concern per hook |
| API modules | `<feature>.api.ts` — plain async functions, no React |
| Zod schemas | `<action>.schema.ts` — schema + inferred type exported together |
| Route constants | `ROUTES.<NAME>` string constants in `router/routes.ts` |
| Barrel exports | Each feature folder has an `index.ts` exporting its public surface |
