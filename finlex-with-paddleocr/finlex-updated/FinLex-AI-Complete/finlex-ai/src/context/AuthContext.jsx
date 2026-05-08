import { createContext, useContext, useState, useEffect } from 'react'
import { auth, saveToken, clearToken } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null)
  const [company, setCompany]   = useState(null)
  const [loading, setLoading]   = useState(true)

  // On app load, check if token exists and fetch user
  useEffect(() => {
    const token = localStorage.getItem('finlex_token')
    if (token) {
      auth.me()
        .then(u => setUser(u))
        .catch(() => clearToken())
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }

    // Load saved company
    const savedCompany = localStorage.getItem('finlex_company')
    if (savedCompany) setCompany(JSON.parse(savedCompany))
  }, [])

  const login = async (email, password) => {
    const res = await auth.login(email, password)
    saveToken(res.token)
    setUser(res.user)
    return res
  }

  const logout = () => {
    clearToken()
    localStorage.removeItem('finlex_company')
    setUser(null)
    setCompany(null)
  }

  const selectCompany = (co) => {
    setCompany(co)
    localStorage.setItem('finlex_company', JSON.stringify(co))
  }

  return (
    <AuthContext.Provider value={{ user, company, loading, login, logout, selectCompany }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)