'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';

interface Employee {
  id: number;
  full_name: string;
  role: string;
  department: string;
  email: string;
  photo?: string; // Novo campo opcional
}

interface Props {
  onSuccess: () => void;
  employeeToEdit: Employee | null;
  onCancel: () => void;
}

export default function EmployeeForm({ onSuccess, employeeToEdit, onCancel }: Props) {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    role: 'DEV',
    department: '',
  });
  
  // Estado separado para o arquivo da foto
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  
  // Ref para limpar o input de arquivo depois
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (employeeToEdit) {
      setFormData({
        full_name: employeeToEdit.full_name,
        email: employeeToEdit.email,
        role: employeeToEdit.role,
        department: employeeToEdit.department,
      });
      setPhotoFile(null); // Reseta a foto nova ao editar
    } else {
      setFormData({ full_name: '', email: '', role: 'DEV', department: '' });
      setPhotoFile(null);
    }
  }, [employeeToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const loadingToast = toast.loading('Uploading biometric data...');

    try {
      const url = employeeToEdit 
        ? `http://localhost:8000/api/employees/${employeeToEdit.id}/` 
        : 'http://localhost:8000/api/employees/';
      
      const method = employeeToEdit ? 'PATCH' : 'POST';
      const token = localStorage.getItem('access_token');

      // --- MUDANÇA CRÍTICA: USAR FORMDATA ---
      const data = new FormData();
      data.append('full_name', formData.full_name);
      data.append('email', formData.email);
      data.append('role', formData.role);
      data.append('department', formData.department);
      
      // Só anexa a foto se o usuário selecionou uma nova
      if (photoFile) {
        data.append('photo', photoFile);
      }
      // --------------------------------------

      const response = await fetch(url, {
        method: method,
        headers: { 
          // NÃO colocar 'Content-Type': 'application/json' aqui!
          // O navegador define automaticamente o boundary do multipart
          'Authorization': `Bearer ${token}`
        },
        body: data, // Envia o objeto FormData direto
      });

      toast.dismiss(loadingToast);

      if (response.ok) {
        setFormData({ full_name: '', email: '', role: 'DEV', department: '' });
        setPhotoFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        
        onSuccess();
        toast.success('Asset Updated Successfully.', { style: { borderColor: '#16a34a' } });
      } else {
        const errorData = await response.json();
        toast.error(`Error: ${JSON.stringify(errorData)}`);
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error(error);
      toast.error('Upload Failed.');
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

        {/* --- INPUT DE ARQUIVO NOVO --- */}
        <div className="md:col-span-2">
          <label className="block text-xs text-gray-500 uppercase tracking-widest mb-2">Foto de Perfil (Opcional)</label>
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-400
              file:mr-4 file:py-2 file:px-4
              file:border-0 file:text-sm file:font-semibold
              file:bg-red-900 file:text-white
              hover:file:bg-red-700 cursor-pointer bg-gray-900 border border-gray-700"
          />
        </div>

        <button
          type="submit"
          className={`md:col-span-2 font-bold py-3 px-6 transition-all uppercase tracking-wider text-white mt-2
            ${employeeToEdit ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-red-600 hover:bg-red-700'}`}
        >
          {employeeToEdit ? 'Salvar Alterações' : 'Cadastrar Agente'}
        </button>
      </form>
    </div>
  );
}