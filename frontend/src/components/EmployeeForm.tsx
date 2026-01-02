'use client';

import { useState, useEffect } from 'react';

// Precisamos importar ou redefinir a interface aqui também
interface Employee {
  id: number;
  full_name: string;
  role: string;
  department: string;
  email: string;
}

interface Props {
  onSuccess: () => void;
  employeeToEdit: Employee | null; // Novo: recebe quem vamos editar
  onCancel: () => void; // Novo: botão para cancelar edição
}

export default function EmployeeForm({ onSuccess, employeeToEdit, onCancel }: Props) {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    role: 'DEV',
    department: '',
  });

  // Mágica: Quando "employeeToEdit" muda, preenche o formulário
  useEffect(() => {
    if (employeeToEdit) {
      setFormData({
        full_name: employeeToEdit.full_name,
        email: employeeToEdit.email,
        role: employeeToEdit.role,
        department: employeeToEdit.department,
      });
    } else {
      // Se não tem ninguém para editar, limpa o form
      setFormData({ full_name: '', email: '', role: 'DEV', department: '' });
    }
  }, [employeeToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Decide se é CRIAÇÃO (POST) ou EDIÇÃO (PUT)
      const url = employeeToEdit 
        ? `http://localhost:8000/api/employees/${employeeToEdit.id}/` 
        : 'http://localhost:8000/api/employees/';
      
      const method = employeeToEdit ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setFormData({ full_name: '', email: '', role: 'DEV', department: '' });
        onSuccess(); // Avisa o pai que deu certo
      } else {
        const errorData = await response.json();
        alert(`Erro: ${JSON.stringify(errorData)}`);
      }
    } catch (error) {
      console.error('Erro de conexão', error);
      alert('Erro de conexão.');
    }
  };

  return (
    <div className={`p-6 border-l-4 shadow-xl mb-8 transition-colors ${employeeToEdit ? 'bg-gray-800 border-yellow-500' : 'bg-gray-800 border-red-600'}`}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-white uppercase tracking-widest">
          {employeeToEdit ? `Editando: ${employeeToEdit.full_name}` : 'Novo Registro'}
        </h2>
        {employeeToEdit && (
          <button onClick={onCancel} className="text-xs text-yellow-500 hover:text-white underline">
            CANCELAR EDIÇÃO
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input
          type="text"
          placeholder="Nome Completo"
          className="bg-gray-900 text-white p-3 border border-gray-700 focus:border-red-500 outline-none"
          value={formData.full_name}
          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
          required
        />
        <input
          type="email"
          placeholder="Email Corporativo"
          className="bg-gray-900 text-white p-3 border border-gray-700 focus:border-red-500 outline-none"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          required
        />
        <input
          type="text"
          placeholder="Departamento"
          className="bg-gray-900 text-white p-3 border border-gray-700 focus:border-red-500 outline-none"
          value={formData.department}
          onChange={(e) => setFormData({ ...formData, department: e.target.value })}
          required
        />
        <select
          className="bg-gray-900 text-white p-3 border border-gray-700 focus:border-red-500 outline-none"
          value={formData.role}
          onChange={(e) => setFormData({ ...formData, role: e.target.value })}
        >
          <option value="DEV">Developer</option>
          <option value="DES">Designer</option>
          <option value="MGR">Manager</option>
          <option value="SEC">Security</option>
        </select>

        <button
          type="submit"
          className={`md:col-span-2 font-bold py-3 px-6 transition-all uppercase tracking-wider text-white
            ${employeeToEdit ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-red-600 hover:bg-red-700'}`}
        >
          {employeeToEdit ? 'Salvar Alterações' : 'Cadastrar Agente'}
        </button>
      </form>
    </div>
  );
}