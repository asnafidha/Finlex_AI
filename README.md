🏦 FinLex AI — Your CA. Always On.

An AI-powered full-stack SaaS platform built for Indian Chartered Accountants — handling GST compliance, TDS, ITR preparation, accounting, payroll, and more, with an integrated LLM assistant that understands your company's actual financial data.

🤖 What Makes It Different?
Most accounting tools just store data. FinLex AI understands it.
The built-in AI assistant is powered by Groq LLaMA 3.3 70B and has full access to your company's financial context — invoices, GST data, TDS, journal entries, and more. Ask it anything:

"Why is our profit low this quarter?"
"Which invoices are overdue?"
"What is our total GST liability for March?"
"Show me all TDS deductions above ₹10,000"


✨ Features — 20+ Modules
💰 GST & Tax Compliance
ModuleDescriptionGST InvoicingCreate GST-compliant sales & purchase invoices with auto CGST/SGST/IGST calculationGSTR ExportGenerate GSTR-1 and GSTR-3B ready reports with one clickITC ReconciliationMatch input tax credit against purchase invoices automaticallyTDS ModuleTDS deduction tracking, challan management, and certificate generationITR PreparationAggregate income tax data for ITR filingCompliance CalendarNever miss a GST/TDS/ITR/ROC deadline
📒 Accounting & Finance
ModuleDescriptionJournal EntriesDouble-entry bookkeeping with auto balance validationBank ReconciliationMatch bank statements with ledger entriesOpening BalancesSet up complete chart of accounts from scratchDepreciationAuto-calculate fixed asset depreciationPayments & Credit NotesTrack payments, debit notes, credit notesProfit & Loss ReportReal-time P&L statementsParty LedgerCustomer and vendor-wise ledger view
👥 Operations & HR
ModuleDescriptionPayrollSalary processing with PF/ESI calculationsFY LockLock financial year to prevent backdated entriesClient CollaborationRequest and track documents from clientsMulti-CompanyManage multiple companies under one CA login
🧠 AI & Intelligence
ModuleDescriptionAI Chat AssistantAsk questions about your financial data in plain EnglishDocument OCRExtract invoice data using Anthropic Claude Vision APIAudit TrailFull log of every action in the systemAudit Risk DetectionAI flags unusual or suspicious transactions

🛠️ Tech Stack
LayerTechnologyFrontendReact 18, Vite, JavaScriptBackendNode.js, Express.jsDatabasePostgreSQLAI/LLMGroq API (LLaMA 3.3 70B)OCRAnthropic Claude Vision APIAuthJWT Bearer Token

📁 Project Structure
Finlex_AI/
├── frontend/                  # React 18 + Vite
│   └── src/
│       ├── pages/             # 20+ feature pages
│       ├── components/        # Sidebar, ChatBot, Charts
│       ├── context/           # Auth context (JWT)
│       └── services/          # Centralized API layer
├── backend/                   # Node.js + Express REST API
│   └── src/
│       ├── routes/            # 25+ route files
│       ├── middleware/        # Auth, company access guard
│       └── config/            # PostgreSQL connection
│   └── sql/
│       ├── schema.sql         # Full DB schema
│       ├── seed.sql           # Demo data (3 companies)
│       └── migrations/        # DB migration files

⚙️ Getting Started
Prerequisites

Node.js 18+
PostgreSQL 14+
Groq API key — free at console.groq.com

1. Clone the repo
bashgit clone https://github.com/asnafidha/Finlex_AI.git
cd Finlex_AI
2. Setup PostgreSQL database
bashpsql -h localhost -U postgres -c "CREATE DATABASE finlex_db;"
psql -h localhost -U postgres -d finlex_db -f backend/sql/schema.sql
psql -h localhost -U postgres -d finlex_db -f backend/sql/seed.sql
3. Configure backend
bashcd backend && npm install
Create backend/.env:
envPORT=5000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=finlex_db
DB_USER=postgres
DB_PASSWORD=your_postgres_password
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:5173
GROQ_API_KEY=your_groq_api_key
bashnpm start
4. Configure frontend
bashcd frontend && npm install && npm run dev
Open http://localhost:5173
5. Demo login
Email:    arjun@menon-ca.com
Password: Demo@1234

🗂️ Demo Data Includes
CompanyTypeStateKerala Spices Traders Pvt LtdTrading — Spice ExportKeralaTechNova Solutions Pvt LtdIT ServicesMaharashtraHyderabad Electronics Pvt LtdElectronics DistributionTelangana
Each company has sales/purchase invoices, TDS entries, journal entries, compliance deadlines, and opening balances preloaded.

👨‍💻 Author
Asna Fidha
Full-Stack Developer | Data Engineering Enthusiast
LinkedIn • GitHub
