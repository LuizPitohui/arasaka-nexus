'use client';

import { useEffect, useState } from 'react';
import EmployeeForm from '@/components/EmployeeForm';
import EmployeeCard from '@/components/EmployeeCard';

interface Employee {
  id: number;
  full_name: string;
  role: string;
  department: string;
  email: string;
}

export default function Home() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  
  // Estado para saber quem estamos editando (null = ninguém)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const fetchEmployees = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/employees/');
      const data = await response.json();
      setEmployees(data);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  // Quando o form terminar (seja criando ou editando), limpamos a edição e atualizamos a lista
  const handleSuccess = () => {
    setEditingEmployee(null);
    fetchEmployees();
  };

  return (
    <main className="min-h-screen p-8 bg-gray-900 text-gray-100 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10 border-b border-gray-700 pb-4">
          <h1 className="text-5xl font-extrabold text-white tracking-tighter">
            ARASAKA <span className="text-red-600">NEXUS</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1 tracking-widest uppercase">
            System v1.2 // Full Access
          </p>
        </header>

        {/* Passamos o estado de edição para o formulário */}
        <EmployeeForm 
          onSuccess={handleSuccess} 
          employeeToEdit={editingEmployee}
          onCancel={() => setEditingEmployee(null)}
        />

        <h3 className="text-2xl font-bold mb-6 text-gray-400 uppercase border-l-4 border-gray-600 pl-3">
          Ativos Cadastrados
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {employees.map((employee) => (
            <EmployeeCard 
              key={employee.id} 
              employee={employee} 
              onUpdate={fetchEmployees}
              onEdit={(emp) => {
                setEditingEmployee(emp); // Define quem vai ser editado
                window.scrollTo({ top: 0, behavior: 'smooth' }); // Sobe a tela para o form
              }}
            />
          ))}
          
          {employees.length === 0 && (
            <p className="text-gray-600 col-span-full text-center py-10">
              Nenhum agente ativo encontrado.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}