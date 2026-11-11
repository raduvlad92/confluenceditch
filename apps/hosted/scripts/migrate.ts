import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { neon } from "@neondatabase/serverless"

const file = process.argv[2]
if (!file) throw new Error("Pass an ignored JSON environment file")
const config=JSON.parse(readFileSync(resolve(file),"utf8"))
const url=new URL(config.DATABASE_URL)
url.hostname = url.hostname.replace("-pooler", "")
const sql=neon(url.toString())
const statements=readFileSync(new URL("../migrations/001_hosted.sql",import.meta.url),"utf8").split(";").map(value=>value.trim()).filter(Boolean)
await sql.transaction(statements.map(statement=>sql.query(statement)))
console.log("Hosted schema applied successfully.")
