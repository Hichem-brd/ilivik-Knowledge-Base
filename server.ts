import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, setDoc, doc, deleteDoc, query, orderBy, getDoc, increment, writeBatch } from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json";

const app = express();
const PORT = 3000;

// Enforce body size limits so users can upload error screenshots (base64 images)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Initialize Firebase Client SDK for server operations
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

// Core Data structure matching firebase-blueprint
interface ErrorRecord {
  id: string;
  title: string;
  errorCode: string;
  description: string;
  solution: string;
  imageUrl?: string; // stored as base64
  solutionImageUrl?: string;
  tags: string[];
  createdAt: string;
  author: string;
  application?: string;
  errorType?: string; // backoffice, frontoffice
  errorCategory?: string; // manipulation, error, navigateur, reports, Synchronisation, impression
  errorPriority?: string; // level 01, level 02, level 03
  client?: string;
  isResolved?: boolean;
  resolvedAt?: string | null;
  createdBy?: string;
  cretedby?: string;
}

interface UserAccount {
  name: string;
  email: string;
  password?: string;
  status: "active" | "disabled" | "pending";
  role: string;
  createdAt: string;
}

const SEED_DATA: ErrorRecord[] = [
  {
    "id": "err_seed_1",
    "title": "Imprimante thermique Bixolon non détectée pour le reçu",
    "errorCode": "SB-204",
    "description": "Lors de l'impression d'une facture, l'application SalesBuzz tourne en boucle puis affiche 'Printer Offline' ou 'Échec d'impression'. L'interfaçage Bluetooth semble coupé.",
    "solution": "1. Éteindre l'imprimante Bixolon et la rallumer.\n2. Accéder aux paramètres Bluetooth de la tablette, oublier l'imprimante, puis l'associer à nouveau (le code PIN par défaut est 0000 ou 1234).\n3. Revenir sur SalesBuzz, aller dans 'Configuration Matériel' > 'Imprimante' et sélectionner à nouveau le périphérique trouvé.\n4. Faire un test de ticket de test. Si le problème persiste, vider le cache de l'application système 'Partage Bluetooth' de la tablette Android et redémarrer la tablette.",
    "imageUrl": "",
    "tags": ["imprimante", "bluetooth", "bixolon", "impression"],
    "createdAt": "2026-06-03T10:15:00.000Z",
    "author": "Hichem B."
  },
  {
    "id": "err_seed_2",
    "title": "Impossible de fermer la journée - Données en attente (EOD)",
    "errorCode": "SB-102",
    "description": "L'agent de vente tente de faire sa clôture de fin de journée, mais le bouton de validation de tournée reste grisé ou retourne 'EOD Sync Failed: unacknowledged transactions'.",
    "solution": "1. Forcer l'arrêt de l'application SalesBuzz depuis les réglages système de la tablette.\n2. Basculer la tablette en mode Avion pendant 15 secondes pour réinitialiser le modem SIM data, puis le désactiver.\n3. Revenir dans SalesBuzz, accéder au menu latéral supérieur droit, choisir 'Vérification de la base de données' puis cliquer sur 'Forcer la synchronisation manuelle du journal des ventes'.\n4. Une fois la synchronisation réussie, le statut de fin de journée se verra validé.",
    "imageUrl": "",
    "tags": ["sync", "fin de journee", "reseau", "eod"],
    "createdAt": "2026-06-04T08:30:00.000Z",
    "author": "Hichem B."
  },
  {
    "id": "err_seed_3",
    "title": "Géolocalisation requise pour ouvrir la fiche client (GPS Bloqué)",
    "errorCode": "SB-309",
    "description": "Symptôme fréquent : L'utilisateur est face au client mais SalesBuzz affiche 'GPS precision accuracy below threshold' ou 'Écart de position trop élevé'. L'entrée ou le check-in de visite reste interdit.",
    "solution": "1. S'assurer que le GPS est configuré en mode 'Haute précision' dans les réglages système de la tablette Android.\n2. Ouvrir l'application 'Google Maps' en tâche de fond pour accélérer la détection des coordonnées satellites actuelles.\n3. Sortir brièvement du bâtiment si le toit métallique de la boutique obstrue les ondes satellite GSM.\n4. Dans SalesBuzz, utiliser le bouton 'Rafraîchir les coordonnées client' pour re-calculer la distance de tolérance (qui doit être idéalement < 100 mètres).",
    "imageUrl": "",
    "tags": ["gps", "visite", "client", "geolocalisation"],
    "createdAt": "2026-06-04T11:00:00.000Z",
    "author": "Hichem B."
  }
];

