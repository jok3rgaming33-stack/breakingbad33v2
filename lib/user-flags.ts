// Étiquettes possibles posées par l'admin sur un compte client.
export const USER_FLAGS = ["absent", "suspect", "fidele", "banni"] as const
export type UserFlag = (typeof USER_FLAGS)[number]
