import React, { useEffect, useState } from 'react';
import { http } from '../lib/http';
import { Folder, File, ChevronRight } from 'lucide-react';
import styles from './AdminDocumentsSection.module.css';

interface Document {
    _id: string;
    filename: string;
    uploadDate: string;
    length: number;
    contentType: string;
    description: string;
    uploadedBy: string;
    folder: string | null;
    folderColor: string | null;
}

interface UserSummary {
    userId: string;
    email: string;
    company: string | null;
    displayName: string;
    documentCount: number;
}

interface UserDocuments {
    userId: string;
    email: string;
    company: string | null;
    displayName: string;
    documents: Document[];
}

interface Folder {
    name: string;
    color: string | null;
    count: number;
}

export const AdminDocumentsSection: React.FC = () => {
    const [users, setUsers] = useState<UserSummary[]>([]);
    const [selectedUser, setSelectedUser] = useState<UserDocuments | null>(null);
    const [folders, setFolders] = useState<Folder[]>([]);
    const [currentFolder, setCurrentFolder] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
    const [showFolderModal, setShowFolderModal] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderColor, setNewFolderColor] = useState('#4a9eff');

    useEffect(() => {
        loadUsers();
    }, []);

    const getCurrentFolders = () => {
        // Get all unique folders in current directory (supports nested folders with '/' separator)
        const currentPath = currentFolder || "";
        
        const foldersInCurrentDir = new Map<string, { name: string; color: string | null; count: number }>();
        
        folders.forEach((folder) => {
            const folderPath = folder.name;
            
            // Check if this folder is in current directory or a subdirectory
            if (currentPath === "") {
                // At root: show top-level folders
                const firstSegment = folderPath.includes("/") ? folderPath.split("/")[0] : folderPath;
                if (!foldersInCurrentDir.has(firstSegment)) {
                    foldersInCurrentDir.set(firstSegment, {
                        name: firstSegment,
                        color: folder.color,
                        count: 0,
                    });
                }
                foldersInCurrentDir.get(firstSegment)!.count += folder.count;
            } else if (folderPath.startsWith(currentPath + "/")) {
                // Inside a folder: show immediate subfolders
                const relativePath = folderPath.substring(currentPath.length + 1);
                const nextSegment = relativePath.includes("/") ? relativePath.split("/")[0] : relativePath;
                const fullPath = currentPath + "/" + nextSegment;
                
                if (!foldersInCurrentDir.has(fullPath)) {
                    foldersInCurrentDir.set(fullPath, {
                        name: fullPath,
                        color: folder.color,
                        count: 0,
                    });
                }
                foldersInCurrentDir.get(fullPath)!.count += folder.count;
            }
            // Note: We don't show the current folder itself - only its subfolders and files
        });
        
        return Array.from(foldersInCurrentDir.values());
    };

    const handleFolderClick = (folderPath: string) => {
        setCurrentFolder(folderPath);
        setSelectedFiles(new Set());
    };

    const handleBackToRoot = () => {
        setCurrentFolder(null);
        setSelectedFiles(new Set());
    };

    const handleNavigateUp = () => {
        if (!currentFolder) return;
        const segments = currentFolder.split("/");
        if (segments.length === 1) {
            setCurrentFolder(null);
        } else {
            setCurrentFolder(segments.slice(0, -1).join("/"));
        }
        setSelectedFiles(new Set());
    };

    const getBreadcrumbs = () => {
        if (!currentFolder) return [];
        return currentFolder.split("/");
    };

    const loadUsers = async () => {
        try {
            setLoading(true);
            setError(null);
            setSelectedUser(null);
            setCurrentFolder(null);
            const data = await http.get<UserSummary[]>('/api/client/documents/admin/users');
            setUsers(data);
        } catch (err: any) {
            console.error('Failed to load users:', err);
            setError(err.message || 'Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    const loadUserDocuments = async (userId: string) => {
        try {
            setLoading(true);
            setError(null);
            const data = await http.get<UserDocuments>(`/api/client/documents/admin/user/${userId}`);
            setSelectedUser(data);
            
            // Load folders for this user
            const foldersData = await http.get<Folder[]>(`/api/client/documents/folders?userId=${userId}`);
            setFolders(foldersData);
            setSelectedFiles(new Set());
        } catch (err: any) {
            console.error('Failed to load user documents:', err);
            setError(err.message || 'Failed to load documents');
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async (fileId: string, filename: string) => {
        try {
            const response = await fetch(`/api/client/documents/${fileId}`, {
                credentials: 'include',
            });

            if (!response.ok) {
                throw new Error('Download failed');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Download error:', err);
            alert('Failed to download file');
        }
    };

    const handleDelete = async (fileId: string) => {
        if (!confirm('Are you sure you want to delete this file?')) {
            return;
        }

        try {
            await http.del(`/api/client/documents/${fileId}`);
            
            // Reload user documents
            if (selectedUser) {
                await loadUserDocuments(selectedUser.userId);
            }
        } catch (err: any) {
            console.error('Delete error:', err);
            alert(err.message || 'Failed to delete file');
        }
    };

    const toggleFileSelection = (fileId: string) => {
        setSelectedFiles(prev => {
            const next = new Set(prev);
            if (next.has(fileId)) {
                next.delete(fileId);
            } else {
                next.add(fileId);
            }
            return next;
        });
    };

    const handleMoveToFolder = async () => {
        if (selectedFiles.size === 0) {
            alert('Please select files to move');
            return;
        }

        if (!newFolderName.trim()) {
            alert('Please enter a folder name');
            return;
        }

        try {
            await http.post('/api/client/documents/folder/move', {
                fileIds: Array.from(selectedFiles),
                folder: newFolderName.trim(),
                folderColor: newFolderColor,
            });

            setShowFolderModal(false);
            setNewFolderName('');
            setNewFolderColor('#4a9eff');
            setSelectedFiles(new Set());

            // Reload user documents
            if (selectedUser) {
                await loadUserDocuments(selectedUser.userId);
            }
        } catch (err: any) {
            console.error('Move to folder error:', err);
            alert(err.message || 'Failed to move files');
        }
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const formatDate = (dateString: string): string => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getFilteredDocuments = () => {
        if (!selectedUser) return [];
        // Show only files in current folder (or root if currentFolder is null)
        return selectedUser.documents.filter(doc => doc.folder === currentFolder);
    };

    const filteredDocs = getFilteredDocuments();
    const currentFolders = getCurrentFolders();

    if (loading && !selectedUser) {
        return (
            <div className={styles.container}>
                <h2>Client Documents</h2>
                <div className={styles.loading}>Loading clients...</div>
            </div>
        );
    }

    if (error && !selectedUser) {
        return (
            <div className={styles.container}>
                <h2>Client Documents</h2>
                <div className={styles.error}>{error}</div>
                <button onClick={loadUsers} className={styles.retryButton}>
                    Retry
                </button>
            </div>
        );
    }

    // User list view
    if (!selectedUser) {
        if (users.length === 0) {
            return (
                <div className={styles.container}>
                    <h2>Client Documents</h2>
                    <div className={styles.empty}>No documents uploaded yet</div>
                </div>
            );
        }

        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h2>Client Documents</h2>
                    <div className={styles.stats}>
                        <span className={styles.stat}>{users.length} clients</span>
                        <button onClick={loadUsers} className={styles.refreshButton}>
                            ↻ Refresh
                        </button>
                    </div>
                </div>

                <div className={styles.usersList}>
                    {users.map(user => (
                        <div 
                            key={user.userId} 
                            className={styles.userCard}
                            onClick={() => loadUserDocuments(user.userId)}
                        >
                            <div className={styles.userInfo}>
                                <h3 className={styles.displayName}>
                                    {user.company || user.email}
                                </h3>
                                {user.company && (
                                    <div className={styles.email}>{user.email}</div>
                                )}
                            </div>
                            <div className={styles.docCount}>
                                {user.documentCount} {user.documentCount === 1 ? 'file' : 'files'} →
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Document view for selected user
    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <button onClick={loadUsers} className={`${styles.backButton} btn btn--outline`}>
                        ← Back to Clients
                    </button>
                    <h2>{selectedUser.displayName}</h2>
                    {selectedUser.company && (
                        <div className={styles.email}>{selectedUser.email}</div>
                    )}
                </div>
                <div className={styles.stats}>
                    <span className={styles.stat}>{selectedUser.documents.length} files</span>
                    {selectedFiles.size > 0 && (
                        <button onClick={() => setShowFolderModal(true)} className={`${styles.folderButton} btn btn--primary`}>
                            📁 Move {selectedFiles.size} to Folder
                        </button>
                    )}
                </div>
            </div>

            {/* Breadcrumb Navigation */}
            {currentFolder && (
                <div className={styles.breadcrumbs}>
                    <button onClick={handleBackToRoot} className={`${styles.breadcrumbButton} btn btn--outline`}>
                        <Folder size={18} style={{ marginRight: '4px' }} />
                        {selectedUser?.company ? `${selectedUser.company}'s Workspace` : `${selectedUser?.email}'s Workspace`}
                    </button>
                    {getBreadcrumbs().map((segment, index) => {
                        const path = getBreadcrumbs().slice(0, index + 1).join("/");
                        const isLast = index === getBreadcrumbs().length - 1;
                        return (
                            <React.Fragment key={path}>
                                <ChevronRight size={16} className={styles.breadcrumbSeparator} />
                                {isLast ? (
                                    <span className={styles.breadcrumbCurrent}>{segment}</span>
                                ) : (
                                    <button onClick={() => setCurrentFolder(path)} className={`${styles.breadcrumbButton} btn btn--outline`}>
                                        {segment}
                                    </button>
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            )}

            {/* Folders Grid */}
            {currentFolders.length > 0 && (
                <div className={styles.foldersGrid}>
                    {currentFolders.map((folder) => {
                        const displayName = folder.name.split("/").pop() || folder.name;
                        const folderColor = folder.color || "#4a9eff";
                        return (
                            <div
                                key={folder.name}
                                className={styles.folderCard}
                                onClick={() => handleFolderClick(folder.name)}
                            >
                                <div className={styles.folderIcon}>
                                    <Folder 
                                        size={48} 
                                        color={folderColor} 
                                        fill={folderColor} 
                                        fillOpacity={0.2} 
                                    />
                                </div>
                                <div className={styles.folderDetails}>
                                    <div className={styles.folderName}>{displayName}</div>
                                    <div className={styles.folderCount}>{folder.count} files</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {loading ? (
                <div className={styles.loading}>Loading documents...</div>
            ) : filteredDocs.length === 0 ? (
                <div className={styles.empty}>No documents in this view</div>
            ) : (
                <div className={styles.documentsGrid}>
                    {filteredDocs.map(doc => (
                        <div key={doc._id} className={styles.documentCard}>
                            <input
                                type="checkbox"
                                checked={selectedFiles.has(doc._id)}
                                onChange={() => toggleFileSelection(doc._id)}
                                className={styles.checkbox}
                            />
                            <div className={styles.docHeader}>
                                <div className={styles.docIcon}>
                                    <File size={48} color="#64748b" />
                                </div>
                                <div className={styles.docInfo}>
                                    <div className={styles.filename}>{doc.filename}</div>
                                    <div className={styles.docMeta}>
                                        <span>{formatFileSize(doc.length)}</span>
                                        <span>•</span>
                                        <span>{formatDate(doc.uploadDate)}</span>
                                    </div>
                                    {doc.description && (
                                        <div className={styles.description}>
                                            {doc.description}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className={styles.docActions}>
                                <button
                                    onClick={() => handleDownload(doc._id, doc.filename)}
                                    className={`${styles.downloadButton} btn btn--outline`}
                                    title="Download"
                                >
                                    ⬇
                                </button>
                                <button
                                    onClick={() => handleDelete(doc._id)}
                                    className={`${styles.deleteButton} btn btn--danger`}
                                    title="Delete"
                                >
                                    🗑
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showFolderModal && (
                <div className={styles.modal} onClick={() => setShowFolderModal(false)}>
                    <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                        <h3>Move to Folder</h3>
                        <p className={styles.modalDesc}>
                            Moving {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''}
                        </p>
                        <div className={styles.folderSelect}>
                            <label>Folder Name</label>
                            <input
                                type="text"
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                placeholder="Enter folder name"
                                className={styles.input}
                            />
                        </div>
                        <div className={styles.folderSelect}>
                            <label>Folder Color</label>
                            <input
                                type="color"
                                value={newFolderColor}
                                onChange={(e) => setNewFolderColor(e.target.value)}
                                className={styles.colorInput}
                            />
                        </div>
                        {folders.length > 0 && (
                            <div className={styles.existingFolders}>
                                <label>Or choose existing:</label>
                                {folders.map(folder => (
                                    <button
                                        key={folder.name}
                                        className={styles.existingFolderBtn}
                                        onClick={() => {
                                            setNewFolderName(folder.name);
                                            setNewFolderColor(folder.color || '#4a9eff');
                                        }}
                                    >
                                        <span style={{ color: folder.color || undefined }}>📁</span> {folder.name}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className={styles.modalActions}>
                            <button onClick={() => setShowFolderModal(false)} className={`${styles.cancelButton} btn btn--outline`}>
                                Cancel
                            </button>
                            <button onClick={handleMoveToFolder} className={`${styles.confirmButton} btn btn--primary`}>
                                Move Files
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