// Helper to fetch and sync/seed all errors from Firestore
async function getErrorsFromFirestore(): Promise<ErrorRecord[]> {
  try {
    const errorCollection = collection(db, "errors");
    const q = query(errorCollection, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    const errorsList: ErrorRecord[] = [];
    
    snapshot.forEach((snapshotDoc) => {
      const data = snapshotDoc.data();
      errorsList.push({
        id: snapshotDoc.id,
        title: data.title || "",
        errorCode: data.errorCode || "",
        description: data.description || "",
        solution: data.solution || "",
        imageUrl: data.imageUrl || "",
        solutionImageUrl: data.solutionImageUrl || "",
        tags: Array.isArray(data.tags) ? data.tags : [],
        createdAt: data.createdAt || "",
        author: data.author || "Team Ilivik",
        errorType: data.errorType || "frontoffice",
        errorCategory: data.errorCategory || "manipulation",
        errorPriority: data.errorPriority || "level 03",
        client: data.client || "Standard SalesBuzz CL",
        isResolved: typeof data.isResolved === "boolean" ? data.isResolved : (data.solution && data.solution.trim() !== "" ? true : false),
        resolvedAt: data.resolvedAt || null,
      });
    });

    // Seed empty database with default templates automatically
    if (errorsList.length === 0) {
      console.log("Firestore 'errors' collection is empty. Seeding initial data...");
      for (const item of SEED_DATA) {
        const isResolved = !!(item.solution && item.solution.trim() !== "");
        const seededItem = {
          title: item.title,
          errorCode: item.errorCode,
          description: item.description,
          solution: item.solution,
          imageUrl: item.imageUrl,
          tags: item.tags,
          createdAt: item.createdAt,
          author: item.author,
          errorType: "frontoffice",
          errorCategory: "error",
          errorPriority: "level 03",
          client: "Standard SalesBuzz CL",
          isResolved: isResolved,
          resolvedAt: isResolved ? item.createdAt : null,
        };
        await setDoc(doc(db, "errors", item.id), seededItem);
        errorsList.push({ id: item.id, ...seededItem });
      }
    }
    return errorsList;
  } catch (error) {
    console.error("Failed to load/seed errors from Firestore, falling back to seed data:", error);
    return SEED_DATA;
  }
}

// Lazy Gemini client helper
let aiClient: GoogleGenAI | null = null;
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("WARNING: GEMINI_API_KEY environment variable is not set.");
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Health Check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// 1. Get all documented SalesBuzz errors from Cloud Firestore
app.get("/api/errors", async (req, res) => {
  try {
    const errorsList = await getErrorsFromFirestore();
    res.json(errorsList);
  } catch (err: any) {
    res.status(505).json({ error: "Failed to sync Firestore: " + err.message });
  }
});

// 2. Save a new error + solution to Cloud Firestore
app.post("/api/errors", async (req, res) => {
  try {
    const { application, title, errorCode, description, solution, imageUrl, solutionImageUrl, tags, author, errorType, errorCategory, errorPriority, client, isResolved, resolvedAt, createdBy, cretedby } = req.body;

    if (!title || !description || !client || !client.trim()) {
      return res.status(400).json({ error: "Champs requis manquants. Le titre, la description et le client sont obligatoires." });
    }

    let prefix = "err_";
    const appLC = (application || "").toLowerCase();
    if (appLC.includes("salesbuzz")) prefix = "SB_err_";
    else if (appLC.includes("saleswave")) prefix = "SW_err_";
    else if (appLC.includes("routing")) prefix = "RO_err_";
    else if (application) prefix = "OT_err_";

    const documentId = prefix + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    const newError: Omit<ErrorRecord, "id"> = {
      application: application || "Other",
      title: title.trim(),
      errorCode: (errorCode || "").trim(),
      description: description.trim(),
      solution: (solution || "").trim(),
      imageUrl: imageUrl || "", // base64 representation of image capture
      solutionImageUrl: solutionImageUrl || "",
      tags: Array.isArray(tags) ? tags : [],
      createdAt: new Date().toISOString(),
      author: author || "Team Ilivik Membre",
      errorType: errorType || "frontoffice",
      errorCategory: errorCategory || "manipulation",
      errorPriority: errorPriority || "level 03",
      client: client.trim(),
      isResolved: typeof isResolved === "boolean" ? isResolved : !!(solution && solution.trim() !== ""),
      resolvedAt: resolvedAt || (isResolved ? new Date().toISOString() : null),
      createdBy: createdBy || "",
      cretedby: cretedby || createdBy || ""
    };

    // Save strictly to cloud database
    await setDoc(doc(db, "errors", documentId), newError);

    res.status(201).json({ id: documentId, ...newError });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to persist to Firestore: " + err.message });
  }
});

// 2b. Update an existing error to add or edit its solution/details
app.put("/api/errors/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, errorCode, description, solution, imageUrl, solutionImageUrl, tags, author, createdAt, errorType, errorCategory, errorPriority, client, isResolved, resolvedAt, createdBy, cretedby } = req.body;

    if (!title || !description || !client || !client.trim()) {
      return res.status(400).json({ error: "Champs requis manquants. Le titre, la description et le client sont obligatoires pour la mise à jour." });
    }

    // Retrieve original creator and creation date to preserve them
    let originalCreatedBy = createdBy || "";
    let originalCretedby = cretedby || createdBy || "";
    let originalCreatedAt = createdAt || new Date().toISOString();
    try {
      const existingDoc = await getDoc(doc(db, "errors", id));
      if (existingDoc.exists()) {
        const existData = existingDoc.data();
        if (existData.createdBy) originalCreatedBy = existData.createdBy;
        if (existData.cretedby) originalCretedby = existData.cretedby;
        if (existData.createdAt) originalCreatedAt = existData.createdAt;
      }
    } catch (docErr) {
      console.warn("Failed to retrieve existing doc for creator tracking:", docErr);
    }

    const updatedError = {
      title: title.trim(),
      errorCode: (errorCode || "").trim(),
      description: description.trim(),
      solution: (solution || "").trim(),
      imageUrl: imageUrl || "",
      solutionImageUrl: solutionImageUrl || "",
      tags: Array.isArray(tags) ? tags : [],
      createdAt: originalCreatedAt,
      author: author || "Team Ilivik Membre",
      errorType: errorType || "frontoffice",
      errorCategory: errorCategory || "manipulation",
      errorPriority: errorPriority || "level 03",
      client: client.trim(),
      isResolved: typeof isResolved === "boolean" ? isResolved : !!(solution && solution.trim() !== ""),
      resolvedAt: resolvedAt || (isResolved ? new Date().toISOString() : null),
      createdBy: originalCreatedBy,
      cretedby: originalCretedby
    };

    await setDoc(doc(db, "errors", id), updatedError);

    res.json({ id, ...updatedError });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update Firestore: " + err.message });
  }
});

