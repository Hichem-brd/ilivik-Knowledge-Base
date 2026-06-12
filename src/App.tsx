import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  AlertCircle, 
  BookOpen, 
  Camera, 
  CheckCircle2, 
  ChevronRight, 
  Clock, 
  ExternalLink, 
  FileText, 
  HelpCircle, 
  Image as ImageIcon, 
  Info, 
  Layers, 
  MessageSquare, 
  Plus, 
  Search, 
  Send, 
  Smartphone, 
  Tag, 
  Trash2, 
  Upload, 
  User, 
  X, 
  Zap,
  Eye,
  Lock,
  Table
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ErrorRecord, ChatMessage, RolePermissions, AppPermissionsConfig, UserAccount } from "./types";
import { auth, googleProvider } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser, GoogleAuthProvider } from "firebase/auth";

import AttachmentsSpace from "./AttachmentsSpace";
import DatatableSpace from "./DatatableSpace";

// Helper to safely parse JSON or return clear textual description (preventing HTML Unexpected token '<' errors)
async function parseResponseGracefully(response: Response, fallbackError: string): Promise<any> {
  const text = await response.text();
  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return JSON.parse(text);
    }
  } catch (e) {
    // Ignore and fallback to text snippet
  }
  
  if (text && text.trim().startsWith("<")) {
    return { error: `${fallbackError} (Status: ${response.status}). Le serveur a renvoyé un document de type HTML au lieu de JSON.` };
  }
  return { error: text || fallbackError };
}

