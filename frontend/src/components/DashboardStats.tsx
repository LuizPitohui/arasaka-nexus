'use client';

interface Employee {
  id: number;
  role: string;
  department: string;
}

interface Props {
  employees: Employee[];
}

export default function DashboardStats({ employees }: Props) {
  const total = employees.length;
  const devCount = employees.filter(e => e.role === 'DEV').length;
  const desCount = employees.filter(e => e.role === 'DES').length;
  const mgrCount = employees.filter(e => e.role === 'MGR').length;
  const secCount = employees.filter(e => e.role === 'SEC').length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {/* 1. TOTAL PERSONNEL */}
      <div className="group bg-black border border-gray-800 p-4 hover:border-red-600 transition-colors duration-300">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-gray-500 text-[10px] uppercase tracking-[0.2em] font-bold">Total Personnel</h3>
            <p className="text-3xl font-bold text-white mt-1 group-hover:text-red-500 transition-colors">{total}</p>
          </div>
          {/* Ícone de Usuários */}
          <svg className="w-6 h-6 text-gray-700 group-hover:text-red-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
      </div>

      {/* 2. R&D (Developers) */}
      <div className="group bg-black border border-gray-800 p-4 hover:border-blue-500 transition-colors duration-300">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-gray-500 text-[10px] uppercase tracking-[0.2em] font-bold">R&D Division</h3>
            <p className="text-3xl font-bold text-white mt-1 group-hover:text-blue-400 transition-colors">{devCount}</p>
          </div>
          {/* Ícone de Código/Terminal */}
          <svg className="w-6 h-6 text-gray-700 group-hover:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        </div>
      </div>

      {/* 3. SECURITY (Netrunners) */}
      <div className="group bg-black border border-gray-800 p-4 hover:border-green-500 transition-colors duration-300">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-gray-500 text-[10px] uppercase tracking-[0.2em] font-bold">Security Ops</h3>
            <p className="text-3xl font-bold text-white mt-1 group-hover:text-green-400 transition-colors">{secCount}</p>
          </div>
          {/* Ícone de Escudo */}
          <svg className="w-6 h-6 text-gray-700 group-hover:text-green-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
      </div>

      {/* 4. MANAGEMENT */}
      <div className="group bg-black border border-gray-800 p-4 hover:border-yellow-500 transition-colors duration-300">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-gray-500 text-[10px] uppercase tracking-[0.2em] font-bold">Administration</h3>
            <p className="text-3xl font-bold text-white mt-1 group-hover:text-yellow-400 transition-colors">{desCount + mgrCount}</p>
          </div>
          {/* Ícone de Crachá/Pasta */}
          <svg className="w-6 h-6 text-gray-700 group-hover:text-yellow-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
      </div>
    </div>
  );
}