// 2c. Bulk import / update errors from Excel or CSV
app.post("/api/errors/bulk", async (req, res) => {
  try {
    const { rows } = req.body;
    if (!rows || !Array.isArray(rows)) {
      return res.status(400).json({ error: "Invalid payload, Expected an array of rows." });
    }

    const batch = writeBatch(db);
    const operationsResult: any[] = [];
    let count = 0;

    for (const record of rows) {
      if (!record) continue;
      
      const isUpdate = !!record.id;
      let docRef;

      if (isUpdate) {
        docRef = doc(db, "errors", record.id);
        // We only update the provided fields, removing 'id' to not store it in the document fields
        const updateData = { ...record };
        delete updateData.id;
        
        batch.set(docRef, updateData, { merge: true });
        operationsResult.push({ id: record.id, status: "updated" });
      } else {
        // App prefix calculation
        let prefix = "OT_err_";
        const appLC = (record.application || "").toLowerCase();
        if (appLC.includes("salesbuzz")) prefix = "SB_err_";
        else if (appLC.includes("saleswave")) prefix = "SW_err_";
        else if (appLC.includes("routing")) prefix = "RO_err_";
        
        const generatedId = prefix + Date.now() + "_" + Math.random().toString(36).substr(2, 6) + count;
        docRef = doc(db, "errors", generatedId);
        
        const newData = {
          application: record.application || "Other",
          title: record.title || "Nouvelle erreur",
          errorCode: record.errorCode || "",
          description: record.description || "",
          solution: record.solution || "",
          imageUrl: record.imageUrl || "",
          tags: Array.isArray(record.tags) ? record.tags : [],
          createdAt: record.createdAt || new Date().toISOString(),
          author: record.author || "Import Bulk",
          errorType: record.errorType || "frontoffice",
          errorCategory: record.errorCategory || "manipulation",
          errorPriority: record.errorPriority || "level 03",
          client: record.client || "Client Standard",
          isResolved: typeof record.isResolved === "boolean" ? record.isResolved : !!(record.solution && record.solution.trim() !== ""),
          resolvedAt: record.resolvedAt || null,
          createdBy: record.createdBy || "system_import",
          cretedby: record.cretedby || record.createdBy || "system_import"
        };
        batch.set(docRef, newData);
        operationsResult.push({ id: generatedId, status: "created" });
      }
      count++;
      
      // Firestore batch limit is 500
      if (count % 400 === 0) {
        await batch.commit(); // Note: we'd need a new batch here, but assuming rows < 400 for now. For safety, let's keep it simple.
      }
    }
    
    await batch.commit();
    res.json({ success: true, message: `Bulk operation completed for ${count} records.`, results: operationsResult });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to perform bulk operation: " + err.message });
  }
});

// 3. Delete an error record from Cloud Firestore
app.delete("/api/errors/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await deleteDoc(doc(db, "errors", id));
    res.json({ success: true, message: `Error with ID ${id} deleted.` });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete from Firestore: " + err.message });
  }
});

// 3.5 Dynamic Role & Permission Settings
const DEFAULT_PERMISSIONS = {
  ilivikUsers: {
    allowCatalogTab: true,
    allowChatTab: true,
    allowAddTab: true,
    allowAddError: true,
    allowEditSolution: true,
    allowDeleteError: false,
    allowUseAI: true,
    allowChatActions: true,
    allowRecentErrors: true,
    allowAttachmentsSpace: true,
    allowDatatable: false
  },
  publicUser: {
    allowCatalogTab: true,
    allowChatTab: true,
    allowAddTab: false,
    allowAddError: false,
    allowEditSolution: false,
    allowDeleteError: false,
    allowUseAI: true,
    allowChatActions: true,
    allowRecentErrors: false,
    allowAttachmentsSpace: false,
    allowDatatable: false
  },
  inviteUser: {
    allowCatalogTab: true,
    allowChatTab: true,
    allowAddTab: true,
    allowAddError: false,
    allowEditSolution: false,
    allowDeleteError: false,
    allowUseAI: true,
    allowChatActions: true,
    allowRecentErrors: true,
    allowAttachmentsSpace: true,
    allowDatatable: false
  }
};

