# ErpofOne

Solopreneur AI Agent Command Center — Node.js · Express · Pug · Tailwind CSS · MongoDB

## Stack
- **Node.js** + **Express.js** — server & routing
- **Pug** — server-side templating
- **Tailwind CSS** — utility-first styling
- **MongoDB** + **Mongoose** — database & ODM

## Quick Start

### 1. Clone & install
```bash
cd erpofone
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env — set your MONGODB_URI if not using local MongoDB
```

### 3. Build CSS
```bash
npm run build:css
```

### 4. Seed the database (demo data)
```bash
npm run seed
```
This populates agents, skills, tasks, activity, resources, and 30 days of usage logs.

### 5. Start the server
```bash
npm run dev        # development (nodemon auto-restart)
npm start          # production
```

Open → http://localhost:3000

---

## Scripts
| Command | Description |
|---|---|
| `npm run dev` | Start with nodemon (auto-restart on changes) |
| `npm start` | Production start |
| `npm run build:css` | Compile Tailwind CSS once |
| `npm run watch:css` | Watch and recompile Tailwind CSS |
| `npm run seed` | Wipe & reseed MongoDB with demo data |

> **Dev workflow**: run `npm run watch:css` in one terminal and `npm run dev` in another.

---

## Project structure
```
erpofone/
├── server.js                   # Entry point
├── src/
│   ├── app.js                  # Express app setup
│   ├── config/
│   │   └── db.js               # MongoDB connection
│   ├── models/
│   │   ├── Agent.js            # Agent schema
│   │   ├── Skill.js            # Skill schema
│   │   ├── Task.js             # Task schema
│   │   ├── Activity.js         # Activity log schema
│   │   ├── Resource.js         # Resource (brain/docs) schema
│   │   └── UsageLog.js         # Daily usage/cost log schema
│   ├── routes/                 # Express route definitions
│   ├── controllers/            # Route handler logic
│   ├── public/
│   │   ├── css/
│   │   │   ├── input.css       # Tailwind source
│   │   │   └── output.css      # Compiled output (gitignore this)
│   │   └── js/
│   │       └── main.js         # Client-side JS (modals, API calls)
│   └── views/
│       ├── layout.pug          # Base layout
│       ├── partials/           # Sidebar, topbar, avatar
│       └── pages/              # One file per route
└── scripts/
    └── seed.js                 # Demo data seeder
```

---

## Pages & routes
| Route | Page |
|---|---|
| `GET /` | Dashboard — stats, agents, activity |
| `GET /agents` | Agent grid |
| `GET /agents/:id` | Agent detail (overview / skills / settings tabs) |
| `GET /tasks` | Task list with status filters |
| `GET /activity` | Full activity log |
| `GET /resources` | Brain + docs links, integrations |
| `GET /usage` | Usage & costs with Chart.js bar chart |
| `GET /skills` | Global skill library |

## API endpoints (JSON)
| Method | Route | Action |
|---|---|---|
| `POST` | `/agents` | Create agent |
| `PATCH` | `/agents/:id` | Update agent |
| `POST` | `/agents/:id/skills` | Add skill to agent |
| `DELETE` | `/agents/:id/skills/:skillId` | Remove skill |
| `POST` | `/tasks` | Create task |
| `PATCH` | `/tasks/:id` | Update task status |
| `POST` | `/resources` | Add resource link |
| `DELETE` | `/resources/:id` | Delete resource |
| `POST` | `/skills` | Create skill |
| `DELETE` | `/skills/:id` | Delete skill |
| `GET` | `/usage/api/data?period=week` | Usage chart data |

---

## Next steps
- Connect real Claude API usage via Anthropic SDK and log to `UsageLog`
- Connect Stripe webhooks to update MRR on the dashboard
- Add Slack webhook for agent notifications
- Add authentication (Passport.js or simple session auth)
- Deploy to your Mogli VPS: `pm2 start server.js --name erpofone`
