import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });
    if (res.ok) {
      navigate('/dashboard');
    } else {
      setError('Wrong credentials');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      <form onSubmit={submit} className="w-full max-w-sm bg-slate-900 p-6 rounded-xl border border-slate-700">
        <h1 className="text-xl font-semibold mb-4">Nifty Signal Login</h1>
        <input className="w-full mb-3 p-2 rounded bg-slate-800 border border-slate-600" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input type="password" className="w-full mb-3 p-2 rounded bg-slate-800 border border-slate-600" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-red-300 text-sm mb-3">{error}</p>}
        <button className="w-full bg-blue-600 hover:bg-blue-500 rounded p-2">Login</button>
      </form>
    </div>
  );
}
