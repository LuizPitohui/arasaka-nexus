'use client';

import { useEffect, useState, useCallback } from 'react';
import EmployeeForm from '@/components/EmployeeForm';
import EmployeeCard from '@/components/EmployeeCard';
import DashboardStats from '@/components/DashboardStats';
import SearchBar from '@/components/SearchBar'; // <--- Import Novo
import DepartmentChart from '@/components/DepartmentChart';

interface Employee {
  id: number;
  full_name: string;
  role: string;
  department: string;
  email: string;
}

export default function Home() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [searchQuery, setSearchQuery] = useState(''); // <--- Estado da Busca

  // Função inteligente: busca todos OU busca filtrado
  const fetchEmployees = useCallback(async (query: string = '') => {
    try {
      // Se tiver query, adiciona ?search=... na URL
      const url = query 
        ? `http://localhost:8000/api/employees/?search=${query}`
        : 'http://localhost:8000/api/employees/';
        
      const response = await fetch(url);
      const data = await response.json();
      setEmployees(data);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    }
  }, []);

  // Carrega inicial
  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Efeito "Debounce": Espera você parar de digitar para buscar (performance)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEmployees(searchQuery);
    }, 500); // Espera 0.5s após parar de digitar

    return () => clearTimeout(timer);
  }, [searchQuery, fetchEmployees]);

  const handleSuccess = () => {
    setEditingEmployee(null);
    fetchEmployees(searchQuery); // Mantém a busca atual ao recarregar
  };

  return (
    <main className="min-h-screen p-8 bg-gray-900 text-gray-100 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 border-b border-gray-700 pb-4">
          <h1 className="text-5xl font-extrabold text-white tracking-tighter">
            ARASAKA <span className="text-red-600">NEXUS</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1 tracking-widest uppercase">
            Personnel Database v2.0 // Search Enabled
          </p>
        </header>

        <DashboardStats employees={employees} />

        {/* --- GRÁFICO NOVO AQUI --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* O gráfico ocupa 2/3 da largura em telas grandes */}
          <div className="lg:col-span-2">
            <DepartmentChart employees={employees} />
          </div>

          {/* Espaço reservado para futuro widget (ex: Logs recentes) */}
          <div className="border border-dashed border-gray-800 bg-black/30 flex items-center justify-center p-6 text-gray-600 text-sm font-mono uppercase">
            System Logs (Offline)
          </div>
        </div>
        {/* --- BARRA DE BUSCA NOVA --- */}
        <SearchBar onSearch={setSearchQuery} />
        
        <EmployeeForm 
          onSuccess={handleSuccess} 
          employeeToEdit={editingEmployee}
          onCancel={() => setEditingEmployee(null)}
        />

        <div className="flex items-center justify-between mb-6 mt-10 border-l-4 border-gray-600 pl-3">
          <h3 className="text-2xl font-bold text-gray-400 uppercase">
            Resultados da Consulta
          </h3>
          <span className="text-xs font-mono text-gray-600">
            {employees.length} RECORD(S) FOUND
          </span>
        </div>
        
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
              <p className="text-gray-500 font-mono text-lg">NO DATA FOUND FOR "{searchQuery}"</p>
              <p className="text-gray-700 text-sm mt-2">Check syntax or clear filters.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}