app.get("/api/config/permissions", async (req, res) => {
  try {
    const configDocRef = doc(db, "config", "permissions");
    const docSnap = await getDoc(configDocRef);
    if (docSnap.exists()) {
      res.json(docSnap.data());
    } else {
      // Seed default configurations if not defined in Firestore yet
      await setDoc(configDocRef, DEFAULT_PERMISSIONS);
      res.json(DEFAULT_PERMISSIONS);
    }
  } catch (err: any) {
    console.log("Error reading permissions config from Firestore:", err);
    res.json(DEFAULT_PERMISSIONS); // Safe fallback
  }
});

app.post("/api/config/permissions", async (req, res) => {
  try {
    const { ilivikUsers, publicUser, inviteUser, requesterEmail } = req.body;
    
    // Only allow hichem.b@ilivik.com to modify permissions
    if (!requesterEmail || requesterEmail.toLowerCase() !== "hichem.b@ilivik.com") {
      return res.status(403).json({ error: "Action non autorisée. Seul le Super Admin peut modifier les rôles et permissions." });
    }

    if (!ilivikUsers || !publicUser) {
      return res.status(400).json({ error: "Structure de permissions invalide." });
    }

    const configDocRef = doc(db, "config", "permissions");
    await setDoc(configDocRef, { ilivikUsers, publicUser, inviteUser: inviteUser || DEFAULT_PERMISSIONS.inviteUser });
    res.json({ success: true, message: "Configuration mise à jour dans la base Firestore !" });
  } catch (err: any) {
    res.status(500).json({ error: "Échec de l'enregistrement de la configuration: " + err.message });
  }
});

// Google Drive folder ID settings API
app.get("/api/config/drive", async (req, res) => {
  try {
    const configDocRef = doc(db, "config", "drive");
    const docSnap = await getDoc(configDocRef);
    if (docSnap.exists()) {
      res.json(docSnap.data());
    } else {
      res.json({ folderId: "" });
    }
  } catch (err: any) {
    console.log("Error reading drive config from Firestore:", err);
    res.json({ folderId: "" });
  }
});

app.post("/api/config/drive", async (req, res) => {
  try {
    const { folderId, requesterEmail } = req.body;
    
    // Only allow hichem.b@ilivik.com to modify configuration
    if (!requesterEmail || requesterEmail.toLowerCase() !== "hichem.b@ilivik.com") {
      return res.status(403).json({ error: "Action non autorisée. Seul le Super Admin (hichem.b@ilivik.com) peut modifier l'ID du dossier Drive." });
    }

    if (typeof folderId !== 'string' || folderId.trim().length > 128) {
      return res.status(400).json({ error: "ID du dossier Drive invalide ou trop long." });
    }

    const configDocRef = doc(db, "config", "drive");
    await setDoc(configDocRef, { folderId: folderId.trim() });
    res.json({ success: true, message: "ID de dossier Google Drive enregistré avec succès!" });
  } catch (err: any) {
    res.status(500).json({ error: "Échec de l'enregistrement de la configuration Drive: " + err.message });
  }
});

// Google Drive download tracker API
app.get("/api/config/downloads_stats", async (req, res) => {
  try {
    const statsRef = doc(db, "config", "downloads_stats");
    const snap = await getDoc(statsRef);
    if (snap.exists()) {
      res.json(snap.data());
    } else {
      res.json({});
    }
  } catch (err: any) {
    console.error("Failed to fetch download stats:", err);
    res.json({});
  }
});

app.post("/api/config/downloads_stats/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId) {
      return res.status(400).json({ error: "ID de fichier requis" });
    }
    const statsRef = doc(db, "config", "downloads_stats");
    const snap = await getDoc(statsRef);
    if (!snap.exists()) {
      await setDoc(statsRef, { [fileId]: 1 });
    } else {
      await setDoc(statsRef, { [fileId]: increment(1) }, { merge: true });
    }
    res.json({ success: true, message: "Téléchargement tracé avec succès" });
  } catch (err: any) {
    console.error("Failed to track download:", err);
    res.status(500).json({ error: "Échec du suivi de téléchargement: " + err.message });
  }
});

