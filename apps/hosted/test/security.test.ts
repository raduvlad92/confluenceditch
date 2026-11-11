import test from "node:test"
import assert from "node:assert/strict"
import { generateKeyPair, exportSPKI, SignJWT } from "jose"
import { authenticate, body, checkOrigin, decrypt, encrypt, HttpError } from "../worker/security"

const origin="https://confluenceditch.example.test"
const issuer="https://clerk.confluenceditch.example.test"
const pair=await generateKeyPair("RS256")
const jwtKey=await exportSPKI(pair.publicKey)
const env={APP_ORIGIN:origin,CLERK_ISSUER:issuer,CLERK_JWT_KEY:jwtKey,CREDENTIAL_KEY:Buffer.alloc(32,7).toString("base64")}
async function token(overrides: {origin?:string;issuer?:string;expires?:number;sub?:string}={}) {
  return new SignJWT({azp:overrides.origin??origin,sid:"sess_security_test"}).setProtectedHeader({alg:"RS256",kid:"test"}).setIssuer(overrides.issuer??issuer).setSubject(overrides.sub??"user_test").setIssuedAt().setNotBefore(Math.floor(Date.now()/1000)-10).setExpirationTime(Math.floor(Date.now()/1000)+(overrides.expires??60)).sign(pair.privateKey)
}
const request=(value:string)=>new Request(origin+"/api/takeout/session",{headers:{authorization:`Bearer ${value}`}})
test("accepts a valid signed-in session from this application",async()=>{
  assert.equal(await authenticate(request(await token()),env),"user_test")
})
test("rejects expired, wrong-application and wrong-issuer sessions",async()=>{
  for(const value of [await token({expires:-120}),await token({origin:"https://another.example.test"}),await token({issuer:"https://another-clerk.example.test"}),"invalid"])
    await assert.rejects(authenticate(request(value),env),(error:unknown)=>error instanceof HttpError && error.status===401)
  await assert.rejects(authenticate(new Request(origin),env),{status:401})
})
test("encrypted credentials cannot be moved between account/connection bindings",async()=>{
  const value={token:"fixture-test-token",siteUrl:"https://sample.atlassian.net"}
  const encrypted=await encrypt(value,env.CREDENTIAL_KEY,"user_a:connection_a")
  assert.ok(!encrypted.includes(value.token))
  assert.deepEqual(await decrypt(encrypted,env.CREDENTIAL_KEY,"user_a:connection_a"),value)
  await assert.rejects(decrypt(encrypted,env.CREDENTIAL_KEY,"user_b:connection_a"))
})
test("cross-origin requests and streamed oversized bodies fail closed",async()=>{
  assert.throws(()=>checkOrigin(new Request(origin,{headers:{origin:"https://unrelated.example"}}),origin),{status:403})
  assert.throws(()=>checkOrigin(new Request("https://preview.example.test"),origin),{status:403})
  const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode("x".repeat(20)));controller.close()}})
  await assert.rejects(body(new Request(origin,{method:"POST",body:stream,duplex:"half"} as RequestInit),10),{status:413})
})
