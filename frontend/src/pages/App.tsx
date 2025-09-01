import React, { useEffect, useState } from 'react';
import { ConsultationForm } from '../sections/ConsultationForm';
import axios from 'axios';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';

interface User { email:string; role:string }

const AdminPanel: React.FC<{ user:User; onLogout:()=>void }> = ({ user, onLogout }) => {
  const [list, setList] = useState<any | null>(null);
  useEffect(()=>{ (async()=>{ try { const { data } = await axios.get('/api/consultations/admin'); setList(data);} catch { setList({ error:true }); }})(); },[]);
  return <div>
    <h2 style={{ fontWeight:300 }}>Admin Dashboard</h2>
    <button onClick={onLogout} style={linkBtn}>Logout</button>
    {!list && <p>Loading...</p>}
    {list && list.error && <p>Error loading consultations.</p>}
    {list && list.consultations && <ul style={{ listStyle:'none', padding:0, margin:'1rem 0', fontSize:13 }}>
      {list.consultations.map((c:any)=><li key={c.id} style={{ padding:'0.5rem 0', borderBottom:'1px solid #222' }}>
        <strong>{c.name}</strong> – {c.company} – {new Date(c.createdAt).toLocaleString()}<br/>
        <span style={{ opacity:0.8 }}>{c.email}</span>
      </li>)}
    </ul>}
  </div>;
};

const LoginPage: React.FC<{ onAuth:(u:User)=>void }> = ({ onAuth }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string|null>(null);
  const navigate = useNavigate();
  const submit = async (e:React.FormEvent) => { e.preventDefault(); setError(null); try { const { data } = await axios.post('/api/auth/login',{ email,password }); if (data.ok){ onAuth(data.user); navigate('/admin'); } else setError('Login failed'); } catch(err:any){ setError(err.response?.data?.error || 'Login failed'); } };
  const register = async (e:React.FormEvent) => { e.preventDefault(); setError(null); try { const { data } = await axios.post('/api/auth/register',{ email,password }); if (data.id){ await submit(e); } else setError('Registration failed'); } catch(err:any){ setError(err.response?.data?.error || 'Registration failed'); } };
  return <div style={{ display:'flex', gap:'3rem', flexWrap:'wrap' }}>
    <form onSubmit={submit} style={{ display:'grid', gap:'0.75rem', maxWidth:320 }}>
      <h2 style={{ fontWeight:300, margin:'0 0 0.5rem' }}>Login</h2>
      <input value={email} onChange={e=>setEmail(e.target.value)} placeholder='Email' style={inputStyle}/>
      <input value={password} onChange={e=>setPassword(e.target.value)} type='password' placeholder='Password' style={inputStyle}/>
      <button style={buttonStyle}>Login</button>
      {error && <div style={{ fontSize:12, color:'#f66' }}>{error}</div>}
    </form>
    <form onSubmit={register} style={{ display:'grid', gap:'0.75rem', maxWidth:320 }}>
      <h2 style={{ fontWeight:300, margin:'0 0 0.5rem' }}>Register</h2>
      <input value={email} onChange={e=>setEmail(e.target.value)} placeholder='Email' style={inputStyle}/>
      <input value={password} onChange={e=>setPassword(e.target.value)} type='password' placeholder='Password' style={inputStyle}/>
      <button style={buttonStyle}>Register</button>
    </form>
  </div>;
};

const ProtectedRoute: React.FC<{ user:User|null; children:React.ReactElement }> = ({ user, children }) => {
  if (!user) return <Navigate to="/login" replace/>;
  if (user.role !== 'admin') return <Navigate to="/" replace/>;
  return children;
};

const Home: React.FC = () => (
  <section style={{ marginBottom:'3rem' }}>
    <h2 style={{ fontWeight:300 }}>Free Consultation</h2>
    <p style={{ maxWidth:600, lineHeight:1.5 }}>Tell us about your needs. We will review and follow up to schedule a call within business hours.</p>
    <ConsultationForm />
  </section>
);

const Layout: React.FC<{ user:User|null; children:React.ReactNode; onLogout:()=>void }> = ({ user, children, onLogout }) => (
  <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh' }}>
    <header style={{ padding:'2rem', borderBottom:'1px solid #222' }}>
      <h1 style={{ margin:0, fontWeight:400, letterSpacing:'0.05em' }}>NAT'S ACCOUNTING</h1>
    </header>
    <nav style={{ position:'absolute', top:12, right:16, fontSize:12 }}>
      <Link to="/" style={navLink}>Home</Link>
      {!user && <> <span>| </span><Link to="/login" style={navLink}>Login</Link></>}
      {user && user.role==='admin' && <> <span>| </span><Link to="/admin" style={navLink}>Admin</Link> <span>| </span><button onClick={onLogout} style={linkBtn}>Logout</button></>}
    </nav>
    <main style={{ flex:1, width:'100%', maxWidth:900, margin:'0 auto', padding:'2rem' }}>{children}</main>
    <footer style={{ padding:'2rem', borderTop:'1px solid #222', fontSize:12, textAlign:'center' }}>© {new Date().getFullYear()} Nat's Accounting. All rights reserved.</footer>
  </div>
);

export const App: React.FC = () => {
  const [user, setUser] = useState<User|null>(null);
  const navigate = useNavigate();
  const logout = async () => { await axios.post('/api/auth/logout'); setUser(null); navigate('/'); };
  return <Routes>
    <Route path="/" element={<Layout user={user} onLogout={logout}><Home/></Layout>} />
    <Route path="/login" element={<Layout user={user} onLogout={logout}><LoginPage onAuth={u=>setUser(u)} /></Layout>} />
    <Route path="/admin" element={<Layout user={user} onLogout={logout}><ProtectedRoute user={user}><AdminPanel user={user as User} onLogout={logout}/></ProtectedRoute></Layout>} />
    <Route path="*" element={<Navigate to="/" replace/>} />
  </Routes>;
};

// Wrapper with BrowserRouter for entry-client
export const AppWithRouter: React.FC = () => <BrowserRouter><App/></BrowserRouter>;

const navLink: React.CSSProperties = { color:'#fff', textDecoration:'none', opacity:0.8 };
const linkBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #333",
  color: "#fff",
  padding: "0.4rem 0.75rem",
  cursor: "pointer",
  fontSize: 12,
};
// Minimal reused styles (duplicated from form until shared styling extracted)
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.75rem",
  background: "#111",
  border: "1px solid #222",
  color: "#fff",
  borderRadius: 2,
  fontSize: 13,
};
const buttonStyle: React.CSSProperties = {
  background: "#fff",
  color: "#000",
  padding: "0.6rem 0.9rem",
  border: "none",
  fontWeight: 600,
  cursor: "pointer",
  letterSpacing: "0.05em",
  fontSize: 13,
};