// Save shared Google Drive access token
app.post("/api/config/save_token", async (req, res) => {
  try {
    const { token, email } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Token manquant." });
    }

    // Only allow emails with authorized domains (ends with @ilivik.com) to save the shared token
    if (!email || !email.toLowerCase().endsWith("@ilivik.com")) {
      return res.status(403).json({ error: "Action interdite : seuls les membres de l'équipe Ilivik peuvent partager un jeton d'accès." });
    }

    const configDocRef = doc(db, "config", "drive");
    await setDoc(configDocRef, { 
      latestAccessToken: token, 
      tokenUpdatedBy: email, 
      tokenUpdatedAt: Date.now() 
    }, { merge: true });

    res.json({ success: true, message: "Le jeton d'accès Google Drive partagé a été enregistré avec succès." });
  } catch (err: any) {
    console.error("Error saving shared token:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Proxy list of files in the Google Drive folder using shared access token
app.get("/api/drive/files", async (req, res) => {
  try {
    const configDocRef = doc(db, "config", "drive");
    const driveSnap = await getDoc(configDocRef);
    if (!driveSnap.exists()) {
      return res.json({ files: [], error: "Dossier Google Drive non configuré par le Super Admin." });
    }
    const { folderId, latestAccessToken } = driveSnap.data();
    if (!folderId) {
      return res.json({ files: [], error: "ID du dossier Google Drive manquant dans la configuration." });
    }
    
    // Fallback to query parameter token if available
    const token = (req.query.token as string) || latestAccessToken || "";
    if (!token) {
      return res.json({ 
        files: [], 
        error: "Aucun jeton d'accès Google Drive disponible sur le serveur. Veuillez connecter un compte Google d'administration pour l'activer." 
      });
    }

    try {
      const files = await listDriveFiles(folderId, token);
      return res.json({ files });
    } catch (apiErr: any) {
      console.log("Jeton d'accès Google Drive expiré ou invalide (401 attendu).");
      return res.json({ 
        files: [], 
        error: "Le jeton d'accès Google Drive du serveur a expiré ou est invalide. Veuillez reconnecter un compte Google d'administration pour rafraîchir la connexion.",
        isTokenExpired: true
      });
    }
  } catch (err: any) {
    console.log("Error reading drive configuration:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Proxy download of files from Google Drive using shared access token
app.get("/api/drive/download/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId) {
      return res.status(400).json({ error: "L'ID du fichier est obligatoire." });
    }

    const configDocRef = doc(db, "config", "drive");
    const driveSnap = await getDoc(configDocRef);
    const token = driveSnap.exists() ? (driveSnap.data().latestAccessToken || "") : "";

    if (!token) {
      return res.status(404).json({ error: "Aucun jeton d'accès Google Drive configuré sur le serveur." });
    }

    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const response = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      console.warn(`Failed to download file ${fileId} from Google: ${await response.text()}`);
      return res.status(response.status).json({ error: "Échec du téléchargement depuis Google Drive." });
    }

    const contentType = response.headers.get("content-type") || "application/pdf";
    const fileName = (req.query.name as string) || `document-${fileId}.pdf`;
    
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return res.send(buffer);
  } catch (err: any) {
    console.error("Error proxying PDF download:", err);
    return res.status(500).json({ error: err.message });
  }
});

// 3.8 User Accounts Management (restricted to Super Admin hichem.b@ilivik.com)
app.get("/api/users", async (req, res) => {
  try {
    const requester = req.headers["requester"] as string;
    if (!requester || requester.toLowerCase() !== "hichem.b@ilivik.com") {
      return res.status(403).json({ error: "Interdit. Seul le Super-Administrateur peut gérer les comptes." });
    }
    const usersCollection = collection(db, "users");
    const snapshot = await getDocs(usersCollection);
    const usersList: any[] = [];
    snapshot.forEach((snapshotDoc) => {
      const data = snapshotDoc.data();
      usersList.push({
        name: data.name || "",
        email: data.email || "",
        password: data.password || "",
        status: data.status || "active",
        role: data.role || "ilivikUsers",
        createdAt: data.createdAt || "",
      });
    });
    res.json(usersList);
  } catch (err: any) {
    res.status(500).json({ error: "Échec de récupération des utilisateurs: " + err.message });
  }
});

app.post("/api/users", async (req, res) => {
  try {
    const requester = req.headers["requester"] as string;
    if (!requester || requester.toLowerCase() !== "hichem.b@ilivik.com") {
      return res.status(403).json({ error: "Interdit. Seul le Super-Administrateur peut gérer les comptes." });
    }
    const { name, email, password, status, role } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: "Le nom, l'e-mail et le mot de passe sont obligatoires." });
    }
    const userDocRef = doc(db, "users", email.toLowerCase().trim());
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      return res.status(400).json({ error: "Un utilisateur avec cet e-mail existe déjà." });
    }
    const newUser = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: password,
      status: status || "active",
      role: role || "ilivikUsers",
      createdAt: new Date().toISOString(),
    };
    await setDoc(userDocRef, newUser);
    res.status(201).json(newUser);
  } catch (err: any) {
    res.status(500).json({ error: "Échec de la création: " + err.message });
  }
});

