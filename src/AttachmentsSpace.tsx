import React, { useState, useEffect } from "react";
import { FileText, Download, AlertCircle, RefreshCw, Trophy } from "lucide-react";

interface DriveFile {
  id: string;
  name: string;
  webViewLink: string;
  webContentLink: string;
  downloadCount?: number;
}

export default function AttachmentsSpace({ isSuperAdmin, userEmail, allowDownloadAttachments = true }: { isSuperAdmin: boolean; userEmail: string; allowDownloadAttachments?: boolean }) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [folderId, setFolderId] = useState<string>("");
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const fetchConfig = async () => {
    try {
      const response = await fetch("/api/config/drive");
      if (response.ok) {
        const data = await response.json();
        const id = data.folderId || "";
        setFolderId(id);
        return id;
      }
    } catch (err) {
      console.log("Config fetch error", err);
    }
    return null;
  };

  const saveConfig = async () => {
    if (!folderId || !folderId.trim()) {
      alert("Veuillez saisir un ID de dossier valide.");
      return;
    }
    setSavingConfig(true);
    try {
      const response = await fetch("/api/config/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: folderId.trim(), requesterEmail: userEmail }),
      });
      const data = await response.json();
      if (response.ok) {
        setIsConfiguring(false);
        fetchFiles(folderId);
        alert(data.message || "ID de dossier Google Drive enregistré avec succès !");
      } else {
        alert("Erreur: " + (data.error || "Échec de l'enregistrement de l'ID"));
      }
    } catch (err: any) {
      alert("Erreur réseau: " + err.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const fetchFiles = async (fId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const token = (window as any).__GOOGLE_ACCESS_TOKEN__ || "";
      const queryParam = token ? `?token=${encodeURIComponent(token)}` : "";
      const response = await fetch(`/api/drive/files${queryParam}`);
      if (response.ok) {
        const data = await response.json();
        
        if (data.error) {
          setError(data.error);
          setFiles([]);
          return;
        }

        // Fetch download statistics from the backend proxy API
        let stats: Record<string, number> = {};
        try {
          const statsRes = await fetch("/api/config/downloads_stats");
          if (statsRes.ok) {
            stats = await statsRes.json();
          }
        } catch (sErr) {
          console.log("Failed to fetch download statistics:", sErr);
        }

        const mergedFiles: DriveFile[] = (data.files || []).map((f: any) => ({
          ...f,
          downloadCount: stats[f.id] || 0
        }));

        setFiles(mergedFiles);
      } else {
        setError("Impossible de charger les fichiers de la base de données. Veuillez actualiser ou réessayer.");
      }
    } catch (err: any) {
      setError("Erreur réseau: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const trackDownload = async (fileId: string) => {
    try {
      const response = await fetch(`/api/config/downloads_stats/${fileId}`, {
        method: "POST"
      });
      if (response.ok) {
        setFiles(files.map(f => f.id === fileId ? { ...f, downloadCount: (f.downloadCount || 0) + 1 } : f));
      } else {
        console.error("Failed to track download via API");
      }
    } catch (err) {
      console.error("Couldn't track download", err);
    }
  };

  // Initial load
  useEffect(() => {
    fetchConfig().then((id) => {
      fetchFiles(id || "");
    });
  }, []);

  // Sort files by downloads (top 10 requested visually)
  const sortedFiles = [...files].sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0));

  return (
    <div className="grid grid-cols-1 gap-6 w-full fade-in">
      {(isConfiguring || (!folderId && isSuperAdmin)) && isSuperAdmin && (
        <section className="bg-amber-950/20 border border-amber-500/30 rounded-3xl p-6 shadow-xl flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-3 border-b border-amber-500/20">
            <span className="text-sm font-extrabold text-amber-500">Configuration du Dossier Drive</span>
          </div>
          <p className="text-xs text-amber-200">
            Entrez l'ID du dossier Google Drive qui contient vos documents PDF.
          </p>
          <div className="flex gap-3 items-center">
            <input 
              type="text" 
              placeholder="ex: 1A2B3C4D5E6F7G8H9I0J" 
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="flex-grow bg-slate-950 border border-amber-500/30 text-slate-100 p-2.5 rounded-xl text-xs focus:outline-none focus:border-amber-500"
            />
            <button 
              onClick={saveConfig}
              disabled={savingConfig}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl transition-all"
            >
              {savingConfig ? "Sauvegarde..." : "Enregistrer l'ID"}
            </button>
          </div>
        </section>
      )}

      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl min-h-[400px] flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <FileText className="h-6 w-6 text-indigo-400" />
              Base de Pièces Jointes
            </h2>
            <p className="text-xs text-slate-400 mt-1">Tous les documents PDF sauvegardés centralisés depuis Google Drive.</p>
          </div>
          
          <div className="flex gap-2">
            {!isConfiguring && isSuperAdmin && (
               <button 
                onClick={() => setIsConfiguring(true)}
                className="px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all font-bold"
               >
                 ⚙️ Configurer Dossier
               </button>
            )}
            <button
              onClick={() => fetchFiles(folderId)}
              disabled={loading || !folderId}
              className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              Actualiser
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-950/40 border border-red-500/20 text-red-300 p-4 rounded-xl text-xs font-semibold flex items-start gap-3 mb-6">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="flex-grow flex flex-col gap-3">
          {loading && !files.length && (
            <div className="flex flex-col items-center justify-center p-10 text-slate-500">
              <RefreshCw className="h-8 w-8 animate-spin mb-3 text-indigo-500" />
              <span className="text-sm font-semibold">Synchronisation avec Google Drive...</span>
            </div>
          )}
          
          {!loading && !files.length && !error && (
            <div className="flex flex-col items-center justify-center p-10 text-slate-500">
              <FileText className="h-10 w-10 mb-3 opacity-20" />
              <span className="text-sm font-semibold">Aucun PDF trouvé dans le dossier (ou dossier non configuré).</span>
            </div>
          )}

          {sortedFiles.slice(0, 10).map((file, index) => (
            <div key={file.id} className="flex justify-between items-center p-4 bg-slate-950/60 border border-slate-850 hover:border-indigo-500/30 rounded-2xl transition-all group">
              <div className="flex items-center gap-3 w-2/3">
                <div className="relative">
                  <div className={`w-10 h-10 ${index < 3 ? 'bg-amber-950/50 text-amber-400 border border-amber-500/30' : 'bg-indigo-950 text-indigo-400 border border-indigo-500/20'} rounded-xl flex items-center justify-center`}>
                     {index < 3 ? <Trophy className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                  </div>
                  {index < 3 && <div className="absolute -top-1.5 -right-1.5 bg-amber-500 text-amber-950 text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">{index + 1}</div>}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold text-slate-200 truncate pr-2 w-full" title={file.name}>{file.name}</span>
                  <span className="text-[10px] text-slate-500">PDF Document • {file.downloadCount || 0} téléchargements</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a 
                  href={`/api/drive/download/${file.id}?name=${encodeURIComponent(file.name)}`}
                  target="_blank" 
                  rel="noreferrer"
                  onClick={() => trackDownload(file.id)}
                  className="hidden sm:inline-block px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-900 border border-slate-800 hover:border-slate-500 rounded-lg transition-all"
                >
                  Aperçu
                </a>
                {allowDownloadAttachments && (
                <a 
                  href={`/api/drive/download/${file.id}?name=${encodeURIComponent(file.name)}`}
                  download={file.name}
                  target="_blank" 
                  rel="noreferrer"
                  onClick={() => trackDownload(file.id)}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/20 rounded-lg flex items-center gap-1.5 transition-all"
                >
                  <Download className="h-3 w-3" />
                  <span className="hidden sm:inline">Télécharger</span>
                </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
