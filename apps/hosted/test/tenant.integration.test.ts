import test from "node:test"
import assert from "node:assert/strict"
import { existsSync,readFileSync } from "node:fs"
import { api } from "../worker/api"
import { database } from "../worker/db"
import type { Env } from "../worker/types"

const path=new URL("../../../.env.hosted-check.json",import.meta.url)
test("isolated database: tenant boundaries, idempotency, quotas and disconnect revocation",{skip:!existsSync(path)},async()=>{
  const config=JSON.parse(readFileSync(path,"utf8"))
  const objects=new Map<string,string>()
  const workflows=new Set<string>()
  const env={...config,APP_ORIGIN:"https://confluenceditch.example.test",ARCHIVES:{get:async(key:string)=>objects.has(key)?{json:async()=>JSON.parse(objects.get(key)!),text:async()=>objects.get(key),body:new TextEncoder().encode(objects.get(key))}:null},CAPTURE:{create:async({id}:{id:string})=>{workflows.add(id)},get:async()=>({status:async()=>({status:"running"}),terminate:async()=>{}})}} as unknown as Env
  const a=`security-test-a-${crypto.randomUUID()}`,b=`security-test-b-${crypto.randomUUID()}`
  const sql=database(env)
  const call=async(user:string,path:string,method="GET",value?:unknown,key?:string)=>{
    const response=await api(new Request(env.APP_ORIGIN+"/api/takeout/"+path,{method,headers:{"content-type":"application/json",...(key?{"idempotency-key":key}:{})},body:value?JSON.stringify(value):undefined}),env,user)
    return response.json() as Promise<any>
  }
  await call(a,"connect","POST",{mode:"demo"}); await call(b,"connect","POST",{mode:"demo"})
  const session=await call(a,"session")
  assert.ok(!JSON.stringify(session).includes("synthetic-not-a-token"))
  const stored=await sql`SELECT credentials FROM cd_connections WHERE user_id=${a} AND revoked_at IS NULL`
  assert.ok(!stored[0].credentials.includes("synthetic-not-a-token"))
  const {spaces}=await call(a,"spaces")
  const {pages}=await call(a,`pages?spaceId=${spaces[0].id}`)
  const selection={spaceId:spaces[0].id,pageIds:[pages[0].id],includeAttachments:true}
  const command=crypto.randomUUID()
  const results=await Promise.all([call(a,"captures","POST",selection,command),call(a,"captures","POST",selection,command)])
  const id=results[0].capture.id
  assert.equal(results[1].capture.id,id)
  assert.equal(workflows.size,1)
  await assert.rejects(call(b,`captures/${id}`),{status:404})
  const rows=await sql`SELECT generation FROM cd_captures WHERE id=${id}`
  await call(a,`captures/${id}`,"DELETE")
  assert.equal((await sql`SELECT generation FROM cd_captures WHERE id=${id}`)[0].generation,rows[0].generation+1)
  objects.set(`captures/${id}/test/reader.json`,JSON.stringify({documents:[],files:[],findings:[],anchors:{},capabilities:{},sourceMode:"synthetic_fixture"}))
  await sql`UPDATE cd_captures SET status='ready',artifact_prefix=${`captures/${id}/test`} WHERE id=${id}`
  assert.equal((await call(a,`captures/${id}`)).capture.status,"ready")
  await assert.rejects(call(b,`captures/${id}/download`),{status:404})
  for(let i=1;i<5;i++) { const next=await call(a,"captures","POST",selection,crypto.randomUUID()); await call(a,`captures/${next.capture.id}`,"DELETE") }
  await assert.rejects(call(a,"captures","POST",selection,crypto.randomUUID()),{status:429})
  await call(a,"session","DELETE")
  await assert.rejects(call(a,`captures/${id}/download`),{status:401})
  assert.equal((await sql`SELECT credentials FROM cd_connections WHERE user_id=${a}`)[0].credentials,"")
})
