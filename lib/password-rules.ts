// Règles de complexité du mot de passe — utilisé côté client ET côté serveur.
// Ce fichier est volontairement SANS "use server" pour pouvoir être importé partout.

export const PASSWORD_RULES = {
  minLength: 8,
  // Au moins une majuscule, un chiffre, un symbole parmi : - _ / * ù
  pattern: /^(?=.*[A-Z])(?=.*[0-9])(?=.*[-_/*ù]).{8,}$/,
  hint: "8 caractères min. dont une majuscule, un chiffre et un symbole parmi : - _ / * ù",
}

export function validatePassword(password: string): { ok: true } | { ok: false; error: string } {
  if (!password || password.length < PASSWORD_RULES.minLength) {
    return { ok: false, error: `Minimum ${PASSWORD_RULES.minLength} caractères.` }
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, error: "Au moins une lettre majuscule requise." }
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, error: "Au moins un chiffre requis." }
  }
  if (!/[-_/*ù]/.test(password)) {
    return { ok: false, error: "Au moins un symbole parmi : - _ / * ù" }
  }
  return { ok: true }
}
