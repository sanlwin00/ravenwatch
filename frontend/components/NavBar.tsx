'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { logout } from '@/lib/auth';
import { Eye, LogOut, Users, Settings } from 'lucide-react';

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    logout();
    router.push('/login');
  }

  const links = [
    { href: '/', label: 'Dashboard' },
    { href: '/entities', label: 'Entities' },
    { href: '/settings', label: 'Settings' },
  ];

  return (
    <nav
      className="border-b px-6 py-3"
      style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 text-blue-400 font-semibold text-lg">
            <Eye size={20} />
            RavenWatch
          </Link>

          <div className="flex items-center gap-1">
            {links.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-1.5 rounded text-sm transition-colors ${
                    active
                      ? 'bg-blue-600/20 text-blue-400'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </nav>
  );
}
