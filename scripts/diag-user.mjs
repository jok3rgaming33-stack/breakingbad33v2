import pg from "pg"
import fs from "fs"

function loadEnv(path) {
  const raw = fs.readFileSync(path, "utf8")
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
}

loadEnv(".env.bb33.diag")
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
const pseudo = process.argv[2] || "WildLynx"
const c = await pool.connect()
try {
  const users = await c.query(
    `SELECT id, pseudo, flags, nickname, loyalty_adjustment, loyalty_spent, must_set_password,
            temp_password_blocked, created_at,
            left(token,12) as token_prefix, length(token) as token_len
     FROM users
     WHERE pseudo ILIKE $1 OR nickname ILIKE $2
     ORDER BY id DESC LIMIT 20`,
    [pseudo, `%${pseudo}%`],
  )
  console.log("=== USERS ===")
  console.log(JSON.stringify(users.rows, null, 2))

  for (const u of users.rows) {
    const full = await c.query(`SELECT token FROM users WHERE id = $1`, [u.id])
    const token = full.rows[0]?.token
    if (!token) continue

    const logs = await c.query(
      `SELECT id, left(user_token,10) as tok, ip, left(coalesce(user_agent,''),80) as ua, created_at
       FROM login_logs WHERE user_token = $1 ORDER BY created_at DESC LIMIT 20`,
      [token],
    )
    console.log(`=== LOGIN LOGS ${u.pseudo} #${u.id} ===`)
    console.log(JSON.stringify(logs.rows, null, 2))

    const threads = await c.query(
      `SELECT id, status, summary, customer_name, left(customer_token,10) as tok_prefix,
              length(customer_token) as tok_len, created_at, updated_at
       FROM order_threads
       WHERE customer_token = $1 OR customer_name ILIKE $2
       ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 15`,
      [token, `%${u.pseudo}%`],
    )
    console.log("=== THREADS ===")
    console.log(JSON.stringify(threads.rows, null, 2))

    const kyc = await c.query(
      `SELECT id, status, pseudo, created_at, validated_at
       FROM user_verifications WHERE user_token = $1 ORDER BY id DESC LIMIT 5`,
      [token],
    )
    console.log("=== KYC ===")
    console.log(JSON.stringify(kyc.rows, null, 2))

    // check if any other user has similar token prefix (unlikely)
  }

  try {
    const rec = await c.query(
      `SELECT id, claimed_pseudo, left(provisional_token,12) as prov, original_user_id, status,
              left(coalesce(client_message,''),120) as msg, created_at, resolved_at
       FROM account_recovery_claims
       WHERE claimed_pseudo ILIKE $1
       ORDER BY id DESC LIMIT 10`,
      [pseudo],
    )
    console.log("=== RECOVERY CLAIMS ===")
    console.log(JSON.stringify(rec.rows, null, 2))
  } catch (e) {
    console.log("recovery:", e.message)
  }

  const sim = await c.query(
    `SELECT id, pseudo, flags, left(token,10) as tok, length(token) as len, created_at
     FROM users WHERE pseudo ILIKE $1 ORDER BY id DESC LIMIT 20`,
    ["%Lynx%"],
  )
  console.log("=== SIMILAR *Lynx* ===")
  console.log(JSON.stringify(sim.rows, null, 2))

  // threads that mention WildLynx in summary/name but other tokens
  const orphan = await c.query(
    `SELECT id, status, summary, customer_name, left(customer_token,12) as tok, created_at
     FROM order_threads
     WHERE customer_name ILIKE $1 OR summary ILIKE $1
     ORDER BY id DESC LIMIT 15`,
    [`%${pseudo}%`],
  )
  console.log("=== THREADS BY NAME/SUMMARY ===")
  console.log(JSON.stringify(orphan.rows, null, 2))
} finally {
  c.release()
  await pool.end()
}
