import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { brand } from '../../content/brand';
import { Shield, Menu, X } from 'lucide-react';

const navLinks = [
  { text: 'Home', href: '/' },
  { text: 'Features', href: '/features' },
  { text: 'About', href: '/about' },
  { text: 'Contact', href: '/contact' },
];

export const PublicLayout: React.FC = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-[#090d16] text-[#f8fafc] flex flex-col">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#090d16]/80 backdrop-blur-xl">
        <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-extrabold text-lg shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/40 transition-shadow">
              <Shield className="w-5 h-5" />
            </div>
            <span className="font-black text-lg tracking-tight text-white hidden sm:inline">
              {brand.name}<span className="text-indigo-400">.</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                  location.pathname === link.href
                    ? 'text-indigo-400 bg-indigo-500/10'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {link.text}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/login"
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition"
            >
              Log In
            </Link>
            <Link
              to="/register"
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transition-shadow"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile Toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </nav>

        {/* Mobile Menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-white/5 bg-[#0b101c] p-4 space-y-2 animate-fade-in">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setMobileOpen(false)}
                className={`block px-4 py-3 rounded-xl text-sm font-semibold transition ${
                  location.pathname === link.href
                    ? 'text-indigo-400 bg-indigo-500/10'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {link.text}
              </Link>
            ))}
            <div className="flex gap-3 pt-3 border-t border-white/5">
              <Link to="/login" onClick={() => setMobileOpen(false)} className="flex-1 text-center px-4 py-3 rounded-xl text-sm font-semibold text-slate-300 border border-white/10 hover:bg-white/5 transition">
                Log In
              </Link>
              <Link to="/register" onClick={() => setMobileOpen(false)} className="flex-1 text-center px-4 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-indigo-500 to-purple-600 text-white transition">
                Get Started
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Page Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-[#070b14]">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                <Shield className="w-4 h-4" />
              </div>
              <span className="font-bold text-sm text-slate-400">
                {brand.name} <span className="text-slate-600">·</span> {brand.productName}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6">
              {brand.footer.links.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-300 transition"
                >
                  {link.text}
                </Link>
              ))}
            </div>
          </div>
          <div className="text-center mt-8 text-[11px] text-slate-600">
            {brand.footer.copyright}
          </div>
        </div>
      </footer>
    </div>
  );
};
