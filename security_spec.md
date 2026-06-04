# Spécifications de Sécurité Firestore - SalesBuzz Knowledge Base

## 1. Invariants de Données
- Tout document `errors` doit posséder les champs obligatoires: `title`, `description`, `solution`, `createdAt`, `author`.
- Le champ `title` doit être une chaîne non vide inférieure à 500 caractères.
- Le champ `solution` doit être une chaîne non vide inférieure à 5000 caractères.
- Le champ `errorCode` doit être une chaîne de caractères courte (max 30 caractères) pour identification rapide.
- Le champ `tags` doit être une liste de chaînes de caractères (max 12 tags par erreur).
- Pas de modification arbitraire des champs système par des utilisateurs non autorisés.

## 2. Les Payloads "Dirty Dozen" (Tentatives de violations rejetées)
Voici les douze scénarios d'attaques ou de corruptions de données qui doivent être mathématiquement rejetés par notre pare-feu de règles de sécurité :

1. **Création anonyme ou non authentifiée** : Tenter d'injecter une nouvelle fiche d'erreur sans en-tête d'authentification valide.
2. **Usurpation d'identité de l'auteur** : Envoyer un document de création où le champ `author` ou un UID d'identifiant ne correspond pas à l'utilisateur connecté.
3. **Contournement de schéma** : Créer un document d'erreur dans la collection `errors` sans le champ requis `title` ou `solution`.
4. **Injection de type (Value Poisoning)** : Essayer de mettre à jour le champ `title` ou `solution` avec un type non-string (ex: un booléen `true` ou un objet complexe).
5. **Dépassement de limite de taille (Denial of Wallet)** : Tenter d'envoyer un code d'erreur de 10 Ko ou un titre de 1 Mo pour saturer l'espace disque Firestore.
6. **Suppression non autorisée d'une fiche d'autrui** : Demander la suppression totale d'une fiche d'erreur d'un collaborateur sans être l'administrateur ou l'auteur de la fiche.
7. **Modification rétroactive du champ d'horodatage (`createdAt`)** : Émettre une mise à jour qui modifie la date d'ajout originale par une fausse date passée.
8. **Altération de la liste des Tags** : Soumettre une liste de tags contenant autre chose que des chaînes de caractères ou dépassant la barrière stricte de taille.
9. **Injection de caractères invalides dans les ID de document** : Essayer d'utiliser un identifiant de document contenant des caractères spéciaux ou de taille gigantesque (ID Poisoning).
10. **Lectures massives non restreintes (PII Scraping)** : Tenter de requêter et scanner d'autres collections de données sensibles sans authentification.
11. **Modification du statut en dehors d'une action approuvée** : Modifier des valeurs d'administration sans permission.
12. **Mise à jour orpheline ou transaction tronquée** : Essayer d'insérer des fiches erronées ou partielles contournant les règles d'intégrité de l'application.

## 3. Test Runner Conceptuel pour l'Audit Red-Team
Toutes les requêtes d'écriture contenant ces payloads "Dirty Dozen" doivent s'achever systématiquement par un rejet strict de type `PERMISSION_DENIED` au niveau du moteur de règles Firestore.