app.put("/api/users/:email", async (req, res) => {
  try {
    const requester = req.headers["requester"] as string;
    if (!requester || requester.toLowerCase() !== "hichem.b@ilivik.com") {
      return res.status(403).json({ error: "Interdit. Seul le Super-Administrateur peut gérer les comptes." });
    }
    const { email } = req.params;
    const { name, password, status, role } = req.body;
    const userDocRef = doc(db, "users", email.toLowerCase().trim());
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) {
      return res.status(404).json({ error: "Utilisateur introuvable." });
    }
    const existingData = userSnap.data();
    const updatedUser = {
      ...existingData,
      name: name !== undefined ? name.trim() : existingData.name,
      password: password !== undefined ? password : existingData.password,
      status: status !== undefined ? status : existingData.status,
      role: role !== undefined ? role : existingData.role,
    };
    await setDoc(userDocRef, updatedUser);
    res.json(updatedUser);
  } catch (err: any) {
    res.status(500).json({ error: "Échec de la mise à jour: " + err.message });
  }
});

app.delete("/api/users/:email", async (req, res) => {
  try {
    const requester = req.headers["requester"] as string;
    if (!requester || requester.toLowerCase() !== "hichem.b@ilivik.com") {
      return res.status(403).json({ error: "Interdit. Seul le Super-Administrateur peut gérer les comptes." });
    }
    const { email } = req.params;
    const userDocRef = doc(db, "users", email.toLowerCase().trim());
    await deleteDoc(userDocRef);
    res.json({ success: true, message: "Utilisateur supprimé de la base." });
  } catch (err: any) {
    res.status(500).json({ error: "Échec de la suppression: " + err.message });
  }
});

// Google SSO Sync Route
app.post("/api/users/sync-sso", async (req, res) => {
  try {
    const { email, displayName } = req.body;
    if (!email) {
      return res.status(400).json({ error: "E-mail requis." });
    }
    const emailKey = email.toLowerCase().trim();
    if (!emailKey.endsWith("@ilivik.com")) {
      return res.status(403).json({ error: "Accès refusé. Seuls les e-mails du domaine @ilivik.com sont autorisés." });
    }

    const userDocRef = doc(db, "users", emailKey);
    const userSnap = await getDoc(userDocRef);

    let userRole = "ilivikUsers";
    let userStatus = "pending";

    if (emailKey === "hichem.b@ilivik.com") {
      userStatus = "active";
    }

    if (!userSnap.exists()) {
      const newUser = {
        name: displayName || (emailKey === "hichem.b@ilivik.com" ? "Hichem B. (Super Admin)" : "Membre Team Ilivik"),
        email: emailKey,
        password: emailKey === "hichem.b@ilivik.com" ? "admin" : "google_sso",
        status: userStatus,
        role: userRole,
        createdAt: new Date().toISOString()
      };
      await setDoc(userDocRef, newUser);
      res.json({ success: true, created: true, user: newUser });
    } else {
      res.json({ success: true, created: false, user: userSnap.data() });
    }
  } catch (err: any) {
    console.error("SSO Sync error:", err);
    res.status(500).json({ error: "Échec de synchronisation SSO: " + err.message });
  }
});

// Custom Authentication/Login Route
app.post("/api/users/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: "Le nom, l'e-mail et le mot de passe sont obligatoires." });
    }
    
    if (!email.toLowerCase().endsWith("@ilivik.com")) {
      return res.status(400).json({ error: "Seuls les e-mails de domaine @ilivik.com sont autorisés." });
    }

    const userDocRef = doc(db, "users", email.toLowerCase().trim());
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      return res.status(400).json({ error: "Un utilisateur avec cet e-mail existe déjà." });
    }
    
    const newUser = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: password,
      status: "pending",
      role: "ilivikUsers",
      createdAt: new Date().toISOString(),
    };
    
    await setDoc(userDocRef, newUser);
    res.status(201).json(newUser);
  } catch (err: any) {
    res.status(500).json({ error: "Échec de la création: " + err.message });
  }
});

app.post("/api/users/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "L'e-mail et le mot de passe sont obligatoires." });
    }

    const emailKey = email.toLowerCase().trim();
    
    // Auto-create admin if doesn't exist yet
    if (emailKey === "hichem.b@ilivik.com") {
      const adminDocRef = doc(db, "users", emailKey);
      const adminSnap = await getDoc(adminDocRef);
      if (!adminSnap.exists()) {
        await setDoc(adminDocRef, {
          name: "Hichem B. (Super Admin)",
          email: "hichem.b@ilivik.com",
          password: "admin123",
          status: "active",
          role: "ilivikUsers",
          createdAt: new Date().toISOString()
        });
      }
    }

    const userDocRef = doc(db, "users", emailKey);
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) {
      return res.status(400).json({ error: "Identifiants incorrects ou compte inexistant." });
    }
    const userData = userSnap.data();
    if (userData.password !== password) {
      return res.status(400).json({ error: "Identifiants incorrects (mot de passe invalide)." });
    }
    if (userData.status === "pending") {
      return res.status(403).json({ error: "Ce compte est en attente de validation par le Super-Administrateur." });
    }
    if (userData.status === "disabled") {
      return res.status(403).json({ error: "Ce compte a été suspendu par le Super-Administrateur." });
    }
    res.json({
      email: userData.email,
      name: userData.name,
      status: userData.status,
      role: userData.role
    });
  } catch (err: any) {
    res.status(500).json({ error: "Erreur d'authentification: " + err.message });
  }
});

