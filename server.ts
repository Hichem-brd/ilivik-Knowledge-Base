import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, setDoc, doc, deleteDoc, query, orderBy, getDoc } from "firebase/firestore";
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
  tags: string[];
  createdAt: string;
  author: string;
  errorType?: string; // backoffice, frontoffice
  errorCategory?: string; // manipulation, error, navigateur, reports, Synchronisation, impression
  errorPriority?: string; // level 01, level 02, level 03
  client?: string;
  isResolved?: boolean;
  resolvedAt?: string | null;
}

interface UserAccount {
  name: string;
  email: string;
  password?: string;
  status: "active" | "disabled";
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
    const { title, errorCode, description, solution, imageUrl, tags, author, errorType, errorCategory, errorPriority, client, isResolved, resolvedAt } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: "Champs requis manquants. Un titre et une description de la panne sont obligatoires." });
    }

    const documentId = "err_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    const newError: Omit<ErrorRecord, "id"> = {
      title: title.trim(),
      errorCode: (errorCode || "").trim(),
      description: description.trim(),
      solution: (solution || "").trim(),
      imageUrl: imageUrl || "", // base64 representation of image capture
      tags: Array.isArray(tags) ? tags : [],
      createdAt: new Date().toISOString(),
      author: author || "Team Ilivik Membre",
      errorType: errorType || "frontoffice",
      errorCategory: errorCategory || "manipulation",
      errorPriority: errorPriority || "level 03",
      client: client || "",
      isResolved: typeof isResolved === "boolean" ? isResolved : !!(solution && solution.trim() !== ""),
      resolvedAt: resolvedAt || (isResolved ? new Date().toISOString() : null)
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
    const { title, errorCode, description, solution, imageUrl, tags, author, createdAt, errorType, errorCategory, errorPriority, client, isResolved, resolvedAt } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: "Champs requis manquants. Un titre et une description sont obligatoires." });
    }

    const updatedError = {
      title: title.trim(),
      errorCode: (errorCode || "").trim(),
      description: description.trim(),
      solution: (solution || "").trim(),
      imageUrl: imageUrl || "",
      tags: Array.isArray(tags) ? tags : [],
      createdAt: createdAt || new Date().toISOString(),
      author: author || "Team Ilivik Membre",
      errorType: errorType || "frontoffice",
      errorCategory: errorCategory || "manipulation",
      errorPriority: errorPriority || "level 03",
      client: client || "",
      isResolved: typeof isResolved === "boolean" ? isResolved : !!(solution && solution.trim() !== ""),
      resolvedAt: resolvedAt || (isResolved ? new Date().toISOString() : null)
    };

    await setDoc(doc(db, "errors", id), updatedError);

    res.json({ id, ...updatedError });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update Firestore: " + err.message });
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
    allowChatActions: true
  },
  publicUser: {
    allowCatalogTab: true,
    allowChatTab: true,
    allowAddTab: false,
    allowAddError: false,
    allowEditSolution: false,
    allowDeleteError: false,
    allowUseAI: true,
    allowChatActions: true
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
    console.error("Error reading permissions config from Firestore:", err);
    res.json(DEFAULT_PERMISSIONS); // Safe fallback
  }
});

app.post("/api/config/permissions", async (req, res) => {
  try {
    const { ilivikUsers, publicUser, requesterEmail } = req.body;
    
    // Only allow hichem.b@ilivik.com to modify permissions
    if (!requesterEmail || requesterEmail.toLowerCase() !== "hichem.b@ilivik.com") {
      return res.status(403).json({ error: "Action non autorisée. Seul le Super Admin peut modifier les rôles et permissions." });
    }

    if (!ilivikUsers || !publicUser) {
      return res.status(400).json({ error: "Structure de permissions invalide." });
    }

    const configDocRef = doc(db, "config", "permissions");
    await setDoc(configDocRef, { ilivikUsers, publicUser });
    res.json({ success: true, message: "Configuration mise à jour dans la base Firestore !" });
  } catch (err: any) {
    res.status(500).json({ error: "Échec de l'enregistrement de la configuration: " + err.message });
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

// Custom Authentication/Login Route
app.post("/api/users/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "L'e-mail et le mot de passe sont obligatoires." });
    }

    const emailKey = email.toLowerCase().trim();
    
    // Check for hardcoded local administration fallback or user search in Firestore
    if (emailKey === "hichem.b@ilivik.com" && password === "admin123") {
      const adminDocRef = doc(db, "users", "hichem.b@ilivik.com");
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
      return res.json({
        email: "hichem.b@ilivik.com",
        name: "Hichem B. (Super Admin)",
        status: "active",
        role: "ilivikUsers"
      });
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

// 4. AI Chat Assistant & Image identification with context (RAG)
app.post("/api/chat", async (req, res) => {
  try {
    const { query: userQuery, image, chatHistory } = req.body;

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

DIRECTIVES :
1. Recherche des correspondances sémantiques ou visuelles étroites avec les erreurs enregistrées ci-dessus.
2. Si le problème de l'utilisateur correspond à l'une des erreurs enregistrées, présente d'abord EN GRAND et CLAIREMENT la solution documentée, puis explique comment l'appliquer.
3. Si l'utilisateur a envoyé une capture d'écran d'erreur (format image), extrait le texte et l'apparence visuelle pour déterminer quelle erreur documentée lui correspond et explique-lui la solution.
4. Si l'erreur N'EST PAS encore enregistrée dans la base de connaissances, déclare-le poliment en mentionnant : "Cette erreur n'est pas encore dans notre base de connaissances SalesBuzz". Propose ensuite des étapes de dépannage génériques ou intelligentes adaptées au SFA (par ex. synchronisation des données, vérification de la connexion internet, rafraîchissement du cache, mise à jour des paramètres de tarification, etc.), et incite-les à documenter cette erreur dès qu'elle sera résolue.
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
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SalesBuzz Knowledge Server] running on http://localhost:${PORT}`);
  });
}

startServer();
