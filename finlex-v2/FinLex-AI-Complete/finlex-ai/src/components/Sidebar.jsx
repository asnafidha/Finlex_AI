import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { companies as companiesApi } from '../services/api';
import { 
  BookOpen, LayoutDashboard, FileText, Calculator, Calendar, BarChart2, 
  Settings, LogOut, Shield, Building, Receipt, FileCheck, GitMerge, 
  ClipboardList, ChevronDown, Check, ArrowDownLeft, Users, TrendingDown,
  Landmark, Scale, CreditCard, Wallet, RefreshCw
} from 'lucide-react';

const navSections = [
  {
    label: 'MAIN',
    items: [
      { id: 'dashboard',    label: 'Dashboard',          icon: LayoutDashboard },
      { id: 'documents',    label: 'AI Documents',        icon: FileText },
      { id: 'multicompany', label: 'CA Mission Control',  icon: Building },
    ]
  },
  {
    label: 'GST & COMPLIANCE',
    items: [
      { id: 'gst',          label: 'GST Invoicing',       icon: Receipt },
      { id: 'gstr',         label: 'GSTR Export',         icon: FileCheck },
      { id: 'itc',          label: 'ITC Reconciliation',  icon: GitMerge },
      { id: 'credit-notes', label: 'Credit / Debit Notes',icon: ArrowDownLeft },
      { id: 'compliance',   label: 'Compliance Calendar', icon: Calendar },
    ]
  },
  {
    label: 'TAX & AUDIT',
    items: [
      { id: 'tds',          label: 'TDS Module',          icon: Calculator },
      { id: 'itr',          label: 'ITR Preparation',     icon: BarChart2 },
      { id: 'advance-tax',  label: 'Advance Tax Planner', icon: CreditCard },
      { id: 'audit',        label: 'Audit & Risk',        icon: Shield },
      { id: 'audit-trail',  label: 'Audit Trail',         icon: ClipboardList },
    ]
  },
  {
    label: 'ACCOUNTING',
    items: [
      { id: 'journals',          label: 'Journal Entries',     icon: BookOpen },
      { id: 'bank-recon',        label: 'Bank Reconciliation', icon: Landmark },
      { id: 'opening-balances',  label: 'Opening Balances',    icon: Scale },
      { id: 'depreciation',      label: 'Depreciation',        icon: TrendingDown },
    ]
  },
  {
    label: 'HR & PAYROLL',
    items: [
      { id: 'payroll', label: 'Payroll', icon: Users },
    ]
  },
];

