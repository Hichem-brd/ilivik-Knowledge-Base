export interface ErrorRecord {
  id: string;
  title: string;
  errorCode: string;
  description: string;
  solution: string;
  imageUrl?: string;
  tags: string[];
  createdAt: string;
  author: string;
  errorType?: string; // backoffice, front office
  errorCategory?: string; // manipulation, error, navigateur, reports, Synchronisation, impression
  errorPriority?: string; // level 01, level 02, level 03
  client?: string;
  isResolved?: boolean;
  resolvedAt?: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "model" | "assistant";
  content: string;
  image?: string; // base64 representation if sent or received
  timestamp: string;
  sourceErrorMatch?: ErrorRecord; // linked item if one is found
}

export interface RolePermissions {
  allowCatalogTab: boolean;
  allowChatTab: boolean;
  allowAddTab: boolean;
  allowAddError: boolean;
  allowEditSolution: boolean;
  allowDeleteError: boolean;
  allowUseAI: boolean;
  allowChatActions: boolean;
}

export interface AppPermissionsConfig {
  ilivikUsers: RolePermissions;
  publicUser: RolePermissions;
}

export interface UserAccount {
  name: string;
  email: string;
  password?: string;
  status: "active" | "disabled";
  role: string;
  createdAt?: string;
}

