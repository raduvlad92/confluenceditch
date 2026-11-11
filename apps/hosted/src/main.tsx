import React from "react"
import { createRoot } from "react-dom/client"
import { ClerkProvider, SignIn, SignUp, UserButton, useAuth } from "@clerk/react"
import TakeoutApp from "../../web/src/components/takeout/TakeoutApp"
import { configureTransport } from "../../web/src/components/takeout/transport"
import "./style.css"

function App() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  configureTransport(true, getToken)
  if (!isLoaded) return <p className="opening">Opening your workspace…</p>
  if (!isSignedIn) return <main className="auth"><div><h1>ConfluenceDitch</h1><p>Your pages. Your files. Yours to keep.</p>{location.pathname.startsWith("/sign-up") ? <SignUp routing="hash" signInUrl="/" forceRedirectUrl="/" /> : <SignIn routing="hash" signUpUrl="/sign-up" forceRedirectUrl="/" />}<p className="authNote">Free MVP · Current published pages and attachments.<br/>History and source permissions are outside this release.</p><a href="/privacy">Privacy & retention</a></div></main>
  return <><div className="account"><span>Your private workspace</span><UserButton /></div><TakeoutApp /></>
}

const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
createRoot(document.getElementById("root")!).render(<React.StrictMode><ClerkProvider publishableKey={key} afterSignOutUrl="/"><App /></ClerkProvider></React.StrictMode>)
