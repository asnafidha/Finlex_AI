import { useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { auth as authApi, saveToken } from './services/api'
import Landing from './pages/Landing.jsx'
import Dashboard from './pages/Dashboard.jsx'
import GSTPage from './pages/GSTPage.jsx'
import GSTRExportPage from './pages/GSTRExportPage.jsx'
import TDSPage from './pages/TDSPage.jsx'
import ITRPage from './pages/ITRPage.jsx'
import ITCPage from './pages/ITCPage.jsx'
import AuditTrailPage from './pages/AuditTrailPage.jsx'
import CompliancePage from './pages/CompliancePage.jsx'
import AuditPage from './pages/AuditPage.jsx'
import MultiCompanyPage from './pages/MultiCompanyPage.jsx'
import DocumentPage from './pages/DocumentPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import JournalPage from './pages/JournalPage.jsx'
import CreditNotesPage from './pages/CreditNotesPage.jsx'
import OpeningBalancesPage from './pages/OpeningBalancesPage.jsx'
import PayrollPage from './pages/PayrollPage.jsx'
import DepreciationPage from './pages/DepreciationPage.jsx'
import BankReconPage from './pages/BankReconPage.jsx'
import AdvanceTaxPage from './pages/AdvanceTaxPage.jsx'
import PLReportPage from './pages/PLReportPage.jsx'
import PartyLedgerPage from './pages/PartyLedgerPage.jsx'
import FYLockPage from './pages/FYLockPage.jsx'
import PaymentsPage from './pages/PaymentsPage.jsx'
import Sidebar from './components/Sidebar.jsx'
import ChatBot from './components/ChatBot.jsx'
import ClientCollabPage from './pages/ClientCollabPage.jsx'

function AppInner() {
  const { user, loading, login, logout } = useAuth()
  const [page, setPage] = useState('dashboard')

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--navy)', fontFamily: 'var(--font-body)', color: 'rgba(255,255,255,0.7)', fontSize: 16 }}>
      Loading FinLex...
    </div>
  )

  const handleLogin = async (email, password, name, mode) => {
    if (mode === 'register') {
      const res = await authApi.register(name, email, password)
      saveToken(res.token)
      window.location.reload()
    } else {
      await login(email, password)
    }
    setPage('dashboard')
  }

  if (!user) return <Landing onLogin={handleLogin} />

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--gray-100)' }}>
      <Sidebar page={page} setPage={setPage} onLogout={logout} />
      <main style={{ flex: 1, marginLeft: 260, minHeight: '100vh', padding: '32px', overflowY: 'auto' }}>
        {page === 'dashboard' && <Dashboard setPage={setPage} />}
        {page === 'documents' && <DocumentPage />}
        {page === 'gst' && <GSTPage />}
        {page === 'gstr' && <GSTRExportPage />}
        {page === 'tds' && <TDSPage />}
        {page === 'itr' && <ITRPage />}
        {page === 'advance-tax' && <AdvanceTaxPage />}
        {page === 'itc' && <ITCPage />}
        {page === 'audit-trail' && <AuditTrailPage />}
        {page === 'compliance' && <CompliancePage />}
        {page === 'audit' && <AuditPage />}
        {page === 'multicompany' && <MultiCompanyPage setPage={setPage} />}
        {page === 'settings' && <SettingsPage />}
        {page === 'journals' && <JournalPage />}
        {page === 'credit-notes' && <CreditNotesPage />}
        {page === 'opening-balances' && <OpeningBalancesPage />}
        {page === 'payroll' && <PayrollPage />}
        {page === 'depreciation' && <DepreciationPage />}
        {page === 'bank-recon' && <BankReconPage />}
        {page === 'pl-report' && <PLReportPage />}
        {page === 'party-ledger' && <PartyLedgerPage />}
        {page === 'fy-lock' && <FYLockPage />}
        {page === 'payments' && <PaymentsPage />}
        {page === 'client-collab' && <ClientCollabPage />}
      </main>
      <ChatBot />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}