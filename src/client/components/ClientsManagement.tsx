import React, { useState, useEffect } from 'react';
import { http } from '../lib/http';
import styles from './ClientsManagement.module.css';

interface Client {
  _id: string;
  name: string;
  logoUrl?: string;
  website?: string;
  color: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const ClientsManagement: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    website: '',
    color: '#798C8C',
    displayOrder: 0,
    isActive: true
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      setLoading(true);
      const response = await http.get<{ clients: Client[] }>('/api/clients/admin/all');
      setClients(response.clients);
    } catch (error) {
      console.error('Error loading clients:', error);
      alert('Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setUploading(true);
      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      formDataToSend.append('website', formData.website);
      formDataToSend.append('color', formData.color);
      formDataToSend.append('displayOrder', formData.displayOrder.toString());
      formDataToSend.append('isActive', formData.isActive.toString());
      
      if (logoFile) {
        formDataToSend.append('logo', logoFile);
      }

      const url = editingClient ? `/api/clients/${editingClient._id}` : '/api/clients';
      const method = editingClient ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        credentials: 'include',
        body: formDataToSend
      });

      if (!response.ok) {
        throw new Error('Failed to save client');
      }

      await loadClients();
      resetForm();
      setShowAddModal(false);
      setEditingClient(null);
    } catch (error) {
      console.error('Error saving client:', error);
      alert('Failed to save client');
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      name: client.name,
      website: client.website || '',
      color: client.color,
      displayOrder: client.displayOrder,
      isActive: client.isActive
    });
    setLogoFile(null);
    setShowAddModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this client?')) return;

    try {
      await http.del(`/api/clients/${id}`);
      await loadClients();
    } catch (error) {
      console.error('Error deleting client:', error);
      alert('Failed to delete client');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      website: '',
      color: '#798C8C',
      displayOrder: 0,
      isActive: true
    });
    setLogoFile(null);
    setEditingClient(null);
  };

  const handleCancel = () => {
    resetForm();
    setShowAddModal(false);
  };

  if (loading) {
    return <div className={styles.loading}>Loading clients...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Client Management</h2>
        <button 
          onClick={() => setShowAddModal(true)}
          className={styles.addButton}
        >
          + Add Client
        </button>
      </div>

      <div className={styles.clientsGrid}>
        {clients.map((client) => (
          <div key={client._id} className={styles.clientCard}>
            <div className={styles.clientPreview}>
              {client.logoUrl ? (
                <img 
                  src={`/api/clients/${client._id}/logo`} 
                  alt={client.name}
                  className={styles.clientLogo}
                />
              ) : (
                <div className={styles.clientNamePlaceholder}>
                  {client.name}
                </div>
              )}
            </div>
            <div className={styles.clientInfo}>
              <h3>{client.name}</h3>
              {client.website && (
                <a href={client.website} target="_blank" rel="noopener noreferrer" className={styles.website}>
                  {client.website}
                </a>
              )}
              <div className={styles.clientMeta}>
                <span className={styles.colorChip} style={{ backgroundColor: client.color }}>
                  {client.color}
                </span>
                <span className={styles.statusBadge} data-active={client.isActive}>
                  {client.isActive ? 'Active' : 'Inactive'}
                </span>
                <span className={styles.orderBadge}>Order: {client.displayOrder}</span>
              </div>
            </div>
            <div className={styles.clientActions}>
              <button onClick={() => handleEdit(client)} className={styles.editButton}>
                Edit
              </button>
              <button onClick={() => handleDelete(client._id)} className={styles.deleteButton}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3>{editingClient ? 'Edit Client' : 'Add Client'}</h3>
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formGroup}>
                <label>Client Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className={styles.input}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Website URL</label>
                <input
                  type="url"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  placeholder="https://example.com"
                  className={styles.input}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Brand Color</label>
                <div className={styles.colorInputGroup}>
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className={styles.colorInput}
                  />
                  <input
                    type="text"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className={styles.input}
                    style={{ flex: 1 }}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Display Order</label>
                <input
                  type="number"
                  value={formData.displayOrder}
                  onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) })}
                  className={styles.input}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Logo Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                  className={styles.fileInput}
                />
                {logoFile && <p className={styles.fileName}>{logoFile.name}</p>}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  />
                  Active (Display on website)
                </label>
              </div>

              <div className={styles.modalActions}>
                <button type="button" onClick={handleCancel} className={styles.cancelButton}>
                  Cancel
                </button>
                <button type="submit" disabled={uploading} className={styles.saveButton}>
                  {uploading ? 'Saving...' : editingClient ? 'Update Client' : 'Add Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