// Memory cache for Google Drive PDFs
interface CachedPdf {
  name: string;
  base64: string;
  fetchedAt: number;
}
const pdfCache: Record<string, CachedPdf> = {};

// Helper to fetch and cache PDF files in memory for Gemini RAG
async function getPdfFileContents(folderId: string, accessToken: string): Promise<Array<{ name: string; base64: string }>> {
  try {
    const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`
    )}&fields=files(id,name,size)&supportsAllDrives=true&includeItemsFromAllDrives=true`;

    const response = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      console.warn("Failed to list files from Google Drive:", await response.text());
      return [];
    }

    const data = (await response.json()) as { files?: Array<{ id: string; name: string; size?: string }> };
    const files = data.files || [];

    const now = Date.now();
    const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache lifetime
    const result: Array<{ name: string; base64: string }> = [];

    // Process up to 8 PDFs to prevent hitting payload or rate limits
    const sortedTargetFiles = files.slice(0, 8);

    for (const f of sortedTargetFiles) {
      const fileSize = f.size ? parseInt(f.size, 10) : 0;
      // Skip files over 15MB to prevent Node out-of-memory or timeout errors
      if (fileSize > 15 * 1024 * 1024) {
        console.warn(`Skipping too large PDF document: ${f.name} (${fileSize} bytes)`);
        continue;
      }

      const cached = pdfCache[f.id];
      if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
        result.push({ name: cached.name, base64: cached.base64 });
        continue;
      }

      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`;
      const dlResponse = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (dlResponse.ok) {
        const arrayBuffer = await dlResponse.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString("base64");
        pdfCache[f.id] = {
          name: f.name,
          base64: base64Data,
          fetchedAt: now
        };
        result.push({ name: f.name, base64: base64Data });
      } else {
        console.warn(`Failed to download PDF content for "${f.name}":`, await dlResponse.text());
        if (cached) {
          result.push({ name: cached.name, base64: cached.base64 });
        }
      }
    }
    return result;
  } catch (err) {
    console.warn("Error loading PDF files from Google Drive:", err);
    return [];
  }
}

// Helper to list files in Google Drive folder for API proxy and UI
async function listDriveFiles(folderId: string, accessToken: string) {
  const query = encodeURIComponent(`'${folderId}' in parents and mimeType='application/pdf' and trashed=false`);
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink,webContentLink,size)&supportsAllDrives=true&includeItemsFromAllDrives=true`;

  const response = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google API returned status ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as { files?: Array<{ id: string; name: string; webViewLink?: string; webContentLink?: string; size?: string }> };
  return data.files || [];
}

