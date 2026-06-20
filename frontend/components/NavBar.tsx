'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { logout } from '@/lib/auth';
import { Eye, LogOut, LayoutDashboard, Users, Settings, Menu, X, TrendingUp } from 'lucide-react';

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function handleLogout() {
    logout();
    router.push('/login');
  }

  const links = [
    { href: '/', label: 'Feed', icon: LayoutDashboard },
    { href: '/entities', label: 'Watchlist', icon: Users },
    { href: '/trends', label: 'Trends', icon: TrendingUp },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav
      className="border-b"
      style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
    >
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 text-blue-400 font-semibold text-base shrink-0">
          <Eye size={20} />
          <span>RavenWatch</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-0.5 mx-3">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm transition-colors ${
                  active ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <Icon size={15} />
                <span className="text-xs">{label}</span>
              </Link>
            );
          })}
        </div>

        {/* Desktop logout */}
        <button
          onClick={handleLogout}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors shrink-0"
        >
          <LogOut size={15} />
        </button>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(o => !o)}
          className="sm:hidden p-2 rounded text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
          aria-label="Toggle menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div
          className="sm:hidden border-t px-4 py-3 space-y-1"
          style={{ borderColor: '#2a2d3a' }}
        >
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300 hover:text-slate-100 hover:bg-white/5'
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
          <button
            onClick={() => { setOpen(false); handleLogout(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors mt-1"
          >
            <LogOut size={16} />
            Log out
          </button>
        </div>
      )}
    </nav>
  );
}
