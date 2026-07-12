// Script de simulation d'une transaction Locker complète
// Usage : node --env-file-if-exists=/vercel/share/.env.project scripts/simulate-locker.js

const { Pool } = require("pg")
const { randomUUID } = require("crypto")

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function simulate() {
  const client = await pool.connect()
  try {
    const pseudo = "TestLocker"
    const customerToken = "SIM_" + randomUUID().replace(/-/g, "").slice(0, 28)
    const products = "1x Coke ×3"
    const total = 90
    const wallet = "888tNkZrPN6JsEgekjMnABU4TBzc2Dt29EPAvkRxbANsAnjyPbb3iQ1K8byS9VMo4F5j9TqeZGGW3Gi3e"
    const trackingToken = "TRK_" + randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()

    console.log("\n=== SIMULATION TRANSACTION LOCKER ===\n")
    console.log("Token client  :", customerToken)
    console.log("Token TRK     :", trackingToken)
    console.log("Produits      :", products)
    console.log("Total         :", total + "EUR")

    // ─── ÉTAPE 1 : Création de la commande (status: en_attente) ───────────────
    const threadRes = await client.query(
      `INSERT INTO order_threads
         (customer_name, customer_token, tracking_token, summary, products, total, fulfillment, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'locker','en_attente',NOW(),NOW())
       RETURNING *`,
      [pseudo, customerToken, trackingToken, "1x Coke ×3 — Locker Mondial Relay", products, total]
    )
    const thread = threadRes.rows[0]
    console.log("\n[1] Commande créée — ID:", thread.id, "| Status: en_attente")

    // Message initial du client
    await client.query(
      `INSERT INTO thread_messages (thread_id, sender, body, created_at)
       VALUES ($1,'client',$2,NOW())`,
      [thread.id, `Bonjour, je commande : ${products} en Locker Mondial Relay. Total : ${total}EUR.`]
    )

    // Message de confirmation automatique vendeur
    await client.query(
      `INSERT INTO thread_messages (thread_id, sender, body, created_at)
       VALUES ($1,'vendeur',$2,NOW() + interval '1 second')`,
      [thread.id, "Ta commande Locker a bien été reçue. Nous allons la valider rapidement — un token de suivi t'a été envoyé dans la messagerie."]
    )

    // ─── ÉTAPE 2 : Fil TRK_MSG (message auto-supprimé après lecture) ──────────
    const trkMsgToken = "TRK_MSG_" + randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()
    const trkRes = await client.query(
      `INSERT INTO order_threads
         (customer_name, customer_token, tracking_token, summary, total, fulfillment, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,0,'locker','trk_token',NOW(),NOW())
       RETURNING *`,
      [pseudo, customerToken, trkMsgToken, `Token de suivi — Commande #${thread.id}`]
    )
    const trkThread = trkRes.rows[0]

    const trkBody = [
      "⚠️ ATTENTION — LIS CE MESSAGE ATTENTIVEMENT ⚠️",
      "",
      "Ton token de suivi Locker est :",
      "",
      trackingToken,
      "",
      "SAUVEGARDE CE TOKEN MAINTENANT.",
      "Ce message sera automatiquement supprimé une fois que tu l'auras ouvert, pour des raisons de sécurité.",
      "Sans ce token tu ne pourras plus accéder au suivi de ta commande.",
    ].join("\n")

    await client.query(
      `INSERT INTO thread_messages (thread_id, sender, body, created_at)
       VALUES ($1,'vendeur',$2,NOW())`,
      [trkThread.id, trkBody]
    )
    console.log("[2] Fil TRK_MSG créé — ID:", trkThread.id, "| Token TRK livré au client")

    // ─── ÉTAPE 3 : Validation + envoi wallet XMR avec montant ─────────────────
    // Taux XMR simulé (~220 EUR/XMR)
    const xmrRate = 220
    const xmrAmount = (total / xmrRate).toFixed(6)

    const walletLines = [
      "Commande validee ! Voici l'adresse du wallet Monero (XMR) ou effectuer ton depot :",
      "",
      "[ " + wallet + " ]",
      "",
      "Montant a envoyer : " + xmrAmount + " XMR (= " + total + "EUR au taux actuel)",
      "",
      "IMPORTANT : recopie cette adresse avec la plus grande attention, caractere par caractere.",
      "Une seule erreur de saisie et le depot sera perdu definitivement — Monero est une crypto intraçable.",
      "",
      "Une fois le depot effectue, clique sur le bouton \"J'ai effectue mon depot\" dans ton suivi locker.",
      "La preparation de ta commande demarrera a reception de la confirmation.",
    ]
    const walletMsg = walletLines.join("\n")

    await client.query(
      `UPDATE order_threads SET status='validee', xmr_wallet=$1, updated_at=NOW() WHERE id=$2`,
      [wallet, thread.id]
    )
    await client.query(
      `INSERT INTO thread_messages (thread_id, sender, body, created_at)
       VALUES ($1,'vendeur',$2,NOW() + interval '2 seconds')`,
      [thread.id, walletMsg]
    )
    console.log("[3] Commande validée — Wallet XMR envoyé | Montant:", xmrAmount, "XMR")

    // ─── ÉTAPE 4 : Client signale le dépôt ────────────────────────────────────
    await client.query(
      `UPDATE order_threads SET deposit_notified=true, updated_at=NOW() WHERE id=$1`,
      [thread.id]
    )
    await client.query(
      `INSERT INTO thread_messages (thread_id, sender, body, created_at)
       VALUES ($1,'client',$2,NOW() + interval '3 seconds')`,
      [thread.id, "J'ai effectue mon depot XMR. Merci de verifier la reception."]
    )
    console.log("[4] Dépôt XMR signalé par le client")

    // ─── ÉTAPE 5 : Admin confirme le dépôt (status: preparation) ─────────────
    await client.query(
      `UPDATE order_threads SET deposit_confirmed=true, status='preparation', updated_at=NOW() WHERE id=$1`,
      [thread.id]
    )
    await client.query(
      `INSERT INTO thread_messages (thread_id, sender, body, created_at)
       VALUES ($1,'vendeur',$2,NOW() + interval '4 seconds')`,
      [thread.id, "Depot Monero recu et confirme. La preparation de ton colis est en cours — tu recevras une mise a jour des la mise en expedition."]
    )
    console.log("[5] Dépôt confirmé — Status: preparation")

    console.log("\n=== SIMULATION TERMINÉE ===")
    console.log("Thread principal ID :", thread.id)
    console.log("Thread TRK_MSG ID   :", trkThread.id)
    console.log("Token client        :", customerToken)
    console.log("Token TRK           :", trackingToken)
    console.log("\nVisible dans :")
    console.log("  - Panel admin > Locker MR (ID", thread.id + ")")
    console.log("  - Panel admin > Locker MR > Le fil TRK_MSG (ID", trkThread.id + ") — ne PAS cliquer dessus, il sera supprimé")
    console.log("  - Côté client avec le token :", customerToken)

  } finally {
    client.release()
    await pool.end()
  }
}

simulate().catch(e => { console.error("ERREUR:", e.message); process.exit(1) })