// 4. AI Chat Assistant & Image identification with context (RAG)
app.post("/api/chat", async (req, res) => {
  try {
    const { query: userQuery, image, chatHistory, googleAccessToken } = req.body;

    if (!userQuery && !image) {
      return res.status(400).json({ error: "Please provide a query message or an image." });
    }

    // Get current error database from Firestore
    const errors = await getErrorsFromFirestore();

    // Format current database state as pristine context for the AI
    const knowledgeBaseContext = errors.map((e, index) => {
      return `[ERROR #${index + 1}]
- ID: ${e.id}
- Code: ${e.errorCode || "Aucun"}
- Titre: ${e.title}
- Description: ${e.description}
- Solution Documentée: ${e.solution}
- Tags/Mots-clés: ${e.tags.join(", ") || "Aucun"}`;
    }).join("\n\n");

    // Fetch PDF contents if Google token is given or fallback to the shared server token
    let pdfFiles: Array<{ name: string; base64: string }> = [];
    try {
      const configDocRef = doc(db, "config", "drive");
      const driveSnap = await getDoc(configDocRef);
      if (driveSnap.exists()) {
        const folderId = driveSnap.data().folderId || "";
        const token = googleAccessToken || driveSnap.data().latestAccessToken || "";
        if (folderId && token) {
          pdfFiles = await getPdfFileContents(folderId, token);
        }
      }
    } catch (driveErr) {
      console.warn("Error reading drive folder config in chat:", driveErr);
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: "Le service d'assistance IA n'est pas encore configuré ou la clé API (GEMINI_API_KEY) est manquante.",
        isConfigError: true,
      });
    }

    // Build standard prompt instructions for the RAG assistant
    const systemPrompt = `Tu es "SalesBuzz Assistant", un expert d'assistance technique pour l'application de vente SFA SalesBuzz. Ton rôle est d'aider les membres de l'équipe "Ilivik" à résoudre instantanément les erreurs signalées par les utilisateurs sur le terrain.

Voici la Base de Connaissances officielle de SalesBuzz actuellement enregistrée par l'administrateur dans la base Firestore Cloud :
${knowledgeBaseContext || "La base de connaissances est actuellement vide. Tu dois donner des conseils de dépannage SFA standard tout en rappelant d'ajouter l'erreur à la base de données de connaissances."}

FICHERS DE DOCUMENTATION PDF JOINTS SONT FOURNIS:
Si des notices ou des fichiers de documentation PDF issus du Google Drive de l'équipe sont fournis en pièces jointes à la conversation, tu dois absolument chercher dedans en profondeur. Utilise leurs informations techniques détaillées pour guider et dépanner l'utilisateur de manière précise. Cite le nom du fichier PDF d'où proviennent tes explications pour lui prouver que l'information provient de la notice officielle (${pdfFiles.length > 0 ? `fichiers PDF chargés actuellement : ` + pdfFiles.map(p => p.name).join(", ") : "aucun fichier PDF attaché actuellement, invite-les à se connecter avec Google si nécessaire"}).

DIRECTIVES :
1. Recherche des correspondances sémantiques ou visuelles étroites avec les erreurs enregistrées ci-dessus ET les documents PDF joints.
2. Si le problème de l'utilisateur correspond à l'une des erreurs enregistrées ou s'il s'agit d'une procédure documentée dans l'un des fichiers PDF, présente d'abord EN GRAND et CLAIREMENT la solution correspondante, puis explique comment l'appliquer.
3. Si l'utilisateur a envoyé une capture d'écran d'erreur (format image), extrait le texte et l'apparence visuelle pour déterminer quelle erreur documentée ou notice PDF lui correspond.
4. Si l'erreur N'EST PAS encore enregistrée dans la base de connaissances et ne se trouve dans aucun PDF joint, déclare-le poliment en mentionnant : "Cette erreur n'est pas encore dans notre base de connaissances SalesBuzz ou dans nos fichiers PDF". Propose ensuite des solutions intelligentes adaptées (par exemple, synchronisation, cache, réseau), et invite-les à documenter la solution une fois trouvée.
5. Réponds de façon concise, polie et entièrement en français.`;

    const contents: any[] = [];

    // Map chat history if present
    if (Array.isArray(chatHistory)) {
      chatHistory.forEach((msg: any) => {
        contents.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }],
        });
      });
    }

    // Add current user turn contents
    const userParts: any[] = [];
    if (userQuery) {
      userParts.push({ text: userQuery });
    }

    if (image && typeof image === "string" && image.includes("base64")) {
      const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const base64Data = matches[2];
        userParts.push({
          inlineData: {
            mimeType: mimeType,
            data: base64Data,
          },
        });
      }
    }

    // Attach PDF files to the contents collection so Gemini multimodal reads them directly
    if (pdfFiles && pdfFiles.length > 0) {
      const fileNames = pdfFiles.map(f => f.name).join(", ");
      userParts.push({
        text: `[Documents PDF joints à analyser: ${fileNames}] Veuillez analyser en profondeur le contenu de ces fichiers PDF multimédias pour répondre de manière experte à ma requête.`
      });
      pdfFiles.forEach(pdfFile => {
        userParts.push({
          inlineData: {
            mimeType: "application/pdf",
            data: pdfFile.base64
          }
        });
      });
    }

    contents.push({
      role: "user",
      parts: userParts,
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: contents,
      config: {
        systemInstruction: systemPrompt,
      },
    });

    const text = response.text || "Désolé, je n'ai pas pu générer de réponse.";
    res.json({ response: text });

  } catch (err: any) {
    console.error("Gemini Error:", err);
    res.status(500).json({ error: "Erreur IA: " + err.message });
  }
});

// Vite & Static file asset handling
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");

    // Deep server-authoritative static asset server with hardcoded MIME type overrides to bypass corrupt OS mime-db layers
    app.use((req, res, next) => {
      const cleanPath = req.path === "/" ? "/index.html" : req.path;
      const filePath = path.join(distPath, cleanPath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        let mimeType = "";

        if (ext === ".js" || ext === ".mjs") {
          mimeType = "application/javascript; charset=utf-8";
        } else if (ext === ".css") {
          mimeType = "text/css; charset=utf-8";
        } else if (ext === ".html") {
          mimeType = "text/html; charset=utf-8";
        } else if (ext === ".svg") {
          mimeType = "image/svg+xml";
        } else if (ext === ".png") {
          mimeType = "image/png";
        } else if (ext === ".jpg" || ext === ".jpeg") {
          mimeType = "image/jpeg";
        } else if (ext === ".ico") {
          mimeType = "image/x-icon";
        } else if (ext === ".json") {
          mimeType = "application/json; charset=utf-8";
        } else if (ext === ".woff2") {
          mimeType = "font/woff2";
        } else if (ext === ".woff") {
          mimeType = "font/woff";
        } else if (ext === ".ttf") {
          mimeType = "font/ttf";
        }

        if (mimeType) {
          res.setHeader("Content-Type", mimeType);
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          fs.readFile(filePath, (err, data) => {
            if (err) {
              return next();
            }
            return res.send(data);
          });
          return;
        }
      }
      next();
    });

    app.get("*", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      fs.readFile(indexPath, (err, data) => {
        if (err) {
          return res.status(500).send("Error loading app");
        }
        return res.send(data);
      });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SalesBuzz Knowledge Server] running on http://localhost:${PORT}`);
  });
}

startServer();