export default function App() {
  // Navigation & View state
  const [activeTab, setActiveTab] = useState<"catalog" | "chat" | "add" | "attachments" | "datatable" | "webview">("catalog");
  
  // Dynamic Firestore status report
  const [firestoreStatus, setFirestoreStatus] = useState<{ ok: boolean; error: string | null } | null>(null);
  
  // Data State
  const [errors, setErrors] = useState<ErrorRecord[]>([]);
  const [errorDisplayType, setErrorDisplayType] = useState<"resolved" | "unresolved" | "all">("unresolved");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<string>(() => {
    return localStorage.getItem("sb_support_user") || "Team Ilivik Membre";
  });

  // Authentication & Member Access State
  const [firebaseUser, setFirebaseUser] = useState<any | null>(() => {
    try {
      const stored = localStorage.getItem("sb_custom_user_session");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authPurpose, setAuthPurpose] = useState<"add" | "edit" | "delete" | "general">("general");

  const isLoggedIn = !!firebaseUser;

  // Dynamic Permissions Configuration & Access Control
  const DEFAULT_PERMISSIONS: AppPermissionsConfig = {
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
      allowDatatable: false,
      allowStatsBlocks: true,
      allowDownloadAttachments: true,
      allowDatatableImportBulk: true,
      allowDatatableExportPdf: true,
      allowDatatableExportExcel: true,
      allowDatatableImportTemplate: true,
      allowDatatableActions: true
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
      allowDatatable: false,
      allowStatsBlocks: true,
      allowDownloadAttachments: false,
      allowDatatableImportBulk: false,
      allowDatatableExportPdf: false,
      allowDatatableExportExcel: false,
      allowDatatableImportTemplate: false,
      allowDatatableActions: false
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
      allowDatatable: false,
      allowStatsBlocks: true,
      allowDownloadAttachments: true,
      allowDatatableImportBulk: false,
      allowDatatableExportPdf: false,
      allowDatatableExportExcel: false,
      allowDatatableImportTemplate: false,
      allowDatatableActions: false
    }
  };

  const [permissionsConfig, setPermissionsConfig] = useState<AppPermissionsConfig>(DEFAULT_PERMISSIONS);
  const [isUpdatingPermissions, setIsUpdatingPermissions] = useState(false);
  const [permissionsStatus, setPermissionsStatus] = useState<string | null>(null);

  const isSuperAdmin = useMemo(() => {
    return !!firebaseUser && firebaseUser.email?.toLowerCase() === "hichem.b@ilivik.com";
  }, [firebaseUser]);

  const getPermission = (key: keyof RolePermissions): boolean => {
    if (isSuperAdmin) return true; // Super Admin has ultimate power
    if (isLoggedIn) {
      if (firebaseUser?.customRole === "inviteUser") {
        return permissionsConfig?.inviteUser?.[key] ?? DEFAULT_PERMISSIONS.inviteUser[key];
      }
      return permissionsConfig?.ilivikUsers?.[key] ?? DEFAULT_PERMISSIONS.ilivikUsers[key];
    } else {
      return permissionsConfig?.publicUser?.[key] ?? DEFAULT_PERMISSIONS.publicUser[key];
    }
  };
  
  // Create / Form State
  const [formTitle, setFormTitle] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSolution, setFormSolution] = useState("");
  const [formImage, setFormImage] = useState<string>(""); // Base64
  const [formSolutionImage, setFormSolutionImage] = useState<string>(""); // Base64
  const [formTags, setFormTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [formAuthor, setFormAuthor] = useState("");
  const [submitStatus, setSubmitStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Email/Password login modal states
  const [isSignUp, setIsSignUp] = useState(false);
  const [loginName, setLoginName] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // Inactivity tracking states (30 minutes)
  const [lastActivity, setLastActivity] = useState<number>(Date.now());

  // Additional Error fields states
  const [formErrorType, setFormErrorType] = useState("frontoffice");
  const [formErrorCategory, setFormErrorCategory] = useState("manipulation");
  const [formErrorPriority, setFormErrorPriority] = useState("level 03");
  const [formClient, setFormClient] = useState("");
  const [formApplication, setFormApplication] = useState("Salesbuzz");
  const [formCustomApplication, setFormCustomApplication] = useState("");

  // User Accounts States for Super-Admin console
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [selectedUserAccount, setSelectedUserAccount] = useState<UserAccount | null>(null);
  const [userFormEmail, setUserFormEmail] = useState("");
  const [userFormName, setUserFormName] = useState("");
  const [userFormPassword, setUserFormPassword] = useState("");
  const [userFormStatus, setUserFormStatus] = useState<"active" | "disabled" | "pending">("active");
  const [userFormRole, setUserFormRole] = useState("ilivikUsers");
  const [userFetchError, setUserFetchError] = useState<string | null>(null);
  const [userFormSuccess, setUserFormSuccess] = useState<string | null>(null);
  const [isEditingUser, setIsEditingUser] = useState(false);

  // Chat/AI Assistant State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome-msg",
      role: "model",
      content: "👋 Bonjour ! Je suis l'Assistant Virtuel de SalesBuzz. \n\nVous pouvez me poser une question ou glisser-déposer une capture d'écran d'une erreur rencontrée sur le terrain. Je vais fouiller dans notre Base de Connaissances pour vous guider pas à pas vers la solution enregistrée par votre équipe !",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatImage, setChatImage] = useState<string>(""); // base64 for message
  const [isAiLoading, setIsAiLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Expanded Error Detail modal/panel state
  const [viewingErrorDetail, setViewingErrorDetail] = useState<ErrorRecord | null>(null);

  // Solution editing inside modal
  const [isEditingSolution, setIsEditingSolution] = useState(false);
  const [solutionInput, setSolutionInput] = useState("");
  const [solutionImageInput, setSolutionImageInput] = useState<string>("");

  const handleSelectError = (err: ErrorRecord | null) => {
    setViewingErrorDetail(err);
    setIsEditingSolution(false);
    setSolutionInput(err ? err.solution || "" : "");
    setSolutionImageInput(err ? err.solutionImageUrl || "" : "");
  };

  const handleSaveSolution = async () => {
    if (!viewingErrorDetail) return;
    
    setIsSubmitting(true);
    try {
      const hasSolution = solutionInput.trim().length > 0;
      const updatedRecord: ErrorRecord = {
        ...viewingErrorDetail,
        solution: solutionInput.trim(),
        solutionImageUrl: solutionImageInput,
        isResolved: hasSolution,
        resolvedAt: hasSolution ? (viewingErrorDetail.resolvedAt || new Date().toISOString()) : null,
      };

      const response = await fetch(`/api/errors/${viewingErrorDetail.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedRecord),
      });

      if (response.ok) {
        const savedRecord = await parseResponseGracefully(response, "Erreur");
        setErrors(errors.map((e) => e.id === viewingErrorDetail.id ? savedRecord : e));
        setViewingErrorDetail(savedRecord);
        setIsEditingSolution(false);
      } else {
        const errJson = await parseResponseGracefully(response, "Une erreur est survenue lors de l'enregistrement de la solution.");
        alert(errJson.error || "Une erreur est survenue lors de l'enregistrement de la solution.");
      }
    } catch (err) {
      alert("Erreur réseau lors de la mise à jour de la solution.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Copy indicator
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Monitor Firebase Authentication state and validate email domain
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fUser) => {
      if (fUser) {
        if (fUser.email && !fUser.email.toLowerCase().endsWith("@ilivik.com")) {
          setLoginError("Accès refusé : Seuls les e-mails de domaine @ilivik.com de l'équipe Ilivik sont autorisés.");
          setAuthPurpose("general");
          setShowAuthModal(true);
          try {
            await signOut(auth);
          } catch (e) {
            console.error("Signout error:", e);
          }
          setFirebaseUser(null);
          setCurrentUser("Team Ilivik Membre");
          setFormAuthor("Team Ilivik Membre");
          localStorage.removeItem("sb_support_user");
          return;
        }

        // Role & Status validation for @ilivik.com users via backend synchronization
        if (fUser.email) {
          try {
            const syncResponse = await fetch("/api/users/sync-sso", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: fUser.email,
                displayName: fUser.displayName || ""
              })
            });

            if (!syncResponse.ok) {
              const errData = await parseResponseGracefully(syncResponse, "Échec de synchronisation de session.");
              setLoginError(errData.error || "Échec de synchronisation de session.");
              setAuthPurpose("general");
              setShowAuthModal(true);
              await signOut(auth);
              setFirebaseUser(null);
              return;
            }

            const syncResult = await parseResponseGracefully(syncResponse, "Échec de décodage de session.");
            const userData = syncResult.user || {};

            if (userData.status === "pending") {
              setLoginError("Votre compte est en attente de validation par le Super-Administrateur.");
              setAuthPurpose("general");
              setShowAuthModal(true);
              await signOut(auth);
              setFirebaseUser(null);
              return;
            }

            if (userData.status === "disabled") {
              setLoginError("Votre compte a été suspendu par le Super-Administrateur.");
              setAuthPurpose("general");
              setShowAuthModal(true);
              await signOut(auth);
              setFirebaseUser(null);
              return;
            }
          } catch (e) {
            console.error("Error validating user status via SSO sync:", e);
          }
        }

        setFirebaseUser(fUser);
        const displayName = fUser.displayName || fUser.email || "Membre Team Ilivik";
        setCurrentUser(displayName);
        setFormAuthor(displayName);
        localStorage.setItem("sb_support_user", displayName);
        localStorage.removeItem("sb_custom_user_session");
      } else {
        const stored = localStorage.getItem("sb_custom_user_session");
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setFirebaseUser(parsed);
            setCurrentUser(parsed.displayName);
            setFormAuthor(parsed.displayName);
            localStorage.setItem("sb_support_user", parsed.displayName);
            return;
          } catch {
            // fall through
          }
        }
        setFirebaseUser(null);
        setCurrentUser("Team Ilivik Membre");
        setFormAuthor("Team Ilivik Membre");
        localStorage.removeItem("sb_support_user");
      }
    });
    return unsubscribe;
  }, []);

  const checkFirestoreHealth = async () => {
    try {
      const response = await fetch("/api/health");
      if (response.ok) {
        const data = await response.json();
        if (data.firestore) {
          setFirestoreStatus(data.firestore);
        }
      }
    } catch (e) {
      console.warn("Could not check Firestore health status:", e);
    }
  };

  // Retrieve errors Catalog & Custom Permissions on mount
  useEffect(() => {
    checkFirestoreHealth();
    fetchErrors();
    fetchPermissions();
  }, []);

  // Fetch accounts list for superadmin
  const fetchUserAccounts = async () => {
    setIsLoadingUsers(true);
    setUserFetchError(null);
    try {
      const response = await fetch("/api/users", {
        headers: {
          "requester": firebaseUser?.email || "hichem.b@ilivik.com"
        }
      });
      if (response.ok) {
        const data = await response.json();
        setUserAccounts(data);
      } else {
        const errData = await response.json();
        setUserFetchError(errData.error || "Erreur lors du chargement des comptes utilisateurs.");
      }
    } catch (err: any) {
      setUserFetchError("Erreur réseau: " + err.message);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (activeTab === "webview" && isSuperAdmin) {
      fetchUserAccounts();
    }
  }, [activeTab, isSuperAdmin, firebaseUser]);

  // Activity monitoring for session timeout (30 minutes)
  useEffect(() => {
    const handleUserActivity = () => {
      setLastActivity(Date.now());
    };

    window.addEventListener("mousedown", handleUserActivity);
    window.addEventListener("keydown", handleUserActivity);
    window.addEventListener("scroll", handleUserActivity);
    window.addEventListener("touchstart", handleUserActivity);

    // Check inactivity every 10 seconds
    const interval = setInterval(() => {
      if (isLoggedIn) {
        const inactiveTime = Date.now() - lastActivity;
        if (inactiveTime >= 30 * 60 * 1000) { // 30 minutes inactivity
          handleLogout();
          alert("Votre session a expiré. Vous avez été déconnecté après 30 minutes d'inactivité.");
        }
      }
    }, 10000);

    return () => {
      window.removeEventListener("mousedown", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
      window.removeEventListener("scroll", handleUserActivity);
      window.removeEventListener("touchstart", handleUserActivity);
      clearInterval(interval);
    };
  }, [lastActivity, isLoggedIn]);

  const fetchPermissions = async () => {
    try {
      const response = await fetch("/api/config/permissions");
      if (response.ok) {
        const data = await response.json();
        if (data && data.ilivikUsers && data.publicUser) {
          setPermissionsConfig(data);
        }
      }
    } catch (err) {
      console.log("Les permissions locales sont appliquées (backend injoignable).");
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setLoginError("");
      const result = await signInWithPopup(auth, googleProvider);
      
      // Cache Google Workspace Access Token in window object for easy access
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        (window as any).__GOOGLE_ACCESS_TOKEN__ = credential.accessToken;
      }
      
      const user = result.user;
      if (user.email && !user.email.toLowerCase().endsWith("@ilivik.com")) {
        setLoginError("Accès refusé : Seuls les e-mails du domaine @ilivik.com de l'équipe Ilivik sont autorisés.");
        try {
          await signOut(auth);
        } catch (e) {
          console.error("Signout error:", e);
        }
        setFirebaseUser(null);
        return;
      }

      // Share the Google Workspace Access Token on the server for all authenticated users to share
      if (credential?.accessToken && user.email) {
        try {
          await fetch("/api/config/save_token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: credential.accessToken, email: user.email })
          });
        } catch (tokenErr) {
          console.error("Error saving shared Google access token on server:", tokenErr);
        }
      }

      setShowAuthModal(false);
    } catch (err: any) {
      console.error("Firebase Login Error:", err);
      
      let message = "Échec de la connexion Google.";
      let hint = "";
      if (window.self !== window.top) {
        hint = " Conseil : Comme l'application tourne dans l'aperçu intégré (iframe), les politiques de sécurité de votre navigateur bloquent parfois la fenêtre de connexion Google. Veuillez ouvrir l'application dans un nouvel onglet (en cliquant sur l'icône de flèche en haut à droite) pour vous connecter sans encombre.";
      }

      if (err.code === "auth/popup-closed-by-user") {
        message = "La fenêtre de connexion Google a été fermée avant la fin de l'authentification." + hint;
      } else if (err.code === "auth/cancelled-popup-request") {
        message = "La tentative de connexion Google a été annulée. Une autre opération d'authentification était peut-être en cours, ou le navigateur a bloqué la fenêtre." + hint;
      } else if (err.code === "auth/popup-blocked") {
        message = "La fenêtre de connexion Google a été bloquée par le bloqueur de pop-up de votre navigateur." + (hint || " Veuillez autoriser les fenêtres pop-up pour ce site.");
      } else {
        message = `Échec de la connexion Google : ${err.message || err}`;
      }
      
      setLoginError(message);
    }
  };

  const handleCustomEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    const rawEmail = loginEmail.trim();
    const email = rawEmail.includes("@") ? rawEmail : `${rawEmail}@ilivik.com`;
    const password = loginPassword.trim();
    const name = loginName.trim();

    if (!email.toLowerCase().endsWith("@ilivik.com")) {
      setLoginError("Accès refusé : Seuls les e-mails de domaine @ilivik.com et les noms d'utilisateurs sont autorisés.");
      return;
    }

    try {
      if (isSignUp) {
        if (!name) {
          setLoginError("Veuillez saisir votre nom complet.");
          return;
        }
        const response = await fetch("/api/users/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password })
        });
        
        if (response.ok) {
          setLoginError("Compte créé avec succès. Il est en attente de validation par le Super-Administrateur.");
          setLoginEmail("");
          setLoginPassword("");
          setLoginName("");
          setIsSignUp(false);
        } else {
          const errData = await parseResponseGracefully(response, "Erreur lors de l'inscription.");
          setLoginError(errData.error || "Erreur lors de l'inscription.");
        }
      } else {
        const response = await fetch("/api/users/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });

        if (response.ok) {
          const data = await parseResponseGracefully(response, "Erreur de connexion.");
          const customUser = {
            email: data.email,
            displayName: data.name,
            uid: data.email,
            customRole: data.role
          };
          setFirebaseUser(customUser);
          setCurrentUser(data.name);
          setFormAuthor(data.name);
          localStorage.setItem("sb_support_user", data.name);
          localStorage.setItem("sb_custom_user_session", JSON.stringify(customUser));

          setLoginEmail("");
          setLoginPassword("");
          setShowAuthModal(false);
        } else {
          const errData = await parseResponseGracefully(response, "E-mail ou mot de passe incorrect.");
          setLoginError(errData.error || "E-mail ou mot de passe incorrect.");
        }
      }
    } catch (err: any) {
      setLoginError("Erreur réseau: " + err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error(err);
    }
    setFirebaseUser(null);
    setCurrentUser("Team Ilivik Membre");
    setFormAuthor("Team Ilivik Membre");
    localStorage.removeItem("sb_support_user");
    localStorage.removeItem("sb_custom_user_session");
  };

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isAiLoading]);

  const renderMessageContent = (content: string) => {
    const regex = /([A-Z0-9]+-[A-Z0-9]+)/gi;
    const parts = content.split(regex);
    return parts.map((part, i) => {
      if (/^[A-Z0-9]+-[A-Z0-9]+$/i.test(part)) {
        const matchingError = errors.find(
          (e) => e.errorCode && e.errorCode.toUpperCase() === part.toUpperCase()
        );
        if (matchingError) {
          return (
            <button
              type="button"
              key={i}
              onClick={() => handleSelectError(matchingError)}
              className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 text-[10.5px] font-bold rounded hover:bg-indigo-500/40 transition-colors mx-0.5 border border-indigo-500/20 shadow-sm"
            >
              {part}
            </button>
          );
        }
      }
      return <span key={i}>{part}</span>;
    });
  };

  const renderSolutionImagesForMessage = (content: string) => {
    const regex = /([A-Z0-9]+-[A-Z0-9]+)/gi;
    const matches = content.match(regex) || [];
    const uniqueCodes = Array.from(new Set(matches.map((c) => c.toUpperCase())));
    
    return uniqueCodes.map((code) => {
      const matchingError = errors.find((e) => e.errorCode && e.errorCode.toUpperCase() === code);
      if (matchingError && matchingError.solutionImageUrl) {
        return (
          <div key={`sol-${matchingError.id}`} className="mt-3.5 flex flex-col gap-1.5 bg-slate-950/80 p-2.5 rounded-xl border border-emerald-900/40 shadow-inner">
            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Solution Visuelle ({matchingError.errorCode})
            </span>
            <div className="rounded-lg overflow-hidden border border-slate-800 bg-slate-900 flex justify-center mt-1">
              <img src={matchingError.solutionImageUrl} className="w-full object-contain max-h-[160px]" alt={`Solution for ${matchingError.errorCode}`} />
            </div>
          </div>
        );
      }
      return null;
    });
  };

  const fetchErrors = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/errors");
      if (response.ok) {
        const data = await response.json();
        setErrors(data);
      } else {
        console.log("Les données du catalogue n'ont pas pu être chargées depuis le serveur.");
      }
    } catch (err) {
      console.log("Catalogue indisponible (mode hors ligne ou chargement).");
    } finally {
      setIsLoading(false);
    }
  };

  // Filter current errors based on query and tags
  const filteredErrors = useMemo(() => {
    return errors.filter((err) => {
      const matchesSearch = 
        err.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        err.errorCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        err.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        err.solution.toLowerCase().includes(searchQuery.toLowerCase()) ||
        err.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
        
      const matchesTag = selectedTag ? err.tags.includes(selectedTag) : true;
      return matchesSearch && matchesTag;
    });
  }, [errors, searchQuery, selectedTag]);

  // Aggregate unique tags from database
  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    errors.forEach((err) => {
      err.tags.forEach((tag) => tagsSet.add(tag));
    });
    return Array.from(tagsSet);
  }, [errors]);

  // Function to save user display name
  const saveUserName = (name: string) => {
    const trimmed = name.trim() || "Team Ilivik Membre";
    setCurrentUser(trimmed);
    localStorage.setItem("sb_support_user", trimmed);
    setFormAuthor(trimmed);
  };

  // Handle Tag Input operations
  const addFormTag = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const tag = newTagInput.trim().toLowerCase();
      if (tag && !formTags.includes(tag)) {
        setFormTags([...formTags, tag]);
      }
      setNewTagInput("");
    }
  };

  const removeFormTag = (index: number) => {
    setFormTags(formTags.filter((_, i) => i !== index));
  };

  const handleInlineSolutionFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSolutionImageInput(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Convert files to base64
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, target: "form" | "chat" | "solution") => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (target === "form") {
          setFormImage(reader.result as string);
        } else if (target === "solution") {
          setFormSolutionImage(reader.result as string);
        } else {
          setChatImage(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit new error manual logging
  const handleAddErrorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle || !formDescription || !formClient || !formClient.trim()) {
      setSubmitStatus({ success: false, message: "Veuillez remplir le titre, la description de la panne et le nom du client." });
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus(null);

    const isResolvedVal = !!(formSolution && formSolution.trim() !== "");
    const resolvedAtVal = isResolvedVal ? new Date().toISOString() : null;

    const clientSuffix = formClient.trim().substring(0, 3).toUpperCase();
    const generatedErrorCode = `${String(errors.length + 1).padStart(3, '0')}-${clientSuffix}`;

    try {
      const finalApplication = formApplication === "Other" ? formCustomApplication.trim() || "Other" : formApplication;

      const response = await fetch("/api/errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application: finalApplication,
          title: formTitle,
          errorCode: generatedErrorCode,
          description: formDescription,
          solution: formSolution,
          imageUrl: formImage,
          solutionImageUrl: formSolutionImage,
          tags: formTags,
          author: formAuthor,
          errorType: formErrorType,
          errorCategory: formErrorCategory,
          errorPriority: formErrorPriority,
          client: formClient,
          isResolved: isResolvedVal,
          resolvedAt: resolvedAtVal,
          createdBy: firebaseUser?.email || "Team Ilivik Membre Code",
          cretedby: firebaseUser?.email || "Team Ilivik Membre Code",
        }),
      });

      if (response.ok) {
        const successMessage = formSolution.trim() 
          ? "Succès ! Cette solution a été archivée dans la base de connaissances."
          : "Fiche d'erreur créée ! Elle est archivée en attente de solution.";
        setSubmitStatus({ success: true, message: successMessage });
        // Clear Form fields
        setFormApplication("Salesbuzz");
        setFormCustomApplication("");
        setFormTitle("");
        setFormCode("");
        setFormDescription("");
        setFormSolution("");
        setFormImage("");
        setFormSolutionImage("");
        setFormTags([]);
        setFormErrorType("frontoffice");
        setFormErrorCategory("manipulation");
        setFormErrorPriority("level 03");
        setFormClient("");
        // Sync catalog
        await fetchErrors();
        // Redirect shortly
        setTimeout(() => {
          setActiveTab("catalog");
          setSubmitStatus(null);
        }, 1500);
      } else {
        const errorData = await parseResponseGracefully(response, "Une erreur est survenue lors de l'enregistrement.");
        setSubmitStatus({ success: false, message: errorData.error || "Une erreur est survenue lors de l'enregistrement." });
      }
    } catch (err: any) {
      setSubmitStatus({ success: false, message: "Impossible de joindre le serveur de base de données." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Post chat query to Gemini AI API
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() && !chatImage) return;

    const userQuery = chatInput;
    const attachedImg = chatImage;
    
    // Append the User query message in chat immediately
    const userMsgId = "msg_" + Date.now();
    const newUserMessage: ChatMessage = {
      id: userMsgId,
      role: "user",
      content: userQuery,
      image: attachedImg,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setChatMessages((prev) => [...prev, newUserMessage]);
    setChatInput("");
    setChatImage("");
    setIsAiLoading(true);

    try {
      // Map existing messages to history formatting for the backend
      const history = chatMessages
        .filter((m) => m.id !== "welcome-msg") // skip splash welcome
        .map((m) => ({
          role: m.role === "user" ? "user" : "model",
          content: m.content,
        }));

      const googleAccessToken = (window as any).__GOOGLE_ACCESS_TOKEN__ || "";

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: userQuery,
          image: attachedImg,
          chatHistory: history,
          googleAccessToken,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setChatMessages((prev) => [
          ...prev,
          {
            id: "msg_" + Date.now(),
            role: "model",
            content: data.response,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      } else {
        const errJson = await response.json();
        setChatMessages((prev) => [
          ...prev,
          {
            id: "msg_" + Date.now(),
            role: "model",
            content: `⚠️ **Erreur de connexion assistante :** ${errJson.error || "Impossible de joindre les serveurs IA. Vérifiez que la variable GEMINI_API_KEY est configurée."}`,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      }
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: "msg_" + Date.now(),
          role: "model",
          content: "❌ Une erreur réseau est survenue. Vérifiez la connexion du serveur d'assistance.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Delete logged error from server
  const handleDeleteError = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cette fiche de l'historique ?")) {
      return;
    }

    try {
      const response = await fetch(`/api/errors/${id}`, { method: "DELETE" });
      if (response.ok) {
        setErrors(errors.filter((err) => err.id !== id));
        if (viewingErrorDetail?.id === id) {
          handleSelectError(null);
        }
      } else {
        alert("Impossible de supprimer la fiche.");
      }
    } catch (err) {
      alert("Erreur réseau lors de la suppression.");
    }
  };

  // Helper trigger to search error by base64 direct matches
  const triggerImageSearchWithAI = (base64Img: string) => {
    setActiveTab("chat");
    setChatImage(base64Img);
    setChatInput("Pouvez-vous identifier cette capture d'erreur de SalesBuzz et me donner la solution ?");
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div id="app-root" className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col p-4 sm:p-6 gap-6 selection:bg-indigo-500/30 selection:text-white max-w-7xl mx-auto w-full">
      
      {/* Dynamic Firestore setup warning if not enabled */}
      {firestoreStatus && !firestoreStatus.ok && (
        (() => {
          const isNotFound = firestoreStatus.error?.toLowerCase().includes("not_found") || 
                             firestoreStatus.error?.toLowerCase().includes("not found") ||
                             firestoreStatus.error?.toLowerCase().includes("code: 5") ||
                             firestoreStatus.error?.toLowerCase().includes("database");
          return (
            <div className="bg-gradient-to-r from-red-500/10 via-amber-500/10 to-red-500/10 border border-red-500/30 p-3.5 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 text-xs shadow-lg backdrop-blur-sm animate-pulse">
              <div className="flex items-center gap-3">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                </span>
                <div className="text-slate-200">
                  {isNotFound ? (
                    <span>
                      <span className="font-bold text-amber-400">⚠️ Base de données Firestore manquante</span> : 
                      L'API est activée, mais la base de données <code className="bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-indigo-300">(default)</code> n'existe pas encore dans votre console Firebase <code className="bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-indigo-300">ilivik-knowledg-base</code>. Cliquez sur le bouton pour la créer en quelques clics.
                    </span>
                  ) : (
                    <span>
                      <span className="font-bold text-red-400">⚠️ Configuration Firestore en attente</span> : 
                      L'API Cloud Firestore n'est pas encore activée ou est désactivée dans votre projet Firebase <code className="bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-indigo-300">ilivik-knowledg-base</code>.
                    </span>
                  )}
                </div>
              </div>
              <a 
                href={isNotFound 
                  ? "https://console.firebase.google.com/project/ilivik-knowledg-base/firestore" 
                  : "https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=ilivik-knowledg-base"
                }
                target="_blank" 
                rel="noopener noreferrer" 
                className="flex items-center gap-1.5 font-bold bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl cursor-pointer transition-all border border-indigo-500/30 shadow-md shadow-indigo-500/10 shrink-0 whitespace-nowrap"
              >
                {isNotFound ? "Créer la base de données" : "Activer l'API Firestore"} <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          );
        })()
      )}

      {/* Upper Brand Bar */}
      <header id="header-brand" className="flex flex-col sm:flex-row justify-between items-center bg-slate-900/65 backdrop-blur-md p-4 rounded-2xl border border-slate-800 shadow-xl gap-4">
        <div className="flex items-center gap-3">
          <img src="https://gdm-catalog-fmapi-prod.imgix.net/ProductLogo/790eed34-7b2b-45dd-a139-5206e4dcaea5.jpeg" alt="SalesBuzz Logo" className="w-10 h-10 rounded-xl object-contain shadow-lg shadow-indigo-500/20" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              SalesBuzz <span className="text-indigo-400 font-semibold text-xs bg-indigo-950/80 border border-indigo-500/30 px-2.5 py-0.5 rounded-full uppercase tracking-wider">KnowledgeBase</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Team Ilivik Central Hub</p>
          </div>
        </div>

        {/* User Settings & Authentication Widget */}
        <div className="flex items-center gap-4">
          {isLoggedIn ? (
            <div className="flex items-center gap-3 bg-slate-800/40 border border-emerald-500/20 rounded-2xl p-1.5 pl-3 pr-2.5">
              <div className="relative">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 stroke-2 flex items-center justify-center font-bold text-xs">
                  {firebaseUser?.photoURL ? (
                    <img src={firebaseUser.photoURL} className="w-8 h-8 rounded-xl object-cover" alt="User" referrerPolicy="no-referrer" />
                  ) : (
                    <User className="h-4 w-4 text-emerald-400 font-bold" />
                  )}
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-slate-900"></span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-emerald-400 font-bold uppercase leading-none tracking-wider flex items-center gap-1">
                  Team Ilivik ✓
                </span>
                <input
                  id="user-collaborator-input"
                  type="text"
                  value={currentUser}
                  onChange={(e) => saveUserName(e.target.value)}
                  placeholder="Votre nom..."
                  className="bg-transparent text-xs font-semibold text-slate-200 outline-none border-b border-transparent focus:border-indigo-500 py-0.5 w-[140px]"
                />
              </div>
              <button
                id="header-logout-btn"
                onClick={handleLogout}
                className="text-[10px] text-slate-400 hover:text-red-400 font-bold py-1 px-2.5 rounded-lg hover:bg-red-500/5 transition-all outline-none border border-slate-800 hover:border-red-500/10"
              >
                Quitter
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-slate-900/40 border border-slate-800 rounded-2xl p-1.5 pl-3 pr-2.5">
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-500 font-bold uppercase leading-none tracking-wider">Mode Visiteur</span>
                <span className="text-xs font-bold text-slate-300">Public (Lecture seule)</span>
              </div>
              <button
                id="header-login-btn"
                onClick={() => {
                  setAuthPurpose("general");
                  setShowAuthModal(true);
                }}
                className="text-xs font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white py-1.5 px-3.5 rounded-xl shadow-md cursor-pointer transition-all"
              >
                Connexion Membre 🔑
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Container Dashboard */}
      <main className="grow max-w-7xl w-full mx-auto flex flex-col gap-6">
        
        {/* Navigation Tabs Bar - App WebView ready layout with Bento styling */}
        <div id="tab-navigation" className="bg-slate-900/60 border border-slate-800 rounded-2xl p-1 flex shadow-lg">
          {getPermission("allowCatalogTab") && (
            <button
              id="tab-btn-catalog"
              onClick={() => { setActiveTab("catalog"); setSelectedTag(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === "catalog"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <BookOpen className="h-4 w-4" />
              <span>Base Soluce ({errors.length})</span>
            </button>
          )}

          {getPermission("allowChatTab") && (
            <button
              id="tab-btn-chat"
              onClick={() => setActiveTab("chat")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === "chat"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <div className="relative">
                <MessageSquare className="h-4 w-4 animate-pulse text-indigo-300" />
              </div>
              <span>Assistant IA Chat</span>
            </button>
          )}

          {getPermission("allowAddTab") && (
            <button
              id="tab-btn-add"
              onClick={() => setActiveTab("add")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === "add"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <Plus className="h-4 w-4" />
              <span>Déclarer Erreur</span>
            </button>
          )}

          {getPermission("allowAttachmentsSpace") && (
            <button
              id="tab-btn-attachments"
              onClick={() => setActiveTab("attachments")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === "attachments"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <Layers className="h-4 w-4 text-indigo-400" />
              <span className="hidden sm:inline">Pièces Jointes</span>
              <span className="sm:hidden">Fichiers</span>
            </button>
          )}

          {getPermission("allowDatatable") && (
            <button
              id="tab-btn-datatable"
              onClick={() => setActiveTab("datatable")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === "datatable"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <Table className="h-4 w-4 text-indigo-400" />
              <span className="hidden sm:inline">Tableau Données</span>
              <span className="sm:hidden">Tableau</span>
            </button>
          )}

          {isSuperAdmin && (
            <button
              id="tab-btn-webview"
              onClick={() => setActiveTab("webview")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === "webview"
                  ? "bg-indigo-600 text-white shadow-md shadow-amber-500/25 border border-amber-500/20"
                  : "text-amber-400 hover:bg-slate-800/60 hover:text-amber-300"
              }`}
            >
              <Smartphone className="h-4 w-4 text-amber-400" />
              <span className="font-extrabold text-amber-300">Console SuperAdmin 🔑</span>
            </button>
          )}
        </div>

        {/* TAB 1: BENTO DASHBOARD OF SOLUTIONS */}
        {activeTab === "catalog" && getPermission("allowCatalogTab") && (
          <div id="view-catalog" className="grid grid-cols-12 gap-5 flex-grow items-start min-h-0">
            
            {/* Card A: Search & Tags (cols 12, lg:col-span-8) */}
            <section id="bento-search-block" className="col-span-12 lg:col-span-8 bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col justify-center relative overflow-hidden shadow-2xl min-h-[180px] lg:min-h-[200px] h-auto lg:h-auto py-5 lg:py-6">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Search className="w-32 h-32 text-indigo-400" />
              </div>
              
              <h2 className="text-xl sm:text-2xl font-bold mb-4 text-slate-100 tracking-tight">Trouver une solution rapidement</h2>
              
              <div className="flex gap-3">
                <div className="relative flex-grow">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    id="catalog-search-input"
                    type="text"
                    placeholder="Entrez l'erreur (ex: Sync Error 403, SB-102)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500/80 rounded-xl py-3.5 px-5 pl-12 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm sm:text-lg text-slate-100 placeholder-slate-500 font-medium transition-all"
                  />
                  {searchQuery && (
                    <button
                      id="clear-search-btn"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filter tags list */}
              {allTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-3 border-t border-slate-800/40 overflow-x-auto no-scrollbar">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1">Sujets :</span>
                  <button
                    id="tag-filter-all"
                    onClick={() => setSelectedTag(null)}
                    className={`px-3 py-1 text-[10px] sm:text-xs font-bold rounded-full border transition-all ${
                      selectedTag === null
                        ? "bg-indigo-600 text-white border-indigo-500"
                        : "bg-slate-950 text-slate-400 border-slate-850 hover:bg-slate-800 hover:text-slate-200"
                    }`}
                  >
                    Tout afficher
                  </button>
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      id={`tag-filter-${tag}`}
                      onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                      className={`px-3 py-1 text-[10px] sm:text-xs font-bold rounded-full border transition-all flex items-center gap-1 ${
                        tag === selectedTag
                          ? "bg-indigo-600 text-white border-indigo-500"
                          : "bg-slate-950 text-slate-400 border-slate-850 hover:bg-slate-800 hover:text-slate-200"
                      }`}
                    >
                      <Tag className="h-3 w-3 opacity-60" />
                      <span>{tag}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Card B: AI Assistant Panel / Chat flow (cols 12, lg:col-span-4) */}
            <section id="bento-ai-panel" className="col-span-12 lg:col-span-4 lg:row-span-2 bg-indigo-950/20 rounded-3xl border border-indigo-500/30 p-5 flex flex-col h-[420px] lg:h-[504px] shadow-2xl">
              <div className="flex items-center mb-3">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                  </span>
                  <h3 className="font-bold text-slate-100 text-sm">ilivik AI</h3>
                </div>
              </div>

              {/* Chat Messages flow */}
              <div className="flex-grow bg-slate-950/60 rounded-2xl p-4 mb-3 overflow-y-auto flex flex-col gap-3 border border-slate-900 no-scrollbar">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col max-w-[85%] ${
                      msg.role === "user" ? "self-end items-end" : "self-start items-start"
                    }`}
                  >
                    <span className="text-[9px] text-slate-500 font-semibold mb-0.5">
                      {msg.role === "user" ? "Moi" : "SalesBuzz Assist"} • {msg.timestamp}
                    </span>
                    <div
                      className={`text-xs py-2.5 px-3.5 rounded-2xl whitespace-pre-line leading-relaxed border ${
                        msg.role === "user"
                          ? "bg-indigo-600 border-indigo-500 text-white rounded-tr-none shadow-md"
                          : "bg-slate-900 border-slate-800 text-slate-200 rounded-tl-none"
                      }`}
                    >
                      {renderMessageContent(msg.content)}
                      {msg.role !== "user" && renderSolutionImagesForMessage(msg.content)}
                      {msg.image && (
                        <div className="mt-2.5 rounded-lg overflow-hidden border border-slate-800 max-w-xs max-h-[120px]">
                          <img src={msg.image} className="w-full h-full object-cover" alt="Chat attachment" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isAiLoading && (
                  <div className="self-start flex flex-col items-start">
                    <span className="text-[9px] text-slate-500 font-medium mb-0.5">Recherche de diagnostic en cours...</span>
                    <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl rounded-tl-none shadow-md flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                      <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* AI Keyboard and files upload bar */}
              <form onSubmit={handleSendChatMessage} className="flex flex-col gap-2">
                {chatImage && (
                  <div className="relative inline-flex w-fit items-center gap-1 bg-indigo-950/80 border border-indigo-500/20 p-1.5 rounded-lg">
                    <img src={chatImage} className="h-8 w-8 object-cover rounded" alt="Attached preview" />
                    <span className="text-[9px] text-indigo-300 font-semibold px-1">Pièce jointe prête</span>
                    <button
                      id="clear-chat-img-btn"
                      type="button"
                      onClick={() => setChatImage("")}
                      className="text-slate-400 hover:text-slate-200 p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                <div className="flex gap-2">
                  <label className="bg-slate-950 border border-slate-850 hover:bg-slate-900 p-3 rounded-xl cursor-pointer flex items-center justify-center text-slate-400 transition-all">
                    <Camera className="h-4 w-4" />
                    <input
                      id="chat-snapshot-file-input"
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange(e, "chat")}
                      className="hidden"
                    />
                  </label>
                  <input
                    id="chat-input-message"
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Posez une question ou joignez une photo..."
                    className="bg-slate-950 border border-slate-850 rounded-xl px-3 py-2.5 text-xs flex-grow text-slate-100 focus:outline-none focus:border-indigo-500 placeholder-slate-500"
                  />
                  <button
                    id="chat-send-btn"
                    type="submit"
                    disabled={!chatInput.trim() && !chatImage}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-xl disabled:opacity-40 transition-all shadow-md shrink-0"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </section>

            {/* Card C: Recent Errors Catalog (cols 12, lg:col-span-8) */}
            {getPermission("allowRecentErrors") && (
            <section id="bento-errors-block" className="col-span-12 lg:col-span-8 bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col h-[288px] shadow-2xl overflow-hidden">
              <div className="flex justify-between items-center mb-3.5">
                <h3 className="font-bold text-slate-200 text-sm">Erreurs Récentes ({filteredErrors.filter(e => errorDisplayType === "all" ? true : errorDisplayType === "resolved" ? e.isResolved : !e.isResolved).length})</h3>
                <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button 
                    onClick={() => setErrorDisplayType("all")}
                    className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider transition-all ${errorDisplayType === "all" ? "bg-indigo-950/60 text-indigo-400 border border-indigo-500/20" : "text-slate-500 hover:text-slate-300"}`}
                  >
                    Tous
                  </button>
                  <button 
                    onClick={() => setErrorDisplayType("unresolved")}
                    className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider transition-all ${errorDisplayType === "unresolved" ? "bg-amber-950/60 text-amber-400 border border-amber-500/20" : "text-slate-500 hover:text-slate-300"}`}
                  >
                    Non Résolu
                  </button>
                  <button 
                    onClick={() => setErrorDisplayType("resolved")}
                    className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider transition-all ${errorDisplayType === "resolved" ? "bg-emerald-950/60 text-emerald-400 border border-emerald-500/20" : "text-slate-500 hover:text-slate-300"}`}
                  >
                    Résolu
                  </button>
                </div>
              </div>
 
              {/* Scrollable list */}
              <div className="space-y-2.5 overflow-y-auto max-h-[210px] pr-1 scrollbar-thin">
                {isLoading ? (
                  <div className="p-12 flex flex-col items-center justify-center text-slate-450 text-xs">
                    <div className="border-2 border-slate-700 border-t-indigo-400 rounded-full h-5 w-5 animate-spin mb-2"></div>
                    <span>Chargement de la base Firestore...</span>
                  </div>
                ) : filteredErrors.filter(e => errorDisplayType === "all" ? true : errorDisplayType === "resolved" ? e.isResolved : !e.isResolved).length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-xs">
                    Aucune fiche ne correspond à votre filtre.
                  </div>
                ) : (
                  filteredErrors.filter(e => errorDisplayType === "all" ? true : errorDisplayType === "resolved" ? e.isResolved : !e.isResolved).map((err) => (
                    <div
                      key={err.id}
                      onClick={() => handleSelectError(err)}
                      className="flex justify-between items-center p-3 bg-slate-950/40 hover:bg-slate-950/90 rounded-xl border border-slate-850 hover:border-indigo-500/65 transition-all cursor-pointer group"
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          {err.errorCode && (
                            <span className="px-1.5 py-0.2 bg-indigo-950/80 border border-indigo-500/20 text-indigo-400 font-mono text-[9px] font-bold rounded">
                              {err.errorCode}
                            </span>
                          )}
                          {err.isResolved ? (
                            <span className="px-1.5 py-0.2 bg-emerald-950/80 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold rounded shrink-0">
                              Résolu ✓
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 bg-red-950/85 border border-red-500/30 text-red-400 text-[9px] font-bold rounded animate-pulse shrink-0">
                              Non Résolu ❌
                            </span>
                          )}
                          
                          {/* Priority badge */}
                          {(err.errorPriority === "level 01" || err.errorPriority?.includes("01")) && (
                            <span className="px-1.5 py-0.2 bg-red-950 text-red-500 font-bold border border-red-500/30 text-[9px] rounded uppercase">🚨 Critique!</span>
                          )}
                          {(err.errorPriority === "level 02" || err.errorPriority?.includes("02")) && (
                            <span className="px-1.5 py-0.2 bg-amber-950 text-amber-400 font-bold border border-amber-500/30 text-[9px] rounded uppercase">Blocked</span>
                          )}
                          
                          <span className="px-1.5 py-0.2 bg-slate-900 text-slate-400 border border-slate-800 text-[9px] font-bold rounded uppercase">
                            {err.errorCategory || "manipulation"}
                          </span>

                          <span className="text-[9px] text-slate-500 truncate">
                            {new Date(err.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-slate-200 group-hover:text-indigo-400 transition-all truncate">
                          {err.title}
                        </h4>
                      </div>
                      
                      <div className="flex items-center gap-1.5 shrink-0">
                        {err.imageUrl && (
                          <span className="text-[9px] bg-indigo-950/60 text-indigo-300 px-1.5 py-0.2 rounded border border-indigo-500/10 font-bold uppercase">Image</span>
                        )}
                        
                        {isLoggedIn && getPermission("allowDeleteError") && (
                          <button
                            id={`delete-btn-${err.id}`}
                            onClick={(e) => handleDeleteError(err.id, e)}
                            className="text-slate-500 hover:text-red-400 p-1 rounded-md hover:bg-slate-900 transition-all"
                            title="Supprimer la fiche"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}

                        <span className="text-indigo-400 text-[10px] font-bold group-hover:translate-x-0.5 transition-all ml-1 shrink-0">Voir →</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
            )}

            {/* Stats Blocks */}
            {getPermission("allowStatsBlocks") && (
              <>
                {/* Stats Block 1: Solutions Apportées */}
                <section className={`col-span-6 ${getPermission("allowAddTab") ? "lg:col-span-4" : "lg:col-span-6"} bg-slate-900 rounded-3xl border border-slate-800 p-3 sm:p-5 flex flex-col justify-center items-center gap-1 shadow-2xl h-[134px] xl:h-[150px] hover:border-slate-700 transition-all`}>
                  <div className="text-3xl sm:text-4xl font-extrabold text-emerald-400 tracking-tight leading-none">{errors.filter(e => e.isResolved).length}</div>
                  <div className="text-[9px] sm:text-[10px] font-bold uppercase text-slate-400 tracking-wider text-center mt-2">Solutions Apportées</div>
                </section>
                
                {/* Stats Block 2: Erreurs Signalées */}
                <section className={`col-span-6 ${getPermission("allowAddTab") ? "lg:col-span-4" : "lg:col-span-6"} bg-slate-900 rounded-3xl border border-slate-800 p-3 sm:p-5 flex flex-col justify-center items-center gap-1 shadow-2xl h-[134px] xl:h-[150px] hover:border-slate-700 transition-all`}>
                  <div className="text-3xl sm:text-4xl font-extrabold text-indigo-450 tracking-tight leading-none">{errors.length}</div>
                  <div className="text-[9px] sm:text-[10px] font-bold uppercase text-slate-400 tracking-wider text-center mt-2">Erreurs Signalées</div>
                </section>
              </>
            )}

            {/* Card E: Quick Add Shortcut Card (cols 12, lg:col-span-4) */}
            {getPermission("allowAddTab") && (
            <section
              id="bento-quick-add-block"
              onClick={() => setActiveTab("add")}
              className="col-span-12 sm:col-span-6 lg:col-span-4 bg-indigo-600 hover:bg-indigo-550 rounded-3xl p-5 flex flex-col justify-center items-center text-center cursor-pointer transition-all hover:scale-[1.02] shadow-xl shadow-indigo-950/40 text-white h-[134px] xl:h-[150px]"
            >
              <div className="bg-white/15 p-2 rounded-full mb-1">
                <Plus className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-xs">Ajouter une Erreur</span>
              <span className="text-[9px] opacity-80 mt-0.5">Pour l'équipe Ilivik</span>
            </section>
            )}

          </div>
        )}

        {/* TAB 2: AI ASSISTANT CHAT & IMAGE IDENTIFICATION */}
        {activeTab === "chat" && getPermission("allowChatTab") && (
          <div id="view-chat" className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col md:grid md:grid-cols-4 overflow-hidden h-[580px]">
            
            {/* Left AI Chat sidebar instructions */}
            <div className="md:col-span-1 bg-slate-950/60 p-5 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col justify-between">
              <div>
                <span className="px-2.5 py-1 bg-indigo-600 text-white rounded text-[9px] font-extrabold tracking-wider uppercase">Fuzzy Vision Match</span>
                <h3 className="text-sm font-bold text-slate-100 mt-3">Analyse Intelligente</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Avec l'Assistant de Support SalesBuzz Vous pouvez :
                </p>
                <ul className="text-xs text-slate-450 space-y-2 mt-3 list-disc pl-4 leading-relaxed">
                  <li>Lui décrire textuellement un symptôme de panne rencontrée.</li>
                  <li>Lui envoyer une <strong>capture d'écran d'erreur</strong> (format Image).</li>
                  <li>L'IA lira le texte de la capture, consultera notre Base de Connaissances, puis vous proposera la solution exacte !</li>
                </ul>
              </div>

              {/* Tips */}
              <div className="bg-indigo-950/40 border border-indigo-500/20 rounded-xl p-3.5 text-xs mt-4">
                <p className="text-indigo-300 font-bold flex items-center gap-1.5">
                  <Info className="h-4 w-4 text-indigo-400 shrink-0" />
                  Pratique en clientèle
                </p>
                <p className="text-slate-400 mt-1 leading-normal">
                  Prenez en photo l'écran de la tablette du vendeur et envoyez-la ici pour diagnostiquer l'anomalie en direct.
                </p>
              </div>
            </div>

            {/* Right Chat workspace */}
            <div className="md:col-span-3 flex flex-col h-full overflow-hidden bg-slate-900">
              
              {/* Messages display container */}
              <div className="grow p-5 overflow-y-auto flex flex-col gap-4 no-scrollbar">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col max-w-[85%] ${
                      msg.role === "user" ? "self-end items-end" : "self-start items-start"
                    }`}
                  >
                    <span className="text-[9px] text-slate-500 font-bold mb-1 mr-1">
                      {msg.role === "user" ? "Vous" : "SalesBuzz Assist"} • {msg.timestamp}
                    </span>

                    {/* Chat Bubble Box */}
                    <div
                      className={`text-xs sm:text-sm py-2.5 px-3.5 rounded-2xl shadow-md whitespace-pre-line leading-relaxed border ${
                        msg.role === "user"
                          ? "bg-indigo-600 border-indigo-500 text-white rounded-tr-none"
                          : "bg-slate-950 border-slate-850 text-slate-200 rounded-tl-none"
                      }`}
                    >
                      {renderMessageContent(msg.content)}
                      {msg.role !== "user" && renderSolutionImagesForMessage(msg.content)}

                      {/* Display image inside speech bubble if attached */}
                      {msg.image && (
                        <div className="mt-2.5 rounded-lg overflow-hidden border border-slate-800 max-w-xs max-h-[160px]">
                          <img src={msg.image} className="w-full h-full object-cover" alt="User upload inside chat" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* AI response generating loading state */}
                {isAiLoading && (
                  <div className="self-start flex flex-col items-start max-w-[80%]">
                    <span className="text-[9px] text-slate-500 font-semibold mb-1">Diagnostic SalesBuzz en cours...</span>
                    <div className="bg-slate-950 border border-slate-850 p-4 rounded-2xl rounded-tl-none shadow-md flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce delay-100"></div>
                      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce delay-200"></div>
                    </div>
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>

              {/* Chat controller form bar */}
              <div className="bg-slate-950/60 border-t border-slate-800 p-4 mt-auto">
                {!getPermission("allowChatActions") ? (
                  <div className="text-center py-4 px-6 bg-slate-900/50 border border-slate-850 rounded-2xl text-xs text-slate-400 font-medium flex items-center justify-center gap-2 select-none">
                    <span>🔏 Les interactions et saisies de clavardage sont désactivées pour votre profil.</span>
                  </div>
                ) : (
                  <form onSubmit={handleSendChatMessage} className="flex flex-col gap-2">
                    
                    {/* Selected image preview inside control bar */}
                    {chatImage && (
                      <div className="relative inline-flex w-fit items-center gap-1.5 bg-indigo-950 border border-indigo-500/20 p-1.5 rounded-lg">
                        <img src={chatImage} className="h-10 w-10 object-cover rounded" alt="Attached preview" />
                        <div className="flex flex-col text-left pr-6 px-1">
                          <span className="text-[9px] font-bold text-indigo-400 uppercase">Image Attachée</span>
                          <span className="text-[8px] text-slate-500">Prête pour l'envoi</span>
                        </div>
                        <button
                          id="clear-chat-img-btn"
                          onClick={() => setChatImage("")}
                          className="absolute right-1 top-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      {/* Camera snapshot button */}
                      {getPermission("allowUseAI") ? (
                        <label className="p-3 bg-slate-900 hover:bg-slate-800 text-slate-350 rounded-xl cursor-pointer transition-all border border-slate-800 hover:border-slate-700 shrink-0">
                          <Camera className="h-5 w-5" />
                          <input
                            id="chat-snapshot-file-input"
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileChange(e, "chat")}
                            className="hidden"
                          />
                        </label>
                      ) : (
                        <div className="p-3 bg-slate-900 text-slate-600 rounded-xl border border-slate-805 select-none cursor-not-allowed shrink-0" title="Vision IA désactivée par administrateur">
                          <Camera className="h-5 w-5" />
                        </div>
                      )}

                      {/* Main text box */}
                      <input
                        id="chat-input-message"
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Décrivez l'erreur de SFA ou joignez sa photo..."
                        className="grow px-4 py-3 bg-slate-900 border border-slate-800 focus:border-indigo-500 text-xs sm:text-sm text-slate-100 rounded-xl focus:outline-none placeholder-slate-500 transition-all font-medium whitespace-nowrap min-w-0"
                      />

                      {/* Send client button */}
                      <button
                        id="chat-send-btn"
                        type="submit"
                        disabled={!chatInput.trim() && !chatImage}
                        className="p-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition-all shadow-md shrink-0 animate-fade-in"
                      >
                        <Send className="h-5 w-5" />
                      </button>
                    </div>
                  </form>
                )}
              </div>

            </div>

          </div>
        )}

        {/* TAB 3: REGISTER NEW KNOWLEDGE BASE RECIPE */}
        {activeTab === "add" && getPermission("allowAddTab") && (
          <div id="view-add-error" className="max-w-2xl mx-auto w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            {!isLoggedIn ? (
              <div className="flex flex-col items-center gap-5 py-6 text-center max-w-md mx-auto">
                <div className="w-16 h-16 bg-indigo-950/80 border border-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/5">
                  <User className="h-8 w-8 text-indigo-400 stroke-[1.5]" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-100 tracking-tight">Accès Collaborateur Requis</h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    L'enregistrement de nouvelles erreurs ou la rédaction de solutions dans la Base de Connaissances est exclusivement réservé aux membres de la <strong>Team Ilivik</strong>.
                  </p>
                </div>

                <div className="w-full flex flex-col gap-4 mt-4">
                  {/* CUSTOM E-MAIL / PASSWORD FORM */}
                  <form onSubmit={handleCustomEmailPasswordLogin} className="flex flex-col gap-2.5">
                    {isSignUp && (
                      <div className="flex flex-col gap-1 text-left">
                        <input
                          id="auth-name-input"
                          type="text"
                          required
                          placeholder="Votre Nom Complet..."
                          value={loginName}
                          onChange={(e) => setLoginName(e.target.value)}
                          className="w-full bg-slate-950 text-slate-100 text-xs font-semibold p-3 rounded-xl border border-slate-850 focus:border-indigo-500/80 focus:outline-none placeholder-slate-500"
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-1 text-left">
                      <input
                        id="auth-email-input"
                        type="text"
                        required
                        placeholder="Nom d'utilisateur ou e-mail (@ilivik.com)..."
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="w-full bg-slate-950 text-slate-100 text-xs font-semibold p-3 rounded-xl border border-slate-850 focus:border-indigo-500/80 focus:outline-none placeholder-slate-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1 text-left">
                      <input
                        id="auth-password-input"
                        type="password"
                        required
                        placeholder="Mot de passe confidentiel..."
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full bg-slate-950 text-slate-100 text-xs font-semibold p-3 rounded-xl border border-slate-850 focus:border-indigo-500/80 focus:outline-none placeholder-slate-500"
                      />
                    </div>
                    <button
                      id="auth-password-submit"
                      type="submit"
                      className="w-full bg-indigo-600 hover:bg-indigo-550 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-md shadow-indigo-950/40"
                    >
                      {isSignUp ? "Créer un compte" : "Se connecter avec e-mail"}
                    </button>
                    {loginError && (
                      <p className="text-[10px] text-red-400 font-bold bg-red-950/30 border border-red-500/10 p-2.5 rounded-lg text-center leading-relaxed">
                        {loginError}
                      </p>
                    )}
                    <button type="button" onClick={() => { setIsSignUp(!isSignUp); setLoginError(""); }} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-2">
                       {isSignUp ? "Déjà un compte ? Se connecter" : "Pas de compte ? S'inscrire"}
                    </button>
                  </form>
                  
                  <div className="relative py-2.5 flex items-center justify-center">
                    <span className="absolute w-full border-t border-slate-800/80"></span>
                    <span className="relative bg-slate-900 text-[10px] text-slate-500 font-bold uppercase tracking-wider px-3.5">OU CONTINUER AVEC</span>
                  </div>
                  
                  <button
                    id="google-signin-btn-add-tab"
                    onClick={handleGoogleLogin}
                    className="w-full bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2.5 transition-all shadow-md cursor-pointer group"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.91h6.63c-.29 1.5-.1.15-1.15 2.6l3.07 2.38c1.8-1.66 2.84-4.11 2.84-6.82z" />
                      <path fill="#34A853" d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-3.07-2.38c-.9.6-2.03.95-3.33.95-2.53 0-4.67-1.71-5.43-4.01l-3.23 2.5C6.46 22.18 9.97 24 12 24z" />
                      <path fill="#FBBC05" d="M6.57 15.65c-.2-.6-.31-1.25-.31-1.9s.11-1.3.31-1.9l-3.23-2.5C2.53 10.45 2 11.95 2 13.5s.53 3.05 1.34 4.15l3.23-2.5z" />
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.96 1.19 15.24 0 12 0 9.97 0 6.46 1.82 4.1 4.85l3.23 2.5C8.09 6.46 10.23 4.75 12 4.75z" />
                    </svg>
                    <span>Continuer avec Google (Sécurisé)</span>
                  </button>
                </div>
              </div>
            ) : !getPermission("allowAddError") ? (
              <div className="flex flex-col items-center gap-5 py-8 text-center max-w-sm mx-auto">
                <div className="w-16 h-16 bg-red-950/80 border border-red-550/20 text-red-400 rounded-2xl flex items-center justify-center shadow-xl shadow-red-500/5 select-none">
                  <AlertCircle className="h-8 w-8 text-red-400 stroke-[1.5]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100 tracking-tight">Privilèges Insuffisants</h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Le Super-Administrateur a suspendu temporairement le droit d'ajouter ou archiver de nouvelles fiches de solutions de pannes pour votre profil d'utilisateur.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 pb-4 mb-5 border-b border-slate-800/80">
              <div className="p-2.5 bg-indigo-950 text-indigo-400 rounded-xl border border-indigo-500/20">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100">Documenter une Erreur & sa Solution</h3>
                <p className="text-xs text-slate-400">Éditez les étapes pas à pas pour enrichir la base de connaissances commune.</p>
              </div>
            </div>

            {/* Display message logs */}
            {submitStatus && (
              <div
                id="submit-status-banner"
                className={`p-3.5 mb-5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  submitStatus.success
                    ? "bg-emerald-950/40 text-emerald-300 border-l-4 border-emerald-500"
                    : "bg-red-950/40 text-red-300 border-l-4 border-red-500"
                }`}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{submitStatus.message}</span>
              </div>
            )}

            <form onSubmit={handleAddErrorSubmit} className="flex flex-col gap-4">
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Title input */}
                <div className="sm:col-span-3 flex flex-col gap-1.5">
                  <label htmlFor="err-title" className="text-xs font-semibold text-slate-300">
                    Titre Court & Explicite <span className="text-red-400 font-bold">*</span>
                  </label>
                  <input
                    id="err-title"
                    type="text"
                    required
                    placeholder="ex: Imprimante thermique non détectée lors du reçu"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="px-3.5 py-2.5 bg-slate-950 text-slate-100 text-xs font-semibold rounded-lg border border-slate-850 focus:border-indigo-500/80 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* Description Input */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="err-description" className="text-xs font-semibold text-slate-300">
                  Description de la Panne & Symptômes <span className="text-red-400 font-bold">*</span>
                </label>
                <textarea
                  id="err-description"
                  required
                  rows={3}
                  placeholder="Qu'est-ce qui s'affiche ? Quand cela arrive-t-il ?"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="px-3.5 py-2.5 bg-slate-950 text-slate-100 text-xs rounded-lg border border-slate-850 focus:border-indigo-500/80 focus:outline-none transition-all leading-relaxed"
                ></textarea>
              </div>

              {/* App, Type, Category, Priority, Private Client */}
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 p-4 bg-slate-950/40 rounded-2xl border border-slate-850/60">
                <div className="flex flex-col gap-1.55">
                  <label htmlFor="err-application" className="text-xs font-semibold text-slate-300">Application</label>
                  <select
                    id="err-application"
                    value={formApplication}
                    onChange={(e) => setFormApplication(e.target.value)}
                    className="px-3 py-2 bg-slate-950 text-slate-100 text-xs font-semibold rounded-lg border border-slate-850 focus:border-indigo-500/80 focus:outline-none cursor-pointer"
                  >
                    <option value="Salesbuzz">Salesbuzz</option>
                    <option value="Saleswave">Saleswave</option>
                    <option value="Routing">Routing</option>
                    <option value="Other">Other</option>
                  </select>
                  {formApplication === "Other" && (
                    <input
                      type="text"
                      required
                      placeholder="Nom de l'application"
                      value={formCustomApplication}
                      onChange={(e) => setFormCustomApplication(e.target.value)}
                      className="mt-1 px-3 py-2 bg-slate-950 text-slate-100 text-xs font-semibold rounded-lg border border-slate-850 focus:border-indigo-500/80 focus:outline-none transition-all w-full"
                    />
                  )}
                </div>

                <div className="flex flex-col gap-1.55">
                  <label htmlFor="err-type" className="text-xs font-semibold text-slate-300">Type d'erreur</label>
                  <select
                    id="err-type"
                    value={formErrorType}
                    onChange={(e) => setFormErrorType(e.target.value)}
                    className="px-3 py-2 bg-slate-950 text-slate-100 text-xs font-semibold rounded-lg border border-slate-850 focus:border-indigo-500/80 focus:outline-none cursor-pointer"
                  >
                    <option value="frontoffice">Front Office</option>
                    <option value="backoffice">Back Office</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.55">
                  <label htmlFor="err-category" className="text-xs font-semibold text-slate-300">Catégorie</label>
                  <select
                    id="err-category"
                    value={formErrorCategory}
                    onChange={(e) => setFormErrorCategory(e.target.value)}
                    className="px-3 py-2 bg-slate-950 text-slate-100 text-xs font-semibold rounded-lg border border-slate-850 focus:border-indigo-500/80 focus:outline-none cursor-pointer"
                  >
                    <option value="manipulation">Manipulation</option>
                    <option value="error">Error</option>
                    <option value="navigateur">Navigateur</option>
                    <option value="reports">Reports</option>
                    <option value="Synchronisation">Synchronisation</option>
                    <option value="impression">Impression</option>
                    <option value="importation template">Importation template</option>
                    <option value="importation journey plan">Importation journey plan</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.55">
                  <label htmlFor="err-priority" className="text-xs font-semibold text-slate-300">Priorité de l'erreur</label>
                  <select
                    id="err-priority"
                    value={formErrorPriority}
                    onChange={(e) => setFormErrorPriority(e.target.value)}
                    className="px-3 py-2 bg-slate-950 text-slate-100 text-xs font-semibold rounded-lg border border-slate-850 focus:border-indigo-500/80 focus:outline-none cursor-pointer"
                  >
                    <option value="level 03">level 03 (Non Bloquante 🟢)</option>
                    <option value="level 02">level 02 (Bloquante 🟡)</option>
                    <option value="level 01">level 01 (Must See ASAP 🔴)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.55">
                  <label htmlFor="err-client" className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                    Client <span className="text-red-400 font-bold">*</span> <span className="text-[9px] bg-indigo-950 text-indigo-400 font-extrabold px-1 rounded uppercase tracking-wider">🔒 Privé</span>
                  </label>
                  <input
                    id="err-client"
                    type="text"
                    required
                    placeholder="ex: SalesBuzz CL"
                    value={formClient}
                    onChange={(e) => setFormClient(e.target.value)}
                    className="px-3.5 py-2 bg-slate-950 text-slate-100 text-xs font-semibold rounded-lg border border-slate-850 focus:border-indigo-500/80 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* IMAGE SNAPSHOT INPUT AND PREVIEW */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-300">Capture d'écran de l'erreur</label>
                  <label className="bg-slate-950 hover:bg-slate-900 border border-slate-850 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all gap-1">
                    <Upload className="h-5 w-5 text-indigo-400" />
                    <span className="text-xs font-semibold text-slate-300">Glisser ou Choisir une Image</span>
                    <span className="text-[10px] text-slate-500">PNG / JPG supportés</span>
                    <input
                      id="form-screenshot-input"
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange(e, "form")}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Image Preview container */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-slate-500">Capture sélectionnée</span>
                  {formImage ? (
                    <div className="relative rounded-xl border border-slate-800 overflow-hidden bg-slate-950 h-[92px]">
                      <img src={formImage} className="w-full h-full object-contain" alt="Current visual draft" />
                      <button
                        id="clear-form-image"
                        type="button"
                        onClick={() => setFormImage("")}
                        className="absolute right-2 top-2 p-1.5 bg-slate-900/80 rounded-full text-slate-200 hover:text-red-400"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="border border-dashed border-slate-800 rounded-xl h-[92px] bg-slate-950/40 flex items-center justify-center text-slate-600 text-xs">
                      Aucune capture d'écran associée
                    </div>
                  )}
                </div>

              </div>

              {/* Tags & Submitting Author Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Author Display input */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="form-author" className="text-xs font-semibold text-slate-300">Auteur de la fiche</label>
                  <input
                    id="form-author"
                    type="text"
                    value={formAuthor}
                    onChange={(e) => setFormAuthor(e.target.value)}
                    placeholder="Hichem B."
                    className="px-3.5 py-2.5 bg-slate-950 text-slate-100 text-xs font-semibold rounded-lg border border-slate-850 focus:border-indigo-500/80 focus:outline-none transition-all"
                  />
                  <input
                    id="form-cretedby"
                    type="hidden"
                    name="cretedby"
                    value={firebaseUser?.email || ""}
                  />
                  <input
                    id="form-createdby"
                    type="hidden"
                    name="createdBy"
                    value={firebaseUser?.email || ""}
                  />
                </div>

                {/* Submitting Tags bar */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="form-tags-input" className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>Mots-clés / Tags</span>
                    <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider">Entrée pour ajouter</span>
                  </label>
                  <div className="flex flex-wrap items-center bg-slate-950 rounded-lg p-1.5 border border-slate-850 min-h-[42px] gap-1.5">
                    {formTags.map((tag, i) => (
                      <span key={i} className="px-2.5 py-0.5 bg-indigo-950 border border-indigo-500/20 text-indigo-300 font-bold text-[10px] rounded-full flex items-center gap-1 shadow-md">
                        {tag}
                        <button id={`remove-tag-form-${i}`} type="button" onClick={() => removeFormTag(i)} className="hover:text-red-400">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                    <input
                      id="form-tags-input"
                      type="text"
                      placeholder={formTags.length === 0 ? "ex: imprimante, sync" : "Suivant..."}
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={addFormTag}
                      className="bg-transparent border-0 ring-0 hover:bg-transparent focus:ring-0 focus:outline-none text-xs font-medium px-1 flex-1 py-0.5 min-w-[80px] text-slate-100"
                    />
                  </div>
                </div>

              </div>

              {/* Solution Input */}
              <div className="flex flex-col gap-1.5 mt-2 mb-2">
                <label htmlFor="err-solution" className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 stroke-[2.5]" />
                  Étapes de Résolution (Solution de l'astuce) <span className="text-indigo-400 text-[10px] bg-indigo-950 px-1.5 border border-indigo-500/20 rounded">Optionnel</span>
                </label>
                <textarea
                  id="err-solution"
                  rows={4}
                  placeholder="Écrivez les étapes concrètes si connues, ou laissez vide pour ajouter la solution plus tard."
                  value={formSolution}
                  onChange={(e) => setFormSolution(e.target.value)}
                  className="px-3.5 py-2.5 bg-slate-950 text-slate-100 text-xs font-semibold rounded-lg border border-slate-850 focus:border-indigo-500/80 focus:outline-none transition-all leading-relaxed"
                ></textarea>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2 p-3 bg-emerald-950/20 border border-emerald-900/30 rounded-xl">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-300">Capture d'écran de la solution</label>
                    <label className="bg-slate-950 hover:bg-slate-900 border border-slate-850 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all gap-1 h-[92px]">
                      <Upload className="h-4 w-4 text-emerald-400" />
                      <span className="text-xs font-semibold text-slate-300">Optionnel</span>
                      <input
                        id="form-solution-screenshot-input"
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileChange(e, "solution")}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-500">Capture (Solution)</span>
                    {formSolutionImage ? (
                      <div className="relative rounded-xl border border-slate-800 overflow-hidden bg-slate-950 h-[92px]">
                        <img src={formSolutionImage} className="w-full h-full object-contain" alt="Solution draft" />
                        <button
                          id="clear-form-solution-image"
                          type="button"
                          onClick={() => setFormSolutionImage("")}
                          className="absolute right-2 top-2 p-1.5 bg-slate-900/80 rounded-full text-slate-200 hover:text-red-400"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="border border-dashed border-slate-800 rounded-xl h-[92px] bg-slate-950/40 flex items-center justify-center text-slate-600 text-[10px] text-center px-2">
                        Aucune image ajoutée
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action controller footer in card */}
              <div className="pt-4 border-t border-slate-800/85 flex items-center justify-end gap-3">
                <button
                  id="form-cancel-btn"
                  type="button"
                  onClick={() => setActiveTab("catalog")}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-all"
                >
                  Annuler
                </button>
                <button
                  id="form-submit-btn"
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-all shadow-md flex items-center gap-1.5"
                >
                  {isSubmitting 
                    ? "Enregistrement..." 
                    : formSolution.trim() 
                      ? "Archiver la Solution" 
                      : "Enregistrer la Panne (sans solution)"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    )}

         {/* TAB 4: MOBILE WEBVIEW CONFIGURATION GUIDE & MODULAR ACCESS ROLES CONTROL CENTER */}
        {activeTab === "webview" && isSuperAdmin && (
          <div id="view-webview" className="max-w-6xl mx-auto w-full flex flex-col gap-6 animate-fade-in text-slate-100">
            
            {/* Admin Header */}
            <div className="bg-slate-900 border border-slate-850 rounded-3xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-500/10 text-amber-500 rounded-2xl border border-amber-500/20 shadow-inner">
                  <Smartphone className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                    Console SuperAdmin <span className="text-[10px] bg-amber-500/20 text-amber-400 font-extrabold px-2.5 py-0.5 rounded-full border border-amber-500/25 uppercase tracking-widest">Team Ilivik</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">Configurez l'interfaçage hybride mobile et modulez les droits d'accès de l'application sans coder.</p>
                </div>
              </div>
              <div className="text-xs text-slate-400 bg-slate-950 px-3.5 py-1.5 rounded-xl border border-slate-850 font-mono">
                Connecté : <span className="font-extrabold text-amber-400">{firebaseUser?.email}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Dynamic Permissions Customizer Card (No-Code Roles) */}
              <section className="lg:col-span-7 bg-slate-900 border border-slate-850 rounded-3xl p-6 shadow-xl flex flex-col gap-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
                      <Layers className="h-4 w-4 text-indigo-450" />
                    </div>
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-100">Gestionnaire de permissions modulaire</h3>
                      <p className="text-[10px] text-slate-400 flex items-center gap-1">Activez/désactivez des pages ou fonctions pour chaque rôle</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider">Live Sync</span>
                </div>

                {/* Sub-panels container for ilivikUsers and publicUser */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  
                  {/* ROLE A: TEAM ILIVIK MEMBERS */}
                  <div className="bg-slate-950/65 border border-slate-850/80 p-4.5 rounded-2xl flex flex-col gap-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-850">
                      <h4 className="text-xs font-black text-indigo-305 uppercase tracking-widest flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                        Membres Team Ilivik
                      </h4>
                      <span className="text-[9px] font-black bg-slate-900 text-slate-400 px-2 py-0.5 rounded border border-slate-800">ilivikUsers</span>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      {/* Tabs */}
                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Onglet Base Soluces</span>
                          <span className="text-[9px] text-slate-500">Autoriser l'affichage</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.ilivikUsers.allowCatalogTab}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            ilivikUsers: { ...permissionsConfig.ilivikUsers, allowCatalogTab: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Onglet Assistant IA</span>
                          <span className="text-[9px] text-slate-500">Autoriser l'affichage</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.ilivikUsers.allowChatTab}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            ilivikUsers: { ...permissionsConfig.ilivikUsers, allowChatTab: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Onglet Déclarer Fiche</span>
                          <span className="text-[9px] text-slate-500">Autoriser l'accès</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.ilivikUsers.allowAddTab}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            ilivikUsers: { ...permissionsConfig.ilivikUsers, allowAddTab: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>

                      {/* Capabilities */}
                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Enregistrer des pannes</span>
                          <span className="text-[9px] text-slate-500">Créer nouvelles fiches</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.ilivikUsers.allowAddError}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            ilivikUsers: { ...permissionsConfig.ilivikUsers, allowAddError: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Saisir/Éditer résolutions</span>
                          <span className="text-[9px] text-slate-500">Modifier solutions de pannes</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.ilivikUsers.allowEditSolution}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            ilivikUsers: { ...permissionsConfig.ilivikUsers, allowEditSolution: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Supprimer fiches</span>
                          <span className="text-[9px] text-slate-500">Bouton de suppression</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.ilivikUsers.allowDeleteError}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            ilivikUsers: { ...permissionsConfig.ilivikUsers, allowDeleteError: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Analyse IA Copilot</span>
                          <span className="text-[9px] text-slate-500">Reconnaissance de captures</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.ilivikUsers.allowUseAI}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            ilivikUsers: { ...permissionsConfig.ilivikUsers, allowUseAI: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Questions de clavardage</span>
                          <span className="text-[9px] text-slate-500">Saisie et envoi de questions</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.ilivikUsers.allowChatActions}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            ilivikUsers: { ...permissionsConfig.ilivikUsers, allowChatActions: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>
                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Afficher Erreurs Récentes</span>
                          <span className="text-[9px] text-slate-500">Autoriser l'affichage de la section</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.ilivikUsers.allowRecentErrors}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            ilivikUsers: { ...permissionsConfig.ilivikUsers, allowRecentErrors: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>
                      
                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Pièces jointes</span>
                          <span className="text-[9px] text-slate-500">Autoriser l'onglet Pièces jointes</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.ilivikUsers.allowAttachmentsSpace}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            ilivikUsers: { ...permissionsConfig.ilivikUsers, allowAttachmentsSpace: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Télécharger Fichiers</span>
                          <span className="text-[9px] text-slate-500">Autoriser le téléchargement direct</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.ilivikUsers.allowDownloadAttachments}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            ilivikUsers: { ...permissionsConfig.ilivikUsers, allowDownloadAttachments: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Tableau de données</span>
                          <span className="text-[9px] text-slate-500">Accès au tableau et recherche</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.ilivikUsers.allowDatatable}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            ilivikUsers: { ...permissionsConfig.ilivikUsers, allowDatatable: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>
                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer ml-4 border-l-2 border-indigo-500/20">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Actions sur le tableau</span>
                          <span className="text-[9px] text-slate-500">Autoriser les modifications (Auteur)</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.ilivikUsers.allowDatatableActions}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            ilivikUsers: { ...permissionsConfig.ilivikUsers, allowDatatableActions: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                          disabled={!permissionsConfig.ilivikUsers.allowDatatable}
                        />
                      </label>
                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer ml-4 border-l-2 border-indigo-500/20">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Export Excel</span>
                          <span className="text-[9px] text-slate-500">Autoriser l'exportation vers Excel</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.ilivikUsers.allowDatatableExportExcel}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            ilivikUsers: { ...permissionsConfig.ilivikUsers, allowDatatableExportExcel: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                          disabled={!permissionsConfig.ilivikUsers.allowDatatable}
                        />
                      </label>
                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer ml-4 border-l-2 border-indigo-500/20">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Export PDF</span>
                          <span className="text-[9px] text-slate-500">Autoriser l'exportation vers PDF</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.ilivikUsers.allowDatatableExportPdf}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            ilivikUsers: { ...permissionsConfig.ilivikUsers, allowDatatableExportPdf: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                          disabled={!permissionsConfig.ilivikUsers.allowDatatable}
                        />
                      </label>
                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer ml-4 border-l-2 border-indigo-500/20">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Import Bulk</span>
                          <span className="text-[9px] text-slate-500">Autoriser l'importation de masse (Excel)</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.ilivikUsers.allowDatatableImportBulk}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            ilivikUsers: { ...permissionsConfig.ilivikUsers, allowDatatableImportBulk: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                          disabled={!permissionsConfig.ilivikUsers.allowDatatable}
                        />
                      </label>
                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer ml-4 border-l-2 border-indigo-500/20">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Modèle d'importation</span>
                          <span className="text-[9px] text-slate-500">Télécharger le gabarit d'import</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.ilivikUsers.allowDatatableImportTemplate}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            ilivikUsers: { ...permissionsConfig.ilivikUsers, allowDatatableImportTemplate: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                          disabled={!permissionsConfig.ilivikUsers.allowDatatable}
                        />
                      </label>

                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Statistiques Récentes</span>
                          <span className="text-[9px] text-slate-500">Afficher les compteurs d'erreurs</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.ilivikUsers.allowStatsBlocks}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            ilivikUsers: { ...permissionsConfig.ilivikUsers, allowStatsBlocks: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>
                    </div>
                  </div>

                  {/* ROLE B: PUBLIC / VISITORS */}
                  <div className="bg-slate-950/65 border border-slate-850/80 p-4.5 rounded-2xl flex flex-col gap-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-850">
                      <h4 className="text-xs font-black text-amber-305 uppercase tracking-widest flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-450"></span>
                        Public / Visiteurs
                      </h4>
                      <span className="text-[9px] font-black bg-slate-900 text-slate-400 px-2 py-0.5 rounded border border-slate-800">publicUser</span>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      {/* Tabs */}
                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Onglet Base Soluces</span>
                          <span className="text-[9px] text-slate-500">Autoriser l'affichage</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.publicUser.allowCatalogTab}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            publicUser: { ...permissionsConfig.publicUser, allowCatalogTab: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Onglet Assistant IA</span>
                          <span className="text-[9px] text-slate-500">Autoriser l'affichage</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.publicUser.allowChatTab}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            publicUser: { ...permissionsConfig.publicUser, allowChatTab: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Onglet Déclarer Fiche</span>
                          <span className="text-[9px] text-slate-500">Autoriser l'accès</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.publicUser.allowAddTab}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            publicUser: { ...permissionsConfig.publicUser, allowAddTab: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>

                      {/* Capabilities */}
                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Enregistrer des pannes</span>
                          <span className="text-[9px] text-slate-500">Créer nouvelles fiches</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.publicUser.allowAddError}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            publicUser: { ...permissionsConfig.publicUser, allowAddError: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Saisir/Éditer résolutions</span>
                          <span className="text-[9px] text-slate-500">Modifier solutions de pannes</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.publicUser.allowEditSolution}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            publicUser: { ...permissionsConfig.publicUser, allowEditSolution: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Supprimer fiches</span>
                          <span className="text-[9px] text-slate-500">Bouton de suppression</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.publicUser.allowDeleteError}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            publicUser: { ...permissionsConfig.publicUser, allowDeleteError: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Analyse IA Copilot</span>
                          <span className="text-[9px] text-slate-500">Reconnaissance de captures</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.publicUser.allowUseAI}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            publicUser: { ...permissionsConfig.publicUser, allowUseAI: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Questions de clavardage</span>
                          <span className="text-[9px] text-slate-500">Saisie et envoi de questions</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.publicUser.allowChatActions}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            publicUser: { ...permissionsConfig.publicUser, allowChatActions: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>
                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Afficher Erreurs Récentes</span>
                          <span className="text-[9px] text-slate-500">Autoriser l'affichage de la section</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.publicUser.allowRecentErrors}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            publicUser: { ...permissionsConfig.publicUser, allowRecentErrors: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>
                      
                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Pièces jointes</span>
                          <span className="text-[9px] text-slate-500">Autoriser l'onglet Pièces jointes</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.publicUser.allowAttachmentsSpace}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            publicUser: { ...permissionsConfig.publicUser, allowAttachmentsSpace: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Télécharger Fichiers</span>
                          <span className="text-[9px] text-slate-500">Autoriser le téléchargement direct</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.publicUser.allowDownloadAttachments}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            publicUser: { ...permissionsConfig.publicUser, allowDownloadAttachments: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Tableau de données</span>
                          <span className="text-[9px] text-slate-500">Accès au tableau et recherche</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.publicUser.allowDatatable}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            publicUser: { ...permissionsConfig.publicUser, allowDatatable: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>
                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer ml-4 border-l-2 border-indigo-500/20">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Actions sur le tableau</span>
                          <span className="text-[9px] text-slate-500">Autoriser les modifications (Auteur)</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.publicUser.allowDatatableActions}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            publicUser: { ...permissionsConfig.publicUser, allowDatatableActions: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                          disabled={!permissionsConfig.publicUser.allowDatatable}
                        />
                      </label>
                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer ml-4 border-l-2 border-indigo-500/20">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Export Excel</span>
                          <span className="text-[9px] text-slate-500">Autoriser l'exportation vers Excel</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.publicUser.allowDatatableExportExcel}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            publicUser: { ...permissionsConfig.publicUser, allowDatatableExportExcel: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                          disabled={!permissionsConfig.publicUser.allowDatatable}
                        />
                      </label>
                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer ml-4 border-l-2 border-indigo-500/20">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Export PDF</span>
                          <span className="text-[9px] text-slate-500">Autoriser l'exportation vers PDF</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.publicUser.allowDatatableExportPdf}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            publicUser: { ...permissionsConfig.publicUser, allowDatatableExportPdf: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                          disabled={!permissionsConfig.publicUser.allowDatatable}
                        />
                      </label>
                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer ml-4 border-l-2 border-indigo-500/20">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Import Bulk</span>
                          <span className="text-[9px] text-slate-500">Autoriser l'importation de masse (Excel)</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.publicUser.allowDatatableImportBulk}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            publicUser: { ...permissionsConfig.publicUser, allowDatatableImportBulk: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                          disabled={!permissionsConfig.publicUser.allowDatatable}
                        />
                      </label>
                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer ml-4 border-l-2 border-indigo-500/20">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Modèle d'importation</span>
                          <span className="text-[9px] text-slate-500">Télécharger le gabarit d'import</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.publicUser.allowDatatableImportTemplate}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            publicUser: { ...permissionsConfig.publicUser, allowDatatableImportTemplate: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                          disabled={!permissionsConfig.publicUser.allowDatatable}
                        />
                      </label>

                      <label className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 hover:bg-slate-900 transition-all cursor-pointer">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Statistiques Récentes</span>
                          <span className="text-[9px] text-slate-500">Afficher les compteurs d'erreurs</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={permissionsConfig.publicUser.allowStatsBlocks}
                          onChange={(e) => setPermissionsConfig({
                            ...permissionsConfig,
                            publicUser: { ...permissionsConfig.publicUser, allowStatsBlocks: e.target.checked }
                          })}
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>
                    </div>
                  </div>

                </div>

                {/* Submit button for permissions */}
                <div className="pt-4 border-t border-slate-800/85 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-[10px] text-slate-400">
                    * Les modifications prennent effet instantanément pour les utilisateurs. Les permissions par défaut sont chargées en cas de défaillance.
                  </div>
                  <button
                    onClick={async () => {
                      setIsUpdatingPermissions(true);
                      setPermissionsStatus(null);
                      try {
                        const response = await fetch("/api/config/permissions", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            ilivikUsers: permissionsConfig.ilivikUsers,
                            publicUser: permissionsConfig.publicUser,
                            requesterEmail: firebaseUser?.email
                          })
                        });
                        if (response.ok) {
                          setPermissionsStatus("✓ Configuration enregistrée dans Cloud Firestore avec succès !");
                          setTimeout(() => setPermissionsStatus(null), 4000);
                        } else {
                          const errData = await response.json();
                          setPermissionsStatus("❌ Échec: " + (errData.error || "Une erreur est survenue."));
                        }
                      } catch (err: any) {
                        setPermissionsStatus("❌ Échec de connexion réseau: " + err.message);
                      } finally {
                        setIsUpdatingPermissions(false);
                      }
                    }}
                    disabled={isUpdatingPermissions}
                    className="w-full sm:w-auto px-6 py-2.5 font-extrabold text-xs text-slate-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-all shadow-md shadow-emerald-550/20 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isUpdatingPermissions ? "Sauvegarde..." : "Enregistrer les rôles & permissions 💾"}
                  </button>
                </div>

                {permissionsStatus && (
                  <div className={`text-xs font-semibold p-3.5 rounded-xl text-center border ${
                    permissionsStatus.includes("✓") 
                      ? "bg-emerald-950/40 border-emerald-500/15 text-emerald-300"
                      : "bg-red-950/40 border-red-500/15 text-red-300"
                  }`}>
                    {permissionsStatus}
                  </div>
                )}
              </section>

              {/* WebView mobile instructions (Keep existing ones perfectly) */}
              <section className="lg:col-span-5 bg-slate-900 border border-slate-850 rounded-3xl p-6 shadow-xl flex flex-col gap-4">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-805/80">
                  <Smartphone className="h-4 w-4 text-indigo-400" />
                  <span className="text-sm font-extrabold text-slate-100">Guide WebView Mobile</span>
                </div>
                
                <p className="text-xs text-slate-300 leading-normal">
                  Configurez un conteneur d'affichage (WebView/WKWebView) sur vos applications de flottes mobiles Android/iOS pour que l'équipe terrain accède directement au Hub.
                </p>

                <div className="flex flex-col gap-4 mt-2">
                  {/* Android Card block */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">Kotlin (Android) :</span>
                    <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 font-mono text-[9px] leading-relaxed overflow-x-auto text-emerald-450 h-[150px]">
                      <pre>{`// Configure WebView
val myWebView = WebView(this)
myWebView.settings.javaScriptEnabled = true
myWebView.settings.domStorageEnabled = true
myWebView.settings.allowFileAccess = true
myWebView.loadUrl("https://ais-pre-b7hbsymvjz46yaiaof42gv-893408826438.europe-west2.run.app")`}</pre>
                    </div>
                  </div>

                  {/* iOS Card block */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">Swift (iOS WKWebView) :</span>
                    <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 font-mono text-[9px] leading-relaxed overflow-x-auto text-indigo-350 h-[150px]">
                      <pre>{`// Configure WKWebView
let webConfiguration = WKWebViewConfiguration()
let webView = WKWebView(frame: .zero, configuration: webConfiguration)
let myURL = URL(string: "https://ais-pre-b7hbsymvjz46yaiaof42gv-893408826438.europe-west2.run.app")
let myRequest = URLRequest(url: myURL!)
webView.load(myRequest)`}</pre>
                    </div>
                  </div>
                </div>
              </section>

            </div>

            {/* USER ACCOUNTS CONFIGURATION CONTROL CENTRE */}
            <div className="bg-slate-900 border border-slate-850 rounded-3xl p-6 shadow-xl flex flex-col gap-5 mt-6 col-span-12">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/85 flex-wrap gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
                    <User className="h-4 w-4 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-100">Contrôle d'Accès Collaborateurs & Comptes</h3>
                    <p className="text-[10px] text-slate-400 font-semibold">Modifier les mots de passe, activer/désactiver des comptes, ou supprimer des accès</p>
                  </div>
                </div>
                <button
                  id="admin-new-user-btn"
                  onClick={() => {
                    setIsEditingUser(false);
                    setUserFormEmail("");
                    setUserFormName("");
                    setUserFormPassword("");
                    setUserFormStatus("active");
                    setUserFormRole("ilivikUsers");
                    setUserFormSuccess(null);
                  }}
                  className="px-3.5 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white transition-all shadow-md flex items-center gap-1.5 cursor-pointer ml-auto"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nouveau Compte
                </button>
              </div>

              {/* Grid: Form & Table */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* User Form inside panel */}
                <div className="lg:col-span-4 bg-slate-950/60 border border-slate-850 p-4.5 rounded-2xl flex flex-col gap-4">
                  <div className="pb-2 border-b border-slate-850">
                    <h4 className="text-xs font-black text-indigo-300 uppercase tracking-widest">
                      {isEditingUser ? "Modifier Utilisateur" : "Créer un Compte Collaborateur"}
                    </h4>
                  </div>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setUserFormSuccess(null);
                      if (!userFormEmail || !userFormName) {
                        setUserFormSuccess("❌ Veuillez renseigner le nom et l'e-mail.");
                        return;
                      }
                      if (!isEditingUser && !userFormPassword) {
                        setUserFormSuccess("❌ Un mot de passe est obligatoire pour un nouveau compte.");
                        return;
                      }

                      const headers = {
                        "Content-Type": "application/json",
                        "requester": firebaseUser?.email || "hichem.b@ilivik.com"
                      };
                      const body = JSON.stringify({
                        name: userFormName,
                        email: userFormEmail,
                        password: userFormPassword || undefined,
                        status: userFormStatus,
                        role: userFormRole
                      });

                      try {
                        const url = isEditingUser 
                          ? `/api/users/${encodeURIComponent(userFormEmail)}`
                          : `/api/users`;
                        const method = isEditingUser ? "PUT" : "POST";
                        
                        const res = await fetch(url, { method, headers, body });
                        if (res.ok) {
                          setUserFormSuccess(isEditingUser ? "✓ Compte collaborateur mis à jour !" : "✓ Nouveau compte collaborateur créé !");
                          setUserFormEmail("");
                          setUserFormName("");
                          setUserFormPassword("");
                          setUserFormStatus("active");
                          setUserFormRole("ilivikUsers");
                          setIsEditingUser(false);
                          fetchUserAccounts();
                          setTimeout(() => setUserFormSuccess(null), 3000);
                        } else {
                          const errData = await res.json();
                          setUserFormSuccess("❌ " + (errData.error || "Une erreur est survenue."));
                        }
                      } catch (err: any) {
                        setUserFormSuccess("❌ Erreur de réseau : " + err.message);
                      }
                    }}
                    className="flex flex-col gap-3"
                  >
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase text-slate-450 font-bold">Adresse E-mail (@ilivik.com)</label>
                      <input
                        type="email"
                        required
                        disabled={isEditingUser}
                        placeholder="ex: colab@ilivik.com"
                        value={userFormEmail}
                        onChange={(e) => setUserFormEmail(e.target.value)}
                        className="px-3.5 py-2 bg-slate-900 border border-slate-850 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500/80 disabled:opacity-50"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase text-slate-450 font-bold">Nom Complet</label>
                      <input
                        type="text"
                        required
                        placeholder="ex: Jean Dupont"
                        value={userFormName}
                        onChange={(e) => setUserFormName(e.target.value)}
                        className="px-3.5 py-2 bg-slate-900 border border-slate-850 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500/80"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase text-slate-450 font-bold">
                        {isEditingUser ? "Changer le mot de passe (Laisser vide pour ne pas changer)" : "Mot de passe"}
                      </label>
                      <input
                        type="text"
                        placeholder={isEditingUser ? "Nouveau mot de passe..." : "Mot de passe..."}
                        value={userFormPassword}
                        onChange={(e) => setUserFormPassword(e.target.value)}
                        className="px-3.5 py-2 bg-slate-900 border border-slate-850 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500/80"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3.5">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase text-slate-450 font-bold">Rôle d'Accès</label>
                        <select
                          value={userFormRole}
                          onChange={(e) => setUserFormRole(e.target.value)}
                          className="px-2.5 py-2 bg-slate-900 border border-slate-850 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500/80 cursor-pointer"
                        >
                          <option value="ilivikUsers">Membre Team</option>
                          <option value="publicUser">Visiteur Public</option>
                          <option value="inviteUser">Invité</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase text-slate-450 font-bold">Statut du Compte</label>
                        <select
                          value={userFormStatus}
                          onChange={(e) => setUserFormStatus(e.target.value as "active" | "disabled" | "pending")}
                          className="px-2.5 py-2 bg-slate-900 border border-slate-850 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500/80 cursor-pointer"
                        >
                          <option value="active">Actif (Autorisé)</option>
                          <option value="pending">En attente (Pending)</option>
                          <option value="disabled">Désactivé (Banni)</option>
                        </select>
                      </div>
                    </div>

                    <div className="pt-2 flex gap-2">
                      {isEditingUser && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingUser(false);
                            setUserFormEmail("");
                            setUserFormName("");
                            setUserFormPassword("");
                            setUserFormStatus("active");
                            setUserFormRole("ilivikUsers");
                          }}
                          className="flex-1 px-3 py-2 text-xs text-slate-400 bg-slate-905 hover:bg-slate-850 rounded-xl transition-all"
                        >
                          Annuler
                        </button>
                      )}
                      <button
                        type="submit"
                        className="flex-1 px-4 py-2 text-xs font-bold text-slate-950 bg-indigo-400 hover:bg-indigo-350 rounded-xl transition-all shadow-md"
                      >
                        {isEditingUser ? "Enregistrer" : "Créer le Compte"}
                      </button>
                    </div>

                    {userFormSuccess && (
                      <div className={`text-[10px] font-bold p-2.5 rounded-xl border mt-1 text-center ${
                        userFormSuccess.includes("✓")
                          ? "bg-emerald-950/40 border-emerald-500/15 text-emerald-300"
                          : "bg-red-950/40 border-red-500/15 text-red-300"
                      }`}>
                        {userFormSuccess}
                      </div>
                    )}
                  </form>
                </div>

                {/* Users List Table block */}
                <div className="lg:col-span-8 flex flex-col gap-3">
                  <div className="flex justify-between items-center bg-slate-950/30 p-2.5 rounded-xl border border-slate-850/80">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Comptes enregistrés ({userAccounts.length})</span>
                    <button
                      onClick={fetchUserAccounts}
                      className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 tracking-wider uppercase bg-transparent border-0 cursor-pointer"
                    >
                      Actualiser ⟳
                    </button>
                  </div>

                  {isLoadingUsers ? (
                    <div className="p-12 text-center text-xs text-slate-500">
                      Chargement des comptes depuis Cloud Firestore...
                    </div>
                  ) : userFetchError ? (
                    <div className="p-12 text-center text-xs text-red-400 bg-red-950/20 rounded-2xl border border-red-500/10">
                      {userFetchError}
                    </div>
                  ) : userAccounts.length === 0 ? (
                    <div className="p-12 text-center text-xs text-slate-500">
                      Aucun compte collaborateur personnalisé configuré pour le moment.
                    </div>
                  ) : (
                    <div className="bg-slate-950/30 border border-slate-850 rounded-2xl overflow-hidden overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-850/80 bg-slate-950/80 text-[10px] uppercase font-bold text-slate-500">
                            <th className="p-3">Nom</th>
                            <th className="p-3">E-mail</th>
                            <th className="p-3">Mot de passe</th>
                            <th className="p-3">Permissions Rôle</th>
                            <th className="p-3">Statut du compte</th>
                            <th className="p-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850/50 text-slate-300">
                          {userAccounts.map((user) => (
                            <tr key={user.email} className="hover:bg-slate-950/60 transition-all">
                              <td className="p-3 font-bold text-slate-200">{user.name}</td>
                              <td className="p-3 text-indigo-350">{user.email}</td>
                              <td className="p-3 font-mono text-slate-400 select-all">{user.password || "••••••••"}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
                                  user.role === "ilivikUsers" ? "bg-indigo-950 text-indigo-400 border-indigo-500/10" : 
                                  user.role === "inviteUser" ? "bg-purple-950 text-purple-400 border-purple-500/10" : 
                                  "bg-slate-800 text-slate-400 border-slate-700"
                                }`}>
                                  {user.role === "ilivikUsers" ? "Membre Team" : user.role === "inviteUser" ? "Invité" : "Visiteur Public"}
                                </span>
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                  user.status === "active"
                                    ? "bg-emerald-950 text-emerald-400 border border-emerald-500/10"
                                    : user.status === "pending"
                                      ? "bg-amber-950 text-amber-400 border border-amber-500/10"
                                      : "bg-red-950 text-red-400 border border-red-500/10"
                                }`}>
                                  {user.status === "active" ? "Actif (Autorisé)" : user.status === "pending" ? "En attente" : "Désactivé (Banni)"}
                                </span>
                              </td>
                              <td className="p-3 text-right flex justify-end gap-1.5 items-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsEditingUser(true);
                                    setUserFormEmail(user.email);
                                    setUserFormName(user.name);
                                    setUserFormPassword(user.password || "");
                                    setUserFormStatus(user.status);
                                    setUserFormRole(user.role);
                                    setUserFormSuccess(null);
                                  }}
                                  className="p-1 bg-slate-900 border border-slate-800 hover:border-indigo-500 rounded-lg text-slate-450 hover:text-indigo-400 transition-all cursor-pointer"
                                  title="Modifier les options du compte"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (confirm(`Êtes-vous sûr de vouloir supprimer définitivement le compte de ${user.name} ?`)) {
                                      try {
                                        const res = await fetch(`/api/users/${encodeURIComponent(user.email)}`, {
                                          method: "DELETE",
                                          headers: {
                                            "requester": firebaseUser?.email || "hichem.b@ilivik.com"
                                          }
                                        });
                                        if (res.ok) {
                                          fetchUserAccounts();
                                        } else {
                                          alert("Échec de la suppression.");
                                        }
                                      } catch (err: any) {
                                        alert("Erreur de connexion.");
                                      }
                                    }
                                  }}
                                  className="p-1 bg-slate-900 border border-slate-800 hover:border-red-500 rounded-lg text-slate-450 hover:text-red-400 transition-all cursor-pointer"
                                  title="Supprimer ce collaborateur"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>
            </div>

          </div>
        )}

        {/* TAB 4: ATTACHMENTS SPACE */}
        {activeTab === "attachments" && getPermission("allowAttachmentsSpace") && (
          <AttachmentsSpace isSuperAdmin={isSuperAdmin} userEmail={firebaseUser?.email || ""} allowDownloadAttachments={getPermission("allowDownloadAttachments")} />
        )}

        {/* TAB 5: DATATABLE SPACE */}
        {activeTab === "datatable" && getPermission("allowDatatable") && (
          <DatatableSpace
            errors={errors}
            isSuperAdmin={isSuperAdmin}
            onEdit={(err) => handleSelectError(err)}
            allowImportBulk={getPermission("allowDatatableImportBulk")}
            allowExportPdf={getPermission("allowDatatableExportPdf")}
            allowExportExcel={getPermission("allowDatatableExportExcel")}
            allowImportTemplate={getPermission("allowDatatableImportTemplate")}
            allowActions={getPermission("allowDatatableActions")}
          />
        )}

      </main>

      {/* Dynamic Detail Viewer Floating Modal */}
      <AnimatePresence>
        {viewingErrorDetail && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full shadow-2xl relative overflow-hidden text-slate-100 max-h-[90vh] overflow-y-auto no-scrollbar"
            >
              <button
                id="close-sidebar-btn"
                onClick={() => handleSelectError(null)}
                className="absolute right-4 top-4 text-slate-400 hover:text-slate-200 bg-slate-950 hover:bg-slate-800 p-2 rounded-full"
              >
                <X className="h-5 w-5" />
              </button>

              {isLoggedIn && (
                <>
                  {/* Solution status toggle button strictly on top of the modal */}
                  <div className="flex justify-between items-center mb-4 pb-2.5 border-b border-slate-850">
                    <button
                      id={`toggle-resolve-status-${viewingErrorDetail.id}`}
                      onClick={async () => {
                        const toggledStatus = !viewingErrorDetail.isResolved;
                        const toggledResolvedAt = toggledStatus ? new Date().toISOString() : null;

                        // Update error item on the server
                        try {
                          const res = await fetch(`/api/errors/${viewingErrorDetail.id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              ...viewingErrorDetail,
                              isResolved: toggledStatus,
                              resolvedAt: toggledResolvedAt
                            })
                          });
                          if (res.ok) {
                            const updatedRecord = await res.json();
                            setViewingErrorDetail(updatedRecord);
                            setErrors(errors.map((e) => e.id === viewingErrorDetail.id ? updatedRecord : e));
                          } else {
                            alert("Impossible de modifier le statut. Connectez-vous d'abord.");
                          }
                        } catch (err) {
                          console.error("Error setting resolution status:", err);
                        }
                      }}
                      className={`px-3 py-1.5 text-xs font-black rounded-xl border transition-all flex items-center gap-1.5 shadow cursor-pointer ${
                        viewingErrorDetail.isResolved 
                          ? "bg-emerald-950/80 hover:bg-emerald-900 border-emerald-500/30 text-emerald-300"
                          : "bg-red-950/80 hover:bg-red-900 border-red-500/30 text-red-300"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${viewingErrorDetail.isResolved ? "bg-emerald-400" : "bg-red-450 animate-pulse"}`}></span>
                      <span>{viewingErrorDetail.isResolved ? "Résolu ✓" : "Non Résolu ❌"}</span>
                    </button>
                    
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                      {viewingErrorDetail.errorCategory ? `#${viewingErrorDetail.errorCategory}` : "Fiche Info"}
                    </span>
                  </div>

                  <h3 className="text-xl font-extrabold text-slate-100 leading-tight mb-4">
                    {viewingErrorDetail.title}
                  </h3>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-slate-950/50 p-4 rounded-2xl border border-slate-850/60 text-xs text-slate-400 mb-5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase text-slate-500 font-bold">Type d'erreur</span>
                      <span className="font-extrabold text-slate-200 capitalize">
                        {viewingErrorDetail.errorType === "frontoffice" ? "Front Office" : viewingErrorDetail.errorType || "Front Office"}
                      </span>
                    </div>
                    
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase text-slate-500 font-bold">Catégorie</span>
                      <span className="font-extrabold text-indigo-300 capitalize">{viewingErrorDetail.errorCategory || "manipulation"}</span>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase text-slate-500 font-bold">Priorité</span>
                      <span className={`font-extrabold flex items-center gap-1 ${
                        viewingErrorDetail.errorPriority === "level 01" || viewingErrorDetail.errorPriority?.includes("01") 
                          ? "text-red-400 font-black" 
                          : viewingErrorDetail.errorPriority === "level 02" || viewingErrorDetail.errorPriority?.includes("02")
                          ? "text-amber-400"
                          : "text-emerald-400"
                      }`}>
                        {viewingErrorDetail.errorPriority === "level 01" ? "Level 01 (Must See 🚨)" :
                         viewingErrorDetail.errorPriority === "level 02" ? "Level 02 (Bloquante ⚠️)" :
                         "Level 03 (Non Bloquante 🟢)"}
                      </span>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase text-slate-500 font-bold">Création</span>
                      <span className="font-semibold text-slate-300">
                        {new Date(viewingErrorDetail.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    {viewingErrorDetail.isResolved && viewingErrorDetail.resolvedAt && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase text-slate-500 font-bold">Résolution</span>
                        <span className="font-semibold text-emerald-400">
                          {new Date(viewingErrorDetail.resolvedAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}

                    {/* Private Section (Client & Creator) */}
                    <div className="flex flex-col gap-0.5 col-span-2 md:col-span-3 border-t border-slate-850/60 pt-2.5 mt-1">
                      <span className="text-[9px] uppercase text-indigo-400 font-extrabold flex items-center gap-1">
                        <Lock className="w-3 h-3 text-indigo-400" />
                        Propriétés de Service (Équipe Ilivik - Privé)
                      </span>
                      <div className="grid grid-cols-2 gap-3 mt-1.5 text-[11px]">
                        <div className="flex justify-between items-center py-1 border-b border-white/5">
                          <span className="text-slate-500 font-medium">Client :</span>
                          <span className="font-bold text-slate-200">
                            {isLoggedIn ? (viewingErrorDetail.client || "Client Standard") : "🔒 Privé"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b border-white/5">
                          <span className="text-slate-500 font-medium">Auteur déclaré :</span>
                          <span className="font-bold text-slate-200">
                            {isLoggedIn ? (viewingErrorDetail.author || "Team Ilivik") : "🔒 Privé"}
                          </span>
                        </div>
                        {isLoggedIn && (viewingErrorDetail.cretedby || viewingErrorDetail.createdBy) && (
                          <div className="flex justify-between items-center py-1 border-b border-white/5 col-span-2">
                            <span className="text-indigo-400 font-medium">Tracé créateur (Email permanent) :</span>
                            <span className="font-semibold text-indigo-300">
                              {viewingErrorDetail.cretedby || viewingErrorDetail.createdBy}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Symptômes de la panne</h4>
                  <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-4 text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                    {viewingErrorDetail.description}
                  </div>
                </div>

                <div>
                  {isEditingSolution ? (
                    <div className="bg-slate-950/80 border border-slate-850 rounded-2xl p-4 flex flex-col gap-3">
                      <label htmlFor="modal-solution-input" className="text-xs font-bold text-indigo-300">
                        Rédiger la solution étape par étape
                      </label>
                      <textarea
                        id="modal-solution-input"
                        rows={5}
                        className="w-full bg-slate-900 border border-slate-800 text-slate-100 font-semibold p-3.5 rounded-xl text-xs focus:outline-none focus:border-indigo-500/80 leading-relaxed"
                        placeholder="Comment résoudre cette panne ? Écrivez de manière claire et structurée..."
                        value={solutionInput}
                        onChange={(e) => setSolutionInput(e.target.value)}
                      ></textarea>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900/50 p-2 rounded-xl">
                        <div className="flex items-center gap-2">
                           <label className="bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-[10px] text-slate-300 cursor-pointer flex items-center gap-1 border border-slate-700">
                             <Upload className="h-3.5 w-3.5" />
                             {solutionImageInput ? "Changer" : "Ajouter une image"}
                             <input type="file" accept="image/*" onChange={handleInlineSolutionFile} className="hidden" />
                           </label>
                           {solutionImageInput && (
                              <button onClick={() => setSolutionImageInput("")} className="text-red-400 hover:text-red-300 text-[10px] flex items-center">
                                <X className="h-3 w-3" />
                              </button>
                           )}
                        </div>
                        <div className="flex justify-end gap-2 text-xs w-full sm:w-auto">
                          <button
                            onClick={() => setIsEditingSolution(false)}
                            className="px-3 py-2 text-slate-400 hover:bg-slate-900 rounded-lg"
                          >
                            Annuler
                          </button>
                          <button
                            onClick={handleSaveSolution}
                            disabled={isSubmitting}
                            className="px-4 py-2 font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex items-center gap-1"
                          >
                            {isSubmitting ? "Sauvegarde..." : "Enregistrer la Solution"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : viewingErrorDetail.solution && viewingErrorDetail.solution.trim() !== "" ? (
                    <div>
                      <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4 stroke-[2.5]" />
                          Solution de Dépannage
                        </span>
                      {getPermission("allowEditSolution") && (
                        <button
                          id="edit-solution-inline-btn"
                          onClick={() => {
                            if (!isLoggedIn) {
                              setAuthPurpose("edit");
                              setShowAuthModal(true);
                            } else {
                              setSolutionInput(viewingErrorDetail.solution);
                              setIsEditingSolution(true);
                            }
                          }}
                          className="text-slate-400 hover:text-indigo-400 text-[10px] font-semibold flex items-center gap-1 py-0.5 px-2.5 bg-slate-950 border border-slate-850 hover:border-indigo-500/20 rounded-lg transition-all"
                        >
                          {isLoggedIn ? "Modifier" : "Saisir/Modifier 🔒"}
                        </button>
                      )}
                      </h4>
                      <div className="bg-emerald-500/5 border border-emerald-500/10 text-emerald-300 rounded-xl p-4 text-xs sm:text-sm leading-relaxed font-semibold whitespace-pre-line mb-3">
                        {viewingErrorDetail.solution}
                      </div>
                      {viewingErrorDetail.solutionImageUrl && (
                        <div>
                          <h4 className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-1.5 opacity-80">Image de la Solution</h4>
                         <div className="relative group max-h-[200px] rounded-xl overflow-hidden border border-emerald-900/30">
                            <img src={viewingErrorDetail.solutionImageUrl} className="w-full object-contain max-h-[200px] bg-slate-950/50" alt="Solution Capture" />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-amber-500/5 border border-amber-500/10 text-amber-300 rounded-2xl p-5 text-center flex flex-col items-center gap-2.5 shadow-inner">
                      <AlertCircle className="h-7 w-7 text-amber-400 animate-pulse" />
                      <div>
                        <p className="text-xs sm:text-sm font-bold text-slate-100">Aucune solution enregistrée</p>
                        <p className="text-[11px] text-slate-400 max-w-md mt-0.5 leading-relaxed">
                          Cette panne est répertoriée comme <strong>en attente de résolution</strong>. Les commerciaux ayant ce problème ne disposent pas encore d'astuce d'aide.
                        </p>
                      </div>
                      {getPermission("allowEditSolution") && (
                        <button
                          id="modal-add-sol-incentive-btn"
                          onClick={() => {
                            if (!isLoggedIn) {
                              setAuthPurpose("edit");
                              setShowAuthModal(true);
                            } else {
                              setSolutionInput("");
                              setIsEditingSolution(true);
                            }
                          }}
                          className="mt-1 px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white rounded-xl transition-all shadow-md flex items-center gap-1"
                        >
                          <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                          {isLoggedIn ? "Saisir la Solution" : "Saisir la Solution 🔒"}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {viewingErrorDetail.imageUrl && (
                  <div>
                    <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5">Capture d'écran</h4>
                    <div className="relative group max-h-[220px] rounded-xl overflow-hidden border border-slate-800">
                      <img src={viewingErrorDetail.imageUrl} className="w-full object-contain max-h-[220px] bg-slate-950" alt="Detail Capture" />
                      <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                        <button
                          id={`search-ai-from-image-${viewingErrorDetail.id}`}
                          onClick={() => {
                            triggerImageSearchWithAI(viewingErrorDetail.imageUrl!);
                            handleSelectError(null);
                          }}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-md"
                        >
                          <Zap className="h-3.5 w-3.5 fill-current animate-pulse" />
                          Analyser cette capture avec l'IA →
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-6 pt-4 border-t border-slate-850">
                {viewingErrorDetail.solution && viewingErrorDetail.solution.trim() !== "" && (
                  <button
                    id={`copy-soluce-${viewingErrorDetail.id}`}
                    onClick={() => copyToClipboard(viewingErrorDetail.solution, viewingErrorDetail.id)}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 text-xs font-bold rounded-xl transition-all shadow-md text-center"
                  >
                    {copiedId === viewingErrorDetail.id ? "✓ Copiée !" : "Copier la résolution"}
                  </button>
                )}
                <button
                  onClick={() => handleSelectError(null)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 text-xs font-bold rounded-xl transition-all grow text-center"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer id="footer" className="bg-slate-900/40 border-t border-slate-850 p-4 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <span>SalesBuzz Support Base (Team Ilivik) — © 2026</span>
          <span className="flex items-center gap-1.5">
            Conçu de manière moderne et fluide • Propulsé par Gemini AI
          </span>
        </div>
      </footer>

      {/* Global Authentication Modal for Collaborators */}
      <AnimatePresence>
        {showAuthModal && (
          <div id="auth-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl relative"
            >
              {/* Close Button */}
              <button
                onClick={() => setShowAuthModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 p-1 bg-slate-950 rounded-lg border border-slate-850"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex flex-col items-center gap-4 text-center">
                <div className="w-12 h-12 bg-indigo-950/80 border border-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center shadow-md">
                  <User className="h-6 w-6 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-100">Connexion Collaborateur</h3>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    {authPurpose === "edit"
                      ? "La rédaction, modification de solutions ou l'enregistrement de fiches pannes est réservé aux techniciens et contributeurs de la Team Ilivik."
                      : "Identifiez-vous pour déverrouiller l'accès de modification d'erreur et ajout du contenu technique."}
                  </p>
                </div>

                <div className="w-full flex flex-col gap-3.5 mt-2">
                  {/* CUSTOM E-MAIL / PASSWORD FORM */}
                  <form onSubmit={handleCustomEmailPasswordLogin} className="flex flex-col gap-2.5">
                    {isSignUp && (
                      <div className="flex flex-col gap-1 text-left">
                        <input
                          id="auth-name-input-modal"
                          type="text"
                          required
                          placeholder="Votre Nom Complet..."
                          value={loginName}
                          onChange={(e) => setLoginName(e.target.value)}
                          className="w-full bg-slate-950 text-slate-100 text-xs font-semibold p-2.5 rounded-xl border border-slate-850 focus:border-indigo-500/80 focus:outline-none placeholder-slate-500"
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-1 text-left">
                      <input
                        id="auth-email-input"
                        type="text"
                        required
                        placeholder="Nom d'utilisateur ou e-mail (@ilivik.com)..."
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="w-full bg-slate-950 text-slate-100 text-xs font-semibold p-2.5 rounded-xl border border-slate-850 focus:border-indigo-500/80 focus:outline-none placeholder-slate-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1 text-left">
                      <input
                        id="auth-password-input"
                        type="password"
                        required
                        placeholder="Mot de passe confidentiel..."
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full bg-slate-950 text-slate-100 text-xs font-semibold p-2.5 rounded-xl border border-slate-850 focus:border-indigo-500/80 focus:outline-none placeholder-slate-500"
                      />
                    </div>
                    <button
                      id="auth-password-submit"
                      type="submit"
                      className="w-full bg-indigo-600 hover:bg-indigo-550 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-md shadow-indigo-950/40"
                    >
                      {isSignUp ? "Créer un compte" : "Se connecter avec e-mail"}
                    </button>
                    {loginError && (
                      <p className="text-[10px] text-red-400 font-bold bg-red-950/30 border border-red-500/10 p-2 rounded text-center leading-relaxed">
                        {loginError}
                      </p>
                    )}
                    <button type="button" onClick={() => { setIsSignUp(!isSignUp); setLoginError(""); }} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-1">
                       {isSignUp ? "Déjà un compte ? Se connecter" : "Pas de compte ? S'inscrire"}
                    </button>
                  </form>

                  <div className="relative py-1 flex items-center justify-center">
                    <span className="absolute w-full border-t border-slate-850"></span>
                    <span className="relative bg-slate-900 text-[9px] text-slate-500 font-bold uppercase tracking-wider px-2 rounded">OU CONTINUER AVEC</span>
                  </div>
                  
                  <button
                    id="google-signin-btn-modal"
                    onClick={handleGoogleLogin}
                    className="w-full bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 hover:text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer group"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.91h6.63c-.29 1.5-.1.15-1.15 2.6l3.07 2.38c1.8-1.66 2.84-4.11 2.84-6.82z" />
                      <path fill="#34A853" d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-3.07-2.38c-.9.6-2.03.95-3.33.95-2.53 0-4.67-1.71-5.43-4.01l-3.23 2.5C6.46 22.18 9.97 24 12 24z" />
                      <path fill="#FBBC05" d="M6.57 15.65c-.2-.6-.31-1.25-.31-1.9s.11-1.3.31-1.9l-3.23-2.5C2.53 10.45 2 11.95 2 13.5s.53 3.05 1.34 4.15l3.23-2.5z" />
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.96 1.19 15.24 0 12 0 9.97 0 6.46 1.82 4.1 4.85l3.23 2.5C8.09 6.46 10.23 4.75 12 4.75z" />
                    </svg>
                    <span>Continuer avec Google</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