export default function Sidebar({ page, setPage, onLogout }) {
  const { company, user, selectCompany } = useAuth();
  const [allCompanies, setAllCompanies] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    companiesApi.list()
      .then(data => setAllCompanies(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelectCompany = (co) => {
    selectCompany(co);
    setDropdownOpen(false);
    setPage('dashboard');
    setTimeout(() => setPage(page === 'dashboard' ? 'dashboard' : page), 50);
  };

  return (
    <aside style={{
      width: 260, minHeight: '100vh', background: 'var(--navy)',
      position: 'fixed', left: 0, top: 0, bottom: 0,
      display: 'flex', flexDirection: 'column',
      borderRight: '1px solid rgba(201,168,76,0.15)',
      zIndex: 50,
    }}>
      {/* Logo */}
      <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid rgba(201,168,76,0.12)' }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700,
          background: 'linear-gradient(135deg, #C9A84C, #e2c06e)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 2,
        }}>FinLex AI</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '1px' }}>YOUR CA. ALWAYS ON.</div>
      </div>

      {/* Company Switcher */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'relative' }} ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          style={{
            width: '100%',
            background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)',
            borderRadius: 10, padding: '10px 12px',
            display: 'flex', alignItems: 'center', gap: 10,
            cursor: 'pointer', textAlign: 'left',
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #C9A84C, #e2c06e)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: 'var(--navy)', flexShrink: 0,
          }}>{company?.name?.charAt(0) || 'F'}</div>
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {company?.name || 'Select Company'}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-mono)' }}>
              {company?.gstin || 'No GSTIN'}
            </div>
          </div>
          <ChevronDown size={14} style={{ color: 'rgba(201,168,76,0.6)', flexShrink: 0, transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>

        {dropdownOpen && (
          <div style={{
            position: 'absolute', top: '100%', left: 16, right: 16,
            background: '#1a2340', border: '1px solid rgba(201,168,76,0.2)',
            borderRadius: 10, overflow: 'hidden', zIndex: 100,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <div style={{ padding: '8px 12px 4px', fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '1px', fontWeight: 600 }}>
              SWITCH COMPANY
            </div>
            {allCompanies.length === 0 && (
              <div style={{ padding: '12px', fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                No companies found
              </div>
            )}
            {allCompanies.map(co => (
              <button
                key={co.id}
                onClick={() => handleSelectCompany(co)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', border: 'none',
                  background: company?.id === co.id ? 'rgba(201,168,76,0.1)' : 'transparent',
                  cursor: 'pointer', textAlign: 'left',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: company?.id === co.id ? 'linear-gradient(135deg, #C9A84C, #e2c06e)' : 'rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700,
                  color: company?.id === co.id ? 'var(--navy)' : 'rgba(255,255,255,0.6)',
                  flexShrink: 0,
                }}>{co.name?.charAt(0)}</div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: company?.id === co.id ? 'var(--gold)' : 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {co.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)' }}>
                    {co.gstin || co.pan || 'No GSTIN'}
                  </div>
                </div>
                {company?.id === co.id && <Check size={12} style={{ color: 'var(--gold)', flexShrink: 0 }} />}
              </button>
            ))}
            <button
              onClick={() => { setPage('multicompany'); setDropdownOpen(false); }}
              style={{
                width: '100%', padding: '10px 12px', border: 'none',
                background: 'rgba(201,168,76,0.05)',
                color: 'rgba(201,168,76,0.7)', fontSize: 11, fontWeight: 600,
                cursor: 'pointer', textAlign: 'center', letterSpacing: '0.5px',
              }}
            >
              + ADD / MANAGE COMPANIES
            </button>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {navSections.map(section => (
          <div key={section.label}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.2)', letterSpacing: '1px', padding: '10px 12px 4px' }}>{section.label}</div>
            {section.items.map(({ id, label, icon: Icon }) => {
              const active = page === id;
              return (
                <button
                  key={id}
                  onClick={() => setPage(id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', borderRadius: 9, border: 'none',
                    background: active ? 'rgba(201,168,76,0.12)' : 'transparent',
                    color: active ? 'var(--gold)' : 'rgba(255,255,255,0.5)',
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    cursor: 'pointer', width: '100%', textAlign: 'left',
                    fontFamily: 'var(--font-body)',
                    borderLeft: active ? '3px solid var(--gold)' : '3px solid transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  <Icon size={15} />
                  {label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User + Bottom */}
      <div style={{ padding: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {user && (
          <div style={{ padding: '8px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(201,168,76,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--gold)' }}>
              {user.name?.charAt(0) || 'U'}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--white)' }}>{user.name}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{user.role?.toUpperCase()}</div>
            </div>
          </div>
        )}
        <button
          onClick={() => setPage('settings')}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 13, cursor: 'pointer', width: '100%', textAlign: 'left', fontFamily: 'var(--font-body)', marginBottom: 2 }}
        ><Settings size={14} /> Settings</button>
        <button
          onClick={onLogout}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, border: 'none', background: 'transparent', color: 'rgba(224,82,82,0.7)', fontSize: 13, cursor: 'pointer', width: '100%', textAlign: 'left', fontFamily: 'var(--font-body)' }}
        ><LogOut size={14} /> Logout</button>
      </div>
    </aside>
  );
}