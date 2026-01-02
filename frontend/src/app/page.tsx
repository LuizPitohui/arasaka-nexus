'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import EmployeeForm from '@/components/EmployeeForm';
import EmployeeCard from '@/components/EmployeeCard';
import DashboardStats from '@/components/DashboardStats';
import SearchBar from '@/components/SearchBar';
import DepartmentChart from '@/components/DepartmentChart'; // <--- Import Restaurado

interface Employee {
  id: number;
  full_name: string;
  role: string;
  department: string;
  email: string;
}

export default function Home() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Pega o Token para autorizar as requisições
  const getAuthHeaders = () => {
    const token = localStorage.getItem('access_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  const fetchEmployees = useCallback(async (query: string = '') => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      const url = query 
        ? `http://localhost:8000/api/employees/?search=${query}`
        : 'http://localhost:8000/api/employees/';
        
      const response = await fetch(url, {
        headers: getAuthHeaders()
      });

      if (response.status === 401) {
        handleLogout(); // Se o token venceu, faz logout
        return;
      }

      const data = await response.json();
      setEmployees(data);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    }
  }, [router]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEmployees(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchEmployees]);

  const handleSuccess = () => {
    setEditingEmployee(null);
    fetchEmployees(searchQuery);
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    router.push('/login');
  };

  return (
    <main className="min-h-screen p-8 bg-gray-900 text-gray-100 font-sans">
      <div className="max-w-6xl mx-auto">
        {/* CABEÇALHO */}
        <header className="mb-8 border-b border-gray-700 pb-4 flex justify-between items-end">
          <div>
            <h1 className="text-5xl font-extrabold text-white tracking-tighter">
              ARASAKA <span className="text-red-600">NEXUS</span>
            </h1>
            <p className="text-gray-500 text-sm mt-1 tracking-widest uppercase">
              Secure Database // Authorized Personnel Only
            </p>
          </div>
          
          <button 
            onClick={handleLogout}
            className="text-xs text-red-500 border border-red-900 px-4 py-2 hover:bg-red-900/30 transition-colors uppercase tracking-widest"
          >
            Terminate Session
          </button>
        </header>

        {/* ESTATÍSTICAS NO TOPO */}
        <DashboardStats employees={employees} />

        {/* --- ÁREA VISUAL (GRÁFICO + LOGS) RESTAURADA --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Gráfico de Departamentos */}
          <div className="lg:col-span-2">
            <DepartmentChart employees={employees} />
          </div>
          
          {/* Card de Logs (Placeholder) */}
          <div className="border border-dashed border-gray-800 bg-black/30 flex items-center justify-center p-6 text-gray-600 text-sm font-mono uppercase h-[300px]">
            System Logs (Offline)
            <br />
            Monitoring disabled
          </div>
        </div>

        {/* BARRA DE BUSCA */}
        <SearchBar onSearch={setSearchQuery} />
        
        {/* FORMULÁRIO DE CADASTRO/EDIÇÃO */}
        <EmployeeForm 
          onSuccess={handleSuccess} 
          employeeToEdit={editingEmployee}
          onCancel={() => setEditingEmployee(null)}
        />

        {/* TÍTULO DA LISTA */}
        <div className="flex items-center justify-between mb-6 mt-10 border-l-4 border-gray-600 pl-3">
          <h3 className="text-2xl font-bold text-gray-400 uppercase">
            Resultados da Consulta
          </h3>
          <span className="text-xs font-mono text-gray-600">
            {employees.length} RECORD(S) FOUND
          </span>
        </div>
        
        {/* LISTA DE CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {employees.map((employee) => (
            <EmployeeCard 
              key={employee.id} 
              employee={employee} 
              onUpdate={() => fetchEmployees(searchQuery)}
              onEdit={(emp) => {
                setEditingEmployee(emp);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          ))}
          
          {employees.length === 0 && (
            <div className="col-span-full text-center py-20 border border-dashed border-gray-800 rounded bg-black/50">
              <p className="text-gray-500 font-mono text-lg">NO DATA FOUND</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}