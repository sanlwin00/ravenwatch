'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { logout } from '@/lib/auth';
import { Eye, LogOut, LayoutDashboard, Users, Settings } from 'lucide-react';

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    logout();
    router.push('/login');
  }

  const links = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/entities', label: 'Entities', icon: Users },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav
      className="border-b px-4 py-3"
      style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 text-blue-400 font-semibold text-base shrink-0">
          <Eye size={20} />
          <span className="hidden xs:inline sm:inline">RavenWatch</span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-0.5 mx-3">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm transition-colors ${
                  active
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <Icon size={15} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors shrink-0"
        >
          <LogOut size={15} />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </nav>
  );
}
